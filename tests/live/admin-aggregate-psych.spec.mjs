// REQ-A-010/011/012 admin aggregate screens 4 (psychological stability), 5 (complaint change) and
// 6 (consulting expectation and effect) against the local protocol mock (server-harness.cjs).
// Oracle: the legacy report itself. The same synthetic answers go to legacy repData/rp4/rp5/rp6
// (legacy/index.original.html, unchanged, loaded in the browser) and to the server API; the rendered
// screen bodies are compared. Mock only: no real Postgres, RLS or Auth.
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve-static.mjs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
const TEMPLATE=JSON.parse(fs.readFileSync(new URL('../snapshot/fixture.json',import.meta.url),'utf8')).db[0];
const LEGACY=pathToFileURL(path.resolve('legacy/index.original.html')).href;
// Every column the aggregate function selects from assessments (JSON paths of the stored answers; q7 and q7txt for screen 7; no d36).
const ASSESSMENT_COLUMNS=['id','participant_id','pd32:answers->expect->d32','pd33:answers->expect->d33','pd34:answers->expect->d34','pd35:answers->expect->d35','post:answers->post','pre:answers->pre','q1:answers->sat->q1','q2:answers->sat->q2','q3a:answers->sat->q3a','q3b:answers->sat->q3b','q3c:answers->sat->q3c','q5fit:answers->sat->q5fit','q7:answers->sat->q7','q7txt:answers->sat->q7txt','sd32:answers->sat->d32','sd33:answers->sat->d33','sd34:answers->sat->d34','sd35:answers->sat->d35','status'];

// Option lists and chart labels as the legacy page defines them (same source the server uses).
let O,SHL;
test.beforeAll(async({browser})=>{
  const page=await browser.newPage();await page.goto(LEGACY);
  ({O,SHL}=await page.evaluate(()=>({O:Object.fromEntries(['d32','d33','d34','d35'].map(k=>[k,OPT['expect.'+k]])),SHL:SH})));
  await page.close();
});

const rng=seed=>{let x=seed;return ()=>(x=(x*1103515245+12345)%2147483648)/2147483648};
const pickN=(arr,n,r)=>{const a=[...arr],out=[];for(let k=0;k<n;k++)out.push(a.splice(Math.floor(r()*a.length),1)[0]);return out};
function answers(seed,count){const r=rng(seed);return Array.from({length:count},()=>Array.from({length:15},()=>Math.floor(r()*5)+1))}
function person(r,over={}){
  const sc=()=>Math.floor(r()*5)+1;
  return {
    exp:{d32:pickN(O.d32,1,r),d33:pickN(O.d33,3,r),d34:pickN(O.d34,1,r),d35:pickN(O.d35,2,r)},
    sat:{q1:sc(),q2:sc(),q3a:sc(),q3b:sc(),q3c:sc(),q5fit:sc(),d32:pickN(O.d32,1,r),d33:pickN(O.d33,3,r),d34:pickN(O.d34,1,r),d35:pickN(O.d35,r()<.5?1:2,r),q7:['x'],q7txt:'자유의견원문'},
    ...over
  };
}
// {pre,post,company,exp,sat}; sat = null means no satisfaction answer.
function people(seed,count,{noSat=[],fix=null,companies=['가 기업','나 기업']}={}){
  const pre=answers(seed,count),post=answers(seed+7,count),r=rng(seed+3);
  return pre.map((p,i)=>{const x=person(r);if(fix)fix(x,i);return {pre:p,post:post[i],company:companies[i%companies.length],exp:x.exp,sat:noSat.includes(i)?null:x.sat}});
}
const datasets=()=>({
  varied:people(11,9,{noSat:[2,5]}),
  // Every person gives the same answers: equal counts, so TOP3 order depends on the tie rule only.
  uniform:people(23,6,{fix:x=>{x.exp.d32=[O.d32[1]];x.exp.d33=O.d33.slice(0,3);x.exp.d34=[O.d34[2]];x.exp.d35=O.d35.slice(0,2);x.sat.d32=[O.d32[2]];x.sat.d33=O.d33.slice(0,3);x.sat.d34=[O.d34[2]];x.sat.d35=O.d35.slice(3,5)}}),
  // Complaints before and after do not overlap (pre count 0 with post > 0), mind state flips from positive to not positive.
  extreme:people(37,4,{fix:x=>{x.exp.d32=[O.d32[0]];x.exp.d33=O.d33.slice(0,3);x.sat.d32=[O.d32[5]];x.sat.d33=O.d33.slice(4,7);x.sat.q3a=x.sat.q3b=x.sat.q3c=x.sat.q5fit=1}}),
  allpos:people(41,4,{fix:x=>{x.exp.d32=[O.d32[3]];x.sat.d32=[O.d32[0]];x.sat.q3a=x.sat.q3b=x.sat.q3c=x.sat.q5fit=5}}),
  single:people(53,1)
});
const preExpect=exp=>({...exp,d36:[TEMPLATE.expect.d36[0]]});

