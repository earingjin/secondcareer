import {S} from '../shared/state.js';
import {OPT,LIM,COUNSELORS,setCounselors} from '../js/03-options.js';
import {ITEM_COUNT,SCALE_MIN,SCALE_MAX} from '../js/02-eval-config.js';
import {createSurvey} from '../roles/participant/survey.js';
import {createCounselorEdit} from '../shared/counselor-edit.js';
import {createSurveyView} from './survey-view.js';
import {createAPI} from './api.js';
import {loginView,passwordChangeView} from './login-view.js';
import {mountParticipantRegistration} from './participant-registration.js';
import {counselorView} from './counselor-view.js';
import {esc,getPath,setPath} from './fields.js';
import {$,toast} from '../browser/dom.js';

let profile=null,records=[],participants=[],reportHTML='',busy=false,dirty=false;
let saveTimer=null,saving=null,epoch=0,saveMessage='서버에서 조회한 응답입니다.';
let counselorFilter={name:'',status:'all'};
let registrationContext=null,unmountRegistration=null,mustChangePassword=false;
const api=createAPI(()=>{reset();S.err='세션이 만료되었습니다. 다시 로그인해 주세요.';render()});
const byId=id=>records.find(p=>p.id===id),pname=p=>p.reg?.name||p.nick;
const view=createSurveyView({missing:p=>survey.missing(p),pname});
const full=a=>Array.isArray(a)&&a.length===ITEM_COUNT&&a.every(v=>Number.isInteger(v)&&v>=SCALE_MIN&&v<=SCALE_MAX);
const survey=createSurvey({save,render,nav,toast,getPath,setPath,OPT,LIM,ITEM_COUNT,...view,full,today:()=>new Date().toISOString().slice(0,10),submitAssessment:submit});
const edits=createCounselorEdit({byId,getDB:()=>records,save:()=>{},nav,render,toast,missing:survey.missing,ansText:view.ansText,getWSTEPS:()=>view.WSTEPS,getCounselors:()=>COUNSELORS,persistEdit, EVAL_VERSION:'',toAssessment:()=>null});

