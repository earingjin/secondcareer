import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{transformSync}=require('esbuild');

// Synthetic database protocol model. It is not a Postgres or Auth integration test.
function setup(){
 const profiles=[{user_id:'alice',organization_id:'org1',role:'participant'},{user_id:'bob',organization_id:'org1',role:'participant'},{user_id:'counselor',organization_id:'org1',role:'counselor'},{user_id:'other',organization_id:'org2',role:'participant'}];
 const participants=[{id:'alice-p',auth_user_id:'alice',organization_id:'org1',counselor_user_id:'counselor',display_name:'가상 A'},{id:'bob-p',auth_user_id:'bob',organization_id:'org1',counselor_user_id:'counselor',display_name:'가상 B'},{id:'other-p',auth_user_id:'other',organization_id:'org2',counselor_user_id:'other-c',display_name:'가상 C'}];
 const pre={id:'pre-a',participant_id:'alice-p',phase:'pre',status:'submitted',answers:{pre:[1,2,3],reg:{},goal:{},expect:{},done:{}},result:{value:'unchanged'},updated_at:'2026-01-01T00:00:00.000Z',submitted_at:'2026-01-01T00:00:00.000Z'};
 const assessments=[pre,{...structuredClone(pre),id:'pre-b',participant_id:'bob-p',status:'draft'},{...structuredClone(pre),id:'pre-o',participant_id:'other-p'}];
 const state={profiles,participants,assessments,failWrite:false,rpcCalls:0,pending:false,enabled:true,revision:0};let handler;
 const db={auth:{getUser:async token=>({data:{user:profiles.some(p=>p.user_id===token)?{id:token,app_metadata:state.pending?{must_change_password:true}:{}}:null},error:null})},rpc:async()=>{state.rpcCalls++;throw Error('pre RPC must not be called')},from(name){
  let rows=({user_profiles:profiles,participants,assessments,server_login_lookup:[],assessment_history:[]})[name]||[],filters=[],inserts=null,updates=null,limit=Infinity,order=null,columns='*';
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
 load(path.join(root,'index.ts'));const {ITEM_COUNT}=load(path.join(root,'js/02-eval-config.js'));
 async function request(user,body,query='?phase=post'){const response=await handler(new Request('https://fixture.invalid/'+query,{method:body?'POST':'GET',headers:user?{authorization:'Bearer '+user}:{},...(body?{body:JSON.stringify(body)}:{})}));return {status:response.status,data:await response.json()}}
 const payload=(post=Array(ITEM_COUNT).fill(null),expectedUpdatedAt=null)=>({action:'post-draft',answers:{post},expectedUpdatedAt});
 return {state,pre,request,payload,ITEM_COUNT};
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
 expect((await h.request('alice')).data.assessment).toEqual(saved.data);expect(h.pre).toEqual(before);expect(h.state.rpcCalls).toBe(0);
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
