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
    else if(u.pathname.endsWith('/secondcareer-account'))r=await h.call(h.account.handleAccount,token,body,req.method());
    else if(u.pathname.endsWith('/secondcareer-admin-progress'))r=await h.call(h.progress.handleAdminProgress,token,body,req.method(),url);
    else if(u.pathname.endsWith('/secondcareer-admin-directory'))r=await h.call(h.directory.handleAdminDirectory,token,body,req.method(),url);
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
  await sec(page).locator(`[data-company-id="${id}"]`).getByRole('button',{name:'상세 관리'}).click();
  await sec(page).getByRole('button',{name:'상담사 배정 조회',exact:true}).click();
}

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
  await expect(sec(page).getByRole('heading',{name:'고객사 관리',exact:true})).toBeVisible();expect(companyCalls(calls)).toHaveLength(0);
  await expect(sec(page).locator('[data-company-separation]')).toContainText('고객사 ID 연결 등록과 기존 미연결 참여자는 별도로 관리');
  await sec(page).getByRole('button',{name:'고객사 목록 조회'}).click();await expect(sec(page).locator('[data-company-list]')).toContainText('조건에 맞는 고객사가 없습니다');
  for(const name of ['합성 고객사 A','합성 고객사 B']){
    await sec(page).getByRole('button',{name:'고객사 등록',exact:true}).click();await fill(page,name);await sec(page).getByRole('button',{name:'고객사 저장',exact:true}).click();
    await expect(current(page)).toHaveText('고객사 정보를 저장했습니다.');await expect(sec(page).locator('[data-company-list]')).toContainText(name);
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
  await sec(page).getByRole('button',{name:'고객사 등록',exact:true}).click();await fill(page,'중복 합성');await field(page,'end_date').fill('2026-01-01');await sec(page).getByRole('button',{name:'고객사 저장',exact:true}).click();await expect(current(page)).toContainText('종료일');expect(companyCalls(calls)).toHaveLength(0);
  await field(page,'end_date').fill('2027-01-31');await sec(page).getByRole('button',{name:'고객사 저장',exact:true}).click();await expect(current(page)).toHaveText('고객사 정보를 저장했습니다.');
  await sec(page).getByRole('button',{name:'고객사 등록',exact:true}).click();await fill(page,'중복 합성');await sec(page).getByRole('button',{name:'고객사 저장',exact:true}).click();await expect(current(page)).toContainText('이미 등록');await expect(field(page,'name')).toHaveValue('중복 합성');
  await sec(page).locator('[data-company-list]').getByRole('button',{name:'상세 관리'}).click();await expect(field(page,'name')).toHaveValue('중복 합성');
  h.state.tables.client_companies[0].updated_at='2099-01-01T00:00:00Z';await field(page,'pm_name').fill('덮어쓰지 않을 PM');await sec(page).getByRole('button',{name:'고객사 정보 저장'}).click();await expect(current(page)).toContainText('다른 변경');expect(h.state.tables.client_companies[0].pm_name).toBe('가상 PM');
  h.state.failReadsOf='client_companies';await sec(page).locator('[data-company-list]').getByRole('button',{name:'상세 관리'}).click();await expect(current(page)).toContainText('처리하지 못했습니다');await expect(sec(page).locator('[data-company-form]')).toHaveCount(0);
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
  options.companyStatus=401;await sec(page).getByRole('button',{name:'고객사 목록 조회'}).click();await expect(page.locator('#lg-id')).toBeVisible();await expect(page.locator('#admin-companies')).toHaveCount(0);
  options.companyStatus=null;await login(page,'consult01');await expect(page.locator('#admin-companies')).toHaveCount(0);
});
