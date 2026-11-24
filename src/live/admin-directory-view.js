import {esc} from './fields.js';

// REQ-A-001/002 read-only management lists. The server returns the scoped lists and
// counts; this module only checks their consistency, filters and renders them.
const STATES=['notStarted','draft','submitted'],ASSIGNMENTS=['assigned','unassigned','unknown'];
const STATE_LABEL={notStarted:'미시작',draft:'작성 중',submitted:'제출 완료'};
const count=v=>Number.isInteger(v)&&v>=0;
const text=v=>typeof v==='string';
const label=v=>text(v)&&!!v.trim();

// Rejects a response whose lists and counts disagree, so a partial read is never shown.
export function validDirectory(d){
  if(!d||typeof d!=='object'||d.scope!=='organization'||!text(d.organizationName)||!text(d.generatedAt)||!Number.isFinite(Date.parse(d.generatedAt)))return false;
  const t=d.totals;
  if(!t||![t.participants,t.counselors,t.unassigned,t.unknownCounselor].every(count)||![d.counselors,d.companies,d.participants].every(Array.isArray))return false;
  if(!d.counselors.every(c=>c&&label(c.id)&&label(c.name)&&(c.loginId===null||label(c.loginId))&&count(c.assigned)))return false;
  if(!d.companies.every(c=>c&&(c.name===null||label(c.name))&&count(c.total)&&c.total>0&&count(c.counselors)&&c.counselors<=c.total))return false;
  const ids=new Set(d.counselors.map(c=>c.id));
  if(ids.size!==d.counselors.length||new Set(d.companies.map(c=>c.name)).size!==d.companies.length)return false;
  if(new Set(d.participants.map(p=>p?.id)).size!==d.participants.length)return false;
  if(!d.participants.every(p=>p&&label(p.id)&&text(p.name)&&(p.loginId===null||label(p.loginId))&&(p.companyName===null||label(p.companyName))&&ASSIGNMENTS.includes(p.assignment)&&STATES.includes(p.preStatus)&&
    (p.assignment==='assigned'?ids.has(p.counselorId):p.counselorId===null)))return false;
  if(d.assignmentCompanies!==undefined){
    if(!Array.isArray(d.assignmentCompanies)||!d.assignmentCompanies.every(c=>c&&label(c.id)&&label(c.name)))return false;
    if(!d.participants.every(p=>(p.companyId===null||label(p.companyId))&&
      (p.officialCompanyName===null||label(p.officialCompanyName))&&
      (p.submittedAt===null||(text(p.submittedAt)&&Number.isFinite(Date.parse(p.submittedAt))))&&
      p.reportAvailable===(p.preStatus==='submitted')))return false;
  }
  const n=d.participants.length,per=a=>d.participants.filter(p=>p.assignment===a).length;
  if(t.participants!==n||t.counselors!==d.counselors.length||t.unassigned!==per('unassigned')||t.unknownCounselor!==per('unknown'))return false;
  if(d.companies.reduce((s,c)=>s+c.total,0)!==n||!d.companies.every(c=>c.total===d.participants.filter(p=>p.companyName===c.name).length))return false;
  return d.counselors.every(c=>c.assigned===d.participants.filter(p=>p.counselorId===c.id).length)&&d.counselors.reduce((s,c)=>s+c.assigned,0)+t.unassigned+t.unknownCounselor===n;
}

// Filters refer to list positions or fixed keys, never to free text in markup.
export function filterParticipants(d,{company='all',counselor='all',status='all',classification='all'}={}){
  const name=company==='all'?undefined:d.companies[Number(company)]?.name;
  return d.participants.filter(p=>(company==='all'||(name!==undefined&&p.companyName===name))&&
    (counselor==='all'||(counselor==='unassigned'||counselor==='unknown'?p.assignment===counselor:p.counselorId===counselor))&&
    (status==='all'||p.preStatus===status)&&(classification==='all'||p.companyId===null));
}

const option=(value,labelText,selected)=>`<option value="${esc(value)}" ${selected===value?'selected':''}>${esc(labelText)}</option>`;
export const companyLabel=name=>name===null?'소속기업 미지정':name;
export const officialCompanyLabel=p=>p.officialCompanyName??(p.companyId===null?'미분류':p.companyId?'고객사 확인 필요':'조회 정보 없음');
export const submittedDate=value=>value
  ?`<time datetime="${esc(value)}">${esc(new Date(value).toLocaleString('ko-KR'))}</time>`
  :'<span class="hintline">—</span>';

export const ADMIN_REPORT_LABELS={
  i:'고객등록신청서',
  p:'고객용 세컨플래닝 프로파일',
  c:'상담사용 세컨플래닝 프로파일'
};
// REQ-A-005: only a final pre submission has a report. The server re-checks scope and state.
const reportCell=p=>p.preStatus==='submitted'
  ?`<div class="admin-report-actions">${Object.entries(ADMIN_REPORT_LABELS).map(([kind,name])=>
    `<button class="btn ghost sm" data-admin-report="${esc(p.id)}" data-kind="${kind}">${name}</button>`).join('')}</div>`
  :`<span class="hintline">${p.preStatus==='draft'?'임시저장 상태':'미시작'} · 최종 제출 후 조회 가능</span>`;
