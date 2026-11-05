// REQ-A-005 admin individual report against the local protocol mock (server-harness.cjs).
// The counselor report comes from the real secondcareer-assessment handler code and the
// admin report from secondcareer-admin-report, both over the same mock tables. This checks
// function code, rendering and the browser flow; not real Postgres, RLS, Auth or deployment.
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve-static.mjs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
const seedAnswers=(()=>{const d=JSON.parse(fs.readFileSync(new URL('../snapshot/fixture.json',import.meta.url),'utf8')).db[0];return {answers:Object.fromEntries(['reg','goal','pre','expect','done','preDate'].map(k=>[k,d[k]])),result:d.result}})();
const C2='10000000-0000-4000-8000-000000000005';
const P={submitted:'30000000-0000-4000-8000-000000000001',draft:'30000000-0000-4000-8000-000000000002',none:'30000000-0000-4000-8000-000000000003',otherCounselor:'30000000-0000-4000-8000-000000000004',otherOrg:'30000000-0000-4000-8000-000000000005',missing:'30000000-0000-4000-8000-0000000000ff'};

function seed(){
  const h=harness(),t=h.state.tables;t.participants.length=0;
  t.user_profiles.push({user_id:C2,organization_id:ids.org,role:'counselor',display_name:'김상담'});h.state.users[C2]={id:C2,app_metadata:{}};
  t.server_login_lookup.push({user_id:C2,login_id:'counsel02',internal_email:'c2@example.invalid'});
  const add=(id,org,counselor,status,name,company)=>{
    t.participants.push({id,organization_id:org,counselor_user_id:counselor,auth_user_id:'u-'+id,display_name:name,phone:'01000000000',company_name:company});
    t.server_login_lookup.push({user_id:'u-'+id,login_id:'p'+id.slice(-7),internal_email:'x-'+id+'@example.invalid'});
    if(status)t.assessments.push({id:'a-'+id,participant_id:id,phase:'pre',status,answers:structuredClone(seedAnswers.answers),result:status==='submitted'?structuredClone(seedAnswers.result):null,updated_at:'2026-10-01T00:00:00Z',submitted_at:status==='submitted'?'2026-10-01T00:00:00Z':null});
  };
  add(P.submitted,ids.org,ids.counselor,'submitted','보고서대상','가 기업');
  add(P.draft,ids.org,ids.counselor,'draft','임시저장대상','가 기업');
  add(P.none,ids.org,ids.counselor,null,'미시작대상','나 기업');
  add(P.otherCounselor,ids.org,C2,'submitted','다른담당대상','나 기업');
  add(P.otherOrg,'other-org',ids.other,'submitted','다른조직대상','비밀 기업');
  // A counselor edit history entry: shown in the counselor's panel, not in the admin view.
  const before=structuredClone(seedAnswers.answers);before.reg.name='수정전이름';
  t.assessment_history.push({assessment_id:'a-'+P.submitted,action:'edit',created_at:'2026-10-02T00:00:00Z',before_data:{answers:before},after_data:{answers:structuredClone(seedAnswers.answers)}});
  return h;
}
const url=(id,kind,extra='')=>'https://fixture.invalid/?'+(id!==undefined?'id='+encodeURIComponent(id):'')+(kind?'&kind='+kind:'')+extra;
const admin=(h,token,id,kind,extra)=>h.call(h.adminReport.handleAdminReport,token,undefined,'GET',url(id,kind,extra));
const counselor=(h,token,id,kind)=>h.call(h.assessment,token,undefined,'GET',url(id,kind));
const sheets=html=>html.slice(html.indexOf('<section class="sheet'));
const printable=html=>(html.match(/<section class="sheet(?![^"]*noprintpage)/g)||[]).length;

