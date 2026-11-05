// REQ-A-006/007 admin aggregate report against the local protocol mock (server-harness.cjs).
// Oracle: the legacy report itself. The same synthetic answers are given to legacy
// repData/rp1/rp2 (legacy/index.original.html, unchanged, loaded in the browser) and to the
// server API, and every displayed figure is compared. Mock only: no real Postgres/RLS/Auth.
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve-static.mjs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
const TEMPLATE=JSON.parse(fs.readFileSync(new URL('../snapshot/fixture.json',import.meta.url),'utf8')).db[0];
const LEGACY=pathToFileURL(path.resolve('legacy/index.original.html')).href;

// Deterministic synthetic answers (values 1..5).
function answers(seed,count){
  let x=seed;const next=()=>(x=(x*1103515245+12345)%2147483648)%5+1;
  return Array.from({length:count},()=>Array.from({length:15},next));
}
// Each person: {pre:[15], post:[15], company}. `tie` copies area 1 to area 2 so two rates are equal.
function people(seed,count,{tie=false,drop=false,companies=['가 기업','나 기업']}={}){
  const pre=answers(seed,count),post=answers(seed+7,count);
  return pre.map((p,i)=>{
    const q=post[i];
    if(tie){p.splice(3,3,...p.slice(0,3));q.splice(3,3,...q.slice(0,3))}
    if(drop)for(let k=0;k<15;k++)q[k]=Math.max(1,p[k]-(k%3===0?1:0));
    return {pre:p,post:q,company:companies[i%companies.length]};
  });
}
const DATASETS={varied:people(11,9),ties:people(23,6,{tie:true}),decline:people(37,5,{drop:true}),single:people(41,1)};

function seed(list,{postEnabled=true,extras=true}={}){
  const h=harness(),t=h.state.tables;t.participants.length=0;h.state.postEnabled=postEnabled;
  const add=(id,company,pre,post,org=ids.org,preStatus='submitted',postStatus='submitted')=>{
    t.participants.push({id,organization_id:org,counselor_user_id:ids.counselor,auth_user_id:'u-'+id,display_name:'개인-'+id,phone:'01012341234',company_name:company});
    if(pre)t.assessments.push({id:'pre-'+id,participant_id:id,phase:'pre',status:preStatus,answers:{reg:{name:'응답원문-'+id,phone:'010-9999-0000'},pre},result:{comment:'결과원문'}});
    if(post)t.assessments.push({id:'post-'+id,participant_id:id,phase:'post',status:postStatus,answers:{post,sat:{q7txt:'자유의견원문'}}});
  };
  list.forEach((p,i)=>add('p'+String(i).padStart(3,'0'),p.company,p.pre,p.post));
  if(extras){
    const [a,b]=answers(99,2);
    add('x-pre-only','가 기업',a,null);                       // pre only
    add('x-post-draft','가 기업',a,b,ids.org,'submitted','draft'); // post not submitted
    add('x-pre-draft','나 기업',a,b,ids.org,'draft','submitted');  // pre not submitted
    add('x-invalid','나 기업',a,b.slice(0,14));                // submitted but incomplete answers
    add('x-other-org','가 기업',b,a,'other-org');              // another organization
    add('x-none','',null,null);                                 // registered only
  }
  return h;
}
const get=(h,token,query='')=>h.call(h.aggregate.handleAdminAggregate,token,undefined,'GET','https://fixture.invalid/'+query);

// Legacy figures for the same people (company filter as legacy S.rep.company).
async function legacyFigures(page,list,company='전체'){
  await page.goto(LEGACY);
  return page.evaluate(({list,template,company})=>{
    DB.length=0;
    list.forEach((p,i)=>DB.push({...structuredClone(template),id:'L'+i,company:p.company,pre:p.pre,post:p.post}));
    S.rep={company};
    const d=repData(false);if(!d.N)return {N:0};
    const div=document.createElement('div');const cells=sel=>[...div.querySelectorAll(sel)].map(e=>[...e.children].map(c=>c.textContent.trim()));
    div.innerHTML=rp1(d);const t1=cells('table tr'),tiles=[...div.querySelectorAll('.tile b')].map(b=>b.textContent.trim());
    div.innerHTML=rp2(d);const t2=cells('table tr');
    return {N:d.N,t1,tiles,t2};
  },{list,template:TEMPLATE,company});
}
const n=s=>Number(String(s).replace(/[^0-9.+-]/g,''));
function expectSameAsLegacy(L,r1,N){
  expect(N).toBe(L.N);
  const row=label=>L.t1.find(r=>r[0]===label).slice(1);
  expect(r1.areas.map(a=>a.name)).toEqual(L.t1[0].slice(1));
  expect(r1.areas.map(a=>a.pre)).toEqual(row('사전_평균').map(n));
  expect(r1.areas.map(a=>a.post)).toEqual(row('사후_평균').map(n));
  expect(r1.areas.map(a=>a.rate)).toEqual(row('변화율(%)').map(n));
  expect(L.tiles).toEqual([`${N}명`,String(r1.total.pre),String(r1.total.post),`${r1.total.rate}% ${r1.total.rate>0?'▲':r1.total.rate<0?'▼':''}`.trim()]);
  // rp2: area difference (every 4th cell of "변화 스코어(Point)") and full area ranking ("종합 1st".."5th").
  const diff=L.t2.find(r=>r[0]==='변화 스코어(Point)').slice(1).filter((_,i)=>i%4===3).map(n);
  expect(r1.areas.map(a=>a.diff)).toEqual(diff);
  const ranks=L.t2[1].filter(c=>c.startsWith('종합')).map(c=>Number(c.replace(/\D/g,'')));
  expect(r1.areas.map(a=>a.rank)).toEqual(ranks);
}

