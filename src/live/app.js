import {S} from '../shared/state.js';
import {OPT,LIM,COUNSELORS,setCounselors} from '../js/03-options.js';
import {ITEM_COUNT,SCALE_MIN,SCALE_MAX} from '../js/02-eval-config.js';
import {createSurvey} from '../roles/participant/survey.js';
import {createCounselorEdit} from '../shared/counselor-edit.js';
import {createSurveyView} from './survey-view.js';
import {createAPI} from './api.js';
import {loginView} from './login-view.js';
import {esc,getPath,setPath} from './fields.js';
import {$,toast} from '../browser/dom.js';

let profile=null,records=[],participants=[],reportHTML='',busy=false,dirty=false;
let saveTimer=null,saving=null,epoch=0,saveMessage='서버에서 조회한 응답입니다.';
let counselorFilter={name:'',status:'all'};
const api=createAPI(()=>{reset();S.err='세션이 만료되었습니다. 다시 로그인해 주세요.';render()});
const byId=id=>records.find(p=>p.id===id),pname=p=>p.reg?.name||p.nick;
const view=createSurveyView({missing:p=>survey.missing(p),pname});
const full=a=>Array.isArray(a)&&a.length===ITEM_COUNT&&a.every(v=>Number.isInteger(v)&&v>=SCALE_MIN&&v<=SCALE_MAX);
const survey=createSurvey({save,render,nav,toast,getPath,setPath,OPT,LIM,ITEM_COUNT,...view,full,today:()=>new Date().toISOString().slice(0,10),submitAssessment:submit});
const edits=createCounselorEdit({byId,getDB:()=>records,save:()=>{},nav,render,toast,missing:survey.missing,ansText:view.ansText,getWSTEPS:()=>view.WSTEPS,getCounselors:()=>COUNSELORS,persistEdit, EVAL_VERSION:'',toAssessment:()=>null});