function seed(list,{postEnabled=true,extras=true}={}){
  const h=harness(),t=h.state.tables;t.participants.length=0;h.state.postEnabled=postEnabled;
  const add=(id,company,pre,post,{org=ids.org,preStatus='submitted',postStatus='submitted',exp,expRaw,sat,satRaw}={})=>{
    t.participants.push({id,organization_id:org,counselor_user_id:ids.counselor,auth_user_id:'u-'+id,display_name:'개인-'+id,phone:'01012341234',company_name:company});
    if(pre)t.assessments.push({id:'pre-'+id,participant_id:id,phase:'pre',status:preStatus,answers:{reg:{name:'응답원문-'+id},pre,...(expRaw!==undefined?(expRaw===null?{}:{expect:expRaw}):exp?{expect:preExpect(exp)}:{})},result:{comment:'결과원문'}});
    if(post)t.assessments.push({id:'post-'+id,participant_id:id,phase:'post',status:postStatus,answers:{post,...(satRaw!==undefined?{sat:satRaw}:sat?{sat:{...sat}}:{})}});
  };
  list.forEach((p,i)=>add('p'+String(i).padStart(3,'0'),p.company,p.pre,p.post,{exp:p.exp,sat:p.sat}));
  if(extras){
    // None of these may reach the figures; their answers all differ from the datasets' typical picks.
    const [a,b]=answers(99,2);
    const farExp={d32:[O.d32[4]],d33:O.d33.slice(4,7),d34:[O.d34[6]],d35:O.d35.slice(0,2)},farSat={q1:1,q2:1,q3a:1,q3b:1,q3c:1,q5fit:1,d32:[O.d32[4]],d33:O.d33.slice(4,7),d34:[O.d34[6]],d35:O.d35.slice(2,4),q7:['x'],q7txt:'다른 의견'};
    add('x-pre-only','가 기업',a,null,{exp:farExp});
    add('x-post-draft','가 기업',a,b,{postStatus:'draft',exp:farExp,sat:farSat});
    add('x-pre-draft','나 기업',a,b,{preStatus:'draft',exp:farExp,sat:farSat});
    add('x-invalid','나 기업',a,b.slice(0,14),{exp:farExp,sat:farSat});
    add('x-other-org','가 기업',b,a,{org:'other-org',exp:farExp,sat:farSat});
    add('x-none','',null,null);
  }
  return {h,add};
}
const get=(h,token,query='')=>h.call(h.aggregate.handleAdminAggregate,token,undefined,'GET','https://fixture.invalid/'+query);

