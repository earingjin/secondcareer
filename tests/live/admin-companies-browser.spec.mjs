import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve-static.mjs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
let server;
test.beforeAll(async()=>{server=await serve('src')});
test.afterAll(async()=>{await server.close()});
const sec=page=>page.locator('#admin-companies');
const field=(page,k)=>sec(page).locator('[data-company-field="'+k+'"]');
const current=page=>sec(page).locator('[data-company-message]');
async function open(page,h,options={}){
  const calls=[];
  await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
  await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
    const req=route.request(),u=new URL(req.url()),body=req.postDataJSON(),token=req.headers().authorization?.replace(/^Bearer /,'');
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'}});
    calls.push({path:u.pathname,query:u.search,method:req.method(),body});let r;
    const url='https://fixture.invalid/'+u.search;
    if(u.pathname.endsWith('/secondcareer-login')){const id=h.signIn(body.loginId,body.password)?.id;r=id?{status:200,data:{access_token:id,refresh_token:'refresh-'+id,expires_at:Math.floor(Date.now()/1000)+3600}}:{status:401,data:{error:'INVALID_CREDENTIALS'}}}
    else if(u.pathname==='/auth/v1/token'){const id=body.refresh_token?.replace(/^refresh-/,'');r=h.state.users[id]?{status:200,data:{access_token:id,refresh_token:'refresh-'+id,expires_at:Math.floor(Date.now()/1000)+3600}}:{status:401,data:{error:'INVALID_CREDENTIALS'}}}
    else if(u.pathname.endsWith('/secondcareer-account'))r=await h.call(h.account.handleAccount,token,body,req.method());
    else if(u.pathname.endsWith('/secondcareer-admin-progress')){
      r=await h.call(h.progress.handleAdminProgress,token,body,req.method(),url);
      if(options.progressResponse)r=await options.progressResponse(u,r);
    }
    else if(u.pathname.endsWith('/secondcareer-admin-directory')){
      r=await h.call(h.directory.handleAdminDirectory,token,body,req.method(),url);
      if(options.directoryResponse)r=await options.directoryResponse(u,r);
    }
    else if(u.pathname.endsWith('/secondcareer-admin-aggregate')){r=await h.call(h.aggregate.handleAdminAggregate,token,body,req.method(),url);if(options.aggregateResponse)r=await options.aggregateResponse(u,r)}
    else if(u.pathname.endsWith('/secondcareer-admin-unlinked-link')){r=await h.call(h.unlinkedLink.handleAdminUnlinkedLink,token,body,req.method(),url);if(options.unlinkedLinkResponse)r=await options.unlinkedLinkResponse(r)}
    else if(u.pathname.endsWith('/secondcareer-admin-unlinked')){
      r=options.unlinkedStatus?{status:options.unlinkedStatus,data:{error:'QUERY_FAILED'}}:await h.call(h.unlinked.handleAdminUnlinked,token,body,req.method(),url);
      if(options.unlinkedResponse)r=await options.unlinkedResponse(u,r);
    }
    else if(u.pathname.endsWith('/secondcareer-admin-report'))r=await h.call(h.adminReport.handleAdminReport,token,body,req.method(),url);
    else if(u.pathname.endsWith('/secondcareer-register-participant')){r=await h.call(h.registration.handleRegistration,token,body,req.method(),url);if(options.registrationResponse)r=await options.registrationResponse(r)}
    else if(u.pathname.endsWith('/secondcareer-admin-companies')){
      if(options.hold)await options.hold;
      r=options.companyStatus?{status:options.companyStatus,data:{error:options.companyStatus===403?'FORBIDDEN':'COMPANY_QUERY_FAILED'}}:await h.call(h.companies.handleAdminCompanies,token,body,req.method(),url);
    }
    else if(u.pathname.endsWith('/secondcareer-assessment'))r=await h.call(h.assessment,token,body,req.method(),url);
    else if(u.pathname==='/auth/v1/logout')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*'}});
    else throw Error('Unexpected path '+u.pathname);
    return route.fulfill({status:r.status,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body:JSON.stringify(r.data)});
  });
  await page.goto(server.url);return calls;
}
async function login(page,id='admin01'){await page.locator('#lg-id').fill(id);await page.locator('#lg-pw').fill('Fixture-password-123!');await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.getByRole('button',{name:'로그아웃',exact:true})).toBeVisible()}
async function fill(page,name){for(const [k,v] of Object.entries({name,start_date:'2026-11-01',end_date:'2027-01-31',pm_name:'가상 PM',pm_email:'pm@example.invalid',pm_phone:'010-0000-0000'}))await field(page,k).fill(v)}
const companyCalls=calls=>calls.filter(c=>c.path.endsWith('admin-companies'));

async function seedAssignmentCompanies(h){
  const companies=[];
  for(const name of ['배정 고객사 A','배정 고객사 B']){
    const r=await h.call(h.companies.handleAdminCompanies,ids.admin,{name,start_date:'2026-11-01',end_date:'2027-01-31',pm_name:'합성 PM',pm_email:'pm@example.invalid',pm_phone:'01000000000'});companies.push(r.data.company);
  }
  return companies;
}
async function openAssignments(page,id){
  if(await sec(page).getByRole('button',{name:'고객사 목록으로'}).isVisible())await sec(page).getByRole('button',{name:'고객사 목록으로'}).click();
  await sec(page).locator(`[data-company-id="${id}"]`).getByRole('button',{name:'상세 관리'}).click();
  await sec(page).getByRole('button',{name:'상담사 배정 조회',exact:true}).click();
}