function reset(){epoch++;clearTimeout(saveTimer);profile=null;records=[];participants=[];setCounselors({});S.user=null;S.cedit=null;S.res=null;S.mode='participant';S.mode2='pre';S.view='login';S.step=0;S.showMiss={};busy=false;dirty=false;reportHTML='';saving=null;counselorFilter={name:'',status:'all'}}
function hydrate(data){
  if(!data.profile||!['participant','counselor'].includes(data.profile.role)||!Array.isArray(data.participants)||!Array.isArray(data.assessments))throw Error('권한 또는 조회 응답이 올바르지 않습니다.');
  profile=data.profile;participants=data.participants;setCounselors(data.counselors||{});
  records=participants.map(p=>{
    const a=data.assessments.find(a=>a.participant_id===p.id&&a.phase==='pre');
    return {id:p.id,nick:p.display_name,company:a?.answers?.reg?.careers?.[0]?.co||'',reg:{careers:[{},{},{}],consent:false},goal:{},expect:{},pre:Array(ITEM_COUNT).fill(null),post:null,done:{reg:false,goal:false,expect:false},...a?.answers,counselor:p.counselor_user_id,status:a?.status||'draft',submittedAt:a?.submitted_at||null,preDate:a?.dateOfAssessment||null,_updatedAt:a?.updated_at||null,_assessmentId:a?.id||null};
  });
  S.mode=profile.role;S.mode2='pre';
}
function badge(){const e=$('#live-save');if(e)e.textContent=saveMessage}
function save(){
  if(profile?.role!=='participant'||S.user?.status==='submitted'||S.cedit||busy)return;
  dirty=true;saveMessage='저장 대기 중 · 아직 서버에 반영되지 않았습니다.';badge();clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>flushDraft().catch(()=>{}),700);
}
function answers(p){return {reg:p.reg,goal:p.goal,pre:p.pre,expect:p.expect,done:p.done}}
async function flushDraft(){
  clearTimeout(saveTimer);
  if(saving){await saving;if(dirty)return flushDraft();return}
  if(!dirty||!S.user||profile?.role!=='participant')return;
  const p=S.user,run=epoch,payload=JSON.parse(JSON.stringify(answers(p))),expected=p._updatedAt;
  dirty=false;saveMessage='서버에 저장 중입니다…';badge();
  saving=(async()=>{
    try{const data=await api.write('draft',{answers:payload,expectedUpdatedAt:expected});
      if(run!==epoch)return;
      if(data.status!=='draft'||!data.updatedAt)throw Error('임시저장 완료를 확인하지 못했습니다.');
      p._updatedAt=data.updatedAt;saveMessage=dirty?'새 응답 저장 대기 중':'전체 설문 임시저장 완료';badge();
    }catch(e){if(run===epoch){dirty=true;saveMessage=e.message;badge()}throw e}
    finally{if(run===epoch)saving=null}
  })();
  await saving;
}
async function submit(p){
  if(busy)return;busy=true;render();
  try{await flushDraft();if(dirty)await flushDraft();
    const data=await api.write('submit',{answers:answers(p),expectedUpdatedAt:p._updatedAt});
    if(data.status!=='submitted')throw Error('최종 제출 완료를 확인하지 못했습니다.');
    const fresh=await api.read();hydrate(fresh);S.user=byId(p.id);dirty=false;S.showMiss={};S.view='home';toast('서버에 제출하고 계산 결과를 저장했습니다');
  }catch(e){S.err=e.message}finally{busy=false;render()}
}
async function persistEdit(p,e){
  if(busy||profile?.role!=='counselor')return;busy=true;render();
  try{const data=await api.write('edit',{participantId:p.id,answers:answers(p),expectedUpdatedAt:e.before._updatedAt});
    if(data.status!=='submitted')throw Error('수정 완료를 확인하지 못했습니다.');
    const fresh=await api.read();hydrate(fresh);S.user=e.prevUser;S.cedit=null;S.res=e.res;S.from=e.from;
    const report=await api.report(p.id);reportHTML=report.html;S.view='result';toast('응답 수정과 서버 재계산을 저장했습니다');
  }catch(error){S.err=error.message}finally{busy=false;render()}
}
function nav(v){
  if(busy)return;
  const allowed=profile?.role==='participant'?['wizard','home']:['cns','wizard','result'];
  if(!profile||!allowed.includes(v))return;
  if(v==='wizard'&&(!S.user||(profile.role==='counselor'&&!S.cedit)))return;
  if(v==='cns'&&S.cedit)edits.abortEdit();
  S.view=v;S.err='';render();window.scrollTo(0,0);
}
async function doLogin(){
  if(busy)return;
  const id=$('#lg-id').value.trim(),pw=$('#lg-pw').value;$('#lg-pw').value='';
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{5,31}$/.test(id)||pw.length<8||pw.length>128){S.err='부여받은 아이디와 8자리 이상의 비밀번호를 입력해 주세요.';render();return}
  busy=true;S.err='';render();
  try{const data=await api.login(id,pw);hydrate(data);
    if(profile.role==='participant'){
      if(records.length!==1)throw Error('내담자 배정 정보를 확인하지 못했습니다.');
      S.user=records[0];S.step=0;S.view=S.user.status==='submitted'?'home':'wizard';
    }else S.view='cns';
    saveMessage='서버에서 조회한 응답입니다.';
  }catch(e){api.clear();reset();S.err=e.message}finally{busy=false;render();if(profile?.role==='counselor')window.scrollTo(0,0)}
}
async function logout(){
  if(busy)return;busy=true;render();
  let message='';try{await api.logout()}catch{message='이 브라우저의 세션을 종료했습니다. 서버 세션 종료는 확인하지 못했습니다.'}
  reset();S.err=message;render();
}
async function refresh(){
  if(busy)return;busy=true;render();
  try{if(dirty)await flushDraft();const id=S.user?.id;hydrate(await api.read());if(id)S.user=byId(id);S.err=''}catch(e){S.err=e.message}finally{busy=false;render()}
}
async function openRes(id){
  if(busy||profile?.role!=='counselor'||!byId(id))return;busy=true;render();
  try{const data=await api.report(id);if(typeof data.html!=='string')throw Error('보고서를 확인하지 못했습니다.');reportHTML=data.html;S.res={id,role:'c'};S.from='cns';S.view='result';S.err=''}catch(e){S.err=e.message}finally{busy=false;render()}
}
function counselorStatus(p){return p.status==='submitted'?'submitted':p._assessmentId?'draft':'new'}
function filterCounselor(clear=false){
  if(busy||profile?.role!=='counselor'||S.view!=='cns')return;
  counselorFilter=clear?{name:'',status:'all'}:{name:$('#cns-name').value.trim(),status:$('#cns-status').value};
  render();
}
function counselorView(){
  // records contains only the relationship-scoped response from the server.
  const name=counselorFilter.name.toLocaleLowerCase();
  const rows=records.filter(p=>(!name||String(pname(p)||'').toLocaleLowerCase().includes(name))&&
    (counselorFilter.status==='all'||(counselorFilter.status==='incomplete'?p.status!=='submitted':counselorStatus(p)===counselorFilter.status)));
  const completed=rows.filter(p=>p.status==='submitted').length;
  const labels={new:'미시작',draft:'작성 중',submitted:'진단 완료'};
  const options=[['all','전체'],['new','미시작'],['draft','작성 중'],['submitted','진단 완료'],['incomplete','미완료']];
  return `<div class="wrap" style="padding-top:26px"><div class="filters" style="justify-content:space-between"><div><h2>상담사 페이지</h2><p class="sub">${esc(profile.display_name||'상담사')} · 서버에서 확인한 담당 내담자</p></div><div class="acts"><button class="btn ghost" onclick="refresh()">새로 조회</button><button class="btn ghost" onclick="logout()">로그아웃</button></div></div>
  <div class="part"><h2>내 내담자 현황</h2></div>
  <section class="sec" aria-label="담당 내담자 현황"><p class="hintline">검색·상태 조건이 적용된 담당 내담자 기준입니다. 진단 완료는 서버에서 최종 제출이 확인된 경우입니다.</p>
  <div class="tiles" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><div class="tile" data-kpi="total"><span>대상자</span><b>${rows.length}</b></div><div class="tile c2" data-kpi="completed"><span>진단 완료</span><b>${completed}</b></div><div class="tile c3" data-kpi="incomplete"><span>미완료 인원</span><b>${rows.length-completed}</b></div></div></section>
  <section class="card sec" id="plist" style="padding:20px 18px"><h2>참여자 리스트 및 진행사항</h2>
  <form class="filters" onsubmit="event.preventDefault();filterCounselor()"><label class="hintline" for="cns-name">이름 검색</label><input class="in" id="cns-name" type="search" placeholder="내담자 이름 검색" value="${esc(counselorFilter.name)}"><label class="hintline" for="cns-status">진행 상태</label><select class="in" id="cns-status" onchange="filterCounselor()">${options.map(([value,label])=>`<option value="${value}" ${counselorFilter.status===value?'selected':''}>${label}</option>`).join('')}</select><button class="btn sm" type="submit">검색</button><button class="btn ghost sm" type="button" onclick="filterCounselor(true)">초기화</button></form>
  <p class="hintline" role="status">검색 결과 ${rows.length}명 / 담당 내담자 ${records.length}명</p>
  <div class="scroll"><table class="t zebra"><thead><tr><th>내담자 이름</th><th>소속기업</th><th>진행 상태</th><th>제출일</th><th>결과 열람</th></tr></thead><tbody>${rows.length?rows.map(p=>{const state=counselorStatus(p);return `<tr data-participant="${esc(p.id)}"><td><b>${esc(pname(p)||'-')}</b></td><td>${esc(p.company||'-')}</td><td><span class="badge-s s-${state==='submitted'?'pre':state==='draft'?'prog':'new'}">${labels[state]}</span></td><td>${esc(p.preDate||p.submittedAt?.slice(0,10)||'-')}</td><td>${state==='submitted'?`<button class="btn sm" onclick="openRes('${esc(p.id)}')">결과 리포트</button>`:'<span class="hintline">최종 제출 후 열람 가능</span>'}</td></tr>`}).join(''):`<tr><td colspan="5" class="empty">${records.length?'검색·상태 조건에 맞는 내담자가 없습니다.':'배정된 내담자가 없습니다.'}</td></tr>`}</tbody></table></div></section></div>`;
}
function render(){
  $('.seg')?.remove();
  $('.proto-note').textContent=profile?'Supabase 실연동 · 서버에 저장된 실제 응답 · '+(profile.role==='counselor'?'상담사':'내담자'):'Supabase 실연동 · 계정으로 로그인해 주세요.';
  let html;
  if(!profile)html=loginView();
  else if(S.view==='wizard')html=`<div class="narrow noprint"><p id="live-save" role="status">${esc(saveMessage)}</p>${profile.role==='participant'?'<div class="acts"><button class="btn ghost sm" onclick="retrySave()">지금 임시저장</button><button class="btn ghost sm" onclick="logout()">로그아웃</button></div>':''}</div>`+view.vWizard();
  else if(profile.role==='counselor'&&S.view==='result')html=reportHTML;
  else if(profile.role==='counselor')html=counselorView();
  else html=S.user.status==='submitted'
    ?`<div class="narrow" style="padding-top:34px"><div class="card"><h2>${esc(pname(S.user))}님, 제출이 완료되었습니다</h2><p class="sub">전체 응답과 서버 계산 결과가 저장되었습니다. 결과는 담당 상담사가 안내합니다.</p><button class="btn ghost" onclick="logout()">로그아웃</button></div></div>`
    :`<div class="narrow" style="padding-top:34px"><div class="card"><h2>설문 작성 중</h2><p class="sub">${esc(saveMessage)}</p><div class="acts"><button class="btn" onclick="nav('wizard')">이어서 작성</button><button class="btn ghost" onclick="logout()">로그아웃</button></div></div></div>`;
  if(profile&&S.err)html=`<div class="narrow err noprint" role="alert">${esc(S.err)}</div>`+html;
  $('#app').innerHTML=html;
  if(busy)$('#app').querySelectorAll('input,button,select,textarea').forEach(e=>e.disabled=true);
}
function editable(){return !busy&&profile&&(profile.role==='participant'?S.user?.status!=='submitted':!!S.cedit)}
const handlers={doLogin,logout,refresh,openRes,render,nav,filterCounselor,goHome:()=>nav(profile?.role==='counselor'?'cns':'home'),
  retrySave:async()=>{if(!busy){dirty=true;try{await flushDraft()}catch{}}},
  startEdit:id=>{if(!busy&&profile?.role==='counselor'&&byId(id)?.status==='submitted')edits.startEdit(id)},
  cancelEdit:()=>{if(!busy&&S.cedit){S.err='';edits.cancelEdit()}},
  saveEdit:()=>{if(editable())edits.saveEdit()},
  submitPre:()=>{if(editable()&&profile.role==='participant')survey.submitPre()},
  fmtDate:view.fmtDate,fmtPhone:view.fmtPhone,a2Hint:view.a2Hint
};
for(const name of ['setF','setCareer','toggleChip','answer','goStep','goQ','nextFrom','setConsent','setBirth'])handlers[name]=(...args)=>{if(editable())return survey[name](...args)};
// Only UI handlers are global; tokens, records, roles and engines are not.
Object.assign(window,handlers);
function fitSheets(on){document.querySelectorAll('.sheet').forEach(el=>{el.style.zoom='';el.style.width='';el.style.maxWidth='';if(!on||el.classList.contains('noprintpage'))return;const W=733,H=1000;el.style.maxWidth='none';el.style.width=W+'px';let z=Math.min(1,H/el.scrollHeight);for(let k=0;k<3&&z<1;k++){el.style.width=(W/z)+'px';z=Math.min(1,H/el.scrollHeight)}if(z<1){el.style.width=(W/z)+'px';z=Math.min(z,H/el.scrollHeight);el.style.zoom=String(z)}else el.style.width=''})}
window.addEventListener('beforeprint',()=>fitSheets(true));window.addEventListener('afterprint',()=>fitSheets(false));
window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue=''}});
reset();render();
