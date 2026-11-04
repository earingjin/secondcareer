import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve-static.mjs';
const require=createRequire(import.meta.url),{transformSync}=require('esbuild');
const configModule={exports:{}};
vm.runInNewContext(transformSync(fs.readFileSync('supabase/functions/secondcareer-assessment/js/02-eval-config.js','utf8'),{format:'cjs'}).code,{module:configModule,exports:configModule.exports});
const {ITEM_COUNT}=configModule.exports;

function setup({extraParts=[],extraAssessments=[],extraLookup=[],cap=Infinity,failTable=null,failAfter=0,base=true}={}){
  const profiles=[{user_id:'c1',organization_id:'org1',role:'counselor'},{user_id:'c2',organization_id:'org1',role:'counselor'},{user_id:'p1',organization_id:'org1',role:'participant'}];
  const parts=[...(base?[{id:'own',auth_user_id:'p1',organization_id:'org1',counselor_user_id:'c1',display_name:'담당'},
    {id:'missing',auth_user_id:null,organization_id:'org1',counselor_user_id:'c1',display_name:'미연결'},
    {id:'other',auth_user_id:'p2',organization_id:'org1',counselor_user_id:'c2',display_name:'다른 상담사'},
    {id:'unassigned',auth_user_id:'p3',organization_id:'org1',counselor_user_id:null,display_name:'미배정'},
    {id:'cross-org',auth_user_id:'p4',organization_id:'org2',counselor_user_id:'c1',display_name:'다른 조직'}]:[]),...extraParts];
  const lookup=[{user_id:'p1',login_id:'my-id',internal_email:'private@example.invalid'},...['p2','p3','p4'].map(user_id=>({user_id,login_id:'secret-'+user_id,internal_email:'private@example.invalid'})),...extraLookup];
  const calls=[];let handler,failedReads=0;
  const db={auth:{getUser:async token=>({data:{user:profiles.some(p=>p.user_id===token)?{id:token,app_metadata:{}}:null},error:null})},async rpc(name,args){calls.push({name,values:[args.target],args});return {data:{assessmentId:'fixture',status:'submitted',updatedAt:'new-revision'},error:null}},from(name){
    let rows=({participants:parts,user_profiles:profiles,server_login_lookup:lookup,assessments:extraAssessments,assessment_history:[]})[name]||[],columns='*',limit=Infinity,order;
    const q={select(c){columns=c;return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},gt(k,v){rows=rows.filter(r=>r[k]>v);return q},order(k){order=k;return q},in(k,v){calls.push({name,key:k,values:[...v]});rows=rows.filter(r=>v.includes(r[k]));return q},limit(n){limit=n;return q},maybeSingle:async()=>({data:rows[0]||null,error:null}),then(resolve,reject){const fields=columns.split(',');const sorted=order?[...rows].sort((a,b)=>a[order]<b[order]?-1:a[order]>b[order]?1:0):rows;return Promise.resolve(failTable===name&&failedReads++>=failAfter?{data:null,error:{code:'TEST_ERROR'}}:{data:sorted.slice(0,Math.min(limit,cap)).map(row=>Object.fromEntries(fields.map(k=>[k,row[k]]))),error:null}).then(resolve,reject)}};return q;
  }};
  const context=vm.createContext({Request,Response,URL,TextEncoder,TextDecoder,Uint8Array,Date,Math,Deno:{env:{get:()=> 'fixture'},serve:f=>{handler=f}}});
  const cache=new Map(),root=path.resolve('supabase/functions/secondcareer-assessment');
  function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);
    const code=transformSync(fs.readFileSync(file,'utf8'),{loader:file.endsWith('.ts')?'ts':'js',format:'cjs',target:'es2022'}).code;
    vm.runInContext('(function(require,module,exports){'+code+'\n})',context,{filename:file})(s=>s.startsWith('npm:')?{createClient:()=>db}:load(path.resolve(path.dirname(file),s)),module,module.exports);return module.exports;}
  load(path.join(root,'index.ts'));
  return {calls,options:load(path.join(root,'js/03-options.js')).OPT,async request(token,id,body){const r=await handler(new Request('https://example.invalid/'+(id?'?id='+encodeURIComponent(id):''),{method:body?'POST':'GET',headers:{authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,data:await r.json()}}};
}

test('assessment only returns login IDs for filtered assigned participants',async()=>{
  const h=setup(),response=await h.request('c1');expect(response.status).toBe(200);
  expect(response.data.participants.map(p=>[p.id,p.login_id])).toEqual([['missing',null],['own','my-id']]);
  expect(h.calls.filter(c=>c.name==='server_login_lookup')).toEqual([{name:'server_login_lookup',key:'user_id',values:['p1']},{name:'server_login_lookup',key:'user_id',values:['p1']}]);
  expect(JSON.stringify(response.data)).not.toMatch(/private@example|secret-p[234]|auth_user_id|internal_email/);
  h.calls.length=0;const participant=await h.request('p1');expect(participant.status).toBe(200);
  expect(participant.data.participants).toHaveLength(1);expect(participant.data.participants[0].login_id).toBeUndefined();
  expect(h.calls.some(c=>c.name==='server_login_lookup')).toBe(false);
  h.calls.length=0;const other=await h.request('c2');expect(other.data.participants.map(p=>p.login_id)).toEqual(['secret-p2']);
  expect(JSON.stringify(other.data)).not.toContain('my-id');
});

function population(count){
 const parts=[],assessments=[],lookup=[];
 for(let i=0;i<count;i++){
  const id=`fixture-${String(i).padStart(4,'0')}`,owner=`user-${String(i).padStart(4,'0')}`;
  parts.push({id,auth_user_id:owner,organization_id:'org1',counselor_user_id:'c1',display_name:i%2?'동명':'대상 '+i});
  lookup.push({user_id:owner,login_id:'id-'+i});
  assessments.push({id:'a-'+id,participant_id:id,phase:'pre',status:i%2?'submitted':'draft',answers:{reg:{name:i%2?'동명':'대상 '+i,careers:[{}]},goal:{},expect:{},done:{},pre:Array(ITEM_COUNT).fill(3)},result:{comment:'',kw:{age:null,goal:null,pro:{text:'fixture'}}},updated_at:'2026-01-01',submitted_at:i%2?'2026-01-01':null});
 }
 return {extraParts:parts.reverse(),extraAssessments:assessments.reverse(),extraLookup:lookup.reverse(),base:false};
}
for(const count of [0,1,100,101,250])test(`assigned participant pagination returns ${count} unique rows`,async()=>{
 const fixture=population(count);
 fixture.extraParts.push({id:'wrong-org',auth_user_id:'p4',organization_id:'org2',counselor_user_id:'c1',display_name:'excluded'},
  {id:'wrong-counselor',auth_user_id:'p3',organization_id:'org1',counselor_user_id:'c2',display_name:'excluded'});
 const h=setup({...fixture,cap:37}),response=await h.request('c1');
 expect(response.status).toBe(200);expect(response.data.participants).toHaveLength(count);
 const ids=response.data.participants.map(p=>p.id);expect(new Set(ids).size).toBe(count);expect(ids).toEqual([...ids].sort());
 expect(response.data.assessments).toHaveLength(count);
 expect(new Set(response.data.assessments.map(a=>a.participant_id))).toEqual(new Set(ids));
 expect(response.data.participants.every(p=>p.login_id?.startsWith('id-'))).toBe(true);
 expect(h.calls.every(c=>c.values.length<=100)).toBe(true);
});
test('later assigned submission can be reported; another organization and counselor remain blocked',async()=>{
 const fixture=population(250);fixture.extraParts.push({id:'wrong-org',auth_user_id:'p4',organization_id:'org2',counselor_user_id:'c1',display_name:'excluded'}, {id:'wrong-counselor',auth_user_id:'p3',organization_id:'org1',counselor_user_id:'c2',display_name:'excluded'});
 const h=setup({...fixture,cap:37});
 const report=await h.request('c1','fixture-0249');expect(report.status).toBe(200);expect(report.data.html).toContain('동명');
 expect(h.calls.filter(c=>c.name==='assessments').every(c=>c.values.length===1)).toBe(true);
 expect(h.calls.some(c=>c.name==='server_login_lookup')).toBe(false);
 expect((await h.request('c2','fixture-0249')).status).toBe(403);
 expect((await h.request('c1','wrong-org')).status).toBe(403);expect((await h.request('c1','wrong-counselor')).status).toBe(403);
});
test('a failed paged read fails closed instead of returning a partial list',async()=>{
 const h=setup({...population(101),cap:37,failTable:'assessments',failAfter:1}),r=await h.request('c1');
 expect(r.status).toBe(500);expect(r.data.error).toBe('QUERY_FAILED');expect(r.data.participants).toBeUndefined();
});
test('an assigned submission beyond the first page remains editable and recalculated',async()=>{
 const fixture=population(250),h=setup({...fixture,cap:37}),o=h.options;
 const answers={reg:{a1:'동의',consent:true,name:'동명',gender:'남',birthDate:'1966-01-01',birth:'1966',phone:'010-0000-0000',email:'fixture@example.invalid',careers:[{co:'가상 기업',title:'직책',task:'업무'}],industry:o['reg.industry'][0],income:o['reg.income'][0]},goal:{b11:o['goal.b11'].slice(0,1),b12:o['goal.b12'].slice(0,1),b13:o['goal.b13'].slice(0,2),b14:o['goal.b14'].slice(0,1),b15:'70',b16:'6'},pre:Array(ITEM_COUNT).fill(3),expect:{d32:o['expect.d32'].slice(0,1),d33:o['expect.d33'].slice(0,3),d34:o['expect.d34'].slice(0,1),d35:o['expect.d35'].slice(0,2),d36:o['expect.d36'].slice(0,1)},done:{reg:true,goal:true,expect:true}};
 const old=fixture.extraAssessments.find(a=>a.participant_id==='fixture-0249');old.answers=structuredClone(answers);
 answers.reg.name='수정한 이름';const r=await h.request('c1',null,{action:'edit',participantId:'fixture-0249',answers,expectedUpdatedAt:old.updated_at});
 expect(r.status).toBe(200);const write=h.calls.find(c=>c.name==='secondcareer_write_v1');expect(write.args.target).toBe('fixture-0249');expect(write.args.calculated).toBeTruthy();
 expect((await h.request('c2',null,{action:'edit',participantId:'fixture-0249',answers,expectedUpdatedAt:old.updated_at})).status).toBe(403);
});

test('250-person live list searches duplicate names, filters status and opens the last report',async({page})=>{
 const h=setup({...population(250),cap:37}),server=await serve('src');
 try{
  await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
  await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url());let result;
   if(req.method()==='OPTIONS')return route.fulfill({status:204});
   if(url.pathname.endsWith('secondcareer-login'))result={status:200,data:{access_token:'fixture-token',refresh_token:'fixture-refresh',expires_in:3600}};
   else if(url.pathname.endsWith('secondcareer-account'))result={status:200,data:{profile:{role:'counselor',display_name:'상담사'},mustChangePassword:false,registrationAvailable:false}};
   else if(url.pathname.endsWith('secondcareer-assessment'))result=await h.request('c1',url.searchParams.get('id'));
   else throw Error('unexpected request');
   return route.fulfill({status:result.status,contentType:'application/json',body:JSON.stringify(result.data)});
  });
  await page.goto(server.url);await page.locator('#lg-id').fill('consult01');await page.locator('#lg-pw').fill('fixture-password');await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page.locator('#plist tbody tr[data-participant]')).toHaveCount(250);
  await page.locator('#cns-name').fill('동명');await page.locator('#plist button[type="submit"]').click();
  await expect(page.locator('#plist tbody tr[data-participant]')).toHaveCount(125);
  await page.locator('#cns-status').selectOption('submitted');await expect(page.locator('#plist tbody tr[data-participant]')).toHaveCount(125);
  await page.locator('[data-participant="fixture-0249"] button[onclick^="openRes"]').first().click();
  await expect(page.locator('.sheet')).toHaveCount(5);await expect(page.locator('.sheet').first()).toContainText('동명');
  await page.evaluate(()=>{window.printCalls=0;window.print=()=>window.printCalls++});
  await page.getByRole('button',{name:'PDF로 저장(인쇄)',exact:true}).click();expect(await page.evaluate(()=>window.printCalls)).toBe(1);
 }finally{await server.close()}
});