test('admin starts with the company list, opens a customer by name and returns without losing other admin entry points',async({page})=>{
  const h=harness(),[a]=await seedAssignmentCompanies(h),calls=await open(page,h);await login(page);
  const list=sec(page).locator('[data-company-list-view]');await expect(list).toBeVisible();await expect(list).toContainText(a.name);
  expect(await page.locator('#admin-companies').evaluate(el=>el.compareDocumentPosition(document.querySelector('#admin-progress')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  await sec(page).getByRole('button',{name:a.name,exact:true}).click();
  await expect(page.getByRole('heading',{name:a.name,exact:true})).toBeVisible();await expect(page.locator('#app')).toContainText(a.id);
  for(const [id,label] of [['progress','진단 진행 현황'],['operations','운영 관리'],['aggregate','통합 분석보고서'],['registration','참여자 일괄 등록']]){
    const button=page.locator(`[data-company-dashboard-tab="${id}"]`);await expect(button).toHaveText(label);await button.click();await expect(button).toHaveAttribute('aria-pressed','true');await expect(page.locator('section[aria-live="polite"] > h3')).toHaveText(label);
  }
  await page.locator('[data-company-dashboard-back]').click();await expect(list).toBeVisible();
  await sec(page).locator(`[data-company-id="${a.id}"]`).getByRole('button',{name:'상세 관리'}).click();await expect(sec(page).locator('[data-company-target]')).toContainText(a.id);
  await expect(sec(page).locator('[data-company-manager-host]')).toBeVisible();await expect(sec(page).locator('[data-company-assignments]')).toBeVisible();
  await sec(page).getByRole('button',{name:'고객사 목록으로'}).click();await expect(list).toBeVisible();await expect(sec(page).locator('[data-company-form]')).toHaveCount(0);
  for(const id of ['admin-directory','admin-progress','admin-aggregate','live-registration','admin-assessment-url','admin-counselors']){
    await expect(page.locator(`a[href="#${id}"]`)).toBeVisible();await expect(page.locator(`#${id}`)).toBeVisible();
  }
  const before=companyCalls(calls).length;await page.getByRole('button',{name:'로그아웃',exact:true}).click();await login(page);await expect(sec(page).locator('[data-company-list]')).toContainText(a.name);expect(companyCalls(calls).length).toBeGreaterThan(before);
});

test('unlinked review lists only NULL company IDs and never writes or auto-selects a matching master',async({page})=>{
  const h=harness(),[company]=await seedAssignmentCompanies(h),id=crypto.randomUUID(),linked=crypto.randomUUID();
  h.state.tables.participants.push({id,organization_id:ids.org,company_id:null,display_name:'<img src=x onerror=alert(1)>',company_name:company.name,counselor_user_id:ids.counselor},{id:linked,organization_id:ids.org,company_id:company.id,display_name:'연결됨',company_name:company.name});
  const calls=await open(page,h);await login(page);
  const writesBefore=h.state.writes.length,section=page.locator('#admin-unlinked');await page.locator('a[href="#admin-unlinked"]').click();await expect(section).toContainText('총 미연결 참여자 2명');
  await expect(section).not.toContainText('연결됨');await expect(section.locator('img')).toHaveCount(0);
  await section.locator(`[data-unlinked-review="${id}"]`).click();
  await expect(section.locator('[data-unlinked-candidate]')).toContainText('대상 고객사: 미지정');
  await expect(section.locator('[data-unlinked-candidate]')).toContainText(company.name);
  await expect(section.locator(`[data-unlinked-company="${company.id}"]`)).toBeVisible();
  await section.locator(`[data-unlinked-company="${company.id}"]`).click();
  await expect(section.locator('[data-unlinked-candidate]')).toContainText(`ID ${company.id}`);
  await expect(section.locator('[data-unlinked-review-status]')).toContainText('운영 배정되지 않아 연결을 보류합니다');
  await expect(section.locator('[data-unlinked-confirm]')).toHaveCount(0);
  await section.locator('[data-unlinked-cancel]').click();await expect(section.locator('[data-unlinked-candidate]')).toHaveCount(0);
  expect(calls.filter(c=>c.method!=='GET'&&c.path.endsWith('admin-unlinked'))).toHaveLength(0);
  expect(h.state.writes).toHaveLength(writesBefore);
});

test('unlinked failures clear old rows and late searches cannot replace current results',async({page})=>{
  const h=harness(),options={};h.state.tables.participants.push({id:crypto.randomUUID(),organization_id:ids.org,company_id:null,display_name:'새로운 참여자',company_name:'기업'});
  await open(page,h,options);await login(page);const section=page.locator('#admin-unlinked');await section.locator('[data-unlinked-search] button').click();
  await expect(section).toContainText('새로운 참여자');
  let release,entered;const pending=new Promise(r=>{release=r}),started=new Promise(r=>{entered=r});
  options.unlinkedResponse=async(u,r)=>{if(u.searchParams.get('name')==='이전'){entered();await pending}return r};
  await section.locator('input[name="name"]').fill('이전');await section.locator('[data-unlinked-search] button').click();await started;
  await section.locator('input[name="name"]').fill('새로운');await section.locator('[data-unlinked-search] button').click();
  await expect(section).toContainText('새로운 참여자');release();await expect(section).toContainText('새로운 참여자');
  options.unlinkedStatus=503;await section.locator('[data-unlinked-search] button').click();
  await expect(section).toContainText('처리 결과를 확인하지 못했습니다');await expect(section).not.toContainText('새로운 참여자');
});

test('unlinked confirmation links one participant and refreshes the list and company scope',async({page})=>{
  const h=harness(),[company]=await seedAssignmentCompanies(h),id=crypto.randomUUID();
  h.state.tables.client_company_counselors.push({organization_id:ids.org,company_id:company.id,counselor_user_id:ids.counselor,created_at:'2026-11-01T00:00:00Z'});
  h.state.tables.participants.push({id,organization_id:ids.org,company_id:null,display_name:'연결 대상',company_name:'옛 기업명',counselor_user_id:ids.counselor});
  const calls=await open(page,h);await login(page);const section=page.locator('#admin-unlinked');
  await page.locator('a[href="#admin-unlinked"]').click();await section.locator(`[data-unlinked-review="${id}"]`).click();
  await section.locator(`[data-unlinked-company="${company.id}"]`).click();
  await expect(section.locator('[data-unlinked-review-status]')).toContainText('운영 배정을 확인했습니다');
  page.once('dialog',dialog=>{expect(dialog.message()).toContain(id);expect(dialog.message()).toContain(company.id);dialog.accept()});
  await section.locator('[data-unlinked-confirm]').click();
  await expect(section).toContainText('고객사에 연결했습니다');await expect(section.locator(`[data-unlinked-review="${id}"]`)).toHaveCount(0);
  expect(h.state.tables.participants.find(p=>p.id===id).company_id).toBe(company.id);
  expect(h.state.tables.participant_company_link_events).toHaveLength(1);
  expect(calls.filter(c=>c.path.endsWith('admin-unlinked-link')&&c.method==='POST')).toHaveLength(1);
  await sec(page).locator(`[data-company-id="${company.id}"]`).getByRole('button',{name:company.name,exact:true}).click();
  await page.locator('[data-company-dashboard-tab="operations"]').click();await expect(page.locator('section[aria-live="polite"]')).toContainText('연결 대상');
});

test('unlinked delayed failed link keeps the candidate and never automatically retries',async({page})=>{
  const h=harness(),[company]=await seedAssignmentCompanies(h),id=crypto.randomUUID();
  h.state.tables.client_company_counselors.push({organization_id:ids.org,company_id:company.id,counselor_user_id:ids.counselor,created_at:'2026-11-01T00:00:00Z'});
  h.state.tables.participants.push({id,organization_id:ids.org,company_id:null,display_name:'지연 대상',company_name:'옛 기업명',counselor_user_id:ids.counselor});
  let release,started;const pending=new Promise(r=>{release=r}),entered=new Promise(r=>{started=r});
  const options={unlinkedLinkResponse:async()=>{started();await pending;return {status:503,data:{error:'LINK_OUTCOME_UNKNOWN'}}}},calls=await open(page,h,options);await login(page);
  const section=page.locator('#admin-unlinked');await page.locator('a[href="#admin-unlinked"]').click();await section.locator(`[data-unlinked-review="${id}"]`).click();await section.locator(`[data-unlinked-company="${company.id}"]`).click();
  await expect(section.locator('[data-unlinked-confirm]')).toBeVisible();page.once('dialog',dialog=>dialog.accept());await section.locator('[data-unlinked-confirm]').click();await entered;
  await sec(page).locator(`[data-company-id="${company.id}"]`).getByRole('button',{name:company.name,exact:true}).click();await expect(section).toBeVisible();
  release();await expect(section.locator('[data-unlinked-review-status]')).toContainText('자동 재시도하지 말고');
  await expect(section.locator('[data-unlinked-confirm]')).toHaveCount(0);expect(calls.filter(c=>c.path.endsWith('admin-unlinked-link')&&c.method==='POST')).toHaveLength(1);
});

test('company selection restores after reload, rejects revoked access and clears on back and logout',async({page})=>{
  const h=harness(),[a]=await seedAssignmentCompanies(h),options={};const calls=await open(page,h,options);await login(page);
  const key='sp-admin-selected-company';
  const select=async()=>sec(page).locator(`[data-company-id="${a.id}"]`).getByRole('button',{name:a.name,exact:true}).click();
  await select();await expect(page.getByRole('heading',{name:a.name,exact:true})).toBeVisible();
  expect(await page.evaluate(k=>sessionStorage.getItem(k),key)).toBe(a.id);
  const before=calls.length;await page.reload();await expect(page.getByRole('heading',{name:a.name,exact:true})).toBeVisible();
  expect(calls.slice(before).some(c=>c.path.endsWith('admin-companies')&&c.query.includes('id='+a.id))).toBe(true);
  await page.locator('[data-company-dashboard-back]').click();expect(await page.evaluate(k=>sessionStorage.getItem(k),key)).toBeNull();
  await select();options.companyStatus=403;await page.reload();await expect(page.locator('#admin-companies')).toBeVisible();expect(await page.evaluate(k=>sessionStorage.getItem(k),key)).toBeNull();
  options.companyStatus=null;await page.reload();await expect(sec(page).locator('[data-company-list]')).toBeVisible();await select();
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();expect(await page.evaluate(k=>sessionStorage.getItem(k),key)).toBeNull();await login(page);await expect(page.locator('#admin-companies')).toBeVisible();
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();await login(page,'consult01');await page.evaluate(([k,id])=>sessionStorage.setItem(k,id),[key,a.id]);await page.reload();
  await expect(page.getByRole('button',{name:'로그아웃',exact:true})).toBeVisible();await expect(page.locator('[data-company-dashboard-back]')).toHaveCount(0);expect(await page.evaluate(k=>sessionStorage.getItem(k),key)).toBeNull();
});

test('company dashboard keeps the selected ID across tabs and switches without mixing companies',async({page})=>{
  const h=harness(),[a,b]=await seedAssignmentCompanies(h),calls=await open(page,h);expect(a.id).not.toBe(b.id);await login(page);
  const tabs=[['progress','진단 진행 현황'],['operations','운영 관리'],['aggregate','통합 분석보고서'],['registration','참여자 일괄 등록']];
  const select=async company=>{await sec(page).locator(`[data-company-id="${company.id}"]`).getByRole('button',{name:company.name,exact:true}).click()};
  const verify=async(company,other)=>{
    for(const [id,label] of tabs){
      const button=page.locator(`[data-company-dashboard-tab="${id}"]`);await button.click();
      await expect(button).toHaveAttribute('aria-pressed','true');await expect(page.locator('section[aria-live="polite"] > h3')).toHaveText(label);
      await expect(page.getByRole('heading',{name:company.name,exact:true})).toBeVisible();await expect(page.locator('#app')).toContainText(company.id);
      await expect(page.locator('#app')).not.toContainText(other.name);await expect(page.locator('#app')).not.toContainText(other.id);
      if(id==='progress')await expect(page.locator('section[aria-live="polite"] [data-kpi="total"] b')).toHaveText('0');
      else if(id==='operations')await expect(page.locator('section[aria-live="polite"] [data-dir-kpi="participants"] b')).toHaveText('0');
      else if(id==='registration'){await expect(page.locator('[data-registration-fixed]')).toContainText(company.id);await expect(page.locator('#registration-company-mode, #registration-company')).toHaveCount(0)}
      else {await expect(page.locator('[data-agg-tab="r8"]')).toBeVisible();await expect(page.locator('[data-aggregate-company]')).toHaveCount(0);await page.locator('[data-agg-tab="r8"]').click();await expect(page.locator('[data-agg-base]')).toContainText(company.name)}
      for(const selector of ['#admin-progress','#admin-directory','#admin-aggregate','#live-registration'])await expect(page.locator(selector)).toHaveCount(0);
    }
  };
  const before=calls.length;await select(a);await verify(a,b);await page.locator('[data-company-dashboard-back]').click();
  await select(b);await verify(b,a);await page.locator('[data-company-dashboard-back]').click();await select(a);
  await expect(page.getByRole('heading',{name:a.name,exact:true})).toBeVisible();await expect(page.locator('#app')).toContainText(a.id);await expect(page.locator('#app')).not.toContainText(b.id);
  expect(calls.slice(before).filter(c=>c.method==='POST'&&/register/i.test(c.path))).toHaveLength(0);
});

test('fixed company registration rejects mixed names, limits counselors and clears input on company change',async({page})=>{
  const h=harness(),[a,b]=await seedAssignmentCompanies(h);h.state.enabled=true;
  h.state.tables.client_company_counselors.push({organization_id:ids.org,company_id:a.id,counselor_user_id:ids.counselor,created_at:'2026-11-01T00:00:00Z'});
  const calls=await open(page,h);await login(page);
  const select=async company=>{await sec(page).locator(`[data-company-id="${company.id}"]`).getByRole('button',{name:company.name,exact:true}).click();await page.locator('[data-company-dashboard-tab="registration"]').click()};
  await select(a);await expect(page.locator('[data-registration-fixed]')).toContainText(a.id);
  await expect(page.locator('#registration-company-mode, #registration-company')).toHaveCount(0);
  await expect(page.locator('#registration-counselor')).toContainText(ids.counselor);
  await page.getByRole('textbox',{name:'1행 이름'}).fill('테스트');await page.getByRole('textbox',{name:'1행 연락처'}).fill('01012345678');
  await page.locator('#registration-counselor').selectOption(ids.counselor);
  await page.getByRole('textbox',{name:'1행 소속기업'}).fill(b.name);
  await page.locator('#company-registration [data-action="register"]').click();
  await expect(page.locator('#company-registration [data-preview]')).toContainText('소속기업');
  expect(calls.filter(c=>c.path.endsWith('register-participant'))).toHaveLength(0);
  await page.getByRole('textbox',{name:'1행 소속기업'}).fill('');
  await page.locator('#company-registration [data-action="register"]').click();
  await expect(page.locator('#company-registration .notice-s')).toBeVisible();
  const writes=calls.filter(c=>c.path.endsWith('register-participant'));
  expect(writes).toHaveLength(1);expect(writes[0].body.companyId).toBe(a.id);expect(writes[0].body.companyName).toBe(a.name);
  await page.locator('[data-company-dashboard-back]').click();await select(b);
  await expect(page.locator('[data-registration-fixed]')).toContainText(b.id);
  await expect(page.locator('#company-registration .notice-s')).toHaveCount(0);
  await expect(page.locator('#company-registration [data-action="register"]')).toBeDisabled();
});

test('fixed registration confirms unsaved navigation and blocks movement while submitting',async({page})=>{
  const h=harness(),[a,b]=await seedAssignmentCompanies(h);h.state.enabled=true;
  h.state.tables.client_company_counselors.push({organization_id:ids.org,company_id:a.id,counselor_user_id:ids.counselor,created_at:'2026-11-01T00:00:00Z'});
  let release,started;const pending=new Promise(r=>{release=r}),entered=new Promise(r=>{started=r});
  const options={registrationResponse:async r=>{started();await pending;return r}},calls=await open(page,h,options);await login(page);
  await sec(page).locator(`[data-company-id="${a.id}"]`).getByRole('button',{name:a.name,exact:true}).click();
  await page.locator('[data-company-dashboard-tab="registration"]').click();
  await expect(page.locator('[data-registration-assignments]')).toContainText('배정된 상담사만');
  await page.getByRole('textbox',{name:'1행 이름'}).fill('대기자');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-company-dashboard-back]').click();
  await expect(page.getByRole('textbox',{name:'1행 이름'})).toHaveValue('대기자');
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-company-dashboard-tab="progress"]').click();
  await page.locator('[data-company-dashboard-tab="registration"]').click();await expect(page.getByRole('textbox',{name:'1행 이름'})).toHaveValue('');
  await expect(page.locator('[data-registration-assignments]')).toContainText('배정된 상담사만');
  await page.getByRole('textbox',{name:'1행 이름'}).fill('진행자');await page.getByRole('textbox',{name:'1행 연락처'}).fill('01022223333');await page.locator('#registration-counselor').selectOption(ids.counselor);
  await page.locator('#company-registration [data-action="register"]').click();await entered;
  await page.locator('[data-company-dashboard-back]').click();await page.locator('[data-company-dashboard-tab="operations"]').click();
  await expect(page.locator('#company-registration')).toBeVisible();
  await expect(page.getByRole('textbox',{name:'1행 이름'})).toHaveValue('진행자');
  expect(calls.filter(c=>c.path.endsWith('register-participant'))).toHaveLength(1);
  release();await expect(page.locator('#company-registration .notice-s')).toBeVisible();
  await page.locator('[data-company-dashboard-back]').click();await sec(page).locator(`[data-company-id="${b.id}"]`).getByRole('button',{name:b.name,exact:true}).click();
  await page.locator('[data-company-dashboard-tab="registration"]').click();await expect(page.locator('#company-registration .notice-s')).toHaveCount(0);
});

test('inactive fixed company and failed assignment lookup cannot submit',async({page})=>{
  const h=harness(),[a,b]=await seedAssignmentCompanies(h);h.state.enabled=true;
  h.state.tables.client_companies.find(c=>c.id===b.id).status='inactive';
  h.state.tables.client_company_counselors.push({organization_id:ids.org,company_id:a.id,counselor_user_id:ids.counselor,created_at:'2026-11-01T00:00:00Z'});
  h.state.failReadsOf='client_company_counselors';const calls=await open(page,h);await login(page);
  await sec(page).locator(`[data-company-id="${a.id}"]`).getByRole('button',{name:a.name,exact:true}).click();await page.locator('[data-company-dashboard-tab="registration"]').click();
  await expect(page.locator('[data-registration-assignments]')).toContainText('배정을 확인하기 전에는 등록할 수 없습니다');
  await expect(page.locator('#company-registration [data-action="register"]')).toBeDisabled();
  await page.locator('[data-company-dashboard-back]').click();await sec(page).locator(`[data-company-id="${b.id}"]`).getByRole('button',{name:b.name,exact:true}).click();await page.locator('[data-company-dashboard-tab="registration"]').click();
  await expect(page.locator('section[aria-live="polite"]')).toContainText('비활성 고객사에는 신규 참여자를 등록할 수 없습니다');
  await expect(page.locator('#company-registration')).toHaveCount(0);expect(calls.filter(c=>c.path.endsWith('register-participant'))).toHaveLength(0);
});

test('admin home confirms unsaved registration input before opening a company',async({page})=>{
  const h=harness(),[a]=await seedAssignmentCompanies(h);await open(page,h);await login(page);
  await page.locator('#live-registration [data-row="0"][data-key="displayName"]').fill('미저장 입력');
  const customer=sec(page).locator(`[data-company-id="${a.id}"]`).getByRole('button',{name:a.name,exact:true});
  page.once('dialog',dialog=>{expect(dialog.message()).toContain('저장하지 않은 참여자 입력');dialog.dismiss()});
  await customer.click();await expect(page.locator('#live-registration [data-row="0"][data-key="displayName"]')).toHaveValue('미저장 입력');
  await expect(page.locator('[data-company-dashboard-back]')).toHaveCount(0);
  page.once('dialog',dialog=>dialog.accept());await customer.click();
  await expect(page.getByRole('heading',{name:a.name,exact:true})).toBeVisible();
  await page.locator('[data-company-dashboard-back]').click();
  await expect(page.locator('#live-registration [data-row="0"][data-key="displayName"]')).toHaveValue('');
});

test('admin home registration stays mounted during a request and its result cannot enter company registration',async({page})=>{
  const h=harness(),[a]=await seedAssignmentCompanies(h);h.state.enabled=true;
  let release,started;const pending=new Promise(r=>{release=r}),entered=new Promise(r=>{started=r});
  const calls=await open(page,h,{registrationResponse:async r=>{started();await pending;return r}});await login(page);
  await page.locator('#live-registration [data-row="0"][data-key="displayName"]').fill('홈등록자');
  await page.locator('#live-registration [data-row="0"][data-key="phone"]').fill('01012345678');
  await page.locator('#live-registration #registration-counselor').selectOption(ids.counselor);
  await page.locator('#live-registration [data-action="register"]').click();await entered;
  const customer=sec(page).locator(`[data-company-id="${a.id}"]`).getByRole('button',{name:a.name,exact:true});
  await customer.click();await expect(page.locator('#live-registration')).toBeVisible();
  await expect(page.locator('[data-company-dashboard-back]')).toHaveCount(0);
  expect(calls.filter(c=>c.path.endsWith('register-participant'))).toHaveLength(1);
  release();await expect(page.locator('#live-registration .notice-s')).toBeVisible();
  const secret=page.getByLabel('홈등록자 임시 비밀번호');const password=await secret.inputValue();
  await customer.click();await expect(page.getByRole('heading',{name:a.name,exact:true})).toBeVisible();
  await page.locator('[data-company-dashboard-tab="registration"]').click();
  await expect(page.locator('#company-registration .notice-s')).toHaveCount(0);
  expect(await page.content()).not.toContain(password);
  await page.locator('[data-company-dashboard-back]').click();
  await expect(page.locator('#live-registration .notice-s')).toHaveCount(0);
});

test('company aggregate rejects stale and mismatched responses and prints the selected company',async({page})=>{
  const h=harness(),[a,b]=await seedAssignmentCompanies(h);let release,started;const hold=new Promise(r=>{release=r}),entered=new Promise(r=>{started=r});
  const options={aggregateResponse:async(u,r)=>{if(u.searchParams.get('companyId')===a.id){started();await hold}return r}},calls=await open(page,h,options);await login(page);
  const select=async c=>sec(page).locator(`[data-company-id="${c.id}"]`).getByRole('button',{name:c.name,exact:true}).click();
  await select(a);await page.locator('[data-company-dashboard-tab="aggregate"]').click();await entered;
  await expect(page.locator('[data-admin-aggregate="print"]')).toBeDisabled();await page.locator('[data-company-dashboard-back]').click();
  await select(b);await page.locator('[data-company-dashboard-tab="aggregate"]').click();await page.locator('[data-agg-tab="r8"]').click();await expect(page.locator('[data-agg-base]')).toContainText(b.name);
  release();await expect(page.locator('[data-agg-base]')).toContainText(b.name);
  expect(calls.some(c=>c.path.endsWith('admin-aggregate')&&c.query.includes('companyId='+b.id))).toBe(true);
  await page.evaluate(()=>{window.print=()=>{}});await page.locator('[data-admin-aggregate="print"]').click();
  await expect(page.locator('#admin-aggregate-print')).toContainText(b.name);await expect(page.locator('#admin-aggregate-print [data-aggp]')).toHaveCount(9);
  options.aggregateResponse=async(u,r)=>({...r,data:{...r.data,companyId:a.id}});
  await page.locator('[data-admin-aggregate="load"]').click();await expect(page.locator('[role="status"]').filter({hasText:'응답을 확인하지 못했습니다'})).toBeVisible();
  await expect(page.locator('[data-admin-aggregate="print"]')).toBeDisabled();await expect(page.locator('#admin-aggregate-print')).toHaveCount(0);
});

test('company progress discards delayed, failed and mismatched responses across company changes',async({page})=>{
  const h=harness(),[a,b]=await seedAssignmentCompanies(h);h.state.tables.participants.length=0;
  h.state.tables.participants.push({id:'fixture-a',organization_id:ids.org,company_id:a.id,company_name:b.name},{id:'fixture-b1',organization_id:ids.org,company_id:b.id},{id:'fixture-b2',organization_id:ids.org,company_id:b.id});
  let release,entered;const started=new Promise(resolve=>{entered=resolve}),held=new Promise(resolve=>{release=resolve});
  const options={progressResponse:async(u,r)=>{if(u.searchParams.get('companyId')===a.id){entered();await held}return r}};
  await open(page,h,options);await login(page);
  const select=async c=>sec(page).locator(`[data-company-id="${c.id}"]`).getByRole('button',{name:c.name,exact:true}).click();
  const total=page.locator('section[aria-live="polite"] [data-kpi="total"] b');
  await select(a);await started;await expect(page.locator('#company-progress-status')).toContainText('조회하고 있습니다');
  await page.locator('[data-company-dashboard-back]').click();await select(b);await expect(total).toHaveText('2');
  const delayed=page.waitForResponse(r=>r.url().includes('companyId='+a.id));release();await delayed;await expect(total).toHaveText('2');await expect(page.locator('#app')).not.toContainText(a.id);
  options.progressResponse=async(u,r)=>u.searchParams.has('companyId')?{...r,data:{...r.data,companyId:a.id}}:r;
  await page.locator('[data-company-progress-refresh]').click();await expect(total).toHaveCount(0);await expect(page.locator('#company-progress-status')).not.toBeEmpty();
  options.progressResponse=async(u,r)=>u.searchParams.has('companyId')?{status:503,data:{error:'QUERY_FAILED'}}:r;
  await page.locator('[data-company-progress-refresh]').click();await expect(total).toHaveCount(0);await expect(page.locator('[data-company-progress-refresh]')).toBeEnabled();
});

test('company operations isolates participants and ignores delayed, mismatched and failed reads',async({page})=>{
  const h=harness(),[a,b]=await seedAssignmentCompanies(h);h.state.tables.participants.length=0;
  h.state.tables.participants.push({id:'op-a',organization_id:ids.org,company_id:a.id,company_name:b.name,display_name:'A 전용 참여자',counselor_user_id:ids.counselor},{id:'op-b',organization_id:ids.org,company_id:b.id,company_name:a.name,display_name:'B 전용 참여자'},{id:'op-null',organization_id:ids.org,company_id:null,company_name:b.name,display_name:'미연결 숨김'});
  let release,entered;const started=new Promise(r=>{entered=r}),held=new Promise(r=>{release=r});
  const options={directoryResponse:async(u,r)=>{if(u.searchParams.get('companyId')===a.id){entered();await held}return r}};
  const calls=await open(page,h,options);await login(page);
  const select=async c=>{await sec(page).locator(`[data-company-id="${c.id}"]`).getByRole('button',{name:c.name,exact:true}).click();await page.locator('[data-company-dashboard-tab="operations"]').click()};
  const area=page.locator('section[aria-live="polite"]');
  await select(a);await started;await expect(page.locator('#company-directory-status')).toContainText('조회하고 있습니다');
  await page.locator('[data-company-dashboard-back]').click();await select(b);await expect(area).toContainText('B 전용 참여자');await expect(area).not.toContainText('A 전용 참여자');await expect(area).not.toContainText('미연결 숨김');
  const delayed=page.waitForResponse(r=>r.url().includes('admin-directory?companyId='+a.id));release();await delayed;
  await expect(area).toContainText('B 전용 참여자');await expect(area).not.toContainText('A 전용 참여자');
  await expect(area.locator('[data-directory-filter="company"]')).toHaveCount(0);await expect(area.locator('[data-admin-report]')).toHaveCount(0);
  await area.locator('[data-directory-filter="counselor"]').selectOption('unassigned');await expect(area.locator('[data-dir-participant]')).toHaveCount(1);
  options.directoryResponse=async(u,r)=>u.searchParams.has('companyId')?{...r,data:{...r.data,companyId:a.id}}:r;
  await area.locator('[data-company-directory-refresh]').click();await expect(area.locator('[data-dir-participant]')).toHaveCount(0);await expect(page.locator('#company-directory-status')).toContainText('응답');
  options.directoryResponse=async(u,r)=>u.searchParams.has('companyId')?{status:503,data:{error:'QUERY_FAILED'}}:r;
  await area.locator('[data-company-directory-refresh]').click();await expect(area.locator('[data-dir-participant]')).toHaveCount(0);await expect(area.locator('[data-company-directory-refresh]')).toBeEnabled();
  options.directoryResponse=null;await area.locator('[data-company-directory-refresh]').click();await expect(area).toContainText('B 전용 참여자');
  expect(calls.filter(c=>c.path.endsWith('admin-directory')&&c.query.includes('companyId='+b.id)).length).toBeGreaterThan(1);
  await page.locator('[data-company-dashboard-back]').click();await select(a);await expect(area).toContainText('A 전용 참여자');await expect(area).not.toContainText('B 전용 참여자');await expect(area.locator('[data-dir-kpi="counselors"] b')).toHaveText('1');
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page.locator('#app')).not.toContainText('B 전용 참여자');await expect(page.locator('#app')).not.toContainText('A 전용 참여자');await login(page);await expect(page.locator('[data-dir-participant]')).toHaveCount(3);await expect(page.locator('[data-company-directory-refresh]')).toHaveCount(0);
});

