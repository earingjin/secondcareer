import {S} from '../shared/state.js';
import {OPT,LIM} from '../js/03-options.js';
import {ITEM_COUNT,SCALE_MIN,SCALE_MAX} from '../js/02-eval-config.js';
import {createSurvey} from '../roles/participant/survey.js';
import {createSurveyView} from './survey-view.js';
import {createMobileSurvey} from './mobile-survey.js';
import {resolveConfig,requestTarget} from './config.js';
import {esc,getPath,setPath} from './fields.js';
import {toast} from '../browser/dom.js';

const linkId=new URLSearchParams(location.search).get('linkId');
const validId=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const storageKey='sp-public-intake:'+linkId;
let capability=null,version=0,phase='loading',message='',dirty=false,timer=null,saving=null,pending=null,submitting=false;
const answers=()=>structuredClone({reg:S.user.reg,goal:S.user.goal,expect:S.user.expect,done:S.user.done,pre:S.user.pre});
const agreed=()=>S.user?.reg?.a1==='동의'||(S.user?.reg?.a1==null&&S.user?.reg?.consent===true);
const view=createSurveyView({anonymous:true,missing:p=>survey.missing(p),pname:p=>p.reg?.name||''});
const survey=createSurvey({anonymous:true,save,render,nav:()=>{},toast,getPath,setPath,OPT,LIM,ITEM_COUNT,...view,full:a=>Array.isArray(a)&&a.length===ITEM_COUNT&&a.every(v=>Number.isInteger(v)&&v>=SCALE_MIN&&v<=SCALE_MAX),submitAssessment:submit});
const mobile=createMobileSurvey({anonymous:true,getProfile:()=>null,steps:view.WSTEPS,missing:survey.missing,goStep:survey.goStep,goQ:survey.goQ,nextFrom:survey.nextFrom,render,toast});
function badge(){const el=document.getElementById('public-save');if(el)el.textContent=message}
function render(){
 mobile.capture();mobile.prepare();const root=document.getElementById('app');
 if(phase==='done')root.innerHTML='<div class="narrow"><div class="card"><h2>설문 제출이 완료되었습니다</h2><p>설문 제출이 완료되었습니다. 제출하신 응답은 담당자가 확인한 후 상담사에게 전달됩니다.</p></div></div>';
 else if(phase!=='ready')root.innerHTML=`<div class="narrow"><div class="card"><p role="alert">${esc(message||'설문을 불러오고 있습니다.')}</p>${phase==='error'?'<button class="btn" onclick="publicRetry()">다시 확인</button>':''}</div></div>`;
 else root.innerHTML=`<div class="narrow"><p id="public-save" role="status">${esc(message)}</p><button class="btn ghost sm" onclick="publicRetry()">저장 재시도</button></div>`+view.vWizard();
 if(phase==='ready')mobile.mount();
}
function persist(){sessionStorage.setItem(storageKey,JSON.stringify(capability))}
function token(){const b=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}
async function api(action,extra={}){
 const config=resolveConfig(import.meta.env);
 const r=await fetch(requestTarget(config,'/functions/v1/secondcareer-public-assessment'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,linkId,intakeId:capability.intakeId,accessToken:capability.accessToken,...extra})});
 let data;try{data=await r.json()}catch{throw Error('서버 응답을 확인하지 못했습니다.')}
 if(!r.ok){const labels={NOT_FOUND:'링크 또는 접수가 만료되었거나 사용할 수 없습니다.',RATE_LIMITED:'요청이 많습니다. 잠시 후 다시 시도해 주세요.',CONFLICT:'다른 화면에서 응답이 변경되었습니다. 새로고침하여 저장된 내용을 확인해 주세요.',LOCKED:'이미 제출된 응답입니다. 상태를 다시 확인해 주세요.',CONSENT_REQUIRED:'개인정보 동의 후 저장할 수 있습니다.'};throw Error(labels[data?.error]||'서버 요청을 완료하지 못했습니다. 다시 확인해 주세요.')}
 if(!data||data.intakeId!==capability.intakeId||!['draft','submitted'].includes(data.status)||!Number.isSafeInteger(data.version)||data.version<0||typeof data.expiresAt!=='string'||!Number.isFinite(Date.parse(data.expiresAt)))throw Error('서버 응답을 확인하지 못했습니다.');
 return data;
}
function save(){if(phase!=='ready'||submitting||!agreed())return;dirty=true;message='저장 대기 중 · 응답이 아직 저장되지 않았습니다.';badge();clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),700)}
async function flush(){
 clearTimeout(timer);if(saving){await saving;if(dirty)return flush();return}if(!dirty||!agreed())return;
 if(!pending)pending={action:'draft',requestId:crypto.randomUUID(),version,answers:answers()};
 const request=pending;dirty=false;message='응답을 저장하고 있습니다…';badge();
 saving=(async()=>{try{const d=await api('draft',request);if(d.status!=='draft')throw Error('임시저장 상태를 확인해 주세요.');version=d.version;pending=null;message=dirty?'새 응답 저장 대기 중':'임시저장 완료';badge()}catch(e){dirty=true;message=e.message;badge();throw e}finally{saving=null}})();
 await saving;if(dirty)await flush();
}
async function submit(){
 if(submitting)return;submitting=true;clearTimeout(timer);
 try{await flush();const request={requestId:capability.submitRequestId||crypto.randomUUID(),version,answers:answers()};capability.submitRequestId=request.requestId;persist();
  let d;try{d=await api('submit',request)}catch(e){try{d=await api('status')}catch{}if(d?.status!=='submitted'){message='제출 결과를 확인하지 못했습니다. 다시 확인해 주세요.';badge();return}}
  if(d.status!=='submitted')throw Error('제출 결과를 확인하지 못했습니다.');version=d.version;phase='done';dirty=false;render();
 }catch(e){message=e.message;badge()}finally{submitting=false}
}
async function initialize(){
 if(!validId(linkId)){phase='error';message='설문 링크가 올바르지 않습니다. 링크를 다시 확인해 주세요.';render();return}
 try{
  phase='loading';message='설문을 불러오고 있습니다.';render();let existing=false;
  const raw=sessionStorage.getItem(storageKey);if(raw){capability=JSON.parse(raw);existing=true;if(!validId(capability.intakeId)||!validId(capability.startRequestId)||!/^[A-Za-z0-9_-]{43}$/.test(capability.accessToken))throw Error('저장된 접수 정보를 확인할 수 없습니다.');}
  else{capability={intakeId:crypto.randomUUID(),startRequestId:crypto.randomUUID(),accessToken:token()};persist()}
  let d;if(existing){try{d=await api('read')}catch{d=await api('start',{requestId:capability.startRequestId})}}else d=await api('start',{requestId:capability.startRequestId});
  version=d.version;if(d.status==='submitted'){phase='done';render();return}
  const initial={reg:{careers:[{},{},{}],consent:false},goal:{},expect:{},done:{reg:false,goal:false,expect:false},pre:Array(ITEM_COUNT).fill(null)};
  if(d.answers!==undefined&&d.answers!==null){const a=d.answers;if(!a.reg||!a.goal||!a.expect||!a.done||!Array.isArray(a.pre)||a.pre.length!==ITEM_COUNT)throw Error('저장된 응답을 확인하지 못했습니다.');Object.assign(initial,a)}
  S.user={...initial,status:'draft'};S.view='wizard';S.mode2='pre';S.step=0;S.showMiss={};phase='ready';message=d.answers?'임시저장 응답을 불러왔습니다.':'설문을 시작합니다.';mobile.reset();render();
 }catch(e){phase='error';message=e.message||'서버에 연결할 수 없습니다.';render()}
}
window.addEventListener('beforeunload',e=>{if(dirty||saving||pending||submitting){e.preventDefault();e.returnValue=''}});
window.publicRetry=()=>{if(phase==='error')void initialize();else if(phase==='ready')void flush().catch(()=>{})};
for(const name of ['setF','setCareer','toggleChip','answer','setConsent','setBirth'])window[name]=(...args)=>{if(phase==='ready'&&!submitting&&(name==='setConsent'||agreed())){if(name==='setConsent'&&args[0]!=='동의'){clearTimeout(timer);dirty=false;pending=null;message='동의하지 않아 임시저장을 중단했습니다.'}return survey[name](...args)}};
for(const name of ['goStep','goQ','nextFrom'])window[name]=(...args)=>{if(phase==='ready'&&!submitting&&(name==='goStep'&&args[0]===0||agreed()))return mobile[name](...args)};
window.mobilePrevious=()=>mobile.previous();window.mobileNext=()=>mobile.next();window.submitPre=()=>{if(phase==='ready'&&!submitting)survey.submitPre()};window.render=render;window.a2Hint=()=>{};
void initialize();