test('8·9·10·11 server figures equal the legacy report for the same answers, including ties and declines',async({page})=>{
  for(const [name,list] of Object.entries(DATASETS)){
    const h=seed(list),r=await get(h,ids.admin);
    expect(r.status,name).toBe(200);
    expect(r.data.population).toEqual({n:list.length,excludedInvalid:1});
    expectSameAsLegacy(await legacyFigures(page,list),r.data.analyses.r1,r.data.population.n);
  }
  // The tie dataset really has a tie: equal rates keep area order.
  const tie=(await get(seed(DATASETS.ties),ids.admin)).data.analyses.r1.areas;
  expect(tie[0].rate).toBe(tie[1].rate);expect(tie[0].rank).toBeLessThan(tie[1].rank);
  const decline=(await get(seed(DATASETS.decline),ids.admin)).data.analyses.r1;
  expect(decline.areas.some(a=>a.rate<0)).toBe(true);expect(decline.total.rate).toBeLessThan(0);
});

test('company filter equals the legacy company base and stays inside the organization',async({page})=>{
  const list=DATASETS.varied,h=seed(list);
  const all=await get(h,ids.admin);expect(all.data.companies).toEqual(['가 기업','나 기업']);expect(all.data.company).toBeNull();
  const ga=await get(h,ids.admin,'?company='+encodeURIComponent('가 기업'));
  expect(ga.status).toBe(200);expect(ga.data.company).toBe('가 기업');
  expectSameAsLegacy(await legacyFigures(page,list,'가 기업'),ga.data.analyses.r1,ga.data.population.n);
  for(const q of ['?company=','?company=%20','?company='+encodeURIComponent('다른 조직 기업'),'?company=x&company=y'])expect((await get(h,ids.admin,q)).status).toBe(400);
});

test('1·4·5·6·12 population is submitted pre and post only; response and reads carry no personal data',async()=>{
  const h=seed(DATASETS.varied),r=await get(h,ids.admin),text=JSON.stringify(r.data);
  expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');
  expect(Object.keys(r.data).sort()).toEqual(['analyses','companies','company','generatedAt','population','post','scope']);
  expect(Object.keys(r.data.analyses)).toEqual(['r1']);
  for(const hidden of ['개인-','응답원문','결과원문','자유의견원문','01012341234','010-9999','u-p','"p000"','x-','other-org',ids.counselor])expect(text).not.toContain(hidden);
  expect(text).not.toMatch(/\[(\d,){14}\d\]/);
  const cols=table=>[...new Set(h.state.reads.filter(x=>x.table===table).flatMap(x=>x.columns.split(',')))].sort();
  expect(cols('participants')).toEqual(['company_name','id']);
  expect(cols('assessments')).toEqual(['id','participant_id','post:answers->post','pre:answers->pre','status']);
  expect(h.state.reads.filter(x=>x.table==='participants').every(x=>x.filters.some(([k,v,op])=>k==='organization_id'&&v===ids.org&&op==='eq'))).toBe(true);
  expect(h.state.reads.filter(x=>x.table==='assessments').flatMap(x=>x.filters.find(([k])=>k==='participant_id')[1]).includes('x-other-org')).toBe(false);
});

