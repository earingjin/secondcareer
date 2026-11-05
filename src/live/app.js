import {S} from '../shared/state.js';
import {OPT,LIM,COUNSELORS,setCounselors} from '../js/03-options.js';
import {ITEM_COUNT,SCALE_MIN,SCALE_MAX,AREA_COUNT} from '../js/02-eval-config.js';
import {createSurvey} from '../roles/participant/survey.js';
import {createCounselorEdit} from '../shared/counselor-edit.js';
import {createSurveyView} from './survey-view.js';
import {createMobileSurvey} from './mobile-survey.js';
import {createAPI} from './api.js';
import {loginView,passwordChangeView} from './login-view.js';
import {mountParticipantRegistration} from './participant-registration.js';
import {counselorView} from './counselor-view.js';
import {compareView} from './compare-view.js';
import {assessmentNotice,postAssessmentNotice,postEntryUrl,POST_ENTRY_PARAM,POST_ENTRY_VALUE} from './assessment-notice.js';
import {postTestGate} from './post-test-gate.js';
import {adminProgressView,validProgress} from './admin-progress-view.js';
import {adminDirectoryView,validDirectory} from './admin-directory-view.js';
import {adminAggregateView,validAggregate} from './admin-aggregate-view.js';
import {esc,getPath,setPath} from './fields.js';
import {$,toast} from '../browser/dom.js';

let profile=null,records=[],participants=[],reportHTML='',busy=false,dirty=false,restoring=true;
let saveTimer=null,saving=null,epoch=0,saveMessage='응답을 불러왔습니다.';
let postTimer=null,postSaving=null,postDirty=false,postUpdatedAt=null,postMessage='';
let satIssues=[],postLocked=false,postSubmitting=false,postAvailable=false,compareData=null;
// DEV-014: participant-side post approval from the server (the server still checks every request).
let postApproved=false;
let counselorFilter={name:'',status:'all'};
let registrationContext=null,unmountRegistration=null,mustChangePassword=false;
let assessmentUrl='',assessmentUrlMessage='',assessmentUrlInput='';
const registrationResults={results:[]};
// REQ-A-004: admin progress counts. Updated in place so registration and URL inputs are not re-rendered.
let progress={data:null,loading:false,message:''},progressRun=0;
const NO_FILTER={company:'all',counselor:'all',status:'all'};
let directory={data:null,loading:false,message:'',filter:{...NO_FILTER}},directoryRun=0;
// REQ-A-006/007: loaded only when the administrator opens it.
let aggregate={data:null,loading:false,message:'',tab:'r1'},aggregateRun=0;
// A post notice link (?entry=post) asks to open the post assessment after login or session restore.
// The marker stays in the address while the post screen is open so a reload returns there.
let postEntry=new URLSearchParams(location.search).get(POST_ENTRY_PARAM)===POST_ENTRY_VALUE;
function clearPostEntry(){
  if(!postEntry)return;postEntry=false;
  try{const url=new URL(location.href);url.searchParams.delete(POST_ENTRY_PARAM);history.replaceState(history.state,'',url.href)}catch{}
}
async function enterPostFromLink(){
  if(!postEntry||!profile||mustChangePassword||busy)return;
  if(profile.role!=='participant'||!postTestGate){clearPostEntry();return}
  if(S.user?.status!=='submitted'){clearPostEntry();S.err='사전진단을 최종 제출한 뒤 사후진단에 참여할 수 있습니다. 사전진단을 먼저 완료해 주세요.';render();return}
  if(!postApproved){clearPostEntry();S.err='담당 상담사가 사후진단을 허용한 뒤 참여할 수 있습니다. 허용 안내를 받은 뒤 다시 접속해 주세요.';render();return}
  await startPost();
  // Server refusals (no submitted pre, no permission, feature off) keep the existing checks; only the message is added.
  if(profile&&S.view!=='post'){clearPostEntry();S.err='사후진단을 시작하지 못했습니다. '+(S.err||'')+' 문제가 계속되면 담당 상담사에게 문의해 주세요.';render()}
}
function clearRegistrationResults(){registrationResults.results.forEach(r=>delete r.temporaryPassword);registrationResults.results.length=0}
window.addEventListener('pagehide',()=>{clearRegistrationResults();unmountRegistration?.();unmountRegistration=null});
const api=createAPI(()=>{reset();S.err='세션이 만료되었습니다. 다시 로그인해 주세요.';render()});
const byId=id=>records.find(p=>p.id===id),pname=p=>p.reg?.name||p.nick;
const view=createSurveyView({missing:p=>survey.missing(p),pname});
const full=a=>Array.isArray(a)&&a.length===ITEM_COUNT&&a.every(v=>Number.isInteger(v)&&v>=SCALE_MIN&&v<=SCALE_MAX);
const survey=createSurvey({save,render,nav,toast,getPath,setPath,OPT,LIM,ITEM_COUNT,...view,full,today:()=>new Date().toISOString().slice(0,10),submitAssessment:submit});
const mobileSurvey=createMobileSurvey({getProfile:()=>profile,steps:view.WSTEPS,missing:survey.missing,goStep:survey.goStep,goQ:survey.goQ,nextFrom:survey.nextFrom,render,toast});
const edits=createCounselorEdit({byId,getDB:()=>records,save:()=>{},nav,render,toast,missing:survey.missing,ansText:view.ansText,getWSTEPS:()=>view.WSTEPS,getCounselors:()=>COUNSELORS,persistEdit, EVAL_VERSION:'',toAssessment:()=>null});

