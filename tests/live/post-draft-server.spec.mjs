import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{transformSync}=require('esbuild');

// Synthetic JavaScript model of supabase/proposals/post-draft.sql (the draft RPC).
// It is NOT PostgreSQL: locks, transactions, RLS and privileges are unverified here.
function modelDraftRpc(state){
 return async({actor,target,answers,expected_updated_at})=>{
  if(state.failWrite)return {data:null,error:{code:'XX000'}};
  const me=state.profiles.find(p=>p.user_id===actor),part=state.participants.find(p=>p.id===target);
  if(!me||!part||me.role!=='participant'||part.auth_user_id!==actor||me.organization_id!==part.organization_id)return {data:null,error:{code:'42501'}};
  const pre=state.assessments.find(a=>a.participant_id===target&&a.phase==='pre');if(pre?.status!=='submitted')return {data:null,error:{code:'42501'}};
  if(!state.approvals.some(a=>a.participant_id===target))return {data:null,error:{code:'42501'}};
  const row=state.assessments.find(a=>a.participant_id===target&&a.phase==='post');
  const view=r=>({status:r.status,answers:structuredClone(r.answers),updated_at:r.updated_at,submitted_at:r.submitted_at??null});
  if(row&&row.status!=='draft')return {data:null,error:{code:'55006'}};
  if(row&&JSON.stringify(row.answers)===JSON.stringify(answers))return {data:view(row),error:null};
  if((row&&row.updated_at!==expected_updated_at)||(!row&&expected_updated_at!==null))return {data:null,error:{code:'40001'}};
  const now=new Date(Math.max(Date.now(),row?Date.parse(row.updated_at)+1:0)).toISOString();
  (state.history||=[]).push({actor,action:'post-draft',before:row?structuredClone(row.answers):null});
  if(row){Object.assign(row,{answers:structuredClone(answers),updated_at:now});return {data:view(row),error:null}}
  const created={id:'post-'+(++state.revision),participant_id:target,phase:'post',status:'draft',answers:structuredClone(answers),updated_at:now,submitted_at:null};state.assessments.push(created);return {data:view(created),error:null};
 };
}
// Synthetic JavaScript model of secondcareer_post_approve_v1 (supabase/proposals/post-approval.sql). Not PostgreSQL.
function modelApproveRpc(state){
 return async({actor,target})=>{
  const me=state.profiles.find(p=>p.user_id===actor),part=state.participants.find(p=>p.id===target);
  if(!me||!part||me.role!=='counselor'||part.counselor_user_id!==actor||me.organization_id!==part.organization_id)return {data:null,error:{code:'42501'}};
  const existing=state.approvals.find(a=>a.participant_id===target);if(existing)return {data:{approved_at:existing.approved_at,source:existing.source},error:null};
  if(state.assessments.find(a=>a.participant_id===target&&a.phase==='pre')?.status!=='submitted')return {data:null,error:{code:'42501'}};
  if(state.assessments.find(a=>a.participant_id===target&&a.phase==='post')?.status==='submitted')return {data:null,error:{code:'55006'}};
  const row={participant_id:target,approved_by:actor,source:'counselor',approved_at:new Date().toISOString()};state.approvals.push(row);return {data:{approved_at:row.approved_at,source:row.source},error:null};
 };
}
// Synthetic database protocol model. It is not a Postgres or Auth integration test.
function setup(){
 const profiles=[{user_id:'alice',organization_id:'org1',role:'participant'},{user_id:'bob',organization_id:'org1',role:'participant'},{user_id:'counselor',organization_id:'org1',role:'counselor'},{user_id:'other',organization_id:'org2',role:'participant'}];
 const participants=[{id:'alice-p',auth_user_id:'alice',organization_id:'org1',counselor_user_id:'counselor',display_name:'가상 A'},{id:'bob-p',auth_user_id:'bob',organization_id:'org1',counselor_user_id:'counselor',display_name:'가상 B'},{id:'other-p',auth_user_id:'other',organization_id:'org2',counselor_user_id:'other-c',display_name:'가상 C'}];
 const pre={id:'pre-a',participant_id:'alice-p',phase:'pre',status:'submitted',answers:{pre:[1,2,3],reg:{},goal:{},expect:{},done:{}},result:{value:'unchanged'},updated_at:'2026-01-01T00:00:00.000Z',submitted_at:'2026-01-01T00:00:00.000Z'};
 const assessments=[pre,{...structuredClone(pre),id:'pre-b',participant_id:'bob-p',status:'draft'},{...structuredClone(pre),id:'pre-o',participant_id:'other-p'}];
 // DEV-014: alice is approved by her counselor so the existing post tests keep their meaning.
 const approvals=[{participant_id:'alice-p',approved_by:'counselor',source:'counselor',approved_at:'2026-01-02T00:00:00.000Z'}];
 const state={profiles,participants,assessments,approvals,failWrite:false,rpcCalls:0,rpcLog:[],pending:false,enabled:true,revision:0};let handler;
 const db={auth:{getUser:async token=>({data:{user:profiles.some(p=>p.user_id===token)?{id:token,app_metadata:state.pending?{must_change_password:true}:{}}:null},error:null})},rpc:async(name,args)=>{state.rpcLog.push(name);if(name==='secondcareer_post_draft_v1')return (state.draftRpc||modelDraftRpc(state))(args);if(name==='secondcareer_post_approve_v1')return (state.approveRpc||modelApproveRpc(state))(args);state.rpcCalls++;if(name==='secondcareer_post_submit_v1'&&state.submitRpc)return state.submitRpc(args);throw Error('unexpected RPC '+name)},from(name){
  let rows=({user_profiles:profiles,participants,assessments,post_approvals:approvals,server_login_lookup:[],assessment_history:[]})[name]||[],filters=[],inserts=null,updates=null,limit=Infinity,order=null,columns='*';
  const q={select(c){columns=c;return q},eq(k,v){filters.push(r=>r[k]===v);return q},gt(k,v){filters.push(r=>r[k]>v);return q},in(k,vs){filters.push(r=>vs.includes(r[k]));return q},order(k){order=k;return q},limit(n){limit=n;return q},insert(v){inserts=v;return q},update(v){updates=v;return q},maybeSingle:async()=>run(true),then(resolve,reject){return run(false).then(resolve,reject)}};
  async function run(single){
   if((inserts||updates)&&state.failWrite)return {data:null,error:{code:'MOCK_FAILURE'}};
   if(inserts){if(assessments.some(a=>a.participant_id===inserts.participant_id&&a.phase===inserts.phase))return {data:null,error:{code:'23505'}};const row={id:'post-'+(++state.revision),...structuredClone(inserts)};assessments.push(row);rows=[row]}
   else{rows=rows.filter(r=>filters.every(f=>f(r)));if(updates)rows.forEach(r=>Object.assign(r,structuredClone(updates)))}
   if(order)rows=[...rows].sort((a,b)=>a[order]<b[order]?-1:a[order]>b[order]?1:0);rows=rows.slice(0,limit);
   const fields=columns.split(',');const data=rows.map(row=>Object.fromEntries(fields.map(k=>[k,structuredClone(row[k])])));
   return {data:single?(data[0]||null):data,error:null};
  }
  return q;
 }};
 const context=vm.createContext({Request,Response,URL,TextEncoder,TextDecoder,Uint8Array,Date,Math,Deno:{env:{get:key=>key==='SECONDCAREER_POST_DRAFT_ENABLED'?(state.enabled?'true':undefined):'fixture'},serve:f=>{handler=f}}});
 const cache=new Map(),root=path.resolve('supabase/functions/secondcareer-assessment');
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const code=transformSync(fs.readFileSync(file,'utf8'),{loader:file.endsWith('.ts')?'ts':'js',format:'cjs',target:'es2022'}).code;vm.runInContext('(function(require,module,exports){'+code+'\n})',context,{filename:file})(s=>s.startsWith('npm:')?{createClient:()=>db}:load(path.resolve(path.dirname(file),s)),module,module.exports);return module.exports}
 load(path.join(root,'index.ts'));const evalConfig=load(path.join(root,'js/02-eval-config.js')),{ITEM_COUNT}=evalConfig,{OPT}=load(path.join(root,'js/03-options.js'));
 async function request(user,body,query='?phase=post'){const response=await handler(new Request('https://fixture.invalid/'+query,{method:body?'POST':'GET',headers:user?{authorization:'Bearer '+user}:{},...(body?{body:JSON.stringify(body)}:{})}));return {status:response.status,data:await response.json()}}
 const payload=(post=Array(ITEM_COUNT).fill(null),expectedUpdatedAt=null)=>({action:'post-draft',answers:{post},expectedUpdatedAt});
 return {state,pre,request,payload,ITEM_COUNT,OPT,evalConfig};
}