test('2 counselor, participant, other roles and unauthenticated requests are refused',async()=>{
  const h=seed(DATASETS.single);
  h.state.tables.user_profiles.push({user_id:'manager-user',organization_id:ids.org,role:'manager',display_name:'고객사'});h.state.users['manager-user']={id:'manager-user',app_metadata:{}};
  for(const [token,status] of [[ids.counselor,403],[ids.participant,403],[ids.other,403],['manager-user',403],[null,401],['unknown-token',401]]){
    const r=await get(h,token);expect(r.status).toBe(status);expect(r.data.analyses).toBeUndefined();
  }
  for(const q of ['?organizationId=other-org','?role=admin','?company=가 기업&scope=all'])expect((await get(h,ids.admin,q)).status).toBe(400);
  expect((await h.call(h.aggregate.handleAdminAggregate,ids.admin,{company:'가 기업'})).status).toBe(405);
  h.state.users[ids.admin].app_metadata={must_change_password:true};
  expect((await get(h,ids.admin)).data).toEqual({error:'PASSWORD_CHANGE_REQUIRED'});
});

test('7 zero population and a disabled post feature show no figures',async()=>{
  const zero=seed([]),r=await get(zero,ids.admin);
  expect(r.status).toBe(200);expect(r.data.population).toEqual({n:0,excludedInvalid:1});expect(r.data.analyses.r1).toBeNull();
  const empty=seed([],{extras:false}),e=await get(empty,ids.admin);
  expect(e.data).toMatchObject({companies:[],population:{n:0,excludedInvalid:0},analyses:{r1:null}});
  const off=seed(DATASETS.varied,{postEnabled:false}),o=await get(off,ids.admin);
  expect(o.data).toMatchObject({post:{available:false},population:null,analyses:{r1:null}});expect(o.data.companies).toEqual(['가 기업','나 기업']);
  expect(off.state.reads.some(x=>x.table==='assessments')).toBe(false);
});

test('13 failed reads and invalid stored states fail closed without partial figures',async()=>{
  for(const table of ['participants','assessments']){
    const h=seed(DATASETS.varied);h.state.failReadsOf=table;const r=await get(h,ids.admin);
    expect(r.status).toBe(503);expect(r.data).toEqual({error:'QUERY_FAILED'});
  }
  const dup=seed(DATASETS.varied);dup.state.tables.assessments.push({id:'pre-dup',participant_id:'p001',phase:'pre',status:'submitted',answers:{pre:answers(5,1)[0]}});
  expect((await get(dup,ids.admin)).data).toEqual({error:'ASSESSMENT_STATE_INVALID'});
  const big=harness();big.state.pageSize=37;big.state.postEnabled=true;big.state.tables.participants.length=0;
  const list=people(53,230);list.forEach((p,i)=>{const id='q'+String(i).padStart(4,'0');big.state.tables.participants.push({id,organization_id:ids.org,company_name:p.company});big.state.tables.assessments.push({id:'a'+id,participant_id:id,phase:'pre',status:'submitted',answers:{pre:p.pre}},{id:'b'+id,participant_id:id,phase:'post',status:'submitted',answers:{post:p.post}})});
  const r=await get(big,ids.admin);expect(r.data.population.n).toBe(230);
});

test('response check rejects inconsistent aggregate data',async()=>{
  const {validAggregate}=await import('../../src/live/admin-aggregate-view.js');
  const ok=(await get(seed(DATASETS.varied),ids.admin)).data;expect(validAggregate(ok)).toBe(true);
  const zero=(await get(seed([]),ids.admin)).data;expect(validAggregate(zero)).toBe(true);
  for(const change of [d=>{d.analyses.r1.areas.pop()},d=>{d.analyses.r1.areas[0].rank=d.analyses.r1.areas[1].rank},d=>{d.population.n=0},d=>{d.post.available=false},d=>{d.company='없는 기업'},d=>{d.analyses.r1.total.rate=NaN},d=>{d.scope='all'}]){
    const d=structuredClone(ok);change(d);expect(validAggregate(d)).toBe(false);
  }
});

