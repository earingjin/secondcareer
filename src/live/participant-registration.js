import {esc} from './fields.js';
import {assessmentNotice} from './assessment-notice.js';
import {parseRegistrationText,registrationRows,readXlsx} from './registration-input.js';

const COLUMNS=[
  {key:'displayName',label:'이름',type:'text'},
  {key:'phone',label:'연락처',type:'tel'},
  {key:'counselorName',label:'담당 상담사',type:'text'},
  {key:'companyName',label:'소속기업',type:'text'}
];
const blankRow=()=>Object.fromEntries(COLUMNS.map(({key})=>[key,'']));
const hasValue=row=>COLUMNS.some(({key})=>String(row[key]??'').trim());
const isHeader=row=>/^(닉네임|이름|이름 또는 닉네임|참여자 이름)$/.test(row?.[0]||'');

export function participantRegistrationView({context,inputRows=[blankRow()],rowErrors={},rows=[],results=[],message='',working=false,reveal=false}){
  const admin=context.profile.role==='admin';
  return `<section class="card sec" aria-label="참여자 일괄 등록"><h2>참여자 일괄 등록</h2>
  <p class="sub">열 순서: 이름 또는 닉네임 · 연락처 · 담당 상담사 · 소속기업. 이름은 12자 이내입니다. 연락처 끝 8자리가 로그인 아이디가 됩니다.</p>
  <p class="hintline">${admin?'상담사 이름 또는 ID를 입력하거나 기본 상담사를 선택하세요.':'담당 상담사 열의 값과 관계없이 본인에게 자동 배정됩니다.'} 소속기업을 비우면 ${esc(context.organizationName)}으로 등록합니다.</p>
  ${admin?`<div class="field"><label for="registration-counselor">기본 담당 상담사</label><select class="in" id="registration-counselor"><option value="">선택</option>${context.counselors.map(c=>`<option value="${esc(c.id)}" ${context.defaultCounselorId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>`:''}
  <div class="acts"><label class="btn ghost">CSV 파일 불러오기<input data-file="csv" type="file" accept=".csv,.txt" hidden></label><label class="btn ghost">XLSX 파일 직접 업로드<input data-file="xlsx" type="file" accept=".xlsx" hidden></label></div>
  <p class="hintline">XLSX는 첫 워크시트의 값만 읽습니다. 수식은 값으로 변환하세요. CSV는 UTF-8입니다. 엑셀에서 복사한 셀은 아래에 붙여넣으세요.</p>
  <div class="field"><div class="registration-grid-label">참여자 데이터</div><div class="scroll registration-grid" role="region" aria-label="참여자 입력 표" tabindex="0"><table class="t"><thead><tr><th scope="col">행</th>${COLUMNS.map(c=>`<th scope="col">${c.label}</th>`).join('')}<th scope="col">삭제</th></tr></thead><tbody>${inputRows.map((row,index)=>`<tr><th scope="row">${index+1}</th>${COLUMNS.map(c=>`<td><input class="in" data-row="${index}" data-key="${c.key}" aria-label="${index+1}행 ${c.label}" ${rowErrors[index]?.[c.key]?`aria-invalid="true" title="${esc(rowErrors[index][c.key])}"`:''} type="${c.type}" value="${esc(row[c.key]??'')}"></td>`).join('')}<td><button class="btn ghost sm" data-action="remove-row" data-row="${index}" aria-label="${index+1}행 삭제">삭제</button></td></tr>`).join('')}</tbody></table></div><div class="acts"><button class="btn ghost sm" data-action="add-row">행 추가</button></div></div>
  <div class="acts"><button class="btn ghost" data-action="preview">입력 확인</button><button class="btn" data-action="register">실제 계정 일괄 등록</button></div>
  <p role="status" class="hintline">${esc(message)}</p>
  ${rows.length?`<div class="scroll" data-preview><table class="t"><thead><tr><th>행</th><th>이름</th><th>아이디</th><th>소속기업</th><th>입력 확인</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.line}</td><td>${esc(r.displayName)}</td><td>${esc(r.loginId)}</td><td>${esc(r.companyName)}</td><td>${esc(r.error||'등록 가능')}</td></tr>`).join('')}</tbody></table></div>`:''}
  ${results.length?`<div class="notice-s"><p>성공한 계정의 임시 비밀번호는 이번 화면에서만 확인할 수 있습니다. 본인 확인 후 별도 안전한 경로로 전달하세요. 로그아웃, 페이지 이탈 또는 새로고침 시 지워지며 다시 조회할 수 없습니다.</p><div class="acts"><button class="btn ghost sm" data-action="reveal">${reveal?'비밀번호 가리기':'발급 비밀번호 확인'}</button><button class="btn ghost sm" data-action="clear">발급 비밀번호 지우기</button></div><table class="t"><thead><tr><th>이름</th><th>아이디</th><th>등록 결과</th><th>임시 비밀번호</th><th>안내문</th></tr></thead><tbody>${results.map((r,index)=>`<tr><td>${esc(r.displayName)}</td><td>${esc(r.loginId)}</td><td>${esc(r.message)}</td><td>${r.temporaryPassword?`<input class="in" aria-label="${esc(r.displayName)} 임시 비밀번호" type="${reveal?'text':'password'}" readonly autocomplete="off" value="${esc(r.temporaryPassword)}">`:'-'}</td><td>${r.temporaryPassword?`<button class="btn ghost sm" data-action="copy-notice" data-result="${index}" ${!context.assessmentUrl?'disabled':''}>사전진단 안내문 복사</button>${!context.assessmentUrl?'<span>진단 접속 주소 설정이 필요합니다</span>':''}`:'-'}</td></tr>`).join('')}</tbody></table></div>`:''}
  ${working?'<p role="status">등록 중입니다. 완료될 때까지 기다려 주세요.</p>':''}</section>`;
}

