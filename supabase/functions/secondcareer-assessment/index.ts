
import {createClient} from "npm:@supabase/supabase-js@2.95.0";
import {QUESTION_DEFS,qdRequired,qdStepCodes,qdOptions,qdText} from "./js/00-question-defs-module.js";
import {COUNSELORS,setCounselors,OPT,LIM} from "./js/03-options.js";
import {ITEM_COUNT,SCALE_MIN,SCALE_MAX,RAW_MIN,RAW_MAX,toScore,GRADE_SETS,ACTIVE_GRADE,EVAL_VERSION} from "./js/02-eval-config.js";
import {esc,today,areaScores} from "./js/04-util.js";
import {computeResult,recomputeResultCore,full} from "./js/05-engine.js";
import {S} from "./shared/state.js";
import {createProfile} from "./shared/profile.js";
import {participantAccessError} from "./shared/participant-access.ts";
const h={"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Cache-Control":"no-store"};
const out=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:h});
const REQUIRED=qdRequired(),C_CODES=qdStepCodes(3),stepOf=c=>QUESTION_DEFS.find(q=>q.code===c)?.step;
const agreed=p=>!!p.reg&&(p.reg.a1==='동의'||(p.reg.a1==null&&p.reg.consent===true));
function parseBirth(v){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v||''));if(!m)return null;const y=+m[1],mo=+m[2],d=+m[3],dt=new Date(y,mo-1,d);if(dt.getFullYear()!==y||dt.getMonth()!==mo-1||dt.getDate()!==d)return null;if(y<1900||dt>new Date())return null;return {y,mo,d}}
const PHONE_RE=/^01[016789]-\d{3,4}-\d{4}$/,EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const sheetHead=(t)=>`<div class="sh-head"><span>일을통한행복한삶 (The better life, The Better Career)</span><span>${t||'Second Planning Leading Guide'}</span></div>`;
const sheetFoot=(n,m)=>`<div class="sh-foot"><span class="ft-l">${hdcLogo()}</span><span>Copyright © 2026 JMCAREER All rights reserved. / www.humandc.co.kr</span><span>${n} / ${m}</span></div>`;
const jmLogo=()=>`<span class="logo-jm"><svg viewBox="0 0 30 34" width="22" height="26" aria-hidden="true"><path d="M3 3h6v20c0 4 2.5 6 6 6s6-2 6-6V3h6v21c0 8-5 11-12 11S3 32 3 24z" fill="#17488F"/><path d="M11 9h4v18h-4z" fill="#2F7C82"/></svg>제이엠커리어</span>`;
const hdcLogo=()=>`<span class="logo-hdc"><svg viewBox="0 0 28 22" width="26" height="20" aria-hidden="true"><path d="M2 4h24M2 11h24M2 18h24" stroke="#2F7C82" stroke-width="4" stroke-linecap="round"/><path d="M6 4h6M12 11h8M8 18h10" stroke="#9FC4C7" stroke-width="4" stroke-linecap="round"/></svg>The Human<br>Data Center</span>`;
const leafSVG=(c)=>`<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15z" fill="${c||'#6FB39A'}"/><path d="M5 19L14 10" stroke="#fff" stroke-width="1.5" fill="none"/></svg>`;
function bandCells(ai){const c=GRADE_SETS[ACTIVE_GRADE].cut[ai],cv=r=>toScore(r).toFixed(1),b=[[RAW_MIN,c[0]],[c[0]+1,c[1]],[c[1]+1,c[2]],[c[2]+1,RAW_MAX]];return b.map(([x,y])=>`<td>${cv(x)}~${cv(y)}<br><span class="hintline">원점수 ${x}~${y}</span></td>`).join('')}
function missing(p){
 const r=p.reg||{},c0=(r.careers||[])[0]||{},g=p.goal||{},e=p.expect||{},out=[];
 const add=(code,msg)=>{if(REQUIRED[code]!==false)out.push({code,step:stepOf(code),msg})};
 const blank=v=>!String(v==null?'':v).trim();
 if(r.a1!=='동의'&&!agreed(p))add('A1',r.a1==='미동의'?'개인정보 제공 및 활용에 동의해야 설문에 참여할 수 있습니다.':'동의 여부를 선택해 주세요.');
 if(blank(p.counselor))add('A2','상담코드를 입력해 주세요.');
 if(blank(r.name))add('A3','성함을 입력해 주세요.');
 if(!r.gender)add('A4','성별을 선택해 주세요.');
 if(blank(r.birthDate))add('A5','생년월일을 입력해 주세요.');else if(!parseBirth(r.birthDate))add('A5','생년월일을 YYYY-MM-DD 형식의 실제 날짜로 입력해 주세요.');
 if(blank(r.phone))add('PH','휴대전화번호를 입력해 주세요.');else if(!PHONE_RE.test(r.phone))add('PH','휴대전화번호 형식을 확인해 주세요. (예: 010-1234-5678)');
 if(blank(r.email))add('EM','이메일을 입력해 주세요.');else if(!EMAIL_RE.test(String(r.email).trim()))add('EM','이메일 형식을 확인해 주세요. (예: name@example.com)');
 if(blank(c0.co))add('A6','소속회사를 입력해 주세요.');
 if(blank(c0.title))add('A7','직급/직책을 입력해 주세요.');
 if(blank(c0.task))add('A8','업무(부서명)를 입력해 주세요.');
 if(!r.industry)add('A9','업종을 하나 선택해 주세요.');else if(r.industry==='기타'&&blank(r.industryEtc))add('A9','기타 내용을 입력해 주세요.');
 if(!r.income)add('A10','기대 소득수준을 하나 선택해 주세요.');else if(r.income==='기타'&&blank(r.incomeEtc))add('A10','기타 내용을 입력해 주세요.');
 if(!(g.b11||[]).length)add('B11','하나를 선택해 주세요.');
 if(!(g.b12||[]).length)add('B12','하나를 선택해 주세요.');
 const b13=g.b13||[];if(b13.length!==2||b13[0]===b13[1])add('B13','서로 다른 2가지를 1순위, 2순위 순서로 선택해 주세요. (현재 '+b13.length+'개)');
 if(!(g.b14||[]).length)add('B14','하나를 선택해 주세요.');
 if(blank(g.b15))add('B15','달성 가능성을 숫자로 입력해 주세요.');else if(!/^\d{1,3}$/.test(String(g.b15).trim())||+g.b15>100)add('B15','0~100 사이 숫자로 입력해 주세요.');
 if(blank(g.b16))add('B16','예상 소요기간을 개월 수로 입력해 주세요.');else if(!/^\d{1,3}$/.test(String(g.b16).trim())||+g.b16>600)add('B16','0~600 사이 개월 수로 입력해 주세요.');
 C_CODES.forEach((c,i)=>{const v=(p.pre||[])[i];if(!(v>=1&&v<=5))add(c,'응답을 선택해 주세요.')});
 if((e.d32||[]).length!==1)add('D32','하나를 선택해 주세요.');
 const d33=e.d33||[];if(d33.length!==3||new Set(d33).size!==3)add('D33','서로 다른 3가지를 순서대로 선택해 주세요. (현재 '+d33.length+'개)');
 if((e.d34||[]).length!==1)add('D34','하나를 선택해 주세요.');
 if((e.d35||[]).length!==2)add('D35','정확히 2가지를 선택해 주세요. (현재 '+(e.d35||[]).length+'개)');
 const n36=(e.d36||[]).length;if(n36<1||n36>2)add('D36','1~2가지를 선택해 주세요.');
 return out;
}