test('1·7·8 allowed admin gets the 5-page counselor and 3-page client report',async()=>{
  const h=seed();
  for(const [kind,pages] of [['c',5],['p',3],[undefined,5]]){
    const r=await admin(h,ids.admin,P.submitted,kind);
    expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');
    expect(Object.keys(r.data)).toEqual(['html']);expect(printable(r.data.html)).toBe(pages);
    expect(r.data.html).toContain(seedAnswers.answers.reg.name);expect(r.data.html).toContain("nav('admin')");expect(r.data.html).toContain('관리자 참여자 목록');
    expect(r.data.html).not.toContain('상담사 확인용');expect(r.data.html).not.toContain('수정전이름');expect(r.data.html).not.toContain("nav('cns')");
  }
  // Only the admin's organization is read; no change history is read for the admin view.
  const reads=h.state.reads.filter(x=>x.table==='participants');
  expect(reads.every(x=>x.filters.some(([k,v,op])=>k==='organization_id'&&v===ids.org&&op==='eq'))).toBe(true);
  expect(h.state.reads.some(x=>x.table==='assessment_history')).toBe(false);
});

test('9 admin and assigned counselor get the same printed pages for the same report kind',async()=>{
  const h=seed();
  for(const kind of ['c','p']){
    const a=await admin(h,ids.admin,P.submitted,kind),c=await counselor(h,ids.counselor,P.submitted,kind);
    expect(c.status).toBe(200);expect(a.status).toBe(200);
    expect(sheets(a.data.html)).toBe(sheets(c.data.html));
    expect(printable(a.data.html)).toBe(printable(c.data.html));
  }
  // The counselor view is unchanged: its own back button and, for 5 pages, the change history.
  const c=await counselor(h,ids.counselor,P.submitted,'c');
  expect(c.data.html).toContain("nav('cns')");expect(c.data.html).toContain('변경 이력 1건');expect(c.data.html).toContain('수정전이름');
});

test('2·3·4 other organization, missing, draft and not-started participants get the same refusal',async()=>{
  const h=seed();
  for(const id of [P.otherOrg,P.missing,P.draft,P.none]){
    const r=await admin(h,ids.admin,id,'c');expect(r.status).toBe(403);expect(r.data).toEqual({error:'NOT_AVAILABLE'});
  }
});

test('5·6 participants, other counselors and other roles cannot use either report path',async()=>{
  const h=seed();
  h.state.tables.user_profiles.push({user_id:'manager-user',organization_id:ids.org,role:'manager',display_name:'고객사'});h.state.users['manager-user']={id:'manager-user',app_metadata:{}};
  for(const token of [ids.participant,ids.counselor,C2,ids.other,'manager-user'])expect((await admin(h,token,P.submitted,'c')).status).toBe(403);
  expect((await admin(h,null,P.submitted,'c')).status).toBe(401);expect((await admin(h,'unknown-token',P.submitted,'c')).status).toBe(401);
  // Existing counselor-only report rule is kept.
  expect((await counselor(h,ids.participant,P.submitted,'c')).status).toBe(403);
  expect((await counselor(h,ids.admin,P.submitted,'c')).status).toBe(403);
  expect((await counselor(h,C2,P.submitted,'c')).status).toBe(403);
  expect((await counselor(h,ids.other,P.submitted,'c')).status).toBe(403);
  expect((await counselor(h,C2,P.otherCounselor,'c')).status).toBe(200);
  // An admin who still has to change the first password is refused.
  h.state.users[ids.admin].app_metadata={must_change_password:true};
  expect((await admin(h,ids.admin,P.submitted,'c')).data).toEqual({error:'PASSWORD_CHANGE_REQUIRED'});
});

test('malformed, scoped or extra request parameters are refused; failed reads fail closed',async()=>{
  const h=seed();
  expect((await admin(h,ids.admin,'not-a-uuid','c')).status).toBe(400);
  expect((await admin(h,ids.admin,undefined,'c')).status).toBe(400);
  expect((await admin(h,ids.admin,P.submitted,'x')).data).toEqual({error:'INVALID_REPORT_KIND'});
  for(const extra of ['&organizationId=other-org','&id='+P.otherOrg,'&role=admin'])expect((await admin(h,ids.admin,P.submitted,'c',extra)).status).toBe(400);
  expect((await h.call(h.adminReport.handleAdminReport,ids.admin,{id:P.submitted})).status).toBe(405);
  for(const table of ['participants','assessments']){const f=seed();f.state.failReadsOf=table;const r=await admin(f,ids.admin,P.submitted,'c');expect(r.status).toBe(503);expect(r.data.html).toBeUndefined()}
});

