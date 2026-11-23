import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {randomUUID,randomBytes,webcrypto} from 'node:crypto';
import fs from 'node:fs';
const require=createRequire(import.meta.url),{buildSync}=require('esbuild');
const code=buildSync({entryPoints:['supabase/functions/secondcareer-public-assessment/service.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const module={exports:{}};
vm.runInNewContext(code,{module,exports:module.exports,crypto:webcrypto,Request,Response,TextEncoder,TextDecoder,Uint8Array});
const {makeHandler}=module.exports;
const bundle=buildSync({stdin:{contents:`export {computeResult} from './supabase/functions/secondcareer-assessment/js/05-engine.js'; export {missing,sanitize} from './supabase/functions/secondcareer-assessment/shared/pre-validation.ts';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const engine={exports:{}};vm.runInNewContext(bundle,{module:engine,exports:engine.exports,crypto:webcrypto,Uint32Array,TextEncoder});
const fixture=JSON.parse(fs.readFileSync('tests/snapshot/fixture.json','utf8')).db[0];
const answers=()=>Object.fromEntries(['reg','goal','expect','done','pre'].map(k=>[k,structuredClone(fixture[k])]));
const request=()=>({action:'start',linkId:randomUUID(),intakeId:randomUUID(),requestId:randomUUID(),accessToken:randomBytes(32).toString('base64url')});
const call=async(h,b)=>{const r=await h(new Request('http://localhost/intake',{method:'POST',body:JSON.stringify(b)}));return {status:r.status,data:await r.json()}};

test('public protocol forwards only hashed capability and RPC result; no report or identity leakage',async()=>{
 let captured;
 const h=makeHandler({rpc:async(name,p)=>{captured={name,p};return {data:{status:'draft',version:0,expiresAt:'2026-11-30',participantId:'secret',result:{raw:[1]}}}}},()=>true);
 const b=request(),r=await call(h,b);
 expect(r.status).toBe(200);expect(captured.p.p_hash).toMatch(/^[0-9a-f]{64}$/);expect(JSON.stringify(captured)).not.toContain(b.accessToken);
 expect(r.data).not.toHaveProperty('result');expect(r.data).not.toHaveProperty('participantId');
});
test('reuse complete validation except A2 and compute with the existing engine',async()=>{
 let saved;
 const h=makeHandler({rpc:async(_,p)=>{saved=p;return {data:{status:'submitted',version:1}}}},()=>true);
 const a=answers(),b={...request(),action:'submit',version:0,answers:a};
 const r=await call(h,b);expect(r.status).toBe(200);expect(saved.p_result.snapshot.counselor).toBeNull();
 const p={...saved.p_answers};const expected=engine.exports.computeResult(p);
 expect(saved.p_result.raw).toEqual(expected.raw);expect(saved.p_result.area).toEqual(expected.area);
 expect(saved.p_result.kw.age.band).toEqual(expected.kw.age.band);expect(saved.p_result.kw.goal.group).toEqual(expected.kw.goal.group);
 expect(engine.exports.missing({...a,counselor:null}).map(m=>m.code)).toContain('A2');
 a.reg.name='';expect((await call(h,{...b,answers:a})).data.codes).toContain('A3');
});
test('draft/read/status projection and storage errors fail closed',async()=>{
 const b={...request(),action:'draft',version:0,answers:answers()};let captured;
 const h=makeHandler({rpc:async(_,p)=>{captured=p;return {data:{status:'draft',version:1,answers:b.answers}}}},()=>true);
 expect((await call(h,b)).data).not.toHaveProperty('answers');expect(captured.p_result).toBeNull();
 expect((await call(h,{...request(),action:'read'})).data.answers).toEqual(b.answers);
 for(const [error,status] of [['NOT_FOUND',403],['RATE_LIMITED',429],['CONFLICT',409],['LOCKED',409],['REQUEST_REUSED',409],['STORAGE_UNAVAILABLE',503]]){
  const fail=makeHandler({rpc:async()=>({data:{error}})},()=>true);expect((await call(fail,request())).status).toBe(status);
 }
 expect((await call(makeHandler({rpc:async()=>({error:{message:'private'}})},()=>true),request())).data).toEqual({error:'STORAGE_UNAVAILABLE'});
});
test('unrecognized authority/report operations, malformed tokens, input overflow and disabled service are rejected',async()=>{
 let calls=0;const h=makeHandler({rpc:async()=>{calls++;throw Error('unexpected')}},()=>true);
 for(const b of [{...request(),action:'report'},{...request(),organization_id:randomUUID()},{...request(),accessToken:'forged'},{...request(),junk:'x'.repeat(65536)}])expect((await call(h,b)).status).toBe(400);
 expect(calls).toBe(0);expect((await call(makeHandler({},()=>false),request())).status).toBe(503);
});
test('retry fingerprint ignores key order and random result; sanitized result cannot be supplied by client',async()=>{
 const seen=[];const h=makeHandler({rpc:async(_,p)=>{seen.push(p);return {data:{status:'submitted',version:1}}}},()=>true);
 const b={...request(),action:'submit',version:0,answers:answers()};
 await call(h,b);await call(h,{...b,answers:Object.fromEntries(Object.entries(b.answers).reverse())});
 expect(seen[0].p_fingerprint).toBe(seen[1].p_fingerprint);
 expect((await call(h,{...b,answers:{...b.answers,pre:[999]}})).status).toBe(400);
});
