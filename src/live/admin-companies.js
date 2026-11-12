import {createAdminCompanyManagers} from './admin-company-managers.js';
import {esc} from './fields.js';

const FIELDS=[['name','기업명','text',200],['start_date','시작일','date'],['end_date','종료일','date'],['pm_name','PM 이름','text',100],['pm_email','PM 이메일','email',254],['pm_phone','PM 연락처','tel',30]];
const blank=()=>Object.fromEntries(FIELDS.map(([key])=>[key,'']));
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const rowOK=c=>c&&uuid(c.id)&&['name','start_date','end_date','pm_name','created_at'].every(k=>typeof c[k]==='string')&&['active','inactive'].includes(c.status);
const detailOK=c=>rowOK(c)&&['pm_email','pm_phone','updated_at'].every(k=>typeof c[k]==='string'&&c[k]);
const initial=()=>({data:null,working:false,message:'',query:{search:'',status:'all',page:1,pageSize:20},search:'',status:'all',form:null,detail:null,linkage:null,assignments:null,selectedCounselor:''});
function assignmentView(s,off){
  if(!s.detail)return '';
  const d=s.assignments,assigned=new Set(d?.assignments.map(a=>a.counselorUserId)||[]),available=d?.counselors.filter(c=>!assigned.has(c.id))||[];
  return `<section data-company-assignments data-id="${esc(s.detail.id)}"><h3>고객사 상담사 배정</h3><p class="hintline">고객사 운영 배정은 참여자의 담당 상담사와 별도입니다. 배정·해제해도 기존 참여자 담당·진단·보고서는 변경되지 않습니다. 관리자의 고객사 ID 연결 신규 등록은 배정된 상담사로 제한됩니다.</p><button class="btn ghost" type="button" data-company-action="assignments-load" ${off}>상담사 배정 조회</button>
  ${d?`<table class="t"><thead><tr><th>배정된 상담사</th><th>배정일</th><th>관리</th></tr></thead><tbody>${d.assignments.map(a=>`<tr><td>${esc(d.counselors.find(c=>c.id===a.counselorUserId).name)}</td><td>${esc(a.createdAt.slice(0,10))}</td><td><button class="btn ghost sm" type="button" data-company-action="unassign" data-id="${esc(s.detail.id)}" data-counselor="${esc(a.counselorUserId)}" ${off}>배정 해제</button></td></tr>`).join('')||'<tr><td colspan="3">배정된 상담사가 없습니다.</td></tr>'}</tbody></table><div class="field"><label for="company-counselor">같은 조직 상담사 선택</label><select class="in" id="company-counselor" ${off}><option value="">선택</option>${available.map(c=>`<option value="${esc(c.id)}" ${s.selectedCounselor===c.id?'selected':''}>${esc(c.name)} · ${esc(c.id)}</option>`).join('')}</select><button class="btn" type="button" data-company-action="assign" data-id="${esc(s.detail.id)}" ${off||!s.selectedCounselor?'disabled':''}>상담사 배정</button></div>${!available.length?'<p class="hintline">추가 배정할 상담사가 없습니다.</p>':''}`:'<p class="hintline">배정 조회가 필요합니다. 조회하지 않은 상태에서는 배정을 변경할 수 없습니다.</p>'}</section>`;
}