test('company detail assigns multiple counselors to multiple masters, escapes names and keeps participant assignments unchanged',async({page})=>{
  const h=harness(),[a,b]=await seedAssignmentCompanies(h),second=crypto.randomUUID();
  h.state.tables.user_profiles.push({user_id:second,organization_id:ids.org,role:'counselor',display_name:'<img src=x onerror=alert(1)>'});
  const before=structuredClone(h.state.tables.participants),calls=await open(page,h);await login(page);
  await sec(page).getByRole('button',{name:'고객사 목록 조회',exact:true}).click();await openAssignments(page,a.id);
  const area=sec(page).locator('[data-company-assignments]');await expect(area).toContainText('배정된 상담사가 없습니다');await expect(area).toContainText('고객사 ID 연결 신규 등록은 배정된 상담사로 제한');
  for(const id of [ids.counselor,second]){
    await area.getByLabel('같은 조직 상담사 선택').selectOption(id);await area.getByRole('button',{name:'상담사 배정',exact:true}).click();await expect(current(page)).toHaveText('상담사를 배정했습니다.');
  }
  await expect(area.locator('tbody tr')).toHaveCount(2);await expect(area.locator('img')).toHaveCount(0);await expect(area).toContainText('<img src=x onerror=alert(1)>');await expect(area).toContainText('추가 배정할 상담사가 없습니다');
  await openAssignments(page,b.id);await expect(area).toContainText('배정된 상담사가 없습니다');await area.getByLabel('같은 조직 상담사 선택').selectOption(ids.counselor);await area.getByRole('button',{name:'상담사 배정',exact:true}).click();await expect(current(page)).toHaveText('상담사를 배정했습니다.');
  await openAssignments(page,a.id);await sec(page).getByRole('button',{name:'고객사 비활성화',exact:true}).click();await expect(sec(page).getByRole('button',{name:'고객사 재활성화'})).toBeVisible();
  await expect(area.locator('tbody tr')).toHaveCount(2);await area.locator(`[data-counselor="${ids.counselor}"]`).click();await expect(current(page)).toHaveText('상담사 배정을 해제했습니다.');await expect(area.locator('tbody tr')).toHaveCount(1);
  expect(h.state.tables.client_company_counselors.filter(r=>r.company_id===b.id)).toHaveLength(1);expect(h.state.tables.participants).toEqual(before);
  expect(calls.filter(c=>c.body?.action==='unassign')[0].body).toEqual({action:'unassign',counselorUserId:ids.counselor});
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain(second);
});

