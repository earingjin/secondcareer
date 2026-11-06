// REQ-A-008/009 admin aggregate screens 2 (detail) and 3 (satisfaction) against the local
// protocol mock (server-harness.cjs). Oracle: the legacy report itself. The same synthetic
// answers go to legacy repData/rp2/rp3 (legacy/index.original.html, unchanged, loaded in the
// browser) and to the server API; the figures and the rendered screen body are compared.
// Mock only: no real Postgres, RLS or Auth.
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve-static.mjs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
// Every column the aggregate function selects from assessments (JSON paths of the stored answers, including screen 8 pre d36).
const ASSESSMENT_COLUMNS=['id','participant_id','pd32:answers->expect->d32','pd33:answers->expect->d33','pd34:answers->expect->d34','pd35:answers->expect->d35','pd36:answers->expect->d36','post:answers->post','pre:answers->pre','q1:answers->sat->q1','q2:answers->sat->q2','q3a:answers->sat->q3a','q3b:answers->sat->q3b','q3c:answers->sat->q3c','q5fit:answers->sat->q5fit','q7:answers->sat->q7','q7txt:answers->sat->q7txt','sd32:answers->sat->d32','sd33:answers->sat->d33','sd34:answers->sat->d34','sd35:answers->sat->d35','status'];
const TEMPLATE=JSON.parse(fs.readFileSync(new URL('../snapshot/fixture.json',import.meta.url),'utf8')).db[0];
const LEGACY=pathToFileURL(path.resolve('legacy/index.original.html')).href;

function answers(seed,count){
  let x=seed;const next=()=>(x=(x*1103515245+12345)%2147483648)%5+1;
  return Array.from({length:count},()=>Array.from({length:15},next));
}
// {pre,post,company,sat}: sat = {q1,q2} or null (no satisfaction answer). `tie` copies area 1 to
// area 2 so factor and area rates tie; `drop` makes post lower than pre.
function people(seed,count,{tie=false,drop=false,noSat=[],allFive=false,companies=['가 기업','나 기업']}={}){
  const pre=answers(seed,count),post=answers(seed+7,count),sat=answers(seed+3,count);
  return pre.map((p,i)=>{
    const q=post[i];
    if(tie){p.splice(3,3,...p.slice(0,3));q.splice(3,3,...q.slice(0,3))}
    if(drop)for(let k=0;k<15;k++)q[k]=Math.max(1,p[k]-(k%3===0?1:0));
    return {pre:p,post:q,company:companies[i%companies.length],sat:noSat.includes(i)?null:allFive?{q1:5,q2:5}:{q1:sat[i][0],q2:sat[i][1]}};
  });
}
const DATASETS={varied:people(11,9,{noSat:[2,5]}),ties:people(23,6,{tie:true}),decline:people(37,5,{drop:true}),single:people(41,1),top:people(5,4,{allFive:true})};
const fullSat=s=>({...s,q3a:3,q3b:4,q3c:5,q5fit:4,d32:['x'],d33:['a','b','c'],d34:['y'],d35:['z'],q7:['w'],q7txt:'자유의견원문'});

function seed(list,{postEnabled=true,extras=true}={}){
  const h=harness(),t=h.state.tables;t.participants.length=0;h.state.postEnabled=postEnabled;
  const add=(id,company,pre,post,{org=ids.org,preStatus='submitted',postStatus='submitted',sat=null,satRaw}={})=>{
    t.participants.push({id,organization_id:org,counselor_user_id:ids.counselor,auth_user_id:'u-'+id,display_name:'개인-'+id,phone:'01012341234',company_name:company});
    if(pre)t.assessments.push({id:'pre-'+id,participant_id:id,phase:'pre',status:preStatus,answers:{reg:{name:'응답원문-'+id},pre},result:{comment:'결과원문'}});
    if(post)t.assessments.push({id:'post-'+id,participant_id:id,phase:'post',status:postStatus,answers:{post,...(satRaw!==undefined?{sat:satRaw}:sat?{sat:fullSat(sat)}:{})}});
  };
  list.forEach((p,i)=>add('p'+String(i).padStart(3,'0'),p.company,p.pre,p.post,{sat:p.sat}));
  if(extras){
    const [a,b]=answers(99,2),low={q1:1,q2:1};
    add('x-pre-only','가 기업',a,null);
    add('x-post-draft','가 기업',a,b,{postStatus:'draft',sat:low});
    add('x-pre-draft','나 기업',a,b,{preStatus:'draft',sat:low});
    add('x-invalid','나 기업',a,b.slice(0,14),{sat:low});
    add('x-other-org','가 기업',b,a,{org:'other-org',sat:low});
    add('x-none','',null,null);
  }
  return {h,add};
}
const get=(h,token,query='')=>h.call(h.aggregate.handleAdminAggregate,token,undefined,'GET','https://fixture.invalid/'+query);

