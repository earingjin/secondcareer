import {missing,sanitize,readBody} from '../secondcareer-assessment/shared/pre-validation.ts';
import {person} from '../secondcareer-assessment/shared/report.ts';
import {computeResult} from '../secondcareer-assessment/js/05-engine.js';
import {EVAL_VERSION} from '../secondcareer-assessment/js/02-eval-config.js';
import {today} from '../secondcareer-assessment/js/04-util.js';

const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers});
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export async function digest(v:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(x=>x.toString(16).padStart(2,'0')).join('')}
// Only this capability endpoint is public. No report/list/admin operation exists here.
export function makeHandler(db:any,enabled:()=>boolean){return async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
 if(!enabled())return reply({error:'NOT_CONFIGURED'},503);
 try{
  const b=await readBody(req);
  if(!b||Array.isArray(b)||!['start','read','draft','submit','status'].includes(b.action)||
    Object.keys(b).some(k=>!['action','linkId','intakeId','accessToken','requestId','version','answers'].includes(k))||
    !uuid(b.linkId)||!uuid(b.intakeId)||typeof b.accessToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(b.accessToken))return reply({error:'INVALID_INPUT'},400);
  const writing=['start','draft','submit'].includes(b.action);
  if(writing&&!uuid(b.requestId))return reply({error:'INVALID_INPUT'},400);
  if(['draft','submit'].includes(b.action)&&(!Number.isSafeInteger(b.version)||b.version<0))return reply({error:'INVALID_INPUT'},400);
  let answers=null,result=null;
  if(['draft','submit'].includes(b.action)){
   // sanitize discards client score/result/identity fields and checks option codes/types.
   answers=sanitize(b.answers);
   const p=person({id:b.intakeId,display_name:answers.reg.name||'',counselor_user_id:null},{answers});
   if(b.action==='draft' && !(answers.reg.a1==='동의'||(answers.reg.a1==null&&answers.reg.consent===true)))
    return reply({error:'CONSENT_REQUIRED'},400);
   if(b.action==='submit'){
    const codes=missing(p).filter(m=>m.code!=='A2').map(m=>m.code);
    if(codes.length)return reply({error:'ANSWERS_INCOMPLETE',codes},400);
    answers.preDate=today();answers.done={reg:true,goal:true,expect:true};p.preDate=answers.preDate;
    result=computeResult(p);result.evaluationVersion=EVAL_VERSION;
    result.snapshot={counselor:null,generatedAt:new Date().toISOString()};
   }
  }
  // Hash canonical sanitized content, excluding random result/date, for safe retry detection.
  const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  const fingerprint=await digest(JSON.stringify(canonical({action:b.action,version:b.version??null,answers:answers?sanitize(b.answers):null})));
  const {data,error}=await db.rpc('secondcareer_public_intake_v1',{p_action:b.action,p_link:b.linkId,p_id:b.intakeId,
   p_hash:await digest(b.accessToken),p_request:writing?b.requestId:null,p_fingerprint:fingerprint,p_version:b.version??null,p_answers:answers,p_result:result});
  if(error||!data||typeof data!=='object')return reply({error:'STORAGE_UNAVAILABLE'},503);
  if(data.error)return reply({error:data.error},({NOT_FOUND:403,RATE_LIMITED:429,CONFLICT:409,LOCKED:409,REQUEST_REUSED:409} as any)[data.error]||503);
  // Deliberate projection: never expose participant IDs, computed result or report data.
  return reply({intakeId:b.intakeId,status:data.status,version:data.version,expiresAt:data.expiresAt,
   ...(data.submittedAt?{submittedAt:data.submittedAt}:{}),...(b.action==='read'&&data.status==='draft'?{answers:data.answers}: {})});
 }catch(e){return reply({error:e instanceof SyntaxError||(e as Error)?.message==='INPUT'?'INVALID_INPUT':'SERVER_ERROR'},e instanceof SyntaxError||(e as Error)?.message==='INPUT'?400:500)}
}}
