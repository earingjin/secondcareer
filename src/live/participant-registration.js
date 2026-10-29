import {esc} from './fields.js';
import {parseRegistrationText,registrationRows,readXlsx} from './registration-input.js';

export function participantRegistrationView({context,text='',rows=[],results=[],message='',working=false,reveal=false}){
  const admin=context.profile.role==='admin';
  return `<section class="card sec" aria-label="참여자 일괄 등록"><h2>참여자 일괄 등록</h2>
  <p class="sub">열 순서: 이름 또는 닉네임 · 연락처 · 담당 상담사 · 소속기업. 이름은 12자 이내입니다. 연락처 끝 8자리가 로그인 아이디가 됩니다.</p>
  <p class="hintline">${admin?'상담사 이름 또는 ID를 입력하거나 기본 상담사를 선택하세요.':'담당 상담사 열의 값과 관계없이 본인에게 자동 배정됩니다.'} 소속기업을 비우면 ${esc(context.organizationName)}으로 등록합니다.</p>
  ${admin?`<div class="field"><label for="registration-counselor">기본 담당 상담사</label><select class="in" id="registration-counselor"><option value="">선택</option>${context.counselors.map(c=>`<option value="${esc(c.id)}" ${context.defaultCounselorId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>`:''}
  <div class="acts"><label class="btn ghost">CSV 파일 불러오기<input data-file="csv" type="file" accept=".csv,.txt" hidden></label><label class="btn ghost">XLSX 파일 직접 업로드<input data-file="xlsx" type="file" accept=".xlsx" hidden></label></div>
  <p class="hintline">XLSX는 첫 워크시트의 값만 읽습니다. 수식은 값으로 변환하세요. CSV는 UTF-8입니다. 엑셀에서 복사한 셀은 아래에 붙여넣으세요.</p>
  <div class="field"><label for="registration-bulk">참여자 데이터</label><textarea class="in" id="registration-bulk" rows="6" placeholder="이름&#9;연락처&#9;담당 상담사&#9;소속기업">${esc(text)}</textarea></div>
  <div class="acts"><button class="btn ghost" data-action="preview">입력 확인</button><button class="btn" data-action="register">실제 계정 일괄 등록</button></div>
  <p role="status" class="hintline">${esc(message)}</p>
  ${rows.length?`<div class="scroll"><table class="t"><thead><tr><th>행</th><th>이름</th><th>아이디</th><th>소속기업</th><th>입력 확인</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.line}</td><td>${esc(r.displayName)}</td><td>${esc(r.loginId)}</td><td>${esc(r.companyName)}</td><td>${esc(r.error||'등록 가능')}</td></tr>`).join('')}</tbody></table></div>`:''}
  ${results.length?`<div class="notice-s"><p>성공한 계정의 임시 비밀번호는 이번 화면에서만 확인할 수 있습니다. 본인 확인 후 별도 안전한 경로로 전달하세요. 화면 이동·탭 숨김·5분 후 지워지며 다시 조회할 수 없습니다.</p><div class="acts"><button class="btn ghost sm" data-action="reveal">${reveal?'비밀번호 가리기':'발급 비밀번호 확인'}</button><button class="btn ghost sm" data-action="clear">발급 비밀번호 지우기</button></div><table class="t"><thead><tr><th>이름</th><th>아이디</th><th>등록 결과</th><th>임시 비밀번호</th></tr></thead><tbody>${results.map(r=>`<tr><td>${esc(r.displayName)}</td><td>${esc(r.loginId)}</td><td>${esc(r.message)}</td><td>${r.temporaryPassword?`<input class="in" aria-label="${esc(r.displayName)} 임시 비밀번호" type="${reveal?'text':'password'}" readonly autocomplete="off" value="${esc(r.temporaryPassword)}">`:'-'}</td></tr>`).join('')}</tbody></table></div>`:''}
  ${working?'<p role="status">등록 중입니다. 완료될 때까지 기다려 주세요.</p>':''}</section>`;
}