test('directory lists the report lookup key and only enables reports for submitted rows',async()=>{
  const {validDirectory}=await import('../../src/live/admin-directory-view.js');
  const h=seed(),d=(await h.call(h.directory.handleAdminDirectory,ids.admin)).data;
  expect(validDirectory(d)).toBe(true);
  expect(d.participants.map(p=>[p.name,p.preStatus,p.id]).sort()).toEqual([['다른담당대상','submitted',P.otherCounselor],['미시작대상','notStarted',P.none],['보고서대상','submitted',P.submitted],['임시저장대상','draft',P.draft]].sort());
  for(const change of [x=>{x.participants[1].id=x.participants[0].id},x=>{delete x.participants[0].id}]){const bad=structuredClone(d);change(bad);expect(validDirectory(bad)).toBe(false)}
});

test.describe('admin report screen',()=>{
  let server;
  test.beforeAll(async()=>{server=await serve('src')});
  test.afterAll(async()=>{await server.close()});
  async function open(page,h,{reportStatus=null}={}){
    const calls=[];
    await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
    await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
      const request=route.request(),u=new URL(request.url()),body=request.postDataJSON(),token=request.headers().authorization?.replace(/^Bearer /,'');
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
      calls.push(u.pathname+u.search);let result;
      const q='https://fixture.invalid/'+u.search;
      if(u.pathname.endsWith('/secondcareer-login')){const id=h.signIn(body.loginId,body.password)?.id;result=id?{status:200,data:{access_token:id,refresh_token:'refresh-'+id,expires_at:Math.floor(Date.now()/1000)+3600}}:{status:401,data:{error:'INVALID_CREDENTIALS'}}}
      else if(u.pathname==='/auth/v1/token'){const id=body?.refresh_token?.replace(/^refresh-/,'');result=id&&h.state.users[id]?{status:200,data:{access_token:id,refresh_token:'refresh-'+id,expires_in:3600}}:{status:400,data:{error:'INVALID_REFRESH_TOKEN'}}}
      else if(u.pathname.endsWith('/secondcareer-account'))result=await h.call(h.account.handleAccount,token,body,request.method());
      else if(u.pathname.endsWith('/secondcareer-register-participant'))result=await h.call(h.registration.handleRegistration,token,body,request.method());
      else if(u.pathname.endsWith('/secondcareer-admin-progress'))result=await h.call(h.progress.handleAdminProgress,token,body,request.method(),q);
      else if(u.pathname.endsWith('/secondcareer-admin-directory'))result=await h.call(h.directory.handleAdminDirectory,token,body,request.method(),q);
      else if(u.pathname.endsWith('/secondcareer-admin-report'))result=reportStatus?{status:reportStatus,data:{error:'FIXTURE'}}:await h.call(h.adminReport.handleAdminReport,token,body,request.method(),q);
      else if(u.pathname.endsWith('/secondcareer-assessment'))result=await h.call(h.assessment,token,body,request.method(),q);
      else if(u.pathname==='/auth/v1/logout')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*'}});
      else throw Error('Unexpected API path: '+u.pathname);
      await route.fulfill({status:result.status,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body:JSON.stringify(result.data)});
    });
    await page.goto(server.url);
    return calls;
  }
  async function login(page,id='admin01'){await page.locator('#lg-id').fill(id);await page.locator('#lg-pw').fill('Fixture-password-123!');await page.getByRole('button',{name:'로그인',exact:true}).click()}
  const row=(page,name)=>page.locator('[data-dir-participants] tr[data-dir-participant]').filter({hasText:name});
  // PDF page count in print media, after the app's beforeprint fitting (same reading as tests/snapshot/capture.mjs).
  async function pdfPages(page){
    await page.emulateMedia({media:'print'});await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
    const s=(await page.pdf({preferCSSPageSize:true,printBackground:true})).toString('latin1');
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));await page.emulateMedia({media:null});
    const counts=[...s.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g)].map(m=>+m[1]).concat([...s.matchAll(/\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/g)].map(m=>+m[1]));
    return counts.length?Math.max(...counts):null;
  }

  test('10 admin opens both report kinds from the list, prints and returns with filters kept',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    const h=seed();await open(page,h);await login(page);
    await expect(row(page,'보고서대상')).toBeVisible();
    await expect(row(page,'임시저장대상').locator('[data-admin-report]')).toHaveCount(0);await expect(row(page,'임시저장대상')).toContainText('임시저장 상태 · 최종 제출 후 조회 가능');
    await expect(row(page,'미시작대상').locator('[data-admin-report]')).toHaveCount(0);await expect(row(page,'미시작대상')).toContainText('미시작 · 최종 제출 후 조회 가능');
    await page.locator('#dir-company').selectOption({label:'가 기업'});
    await row(page,'보고서대상').getByRole('button',{name:'상담사용 5쪽'}).click();
    await expect(page.locator('section.sheet:not(.noprintpage)')).toHaveCount(5);
    await expect(page.locator('#admin-report-kind')).toContainText('상담사용 5쪽');
    await expect(page.getByRole('button',{name:'응답 수정 (상담사)'})).toHaveCount(0);await expect(page.locator('.editpanel')).toHaveCount(0);
    await expect(page.locator('#admin-progress, #admin-directory')).toHaveCount(0);
    expect(await pdfPages(page)).toBe(5);
    await page.evaluate(()=>{window.printCalls=0;window.print=()=>window.printCalls++});
    await page.getByRole('button',{name:'PDF로 저장(인쇄)'}).click();expect(await page.evaluate(()=>window.printCalls)).toBe(1);
    await page.locator('#admin-report-kind').getByRole('button',{name:'내담자용 3쪽'}).click();
    await expect(page.locator('section.sheet:not(.noprintpage)')).toHaveCount(3);
    expect(await pdfPages(page)).toBe(3);
    await page.getByRole('button',{name:'← 관리자 참여자 목록'}).click();
    await expect(page.getByRole('heading',{name:'관리자 참여자 등록'})).toBeVisible();
    await expect(page.locator('section.sheet')).toHaveCount(0);
    await expect(page.locator('#dir-company')).toHaveValue('0');await expect(page.locator('[data-dir-participants] tr[data-dir-participant]')).toHaveCount(2);
    await expect(page.locator('#admin-progress [data-kpi="total"] b')).toHaveText('4');
    expect(errors).toEqual([]);
  });

  test('9 browser print page counts match the assigned counselor view',async({page})=>{
    const h=seed();await open(page,h);await login(page,'consult01');
    await page.locator(`[data-participant="${P.submitted}"] button[onclick^="openRes"]`).first().click();
    await expect(page.locator('section.sheet:not(.noprintpage)')).toHaveCount(5);const counselorPages=await pdfPages(page);
    const counselorSheets=await page.locator('section.sheet').evaluateAll(s=>s.map(e=>e.outerHTML).join(''));
    await page.evaluate(()=>logout());await expect(page.getByRole('heading',{name:'세컨플래닝 로그인'})).toBeVisible();await login(page);
    await row(page,'보고서대상').getByRole('button',{name:'상담사용 5쪽'}).click();
    await expect(page.locator('section.sheet:not(.noprintpage)')).toHaveCount(5);
    expect(await pdfPages(page)).toBe(counselorPages);expect(counselorPages).toBe(5);
    expect(await page.locator('section.sheet').evaluateAll(s=>s.map(e=>e.outerHTML).join(''))).toBe(counselorSheets);
  });

  test('11 failed report and expired session are handled without leaving a report on screen',async({page})=>{
    const h=seed();await open(page,h,{reportStatus:503});await login(page);
    await row(page,'보고서대상').getByRole('button',{name:'내담자용 3쪽'}).click();
    await expect(page.getByRole('alert')).toContainText('보고서를 불러오지 못했습니다');
    await expect(page.locator('section.sheet')).toHaveCount(0);await expect(page.locator('#admin-directory')).toBeVisible();
    await page.evaluate(()=>logout());await expect(page.getByRole('heading',{name:'세컨플래닝 로그인'})).toBeVisible();
    await open(page,h,{reportStatus:401});await login(page);
    await row(page,'보고서대상').getByRole('button',{name:'상담사용 5쪽'}).click();
    await expect(page.getByRole('heading',{name:'세컨플래닝 로그인'})).toBeVisible();
    await expect(page.locator('section.sheet')).toHaveCount(0);
    expect(await page.evaluate(()=>sessionStorage.getItem('sp-live-refresh-token'))).toBeNull();
  });
});