// Legacy output for the same people: population sizes, rp4/rp5/rp6 bodies, option lists and chart labels.
async function legacy(page,list,{company='전체',extra=[]}={}){
  await page.goto(LEGACY);
  return page.evaluate(({list,extra,template,company})=>{
    DB.length=0;
    [...list,...extra].forEach((p,i)=>DB.push({...structuredClone(template),id:'L'+i,company:p.company,pre:p.pre,post:p.post,expect:{...template.expect,...p.exp},sat:p.sat?{...p.sat}:null}));
    S.rep={company};
    const d=repData(false),out={N:d.N,sv:d.sv.length,SH:{d32:SH.d32,d33:SH.d33,d34:SH.d34,d35:SH.d35},OPT:{d32:OPT['expect.d32'],d33:OPT['expect.d33'],d34:OPT['expect.d34'],d35:OPT['expect.d35']}};
    if(d.sv.length){out.rp4=rp4(d);out.rp5=rp5(d);out.rp6=rp6(d);out.rp7=rp7(d)}
    return out;
  },{list,extra,template:TEMPLATE,company});
}
const norm=h=>h.replace(/\sdata-[a-z-]+(="[^"]*")?/g,'').replace(/\s+/g,' ').replace(/ >/g,'>').replace(/> </g,'><').trim();
const body=h=>norm(h.split('<p class="hintline" data-agg-')[0]);
const views=()=>import('../../src/live/admin-aggregate-view.js');
// Compares two screen bodies and, when they differ, reports only the first differing spot.
function same(actual,expected,label){
  if(actual===expected)return;
  let i=0;while(actual[i]===expected[i])i++;
  throw Error(label+': first difference at '+i+'\nserver: ...'+actual.slice(Math.max(0,i-80),i+120)+'\nlegacy: ...'+expected.slice(Math.max(0,i-80),i+120));
}
const sumOf=a=>a.reduce((x,y)=>x+y,0);

test('9 server screens 4-6 equal legacy rp4/rp5/rp6 for the same answers, including ties and extremes',async({page})=>{
  const {r4View,r5View,r6View}=await views();
  for(const [name,list] of Object.entries(datasets())){
    const {h}=seed(list),r=await get(h,ids.admin);
    expect(r.status,name).toBe(200);
    const L=await legacy(page,list);
    expect(r.data.population,name).toEqual({n:L.N,satN:L.sv,detailN:L.sv,excludedInvalid:1});
    same(body(r4View(r.data)),norm(L.rp4),name+' rp4');same(body(r5View(r.data)),norm(L.rp5),name+' rp5');same(body(r6View(r.data)),norm(L.rp6),name+' rp6');
    // Options and chart labels come from the server and are the legacy lists.
    const a=r.data.analyses;
    expect(a.r4.options).toEqual(L.OPT.d32);expect(a.r4.labels).toEqual(L.SH.d32);
    expect(a.r5.options).toEqual(L.OPT.d33);expect(a.r5.labels).toEqual(L.SH.d33);
    expect(a.r6.q5.options).toEqual(L.OPT.d34);expect(a.r6.q5.labels).toEqual(L.SH.d34);
    expect(a.r6.q6.options).toEqual(L.OPT.d35);expect(a.r6.q6.labels).toEqual(L.SH.d35);
  }
  const a=async(name,list)=>(await get(seed(list).h,ids.admin)).data.analyses;
  // Ties: equal counts keep the option order. uniform: pre d33 counts [6,6,6,0,...] -> 0,1,2; post d35 counts [0,0,0,6,6] -> TOP by post: 3,4,0.
  const u=await a('uniform',datasets().uniform);
  expect(u.r5.top.map(t=>t.index)).toEqual([0,1,2]);expect(u.r6.q6.top.map(t=>t.index)).toEqual([3,4,0]);
  // Extremes: options never chosen before have change 0, options dropped completely have -100, mind state flips to 0 %.
  const e=await a('extreme',datasets().extreme);
  expect(e.r5.pre).toEqual([4,4,4,0,0,0,0]);expect(e.r5.post).toEqual([0,0,0,0,4,4,4]);expect(e.r5.change).toEqual([-100,-100,-100,0,0,0,0]);
  expect(e.r4.positive).toEqual({pre:100,post:0,change:-100});expect(e.r6.fit.avg).toBe(1);expect(e.r6.fit.positive.pct).toBe(0);
  const p=await a('allpos',datasets().allpos);
  expect(p.r4.positive).toEqual({pre:0,post:100,change:100});expect(p.r6.fit).toMatchObject({avg:5,positive:{count:4,pct:100}});
});

test('5·6 structure: single-choice sums equal the base, multiple-choice sums count every pick, top lists follow the legacy rule',async()=>{
  const {h}=seed(datasets().varied),a=(await get(h,ids.admin)).data.analyses,n=7;
  expect([sumOf(a.r4.pre),sumOf(a.r4.post)]).toEqual([n,n]);
  expect([a.r5.selections.pre,a.r5.selections.post]).toEqual([3*n,3*n]);      // every participant picks 3 complaints before and after
  expect([sumOf(a.r6.q5.pre),sumOf(a.r6.q5.post)]).toEqual([n,n]);
  expect(a.r6.q6.selections.pre).toBe(2*n);expect(a.r6.q6.selections.post).toBeGreaterThanOrEqual(n);expect(a.r6.q6.selections.post).toBeLessThanOrEqual(2*n);
  // Percentages are counts over total selections (legacy sideList), so they are NOT out of participants and may exceed what a share of n would give.
  for(const t of a.r5.top)expect(t.pct).toBe(Math.round(t.count/a.r5.selections.pre*1000)/10);
  // Top lists: Q4 and Q5.0 rank by the pre count, Q6.0 by the post count.
  const order=(c)=>c.map((v,i)=>[v,i]).sort((x,y)=>y[0]-x[0]||x[1]-y[1]).slice(0,3).map(x=>x[1]);
  expect(a.r5.top.map(t=>t.index)).toEqual(order(a.r5.pre));expect(a.r6.q5.top.map(t=>t.index)).toEqual(order(a.r6.q5.pre));expect(a.r6.q6.top.map(t=>t.index)).toEqual(order(a.r6.q6.post));
  expect(a.r6.fit.n).toBe(n);
});

test('3·7 populations: screens 4-6 need valid satisfaction scores and choices and a valid pre expectation; the rest is left out and counted apart',async({page})=>{
  const {r4View,r5View,r6View}=await views(),list=datasets().varied,{h,add}=seed(list),[a,b]=answers(77,2),good=person(rng(9)),ok={exp:good.exp,sat:good.sat};
  const bad=(id,over)=>add(id,'가 기업',a,b,{...ok,...over});
  bad('i-d33-two',{satRaw:{...good.sat,d33:good.sat.d33.slice(0,2)}});                 // d33 needs 3 picks
  bad('i-score-range',{satRaw:{...good.sat,q3a:6}});                                    // out-of-range score
  bad('i-q5fit-missing',{satRaw:(({q5fit,...rest})=>rest)(good.sat)});                  // missing score
  bad('i-d32-empty',{satRaw:{...good.sat,d32:[]}});
  bad('i-d35-unknown',{satRaw:{...good.sat,d35:['없는 보기']}});
  bad('i-pre-no-expect',{expRaw:null});                                                 // pre answers without an expectation
  bad('i-pre-d33-unknown',{expRaw:preExpect({...good.exp,d33:[good.exp.d33[0],good.exp.d33[1],'없는 보기']})});
  bad('i-pre-d35-one',{expRaw:preExpect({...good.exp,d35:good.exp.d35.slice(0,1)})});
  bad('i-no-sat',{sat:null});                                                           // no satisfaction at all
  const r=(await get(h,ids.admin)).data;
  expect(r.population).toEqual({n:9+9,satN:7+8,detailN:7,excludedInvalid:1});
  // The figures are the legacy figures for the valid people only.
  const L=await legacy(page,list);expect(L.sv).toBe(7);
  same(body(r4View(r)),norm(L.rp4),'rp4');same(body(r5View(r)),norm(L.rp5),'rp5');same(body(r6View(r)),norm(L.rp6),'rp6');
  expect(r.analyses.r3.n).toBe(15);expect(r.analyses.r4.n).toBe(7);
});

test('numeric-string answers: the server leaves them out; legacy counts them and its figures break (preserved legacy behavior, reported not fixed)',async({page})=>{
  const {r4View}=await views(),list=datasets().varied,{h,add}=seed(list),[a,b]=answers(63,2),good=person(rng(13));
  add('t-score-string','가 기업',a,b,{exp:good.exp,satRaw:{...good.sat,q3a:'4'}});
  const r=(await get(h,ids.admin)).data;
  expect(r.population).toEqual({n:10,satN:8,detailN:7,excludedInvalid:1});   // q1/q2 are valid, q3a is a string: in screen 3, out of 4-6
  const L=await legacy(page,list,{extra:[{pre:a,post:b,company:'가 기업',exp:good.exp,sat:{...good.sat,q3a:'4'}}]});
  expect(L.sv).toBe(r.population.detailN+1);                                   // legacy counts the person
  expect(norm(L.rp4)).not.toBe(body(r4View(r)));                               // and screen 4 differs (string concatenation in the average)
});

test('1·2·9 admin only, own organization only; no personal data or free text in the response, and no d36 in selected columns',async()=>{
  const {h}=seed(datasets().varied),r=await get(h,ids.admin),text=JSON.stringify(r.data);
  expect(r.status).toBe(200);expect(Object.keys(r.data.analyses)).toEqual(['r1','r2','r3','r4','r5','r6','r7']);
  for(const hidden of ['개인-','응답원문','결과원문','자유의견원문','다른 의견','01012341234','u-p','"p000"','x-','other-org',ids.counselor])expect(text).not.toContain(hidden);
  const cols=[...new Set(h.state.reads.filter(x=>x.table==='assessments').flatMap(x=>x.columns.split(',')))].sort();
  expect(cols).toEqual(ASSESSMENT_COLUMNS);
  expect(cols.some(c=>/d36/.test(c))).toBe(false);
  h.state.tables.user_profiles.push({user_id:'manager-user',organization_id:ids.org,role:'manager',display_name:'고객사'});h.state.users['manager-user']={id:'manager-user',app_metadata:{}};
  for(const [token,status] of [[ids.counselor,403],[ids.participant,403],[ids.other,403],['manager-user',403],[null,401]]){const x=await get(h,token);expect(x.status).toBe(status);expect(x.data.analyses).toBeUndefined()}
  expect((await get(h,ids.admin,'?organizationId=other-org')).status).toBe(400);
});

test('7 zero population, no valid detail answers, a disabled post feature and failed reads show no figures',async()=>{
  const none={r1:null,r2:null,r3:null,r4:null,r5:null,r6:null,r7:null};
  const zero=(await get(seed([]).h,ids.admin)).data;expect(zero.population).toEqual({n:0,satN:0,detailN:0,excludedInvalid:1});expect(zero.analyses).toEqual(none);
  // Satisfaction scores valid but the choice answers are not: screen 3 has figures, screens 4-6 do not.
  const noDetail=seed(datasets().varied.map(p=>({...p,sat:{...p.sat,d33:['없는 보기']}}))).h,nd=(await get(noDetail,ids.admin)).data;
  expect(nd.population).toMatchObject({n:9,satN:7,detailN:0});expect(nd.analyses.r3.n).toBe(7);expect([nd.analyses.r4,nd.analyses.r5,nd.analyses.r6]).toEqual([null,null,null]);
  const off=seed(datasets().varied,{postEnabled:false}),o=(await get(off.h,ids.admin)).data;
  expect(o).toMatchObject({post:{available:false},population:null,analyses:none});expect(off.h.state.reads.some(x=>x.table==='assessments')).toBe(false);
  for(const table of ['participants','assessments']){const f=seed(datasets().varied).h;f.state.failReadsOf=table;const x=await get(f,ids.admin);expect(x.status).toBe(503);expect(x.data).toEqual({error:'QUERY_FAILED'})}
  const dup=seed(datasets().varied);dup.h.state.tables.assessments.push({id:'post-dup',participant_id:'p001',phase:'post',status:'submitted',answers:{post:answers(5,1)[0]}});
  expect((await get(dup.h,ids.admin)).data).toEqual({error:'ASSESSMENT_STATE_INVALID'});
});

test('company filter keeps legacy equality for screens 4-6',async({page})=>{
  const {r4View,r5View,r6View}=await views(),list=datasets().varied,{h}=seed(list);
  const ga=(await get(h,ids.admin,'?company='+encodeURIComponent('가 기업'))).data,L=await legacy(page,list,{company:'가 기업'});
  expect(ga.population).toEqual({n:L.N,satN:L.sv,detailN:L.sv,excludedInvalid:0});
  same(body(r4View(ga)),norm(L.rp4),'company rp4');same(body(r5View(ga)),norm(L.rp5),'company rp5');same(body(r6View(ga)),norm(L.rp6),'company rp6');
});

test('response check rejects inconsistent screen 4-6 data',async()=>{
  const {validAggregate}=await views(),ok=(await get(seed(datasets().varied).h,ids.admin)).data;
  expect(validAggregate(ok)).toBe(true);
  const changes=[d=>{d.analyses.r4.pre[0]+=1},d=>{d.analyses.r4.scores.pop()},d=>{d.analyses.r4.positive.change=NaN},d=>{d.analyses.r4.n+=1},
    d=>{d.analyses.r5.top.reverse()},d=>{d.analyses.r5.change.pop()},d=>{d.analyses.r5.selections.pre+=1},d=>{d.analyses.r5.top[0].count+=1},d=>{d.analyses.r5.labels.pop()},
    d=>{d.analyses.r6.q5.post[0]+=1},d=>{d.analyses.r6.q6.top[0].index=(d.analyses.r6.q6.top[0].index+1)%5},d=>{d.analyses.r6.q6.selections.post-=1},d=>{d.analyses.r6.fit.n+=1},d=>{d.analyses.r6=null},
    d=>{d.population.detailN=d.population.satN+1},d=>{d.population.detailN=0}];
  for(const change of changes){const d=structuredClone(ok);change(d);expect(validAggregate(d),String(change)).toBe(false)}
  const none=(await get(seed([]).h,ids.admin)).data;expect(validAggregate(none)).toBe(true);
});

test.describe('admin aggregate screens 4-6',()=>{
  let server;
  test.beforeAll(async()=>{server=await serve('src')});
  test.afterAll(async()=>{await server.close()});
  async function open(page,h){
    const calls=[];
    await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
    await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
      const request=route.request(),u=new URL(request.url()),body=request.postDataJSON(),token=request.headers().authorization?.replace(/^Bearer /,'');
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
      calls.push(u.pathname+u.search);let result;const q='https://fixture.invalid/'+u.search;
      if(u.pathname.endsWith('/secondcareer-login')){const id=h.signIn(body.loginId,body.password)?.id;result=id?{status:200,data:{access_token:id,refresh_token:'refresh-'+id,expires_at:Math.floor(Date.now()/1000)+3600}}:{status:401,data:{error:'INVALID_CREDENTIALS'}}}
      else if(u.pathname.endsWith('/secondcareer-account'))result=await h.call(h.account.handleAccount,token,body,request.method());
      else if(u.pathname.endsWith('/secondcareer-admin-progress'))result=await h.call(h.progress.handleAdminProgress,token,body,request.method(),q);
      else if(u.pathname.endsWith('/secondcareer-admin-directory'))result=await h.call(h.directory.handleAdminDirectory,token,body,request.method(),q);
      else if(u.pathname.endsWith('/secondcareer-admin-aggregate'))result=await h.call(h.aggregate.handleAdminAggregate,token,body,request.method(),q);
      else if(u.pathname.endsWith('/secondcareer-assessment'))result=await h.call(h.assessment,token,body,request.method(),q);
      else if(u.pathname==='/auth/v1/logout')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*'}});
      else throw Error('Unexpected API path: '+u.pathname);
      await route.fulfill({status:result.status,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body:JSON.stringify(result.data)});
    });
    await page.goto(server.url);
    return calls;
  }
  async function login(page){await page.locator('#lg-id').fill('admin01');await page.locator('#lg-pw').fill('Fixture-password-123!');await page.getByRole('button',{name:'로그인',exact:true}).click()}
  const sec=page=>page.locator('#admin-aggregate');
  const open1=async page=>{await login(page);await sec(page).getByRole('button',{name:'통합 분석보고서 열기'}).click();await expect(sec(page).locator('[data-agg-kpi="n"]')).toBeVisible()};
  const tab=(page,k)=>sec(page).locator(`[data-agg-tab="${k}"]`);

  test('tabs 1-6 are active, 7-9 stay "구현 예정"; tab switch does not reload; each base line names its population',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    const list=datasets().varied,{h}=seed(list),calls=await open(page,h);await open1(page);
    const aggCalls=()=>calls.filter(c=>c.includes('admin-aggregate')).length;
    await expect(sec(page).locator('[data-agg-tab]:disabled')).toHaveCount(2);
    for(const k of ['r8','r9'])await expect(tab(page,k)).toContainText('구현 예정');
    const a=(await get(h,ids.admin)).data.analyses;
    await tab(page,'r7').click();
    await expect(tab(page,'r7')).toHaveAttribute('aria-selected','true');
    await expect(sec(page).locator('[data-agg-base]')).toContainText('만족도 응답 n=7');
    await expect(sec(page).locator('.hbrow')).toHaveCount(a.r7.options.length);
    expect(aggCalls()).toBe(1);
    await sec(page).locator('#agg-company').selectOption('가 기업');
    await expect(tab(page,'r7')).toHaveAttribute('aria-selected','true');
    await expect(sec(page).locator('[data-agg-base]')).toContainText('가 기업');
    expect(aggCalls()).toBe(2);
    await sec(page).locator('#agg-company').selectOption('');
    await expect(sec(page).locator('[data-agg-base]')).toContainText('전체 기업');
    await tab(page,'r4').click();
    await expect(tab(page,'r4')).toHaveAttribute('aria-selected','true');
    await expect(sec(page).locator('[data-agg-base]')).toContainText('사전·사후 참여자(n=9), 만족도 응답 n=7, 단위: 명]');
    await expect(sec(page).locator('.tiles .tile').nth(0).locator('b')).toHaveText(`${a.r4.positive.pre}%`);
    await expect(sec(page).locator('.tiles .tile').nth(2).locator('b')).toHaveText(`${a.r4.positive.change>0?'+':''}${a.r4.positive.change}%p`);
    await expect(sec(page).locator('.hbrow')).toHaveCount(3);
    await expect(sec(page).locator('[data-agg-method]')).toContainText('단일 선택');
    await tab(page,'r5').click();
    await expect(sec(page).locator('.topitem')).toHaveCount(3);
    await expect(sec(page).locator('.topitem').first()).toContainText(`(${a.r5.top[0].pct}%, ${a.r5.top[0].count}명)`);
    await expect(sec(page).locator('.fnote')).toContainText(`사전 ${a.r5.selections.pre}건, 사후 ${a.r5.selections.post}건`);
    await expect(sec(page).locator('[data-agg-method]')).toContainText('참여자 비율이 아닙니다');
    await tab(page,'r6').click();
    await expect(sec(page).locator('.sidechart')).toHaveCount(2);await expect(sec(page).locator('.topitem')).toHaveCount(6);
    await expect(sec(page).locator('[data-agg-sat="q5fit"] .pie-lab')).toHaveText(`종합평균 ${a.r6.fit.avg}점`);
    await expect(sec(page).locator('.topitem').last()).toContainText('극복');
    await expect(sec(page).locator('[data-agg-method]')).toContainText('서로 다른 문항');
    expect(aggCalls()).toBe(3);
    await sec(page).locator('#agg-company').selectOption('가 기업');
    await expect(sec(page).locator('[data-agg-base]')).toContainText('[Base: 가 기업 사전·사후 참여자(n=5), 만족도 응답 n=');
    await expect(tab(page,'r6')).toHaveAttribute('aria-selected','true');expect(aggCalls()).toBe(4);
    await expect(page.getByRole('button',{name:'주소 저장'})).toBeVisible();
    const text=await sec(page).innerText();
    for(const hidden of ['개인-','응답원문','자유의견원문','다른 의견'])expect(text).not.toContain(hidden);
    expect(errors).toEqual([]);
  });

  test('screens 4-6 explain a smaller base, missing satisfaction, and an empty population without figures',async({page})=>{
    const list=datasets().varied,s=seed(list);
    s.add('i-d33-two','가 기업',answers(8,1)[0],answers(9,1)[0],{exp:person(rng(3)).exp,satRaw:{...person(rng(3)).sat,d33:['없는 보기']}});
    await open(page,s.h);await open1(page);
    await tab(page,'r5').click();
    await expect(sec(page).locator('[data-agg-detail-base]')).toContainText('만족도 응답 8명 중 사전 기대·만족도 선택 응답이 완전한 7명');
    await expect(sec(page).locator('[data-agg-base]')).toContainText('만족도 응답 n=7');
    await page.evaluate(()=>logout());await expect(page.getByRole('heading',{name:'세컨플래닝 로그인'})).toBeVisible();
    await open(page,seed(list.map(p=>({...p,sat:null}))).h);await open1(page);
    for(const k of ['r4','r5','r6','r7']){await tab(page,k).click();await expect(sec(page).locator('[data-agg-empty]')).toHaveText('사후 만족도 설문에 응답한 참여자가 아직 없습니다.');await expect(sec(page).locator('.topitem, .tiles, .sidechart')).toHaveCount(0)}
    await page.evaluate(()=>logout());await expect(page.getByRole('heading',{name:'세컨플래닝 로그인'})).toBeVisible();
    await open(page,seed(list.map(p=>({...p,sat:{...p.sat,d33:['없는 보기']}}))).h);await open1(page);
    await tab(page,'r4').click();await expect(sec(page).locator('[data-agg-empty]')).toHaveText('만족도와 사전 기대 응답이 모두 완전한 참여자가 아직 없습니다.');
    await tab(page,'r3').click();await expect(sec(page).locator('.sat2 > div')).toHaveCount(2);
    await page.evaluate(()=>logout());await expect(page.getByRole('heading',{name:'세컨플래닝 로그인'})).toBeVisible();
    await open(page,seed([],{extras:false}).h);await open1Zero(page);
    async function open1Zero(p){await login(p);await sec(p).getByRole('button',{name:'통합 분석보고서 열기'}).click();await expect(sec(p).locator('[data-agg-empty]')).toBeVisible()}
    for(const k of ['r4','r5','r6','r7']){await tab(page,k).click();await expect(sec(page).locator('[data-agg-empty]')).toHaveText('사전·사후를 모두 완료한 참여자가 아직 없습니다.');await expect(sec(page)).not.toContainText('NaN')}
  });
});

