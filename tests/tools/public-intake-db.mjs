// Real PostgREST/PostgreSQL integration runner. Never accepts a hosted URL.
// Requires an isolated migrated Supabase and an EMPTY fixture organization.
import {createRequire} from 'node:module';
import {randomUUID,randomBytes,webcrypto} from 'node:crypto';
import vm from 'node:vm';
import fs from 'node:fs';
const require=createRequire(import.meta.url),{buildSync}=require('esbuild');
const base=process.env.INTAKE_TEST_URL,key=process.env.INTAKE_TEST_SERVICE_KEY,org=process.env.INTAKE_TEST_ORG;
if(!base||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)||!key||!org)throw Error('Isolated localhost test URL, key and empty organization required');
async function rest(path,method='GET',body){
 const r=await fetch(base+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Local test DB request failed');return r.status===204?null:await r.json();
}
const check=(ok,label)=>{if(!ok)throw Error(label)};
const rows=()=>rest('participants?select=id&organization_id=eq.'+org);
check((await rows()).length===0,'Fixture organization must be empty');
const link=randomUUID();await rest('public_intake_links','POST',{id:link,organization_id:org,enabled:true,expires_at:new Date(Date.now()+3600000).toISOString()});
const module={exports:{}};vm.runInNewContext(buildSync({entryPoints:['supabase/functions/secondcareer-public-assessment/service.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,{module,exports:module.exports,crypto:webcrypto,Request,Response,TextEncoder,TextDecoder,Uint8Array});
const handler=module.exports.makeHandler({rpc:async(name,args)=>({data:await rest('rpc/'+name,'POST',args)})},()=>true);
const call=async(b)=>{const r=await handler(new Request('http://localhost/intake',{method:'POST',body:JSON.stringify(b)}));return {status:r.status,data:await r.json()}};
const fixture=JSON.parse(fs.readFileSync('tests/snapshot/fixture.json','utf8')).db[0];
const answers=Object.fromEntries(['reg','goal','expect','done','pre'].map(k=>[k,fixture[k]]));
const b={action:'start',linkId:link,intakeId:randomUUID(),accessToken:randomBytes(32).toString('base64url'),requestId:randomUUID()};
check((await call(b)).status===200,'start');check((await call(b)).status===200,'start retry');
check((await call({...b,action:'draft',version:0,requestId:randomUUID(),answers})).status===200,'draft');
check((await call({...b,action:'read'})).data.answers.reg.name===answers.reg.name,'resume');
check((await call({...b,action:'read',accessToken:randomBytes(32).toString('base64url')})).status===403,'forged token');
const link2=randomUUID();await rest('public_intake_links','POST',{id:link2,organization_id:org,enabled:true,expires_at:new Date(Date.now()+3600000).toISOString()});
check((await call({...b,linkId:link2,action:'read'})).status===403,'cross link scope');
const submit={...b,action:'submit',version:1,requestId:randomUUID(),answers};
const otherSubmit={...submit,requestId:randomUUID()};
const parallel=await Promise.all([call(submit),call(otherSubmit)]);
check(parallel.filter(r=>r.status===200).length===1&&parallel.filter(r=>r.status===409).length===1,'concurrent submit');
check((await rows()).length===1,'single participant');
const stored=await rest('participants?select=id,auth_user_id,company_id,counselor_user_id&organization_id=eq.'+org);
check(['auth_user_id','company_id','counselor_user_id'].every(k=>stored[0][k]===null),'unassigned/authless');
const assessment=await rest('assessments?select=id,result,answers&participant_id=eq.'+stored[0].id);
check(assessment.length===1&&assessment[0].result.raw.length>0,'linked server result');
const winning=parallel[0].status===200?submit:otherSubmit;
// The winning request ID is retained so a lost HTTP response is recoverable exactly.
check((await call(winning)).status===200,'lost response retry');
check((await rows()).length===1,'no duplicate after retry');
// Force a DB-level failure and verify the participant insert cannot survive it.
const failed={...b,intakeId:randomUUID(),requestId:randomUUID()};await call(failed);
const failedResult=await rest('rpc/secondcareer_public_intake_v1','POST',{
 p_action:'submit',p_link:link,p_id:failed.intakeId,p_hash:await module.exports.digest(failed.accessToken),
 p_request:randomUUID(),p_fingerprint:'failure-test',p_version:0,p_answers:{reg:{name:null}},p_result:{}});
check(failedResult.error==='STORAGE_UNAVAILABLE','DB constraint failure');
check((await rows()).length===1,'atomic rollback');
check((await call({...failed,action:'status'})).data.version===0,'state rollback');
await rest('public_intakes?id=eq.'+b.intakeId,'PATCH',{expires_at:new Date(Date.now()-1000).toISOString()});
check((await call({...b,action:'status'})).status===403,'expired token');
// Anonymous direct Data API access cannot read sessions or invoke the service-only RPC.
const anon=process.env.INTAKE_TEST_ANON_KEY;
if(!anon)throw Error('Local anon key required for RLS/ACL checks');
for(const path of ['public_intakes?select=*','rpc/secondcareer_public_intake_v1']){
 const r=await fetch(base+'/rest/v1/'+path,{method:path.startsWith('rpc/')?'POST':'GET',headers:{apikey:anon,Authorization:'Bearer '+anon,'Content-Type':'application/json'},...(path.startsWith('rpc/')?{body:'{}'}:{}),signal:AbortSignal.timeout(10000)});
 check(!r.ok,'anon ACL denied');
}
console.log('Local PostgreSQL/RPC integration assertions passed; fixture data remains in isolated DB only.');