test('requires submitted pre and authenticated participant ownership',async()=>{
 const h=setup();expect((await h.request(null)).status).toBe(401);expect((await h.request('bob')).status).toBe(403);expect((await h.request('bob',h.payload())).status).toBe(403);
 expect((await h.request('counselor')).status).toBe(403);expect((await h.request('counselor',h.payload())).status).toBe(403);
 h.state.pending=true;expect((await h.request('alice',h.payload())).status).toBe(403);
});
test('post endpoints fail closed when the server flag is absent',async()=>{
 const h=setup();h.state.enabled=false;expect((await h.request('alice')).status).toBe(503);expect((await h.request('alice',h.payload())).status).toBe(503);expect(h.state.assessments.filter(a=>a.phase==='post')).toHaveLength(0);
});
test('saves and restores a separate draft without changing pre or its result',async()=>{
 const h=setup(),before=structuredClone(h.pre),answers=Array(h.ITEM_COUNT).fill(null);answers[0]=5;
 expect((await h.request('alice')).data.assessment).toBeNull();const saved=await h.request('alice',h.payload(answers));expect(saved.status).toBe(200);expect(saved.data.answers.post).toEqual(answers);
 expect((await h.request('alice')).data.assessment).toEqual(saved.data);expect(h.pre).toEqual(before);expect(h.state.rpcLog).not.toContain('secondcareer_write_v1');
 h.state.approvals.push({participant_id:'other-p',approved_by:'other-c',source:'counselor',approved_at:'2026-01-02T00:00:00.000Z'});
 expect((await h.request('other')).data.assessment).toBeNull();expect((await h.request('other',null,'?phase=post&id=alice-p')).status).toBe(403);expect((await h.request('other', {...h.payload(),participantId:'alice-p'})).status).toBe(400);
});
test('rejects missing, malformed and out-of-range post responses',async()=>{
 const h=setup();for(const value of [null,[],Array(h.ITEM_COUNT-1).fill(null),Array(h.ITEM_COUNT).fill(0),Array(h.ITEM_COUNT).fill(6),Array(h.ITEM_COUNT).fill(1.5),Array(h.ITEM_COUNT).fill('1')])expect((await h.request('alice',h.payload(value))).status).toBe(400);
 expect((await h.request('alice',{action:'post-draft',answers:{},expectedUpdatedAt:null})).status).toBe(400);
 const missing=h.payload();delete missing.expectedUpdatedAt;expect((await h.request('alice',missing)).status).toBe(400);
 expect(h.state.assessments.filter(a=>a.phase==='post')).toHaveLength(0);
});
test('duplicate requests are idempotent and concurrent differing edits conflict',async()=>{
 const h=setup(),a=Array(h.ITEM_COUNT).fill(null);a[0]=1;const first=await h.request('alice',h.payload(a));expect(first.status).toBe(200);
 expect((await h.request('alice',h.payload(a))).data).toEqual(first.data);
 const b=[...a],c=[...a];b[1]=2;c[1]=3;
 const both=await Promise.all([h.request('alice',h.payload(b,first.data.updatedAt)),h.request('alice',h.payload(c,first.data.updatedAt))]);expect(both.map(x=>x.status).sort()).toEqual([200,409]);
 expect(h.state.assessments.filter(x=>x.phase==='post')).toHaveLength(1);expect((await h.request('alice',h.payload(a,first.data.updatedAt))).status).toBe(409);
});
test('simultaneous identical first saves do not create duplicate post rows',async()=>{
 const h=setup(),a=Array(h.ITEM_COUNT).fill(null);a[0]=4;
 const both=await Promise.all([h.request('alice',h.payload(a)),h.request('alice',h.payload(a))]);
 expect(both.map(x=>x.status)).toEqual([200,200]);expect(both[0].data).toEqual(both[1].data);expect(h.state.assessments.filter(x=>x.phase==='post')).toHaveLength(1);
});
test('write failure is returned without touching pre or creating a post row',async()=>{
 const h=setup(),before=structuredClone(h.pre);h.state.failWrite=true;expect((await h.request('alice',h.payload())).status).toBe(500);expect(h.pre).toEqual(before);expect(h.state.assessments.filter(x=>x.phase==='post')).toHaveLength(0);
});
test('an unexpected existing post format or finalized status is never overwritten',async()=>{
 const h=setup(),a=Array(h.ITEM_COUNT).fill(null),first=await h.request('alice',h.payload(a));expect(first.status).toBe(200);
 const row=h.state.assessments.find(x=>x.phase==='post');row.answers.satisfaction={existing:true};a[0]=2;
 expect((await h.request('alice',h.payload(a,first.data.updatedAt))).status).toBe(500);expect(row.answers.satisfaction).toEqual({existing:true});
 row.status='submitted';expect((await h.request('alice',h.payload(a,first.data.updatedAt))).status).toBe(409);
});