test.describe('admin aggregate screen',()=>{
  let server;
  test.beforeAll(async()=>{server=await serve('src')});
  test.afterAll(async()=>{await server.close()});
  async function open(page,h,{aggregateStatus=null}={}){
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
      else if(u.pathname.endsWith('/secondcareer-admin-aggregate'))result=aggregateStatus?{status:aggregateStatus,data:{error:'FIXTURE'}}:await h.call(h.aggregate.handleAdminAggregate,token,body,request.method(),q);
      else if(u.pathname.endsWith('/secondcareer-assessment'))result=await h.call(h.assessment,token,body,request.method(),q);
      else if(u.pathname==='/auth/v1/logout')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*'}});
      else throw Error('Unexpected API path: '+u.pathname);
      await route.fulfill({status:result.status,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body:JSON.stringify(result.data)});
    });
    await page.goto(server.url);
    return calls;
  }
  async function login(page,id='admin01'){await page.locator('#lg-id').fill(id);await page.locator('#lg-pw').fill('Fixture-password-123!');await page.getByRole('button',{name:'로그인',exact:true}).click()}
  const sec=page=>page.locator('#admin-aggregate');

  test('admin opens the report, sees the server figures, switches company; other sections stay',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    const h=seed(DATASETS.varied),calls=await open(page,h);await login(page);
    await expect(page.locator('#admin-progress [data-kpi="total"] b')).toHaveText('14');
    expect(calls.some(c=>c.includes('admin-aggregate'))).toBe(false);
    await sec(page).getByRole('button',{name:'통합 분석보고서 열기'}).click();
    const api=(await get(h,ids.admin)).data.analyses.r1;
    await expect(sec(page).locator('[data-agg-kpi="n"] b')).toHaveText('9명');
    await expect(sec(page).locator('[data-agg-kpi="pre-total"] b')).toHaveText(String(api.total.pre));
    await expect(sec(page).locator('[data-agg-base]')).toContainText('[Base: 전체 기업 사전·사후 참여자(n=9), 단위: 명]');
    const cells=row=>sec(page).locator(`[data-agg-areas] tr[data-row="${row}"] td`);
    await expect(cells('pre')).toHaveText([...api.areas.map(a=>String(a.pre)),String(api.total.pre)]);
    await expect(cells('rank')).toHaveText([...api.areas.map(a=>`${a.rank}위`),'-']);
    await expect(sec(page).locator('svg[role="img"] rect')).toHaveCount(10);
    await expect(sec(page).locator('[data-agg-tab]')).toHaveCount(9);
    await expect(sec(page).locator('[data-agg-tab]:disabled')).toHaveCount(8);await expect(sec(page).locator('[data-agg-tab="r2"]')).toContainText('구현 예정');
    await expect(sec(page).locator('[data-agg-excluded]')).toContainText('1명');
    await sec(page).locator('#agg-company').selectOption('가 기업');
    await expect(sec(page).locator('[data-agg-base]')).toContainText('[Base: 가 기업 사전·사후 참여자(n=5)');
    const text=await sec(page).innerText();
    for(const hidden of ['개인-','응답원문','자유의견원문'])expect(text).not.toContain(hidden);
    await expect(page.getByRole('button',{name:'주소 저장'})).toBeVisible();await expect(page.locator('#admin-directory [data-dir-kpi="participants"] b')).toHaveText('14');
    expect(errors).toEqual([]);
  });

  test('zero population, disabled post feature and a refused request are explained without figures',async({page})=>{
    await open(page,seed([],{extras:false}));await login(page);
    await sec(page).getByRole('button',{name:'통합 분석보고서 열기'}).click();
    await expect(sec(page).locator('[data-agg-empty]')).toHaveText('사전·사후를 모두 완료한 참여자가 아직 없습니다.');
    await expect(sec(page).locator('[data-agg-kpis], [data-agg-areas]')).toHaveCount(0);
    await expect(sec(page)).not.toContainText('NaN');await expect(sec(page)).not.toContainText('0%');
    await page.evaluate(()=>logout());await expect(page.getByRole('heading',{name:'세컨플래닝 로그인'})).toBeVisible();
    await open(page,seed(DATASETS.varied,{postEnabled:false}));await login(page);
    await sec(page).getByRole('button',{name:'통합 분석보고서 열기'}).click();
    await expect(sec(page).locator('[data-agg-empty]')).toContainText('사후진단 기능이');
    await page.evaluate(()=>logout());await expect(page.getByRole('heading',{name:'세컨플래닝 로그인'})).toBeVisible();
    await open(page,seed(DATASETS.varied),{aggregateStatus:503});await login(page);
    await sec(page).getByRole('button',{name:'통합 분석보고서 열기'}).click();
    await expect(sec(page).locator('#admin-aggregate-status')).toHaveText('통합 분석을 불러오지 못했습니다. 잠시 후 다시 불러와 주세요.');
    await expect(sec(page).locator('[data-agg-kpis]')).toHaveCount(0);
  });

  test('counselor screen never requests the aggregate report',async({page})=>{
    // Post feature off: the counselor list would otherwise read post_approvals, which this mock has no table for.
    const calls=await open(page,seed(DATASETS.single,{postEnabled:false}));await login(page,'consult01');
    await expect(page.getByRole('heading',{name:'상담사 페이지'})).toBeVisible();
    expect(calls.some(c=>c.includes('admin-aggregate'))).toBe(false);
  });
});