const assignmentLabel=(p,byId)=>p.assignment==='assigned'?byId.get(p.counselorId)?.name||'-':p.assignment==='unassigned'?'미배정':'담당 확인 필요';

function assignmentChoices(items){
  const names=new Map();
  for(const item of items)names.set(item.name,(names.get(item.name)||0)+1);
  return items.map(item=>{
    if(names.get(item.name)===1)return {id:item.id,label:item.name};
    const shortId=item.id.slice(-8);
    const suffix=item.loginId||(items.some(other=>other!==item&&other.name===item.name&&other.id.endsWith(shortId))?item.id:shortId);
    return {id:item.id,label:`${item.name} (${suffix})`};
  });
}

function assignmentForm(p,kind,options,disabled){
  const current=kind==='company'?p.companyId:p.counselorId;
  const empty=kind==='company'?'미분류':'미배정';
  const title=kind==='company'?'고객사':'상담사';
  const choices=options.map(item=>option(item.id,item.label,current)).join('');
  const currentOption=current&&!options.some(item=>item.id===current)
    ?option(current,p.officialCompanyName?`${p.officialCompanyName} (현재 지정)`:'현재 지정 정보 확인 필요',current):'';
  return `<form data-participant-assignment="${esc(kind)}" data-participant-id="${esc(p.id)}"><select class="in" name="target" aria-label="${esc(p.name)} ${title}" ${disabled?'disabled':''}>${option('',empty,current??'')}${currentOption}${choices}</select><button class="btn sm" ${disabled?'disabled':''}>${title} 저장</button></form>`;
}

const companyDirectory=d=>({...d,scope:'organization',organizationName:d.companyName,companies:d.totals.participants?[{name:d.companyName,total:d.totals.participants,counselors:d.totals.counselors}]:[]});
export function validCompanyDirectory(d,id){
  return !!d&&d.scope==='company'&&d.companyId===id&&label(d.companyName)&&!!d.totals&&Array.isArray(d.participants)&&Array.isArray(d.counselors)&&d.participants.every(p=>p?.companyName===d.companyName)&&d.counselors.every(c=>c?.assigned>0)&&validDirectory(companyDirectory(d));
}
export function adminCompanyDirectoryView(state){return adminDirectoryView({...state,data:state.data?companyDirectory(state.data):null,companyScoped:true}).replace('data-admin-directory="refresh"','data-company-directory-refresh').replace('id="admin-directory-status"','id="company-directory-status"')}