const fields={reg:['name','gender','birthDate','birth','phone','email','careers','consent','a1','industry','industryEtc','income','incomeEtc','addr','edu','major','totalYears','salary','goal1','goal2','reason','region','wage','certs','computer','lang','hobby'],goal:['b11','b12','b13','b14','b15','b16'],expect:['d32','d33','d34','d35','d36'],done:['reg','goal','expect']};

const qLabel=(path,i,o)=>{const labels=qdOptions(path,'screen');return labels?.[i]||o};
function ansText(p,code){
  const r=p.reg||{},c0=(r.careers||[])[0]||{},g=p.goal||{},e=p.expect||{};
  const lab=(path,v)=>{const i=OPT[path].indexOf(v);return i>=0?qLabel(path,i,v):v};
  const list=(path,a,rank)=>(a||[]).map((v,i)=>(rank?(i+1)+'순위 ':'')+lab(path,v)).join(', ');
  const tag=(path,v)=>{const i=(OPT[path]||[]).indexOf(v);return v==='기타'?'기타 ('+(r[path.split('.')[1]+'Etc']||'')+')':i>=0?qLabel(path,i,v):v||''};
  if(code[0]==='C'){const v=(p.pre||[])[+code.slice(1)-17];return v?v+' · '+['전혀 아니다','아니다','보통','그렇다','매우 그렇다'][v-1]:''}
  return ({A1:agreed(p)?'동의':r.a1||'',A2:p.counselor||'',A3:r.name,A4:r.gender==='남'?'남성':r.gender==='여'?'여성':'',A5:r.birthDate,PH:r.phone,EM:r.email,A6:c0.co,A7:c0.title,A8:c0.task,
    A9:tag('reg.industry',r.industry),A10:tag('reg.income',r.income),B11:list('goal.b11',g.b11),B12:list('goal.b12',g.b12),B13:list('goal.b13',g.b13,1),B14:list('goal.b14',g.b14),
    B15:g.b15!=null&&g.b15!==''?g.b15+'%':'',B16:g.b16!=null&&g.b16!==''?g.b16+'개월':'',D32:list('expect.d32',e.d32),D33:list('expect.d33',e.d33,1),D34:list('expect.d34',e.d34),D35:list('expect.d35',e.d35),D36:list('expect.d36',e.d36)})[code]||'';
}