test('assignment duplicates, DB failures and failed refresh never claim an unconfirmed success or edit another company',async({page})=>{
  const h=harness(),[a,b]=await seedAssignmentCompanies(h);await open(page,h);await login(page);await sec(page).getByRole('button',{name:'고객사 목록 조회',exact:true}).click();await openAssignments(page,a.id);
  const area=sec(page).locator('[data-company-assignments]');await expect(area.getByLabel('같은 조직 상담사 선택')).toBeVisible();
  h.state.tables.client_company_counselors.push({organization_id:ids.org,company_id:a.id,counselor_user_id:ids.counselor,created_at:'2026-11-06T00:00:00Z'});
  await area.getByLabel('같은 조직 상담사 선택').selectOption(ids.counselor);await area.getByRole('button',{name:'상담사 배정',exact:true}).click();await expect(current(page)).toContainText('이미 배정된 상담사');await expect(area.getByRole('button',{name:'배정 해제'})).toHaveCount(0);
  await area.getByRole('button',{name:'상담사 배정 조회'}).click();await expect(area.getByRole('button',{name:'배정 해제'})).toBeVisible();
  h.state.failWritesOf='client_company_counselors';await area.getByRole('button',{name:'배정 해제'}).click();await expect(current(page)).toContainText('배정 결과를 확인하지 못했습니다');expect(h.state.tables.client_company_counselors).toHaveLength(1);
  h.state.failWritesOf=null;await area.getByRole('button',{name:'상담사 배정 조회'}).click();await expect(area.getByRole('button',{name:'배정 해제'})).toBeVisible();
  h.state.failReadsOf='client_company_counselors';await area.getByRole('button',{name:'배정 해제'}).click();await expect(current(page)).toContainText('배정 변경은 완료했지만 목록을 확인하지 못했습니다');expect(h.state.tables.client_company_counselors).toHaveLength(0);
  await expect(sec(page).getByRole('button',{name:'고객사 정보 저장'})).toBeVisible();h.state.failReadsOf=null;
  await openAssignments(page,b.id);await expect(area).toContainText('배정된 상담사가 없습니다');await expect(area.getByLabel('같은 조직 상담사 선택')).toHaveValue('');
});