// ---- DEV-007B -------------------------------------------------------------------------------
// The submit RPC below is a synthetic JavaScript model of supabase/proposals/post-submit.sql.
// It is NOT PostgreSQL: transaction, lock, RLS and privilege behaviour are unverified here.
const goodSat=OPT=>({q1:5,q2:4,q3a:3,q3b:2,q3c:1,q5fit:5,d32:[OPT['sat.d32'][0]],d33:[OPT['sat.d33'][2],OPT['sat.d33'][0],OPT['sat.d33'][1]],d34:[OPT['sat.d34'][1]],d35:[OPT['sat.d35'][0],OPT['sat.d35'][3]],q7:[OPT['sat.q7'][1]],q7txt:'가'.repeat(200)});
function modelRpc(h){
 return async({actor,target,answers,expected_updated_at})=>{
  const me=h.state.profiles.find(p=>p.user_id===actor),part=h.state.participants.find(p=>p.id===target&&p.auth_user_id===actor);
  if(!me||!part||me.role!=='participant'||me.organization_id!==part.organization_id)return {data:null,error:{code:'42501'}};
  const pre=h.state.assessments.find(a=>a.participant_id===part.id&&a.phase==='pre');if(!pre||pre.status!=='submitted')return {data:null,error:{code:'42501'}};
  if(!h.state.approvals.some(a=>a.participant_id===part.id))return {data:null,error:{code:'42501'}};
  const row=h.state.assessments.find(a=>a.participant_id===part.id&&a.phase==='post'),now=new Date(Math.max(Date.now(),row?Date.parse(row.updated_at)+1:0)).toISOString();
  const view=r=>({status:r.status,answers:r.answers,updated_at:r.updated_at,submitted_at:r.submitted_at});
  if(row){
   if(row.status==='submitted')return JSON.stringify(row.answers)===JSON.stringify(answers)?{data:view(row),error:null}:{data:null,error:{code:'55006'}};
   if(expected_updated_at===null||row.updated_at!==expected_updated_at)return {data:null,error:{code:'40001'}};
   Object.assign(row,{answers:structuredClone(answers),status:'submitted',updated_at:now,submitted_at:now});return {data:view(row),error:null};
  }
  if(expected_updated_at!==null)return {data:null,error:{code:'40001'}};
  const created={id:'post-submit-'+h.state.assessments.length,participant_id:part.id,phase:'post',status:'submitted',answers:structuredClone(answers),updated_at:now,submitted_at:now};h.state.assessments.push(created);return {data:view(created),error:null};
 };
}
const submitBody=(h,sat=goodSat(h.OPT),expected=null,post=Array(h.ITEM_COUNT).fill(3))=>({action:'post-submit',answers:{post,sat},expectedUpdatedAt:expected});
test('satisfaction draft is saved with the post draft, restored, and old clients keep it',async()=>{
 const h=setup(),before=structuredClone(h.pre),sat={q1:4,d33:[h.OPT['sat.d33'][1],h.OPT['sat.d33'][0]],q7txt:'의견'};
 const first=await h.request('alice',{...h.payload(),answers:{post:Array(h.ITEM_COUNT).fill(null),sat},expectedUpdatedAt:null});expect(first.status).toBe(200);expect(first.data.status).toBe('draft');expect(first.data.answers.sat.d33).toEqual(sat.d33);
 expect((await h.request('alice')).data.assessment).toEqual(first.data);
 const post=Array(h.ITEM_COUNT).fill(null);post[0]=2;const old=await h.request('alice',h.payload(post,first.data.updatedAt));
 expect(old.status).toBe(200);expect(old.data.answers.sat).toEqual(first.data.answers.sat);
 // jsonb may reorder keys when it stores objects; the same content must stay idempotent.
 const row=h.state.assessments.find(x=>x.phase==='post');row.answers.sat=Object.fromEntries(Object.entries(row.answers.sat).reverse());
 expect((await h.request('alice',{...h.payload(post,old.data.updatedAt),answers:{post,sat}})).data.updatedAt).toBe(old.data.updatedAt);
 expect(h.pre).toEqual(before);expect(h.state.rpcLog).not.toContain('secondcareer_write_v1');
});
test('malformed satisfaction answers are rejected without writing',async()=>{
 const h=setup(),O=h.OPT,post=Array(h.ITEM_COUNT).fill(null);
 const bad=[{q1:6},{q1:0},{q1:'3'},{q1:null},{extra:1},{d33:[O['sat.d33'][0],O['sat.d33'][0]]},{d33:O['sat.d33'].slice(0,4)},{d35:O['sat.d35'].slice(0,3)},{d34:['없는 보기']},{d32:'x'},{q7txt:'가'.repeat(201)},{q7txt:5}];
 for(const sat of bad)expect((await h.request('alice',{action:'post-draft',answers:{post,sat},expectedUpdatedAt:null})).status).toBe(400);
 expect((await h.request('alice',{action:'post-draft',answers:{post,sat:[]},expectedUpdatedAt:null})).status).toBe(400);
 expect(h.state.assessments.filter(x=>x.phase==='post')).toHaveLength(0);
});
test('final submit needs complete post and satisfaction answers and locks the record',async()=>{
 const h=setup();h.state.submitRpc=modelRpc(h);const before=structuredClone(h.pre),O=h.OPT;
 const incomplete=[submitBody(h,undefined,null,Array(h.ITEM_COUNT).fill(null)),submitBody(h,{...goodSat(O),q1:undefined}),submitBody(h,{...goodSat(O),d33:[O['sat.d33'][0]]}),submitBody(h,{...goodSat(O),d34:[]}),submitBody(h,{...goodSat(O),q7txt:'가'.repeat(201)}),{action:'post-submit',answers:{post:Array(h.ITEM_COUNT).fill(3)},expectedUpdatedAt:null}];
 for(const body of incomplete)expect((await h.request('alice',JSON.parse(JSON.stringify(body)))).status).toBe(400);
 expect(h.state.rpcCalls).toBe(0);expect(h.state.assessments.filter(x=>x.phase==='post')).toHaveLength(0);
 const saved=await h.request('alice',{action:'post-draft',answers:{post:Array(h.ITEM_COUNT).fill(3),sat:{q1:5}},expectedUpdatedAt:null});expect(saved.status).toBe(200);
 const done=await h.request('alice',submitBody(h,undefined,saved.data.updatedAt));expect(done.status).toBe(200);expect(done.data.status).toBe('submitted');expect(done.data.submittedAt).toBeTruthy();
 const row=h.state.assessments.find(x=>x.phase==='post');expect(row.status).toBe('submitted');expect(row.answers.sat.q7txt).toBe('가'.repeat(200));
 expect((await h.request('alice')).data.assessment).toEqual(done.data);
 const edit=Array(h.ITEM_COUNT).fill(4);expect((await h.request('alice',h.payload(edit,done.data.updatedAt))).status).toBe(409);expect(row.answers.post).toEqual(Array(h.ITEM_COUNT).fill(3));
 expect(h.pre).toEqual(before);
});
test('duplicate submit creates no second record and a different resubmit is refused',async()=>{
 const h=setup();h.state.submitRpc=modelRpc(h);
 const both=await Promise.all([h.request('alice',submitBody(h)),h.request('alice',submitBody(h))]);
 expect(both.map(x=>x.status)).toEqual([200,200]);expect(both[0].data.submittedAt).toBe(both[1].data.submittedAt);expect(h.state.assessments.filter(x=>x.phase==='post')).toHaveLength(1);
 const again=await h.request('alice',submitBody(h));expect(again.status).toBe(200);expect(again.data).toEqual(both[0].data);
 expect((await h.request('alice',submitBody(h,{...goodSat(h.OPT),q1:1}))).status).toBe(409);expect(h.state.assessments.find(x=>x.phase==='post').answers.sat.q1).toBe(5);
});
test('submit is limited to the submitted-pre participant and fails closed',async()=>{
 const h=setup();h.state.submitRpc=modelRpc(h);const snapshot=structuredClone(h.state.assessments);
 expect((await h.request(null,submitBody(h))).status).toBe(401);
 expect((await h.request('bob',submitBody(h))).status).toBe(403);
 expect((await h.request('counselor',submitBody(h))).status).toBe(403);
 expect((await h.request('alice',{...submitBody(h),participantId:'bob-p'})).status).toBe(400);
 h.state.pending=true;expect((await h.request('alice',submitBody(h))).status).toBe(403);h.state.pending=false;
 h.state.enabled=false;expect((await h.request('alice',submitBody(h))).status).toBe(503);h.state.enabled=true;
 expect(h.state.assessments).toEqual(snapshot);expect(h.state.rpcCalls).toBe(0);
 // The database function re-checks ownership itself, not only the Edge Function.
 expect((await h.state.submitRpc({actor:'bob',target:'alice-p',answers:{},expected_updated_at:null})).error.code).toBe('42501');
 expect(h.state.assessments).toEqual(snapshot);
});
test('submit failures never report success or change data',async()=>{
 const h=setup();
 const saved=await h.request('alice',{action:'post-draft',answers:{post:Array(h.ITEM_COUNT).fill(3)},expectedUpdatedAt:null});const draft=structuredClone(h.state.assessments.find(x=>x.phase==='post'));
 const stale=await h.request('alice',submitBody(h,undefined,'2020-01-01T00:00:00.000Z'));expect(stale.status).toBe(409);expect(h.state.rpcCalls).toBe(0);
 for(const [error,status] of [[{code:'40001'},409],[{code:'55006'},409],[{code:'42501'},403],[{code:'22023'},400],[{code:'23505'},409],[{code:'XX000'},500]]){
  h.state.submitRpc=async()=>({data:null,error});const r=await h.request('alice',submitBody(h,undefined,saved.data.updatedAt));expect(r.status).toBe(status);expect(r.data.status).toBeUndefined();
 }
 for(const data of [null,{status:'draft'},{status:'submitted',answers:{post:Array(h.ITEM_COUNT).fill(3),sat:{...goodSat(h.OPT),q1:1}},updated_at:'2026-11-01T00:00:00.000Z',submitted_at:'2026-11-01T00:00:00.000Z'}]){
  h.state.submitRpc=async()=>({data,error:null});const r=await h.request('alice',submitBody(h,undefined,saved.data.updatedAt));expect(r.status).toBe(500);expect(r.data.status).toBeUndefined();
 }
 expect(h.state.assessments.find(x=>x.phase==='post')).toEqual(draft);
});