function sanitize(input){
 if(!input||Array.isArray(input)||typeof input!=='object')throw Error('INPUT');
 const result={};
 for(const group of Object.keys(fields)){
  const value=input[group];if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INPUT');
  result[group]={};
  for(const key of Object.keys(value)){
   if(!fields[group].includes(key))throw Error('INPUT');
   const v=value[key],path=group+'.'+key;
   if(LIM[path]&&!Array.isArray(v))throw Error('INPUT');
   if(group==='reg'&&['industry','income'].includes(key)&&v!==''&&!OPT[path].includes(v))throw Error('INPUT');
   if(group==='reg'&&key==='gender'&&!['','남','여'].includes(v))throw Error('INPUT');
   if(group==='done'||key==='consent'){if(typeof v!=='boolean')throw Error('INPUT')}
   else if(key==='careers'){
    if(!Array.isArray(v)||v.length>3||!v.every(c=>c&&typeof c==='object'&&!Array.isArray(c)&&Object.entries(c).every(([k,x])=>['co','dept','title','task','yrs'].includes(k)&&typeof x==='string'&&x.length<=200)))throw Error('INPUT');
   }else if(Array.isArray(v)){
    const path=group+'.'+key,options=OPT[path];if(!options||v.length>(LIM[path]||1)||new Set(v).size!==v.length||!v.every(x=>options.includes(x)))throw Error('INPUT');
   }else if(typeof v!=='string'||v.length>1000)throw Error('INPUT');
   result[group][key]=v;
  }
 }
 if(!Array.isArray(input.pre)||input.pre.length!==ITEM_COUNT||!input.pre.every(v=>v===null||(Number.isInteger(v)&&v>=SCALE_MIN&&v<=SCALE_MAX)))throw Error('INPUT');
 result.pre=input.pre;
 if(result.reg.birthDate){const b=parseBirth(result.reg.birthDate);if(b)result.reg.birth=String(b.y)}
 return result;
}
async function readBody(req){
 const reader=req.body?.getReader();if(!reader)throw Error('INPUT');
 let size=0,chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw Error('INPUT')}chunks.push(value)}
 const all=new Uint8Array(size);let pos=0;for(const c of chunks){all.set(c,pos);pos+=c.length}return JSON.parse(new TextDecoder().decode(all));
}
function person(part,a){
 return {id:part.id,nick:part.display_name,company:a?.answers?.reg?.careers?.[0]?.co||'',counselor:part.counselor_user_id,
 reg:{careers:[{},{},{}]},goal:{},expect:{},pre:[],...a?.answers,status:a?.status||'draft',preDate:a?.answers?.preDate||null,result:a?.result||null,history:[]};
}
function report(p,counselors,histories=[],kind='c'){
 S.res={id:p.id,role:kind};S.from=kind==='p'?'admin':'cns';S.prevEnt=null;setCounselors(counselors);
 const renderer=createProfile({byId:()=>p,pname:p=>p.reg.name||p.nick,getEntities:()=>[],entOf:()=>null,pmOf:()=>COUNSELORS[p.counselor]||null,
 resultOf:p=>p.result,backV:()=> 'cns',backLbl:()=> '담당 내담자 목록',editPanel:()=>'<div class="editpanel noprint"><h4>상담사 확인용 (인쇄되지 않음)</h4><div>실제 제출 완료 · 평가 버전 '+esc(EVAL_VERSION)+'</div><b>변경 이력 '+histories.length+'건</b><ul>'+histories.map(h=>{const before=person({id:p.id,display_name:p.nick,counselor_user_id:p.counselor},{answers:h.before_data?.answers}),after=person({id:p.id,display_name:p.nick,counselor_user_id:p.counselor},{answers:h.after_data?.answers});const changes=QUESTION_DEFS.filter(q=>q.step<5).map(q=>({code:q.code,before:ansText(before,q.code),after:ansText(after,q.code)})).filter(q=>q.before!==q.after);return '<li>'+esc(h.created_at)+' · '+changes.map(c=>esc(qdText()[c.code])+': '+esc(c.before)+' → '+esc(c.after)).join(' / ')+'</li>'}).join('')+'</ul></div>',jmLogo,hdcLogo,leafSVG,sheetHead,sheetFoot,
 etcOf:(r,k)=>r[k]==='기타'&&r[k+'Etc']?r[k+'Etc']:(r[k]||''),agreed,bandCells,chartLegend:()=>'',barsSVG:()=>''});
 return renderer.vResult(p,kind);
}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h});
 if(!['GET','POST'].includes(req.method))return out({error:'METHOD_NOT_ALLOWED'},405);
 try{
 const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];if(!token)return out({error:'AUTH_REQUIRED'},401);
 const url=Deno.env.get('SUPABASE_URL'),pub=Deno.env.get('SUPABASE_ANON_KEY'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!pub||!secret)return out({error:'SERVER_CONFIG'},503);
 const auth=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await auth.auth.getUser(token);if(authError||!user)return out({error:'AUTH_INVALID'},401);
 const accessError=participantAccessError(user);if(accessError)return out({error:accessError},403);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:me,error:meError}=await db.from('user_profiles').select('user_id,organization_id,role,display_name').eq('user_id',user.id).maybeSingle();
 if(meError)return out({error:'QUERY_FAILED'},500);
 if(!me||!['participant','counselor'].includes(me.role))return out({error:'FORBIDDEN'},403);
 let pq=db.from('participants').select('id,display_name,counselor_user_id,phone,company_name,auth_user_id').eq('organization_id',me.organization_id);
 pq=me.role==='participant'?pq.eq('auth_user_id',user.id):pq.eq('counselor_user_id',user.id);
 const {data:parts,error:partError}=await pq.limit(100);if(partError)return out({error:'QUERY_FAILED'},500);
 const ids=(parts||[]).map(p=>p.id);
 let assessments=[];
 if(ids.length){const {data,error}=await db.from('assessments').select('id,participant_id,phase,status,answers,result,updated_at,submitted_at').in('participant_id',ids).eq('phase','pre');if(error)return out({error:'QUERY_FAILED'},500);assessments=data||[]}
 const counselorIds=[...new Set((parts||[]).map(p=>p.counselor_user_id).filter(Boolean))];
 const counselors={};
 if(counselorIds.length){const {data,error}=await db.from('user_profiles').select('user_id,display_name').eq('organization_id',me.organization_id).eq('role','counselor').in('user_id',counselorIds);if(error)return out({error:'QUERY_FAILED'},500);for(const c of data||[])counselors[c.user_id]={code:c.user_id,n:c.display_name||'담당 상담사',mail:'',tel:''}}
 if(req.method==='GET'){
  const id=new URL(req.url).searchParams.get('id');
  if(id){
   if(me.role!=='counselor')return out({error:'FORBIDDEN'},403);
   const part=parts.find(p=>p.id===id),a=assessments.find(a=>a.participant_id===id);
   if(!part||!a||a.status!=='submitted'||!a.result)return out({error:'NOT_AVAILABLE'},403);
   const {data:histories,error:historyError}=await db.from('assessment_history').select('created_at,before_data,after_data').eq('assessment_id',a.id).eq('action','edit').order('created_at',{ascending:false}).limit(100);
   if(historyError)return out({error:'QUERY_FAILED'},500);
   const kind=new URL(req.url).searchParams.get('kind')||'c';
   if(!['p','c'].includes(kind))return out({error:'INVALID_REPORT_KIND'},400);
   return out({html:report(person(part,a),counselors,histories||[],kind)});
  }
  let participantList=(parts||[]).map(({auth_user_id,...part})=>part);
  if(me.role==='counselor'){
   const userIds=[...new Set((parts||[]).map(p=>p.auth_user_id).filter(Boolean))];
   let lookup=[];
   if(userIds.length){const {data,error}=await db.from('server_login_lookup').select('user_id,login_id').in('user_id',userIds);if(error)return out({error:'QUERY_FAILED'},500);lookup=data||[]}
   const loginIds=new Map(lookup.map(row=>[row.user_id,row.login_id]));
   participantList=(parts||[]).map(({auth_user_id,...part})=>({...part,login_id:loginIds.get(auth_user_id)||null}));
  }
  return out({profile:{role:me.role,display_name:me.display_name},participants:participantList,counselors,
   assessments:assessments.map(a=>({id:a.id,participant_id:a.participant_id,phase:a.phase,status:a.status,
    answers:{reg:a.answers.reg||{careers:[{},{},{}]},goal:a.answers.goal||{},expect:a.answers.expect||{},done:a.answers.done||{},pre:a.answers.pre||Array(ITEM_COUNT).fill(null)},
    dateOfAssessment:a.answers.preDate||null,updated_at:a.updated_at,submitted_at:a.submitted_at}))});
 }
 const body=await readBody(req),action=body.action;
 if(!['draft','submit','edit'].includes(action))return out({error:'ACTION_INVALID'},400);
 if((action==='edit'&&me.role!=='counselor')||(action!=='edit'&&me.role!=='participant'))return out({error:'FORBIDDEN'},403);
 const part=me.role==='participant'?parts[0]:parts.find(p=>p.id===body.participantId);
 if(!part)return out({error:'FORBIDDEN'},403);
 const old=assessments.find(a=>a.participant_id===part.id);
 if(action==='submit'&&old?.status==='submitted')return out({assessmentId:old.id,status:old.status,updatedAt:old.updated_at});
 if(action==='draft'&&old?.status==='submitted')return out({error:'LOCKED'},409);
 if(action==='edit'&&old?.status!=='submitted')return out({error:'LOCKED'},409);
 const input=sanitize(body.answers),p=person(part,{answers:input});
 if(action!=='draft'){
  const misses=missing(p);if(misses.length)return out({error:'ANSWERS_INCOMPLETE',codes:misses.map(m=>m.code)},400);
 }
 input.preDate=old?.answers?.preDate||(action==='draft'?null:today());
 if(action!=='draft')input.done={reg:true,goal:true,expect:true};
 let result=null;
 if(action==='edit'){
  const before=person(part,old);
  if(!QUESTION_DEFS.filter(q=>q.step<5).some(q=>ansText(before,q.code)!==ansText(p,q.code))){
   if(body.expectedUpdatedAt!==old.updated_at)return out({error:'CONFLICT'},409);
   return out({assessmentId:old.id,status:old.status,updatedAt:old.updated_at});
  }
  // The original recomputation keeps selected comments/keywords when their
  // classification is unchanged. Never accept a client-supplied result.
  p.preDate=input.preDate;
  result=recomputeResultCore(p,old.result,()=>({counselor:counselors[p.counselor]?Object.assign({code:p.counselor},counselors[p.counselor]):null,generatedAt:new Date().toISOString()}));
 }else if(action==='submit'){
  p.preDate=input.preDate;result=computeResult(p);result.evaluationVersion=EVAL_VERSION;
  result.snapshot={counselor:counselors[p.counselor]?Object.assign({code:p.counselor},counselors[p.counselor]):null,generatedAt:new Date().toISOString()};
 }
 const {data,error}=await db.rpc('secondcareer_write_v1',{actor:user.id,target:part.id,operation:action,payload:input,calculated:result,expected_updated_at:body.expectedUpdatedAt||null});
 if(error)return out({error:error.code==='40001'?'CONFLICT':'WRITE_FAILED'},error.code==='40001'?409:500);
 return out(data);
 }catch(error){return out({error:error instanceof SyntaxError||error?.message==='INPUT'?'INVALID_INPUT':'SERVER_ERROR'},error instanceof SyntaxError||error?.message==='INPUT'?400:500)}
});
