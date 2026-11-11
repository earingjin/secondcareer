import {esc} from './fields.js';
export function createAdminCompanyManagers({api,canUse}){
  let container=null,companyId=null,generation=0,busy=false,data=null,message='',issued=null,requestId=null;
  let form={name:'',email:'',phone:''},available=null;
  const draw=()=>{
    if(!container)return;const off=busy?'disabled':'';
    container.innerHTML=`<h3>고객사 담당자 계정 관리</h3><p class="hintline">담당자는 허용 고객사의 집계 조회 전용입니다. 허용 고객사의 진단 진행 집계만 볼 수 있으며 개인 진단·보고서·관리 작업은 허용하지 않습니다.</p><button class="btn ghost" type="button" data-manager-action="load" ${off}>담당자 목록 조회</button><p role="status">${esc(message)}</p>
    ${data?`<div class="scroll"><table class="t"><thead><tr><th>이름·아이디</th><th>이메일·연락처</th><th>계정 상태</th><th>이 고객사 접근</th><th>관리</th></tr></thead><tbody>${data.managers.map(m=>`<tr><td>${esc(m.name)} · ${esc(m.loginId)}</td><td>${esc(m.email)} · ${esc(m.phone)}</td><td>${m.status==='active'?'활성':'정지'}</td><td>${m.hasAccess?'허용':'해제'}</td><td><button class="btn ghost sm" data-manager-action="status" data-id="${esc(m.id)}" ${off}>${m.status==='active'?'계정 정지':'계정 재활성화'}</button><button class="btn ghost sm" data-manager-action="access" data-id="${esc(m.id)}" ${off}>${m.hasAccess?'접근 해제':'접근 부여'}</button></td></tr>`).join('')||'<tr><td colspan="5">이 고객사에 연결된 담당자가 없습니다.</td></tr>'}</tbody></table></div><p class="hintline">이 고객사에 접근 권한이 있는 담당자만 표시합니다. 계정 정지는 다른 고객사에도 적용되며 접근 해제는 현재 고객사에만 적용됩니다.</p>`:''}
    <section class="field"><h4>기존 담당자 연결</h4><p class="hintline">다른 고객사에서 이미 발급한 담당자 계정을 이 고객사에도 허용할 때만 조회해 연결합니다. 새 담당자는 아래에서 새 계정을 발급하세요.</p><button class="btn ghost" type="button" data-manager-action="available" ${off}>연결 가능한 기존 담당자 조회</button>${available?`<div class="acts" style="margin-top:8px">${available.map(m=>`<button class="btn ghost sm" type="button" data-manager-action="grant-existing" data-id="${esc(m.id)}" ${off}>${esc(m.name)} · ${esc(m.email)} 연결</button>`).join('')||'<p class="hintline">연결할 수 있는 기존 담당자가 없습니다.</p>'}</div>`:''}</section>
    <form data-manager-form><div class="row3">${[['name','담당자 이름','text'],['email','담당자 이메일','email'],['phone','담당자 연락처','tel']].map(([k,l,t])=>`<div class="field"><label for="manager-${k}">${l}</label><input class="in" id="manager-${k}" data-manager-field="${k}" type="${t}" maxlength="${k==='name'?100:k==='email'?254:30}" required value="${esc(form[k])}" ${off}></div>`).join('')}</div><button class="btn" ${off||issued?'disabled':''}>담당자 계정 발급</button></form>
    ${issued?`<div class="notice-s" data-manager-issued><p>최초 안내문: ${esc(issued.name)}님, 고객사 담당자 접속 링크 ${esc(new URL('?entry=company-manager',location.href).href)} · 아이디 ${esc(issued.loginId)}. 아래 임시 비밀번호로 로그인한 후 최초 변경해 주세요. 이번 화면을 떠나면 비밀번호를 다시 조회할 수 없습니다.</p><label for="manager-temporary">발급 임시 비밀번호</label><input class="in" id="manager-temporary" type="password" readonly value="${esc(issued.temporaryPassword)}" autocomplete="off"><button class="btn ghost" data-manager-action="reveal">임시 비밀번호 표시</button><button class="btn ghost" data-manager-action="clear">발급 정보 지우기</button></div>`:''}`;
  };
  const valid=d=>d&&d.companyId===companyId&&Array.isArray(d.managers)&&d.managers.every(m=>typeof m.id==='string'&&typeof m.name==='string'&&typeof m.loginId==='string'&&typeof m.email==='string'&&typeof m.phone==='string'&&['active','suspended'].includes(m.status)&&typeof m.hasAccess==='boolean');
  async function run(work){if(busy||!canUse())return;const g=generation,id=companyId;busy=true;message='처리 중입니다.';draw();try{await work(()=>g===generation&&id===companyId&&canUse())}catch(e){if(g===generation)message=e.message}finally{if(g===generation){busy=false;draw()}}}
  async function load(current){const d=await api.companyManagers(companyId);if(current()){if(!valid(d))throw Error('담당자 목록 응답을 확인하지 못했습니다.');data=d}}
  async function loadAvailable(current){const d=await api.availableCompanyManagers(companyId);if(current()){if(d?.companyId!==companyId||!Array.isArray(d.availableManagers)||!d.availableManagers.every(m=>typeof m.id==='string'&&typeof m.name==='string'&&typeof m.email==='string'))throw Error('기존 담당자 조회 응답을 확인하지 못했습니다.');available=d.availableManagers}}
  function input(e){const k=e.target.dataset.managerField;if(Object.hasOwn(form,k)){form[k]=e.target.value;requestId=null}}
  async function submit(e){if(!e.target.matches('[data-manager-form]'))return;e.preventDefault();e.stopPropagation();if(issued)return;
    await run(async current=>{requestId??=crypto.randomUUID();const d=await api.issueCompanyManager(companyId,{...form,requestId});if(!current())return;if(d?.companyId!==companyId||typeof d.loginId!=='string'||typeof d.temporaryPassword!=='string'||d.temporaryPassword.length<12)throw Error('발급 결과 미확인: 다시 발급하지 말고 관리자에게 확인해 주세요.');issued=d;form={name:'',email:'',phone:''};message='계정을 발급했습니다. 비밀번호를 안전하게 전달해 주세요.';try{await load(current)}catch{if(current())message='발급은 완료했지만 목록 조회에 실패했습니다. 비밀번호를 전달한 후 다시 조회해 주세요.'}});
  }
  async function click(e){const b=e.target.closest('[data-manager-action]');if(!b||b.disabled||busy)return;const action=b.dataset.managerAction;
    if(action==='clear'){issued=null;draw();return}if(action==='reveal'){const el=container.querySelector('#manager-temporary');if(el)el.type=el.type==='password'?'text':'password';return}
    await run(async current=>{
      if(action==='load'){data=null;await load(current);if(current())message='해당 고객사 담당자 목록을 조회했습니다.';return}
      if(action==='available'){available=null;await loadAvailable(current);if(current())message='연결 가능한 기존 담당자를 조회했습니다.';return}
      if(action==='grant-existing'){
        const selected=available?.find(m=>m.id===b.dataset.id);if(!selected)return;
        const result=await api.manageCompanyManager(companyId,{action:'grant',managerId:selected.id});
        if(!current())return;
        if(result?.companyId!==companyId||result.managerId!==selected.id||result.action!=='grant'||result.hasAccess!==true)throw Error('담당자 연결 결과를 확인하지 못했습니다.');
        available=null;data=null;message='기존 담당자에게 이 고객사 접근 권한을 부여했습니다.';
        await load(current);return;
      }
      const m=data?.managers.find(m=>m.id===b.dataset.id);if(!m)return;
      const body=action==='status'?{action:'status',managerId:m.id,status:m.status==='active'?'suspended':'active'}:{action:m.hasAccess?'revoke':'grant',managerId:m.id};
      data=null;const d=await api.manageCompanyManager(companyId,body);if(!current())return;
      if(d?.managerId!==m.id||d.companyId!==companyId||d.action!==body.action||(body.action==='status'?d.status!==body.status:d.hasAccess!==(body.action==='grant')))throw Error('변경 결과를 확인하지 못했습니다. 다시 조회해 주세요.');
      message='담당자 권한을 변경했습니다.';try{await load(current)}catch{if(current())message='변경은 완료했지만 목록 조회에 실패했습니다. 다시 조회해 주세요.'}
    });
  }
  function unmount(){issued=null;available=null;generation++;busy=false;if(container){container.innerHTML='';container.removeEventListener('click',click);container.removeEventListener('input',input);container.removeEventListener('submit',submit)}container=null}
  return {mount(el,id){if(id!==companyId){data=null;available=null;form={name:'',email:'',phone:''};requestId=null;message='';companyId=id}container=el;draw();el.addEventListener('click',click);el.addEventListener('input',input);el.addEventListener('submit',submit)},unmount,reset(){unmount();companyId=null;data=null;available=null;form={name:'',email:'',phone:''};message='';requestId=null}};
}
