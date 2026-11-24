import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {createHash,randomUUID,randomBytes,webcrypto} from 'node:crypto';
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

test('optional link expiry migration recognizes the original RPC and changes only link checks and new intake expiry',()=>{
 const original=fs.readFileSync('supabase/migrations/20261123000000_public_assessment_intake.sql','utf8').replace(/\r\n/g,'\n');
 const migration=fs.readFileSync('supabase/migrations/20261124000000_public_intake_optional_link_expiry.sql','utf8');
 const body=original.match(/ as \$\$([\s\S]*?)\$\$;/)[1];
 const hash=createHash('md5').update(body).digest('hex');
 expect(migration).toContain(`md5(replace(prosrc, E'\\r\\n', E'\\n')) = '${hash}'`);
 const replacements=[...migration.matchAll(/^\s*'((?:''|[^'\r\n])+)'(?:[),;])+$/gm)].slice(-4)
   .map(match=>match[1].replaceAll("''","'"));
 expect(replacements).toEqual([
  'where id=p_link and enabled and expires_at>ts for share;',
  'where id=p_link and enabled and (expires_at is null or expires_at>ts) for share;',
  "least(l.expires_at,ts+interval '7 days')",
  "case when l.expires_at is null then ts+interval '7 days' else least(l.expires_at,ts+interval '7 days') end"
 ]);
 for(const source of [replacements[0],replacements[2]])expect(body.split(source)).toHaveLength(2);
 expect(migration.match(/alter table [^;]+;/gi)).toEqual(['alter table public.public_intake_links alter column expires_at drop not null;']);
});

test('public protocol forwards only hashed capability and RPC result; no report or identity leakage',async()=>{
 let captured;
 const expiresAt='2035-01-08T00:00:00Z';
 const h=makeHandler({rpc:async(name,p)=>{captured={name,p};return {data:{status:'draft',version:0,expiresAt,participantId:'secret',result:{raw:[1]}}}}},()=>true);
 const b=request(),r=await call(h,b);
 expect(r.status).toBe(200);expect(captured.p.p_hash).toMatch(/^[0-9a-f]{64}$/);expect(JSON.stringify(captured)).not.toContain(b.accessToken);
 expect(r.data.expiresAt).toBe(expiresAt);
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
test('draft rejects missing or refused consent before invoking storage',async()=>{
 let calls=0;const h=makeHandler({rpc:async()=>{calls++;return {data:{status:'draft',version:1}}}},()=>true);
 for(const consent of ['미동의','']){
  const a=answers();a.reg.a1=consent;a.reg.consent=false;
  const r=await call(h,{...request(),action:'draft',version:0,answers:a});
  expect(r.status).toBe(400);expect(r.data.error).toBe('CONSENT_REQUIRED');
 }
 expect(calls).toBe(0);
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