// ---- DEV-008: counselor pre/post comparison -------------------------------------------------
function compareSetup(){
 const h=setup();h.state.submitRpc=modelRpc(h);
 h.state.profiles.push({user_id:'counselor2',organization_id:'org1',role:'counselor'},{user_id:'other-c',organization_id:'org2',role:'counselor'});
 h.pre.answers.pre=[1,2,3,4,5,5,4,3,2,1,3,3,3,1,5];return h;
}
const POST_ITEMS=[5,5,5,4,4,4,3,3,3,2,2,2,1,1,1];
test('assigned counselor reads submitted pre/post comparison and satisfaction exactly',async()=>{
 const h=compareSetup(),{toScore,ITEMS_PER_AREA}=h.evalConfig;
 expect((await h.request('alice',submitBody(h,undefined,null,POST_ITEMS))).status).toBe(200);
 const r=await h.request('counselor',null,'?compare=alice-p');expect(r.status).toBe(200);
 expect(Object.keys(r.data).sort()).toEqual(['areas','evaluationVersion','items','participantId','postSubmittedAt','preDate','preSubmittedAt','sat']);
 const area=(a,i)=>toScore(a.slice(i*ITEMS_PER_AREA,(i+1)*ITEMS_PER_AREA).reduce((x,y)=>x+y,0));
 expect(r.data.areas).toEqual([0,1,2,3,4].map(i=>({pre:area(h.pre.answers.pre,i),post:area(POST_ITEMS,i),diff:Math.round((area(POST_ITEMS,i)-area(h.pre.answers.pre,i))*10)/10})));
 expect(r.data.areas[0]).toEqual({pre:area([1,2,3],0),post:100,diff:Math.round((100-area([1,2,3],0))*10)/10});
 expect(r.data.items).toEqual({pre:h.pre.answers.pre,post:POST_ITEMS});expect(r.data.sat).toEqual(goodSat(h.OPT));expect(r.data.evaluationVersion).toBe('macro-chart-v1-unverified');
 const list=await h.request('counselor',null,'');expect(list.data.postAssessments).toEqual([{participant_id:'alice-p',status:'submitted',submitted_at:r.data.postSubmittedAt}]);
});
test('comparison is denied to other counselors, other organizations, participants and closed gates',async()=>{
 const h=compareSetup();expect((await h.request('alice',submitBody(h,undefined,null,POST_ITEMS))).status).toBe(200);
 for(const user of ['counselor2','other-c','alice','bob'])expect((await h.request(user,null,'?compare=alice-p')).status).toBe(403);
 for(const id of ['other-p','bob-p','missing',''])expect((await h.request('counselor',null,'?compare='+id)).status).toBe(403);
 expect((await h.request(null,null,'?compare=alice-p')).status).toBe(401);
 h.state.pending=true;expect((await h.request('counselor',null,'?compare=alice-p')).status).toBe(403);h.state.pending=false;
 h.state.enabled=false;expect((await h.request('counselor',null,'?compare=alice-p')).status).toBe(503);
 expect('postAssessments' in (await h.request('counselor',null,'')).data).toBe(false);
 h.state.enabled=true;expect((await h.request('counselor2',null,'')).data.postAssessments).toEqual([]);
});
test('unsubmitted post answers are never exposed to the counselor',async()=>{
 const h=compareSetup();
 expect((await h.request('alice',{action:'post-draft',answers:{post:POST_ITEMS,sat:{q1:5,q7txt:'초안 의견'}},expectedUpdatedAt:null})).status).toBe(200);
 const r=await h.request('counselor',null,'?compare=alice-p');expect(r.status).toBe(403);expect(JSON.stringify(r.data)).not.toContain('초안 의견');
 const list=await h.request('counselor',null,'');expect(list.data.postAssessments).toEqual([{participant_id:'alice-p',status:'draft',submitted_at:null}]);
 expect(JSON.stringify(list.data)).not.toContain('초안 의견');
});

