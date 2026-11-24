import {createAdminCompanyManagers} from './admin-company-managers.js';
import {esc} from './fields.js';

const BASIC_FIELDS=[['name','고객사명','text',200],['start_date','사업 시작일','date'],['end_date','사업 종료일','date']];
const PM_FIELDS=[['pm_name','PM 이름','text',100],['pm_email','PM 이메일','email',254],['pm_phone','PM 연락처','tel',30]];
const FIELDS=[...BASIC_FIELDS,...PM_FIELDS];
const blank=()=>Object.fromEntries(FIELDS.map(([key])=>[key,'']));
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const rowOK=c=>c&&uuid(c.id)&&['name','start_date','end_date','pm_name','created_at'].every(k=>typeof c[k]==='string')&&['active','inactive'].includes(c.status);
const detailOK=c=>rowOK(c)&&['pm_email','pm_phone','updated_at'].every(k=>typeof c[k]==='string'&&c[k]);
const initial=()=>({data:null,working:false,message:'',query:{search:'',status:'all',page:1,pageSize:20},search:'',status:'all',form:null,detail:null,linkage:null});
export function createAdminCompanies({api,canUse,onOpenDashboard}){
  let state=initial(),container=null,generation=0,initialLoadStarted=false;
  const managers=createAdminCompanyManagers({api,canUse});
  const statusLabel=s=>s==='active'?'활성':'비활성';
  function draw(){
    if(!container)return;
    managers.unmount();
    const s=state,off=s.working?'disabled':'';
    const fields=group=>group.map(([key,label,type,max])=>`<div class="field"><label for="company-${key}">${label} *</label><input class="in" id="company-${key}" data-company-field="${key}" type="${type}" ${max?`maxlength="${max}"`:''} required value="${esc(s.form[key])}" ${off}></div>`).join('');
    container.innerHTML=`<h2 tabindex="-1">${s.detail?'고객사 설정':'고객사 관리'}</h2>
      <div data-company-list-view ${s.form?'hidden':''}><p class="hintline" data-company-separation>고객사를 선택해 진단 현황을 보거나, 설정에서 사업 기간과 담당자 정보를 관리할 수 있습니다. 내담자가 입력한 기업명이 같아도 공식 고객사로 자동 분류되지 않습니다.</p>
      <form data-company-search><div class="filters"><label for="company-search">고객사명 검색</label><input class="in" id="company-search" maxlength="200" value="${esc(s.search)}" ${off}><label for="company-status">운영 상태</label><select class="in" id="company-status" ${off}>${[['all','전체'],['active','활성'],['inactive','비활성']].map(([v,l])=>`<option value="${v}" ${v===s.status?'selected':''}>${l}</option>`).join('')}</select><button class="btn ghost" ${off}>고객사 목록 조회</button><button class="btn" type="button" data-company-action="new" ${off}>고객사 등록</button></div></form>
      ${s.data?`<div class="scroll admin-table-scroll" tabindex="0" role="region" aria-label="고객사 목록"><table class="t" data-company-list><thead><tr><th>고객사명</th><th>진행 기간</th><th>담당 PM</th><th>운영 상태</th><th>등록일</th><th>업무</th></tr></thead><tbody>${s.data.companies.map(c=>`<tr data-company-id="${esc(c.id)}">
        <td><button class="admin-company-name" type="button" data-company-action="dashboard" data-id="${esc(c.id)}" ${off}>${esc(c.name)}</button></td><td>${esc(c.start_date)} ~ ${esc(c.end_date)}</td><td>${esc(c.pm_name)}</td><td>${statusLabel(c.status)}</td><td>${esc(c.created_at.slice(0,10))}</td>
        <td><div class="acts admin-company-actions"><button class="btn ghost sm" type="button" data-company-action="dashboard" data-id="${esc(c.id)}" ${off}>운영 현황 보기</button><button class="btn ghost sm" type="button" data-company-action="detail" data-id="${esc(c.id)}" ${off}>고객사 설정</button></div></td></tr>`).join('')||'<tr><td colspan="6">조건에 맞는 고객사가 없습니다.</td></tr>'}</tbody></table></div>
      <div class="pager" role="navigation" aria-label="고객사 목록 페이지"><button type="button" data-company-action="previous" ${s.query.page<=1||s.working?'disabled':''}>이전</button><span data-company-page>${s.query.page} / ${Math.max(1,Math.ceil(s.data.total/s.query.pageSize))}페이지 · 총 ${s.data.total}개 · 페이지당 ${s.query.pageSize}개</span><button type="button" data-company-action="next" ${s.query.page*s.query.pageSize>=s.data.total||s.working?'disabled':''}>다음</button></div>`:'<p class="hintline">목록 조회를 누르면 등록된 고객사를 불러옵니다.</p>'}</div>
      <p role="status" data-company-message>${esc(s.working?'처리 중입니다.':s.message)}</p>${s.form?`
      <div class="admin-section-head"><div>${s.detail?`<h3 data-company-target>${esc(s.detail.name)}</h3>`:'<h3>새 고객사 등록</h3>'}</div><button class="btn ghost" type="button" data-company-action="close" ${off}>고객사 목록으로</button></div>
      <form data-company-form data-id="${esc(s.detail?.id||'')}">
        <fieldset class="admin-settings-group"><legend>기본정보</legend><div class="admin-settings-fields">${fields(BASIC_FIELDS)}
          <div class="field"><b>운영 상태</b><p><span class="admin-status-chip">${statusLabel(s.detail?.status??'active')}</span></p></div></div>
          ${s.linkage?`<p class="hintline" data-company-linkage>이 고객사에 분류된 내담자 ${s.linkage.linkedParticipants}명 · 조직 전체 미분류 ${s.linkage.unlinkedParticipants}명. 미분류 내담자는 자동 이관되지 않습니다.</p>`:''}
        </fieldset>
        <fieldset class="admin-settings-group"><legend>담당 PM 정보</legend><div class="admin-settings-fields">${fields(PM_FIELDS)}</div></fieldset>
        <button class="btn" ${off}>${s.detail?'고객사 정보 저장':'고객사 저장'}</button>
      </form>`:''}
      ${s.detail?`<section class="admin-settings-group" data-company-manager-host></section>
      <section class="admin-settings-group"><h3>운영 상태 변경</h3><button class="btn ghost" type="button" data-company-action="status" ${off}>${s.detail.status==='active'?'고객사 비활성화':'고객사 재활성화'}</button></section>`:''}`;
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
  async function list(q){
    await operate(async run=>{state.data=null;draw();const data=await load(q);if(!current(run))return;state.data=data;state.query={...q};state.search=q.search;state.status=q.status});
  }
  function onInput(event){
    if(state.working||!canUse())return;
    const e=event.target;
    if(e.id==='company-search')state.search=e.value;
    if(e.id==='company-status')state.status=e.value;
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
    if(action==='dashboard'){const company=state.data?.companies.find(c=>c.id===button.dataset.id);if(company)onOpenDashboard({id:company.id,name:company.name,status:company.status});return}
    if(action==='new'){state.linkage=null;state.detail=null;state.form=blank();state.message='';draw();return}
    if(action==='close'){
      const id=state.detail?.id;state.linkage=null;state.detail=null;state.form=null;draw();
      const previous=[...container.querySelectorAll('[data-company-action="detail"]')].find(button=>button.dataset.id===id);
      (previous||container.querySelector('[data-company-action="new"]'))?.focus();
      return;
    }
    if(action==='previous'||action==='next'){await list({...state.query,page:state.query.page+(action==='next'?1:-1)});return}
    if(action==='detail'){
      const id=button.dataset.id;if(!uuid(id))return;
      // Clear the previous target before the asynchronous read (no stale editable form on failure).
      state.linkage=null;state.detail=null;state.form=null;
      await operate(async run=>{const d=await api.company(id);if(!current(run))return;if(!detailOK(d?.company)||d.company.id!==id)throw Error('고객사 상세 응답을 확인하지 못했습니다.');if(!d.linkage||!['linkedParticipants','unlinkedParticipants'].every(k=>Number.isSafeInteger(d.linkage[k])&&d.linkage[k]>=0))throw Error('고객사 연결 인원을 확인하지 못했습니다.');state.linkage=d.linkage;state.detail=d.company;state.form=Object.fromEntries(FIELDS.map(([k])=>[k,d.company[k]]))});
      if(state.detail?.id===id)container?.querySelector('h2')?.focus();
      return;
    }
    if(action==='status'&&state.detail){
      const id=state.detail.id,body={status:state.detail.status==='active'?'inactive':'active',expectedUpdatedAt:state.detail.updated_at};
      if(body.status==='inactive'&&!window.confirm(`${state.detail.name} 고객사를 비활성화할까요?`))return;
      await operate(async run=>{const d=await api.saveCompany(id,body);if(!current(run))return;if(!detailOK(d?.company)||d.company.id!==id||d.company.status!==body.status)throw Error('운영 상태 변경 결과를 확인하지 못했습니다.');state.linkage=null;state.detail=d.company;state.message=`고객사를 ${statusLabel(body.status)} 상태로 변경했습니다.`;state.data=null;
        const q={...state.query,page:1};try{const data=await load(q);if(current(run)){state.data=data;state.query=q;state.search=q.search;state.status=q.status}}catch{if(current(run))state.message='상태는 변경했지만 목록을 불러오지 못했습니다. 다시 조회해 주세요.'}});
    }
  }
  function unmount(){managers.unmount();if(container){container.removeEventListener('input',onInput);container.removeEventListener('change',onInput);container.removeEventListener('click',onClick);container.removeEventListener('submit',onSubmit)}container=null}
  return {mount(el){unmount();if(!el||!canUse())return;container=el;draw();el.addEventListener('input',onInput);el.addEventListener('change',onInput);el.addEventListener('click',onClick);el.addEventListener('submit',onSubmit);if(!initialLoadStarted){initialLoadStarted=true;void list({...state.query})}},unmount,reset(){unmount();managers.reset();generation++;state=initial();initialLoadStarted=false}};
}