export function mountParticipantRegistration(container,{context,register,onBusy=()=>{}}){
  let text='',rows=[],results=[],message='',working=false,reveal=false,disposed=false,secretTimer=null;
  const requests=new Map();
  function render(){
    if(disposed)return;
    container.innerHTML=participantRegistrationView({context,text,rows,results,message,working,reveal});
    if(working)container.querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=true);
  }
  function clearSecrets(){results=results.map(({temporaryPassword,...r})=>r);reveal=false;clearTimeout(secretTimer);secretTimer=null;render()}
  function preview(){
    clearSecrets();results=[];
    rows=registrationRows(parseRegistrationText(text),context);
    message=rows.some(r=>r.error)?'입력 오류를 수정한 뒤 등록해 주세요.':'입력 확인 완료. 실제 계정 일괄 등록을 누르면 서버에 등록됩니다.';
  }
  function onInput(event){if(event.target.id==='registration-bulk'){text=event.target.value;rows=[]}}
  async function onChange(event){
    if(event.target.id==='registration-counselor'){context.defaultCounselorId=event.target.value;rows=[];return}
    if(!event.target.dataset.file||working)return;
    const kind=event.target.dataset.file,file=event.target.files[0];if(!file)return;
    try{
      if(kind==='xlsx'){
        if(!/\.xlsx$/i.test(file.name))throw Error('XLSX 파일을 선택해 주세요.');
        const values=await readXlsx(file);
        if(disposed)return;
        text=values.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join('\t')).join('\n');
      }else{
        if(!/\.(csv|txt)$/i.test(file.name)||file.size>2*1024*1024)throw Error('2MB 이하 CSV 또는 TXT 파일을 선택해 주세요.');
        const value=await file.text();if(disposed)return;text=value;
      }
      preview();
    }catch(error){message=error.message;rows=[];text=''}
    render();
  }
  async function onClick(event){
    const action=event.target.closest('[data-action]')?.dataset.action;if(!action||working)return;
    try{
      if(action==='clear'){clearSecrets();return}
      if(action==='reveal'){reveal=!reveal;render();return}
      if(action==='preview'){preview();render();return}
      if(action!=='register')return;
      if(results.length)throw Error('결과를 확인한 뒤 새 입력 내용을 확인해 주세요. 실패·결과 미확인 행을 자동 재등록하지 않습니다.');
      rows=registrationRows(parseRegistrationText(text),context);
      if(rows.some(r=>r.error))throw Error('입력 오류를 수정한 뒤 등록해 주세요.');
      working=true;onBusy(true);message='서버에 순서대로 등록하고 있습니다.';render();
      for(const row of rows){
        if(disposed)break;
        if(!requests.has(row.loginId))requests.set(row.loginId,crypto.randomUUID());
        try{
          const data=await register({displayName:row.displayName,phone:row.phone,counselorUserId:row.counselorUserId,companyName:row.companyName,requestId:requests.get(row.loginId)});
          if(disposed)break;
          if(data.loginId!==row.loginId||typeof data.participantId!=='string'||typeof data.temporaryPassword!=='string'||data.temporaryPassword.length<12)throw Error('발급 결과 미확인: 관리자 확인이 필요합니다.');
          results.push({displayName:row.displayName,loginId:data.loginId,temporaryPassword:data.temporaryPassword,message:'등록 완료'});
          // Expire from the first disclosure; never prolong earlier secrets.
          if(!secretTimer)secretTimer=setTimeout(clearSecrets,5*60*1000);
          if(document.hidden)clearSecrets();
        }catch(error){if(disposed)break;results.push({displayName:row.displayName,loginId:row.loginId,message:error.message})}
        render();
      }
      if(!disposed){text='';message='등록 처리가 끝났습니다. 결과를 확인하고 목록의 새로 조회를 눌러 주세요.'}
    }catch(error){message=error.message}
    finally{if(working){working=false;onBusy(false)}render()}
  }
  const onVisibility=()=>{if(document.hidden)clearSecrets()};
  render();container.addEventListener('input',onInput);container.addEventListener('change',onChange);container.addEventListener('click',onClick);
  document.addEventListener('visibilitychange',onVisibility);window.addEventListener('pagehide',clearSecrets);
  return ()=>{disposed=true;clearTimeout(secretTimer);results=[];container.innerHTML='';container.removeEventListener('input',onInput);container.removeEventListener('change',onChange);container.removeEventListener('click',onClick);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('pagehide',clearSecrets)};
}