// ---- DEV-009B-1: draft writes go through one database function ------------------------------
test('draft saves call the draft RPC with the authenticated actor and record history',async()=>{
 const h=setup(),a=Array(h.ITEM_COUNT).fill(null);a[0]=3;
 const saved=await h.request('alice',h.payload(a));expect(saved.status).toBe(200);
 expect(h.state.rpcLog).toEqual(['secondcareer_post_draft_v1']);expect(h.state.history).toEqual([{actor:'alice',action:'post-draft',before:null}]);
 a[1]=4;expect((await h.request('alice',h.payload(a,saved.data.updatedAt))).status).toBe(200);expect(h.state.history[1].before.post[1]).toBeNull();
 // The database re-checks ownership even if the Edge Function were bypassed.
 expect((await modelDraftRpc(h.state)({actor:'bob',target:'alice-p',answers:{post:a},expected_updated_at:null})).error.code).toBe('42501');
});
test('draft RPC errors and unconfirmed results never report a saved draft',async()=>{
 const h=setup(),a=Array(h.ITEM_COUNT).fill(null);
 for(const [code,status] of [['22023',400],['42501',403],['40001',409],['55006',409],['23505',409],['XX000',500]]){
  h.state.draftRpc=async()=>({data:null,error:{code}});const r=await h.request('alice',h.payload(a));expect(r.status).toBe(status);expect(r.data.status).toBeUndefined();
 }
 for(const data of [null,{status:'submitted',answers:{post:a},updated_at:'2026-11-01T00:00:00.000Z'},{status:'draft',answers:{post:Array(h.ITEM_COUNT).fill(5)},updated_at:'2026-11-01T00:00:00.000Z'},{status:'draft',answers:{post:a},updated_at:'not a time'}]){
  h.state.draftRpc=async()=>({data,error:null});const r=await h.request('alice',h.payload(a));expect(r.status).toBe(500);expect(r.data.status).toBeUndefined();
 }
 expect(h.state.assessments.filter(x=>x.phase==='post')).toHaveLength(0);
});
test('a version string formatted differently by the database still matches the same instant',async()=>{
 const h=setup(),a=Array(h.ITEM_COUNT).fill(null);a[0]=1;const saved=await h.request('alice',h.payload(a));
 const row=h.state.assessments.find(x=>x.phase==='post');row.updated_at=row.updated_at.replace('Z','+00:00');
 let sent;h.state.draftRpc=async args=>{sent=args.expected_updated_at;return modelDraftRpc(h.state)(args)};
 a[0]=2;const next=await h.request('alice',h.payload(a,saved.data.updatedAt));expect(next.status).toBe(200);
 expect(sent.endsWith('+00:00')).toBe(true);
 expect((await h.request('alice',h.payload([5,...a.slice(1)],'2020-01-01T00:00:00.000Z'))).status).toBe(409);
});