function reset(){mobileSurvey.reset();clearRegistrationResults();progress={data:null,loading:false,message:''};progressRun++;directory={data:null,loading:false,message:'',filter:{...NO_FILTER}};directoryRun++;aggregate={data:null,loading:false,message:'',tab:'r1'};aggregateRun++;assessmentUrl='';assessmentUrlInput='';assessmentUrlMessage='';epoch++;clearTimeout(saveTimer);clearTimeout(postTimer);postSaving=null;postDirty=false;postUpdatedAt=null;postMessage='';postLocked=false;postSubmitting=false;satIssues=[];postAvailable=false;postApproved=false;compareData=null;profile=null;records=[];participants=[];setCounselors({});S.user=null;S.cedit=null;S.res=null;S.mode='participant';S.mode2='pre';S.view='login';S.step=0;S.showMiss={};busy=false;dirty=false;reportHTML='';saving=null;counselorFilter={name:'',status:'all'}}
function hydrate(data){
  if(!data.profile||!['participant','counselor','admin'].includes(data.profile.role)||!Array.isArray(data.participants)||!Array.isArray(data.assessments))throw Error('권한 또는 조회 응답이 올바르지 않습니다.');
  profile=data.profile;mustChangePassword=data.mustChangePassword===true;participants=data.participants;setCounselors(data.assessmentCounselors||{});
  assessmentUrl=typeof data.assessmentUrl==='string'?data.assessmentUrl.trim():'';assessmentUrlInput=assessmentUrl;
  registrationContext=data.registrationAvailable===false?null:{profile,counselors:Array.isArray(data.counselors)?data.counselors:[],organizationName:data.organizationName||'',defaultCounselorId:'',assessmentUrl:typeof data.assessmentUrl==='string'?data.assessmentUrl.trim():''};
  records=participants.map(p=>{
    const a=data.assessments.find(a=>a.participant_id===p.id&&a.phase==='pre');
    return {id:p.id,nick:p.display_name,company:p.company_name||a?.answers?.reg?.careers?.[0]?.co||'',reg:{careers:[{co:p.company_name||''},{},{}],phone:view.fmtPhone(p.phone||''),consent:false},goal:{},expect:{},pre:Array(ITEM_COUNT).fill(null),post:null,done:{reg:false,goal:false,expect:false},...a?.answers,counselor:p.counselor_user_id,status:a?.status||'draft',submittedAt:a?.submitted_at||null,preDate:a?.dateOfAssessment||null,_updatedAt:a?.updated_at||null,_assessmentId:a?.id||null,loginId:typeof p.login_id==='string'?p.login_id:null};
  });
  // Post status is shown only when both the browser gate and the server flag allow it.
  postAvailable=postTestGate&&profile.role==='counselor'&&Array.isArray(data.postAssessments);compareData=null;
  if(postAvailable)for(const r of records){const a=data.postAssessments.find(x=>x.participant_id===r.id);r.postStatus=a?.status==='submitted'?'submitted':a?'draft':'new';r.postSubmittedAt=a?.status==='submitted'?a.submitted_at:null}
  if(postAvailable)for(const r of records){const a=Array.isArray(data.postApprovals)?data.postApprovals.find(x=>x.participant_id===r.id):null;r.postApproved=!!a;r.postApprovedAt=a?.approved_at||null;r.postApprovalSource=a?.source==='backfill'?'backfill':a?'counselor':null}
  postApproved=postTestGate&&profile.role==='participant'&&data.postApproved===true;
  S.mode=profile.role;S.mode2='pre';
}
function badge(){const e=$('#live-save');if(e)e.textContent=saveMessage}
function save(){
  if(profile?.role!=='participant'||S.user?.status==='submitted'||S.cedit||busy)return;
  dirty=true;saveMessage='저장 대기 중 · 변경한 응답이 아직 저장되지 않았습니다.';badge();clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>flushDraft().catch(()=>{}),700);
}
function answers(p){return {reg:p.reg,goal:p.goal,pre:p.pre,expect:p.expect,done:p.done}}
async function flushDraft(){
  clearTimeout(saveTimer);
  if(saving){await saving;if(dirty)return flushDraft();return}
  if(!dirty||!S.user||profile?.role!=='participant')return;
  const p=S.user,run=epoch,payload=JSON.parse(JSON.stringify(answers(p))),expected=p._updatedAt;
  dirty=false;saveMessage='응답을 저장하고 있습니다…';badge();
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
    const fresh=await api.read();hydrate(fresh);S.user=byId(p.id);dirty=false;S.showMiss={};S.view='home';toast('응답을 제출했습니다');
  }catch(e){S.err=e.message}finally{busy=false;render()}
}
async function persistEdit(p,e){
  if(busy||profile?.role!=='counselor')return;busy=true;render();
  try{const data=await api.write('edit',{participantId:p.id,answers:answers(p),expectedUpdatedAt:e.before._updatedAt});
    if(data.status!=='submitted')throw Error('수정 완료를 확인하지 못했습니다.');
    const fresh=await api.read();hydrate(fresh);S.user=e.prevUser;S.cedit=null;S.res=e.res;S.from=e.from;
    // Discard the old report after a successful save, even if reloading fails.
    reportHTML='';S.view='result';
    const report=await api.report(p.id,S.res?.role||'c');if(typeof report.html!=='string'||!report.html.trim())throw Error('저장 후 보고서를 확인하지 못했습니다. 보고서를 다시 조회해 주세요.');reportHTML=report.html;toast('수정한 응답과 결과를 저장했습니다');
  }catch(error){S.err=error.message}finally{busy=false;render()}
}
function nav(v){
  if(busy||mustChangePassword)return;
  // REQ-A-005: an administrator only moves between the admin page and an opened report.
  if(profile?.role==='admin'){
    if(v!=='admin')return;
    reportHTML='';S.res=null;S.view='admin';S.err='';render();window.scrollTo(0,0);return;
  }
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
  try{const data=await api.login(id,pw);openAccount(data);
  }catch(e){api.clear();reset();S.err=e.message}finally{busy=false;render();if(profile?.role==='counselor')window.scrollTo(0,0)}
  await enterPostFromLink();
}
function openAccount(data){
  hydrate(data);
  if(mustChangePassword)S.view='password';
  else if(profile.role==='participant'){
    if(records.length!==1)throw Error('내담자 배정 정보를 확인하지 못했습니다.');
    S.user=records[0];S.step=0;S.view=S.user.status==='submitted'?'home':'wizard';mobileSurvey.reset();
  }else S.view='cns';
  saveMessage='응답을 불러왔습니다.';
  if(profile.role==='admin'&&!mustChangePassword){loadProgress();loadDirectory()}
}
function paintAggregate(){
  const el=$('#admin-aggregate');if(!el)return;
  el.innerHTML=adminAggregateView(aggregate);
  if(busy)el.querySelectorAll('button,select').forEach(e=>e.disabled=true);
}
async function loadAggregate(company=null){
  if(profile?.role!=='admin'||mustChangePassword)return;
  const run=++aggregateRun;aggregate={...aggregate,loading:true,message:''};paintAggregate();
  try{
    const data=await api.adminAggregate(company);if(run!==aggregateRun)return;
    if(!validAggregate(data)||data.company!==company)throw Error('통합 분석 응답을 확인하지 못했습니다. 다시 불러와 주세요.');
    aggregate={data,loading:false,message:'',tab:aggregate.tab};
  }catch(error){if(run===aggregateRun)aggregate={data:null,loading:false,message:error.message,tab:aggregate.tab}}
  finally{if(run===aggregateRun){aggregate.loading=false;paintAggregate()}}
}
// REQ-A-001/002 read-only management lists, painted in place like the progress section.
function paintDirectory(){
  const el=$('#admin-directory');if(!el)return;
  el.innerHTML=adminDirectoryView(directory);
  if(busy)el.querySelectorAll('button,select').forEach(e=>e.disabled=true);
}
async function loadDirectory(){
  if(profile?.role!=='admin'||mustChangePassword)return;
  const run=++directoryRun;directory.loading=true;paintDirectory();
  try{
    const data=await api.adminDirectory();if(run!==directoryRun)return;
    if(!validDirectory(data))throw Error('운영 관리 목록 응답을 확인하지 못했습니다. 새로 조회해 주세요.');
    // Keep a filter only while it still points at something in the new lists.
    const f=directory.filter,keep={company:f.company==='all'||data.companies[Number(f.company)]?.name===directory.data?.companies[Number(f.company)]?.name?f.company:'all',
      counselor:f.counselor==='all'||['unassigned','unknown'].includes(f.counselor)||data.counselors.some(c=>c.id===f.counselor)?f.counselor:'all',status:f.status};
    directory={data,loading:false,message:'',filter:keep};
  }catch(error){if(run===directoryRun)directory={data:null,loading:false,message:error.message,filter:directory.filter}}
  finally{if(run===directoryRun){directory.loading=false;paintDirectory()}}
}
function paintProgress(){
  const el=$('#admin-progress');if(!el)return;
  el.innerHTML=adminProgressView(progress);
  if(busy)el.querySelectorAll('button').forEach(e=>e.disabled=true);
}
async function loadProgress(){
  if(profile?.role!=='admin'||mustChangePassword)return;
  const run=++progressRun;progress.loading=true;paintProgress();
  try{
    const data=await api.adminProgress();if(run!==progressRun)return;
    if(!validProgress(data))throw Error('진단 현황 응답을 확인하지 못했습니다. 새로 조회해 주세요.');
    progress={data,loading:false,message:''};
  }catch(error){if(run===progressRun)progress={data:null,loading:false,message:error.message}}
  finally{if(run===progressRun){progress.loading=false;paintProgress()}}
}
async function changePassword(){
  if(busy||!mustChangePassword)return;
  const password=$('#new-password').value,confirm=$('#confirm-password').value;
  $('#new-password').value='';$('#confirm-password').value='';
  if(password.length<12||password.length>128||password!==confirm){S.err='12~128자의 새 비밀번호를 동일하게 두 번 입력해 주세요.';render();return}
  busy=true;S.err='';render();
  try{
    hydrate(await api.changePassword(password));
    if(mustChangePassword||records.length!==1)throw Error('변경 후 참여자 정보를 확인하지 못했습니다. 다시 로그인해 주세요.');
    S.user=records[0];S.step=0;S.view=S.user.status==='submitted'?'home':'wizard';mobileSurvey.reset();
  }catch(error){S.err=error.message}finally{busy=false;render()}
}
async function logout(){
  if(busy)return;clearRegistrationResults();clearPostEntry();busy=true;render();
  let message='';try{await api.logout()}catch{message='이 브라우저에서는 로그아웃했지만, 서비스에서 로그아웃 처리가 완료됐는지는 확인하지 못했습니다.'}
  reset();S.err=message;render();
}
async function refresh(){
  if(busy)return;busy=true;render();
  try{if(dirty)await flushDraft();const id=S.user?.id;hydrate(await api.read());if(id)S.user=byId(id);mobileSurvey.reset();S.err=''}catch(e){S.err=e.message}finally{busy=false;render()}
}
async function saveAssessmentUrl(){
  if(busy||profile?.role!=='admin')return;
  assessmentUrlInput=$('#assessment-url').value;assessmentUrlMessage='';busy=true;render();
  try{
    const data=await api.updateAssessmentUrl(assessmentUrlInput);
    if(data.assessmentUrl!==null&&typeof data.assessmentUrl!=='string')throw Error('저장 결과를 확인하지 못했습니다.');
    assessmentUrl=data.assessmentUrl||'';assessmentUrlInput=assessmentUrl;
    if(registrationContext)registrationContext.assessmentUrl=assessmentUrl;
    assessmentUrlMessage='진단 접속 주소를 저장했습니다.';
  }catch(error){assessmentUrlMessage=error.message}
  finally{busy=false;render()}
}
const validScores=a=>Array.isArray(a)&&a.length===AREA_COUNT&&a.every(r=>r&&[r.pre,r.post,r.diff].every(Number.isFinite));
async function openCompare(id){
  if(busy||profile?.role!=='counselor'||!postAvailable)return;
  if(S.cedit){S.err='수정 중인 응답이 있습니다. 수정 저장 또는 취소 후 조회해 주세요.';render();return}
  const r=byId(id);
  if(!r||r.status!=='submitted'||r.postStatus!=='submitted'){S.err='사전·사후 진단을 모두 제출한 내담자만 비교 결과를 조회할 수 있습니다.';render();return}
  busy=true;compareData=null;render();
  try{
    const data=await api.compare(id);
    if(data?.participantId!==id||!validScores(data.areas)||!validPost(data.items?.pre)||!validPost(data.items?.post)||[...data.items.pre,...data.items.post].includes(null)||!validSat(data.sat,true))throw Error('비교 결과를 확인하지 못했습니다.');
    compareData=data;S.view='compare';S.err='';
  }catch(e){S.err=e.message}finally{busy=false;render();window.scrollTo(0,0)}
}
// REQ-A-005: admin report from the server-checked directory list. Only a row the server
// listed as submitted is requested; the server re-checks organization and state.
async function openAdminReport(id,kind='c'){
  if(busy||profile?.role!=='admin'||mustChangePassword)return;
  const row=directory.data?.participants.find(p=>p.id===id);
  if(!['c','p'].includes(kind)||!row){S.err='관리자 참여자 목록과 보고서 종류를 확인해 주세요.';render();return}
  if(row.preStatus!=='submitted'){S.err='사전진단 최종 제출이 완료된 참여자만 보고서를 조회할 수 있습니다.';render();return}
  const run=epoch;busy=true;reportHTML='';render();
  try{
    const data=await api.adminReport(id,kind);if(run!==epoch)return;
    if(typeof data?.html!=='string'||!data.html.trim())throw Error('보고서를 확인하지 못했습니다.');
    reportHTML=data.html;S.res={id,role:kind};S.view='admin-report';S.err='';
  }catch(e){if(run===epoch&&profile){reportHTML='';S.res=null;S.view='admin';S.err=e.message}}
  finally{if(run===epoch){busy=false;render();window.scrollTo(0,0)}}
}
async function openRes(id,kind='c'){
  if(busy||profile?.role!=='counselor')return;
  if(S.cedit){S.err='수정 중인 응답이 있습니다. 수정 저장 또는 취소 후 보고서를 전환해 주세요.';render();return}
  if(!['c','p'].includes(kind)||!byId(id)){S.err='담당 내담자와 보고서 종류를 확인해 주세요.';render();return}
  if(byId(id).status!=='submitted'){S.err='최종 제출이 완료된 내담자만 보고서를 조회할 수 있습니다.';render();return}
  busy=true;reportHTML='';render();
  try{const data=await api.report(id,kind);if(typeof data.html!=='string'||!data.html.trim())throw Error('보고서를 확인하지 못했습니다.');reportHTML=data.html;S.res={id,role:kind};S.from='cns';S.view='result';S.err=''}catch(e){S.err=e.message}finally{busy=false;render()}
}
function filterCounselor(clear=false){
  if(busy||profile?.role!=='counselor'||S.view!=='cns')return;
  counselorFilter=clear?{name:'',status:'all'}:{name:$('#cns-name').value.trim(),status:$('#cns-status').value};
  render();
}
function postAllowed(){return postTestGate&&postApproved&&!busy&&!mustChangePassword&&profile?.role==='participant'&&S.user?.status==='submitted'}
const validPost=a=>Array.isArray(a)&&a.length===ITEM_COUNT&&a.every(v=>v===null||(Number.isInteger(v)&&v>=SCALE_MIN&&v<=SCALE_MAX));
const SAT_SCORES=['q1','q2','q3a','q3b','q3c','q5fit'],SAT_CHOICES=['d32','d33','d34','d35','q7'];
// Shape check for a satisfaction object; partial drafts are allowed unless complete is requested.
function validSat(t,complete){
  if(t===undefined)return !complete;
  if(!t||typeof t!=='object'||Array.isArray(t)||Object.keys(t).some(k=>![...SAT_SCORES,...SAT_CHOICES,'q7txt'].includes(k)))return false;
  const scoreOk=k=>Number.isInteger(t[k])&&t[k]>=SCALE_MIN&&t[k]<=SCALE_MAX;
  for(const k of SAT_SCORES)if(Object.hasOwn(t,k)?!scoreOk(k):complete)return false;
  for(const k of SAT_CHOICES){
    const path='sat.'+k,v=t[k];
    if(!Object.hasOwn(t,k)){if(complete)return false;continue}
    if(!Array.isArray(v)||v.length>LIM[path]||new Set(v).size!==v.length||v.some(x=>!OPT[path].includes(x))||(complete&&v.length<(k==='d33'?LIM[path]:1)))return false;
  }
  return !Object.hasOwn(t,'q7txt')||(typeof t.q7txt==='string'&&t.q7txt.length<=200);
}
const satPayload=()=>Object.keys(S.user.sat||{}).length?{sat:structuredClone(S.user.sat)}:{};
// Key order is not significant; arrays (Q4 rank order) are.
const sameSat=(a,b)=>!!a&&!!b&&[...SAT_SCORES,...SAT_CHOICES,'q7txt'].every(k=>JSON.stringify(a[k])===JSON.stringify(b[k]));
function postBadge(){const e=$('#post-save-status');if(e)e.textContent=postMessage}
async function startPost(){
  if(!postAllowed())return;
  const run=epoch;
  if(!postDirty&&!postSaving){
    busy=true;S.err='';render();
    try{
      const data=await api.postDraft();if(run!==epoch)return;
      const a=data.assessment;
      if(a!==null&&(!a||!['draft','submitted'].includes(a.status)||!validPost(a.answers?.post)||!validSat(a.answers?.sat,a.status==='submitted')||typeof a.updatedAt!=='string'||!Number.isFinite(Date.parse(a.updatedAt))||(a.status==='submitted'&&(!a.answers.post.every(v=>v!==null)||typeof a.submittedAt!=='string'||!Number.isFinite(Date.parse(a.submittedAt))))))throw Error('사후 임시저장 내용을 확인하지 못했습니다.');
      S.user.post=a?[...a.answers.post]:Array(ITEM_COUNT).fill(null);S.user.sat=a?.answers.sat?structuredClone(a.answers.sat):{};postUpdatedAt=a?.updatedAt||null;postLocked=a?.status==='submitted';satIssues=[];postMessage=postLocked?'사후 진단이 제출되었습니다.':a?'사후 임시저장 내용을 불러왔습니다.':'사후 임시저장 내용이 없습니다.';
    }catch(error){if(run===epoch)S.err=error.message;return}
    finally{if(run===epoch){busy=false;render()}}
  }
  if(run!==epoch)return;S.mode2='post';S.pstep=postLocked?3:1;S.view='post';S.err='';render();window.scrollTo(0,0);
}
async function flushPost(){
  clearTimeout(postTimer);
  if(postSaving){await postSaving;if(postDirty)return flushPost();return}
  if(!postDirty||!S.user||profile?.role!=='participant'||mustChangePassword)return;
  const p=S.user,run=epoch,payload=[...p.post],expected=postUpdatedAt,satSnapshot=satPayload();
  postDirty=false;postMessage='사후 응답을 임시저장하고 있습니다…';postBadge();
  postSaving=(async()=>{
    try{
      const sent={post:payload,...satSnapshot},data=await api.write('post-draft',{answers:sent,expectedUpdatedAt:expected});if(run!==epoch)return;
      if(data.status!=='draft'||!validPost(data.answers?.post)||!validSat(data.answers?.sat)||typeof data.updatedAt!=='string'||!Number.isFinite(Date.parse(data.updatedAt))||JSON.stringify(data.answers.post)!==JSON.stringify(payload)||(satSnapshot.sat&&!sameSat(data.answers.sat,satSnapshot.sat)))throw Error('사후 임시저장 결과를 확인하지 못했습니다.');
      postUpdatedAt=data.updatedAt;postMessage=postDirty?'새 사후 응답 저장 대기 중':'사후 응답 임시저장 완료';postBadge();
    }catch(error){if(run===epoch){postDirty=true;postMessage=error.message;postBadge()}throw error}
    finally{if(run===epoch)postSaving=null}
  })();
  await postSaving;
}
function answerPost(i,v){
  if(!postAllowed()||postLocked||S.view!=='post'||S.pstep!==1||!Number.isInteger(i)||i<0||i>=ITEM_COUNT||!Number.isInteger(v)||v<SCALE_MIN||v>SCALE_MAX)return;
  S.user.post[i]=v;postDirty=true;postMessage='사후 응답 저장 대기 중';clearTimeout(postTimer);postTimer=setTimeout(()=>flushPost().catch(()=>{}),700);S.err='';render();
}
function nextPost(){
  if(!postAllowed()||postLocked||S.view!=='post'||S.pstep!==1)return;
  const count=Array.from({length:ITEM_COUNT},(_,i)=>S.user.post?.[i]).filter(v=>!Number.isInteger(v)||v<SCALE_MIN||v>SCALE_MAX).length;
  if(count){S.err='아직 답하지 않은 문항이 '+count+'개 있습니다.';render();return}
  S.user.sat ||= {};satIssues=[];S.err='';S.pstep=2;render();window.scrollTo(0,0);
}
const satScores=['q1','q2','q3a','q3b','q3c','q5fit'];
const satChoices=['d32','d33','d34','d35','q7'];
function satActive(){return postAllowed()&&!postLocked&&!postSubmitting&&S.view==='post'&&S.pstep===2&&full(S.user.post)}
function touchSat(){postDirty=true;postMessage='사후 응답 저장 대기 중';clearTimeout(postTimer);postTimer=setTimeout(()=>flushPost().catch(()=>{}),700)}
function setSatScore(key,value){
  if(!satActive()||!satScores.includes(key)||!Number.isInteger(value)||value<SCALE_MIN||value>SCALE_MAX)return;
  S.user.sat[key]=value;satIssues=satIssues.filter(k=>k!==key);S.err='';touchSat();render();
}
function toggleSat(key,index){
  const path='sat.'+key;
  if(!satActive()||!satChoices.includes(key)||!Number.isInteger(index)||index<0||index>=OPT[path].length)return;
  const value=OPT[path][index],selected=Array.isArray(S.user.sat[key])?[...S.user.sat[key]]:[],at=selected.indexOf(value);
  if(at>=0)selected.splice(at,1);
  else if(LIM[path]===1)selected.splice(0,selected.length,value);
  else if(selected.length<LIM[path])selected.push(value);
  else {toast('선택 가능한 개수를 초과했습니다.');return}
  S.user.sat[key]=selected;satIssues=satIssues.filter(k=>k!==key);S.err='';touchSat();render();
}
function setSatText(value){if(satActive()&&typeof value==='string'&&value.length<=200){S.user.sat.q7txt=value;touchSat();postBadge()}}
function checkSat(){
  if(!satActive())return;
  const t=S.user.sat;
  satIssues=satScores.filter(k=>!Number.isInteger(t[k])||t[k]<SCALE_MIN||t[k]>SCALE_MAX);
  for(const key of satChoices){
    const path='sat.'+key,values=t[key],min=key==='d33'?LIM[path]:1;
    if(!Array.isArray(values)||values.length<min||values.length>LIM[path]||new Set(values).size!==values.length||values.some(v=>!OPT[path].includes(v)))satIssues.push(key);
  }
  if(t.q7txt!==undefined&&(typeof t.q7txt!=='string'||t.q7txt.length>200)&&!satIssues.includes('q7'))satIssues.push('q7');
  if(satIssues.length){S.err='응답하지 않았거나 확인이 필요한 문항이 '+satIssues.length+'개 있습니다.';render();document.getElementById('sat-'+satIssues[0])?.focus();return}
  S.err='';S.pstep=3;render();window.scrollTo(0,0);
}
function backSat(){if(postAllowed()&&!postLocked&&!postSubmitting&&S.view==='post'&&S.pstep===3&&full(S.user.post)){S.pstep=2;S.err='';render()}}
async function submitPost(){
  if(!postAllowed()||postLocked||postSubmitting||S.view!=='post'||S.pstep!==3||!full(S.user.post)||!validSat(S.user.sat,true))return;
  const run=epoch;postSubmitting=true;S.err='';render();
  try{
    // The submitted answers must be the ones the server holds; save first and stop on any failure.
    postDirty=true;await flushPost();if(run!==epoch)return;
    const answers={post:[...S.user.post],sat:structuredClone(S.user.sat)};
    const data=await api.write('post-submit',{answers,expectedUpdatedAt:postUpdatedAt});if(run!==epoch)return;
    if(data.status!=='submitted'||!validPost(data.answers?.post)||JSON.stringify(data.answers.post)!==JSON.stringify(answers.post)||!validSat(data.answers?.sat,true)||!sameSat(data.answers.sat,answers.sat)||
       typeof data.updatedAt!=='string'||!Number.isFinite(Date.parse(data.updatedAt))||typeof data.submittedAt!=='string'||!Number.isFinite(Date.parse(data.submittedAt)))throw Error('제출 결과를 확인하지 못했습니다. 제출되었는지 확인하려면 다시 접속해 주세요.');
    postUpdatedAt=data.updatedAt;postLocked=true;postDirty=false;postMessage='사후 진단이 제출되었습니다.';
  }catch(error){if(run===epoch)S.err=error.message||'제출하지 못했습니다. 다시 시도해 주세요.'}
  finally{if(run===epoch){postSubmitting=false;render();window.scrollTo(0,0)}}
}
function postConfirmView(){
  if(postLocked)return `<div class="narrow mobile-survey" style="padding-top:20px"><div class="card"><h2>사후 진단 제출이 완료되었습니다</h2><p class="sub">사후 진단과 만족도 응답이 제출되었습니다. 제출한 응답은 수정할 수 없습니다.</p><div class="acts"><button class="btn ghost" onclick="leavePost()">처음 화면으로</button></div></div></div>`;
  return `<div class="narrow mobile-survey" style="padding-top:20px"><div class="card"><h2>최종 제출 확인</h2><p>사후 진단 15문항과 만족도 응답을 모두 확인했습니다. 제출하면 응답을 수정할 수 없습니다.</p><p>임시저장 상태</p><p id="post-save-status" role="status">${esc(postMessage)}</p><div class="acts"><button class="btn ghost" onclick="backSat()" ${postSubmitting?'disabled':''}>만족도 응답으로 돌아가기</button><button class="btn ghost" onclick="backPost()" ${postSubmitting?'disabled':''}>사후 진단으로 돌아가기</button><button class="btn mint" onclick="submitPost()" ${postSubmitting?'disabled aria-busy="true"':''}>${postSubmitting?'제출 중…':S.err?'다시 제출':'최종 제출'}</button></div></div></div>`;
}
function leavePost(){if(!postAllowed()||S.view!=='post')return;clearPostEntry();S.mode2='pre';S.view='home';S.err='';render();window.scrollTo(0,0)}
function render(){
  mobileSurvey.capture();mobileSurvey.prepare();
  unmountRegistration?.();unmountRegistration=null;
  if(!profile){registrationContext=null;mustChangePassword=false}
  $('.seg')?.remove();
  $('.proto-note').textContent=profile?'세컨플래닝 · '+({counselor:'상담사',admin:'관리자',participant:'내담자'}[profile.role]):'계정으로 로그인해 주세요.';
  let html;
  if(restoring)html='<div class="narrow"><p role="status">로그인 세션을 확인하고 있습니다.</p></div>';
  else if(!profile)html=(postEntry&&postTestGate?'<div class="narrow noprint"><p id="post-entry-hint" role="status">사후진단 안내 링크로 접속했습니다. 기존 아이디와 비밀번호로 로그인하면 사후진단으로 이동합니다.</p></div>':'')+loginView();
  else if(mustChangePassword)html=passwordChangeView();
  else if(profile.role==='admin'&&S.view==='admin-report'&&reportHTML)html=`<div class="narrow noprint"><div class="toolbar" id="admin-report-kind" role="group" aria-label="보고서 종류"><span>${S.res?.role==='p'?'내담자용 3쪽':'상담사용 5쪽'}</span><div class="acts"><button class="btn ghost sm" aria-pressed="${S.res?.role==='c'}" onclick="openAdminReport('${esc(S.res?.id)}','c')">상담사용 5쪽</button><button class="btn ghost sm" aria-pressed="${S.res?.role==='p'}" onclick="openAdminReport('${esc(S.res?.id)}','p')">내담자용 3쪽</button><button class="btn ghost sm" onclick="nav('admin')">관리자 참여자 목록</button></div></div></div>`+reportHTML;
  else if(profile.role==='admin')html=`<div class="wrap" style="padding-top:26px"><h2>관리자 참여자 등록</h2><div class="acts"><button class="btn ghost" onclick="logout()">로그아웃</button></div><section class="card sec" id="admin-progress" aria-label="진단 진행 현황">${adminProgressView(progress)}</section><section class="card sec" id="admin-directory" aria-label="운영 관리">${adminDirectoryView(directory)}</section><section class="card sec" id="admin-aggregate" aria-label="통합 분석보고서">${adminAggregateView(aggregate)}</section><section class="card sec"><h2>내담자 진단 접속 주소</h2><p>현재 주소: ${esc(assessmentUrl||'미설정')}</p><div class="field"><label for="assessment-url">진단 접속 주소 (HTTPS) · https://로 시작하는 주소</label><input class="in" id="assessment-url" type="url" value="${esc(assessmentUrlInput)}"></div><button class="btn" onclick="saveAssessmentUrl()">주소 저장</button><p role="status">${esc(assessmentUrlMessage)}</p></section><div id="live-registration"></div></div>`;
  else if(S.view==='post'&&postAllowed())html=postLocked?postConfirmView():S.pstep===1||!full(S.user.post)?view.vPost(postMessage):S.pstep===2?view.vSat(satIssues,postMessage):postConfirmView();
  else if(S.view==='wizard')html=`<div class="narrow noprint"><p id="live-save" role="status">${esc(saveMessage)}</p>${profile.role==='participant'?'<div class="acts"><button class="btn ghost sm" onclick="retrySave()">지금 임시저장</button><button class="btn ghost sm" onclick="logout()">로그아웃</button></div>':''}</div>`+view.vWizard();
  else if(profile.role==='counselor'&&S.view==='result')html=`<div class="narrow noprint"><div class="toolbar" id="live-report-kind" role="group" aria-label="보고서 종류"><span>${S.res?.role==='p'?'내담자용 3쪽':'상담사용 5쪽'}</span><div class="acts"><button class="btn ghost sm" aria-pressed="${S.res?.role==='c'}" onclick="openRes('${esc(S.res?.id)}','c')">상담사용 5쪽</button><button class="btn ghost sm" aria-pressed="${S.res?.role==='p'}" onclick="openRes('${esc(S.res?.id)}','p')">내담자용 3쪽</button><button class="btn ghost sm" onclick="nav('cns')">담당 내담자 목록</button></div></div></div>`+reportHTML;
  else if(profile.role==='counselor'&&S.view==='compare'&&compareData)html=compareView({record:byId(compareData.participantId),data:compareData,pname});
  else if(profile.role==='counselor')html=counselorView({profile,records,counselorFilter,pname,assessmentUrl,postAvailable});
  else html=S.user.status==='submitted'
    ?`<div class="narrow" style="padding-top:34px"><div class="card"><h2>${esc(pname(S.user))}님, 제출이 완료되었습니다</h2><p class="sub">전체 응답과 진단 결과가 저장되었습니다. 결과는 담당 상담사가 안내합니다.</p>${postTestGate?`<button class="btn mint" onclick="startPost()" ${postApproved?'':'disabled'}>사후진단 실시</button> `:''}${postTestGate&&!postApproved?'<p class="hintline" id="post-approval-hint">담당 상담사가 사후진단을 허용하면 참여할 수 있습니다.</p>':''}<button class="btn ghost" onclick="logout()">로그아웃</button></div></div>`
    :`<div class="narrow" style="padding-top:34px"><div class="card"><h2>설문 작성 중</h2><p class="sub">${esc(saveMessage)}</p><div class="acts"><button class="btn" onclick="nav('wizard')">이어서 작성</button><button class="btn ghost" onclick="logout()">로그아웃</button></div></div></div>`;
  if(profile&&S.err)html=`<div class="narrow err noprint" role="alert">${esc(S.err)}</div>`+html;
  $('#app').innerHTML=html;
  mobileSurvey.mount();
  const registration=$('#live-registration');
  if(registration&&registrationContext&&!busy){const run=epoch;unmountRegistration=mountParticipantRegistration(registration,{context:registrationContext,resultState:registrationResults,register:body=>api.register(body),onBusy:value=>{if(run===epoch)busy=value}})}
  // The shared server report keeps the counselor's edit button; editing is counselor-only.
  if(profile?.role==='admin'&&S.view==='admin-report')$('#app').querySelectorAll('[onclick^="startEdit"]').forEach(e=>e.remove());
  if(busy)$('#app').querySelectorAll('input,button,select,textarea').forEach(e=>e.disabled=true);
}
function editable(){return !busy&&!mustChangePassword&&profile&&(profile.role==='participant'?S.user?.status!=='submitted':!!S.cedit)}
const handlers={doLogin,changePassword,logout,refresh,saveAssessmentUrl,openRes,openAdminReport,openCompare,render,nav,filterCounselor,goHome:()=>nav(profile?.role==='counselor'?'cns':'home'),
  startPost,answerPost,nextPost,leavePost,submitPost,setSatScore,toggleSat,setSatText,checkSat,backSat,savePost:async()=>{if(postAllowed()&&S.view==='post')try{await flushPost()}catch{}},backPost:()=>{if(postAllowed()&&!postLocked&&!postSubmitting&&S.view==='post'){S.pstep=1;S.err='';render()}},
  retrySave:async()=>{if(!busy){dirty=true;try{await flushDraft()}catch{}}},
  startEdit:id=>{if(!busy&&profile?.role==='counselor'&&byId(id)?.status==='submitted')edits.startEdit(id)},
  cancelEdit:()=>{if(!busy&&S.cedit){S.err='';edits.cancelEdit()}},
  saveEdit:()=>{if(editable())edits.saveEdit()},
  submitPre:()=>{if(editable()&&profile.role==='participant')survey.submitPre()},
  fmtDate:view.fmtDate,fmtPhone:view.fmtPhone,a2Hint:view.a2Hint
};
for(const name of ['setF','setCareer','toggleChip','answer','goStep','goQ','nextFrom','setConsent','setBirth'])handlers[name]=(...args)=>{if(editable())return survey[name](...args)};
for(const name of ['goStep','goQ','nextFrom'])handlers[name]=(...args)=>{if(editable())return mobileSurvey[name](...args)};
handlers.mobilePrevious=()=>{if(editable())mobileSurvey.previous()};
handlers.mobileNext=()=>{if(editable())mobileSurvey.next()};
// Only UI handlers are global; tokens, records, roles and engines are not.
Object.assign(window,handlers);
$('#app').addEventListener('click',async event=>{
  const button=event.target.closest('[data-copy-notice]');
  if(!button||button.disabled||busy||profile?.role!=='counselor'||S.view!=='cns')return;
  const participant=byId(button.dataset.copyNotice),status=$('#copy-notice-status');
  if(!participant?.nick||!participant.loginId||!assessmentUrl||!status)return;
  try{await navigator.clipboard.writeText(assessmentNotice({displayName:participant.nick,loginId:participant.loginId},assessmentUrl,{existing:true}));status.textContent='사전진단 안내문을 복사했습니다.'}
  catch{status.textContent='안내문을 복사하지 못했습니다. 클립보드 권한을 확인해 주세요.'}
});
$('#app').addEventListener('click',async event=>{
  const button=event.target.closest('[data-copy-post-notice]');
  if(!button||button.disabled||busy||profile?.role!=='counselor'||S.view!=='cns'||!postAvailable)return;
  const participant=byId(button.dataset.copyPostNotice),status=$('#copy-notice-status'),postUrl=postEntryUrl(assessmentUrl);
  if(!status)return;
  if(!participant||participant.status!=='submitted'||participant.postStatus==='submitted'||!participant.postApproved||!participant.nick||!participant.loginId||!postUrl){status.textContent='사후진단 안내문을 복사할 수 없는 상태입니다.';return}
  try{await navigator.clipboard.writeText(postAssessmentNotice({displayName:participant.nick,loginId:participant.loginId},postUrl,ITEM_COUNT));status.textContent='사후진단 안내문을 복사했습니다.'}
  catch{status.textContent='사후진단 안내문을 복사하지 못했습니다. 클립보드 권한을 확인해 주세요.'}
});
$('#app').addEventListener('click',event=>{
  const button=event.target.closest('[data-admin-progress="refresh"]');
  if(!button||button.disabled||busy||progress.loading||profile?.role!=='admin')return;
  loadProgress();
});
$('#app').addEventListener('click',event=>{
  const button=event.target.closest('[data-admin-directory="refresh"]');
  if(!button||button.disabled||busy||directory.loading||profile?.role!=='admin')return;
  loadDirectory();
});
$('#app').addEventListener('click',event=>{
  const button=event.target.closest('[data-admin-report]');
  if(!button||button.disabled||busy||profile?.role!=='admin')return;
  openAdminReport(button.dataset.adminReport,button.dataset.kind);
});
$('#app').addEventListener('click',event=>{
  const button=event.target.closest('[data-admin-aggregate="load"]');
  if(!button||button.disabled||busy||aggregate.loading||profile?.role!=='admin')return;
  loadAggregate(aggregate.data?.company??null);
});
$('#app').addEventListener('click',event=>{
  const tab=event.target.closest('[data-agg-tab]');
  if(!tab||tab.disabled||busy||aggregate.loading||!aggregate.data||profile?.role!=='admin'||!['r1','r2','r3','r4','r5','r6','r7','r8','r9'].includes(tab.dataset.aggTab))return;
  aggregate.tab=tab.dataset.aggTab;paintAggregate();$(`#admin-aggregate [data-agg-tab="${aggregate.tab}"]`)?.focus();
});
$('#app').addEventListener('change',event=>{
  const select=event.target.closest('[data-aggregate-company]');
  if(!select||busy||aggregate.loading||profile?.role!=='admin')return;
  loadAggregate(select.value||null);
});
$('#app').addEventListener('change',event=>{
  const key=event.target.closest('[data-directory-filter]')?.dataset.directoryFilter;
  if(!key||!['company','counselor','status'].includes(key)||busy||!directory.data||profile?.role!=='admin')return;
  directory.filter={...directory.filter,[key]:event.target.value};paintDirectory();
  $(`#admin-directory [data-directory-filter="${key}"]`)?.focus();
});
// DEV-014: the assigned counselor allows the post assessment once. There is no undo, so confirm first.
$('#app').addEventListener('click',async event=>{
  const button=event.target.closest('[data-approve-post]');
  if(!button||button.disabled||busy||profile?.role!=='counselor'||S.view!=='cns'||!postAvailable||S.cedit)return;
  const participant=byId(button.dataset.approvePost);
  if(!participant||participant.status!=='submitted'||participant.postStatus==='submitted'||participant.postApproved)return;
  if(!window.confirm(`${pname(participant)||'내담자'}님의 사후진단을 허용할까요?\n허용하면 내담자가 사후진단에 참여할 수 있으며, 허용은 취소할 수 없습니다.`))return;
  const run=epoch;let done=false;busy=true;S.err='';render();
  try{
    const data=await api.write('post-approve',{participantId:participant.id});if(run!==epoch)return;
    if(data?.participantId!==participant.id||typeof data.approvedAt!=='string'||!Number.isFinite(Date.parse(data.approvedAt)))throw Error('사후진단 허용 여부를 확인하지 못했습니다. 새로 조회해 상태를 확인해 주세요.');
    hydrate(await api.read());if(run!==epoch)return;done=true;
  }catch(error){if(run===epoch&&profile)S.err=error.message}
  finally{if(run===epoch){busy=false;render();const status=$('#copy-notice-status');if(done&&status)status.textContent='사후진단을 허용했습니다. 이제 사후진단 안내문을 복사할 수 있습니다.'}}
});
function fitSheets(on){document.querySelectorAll('.sheet').forEach(el=>{el.style.zoom='';el.style.width='';el.style.maxWidth='';if(!on||el.classList.contains('noprintpage'))return;const W=733,H=1000;el.style.maxWidth='none';el.style.width=W+'px';let z=Math.min(1,H/el.scrollHeight);for(let k=0;k<3&&z<1;k++){el.style.width=(W/z)+'px';z=Math.min(1,H/el.scrollHeight)}if(z<1){el.style.width=(W/z)+'px';z=Math.min(z,H/el.scrollHeight);el.style.zoom=String(z)}else el.style.width=''})}
window.addEventListener('beforeprint',()=>fitSheets(true));window.addEventListener('afterprint',()=>fitSheets(false));
window.addEventListener('beforeunload',e=>{if(dirty||saving||postDirty||postSaving){e.preventDefault();e.returnValue=''}});
reset();render();
(async()=>{
  try{const data=await api.restore();if(data)openAccount(data)}
  catch{api.clear();reset();S.err='세션을 확인하지 못했습니다. 다시 로그인해 주세요.'}
  finally{restoring=false;render()}
  await enterPostFromLink();
})();