function reset(){epoch++;clearTimeout(saveTimer);profile=null;records=[];participants=[];setCounselors({});S.user=null;S.cedit=null;S.res=null;S.mode='participant';S.mode2='pre';S.view='login';S.step=0;S.showMiss={};busy=false;dirty=false;reportHTML='';saving=null;counselorFilter={name:'',status:'all'}}
function hydrate(data){
  if(!data.profile||!['participant','counselor','admin'].includes(data.profile.role)||!Array.isArray(data.participants)||!Array.isArray(data.assessments))throw Error('권한 또는 조회 응답이 올바르지 않습니다.');
  profile=data.profile;mustChangePassword=data.mustChangePassword===true;participants=data.participants;setCounselors(data.assessmentCounselors||{});
  registrationContext=data.registrationAvailable===false?null:{profile,counselors:Array.isArray(data.counselors)?data.counselors:[],organizationName:data.organizationName||'',defaultCounselorId:''};
  records=participants.map(p=>{
    const a=data.assessments.find(a=>a.participant_id===p.id&&a.phase==='pre');
    return {id:p.id,nick:p.display_name,company:p.company_name||a?.answers?.reg?.careers?.[0]?.co||'',reg:{careers:[{co:p.company_name||''},{},{}],phone:view.fmtPhone(p.phone||''),consent:false},goal:{},expect:{},pre:Array(ITEM_COUNT).fill(null),post:null,done:{reg:false,goal:false,expect:false},...a?.answers,counselor:p.counselor_user_id,status:a?.status||'draft',submittedAt:a?.submitted_at||null,preDate:a?.dateOfAssessment||null,_updatedAt:a?.updated_at||null,_assessmentId:a?.id||null};
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
  if(busy||mustChangePassword)return;
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
    if(mustChangePassword)S.view='password';
    else if(profile.role==='participant'){
      if(records.length!==1)throw Error('내담자 배정 정보를 확인하지 못했습니다.');
      S.user=records[0];S.step=0;S.view=S.user.status==='submitted'?'home':'wizard';
    }else S.view='cns';
    saveMessage='서버에서 조회한 응답입니다.';
  }catch(e){api.clear();reset();S.err=e.message}finally{busy=false;render();if(profile?.role==='counselor')window.scrollTo(0,0)}
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
    S.user=records[0];S.step=0;S.view=S.user.status==='submitted'?'home':'wizard';
  }catch(error){S.err=error.message}finally{busy=false;render()}
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
function filterCounselor(clear=false){
  if(busy||profile?.role!=='counselor'||S.view!=='cns')return;
  counselorFilter=clear?{name:'',status:'all'}:{name:$('#cns-name').value.trim(),status:$('#cns-status').value};
  render();
}
function render(){
  unmountRegistration?.();unmountRegistration=null;
  if(!profile){registrationContext=null;mustChangePassword=false}
  $('.seg')?.remove();
  $('.proto-note').textContent=profile?'Supabase 실연동 · 서버에 저장된 실제 응답 · '+({counselor:'상담사',admin:'관리자',participant:'내담자'}[profile.role]):'Supabase 실연동 · 계정으로 로그인해 주세요.';
  let html;
  if(!profile)html=loginView();
  else if(mustChangePassword)html=passwordChangeView();
  else if(profile.role==='admin')html=`<div class="wrap" style="padding-top:26px"><h2>관리자 참여자 등록</h2><div class="acts"><button class="btn ghost" onclick="logout()">로그아웃</button></div><div id="live-registration"></div></div>`;
  else if(S.view==='wizard')html=`<div class="narrow noprint"><p id="live-save" role="status">${esc(saveMessage)}</p>${profile.role==='participant'?'<div class="acts"><button class="btn ghost sm" onclick="retrySave()">지금 임시저장</button><button class="btn ghost sm" onclick="logout()">로그아웃</button></div>':''}</div>`+view.vWizard();
  else if(profile.role==='counselor'&&S.view==='result')html=reportHTML;
  else if(profile.role==='counselor')html=counselorView({profile,records,counselorFilter,pname});
  else html=S.user.status==='submitted'
    ?`<div class="narrow" style="padding-top:34px"><div class="card"><h2>${esc(pname(S.user))}님, 제출이 완료되었습니다</h2><p class="sub">전체 응답과 서버 계산 결과가 저장되었습니다. 결과는 담당 상담사가 안내합니다.</p><button class="btn ghost" onclick="logout()">로그아웃</button></div></div>`
    :`<div class="narrow" style="padding-top:34px"><div class="card"><h2>설문 작성 중</h2><p class="sub">${esc(saveMessage)}</p><div class="acts"><button class="btn" onclick="nav('wizard')">이어서 작성</button><button class="btn ghost" onclick="logout()">로그아웃</button></div></div></div>`;
  if(profile&&S.err)html=`<div class="narrow err noprint" role="alert">${esc(S.err)}</div>`+html;
  $('#app').innerHTML=html;
  const registration=$('#live-registration');
  if(registration&&registrationContext&&!busy){const run=epoch;unmountRegistration=mountParticipantRegistration(registration,{context:registrationContext,register:body=>api.register(body),onBusy:value=>{if(run===epoch)busy=value}})}
  if(busy)$('#app').querySelectorAll('input,button,select,textarea').forEach(e=>e.disabled=true);
}
function editable(){return !busy&&!mustChangePassword&&profile&&(profile.role==='participant'?S.user?.status!=='submitted':!!S.cedit)}
const handlers={doLogin,changePassword,logout,refresh,openRes,render,nav,filterCounselor,goHome:()=>nav(profile?.role==='counselor'?'cns':'home'),
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