test('loading assignment operations are guarded and logout discards delayed results and selected counselor',async({page})=>{
  const h=harness(),[a]=await seedAssignmentCompanies(h),options={};await open(page,h,options);await login(page);await sec(page).getByRole('button',{name:'고객사 목록 조회',exact:true}).click();await openAssignments(page,a.id);
  await expect(sec(page).getByLabel('같은 조직 상담사 선택')).toBeVisible();
  let release;options.hold=new Promise(resolve=>{release=resolve});await sec(page).getByRole('button',{name:'상담사 배정 조회'}).click();await expect(sec(page).getByRole('button',{name:'고객사 정보 저장'})).toBeDisabled();
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();release();await expect(page.locator('#lg-id')).toBeVisible();options.hold=null;
  await login(page);await expect(sec(page).locator('[data-company-assignments]')).toHaveCount(0);expect(h.state.tables.client_company_counselors).toHaveLength(0);
});

test('admin registers first and subsequent masters with zero participants, edits the exact ID and toggles without changing existing screens',async({page})=>{
  const h=harness();h.state.tables.participants.length=0;const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const calls=await open(page,h);await login(page);
  await expect(sec(page).getByRole('heading',{name:'고객사 관리',exact:true})).toBeVisible();await expect(sec(page).locator('[data-company-list]')).toBeVisible();expect(companyCalls(calls).length).toBeGreaterThan(0);
  await expect(sec(page).locator('[data-company-separation]')).toContainText('고객사 ID 연결 등록과 기존 미연결 참여자는 별도로 관리');
  await sec(page).getByRole('button',{name:'고객사 목록 조회'}).click();await expect(sec(page).locator('[data-company-list]')).toContainText('조건에 맞는 고객사가 없습니다');
  for(const name of ['합성 고객사 A','합성 고객사 B']){
    await sec(page).getByRole('button',{name:'고객사 등록',exact:true}).click();await fill(page,name);await sec(page).getByRole('button',{name:'고객사 저장',exact:true}).click();
    await expect(current(page)).toHaveText('고객사 정보를 저장했습니다.');await expect(sec(page).locator('[data-company-target]')).toContainText(name);await sec(page).getByRole('button',{name:'고객사 목록으로'}).click();await expect(sec(page).locator('[data-company-list]')).toContainText(name);
  }
  const a=h.state.tables.client_companies.find(c=>c.name==='합성 고객사 A'),b=h.state.tables.client_companies.find(c=>c.name==='합성 고객사 B');
  await sec(page).locator(`[data-company-id="${a.id}"]`).getByRole('button',{name:'상세 관리'}).click();
  await expect(sec(page).locator('[data-company-linkage]')).toContainText('고객사 ID로 연결된 참여자: 0명');
  await expect(sec(page).locator('[data-company-target]')).toContainText(a.id);await field(page,'pm_name').fill('수정 PM');
  await sec(page).getByRole('button',{name:'고객사 정보 저장'}).click();await expect(current(page)).toHaveText('고객사 정보를 저장했습니다.');expect(a.pm_name).toBe('수정 PM');expect(b.pm_name).toBe('가상 PM');
  await sec(page).getByRole('button',{name:'고객사 비활성화'}).click();await expect(sec(page).getByRole('button',{name:'고객사 재활성화'})).toBeVisible();expect(a.status).toBe('inactive');
  await sec(page).getByRole('button',{name:'고객사 재활성화'}).click();await expect(sec(page).getByRole('button',{name:'고객사 비활성화'})).toBeVisible();expect(a.status).toBe('active');
  await expect(sec(page).getByRole('button',{name:/삭제/})).toHaveCount(0);
  await expect(page.locator('#admin-progress [data-kpi="total"] b')).toHaveText('0');await expect(page.locator('#admin-directory')).not.toContainText('합성 고객사 A');
  await expect(page.getByRole('button',{name:'주소 저장'})).toBeVisible();await expect(page.getByRole('button',{name:'실제 계정 일괄 등록'})).toBeVisible();
  const storage=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));expect(storage).not.toContain('pm@example.invalid');expect(storage).not.toContain(a.id);
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page.locator('#lg-id')).toBeVisible();await login(page);await expect(sec(page).locator('[data-company-form]')).toHaveCount(0);expect(errors).toEqual([]);
});