export function adminDirectoryView({data,loading=false,message='',assignmentMessage='',assignmentBusy=false,filter={company:'all',counselor:'all',status:'all'},companyScoped=false}){
  const head=`<div class="admin-section-head">${companyScoped?'':'<h2>내담자 관리</h2>'}<button class="btn ghost" data-admin-directory="refresh" ${loading?'disabled aria-busy="true"':''}>관리 목록 다시 불러오기</button></div>`;
  const status=`<p role="status" class="hintline" id="admin-directory-status">${esc(loading?'운영 관리 목록을 조회하고 있습니다.':message)}</p>`;
  if(!data)return head+status;
  const t=data.totals,byId=new Map(data.counselors.map(c=>[c.id,c])),rows=filterParticipants(data,filter);
  const canAssign=!companyScoped&&Array.isArray(data.assignmentCompanies);
  const companyChoices=canAssign?assignmentChoices(data.assignmentCompanies):[];
  const counselorChoices=canAssign?assignmentChoices(data.counselors):[];
  const assignmentCells=p=>`<td class="admin-submitted-date">${submittedDate(p.submittedAt)}</td>${canAssign?`<td class="admin-assignment-actions">
    ${assignmentForm(p,'company',companyChoices,assignmentBusy||loading)}
    ${p.assignment==='unknown'?'<p class="hintline">담당 계정을 먼저 확인해 주세요.</p>':assignmentForm(p,'counselor',counselorChoices,assignmentBusy||loading)}
  </td>`:''}`;
  const columns=['내담자 이름',...(companyScoped?[]:['입력 소속기업']),'공식 고객사','담당 상담사','사전진단 상태',
    ...(companyScoped?[]:['최종 제출일']),...(canAssign?['분류 및 배정']:[]),'개인 결과물'];
  const tiles=`<div class="tiles" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
   <div class="tile" data-dir-kpi="participants"><span>등록 참여자</span><b>${t.participants}</b></div>
   <div class="tile c2" data-dir-kpi="counselors"><span>상담사</span><b>${t.counselors}</b></div>
   <div class="tile c3" data-dir-kpi="unassigned"><span>담당 상담사 미배정</span><b>${t.unassigned}</b></div>
   ${t.unknownCounselor?`<div class="tile c3" data-dir-kpi="unknown"><span>담당 확인 필요</span><b>${t.unknownCounselor}</b></div>`:''}</div>`;
  const companies=`<h3>소속기업 현황</h3><div class="scroll"><table class="t zebra" data-dir-companies><thead><tr><th scope="col">소속기업</th><th scope="col">참여자</th><th scope="col">담당 상담사 수</th></tr></thead><tbody>${data.companies.map(c=>`<tr><td>${esc(companyLabel(c.name))}</td><td>${c.total}</td><td>${c.counselors}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">등록된 참여자가 없습니다.</td></tr>'}</tbody></table></div>`;
  const extra=[t.unassigned?`<tr data-counselor-row="unassigned"><td>담당 상담사 미배정</td><td>-</td><td>${t.unassigned}</td></tr>`:'',t.unknownCounselor?`<tr data-counselor-row="unknown"><td>담당 확인 필요</td><td>-</td><td>${t.unknownCounselor}</td></tr>`:''].join('');
  const counselors=`<h3>상담사 현황</h3><div class="scroll"><table class="t zebra" data-dir-counselors><thead><tr><th scope="col">상담사</th><th scope="col">로그인 아이디</th><th scope="col">담당 참여자</th></tr></thead><tbody>${data.counselors.map(c=>`<tr data-counselor-row="counselor"><td>${esc(c.name)}</td><td>${esc(c.loginId||'-')}</td><td>${c.assigned}</td></tr>`).join('')}${extra}${data.counselors.length||extra?'':'<tr><td colspan="3" class="empty">등록된 상담사가 없습니다.</td></tr>'}</tbody></table></div>
  ${t.unknownCounselor?'<p class="hintline" data-unknown-note>담당 확인 필요: 담당 상담사로 연결된 계정이 이 조직의 상담사 목록에 없습니다. 계정 상태를 운영자에게 확인해 주세요.</p>':''}`;
  const filters=`<div class="admin-directory-filters" data-dir-filters>
    ${companyScoped?'':`<label for="dir-company">입력 소속기업 <select class="in" id="dir-company" data-directory-filter="company">${option('all','전체',filter.company)}${data.companies.map((c,i)=>option(String(i),companyLabel(c.name),filter.company)).join('')}</select></label>`}
    <label for="dir-counselor">담당 상담사 <select class="in" id="dir-counselor" data-directory-filter="counselor">${option('all','전체',filter.counselor)}${data.counselors.map(c=>option(c.id,c.name+(c.loginId?' ('+c.loginId+')':''),filter.counselor)).join('')}${option('unassigned','미배정',filter.counselor)}${t.unknownCounselor?option('unknown','담당 확인 필요',filter.counselor):''}</select></label>
    <label for="dir-status">사전진단 <select class="in" id="dir-status" data-directory-filter="status">${option('all','전체',filter.status)}${STATES.map(s=>option(s,STATE_LABEL[s],filter.status)).join('')}</select></label>
    ${canAssign?`<label>고객사 분류 <select class="in" data-directory-filter="classification">${option('all','전체',filter.classification??'all')}${option('unclassified','미분류',filter.classification)}</select></label>`:''}
  </div>`;
  const list=`<section class="admin-directory-list"><h3>내담자 목록</h3>${filters}
    <p class="hintline" role="status" data-dir-count>조건에 맞는 내담자 ${rows.length}명 / 등록 내담자 ${t.participants}명</p>
    ${canAssign?`<p role="status" data-assignment-status>${esc(assignmentMessage)}</p>`:''}
    <p class="hintline admin-scroll-hint">표를 좌우로 스크롤해 모든 열을 볼 수 있습니다.</p>
    <div class="scroll admin-table-scroll" tabindex="0" role="region" aria-label="내담자 목록">
      <table class="t zebra admin-directory-table" data-dir-participants><thead><tr>${columns.map(name=>`<th scope="col">${name}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(p=>`<tr tabindex="-1" data-dir-participant="${esc(p.id)}">
        <td><strong>${esc(p.name||'-')}</strong></td>${companyScoped?'':`<td>${esc(companyLabel(p.companyName))}</td>`}
        <td>${esc(companyScoped?data.organizationName:officialCompanyLabel(p))}</td>
        <td>${esc(assignmentLabel(p,byId))}</td>
        <td><span class="badge-s s-${p.preStatus==='submitted'?'pre':p.preStatus==='draft'?'prog':'new'}">${STATE_LABEL[p.preStatus]}</span></td>
        ${companyScoped?'':assignmentCells(p)}<td>${reportCell(p)}</td>
      </tr>`).join('')||`<tr><td colspan="${columns.length}" class="empty">${t.participants?'조건에 맞는 내담자가 없습니다.':'등록된 내담자가 없습니다.'}</td></tr>`}</tbody></table>
    </div></section>`;
  const scope=companyScoped?'고객사':'운영 조직';
  return head+status+`<p class="hintline" data-dir-scope>${scope}: ${esc(data.organizationName||'-')} · 조회 시각 ${esc(new Date(data.generatedAt).toLocaleString('ko-KR'))}</p>`+
    list+`<section class="admin-directory-summary">${tiles}${companyScoped?'':companies}${counselors}</section>`;
}