test('screen 7 matches legacy counts, order, means and bar widths including missing, whitespace and company filtering',async({page})=>{
  const {r7View,validAggregate}=await views(), options=['상담 시간·회기 수','진단 문항 수·소요시간','결과 리포트 내용','상담 후 사후 지원·정보 제공','온라인 시스템 사용성','상담 일정 조율','특별히 없음'];
  for(const [name,indices] of Object.entries({varied:[[0,1],[0,2],[],[3],[2,3],[6],[6]],ties:[[0],[1],[2],[3],[4],[5],[6]],extreme:[[6],[6],[6],[6],[6],[6],[6]],missing:[[],[],[],[],[],[],[]],one:[[0,1]]})){
    const source=name==='one'?datasets().varied.slice(0,1):datasets().varied;
    const list=source.map((p,i)=>({...p,sat:p.sat?{...p.sat,q7:name==='missing'&&i%2===0?undefined:(indices[i%indices.length]).map(j=>options[j]),q7txt:i%3===0?'  의견  ':i%3===1?'   ':''}:null}));
    const {h}=seed(list);
    for(const company of ['전체','가 기업']){
      const data=(await get(h,ids.admin,company==='전체'?'':'?company='+encodeURIComponent(company))).data,L=await legacy(page,list,{company});
      expect(validAggregate(data),name).toBe(true);expect(data.analyses.r7.n).toBe(L.sv);
      const clean=x=>norm(x.split('<p class="fnote">')[0]);
      same(clean(r7View(data)),clean(L.rp7),name+' '+company+' rp7');
      expect(JSON.stringify(data)).not.toContain('의견  ');
    }
  }
});