// ---- DEV-014: counselor approval gates every post read and write ----------------------------
const approve=(h,user,participantId='alice-p')=>h.request(user,{action:'post-approve',participantId},'');
test('without approval the participant cannot read, save or submit post answers',async()=>{
 const h=setup();h.state.submitRpc=modelRpc(h);h.state.approvals.length=0;const snapshot=structuredClone(h.state.assessments);
 const read=await h.request('alice');expect(read.status).toBe(403);expect(read.data.error).toBe('POST_NOT_APPROVED');
 expect((await h.request('alice',h.payload())).data.error).toBe('POST_NOT_APPROVED');
 expect((await h.request('alice',submitBody(h))).data.error).toBe('POST_NOT_APPROVED');
 expect(h.state.assessments).toEqual(snapshot);expect(h.state.rpcLog).toEqual([]);
 // The database functions re-check approval even if the Edge Function were bypassed.
 expect((await modelDraftRpc(h.state)({actor:'alice',target:'alice-p',answers:{post:Array(h.ITEM_COUNT).fill(null)},expected_updated_at:null})).error.code).toBe('42501');
 expect((await h.state.submitRpc({actor:'alice',target:'alice-p',answers:submitBody(h).answers,expected_updated_at:null})).error.code).toBe('42501');
 expect(h.state.assessments).toEqual(snapshot);
});
test('lists report approval to the participant and approval state, not the approver, to the counselor',async()=>{
 const h=compareSetup();
 expect((await h.request('alice',null,'')).data.postApproved).toBe(true);
 const list=await h.request('counselor',null,'');expect(list.data.postApprovals).toEqual([{participant_id:'alice-p',approved_at:'2026-01-02T00:00:00.000Z',source:'counselor'}]);
 expect(JSON.stringify(list.data)).not.toContain('approved_by');
 h.state.approvals.length=0;expect((await h.request('alice',null,'')).data.postApproved).toBe(false);
 h.state.enabled=false;expect('postApproved' in (await h.request('alice',null,'')).data).toBe(false);expect('postApprovals' in (await h.request('counselor',null,'')).data).toBe(false);
});
test('the assigned counselor approves once after pre submission, then the participant can write',async()=>{
 const h=compareSetup();h.state.approvals.length=0;
 const first=await approve(h,'counselor');expect(first.status).toBe(200);expect(first.data).toEqual({participantId:'alice-p',approvedAt:h.state.approvals[0].approved_at,source:'counselor'});
 expect(h.state.approvals).toEqual([{participant_id:'alice-p',approved_by:'counselor',source:'counselor',approved_at:first.data.approvedAt}]);
 const again=await approve(h,'counselor');expect(again.data).toEqual(first.data);expect(h.state.approvals).toHaveLength(1);
 expect(h.state.rpcLog.filter(n=>n==='secondcareer_post_approve_v1')).toHaveLength(1);
 expect((await h.request('alice',h.payload())).status).toBe(200);
});
test('approval is refused to others, before pre submission, after post submission and when closed',async()=>{
 const h=compareSetup();h.state.approvals.length=0;
 expect((await approve(h,'alice')).status).toBe(403);expect((await approve(h,'counselor2')).status).toBe(403);expect((await approve(h,'other-c')).status).toBe(403);
 expect((await approve(h,'counselor','other-p')).status).toBe(403);expect((await approve(h,'counselor','missing')).status).toBe(403);
 const pre=await approve(h,'counselor','bob-p');expect(pre.status).toBe(403);expect(pre.data.error).toBe('PRE_REQUIRED');
 expect((await h.request('counselor',{action:'post-approve'},'')).status).toBe(400);expect((await h.request('counselor',{action:'post-approve',participantId:'alice-p',extra:1},'')).status).toBe(400);
 expect((await approve(h,null)).status).toBe(401);h.state.pending=true;expect((await approve(h,'counselor')).status).toBe(403);h.state.pending=false;
 h.state.enabled=false;expect((await approve(h,'counselor')).status).toBe(503);h.state.enabled=true;
 h.state.assessments.push({id:'post-x',participant_id:'alice-p',phase:'post',status:'submitted',answers:{post:Array(h.ITEM_COUNT).fill(3),sat:goodSat(h.OPT)},updated_at:'2026-01-03T00:00:00.000Z',submitted_at:'2026-01-03T00:00:00.000Z'});
 const locked=await approve(h,'counselor');expect(locked.status).toBe(409);expect(locked.data.error).toBe('LOCKED');
 expect(h.state.approvals).toEqual([]);expect(h.state.rpcLog).not.toContain('secondcareer_post_approve_v1');
 // The database function re-checks assignment and state itself.
 expect((await modelApproveRpc(h.state)({actor:'counselor2',target:'alice-p'})).error.code).toBe('42501');
 expect((await modelApproveRpc(h.state)({actor:'counselor',target:'alice-p'})).error.code).toBe('55006');
 expect(h.state.approvals).toEqual([]);
});
test('backfilled approvals are reported as such and approval errors never report success',async()=>{
 const h=compareSetup();h.state.approvals.splice(0,1,{participant_id:'alice-p',approved_by:null,source:'backfill',approved_at:'2026-01-02T00:00:00.000Z'});
 expect((await h.request('counselor',null,'')).data.postApprovals[0].source).toBe('backfill');
 expect((await approve(h,'counselor')).data).toEqual({participantId:'alice-p',approvedAt:'2026-01-02T00:00:00.000Z',source:'backfill'});
 h.state.approvals.length=0;
 for(const [code,status] of [['42501',403],['55006',409],['22023',400],['XX000',500]]){h.state.approveRpc=async()=>({data:null,error:{code}});expect((await approve(h,'counselor')).status).toBe(status)}
 for(const data of [null,{approved_at:'not a time',source:'counselor'},{approved_at:'2026-01-02T00:00:00.000Z',source:'other'}]){h.state.approveRpc=async()=>({data,error:null});const r=await approve(h,'counselor');expect(r.status).toBe(500);expect(r.data.approvedAt).toBeUndefined()}
});