test('server duplicate/validation/conflict messages keep entered fields and a failed detail cannot edit a previous company',async({page})=>{
  const h=harness(),calls=await open(page,h);await login(page);
  await expect(sec(page).locator('[data-company-list]')).toBeVisible();const before=companyCalls(calls).length;await sec(page).getByRole('button',{name:'고객사 등록',exact:true}).click();await fill(page,'중복 합성');await field(page,'end_date').fill('2026-01-01');await sec(page).getByRole('button',{name:'고객사 저장',exact:true}).click();await expect(current(page)).toContainText('종료일');expect(companyCalls(calls)).toHaveLength(before);
  await field(page,'end_date').fill('2027-01-31');await sec(page).getByRole('button',{name:'고객사 저장',exact:true}).click();await expect(current(page)).toHaveText('고객사 정보를 저장했습니다.');
  await sec(page).getByRole('button',{name:'고객사 목록으로'}).click();await sec(page).getByRole('button',{name:'고객사 등록',exact:true}).click();await fill(page,'중복 합성');await sec(page).getByRole('button',{name:'고객사 저장',exact:true}).click();await expect(current(page)).toContainText('이미 등록');await expect(field(page,'name')).toHaveValue('중복 합성');await sec(page).getByRole('button',{name:'고객사 목록으로'}).click();
  await sec(page).locator('[data-company-list]').getByRole('button',{name:'상세 관리'}).click();await expect(field(page,'name')).toHaveValue('중복 합성');
  h.state.tables.client_companies[0].updated_at='2099-01-01T00:00:00Z';await field(page,'pm_name').fill('덮어쓰지 않을 PM');await sec(page).getByRole('button',{name:'고객사 정보 저장'}).click();await expect(current(page)).toContainText('다른 변경');expect(h.state.tables.client_companies[0].pm_name).toBe('가상 PM');
  await sec(page).getByRole('button',{name:'고객사 목록으로'}).click();h.state.failReadsOf='client_companies';await sec(page).locator('[data-company-list]').getByRole('button',{name:'상세 관리'}).click();await expect(current(page)).toContainText('처리하지 못했습니다');await expect(sec(page).locator('[data-company-form]')).toHaveCount(0);
});

