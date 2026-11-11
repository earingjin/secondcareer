import {esc} from './fields.js';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
// Session memory only. No password in storage, URL, logs or list responses.
export function createAdminCounselors({api,canUse}){
  let host=null,generation=0,busy=false,data=null,message='',issued=null,pending=null;
  let form={name:'',loginId:''};
  function draw(){
    if(!host)return;
    const off=busy||pending?'disabled':'';
    host.innerHTML=`<h2>상담사 계정 관리</h2><button class="btn ghost" type="button" data-counselor-load ${busy?'disabled':''}>상담사 목록 조회</button><p role="status">${esc(message)}</p>
      ${data?`<div class="scroll"><table class="t"><thead><tr><th>상담사 이름</th><th>로그인 아이디</th></tr></thead><tbody>${data.counselors.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.loginId||'연결 확인 필요')}</td></tr>`).join('')||'<tr><td colspan="2">등록된 상담사가 없습니다.</td></tr>'}</tbody></table></div>`:''}
      ${data?.registrationAvailable?`<form data-counselor-form><div class="row3"><div class="field"><label for="counselor-name">상담사 이름</label><input class="in" id="counselor-name" name="name" maxlength="100" required value="${esc(form.name)}" ${off}></div><div class="field"><label for="counselor-login">로그인 아이디</label><input class="in" id="counselor-login" name="loginId" minlength="6" maxlength="32" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{5,31}" required value="${esc(form.loginId)}" ${off}><p class="hintline">영문·숫자·밑줄·하이픈 6~32자. 영문은 소문자로 저장합니다.</p></div></div><button class="btn" ${off}>상담사 계정 등록</button></form>`:data?'<p>상담사 계정 발급은 서버 설정과 DB 검증 후 사용할 수 있습니다.</p>':''}
      ${pending?`<p class="hintline">처리 결과 확인 전 다시 발급하지 마세요. 확인용 요청 ID: ${esc(pending)}</p>`:''}
      ${issued?`<section data-counselor-issued><h3>상담사 계정 발급 완료</h3><p>${esc(issued.name)} · 로그인 아이디: ${esc(issued.loginId)}</p><p>임시 비밀번호: <code>${esc(issued.temporaryPassword)}</code></p><p>안전한 경로로 전달하세요. 최초 로그인 시 비밀번호를 변경해야 합니다. 이 비밀번호는 다시 조회할 수 없습니다.</p><p>고객사 상세 관리에서 상담사 배정을 다시 조회하면 신규 상담사를 선택할 수 있습니다.</p><button class="btn ghost" type="button" data-counselor-hide>비밀번호 숨기기</button></section>`:''}`;
  }
  const current=run=>run===generation&&canUse();
  async function load(){
    if(busy||!canUse())return;const run=generation;busy=true;message='';data=null;draw();
    try{
      const d=await api.adminCounselors();
      if(!d||typeof d.registrationAvailable!=='boolean'||!Array.isArray(d.counselors)||!d.counselors.every(c=>uuid(c.id)&&typeof c.name==='string'&&(c.loginId===null||typeof c.loginId==='string'))||new Set(d.counselors.map(c=>c.id)).size!==d.counselors.length)throw Error('상담사 목록 응답을 확인하지 못했습니다.');
      if(current(run))data=d;
    }catch(e){if(current(run))message=e.message}finally{if(current(run)){busy=false;draw()}}
  }
  async function submit(e){
    e.preventDefault();if(busy||pending||!data?.registrationAvailable||!canUse())return;
    const name=form.name.trim(),loginId=form.loginId.trim().toLowerCase();
    if(!name||name.length>100||/[\u0000-\u001f\u007f]/.test(name)||!/^[a-z0-9][a-z0-9_-]{5,31}$/.test(loginId)){message='상담사 이름과 로그인 아이디를 확인해 주세요.';draw();return}
    const run=generation,requestId=crypto.randomUUID();pending=requestId;busy=true;issued=null;message='발급 중입니다.';draw();
    try{
      const d=await api.issueCounselor({name,loginId,requestId});
      if(!d||!uuid(d.counselorId)||d.loginId!==loginId||d.name!==name||typeof d.temporaryPassword!=='string'||d.temporaryPassword.length<12||d.temporaryPassword.length>128)throw Error('발급 응답을 확인하지 못했습니다.');
      if(!current(run))return;
      issued=d;pending=null;form={name:'',loginId:''};message='등록했습니다. 상담사 목록과 고객사 배정 후보는 다시 조회해 주세요.';
    }catch(e){
      if(!current(run))return;
      // Only explicit pre-Auth rejections permit another request. Network,
      // malformed responses and all unknown outcomes retain the reservation ID.
      if(['INVALID_REQUEST','LOGIN_ID_UNAVAILABLE','FORBIDDEN','COUNSELOR_NOT_CONFIGURED'].includes(e.code))pending=null;
      message=pending?'발급 결과가 불명확하거나 이미 요청되었습니다. 다시 발급하지 말고 요청 ID로 서버 기록을 확인하세요.':e.message;
    }finally{if(current(run)){busy=false;draw()}}
  }
  function input(e){if(!busy&&!pending&&['name','loginId'].includes(e.target.name))form[e.target.name]=e.target.value}
  function click(e){if(e.target.closest('[data-counselor-load]'))load();if(e.target.closest('[data-counselor-hide]')){issued=null;draw()}}
  function unmount(){generation++;issued=null;if(host){host.removeEventListener('submit',submit);host.removeEventListener('input',input);host.removeEventListener('click',click);host.innerHTML=''}host=null;busy=false}
  return {
    mount(el){if(!el||!canUse())return;host=el;host.addEventListener('submit',submit);host.addEventListener('input',input);host.addEventListener('click',click);draw()},
    unmount,
    reset(){unmount();data=null;issued=null;pending=null;message='';form={name:'',loginId:''}}
  };
}