export function mountParticipantRegistration(container,{context,register,onBusy=()=>{},resultState={results:[]}}){
  let inputRows=[blankRow()],rowErrors={},rows=[],message='',working=false,reveal=false,disposed=false;
  const results=resultState.results;
  const requests=new Map();
  function render(){
    if(disposed)return;
    container.innerHTML=participantRegistrationView({context,inputRows,rowErrors,rows,results,message,working,reveal});
    if(working)container.querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=true);
  }
  function clearSecrets(){results.forEach(r=>delete r.temporaryPassword);reveal=false;render()}
  function checkedRows(){
    const active=inputRows.map((row,index)=>({row,index})).filter(({row})=>hasValue(row));
    const checked=registrationRows(active.map(({row})=>COLUMNS.map(({key})=>row[key])),context);
    rowErrors=Object.fromEntries(checked.map((row,index)=>[active[index].index,row.fieldErrors]));
    return checked.map((row,index)=>({...row,line:active[index].index+1}));
  }
  function preview(){
    if(!results.some(r=>r.temporaryPassword))results.length=0;
    rows=checkedRows();
    message=rows.some(r=>r.error)?'입력 오류를 수정한 뒤 등록해 주세요.':'입력 확인 완료. 실제 계정 일괄 등록을 누르면 서버에 등록됩니다.';
  }
  function onInput(event){
    const {row,key}=event.target.dataset;
    if(row===undefined||!COLUMNS.some(c=>c.key===key))return;
    inputRows[Number(row)][key]=event.target.value;
    rows=[];rowErrors={};message='';
    container.querySelectorAll('.registration-grid [aria-invalid]').forEach(input=>{input.removeAttribute('aria-invalid');input.removeAttribute('title')});
    container.querySelector('[data-preview]')?.remove();
    container.querySelector('.hintline[role="status"]').textContent='';
  }
  function importRows(values){
    if(isHeader(values[0]))values=values.slice(1);
    if(values.some(row=>row.length>COLUMNS.length))throw Error('이름·연락처·상담사·소속기업의 4개 열을 사용해 주세요');
    const imported=values.filter(row=>row.some(value=>String(value??'').trim()));
    if(imported.length>100)throw Error('한 번에 100명 이하로 나누어 등록해 주세요.');
    inputRows=imported.length?imported.map(values=>Object.fromEntries(COLUMNS.map((c,index)=>[c.key,String(values[index]??'')]))):[blankRow()];
    rows=[];rowErrors={};
  }
  async function onChange(event){
    if(event.target.id==='registration-counselor'){context.defaultCounselorId=event.target.value;rows=[];rowErrors={};message='';render();return}
    if(!event.target.dataset.file||working)return;
    const kind=event.target.dataset.file,file=event.target.files[0];if(!file)return;
    try{
      if(kind==='xlsx'){
        if(!/\.xlsx$/i.test(file.name))throw Error('XLSX 파일을 선택해 주세요.');
        const values=await readXlsx(file);
        if(disposed)return;
        importRows(values);
      }else{
        if(!/\.(csv|txt)$/i.test(file.name)||file.size>2*1024*1024)throw Error('2MB 이하 CSV 또는 TXT 파일을 선택해 주세요.');
        const value=await file.text();if(disposed)return;importRows(parseRegistrationText(value));
      }
      preview();
    }catch(error){message=error.message;rows=[];rowErrors={}}
    render();
  }
  async function onClick(event){
    const action=event.target.closest('[data-action]')?.dataset.action;if(!action||working)return;
    try{
      if(action==='clear'){clearSecrets();return}
      if(action==='copy-notice'){
        const result=results[Number(event.target.closest('[data-result]').dataset.result)];
        if(!context.assessmentUrl||!result?.temporaryPassword)return;
        await navigator.clipboard.writeText(assessmentNotice(result,context.assessmentUrl));
        message='사전진단 안내문을 복사했습니다.';render();return;
      }
      if(action==='reveal'){reveal=!reveal;render();return}
      if(action==='add-row'){if(inputRows.length>=100)throw Error('한 번에 100명 이하로 나누어 등록해 주세요.');inputRows.push(blankRow());rows=[];rowErrors={};render();container.querySelector(`[data-row="${inputRows.length-1}"][data-key]`)?.focus();return}
      if(action==='remove-row'){inputRows.splice(Number(event.target.closest('[data-row]').dataset.row),1);if(!inputRows.length)inputRows=[blankRow()];rows=[];rowErrors={};render();return}
      if(action==='preview'){preview();render();return}
      if(action!=='register')return;
      if(results.length)throw Error('결과를 확인한 뒤 새 입력 내용을 확인해 주세요. 실패·결과 미확인 행을 자동 재등록하지 않습니다.');
      rows=checkedRows();
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
        }catch(error){if(disposed)break;results.push({displayName:row.displayName,loginId:row.loginId,message:error.message})}
        render();
      }
      if(!disposed){inputRows=[blankRow()];rowErrors={};message='등록 처리가 끝났습니다. 결과를 확인하고 목록의 새로 조회를 눌러 주세요.'}
    }catch(error){message=error.message}
    finally{if(working){working=false;onBusy(false)}render()}
  }
  function onPaste(event){
    const {row,key}=event.target.dataset;
    if(row===undefined||!COLUMNS.some(c=>c.key===key)||working)return;
    const text=event.clipboardData?.getData('text/plain')||'';
    if(!/[\t\r\n]/.test(text))return;
    event.preventDefault();
    try{
      let values=parseRegistrationText(text);const startRow=Number(row),startColumn=COLUMNS.findIndex(c=>c.key===key);
      if(startRow===0&&startColumn===0&&isHeader(values[0]))values=values.slice(1);
      if(startRow+values.length>100)throw Error('한 번에 100명 이하로 나누어 등록해 주세요.');
      if(values.some(cells=>cells.length+startColumn>COLUMNS.length))throw Error('이름·연락처·상담사·소속기업의 4개 열을 사용해 주세요');
      while(inputRows.length<startRow+values.length)inputRows.push(blankRow());
      values.forEach((cells,r)=>cells.forEach((value,c)=>{inputRows[startRow+r][COLUMNS[startColumn+c].key]=value}));
      rows=[];rowErrors={};message='';render();
      container.querySelector(`[data-row="${startRow}"][data-key="${key}"]`)?.focus();
    }catch(error){message=error.message;render()}
  }
  render();container.addEventListener('input',onInput);container.addEventListener('change',onChange);container.addEventListener('click',onClick);container.addEventListener('paste',onPaste);
  return ()=>{disposed=true;container.innerHTML='';container.removeEventListener('input',onInput);container.removeEventListener('change',onChange);container.removeEventListener('click',onClick);container.removeEventListener('paste',onPaste)};
}