test('many masters use page navigation, status and search, and escape labels',async({page})=>{
  const h=harness();for(let i=0;i<45;i++)h.state.tables.client_companies.push({id:'30000000-0000-4000-8000-'+String(i).padStart(12,'0'),organization_id:ids.org,name:i===44?'<img src=x onerror="window.companyInjected=1">':'합성 '+String(i).padStart(2,'0'),start_date:'2026-11-01',end_date:'2027-01-31',pm_name:'가상 PM',pm_email:'pm@example.invalid',pm_phone:'010-0000-0000',status:i%2?'active':'inactive',created_at:new Date(Date.UTC(2026,0,1,0,i)).toISOString(),updated_at:new Date().toISOString()});
  await open(page,h);await login(page);await sec(page).getByRole('button',{name:'고객사 목록 조회'}).click();await expect(sec(page).locator('[data-company-list] tbody tr')).toHaveCount(20);await expect(sec(page).locator('[data-company-page]')).toContainText('총 45개');
  expect(await page.evaluate(()=>window.companyInjected)).toBeUndefined();await expect(sec(page).locator('[data-company-list] img')).toHaveCount(0);
  await sec(page).getByRole('button',{name:'다음',exact:true}).click();await expect(sec(page).locator('[data-company-page]')).toContainText('2 / 3');
  await sec(page).locator('#company-search').fill('합성 01');await sec(page).locator('#company-status').selectOption('active');await sec(page).getByRole('button',{name:'고객사 목록 조회'}).click();await expect(sec(page).locator('[data-company-page]')).toContainText('총 1개');await expect(sec(page).locator('[data-company-list]')).toContainText('합성 01');
});

test('loading is guarded, failed writes never claim success and expired sessions clear the company form',async({page})=>{
  const h=harness(),options={};let release;const held=new Promise(r=>release=r);await open(page,h,options);await login(page);
  await sec(page).getByRole('button',{name:'고객사 등록',exact:true}).click();await fill(page,'실패 합성');options.hold=held;h.state.failWritesOf='client_companies';
  await sec(page).getByRole('button',{name:'고객사 저장',exact:true}).click();await expect(sec(page).getByRole('button',{name:'고객사 저장',exact:true})).toBeDisabled();release();options.hold=null;
  await expect(current(page)).toContainText('처리하지 못했습니다');expect(h.state.tables.client_companies).toHaveLength(0);
  await sec(page).getByRole('button',{name:'고객사 목록으로'}).click();options.companyStatus=401;await sec(page).getByRole('button',{name:'고객사 목록 조회'}).click();await expect(page.locator('#lg-id')).toBeVisible();await expect(page.locator('#admin-companies')).toHaveCount(0);
  options.companyStatus=null;await login(page,'consult01');await expect(page.locator('#admin-companies')).toHaveCount(0);
});