// Legacy output for the same people: population sizes and the rp2/rp3 screen bodies.
async function legacy(page,list,{company='전체',extra=[]}={}){
  await page.goto(LEGACY);
  return page.evaluate(({list,extra,template,company})=>{
    DB.length=0;
    [...list,...extra].forEach((p,i)=>DB.push({...structuredClone(template),id:'L'+i,company:p.company,pre:p.pre,post:p.post,sat:p.sat?{...p.sat}:null}));
    S.rep={company};
    const d=repData(false),out={N:d.N,sv:d.sv.length};
    if(d.N){out.rp2=rp2(d);out.rp3=d.sv.length?rp3(d):null;out.areaPre=[...(()=>{const div=document.createElement('div');div.innerHTML=rp1(d);return [...div.querySelectorAll('table tr')][1].children})()].slice(1).map(c=>c.textContent.trim())}
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

test('8·9·10·11 server detail and satisfaction equal legacy rp2/rp3 for the same answers',async({page})=>{
  const {r2View,r3View}=await views();
  for(const [name,list] of Object.entries(DATASETS)){
    const {h}=seed(list),r=await get(h,ids.admin);
    expect(r.status,name).toBe(200);
    const L=await legacy(page,list);
    expect(r.data.population,name).toEqual({n:L.N,satN:L.sv,detailN:0,excludedInvalid:1});
    same(body(r2View(r.data)),norm(L.rp2),name+' rp2');
    if(L.sv)same(body(r3View(r.data)),norm(L.rp3),name+' rp3');else expect(r.data.analyses.r3,name).toBeNull();
  }
  // Ties are really present: factor 0..2 and 3..5 share rates, and the earlier one ranks first.
  const f=(await get(seed(DATASETS.ties).h,ids.admin)).data.analyses.r2.factors;
  for(const i of [0,1,2]){expect(f[i].rate).toBe(f[i+3].rate);expect(f[i].rank).toBeLessThan(f[i+3].rank)}
  const d=(await get(seed(DATASETS.decline).h,ids.admin)).data.analyses.r2;
  expect(d.factors.some(x=>x.rate<0)).toBe(true);expect(d.factors.some(x=>x.diff<0)).toBe(true);
  // The top dataset gives 100 % positive and a full pie.
  const top=(await get(seed(DATASETS.top).h,ids.admin)).data.analyses.r3;
  expect(top.q1).toMatchObject({avg:5,positive:{count:4,pct:100}});expect(top.q1.distribution.map(x=>x.count)).toEqual([4,0,0,0,0]);
});

test('detail structure: 15 factors, 5 areas, ranks 1..15 and 1..5, areas equal screen 1',async()=>{
  const {h}=seed(DATASETS.varied),a=(await get(h,ids.admin)).data.analyses;
  expect(a.r2.factors).toHaveLength(15);expect(a.r2.areas).toHaveLength(5);
  expect(a.r2.factors.map(f=>f.area)).toEqual([0,0,0,1,1,1,2,2,2,3,3,3,4,4,4]);
  expect([...a.r2.factors.map(f=>f.rank)].sort((x,y)=>x-y)).toEqual(Array.from({length:15},(_,i)=>i+1));
  expect(a.r2.areas).toEqual(a.r1.areas);
  // Factor and area figures are consistent: an area's raw average is the sum of its three factor averages (within rounding).
  a.r2.areas.forEach((area,i)=>{const s=a.r2.factors.slice(i*3,i*3+3).reduce((x,f)=>x+f.pre,0);expect(Math.abs(s-area.pre)).toBeLessThan(0.16)});
});

test('company filter keeps legacy equality for detail and satisfaction',async({page})=>{
  const {r2View,r3View}=await views(),list=DATASETS.varied,{h}=seed(list);
  const ga=(await get(h,ids.admin,'?company='+encodeURIComponent('가 기업'))).data,L=await legacy(page,list,{company:'가 기업'});
  expect(ga.population).toEqual({n:L.N,satN:L.sv,detailN:0,excludedInvalid:0});
  same(body(r2View(ga)),norm(L.rp2),'company rp2');same(body(r3View(ga)),norm(L.rp3),'company rp3');
});

test('satisfaction population: pre+post submitted AND a valid Q1/Q2 answer; the rest is counted apart',async()=>{
  const list=DATASETS.varied,{h,add}=seed(list);
  // Submitted pre+post with no satisfaction, a partial one, an out-of-range one and a non-integer one.
  const [a,b]=answers(77,2);
  add('s-none','가 기업',a,b);
  add('s-partial','가 기업',a,b,{satRaw:{q1:4}});
  add('s-range','가 기업',a,b,{satRaw:{q1:4,q2:6}});
  add('s-float','가 기업',a,b,{satRaw:{q1:4.5,q2:3}});
  const r=(await get(h,ids.admin)).data;
  expect(r.population).toEqual({n:9+4,satN:7,detailN:0,excludedInvalid:1});
  expect(r.analyses.r3.n).toBe(7);expect(r.analyses.r3.q1.n).toBe(7);expect(r.analyses.r3.q2.n).toBe(7);
  // Without any satisfaction answer: detail still works, screen 3 has no figures.
  const none=seed(DATASETS.varied.map(p=>({...p,sat:null}))).h,n=(await get(none,ids.admin)).data;
  expect(n.population).toMatchObject({n:9,satN:0});expect(n.analyses.r3).toBeNull();expect(n.analyses.r2.factors).toHaveLength(15);
});

test('numeric-string answers: the server excludes them; legacy counts them and its figures break (preserved legacy behavior, reported not fixed)',async({page})=>{
  const list=DATASETS.varied,{h,add}=seed(list),[a,b]=answers(63,2),strings=v=>v.map(String);
  // Both diagnoses submitted with answers stored as numeric strings.
  add('t-strings','가 기업',strings(a),strings(b),{sat:{q1:4,q2:3}});
  const r=(await get(h,ids.admin)).data;
  expect(r.population).toEqual({n:9,satN:7,detailN:0,excludedInvalid:2});
  const L=await legacy(page,list,{extra:[{pre:strings(a),post:strings(b),company:'가 기업',sat:{q1:4,q2:3}}]});
  expect(L.N).toBe(r.population.n+1);                        // legacy `full` accepts '3'
  expect(L.areaPre).not.toEqual(r.analyses.r1.areas.map(x=>String(x.pre)));   // but string sums concatenate
  // A satisfaction score stored as a string is not valid for the server; legacy counts the person.
  const s=seed(list);s.add('t-sat-string','가 기업',a,b,{satRaw:{q1:'4',q2:3}});
  const rs=(await get(s.h,ids.admin)).data;
  expect(rs.population).toEqual({n:10,satN:7,detailN:0,excludedInvalid:1});
  const Ls=await legacy(page,list,{extra:[{pre:a,post:b,company:'가 기업',sat:{q1:'4',q2:3}}]});
  expect(Ls.sv).toBe(rs.population.satN+1);
});

test('1·2·3·12 admin only, own organization only, personal data and free text never returned',async()=>{
  const {h}=seed(DATASETS.varied),r=await get(h,ids.admin),text=JSON.stringify(r.data);
  expect(r.status).toBe(200);
  expect(Object.keys(r.data.analyses)).toEqual(['r1','r2','r3','r4','r5','r6','r7','r8','r9']);
  for(const hidden of ['개인-','응답원문','결과원문','자유의견원문','01012341234','u-p','"p000"','x-','other-org',ids.counselor])expect(text).not.toContain(hidden);
  expect(text).not.toMatch(/\[(\d,){14}\d\]/);
  // Only the explicitly listed JSON paths are selected; free text is never returned by the API.
  const cols=[...new Set(h.state.reads.filter(x=>x.table==='assessments').flatMap(x=>x.columns.split(',')))].sort();
  expect(cols).toEqual(ASSESSMENT_COLUMNS);
  h.state.tables.user_profiles.push({user_id:'manager-user',organization_id:ids.org,role:'manager',display_name:'고객사'});h.state.users['manager-user']={id:'manager-user',app_metadata:{}};
  for(const [token,status] of [[ids.counselor,403],[ids.participant,403],[ids.other,403],['manager-user',403],[null,401]]){const x=await get(h,token);expect(x.status).toBe(status);expect(x.data.analyses).toBeUndefined()}
  // The other organization's satisfaction answers (all 1s in the fixture) never enter the figures.
  expect(r.data.analyses.r3.q1.distribution[4].count).toBe(DATASETS.varied.filter(p=>p.sat&&p.sat.q1===1).length);
});

test('zero population and a disabled post feature show no figures; failed reads fail closed',async()=>{
  const zero=(await get(seed([]).h,ids.admin)).data;
  expect(zero.population).toEqual({n:0,satN:0,detailN:0,excludedInvalid:1});expect(zero.analyses).toEqual({r1:null,r2:null,r3:null,r4:null,r5:null,r6:null,r7:null,r8:null,r9:null});
  const off=seed(DATASETS.varied,{postEnabled:false}),o=(await get(off.h,ids.admin)).data;
  expect(o).toMatchObject({post:{available:false},population:null,analyses:{r1:null,r2:null,r3:null}});
  expect(off.h.state.reads.some(x=>x.table==='assessments'&&x.filters.some(([k,v])=>k==='phase'&&v==='post'))).toBe(false);
  for(const table of ['participants','assessments']){const f=seed(DATASETS.varied).h;f.state.failReadsOf=table;const x=await get(f,ids.admin);expect(x.status).toBe(503);expect(x.data).toEqual({error:'QUERY_FAILED'})}
});

test('response check rejects inconsistent detail and satisfaction data',async()=>{
  const {validAggregate}=await views(),ok=(await get(seed(DATASETS.varied).h,ids.admin)).data;
  expect(validAggregate(ok)).toBe(true);
  const changes=[d=>{d.analyses.r2.factors.pop()},d=>{d.analyses.r2.factors[0].rank=d.analyses.r2.factors[1].rank},d=>{d.analyses.r2.areas[0].pre+=1},d=>{d.analyses.r3.n+=1},
    d=>{d.analyses.r3.q1.distribution[0].count+=1},d=>{d.analyses.r3.q2.positive.count+=1},d=>{d.population.satN=0},d=>{d.population.satN=d.population.n+1},d=>{d.analyses.r3=null},d=>{d.analyses.r2=null},d=>{d.analyses.r3.q1.distribution.reverse()}];
  for(const change of changes){const d=structuredClone(ok);change(d);expect(validAggregate(d)).toBe(false)}
  const none=(await get(seed(DATASETS.varied.map(p=>({...p,sat:null}))).h,ids.admin)).data;expect(validAggregate(none)).toBe(true);
});

test.describe('admin aggregate screens 2 and 3',()=>{
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

  test('tabs 1-3 are active, 4-9 stay "구현 예정"; tab switch does not reload; base lines name each population',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    const {h}=seed(DATASETS.varied),calls=await open(page,h);await open1(page);
    const aggCalls=()=>calls.filter(c=>c.includes('admin-aggregate')).length;
    expect(aggCalls()).toBe(1);
    await expect(sec(page).locator('[data-agg-tab]')).toHaveCount(9);await expect(sec(page).locator('[data-agg-tab]:disabled')).toHaveCount(0);
    await expect(sec(page).locator('[data-agg-base]')).toHaveText(/\[Base: 전체 기업 사전·사후 참여자\(n=9\), 단위: 명\]/);
    const r=(await get(h,ids.admin)).data.analyses;
    await tab(page,'r2').click();
    await expect(tab(page,'r2')).toHaveAttribute('aria-selected','true');await expect(sec(page).locator('[data-agg-detail]')).toBeVisible();
    await expect(sec(page).locator('[data-agg-detail] tr[data-row="pre"] td').first()).toHaveText(r.r2.factors[0].pre.toFixed(1));
    await expect(sec(page).locator('[data-agg-detail] td.hl1')).toHaveCount(5);await expect(sec(page).locator('[data-agg-detail] td.hl2')).toHaveCount(3);
    await expect(sec(page).locator('[data-agg-base]')).toHaveText(/사전·사후 참여자\(n=9\), 단위: 명\]/);
    await expect(sec(page).locator('[data-agg-base]')).not.toContainText('만족도 응답');
    await tab(page,'r3').click();
    await expect(sec(page).locator('.sat2 > div')).toHaveCount(2);
    await expect(sec(page).locator('[data-agg-base]')).toContainText('사전·사후 참여자(n=9), 만족도 응답 n=7, 단위: 명]');
    await expect(sec(page).locator('[data-agg-sat-base]')).toContainText('9명 중 만족도 설문(Q1·Q2)에 응답한 7명');
    await expect(sec(page).locator('[data-agg-sat-base]')).toContainText('분모(7명)가 같습니다');
    await expect(sec(page).locator('[data-agg-sat="q1"] .pie-lab')).toHaveText(`종합평균 ${r.r3.q1.avg}점`);
    await expect(sec(page).locator('[data-agg-sat="q1"] .hbrow.tot .hv')).toHaveText(`${r.r3.q1.positive.pct}%${r.r3.q1.positive.count}명`);
    expect(aggCalls()).toBe(1);
    // Company change reloads once and keeps the selected screen.
    await sec(page).locator('#agg-company').selectOption('가 기업');
    await expect(sec(page).locator('[data-agg-base]')).toContainText('[Base: 가 기업 사전·사후 참여자(n=5), 만족도 응답 n=');
    await expect(tab(page,'r3')).toHaveAttribute('aria-selected','true');expect(aggCalls()).toBe(2);
    await expect(page.getByRole('button',{name:'주소 저장'})).toBeVisible();
    const text=await sec(page).innerText();
    for(const hidden of ['개인-','응답원문','자유의견원문'])expect(text).not.toContain(hidden);
    expect(errors).toEqual([]);
  });

  test('screen 3 with no satisfaction answers, and every screen with no population, show a notice and no figures',async({page})=>{
    const {h}=seed(DATASETS.varied.map(p=>({...p,sat:null})));await open(page,h);await open1(page);
    await tab(page,'r2').click();await expect(sec(page).locator('[data-agg-detail]')).toBeVisible();
    await tab(page,'r3').click();
    await expect(sec(page).locator('[data-agg-empty]')).toHaveText('사후 만족도 설문에 응답한 참여자가 아직 없습니다.');
    await expect(sec(page).locator('.sat2')).toHaveCount(0);
    await page.evaluate(()=>logout());await expect(page.getByRole('heading',{name:'세컨플래닝 로그인'})).toBeVisible();
    const z=seed([],{extras:false});await open(page,z.h);await open1Zero(page);
    async function open1Zero(p){await login(p);await sec(p).getByRole('button',{name:'통합 분석보고서 열기'}).click();await expect(sec(p).locator('[data-agg-empty]')).toBeVisible()}
    for(const k of ['r1','r2','r3']){
      await tab(page,k).click();
      await expect(sec(page).locator('[data-agg-empty]')).toHaveText('사전·사후를 모두 완료한 참여자가 아직 없습니다.');
      await expect(sec(page).locator('[data-agg-detail], .sat2, [data-agg-areas]')).toHaveCount(0);
      await expect(sec(page)).not.toContainText('NaN');
    }
  });
});