// State lives only for this signed-in session. No participant writes or persistent storage.
export function createAdminCompanies({api,canUse}){
  let state=initial(),container=null,generation=0,initialLoadStarted=false;
  const managers=createAdminCompanyManagers({api,canUse});
  const statusLabel=s=>s==='active'?'활성':'비활성';
  function draw(){
    if(!container)return;
    managers.unmount();
    const s=state,off=s.working?'disabled':'';
    container.innerHTML=`<h2>고객사 관리</h2><p class="sub">고객사 마스터의 사업 기간과 PM 정보를 관리합니다. 참여자가 없는 고객사도 등록할 수 있습니다.</p>
      <div data-company-list-view ${s.form?'hidden':''}><p class="hintline" data-company-separation>이 목록은 별도 고객사 마스터입니다. 기존 운영 관리·진단 현황의 소속기업 목록은 참여자의 기업명 입력값 기준입니다. 고객사 ID 연결 등록과 기존 미연결 참여자는 별도로 관리되며 기존 기업명 필터는 유지됩니다.</p>
      <form data-company-search><div class="filters"><label for="company-search">고객사명 검색</label><input class="in" id="company-search" maxlength="200" value="${esc(s.search)}" ${off}><label for="company-status">운영 상태</label><select class="in" id="company-status" ${off}>${[['all','전체'],['active','활성'],['inactive','비활성']].map(([v,l])=>`<option value="${v}" ${v===s.status?'selected':''}>${l}</option>`).join('')}</select><button class="btn ghost" ${off}>고객사 목록 조회</button><button class="btn" type="button" data-company-action="new" ${off}>고객사 등록</button></div></form>
      ${s.data?`<div class="scroll"><table class="t" data-company-list><thead><tr><th>고객사명</th><th>진행 기간</th><th>담당 PM</th><th>운영 상태</th><th>등록일</th><th>상세 관리</th></tr></thead><tbody>${s.data.companies.map(c=>`<tr data-company-id="${esc(c.id)}"><td><button class="btn ghost sm" type="button" data-company-action="detail" data-id="${esc(c.id)}" ${off}>${esc(c.name)}</button></td><td>${esc(c.start_date)} ~ ${esc(c.end_date)}</td><td>${esc(c.pm_name)}</td><td>${statusLabel(c.status)}</td><td>${esc(c.created_at.slice(0,10))}</td><td><button class="btn ghost sm" type="button" data-company-action="detail" data-id="${esc(c.id)}" ${off}>상세 관리</button></td></tr>`).join('')||'<tr><td colspan="6">조건에 맞는 고객사가 없습니다.</td></tr>'}</tbody></table></div>
      <div class="pager" role="navigation" aria-label="고객사 목록 페이지"><button type="button" data-company-action="previous" ${s.query.page<=1||s.working?'disabled':''}>이전</button><span data-company-page>${s.query.page} / ${Math.max(1,Math.ceil(s.data.total/s.query.pageSize))}페이지 · 총 ${s.data.total}개 · 페이지당 ${s.query.pageSize}개</span><button type="button" data-company-action="next" ${s.query.page*s.query.pageSize>=s.data.total||s.working?'disabled':''}>다음</button></div>`:'<p class="hintline">목록 조회를 누르면 등록된 고객사를 불러옵니다.</p>'}</div>
      <p role="status" data-company-message>${esc(s.working?'처리 중입니다.':s.message)}</p>${s.form?`<form data-company-form data-id="${esc(s.detail?.id||'')}"><h3>${s.detail?'고객사 상세·수정':'새 고객사 등록'}</h3>${s.detail?`<p data-company-target>대상: ${esc(s.detail.name)} · ID ${esc(s.detail.id)} · ${statusLabel(s.detail.status)}</p>`:''}
      ${s.detail&&s.linkage?`<p data-company-linkage>고객사 ID로 연결된 참여자: ${s.linkage.linkedParticipants}명 · 조직 전체 미연결 참여자: ${s.linkage.unlinkedParticipants}명. 미연결 인원은 기업명 일치 여부와 무관한 조직 전체 수이며 자동 이관하지 않습니다.</p>`:''}
      <div class="row3">${FIELDS.map(([key,label,type,max])=>`<div class="field"><label for="company-${key}">${label} *</label><input class="in" id="company-${key}" data-company-field="${key}" type="${type}" ${max?`maxlength="${max}"`:''} required value="${esc(s.form[key])}" ${off}></div>`).join('')}</div>
      <p class="hintline">기업명은 앞뒤 공백을 제거하고 연속 공백을 한 칸으로 정리합니다. 같은 조직에서 공백·영문 대소문자 차이만 있는 이름은 중복 등록할 수 없습니다.</p>
      <div class="acts"><button class="btn" ${off}>${s.detail?'고객사 정보 저장':'고객사 저장'}</button>${s.detail?`<button class="btn ghost" type="button" data-company-action="status" ${off}>${s.detail.status==='active'?'고객사 비활성화':'고객사 재활성화'}</button>`:''}<button class="btn ghost" type="button" data-company-action="close" ${off}>고객사 목록으로</button></div></form>`:''}${assignmentView(s,off)}${s.detail?'<section data-company-manager-host></section>':''}`;
    if(s.detail)managers.mount(container.querySelector('[data-company-manager-host]'),s.detail.id);
  }
  function checkList(data,q){
    if(!data||!Array.isArray(data.companies)||!data.companies.every(rowOK)||!Number.isSafeInteger(data.total)||data.total<0||data.page!==q.page||data.pageSize!==q.pageSize||data.search!==q.search||data.status!==q.status||data.companies.length>q.pageSize)throw Error('고객사 목록 응답을 확인하지 못했습니다. 다시 조회해 주세요.');
  }
  async function load(q){const d=await api.companies(q);checkList(d,q);return d}
  async function operate(work){
    if(state.working||!canUse())return;
    const run=generation;state.working=true;state.message='';draw();
    try{await work(run)}catch(error){if(run===generation)state.message=error.message}
    finally{if(run===generation){state.working=false;draw()}}
  }
  const current=run=>run===generation&&canUse();
  async function loadAssignments(run,id){
    const data=await api.companyCounselors(id);if(!current(run)||state.detail?.id!==id)return;
    if(!data||data.companyId!==id||!Array.isArray(data.counselors)||!Array.isArray(data.assignments)||!data.counselors.every(c=>uuid(c.id)&&typeof c.name==='string')||new Set(data.counselors.map(c=>c.id)).size!==data.counselors.length||!data.assignments.every(a=>data.counselors.some(c=>c.id===a.counselorUserId)&&typeof a.createdAt==='string')||new Set(data.assignments.map(a=>a.counselorUserId)).size!==data.assignments.length)throw Error('상담사 배정 응답을 확인하지 못했습니다. 다시 조회해 주세요.');
    state.assignments=data;state.selectedCounselor='';
  }
  async function list(q){
    await operate(async run=>{state.data=null;draw();const data=await load(q);if(!current(run))return;state.data=data;state.query={...q};state.search=q.search;state.status=q.status});
  }
  function onInput(event){
    if(state.working||!canUse())return;
    const e=event.target;
    if(e.id==='company-search')state.search=e.value;
    if(e.id==='company-status')state.status=e.value;
    if(e.id==='company-counselor'){state.selectedCounselor=e.value;draw()}
    if(state.form&&FIELDS.some(([key])=>key===e.dataset.companyField))state.form[e.dataset.companyField]=e.value;
  }
  async function onSubmit(event){
    event.preventDefault();if(state.working||!canUse())return;
    if(event.target.matches('[data-company-search]')){await list({...state.query,search:state.search.trim().replace(/\s+/gu,' '),status:state.status,page:1});return}
    if(!event.target.matches('[data-company-form]')||!state.form||(event.target.dataset.id||'')!==(state.detail?.id||''))return;
    if(state.form.end_date<state.form.start_date){state.message='종료일은 시작일보다 빠를 수 없습니다.';draw();return}
    const id=state.detail?.id,body={...state.form,...(id?{expectedUpdatedAt:state.detail.updated_at}:{})};
    await operate(async run=>{
      const data=await api.saveCompany(id,body);if(!current(run))return;
      if(!detailOK(data?.company)||(id&&data.company.id!==id))throw Error('저장 결과를 확인하지 못했습니다. 목록을 다시 조회해 주세요.');
      state.linkage=null;state.detail=data.company;state.form=Object.fromEntries(FIELDS.map(([k])=>[k,data.company[k]]));
      // A successful write is acknowledged independently from a subsequent list failure.
      state.message='고객사 정보를 저장했습니다.';state.data=null;
      const q={...state.query,page:1,...(!id?{search:'',status:'all'}:{})};
      try{const d=await load(q);if(current(run)){state.data=d;state.query=q;state.search=q.search;state.status=q.status}}
      catch{if(current(run))state.message='저장은 완료했지만 목록을 불러오지 못했습니다. 목록을 다시 조회해 주세요.'}
    });
  }
  async function onClick(event){
    const button=event.target.closest('[data-company-action]');if(!button||button.disabled||state.working||!canUse())return;
    const action=button.dataset.companyAction;
    if(action==='assignments-load'&&state.detail){const id=state.detail.id;state.assignments=null;state.selectedCounselor='';await operate(run=>loadAssignments(run,id));return}
    if(['assign','unassign'].includes(action)&&state.detail&&state.assignments&&button.dataset.id===state.detail.id){
      const id=state.detail.id,counselorId=action==='assign'?state.selectedCounselor:button.dataset.counselor,assigned=action==='assign';
      if(!uuid(counselorId)||!state.assignments.counselors.some(c=>c.id===counselorId))return;
      await operate(async run=>{
        state.assignments=null;state.selectedCounselor='';draw();
        const d=await api.assignCompanyCounselor(id,counselorId,assigned);if(!current(run)||state.detail?.id!==id)return;
        if(d?.companyId!==id||d.counselorUserId!==counselorId||d.assigned!==assigned||typeof d.changed!=='boolean'||assigned&&!d.changed)throw Error('상담사 배정 결과를 확인하지 못했습니다. 다시 조회해 주세요.');
        state.message=assigned?'상담사를 배정했습니다.':'상담사 배정을 해제했습니다.';
        try{await loadAssignments(run,id)}catch{if(current(run))state.message='배정 변경은 완료했지만 목록을 확인하지 못했습니다. 배정 조회로 상태를 확인해 주세요.'}
      });return;
    }
    if(action==='new'){state.assignments=null;state.selectedCounselor='';state.linkage=null;state.detail=null;state.form=blank();state.message='';draw();return}
    if(action==='close'){state.assignments=null;state.selectedCounselor='';state.linkage=null;state.detail=null;state.form=null;draw();return}
    if(action==='previous'||action==='next'){await list({...state.query,page:state.query.page+(action==='next'?1:-1)});return}
    if(action==='detail'){
      const id=button.dataset.id;if(!uuid(id))return;
      // Clear the previous target before the asynchronous read (no stale editable form on failure).
      state.assignments=null;state.selectedCounselor='';state.linkage=null;state.detail=null;state.form=null;
      await operate(async run=>{const d=await api.company(id);if(!current(run))return;if(!detailOK(d?.company)||d.company.id!==id)throw Error('고객사 상세 응답을 확인하지 못했습니다.');if(!d.linkage||!['linkedParticipants','unlinkedParticipants'].every(k=>Number.isSafeInteger(d.linkage[k])&&d.linkage[k]>=0))throw Error('고객사 연결 인원을 확인하지 못했습니다.');state.linkage=d.linkage;state.detail=d.company;state.form=Object.fromEntries(FIELDS.map(([k])=>[k,d.company[k]]))});return;
    }
    if(action==='status'&&state.detail){
      const id=state.detail.id,body={status:state.detail.status==='active'?'inactive':'active',expectedUpdatedAt:state.detail.updated_at};
      await operate(async run=>{const d=await api.saveCompany(id,body);if(!current(run))return;if(!detailOK(d?.company)||d.company.id!==id||d.company.status!==body.status)throw Error('운영 상태 변경 결과를 확인하지 못했습니다.');state.linkage=null;state.detail=d.company;state.message=`고객사를 ${statusLabel(body.status)} 상태로 변경했습니다.`;state.data=null;
        const q={...state.query,page:1};try{const data=await load(q);if(current(run)){state.data=data;state.query=q;state.search=q.search;state.status=q.status}}catch{if(current(run))state.message='상태는 변경했지만 목록을 불러오지 못했습니다. 다시 조회해 주세요.'}});
    }
  }
  function unmount(){managers.unmount();if(container){container.removeEventListener('input',onInput);container.removeEventListener('change',onInput);container.removeEventListener('click',onClick);container.removeEventListener('submit',onSubmit)}container=null}
  return {mount(el){unmount();if(!el||!canUse())return;container=el;draw();el.addEventListener('input',onInput);el.addEventListener('change',onInput);el.addEventListener('click',onClick);el.addEventListener('submit',onSubmit);if(!initialLoadStarted){initialLoadStarted=true;void list({...state.query})}},unmount,reset(){unmount();managers.reset();generation++;state=initial();initialLoadStarted=false}};
}
