
import {createClient} from "npm:@supabase/supabase-js@2.95.0";
import {QUESTION_DEFS,qdRequired,qdStepCodes} from "./js/00-question-defs-module.js";
import {OPT,LIM} from "./js/03-options.js";
import {ITEM_COUNT,SCALE_MIN,SCALE_MAX,EVAL_VERSION} from "./js/02-eval-config.js";
import {today,areaScores} from "./js/04-util.js";
import {computeResult,recomputeResultCore,full} from "./js/05-engine.js";
import {agreed,ansText,person,reportCounselors,submittedReport} from "./shared/report.ts";
import {participantAccessError} from "./shared/participant-access.ts";
const h={"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Cache-Control":"no-store"};
const out=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:h});
const REQUIRED=qdRequired(),C_CODES=qdStepCodes(3),stepOf=c=>QUESTION_DEFS.find(q=>q.code===c)?.step;
function parseBirth(v){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v||''));if(!m)return null;const y=+m[1],mo=+m[2],d=+m[3],dt=new Date(y,mo-1,d);if(dt.getFullYear()!==y||dt.getMonth()!==mo-1||dt.getDate()!==d)return null;if(y<1900||dt>new Date())return null;return {y,mo,d}}
const PHONE_RE=/^01[016789]-\d{3,4}-\d{4}$/,EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
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
// Use a unique, immutable key rather than offsets so page boundaries do not
// shift when unrelated rows are inserted or removed during a read.
async function readAll(makeQuery,key){
 const rows=[];let cursor=null;
 for(;;){
  let query=makeQuery().order(key,{ascending:true}).limit(100);
  if(cursor!==null)query=query.gt(key,cursor);
  const {data,error}=await query;
  if(error||!Array.isArray(data))return {data:null,error:error||true};
  if(!data.length)return {data:rows,error:null};
  for(const row of data){if(typeof row[key]!=='string'||(cursor!==null&&row[key]<=cursor))return {data:null,error:true};cursor=row[key];rows.push(row)}
 }
}
function chunks(items,size=100){const result=[];for(let i=0;i<items.length;i+=size)result.push(items.slice(i,i+size));return result}
const validScore=v=>Number.isInteger(v)&&v>=SCALE_MIN&&v<=SCALE_MAX;
const validPost=(a,complete=false)=>Array.isArray(a)&&a.length===ITEM_COUNT&&a.every(v=>complete?validScore(v):(v===null||validScore(v)));
const SAT_SCORES=['q1','q2','q3a','q3b','q3c','q5fit'],SAT_CHOICES=['d32','d33','d34','d35','q7'],SAT_TEXT_MAX=200;
// Returns a canonical copy (fixed key order, so jsonb key reordering never matters) or null when invalid.
// A draft may be partial; a final submission needs every question (Q4 needs all LIM picks, others at least one).
function cleanSat(v,complete){
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>![...SAT_SCORES,...SAT_CHOICES,'q7txt'].includes(k)))return null;
 const r:any={};
 for(const k of SAT_SCORES){if(!Object.hasOwn(v,k)){if(complete)return null;continue}if(!validScore(v[k]))return null;r[k]=v[k]}
 for(const k of SAT_CHOICES){
  const path='sat.'+k;
  if(!Object.hasOwn(v,k)){if(complete)return null;continue}
  const a=v[k];if(!Array.isArray(a)||a.length>LIM[path]||new Set(a).size!==a.length||!a.every(x=>typeof x==='string'&&OPT[path].includes(x)))return null;
  if(complete&&a.length<(k==='d33'?LIM[path]:1))return null;
  r[k]=[...a];
 }
 if(Object.hasOwn(v,'q7txt')){if(typeof v.q7txt!=='string'||v.q7txt.length>SAT_TEXT_MAX)return null;r.q7txt=v.q7txt}
 return r;
}
function cleanAnswers(a,complete=false){
 if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['post','sat'].includes(k))||!validPost(a.post,complete))return null;
 if(!Object.hasOwn(a,'sat'))return complete?null:{post:[...a.post]};
 const sat=cleanSat(a.sat,complete);return sat?{post:[...a.post],sat}:null;
}
const sameAnswers=(a,b)=>{const x=cleanAnswers(a),y=cleanAnswers(b);return !!x&&!!y&&JSON.stringify(x)===JSON.stringify(y)};
const validTime=t=>typeof t==='string'&&Number.isFinite(Date.parse(t));
const validPostRecord=row=>!!row&&validTime(row.updated_at)&&(row.status==='draft'?!!cleanAnswers(row.answers):row.status==='submitted'&&!!cleanAnswers(row.answers,true)&&validTime(row.submitted_at));
async function readPostDraft(db,participantId){
 return db.from('assessments').select('id,status,answers,updated_at,submitted_at').eq('participant_id',participantId).eq('phase','post').maybeSingle();
}
// DEV-014: the assigned counselor's post approval (supabase/proposals/post-approval.sql). Never revoked.
async function readApproval(db,participantId){
 return db.from('post_approvals').select('participant_id,approved_at,source').eq('participant_id',participantId).maybeSingle();
}
// Fails closed: no approval row, or a failed lookup, blocks every post read and write.
async function approvalError(db,participantId){
 const {data,error}=await readApproval(db,participantId);
 if(error)return out({error:'QUERY_FAILED'},500);
 return data?null:out({error:'POST_NOT_APPROVED'},403);
}
function postPayload(row){
 if(!row)return null;
 if(!validPostRecord(row))throw Error('POST_STATE');
 return {status:row.status,answers:cleanAnswers(row.answers,row.status==='submitted'),updatedAt:row.updated_at,...(row.status==='submitted'?{submittedAt:row.submitted_at}:{})};
}
// Database error codes raised by the post RPCs (supabase/proposals/post-draft.sql, post-submit.sql).
const RPC_ERRORS={'22023':[400,'INVALID_INPUT'],'42501':[403,'FORBIDDEN'],'40001':[409,'CONFLICT'],'55006':[409,'LOCKED'],'23505':[409,'CONFLICT']};
const rpcError=error=>{const [status,code]=RPC_ERRORS[error?.code]||[500,'WRITE_FAILED'];return out({error:code},status)};
// Versions are compared by instant: the database and the Data API may format the same timestamptz differently.
const sameTime=(a,b)=>a===b||(validTime(a)&&validTime(b)&&Date.parse(a)===Date.parse(b));
// Ownership, the submitted-pre check, the version check, the write and its history entry run in one
// database function. The checks here only fail fast; the database decides.
async function writePostDraft(db,actor,part,pre,body){
 if(!pre||pre.status!=='submitted')return out({error:'PRE_REQUIRED'},403);
 const notApproved=await approvalError(db,part.id);if(notApproved)return notApproved;
 if(Object.keys(body).some(k=>!['action','answers','expectedUpdatedAt'].includes(k))||!Object.hasOwn(body,'expectedUpdatedAt')||
    !(body.expectedUpdatedAt===null||validTime(body.expectedUpdatedAt))||
    !body.answers||typeof body.answers!=='object'||Array.isArray(body.answers)||!cleanAnswers(body.answers))return out({error:'INVALID_INPUT'},400);
 const {data:old,error:readError}=await readPostDraft(db,part.id);if(readError)return out({error:'QUERY_FAILED'},500);
 if(old&&old.status!=='draft')return out({error:'LOCKED'},409);
 if(old&&!validPostRecord(old))return out({error:'POST_STATE_INVALID'},500);
 // A client that sends only `post` keeps the saved satisfaction answers.
 const next=cleanAnswers(Object.hasOwn(body.answers,'sat')||!old?.answers?.sat?body.answers:{...body.answers,sat:old.answers.sat});
 if(old&&sameAnswers(old.answers,next))return out(postPayload(old));
 if((old&&!sameTime(old.updated_at,body.expectedUpdatedAt))||(!old&&body.expectedUpdatedAt!==null))return out({error:'CONFLICT'},409);
 const {data,error}=await db.rpc('secondcareer_post_draft_v1',{actor:actor.id,target:part.id,answers:next,expected_updated_at:old?old.updated_at:null});
 if(error)return rpcError(error);
 if(!data||data.status!=='draft'||!validTime(data.updated_at)||!sameAnswers(data.answers,next))return out({error:'SAVE_UNCONFIRMED'},500);
 return out(postPayload({status:'draft',answers:data.answers,updated_at:data.updated_at}));
}
// Final submission. Ownership, the submitted-pre check, validation and the state change are
// re-checked inside one database function (supabase/proposals/post-submit.sql) so they run in
// a single transaction. Success is reported only from the row the database confirms.
async function writePostSubmit(db,actor,part,pre,body){
 if(!pre||pre.status!=='submitted')return out({error:'PRE_REQUIRED'},403);
 const notApproved=await approvalError(db,part.id);if(notApproved)return notApproved;
 if(Object.keys(body).length!==3||!['action','answers','expectedUpdatedAt'].every(k=>Object.hasOwn(body,k))||
    !(body.expectedUpdatedAt===null||validTime(body.expectedUpdatedAt)))return out({error:'INVALID_INPUT'},400);
 const answers=cleanAnswers(body.answers,true);if(!answers)return out({error:'ANSWERS_INCOMPLETE'},400);
 const {data:old,error:readError}=await readPostDraft(db,part.id);if(readError)return out({error:'QUERY_FAILED'},500);
 if(old&&!validPostRecord(old))return out({error:'POST_STATE_INVALID'},500);
 if(old?.status==='submitted')return sameAnswers(old.answers,answers)?out(postPayload(old)):out({error:'LOCKED'},409);
 if((old&&!sameTime(old.updated_at,body.expectedUpdatedAt))||(!old&&body.expectedUpdatedAt!==null))return out({error:'CONFLICT'},409);
 const {data,error}=await db.rpc('secondcareer_post_submit_v1',{actor:actor.id,target:part.id,answers,expected_updated_at:old?old.updated_at:null});
 if(error)return rpcError(error);
 if(!data||data.status!=='submitted'||!validTime(data.updated_at)||!validTime(data.submitted_at)||!sameAnswers(data.answers,answers))return out({error:'SUBMIT_UNCONFIRMED'},500);
 return out({status:'submitted',answers,updatedAt:data.updated_at,submittedAt:data.submitted_at});
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
 const reportId=req.method==='GET'?new URL(req.url).searchParams.get('id'):null;
 if(reportId&&me.role!=='counselor')return out({error:'FORBIDDEN'},403);
 const compareId=req.method==='GET'&&!reportId?new URL(req.url).searchParams.get('compare'):null;
 if(compareId!==null&&me.role!=='counselor')return out({error:'FORBIDDEN'},403);
 const postEnabled=Deno.env.get('SECONDCAREER_POST_DRAFT_ENABLED')==='true';
 if(compareId!==null&&!postEnabled)return out({error:'POST_NOT_CONFIGURED'},503);
 const participantQuery=()=>{
  let q=db.from('participants').select('id,display_name,counselor_user_id,phone,company_name,auth_user_id').eq('organization_id',me.organization_id);
  q=me.role==='participant'?q.eq('auth_user_id',user.id):q.eq('counselor_user_id',user.id);
  return reportId?q.eq('id',reportId):compareId!==null?q.eq('id',compareId):q;
 };
 const {data:parts,error:partError}=await readAll(participantQuery,'id');if(partError)return (reportId||compareId!==null)&&partError.code==='22P02'?out({error:'NOT_AVAILABLE'},403):out({error:'QUERY_FAILED'},500);
 const ids=(parts||[]).map(p=>p.id);
 let assessments=[];
 for(const group of chunks(ids)){const {data,error}=await readAll(()=>db.from('assessments').select('id,participant_id,phase,status,answers,result,updated_at,submitted_at').in('participant_id',group).eq('phase','pre'),'id');if(error)return out({error:'QUERY_FAILED'},500);assessments.push(...data)}
 const counselorIds=[...new Set((parts||[]).map(p=>p.counselor_user_id).filter(Boolean))];
 const {counselors,error:counselorError}=await reportCounselors(db,me.organization_id,counselorIds);if(counselorError)return out({error:'QUERY_FAILED'},500);
 if(req.method==='GET'){
  const id=new URL(req.url).searchParams.get('id');
  if(id){
   if(me.role!=='counselor')return out({error:'FORBIDDEN'},403);
   // Shared with the admin report (shared/report.ts): same checks, same renderer.
   const [status,body]=await submittedReport(db,parts.find(p=>p.id===id),assessments.find(a=>a.participant_id===id),counselors,new URL(req.url).searchParams.get('kind'));
   return out(body,status);
  }
  if(compareId!==null){
   // Assignment and organization are re-checked by participantQuery; only submitted pre and
   // post data is returned, without personal details or draft answers.
   const part=parts.find(p=>p.id===compareId),pre=assessments.find(a=>a.participant_id===compareId);
   if(!part||pre?.status!=='submitted'||!validPost(pre.answers?.pre,true))return out({error:'NOT_AVAILABLE'},403);
   const {data:post,error}=await readPostDraft(db,part.id);if(error)return out({error:'QUERY_FAILED'},500);
   if(post?.status!=='submitted')return out({error:'NOT_AVAILABLE'},403);
   if(!validPostRecord(post))return out({error:'POST_STATE_INVALID'},500);
   const answers=cleanAnswers(post.answers,true),preScores=areaScores(pre.answers.pre),postScores=areaScores(answers.post);
   return out({participantId:part.id,preDate:pre.answers.preDate||null,preSubmittedAt:pre.submitted_at||null,postSubmittedAt:post.submitted_at,evaluationVersion:EVAL_VERSION,
    areas:preScores.map((v,i)=>({pre:v,post:postScores[i],diff:Math.round((postScores[i]-v)*10)/10})),
    items:{pre:[...pre.answers.pre],post:answers.post},sat:answers.sat});
  }
   if(new URL(req.url).searchParams.get('phase')==='post'){
    if(me.role!=='participant'||parts.length!==1)return out({error:'FORBIDDEN'},403);
    if(Deno.env.get('SECONDCAREER_POST_DRAFT_ENABLED')!=='true')return out({error:'POST_NOT_CONFIGURED'},503);
    const pre=assessments.find(a=>a.participant_id===parts[0].id);
    if(!pre||pre.status!=='submitted')return out({error:'PRE_REQUIRED'},403);
    const notApproved=await approvalError(db,parts[0].id);if(notApproved)return notApproved;
    const {data,error}=await readPostDraft(db,parts[0].id);if(error)return out({error:'QUERY_FAILED'},500);
    return out({assessment:postPayload(data)});
   }
  let participantList=(parts||[]).map(({auth_user_id,...part})=>part);
  if(me.role==='counselor'){
   const userIds=[...new Set((parts||[]).map(p=>p.auth_user_id).filter(Boolean))];
   let lookup=[];
    for(const group of chunks(userIds)){const {data,error}=await readAll(()=>db.from('server_login_lookup').select('user_id,login_id').in('user_id',group),'user_id');if(error)return out({error:'QUERY_FAILED'},500);lookup.push(...data)}
   const loginIds=new Map(lookup.map(row=>[row.user_id,row.login_id]));
   participantList=(parts||[]).map(({auth_user_id,...part})=>({...part,login_id:loginIds.get(auth_user_id)||null}));
  }
  // Counselors see only post status and submission date here; answers come from ?compare= after submission.
  let postStatus,postApprovals,postApproved;
  if(me.role==='counselor'&&postEnabled){
   postStatus=[];postApprovals=[];
   for(const group of chunks(ids)){const {data,error}=await readAll(()=>db.from('assessments').select('id,participant_id,status,submitted_at').in('participant_id',group).eq('phase','post'),'id');if(error)return out({error:'QUERY_FAILED'},500);postStatus.push(...data.map(a=>({participant_id:a.participant_id,status:a.status==='submitted'?'submitted':'draft',submitted_at:a.status==='submitted'?a.submitted_at:null})))}
   // Approval state only: who approved is not returned.
   for(const group of chunks(ids)){const {data,error}=await readAll(()=>db.from('post_approvals').select('participant_id,approved_at,source').in('participant_id',group),'participant_id');if(error)return out({error:'QUERY_FAILED'},500);postApprovals.push(...data.map(a=>({participant_id:a.participant_id,approved_at:a.approved_at,source:a.source==='backfill'?'backfill':'counselor'})))}
  }
  if(me.role==='participant'&&postEnabled&&parts.length===1){
   const {data,error}=await readApproval(db,parts[0].id);if(error)return out({error:'QUERY_FAILED'},500);postApproved=!!data;
  }
  return out({profile:{role:me.role,display_name:me.display_name},participants:participantList,counselors,...(postStatus?{postAssessments:postStatus,postApprovals}:{}),...(postApproved!==undefined?{postApproved}:{}),
   assessments:assessments.map(a=>({id:a.id,participant_id:a.participant_id,phase:a.phase,status:a.status,
    answers:{reg:a.answers.reg||{careers:[{},{},{}]},goal:a.answers.goal||{},expect:a.answers.expect||{},done:a.answers.done||{},pre:a.answers.pre||Array(ITEM_COUNT).fill(null)},
    dateOfAssessment:a.answers.preDate||null,updated_at:a.updated_at,submitted_at:a.submitted_at}))});
 }
 const body=await readBody(req),action=body.action;
  if(action==='post-draft'){
   if(me.role!=='participant'||parts.length!==1)return out({error:'FORBIDDEN'},403);
   if(Deno.env.get('SECONDCAREER_POST_DRAFT_ENABLED')!=='true')return out({error:'POST_NOT_CONFIGURED'},503);
   return await writePostDraft(db,user,parts[0],assessments.find(a=>a.participant_id===parts[0].id),body);
  }
  if(action==='post-submit'){
   if(me.role!=='participant'||parts.length!==1)return out({error:'FORBIDDEN'},403);
   if(Deno.env.get('SECONDCAREER_POST_DRAFT_ENABLED')!=='true')return out({error:'POST_NOT_CONFIGURED'},503);
   return await writePostSubmit(db,user,parts[0],assessments.find(a=>a.participant_id===parts[0].id),body);
  }
  if(action==='post-approve'){
   // The assigned counselor (participantQuery: same organization, counselor_user_id) allows one participant's
   // post assessment. These checks fail fast; secondcareer_post_approve_v1 re-checks them in one transaction.
   if(me.role!=='counselor')return out({error:'FORBIDDEN'},403);
   if(!postEnabled)return out({error:'POST_NOT_CONFIGURED'},503);
   if(Object.keys(body).length!==2||typeof body.participantId!=='string')return out({error:'INVALID_INPUT'},400);
   const part=parts.find(p=>p.id===body.participantId);if(!part)return out({error:'FORBIDDEN'},403);
   const pre=assessments.find(a=>a.participant_id===part.id);if(!pre||pre.status!=='submitted')return out({error:'PRE_REQUIRED'},403);
   const {data:existing,error:approvalReadError}=await readApproval(db,part.id);if(approvalReadError)return out({error:'QUERY_FAILED'},500);
   if(existing)return out({participantId:part.id,approvedAt:existing.approved_at,source:existing.source==='backfill'?'backfill':'counselor'});
   const {data:post,error:postError}=await readPostDraft(db,part.id);if(postError)return out({error:'QUERY_FAILED'},500);
   if(post?.status==='submitted')return out({error:'LOCKED'},409);
   const {data,error}=await db.rpc('secondcareer_post_approve_v1',{actor:user.id,target:part.id});
   if(error)return rpcError(error);
   if(!data||!validTime(data.approved_at)||!['counselor','backfill'].includes(data.source))return out({error:'APPROVE_UNCONFIRMED'},500);
   return out({participantId:part.id,approvedAt:data.approved_at,source:data.source});
  }
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
