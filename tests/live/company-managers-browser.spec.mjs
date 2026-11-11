import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {serve} from '../tools/serve-static.mjs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
let server;test.beforeAll(async()=>{server=await serve('src')});test.afterAll(async()=>{await server.close()});
async function setup(page){
  const h=harness();h.state.managerEnabled=true;const calls=[];
  const fields={start_date:'2026-11-01',end_date:'2027-01-31',pm_name:'합성 PM',pm_email:'pm@example.invalid',pm_phone:'01000000000'};
  const c=(await h.call(h.companies.handleAdminCompanies,ids.admin,{...fields,name:'허용 고객사'})).data.company;
  const b=(await h.call(h.companies.handleAdminCompanies,ids.admin,{...fields,name:'추가 고객사'})).data.company;
  await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
  await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
    const req=route.request(),u=new URL(req.url()),body=req.postDataJSON(),token=req.headers().authorization?.replace(/^Bearer /,'');
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Content-Type':'application/json'};
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
    calls.push({path:u.pathname,body});let r;
    if(u.pathname.endsWith('/secondcareer-login')){const id=h.signIn(body.loginId,body.password)?.id;r=id?{status:200,data:{access_token:id,refresh_token:'refresh-'+id,expires_in:3600}}:{status:401,data:{error:'INVALID_CREDENTIALS'}}}
    else if(u.pathname==='/auth/v1/token'){const id=body.refresh_token.replace(/^refresh-/,'');r={status:200,data:{access_token:id,refresh_token:'refresh-'+id,expires_in:3600}}}
    else if(u.pathname==='/auth/v1/logout')return route.fulfill({status:204,headers});
    else{
      const handlers={'secondcareer-account':h.account.handleAccount,'secondcareer-admin-companies':h.companies.handleAdminCompanies,'secondcareer-admin-company-managers':h.managers.handleAdminCompanyManagers,'secondcareer-company-manager':h.manager.handleCompanyManager,'secondcareer-company-manager-progress':h.managerProgress.handleCompanyManagerProgress,'secondcareer-admin-progress':h.progress.handleAdminProgress,'secondcareer-admin-directory':h.directory.handleAdminDirectory,'secondcareer-assessment':h.assessment};
      const handler=handlers[u.pathname.split('/').at(-1)];if(!handler)throw Error('Unexpected request '+u.pathname);
      r=await h.call(handler,token,body,req.method(),'https://fixture.invalid/'+u.search);
    }
    return route.fulfill({status:r.status,headers,body:JSON.stringify(r.data)});
  });
  await page.goto(server.url);return {h,c,b,calls};
}
async function login(page,id='admin01',pw='Fixture-password-123!'){await page.locator('#lg-id').fill(id);await page.locator('#lg-pw').fill(pw);await page.getByRole('button',{name:'로그인',exact:true}).click()}
async function detail(page,id){await page.locator(`[data-company-id="${id}"]`).getByRole('button',{name:'상세 관리'}).click();await expect(page.locator('[data-company-manager-host] h3')).toBeVisible()}
async function issue(page,email='synthetic@example.invalid'){
  await page.getByLabel('담당자 이름',{exact:true}).fill('합성 담당자');await page.getByLabel('담당자 이메일',{exact:true}).fill(email);await page.getByLabel('담당자 연락처',{exact:true}).fill('01000000000');await page.getByRole('button',{name:'담당자 계정 발급',exact:true}).click();await expect(page.getByLabel('발급 임시 비밀번호')).toBeVisible();return page.getByLabel('발급 임시 비밀번호').inputValue();
}

test('admin issues managers once, manages status/access and erases issued secrets on customer/page/logout changes',async({page})=>{
  const browserLogs=[];page.on('console',message=>browserLogs.push(message.text()));page.on('pageerror',error=>browserLogs.push(error.message));
  const {h,c,b}=await setup(page);await login(page);await page.getByRole('button',{name:'고객사 목록 조회',exact:true}).click();await detail(page,c.id);
  const secret=await issue(page),issued=h.state.tables.company_manager_accounts[0];
  await expect(page.locator('[data-manager-issued]')).toContainText('최초 안내문');await expect(page.locator('[data-manager-issued]')).toContainText('entry=company-manager');
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain(secret);
  const host=page.locator('[data-company-manager-host]');await expect(host.locator('tbody')).toContainText('synthetic@example.invalid');
  await host.getByRole('button',{name:'계정 정지',exact:true}).click();await expect(host.getByRole('button',{name:'계정 재활성화'})).toBeVisible();expect(issued.status).toBe('suspended');
  await host.getByRole('button',{name:'계정 재활성화'}).click();await expect(host.getByRole('button',{name:'계정 정지',exact:true})).toBeVisible();
  await detail(page,b.id);await host.getByRole('button',{name:'연결 가능한 기존 담당자 조회'}).click();
  await host.getByRole('button',{name:/synthetic@example\.invalid 연결/}).click();await expect(host.locator('tbody')).toContainText('synthetic@example.invalid');
  await detail(page,c.id);await host.getByRole('button',{name:'담당자 목록 조회'}).click();await expect(host.locator('tbody')).toContainText('synthetic@example.invalid');
  await host.getByRole('button',{name:'접근 해제'}).click();await expect(host.locator('tbody')).not.toContainText('synthetic@example.invalid');
  expect(h.state.tables.company_manager_access.some(a=>a.company_id===b.id&&a.manager_user_id===issued.user_id)).toBe(true);
  const bDuring=await h.call(h.managers.handleAdminCompanyManagers,ids.admin,null,'GET','https://fixture.invalid/?companyId='+b.id);
  expect(bDuring.status).toBe(200);expect(bDuring.data.managers.map(m=>m.id)).toContain(issued.user_id);
  await host.getByRole('button',{name:'연결 가능한 기존 담당자 조회'}).click();await host.getByRole('button',{name:/synthetic@example\.invalid 연결/}).click();
  await expect(host.locator('tbody')).toContainText('synthetic@example.invalid');await expect(host.getByRole('button',{name:'접근 해제'})).toBeVisible();
  expect(h.state.tables.company_manager_access.some(a=>a.company_id===b.id&&a.manager_user_id===issued.user_id)).toBe(true);
  const bAfter=await h.call(h.managers.handleAdminCompanyManagers,ids.admin,null,'GET','https://fixture.invalid/?companyId='+b.id);
  expect(bAfter.status).toBe(200);expect(bAfter.data.managers.map(m=>m.id)).toContain(issued.user_id);
  await detail(page,b.id);await expect(page.getByLabel('발급 임시 비밀번호')).toHaveCount(0);expect(await page.content()).not.toContain(secret);
  await detail(page,c.id);await page.getByRole('button',{name:'담당자 목록 조회'}).click();await expect(host.locator('tbody tr')).toHaveCount(1);await issue(page,'second@example.invalid');
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page.locator('#lg-id')).toBeVisible();expect(await page.content()).not.toContain(secret);
  expect(JSON.stringify(browserLogs)).not.toContain(secret);
});

test('company manager uses existing login/session contract, changes temporary password then sees only allowed names',async({page})=>{
  const {h,c,calls}=await setup(page),r=await h.call(h.managers.handleAdminCompanyManagers,ids.admin,{name:'합성 담당자',email:'portal@example.invalid',phone:'01000000000',requestId:randomUUID()},'POST','https://fixture.invalid/?companyId='+c.id);
  await page.goto(server.url+'?entry=company-manager');await expect(page.getByRole('heading',{name:'고객사 담당자 로그인'})).toBeVisible();
  await login(page,r.data.loginId,r.data.temporaryPassword);await expect(page.getByRole('heading',{name:'최초 비밀번호 변경'})).toBeVisible();await expect(page.getByText(c.name,{exact:true})).toHaveCount(0);
  await page.getByLabel('새 비밀번호 (12~128자)',{exact:true}).fill('Changed-browser-123!');await page.getByLabel('새 비밀번호 확인',{exact:true}).fill('Changed-browser-123!');await page.getByRole('button',{name:'변경하고 고객사 확인'}).click();
  await expect(page.getByRole('heading',{name:'고객사 진단 현황'})).toBeVisible();await expect(page.getByText(c.name,{exact:true})).toBeVisible();
  expect(calls.filter(c=>/secondcareer-assessment|secondcareer-admin-progress|secondcareer-admin-directory|secondcareer-admin-aggregate|secondcareer-admin-report/.test(c.path))).toHaveLength(0);
  await page.reload();await expect(page.getByRole('heading',{name:'고객사 진단 현황'})).toBeVisible();
  h.state.tables.company_manager_accounts[0].status='suspended';await page.getByRole('button',{name:'새로고침'}).click();await expect(page.locator('#lg-id')).toBeVisible();await expect(page.getByText(c.name,{exact:true})).toHaveCount(0);
});

test('issuance DB failures and duplicate requests never show success or repeat a secret',async({page})=>{
  const {h,c}=await setup(page);await login(page);await page.getByRole('button',{name:'고객사 목록 조회',exact:true}).click();await detail(page,c.id);
  h.state.failManagerComplete=true;
  for(const [label,value] of [['담당자 이름','합성 담당자'],['담당자 이메일','failure@example.invalid'],['담당자 연락처','01000000000']])await page.getByLabel(label,{exact:true}).fill(value);
  await page.getByRole('button',{name:'담당자 계정 발급',exact:true}).click();await expect(page.getByLabel('발급 임시 비밀번호')).toHaveCount(0);await expect(page.locator('[data-company-manager-host] [role="status"]')).not.toHaveText('처리 중입니다.');
  await page.getByRole('button',{name:'담당자 계정 발급',exact:true}).click();await expect(page.locator('[data-company-manager-host] [role="status"]')).toContainText('이미 발급 요청');expect(h.state.created).toHaveLength(1);
});
