import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {serve} from '../tools/serve-static.mjs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
let server;test.beforeAll(async()=>{server=await serve(process.env.COUNSELOR_TEST_ROOT||'src')});test.afterAll(async()=>{await server.close()});
async function setup(page){
  const h=harness();h.state.managerEnabled=true;h.state.counselorEnabled=true;const calls=[];
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
      const handlers={'secondcareer-admin-counselors':h.counselors.handleAdminCounselors,'secondcareer-account':h.account.handleAccount,'secondcareer-admin-companies':h.companies.handleAdminCompanies,'secondcareer-admin-company-managers':h.managers.handleAdminCompanyManagers,'secondcareer-company-manager':h.manager.handleCompanyManager,'secondcareer-company-manager-progress':h.managerProgress.handleCompanyManagerProgress,'secondcareer-admin-progress':h.progress.handleAdminProgress,'secondcareer-admin-directory':h.directory.handleAdminDirectory,'secondcareer-assessment':h.assessment};
      const handler=handlers[u.pathname.split('/').at(-1)];if(!handler)throw Error('Unexpected request '+u.pathname);
      r=await h.call(handler,token,body,req.method(),'https://fixture.invalid/'+u.search);
    }
    return route.fulfill({status:r.status,headers,body:JSON.stringify(r.data)});
  });
  await page.goto(server.url);return {h,c,b,calls};
}
async function login(page,id='admin01',pw='Fixture-password-123!'){await page.locator('#lg-id').fill(id);await page.locator('#lg-pw').fill(pw);await page.getByRole('button',{name:'로그인',exact:true}).click()}

async function issueForm(page,id='new_counselor'){
  await page.getByRole('button',{name:'상담사 목록 조회',exact:true}).click();
  await page.getByLabel('상담사 이름',{exact:true}).fill('합성 상담사');await page.getByLabel('로그인 아이디',{exact:true}).fill(id);
  await page.getByRole('button',{name:'상담사 계정 등록',exact:true}).click();
}

test('live admin issues counselor, existing company candidate refresh connects, first login changes password',async({page})=>{
  const {h,c}=await setup(page);await login(page);await issueForm(page);
  const issued=page.locator('[data-counselor-issued]');await expect(issued).toBeVisible();const pw=await issued.locator('code').innerText();
  const id=h.state.tables.user_profiles.find(p=>p.display_name==='합성 상담사').user_id;
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain(pw);
  await page.getByRole('button',{name:'상담사 목록 조회',exact:true}).click();await expect(page.locator('#admin-counselors tbody')).toContainText('new_counselor');
  await page.getByRole('button',{name:'고객사 목록 조회',exact:true}).click();
  await page.locator(`[data-company-id="${c.id}"]`).getByRole('button',{name:'상세 관리'}).click();
  await page.getByRole('button',{name:'상담사 배정 조회',exact:true}).click();
  await page.locator('#company-counselor').selectOption(id);await page.getByRole('button',{name:'상담사 배정',exact:true}).click();
  await expect(page.locator('[data-company-assignments] tbody')).toContainText('합성 상담사');
  await issued.getByRole('button',{name:'비밀번호 숨기기'}).click();await expect(issued).toHaveCount(0);
  await page.getByRole('button',{name:'로그아웃',exact:true}).first().click();await login(page,'new_counselor',pw);
  await expect(page.locator('#new-password')).toBeVisible();await expect(page.locator('#admin-counselors')).toHaveCount(0);
  await page.locator('#new-password').fill('Changed-password-123!');await page.locator('#confirm-password').fill('Changed-password-123!');
  await page.locator('#new-password').evaluate(el=>el.form.requestSubmit());
  await expect(page.locator('#new-password')).toHaveCount(0);await expect(page.getByRole('heading',{name:/내담자/}).first()).toBeVisible();
  expect(h.signIn('new_counselor','Changed-password-123!')?.id).toBe(id);
});

test('duplicate rejection permits correction; ambiguous outcome locks issuance and exposes request identifier only',async({page})=>{
  const {h,calls}=await setup(page);await login(page);await issueForm(page,'consult01');
  await expect(page.locator('#admin-counselors')).toContainText('이미 사용 중인');await expect(page.getByRole('button',{name:'상담사 계정 등록',exact:true})).toBeEnabled();
  h.state.failCreate=true;await page.getByLabel('로그인 아이디',{exact:true}).fill('unknown_counselor');await page.getByRole('button',{name:'상담사 계정 등록',exact:true}).click();
  await expect(page.locator('#admin-counselors')).toContainText('확인용 요청 ID');await expect(page.getByRole('button',{name:'상담사 계정 등록',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'상담사 목록 조회',exact:true}).click();await expect(page.getByRole('button',{name:'상담사 계정 등록',exact:true})).toBeDisabled();
  expect(calls.filter(c=>c.path.endsWith('secondcareer-admin-counselors')&&c.body)).toHaveLength(2);expect(h.state.created).toHaveLength(0);
});

test('disabled feature lists counselors without offering creation; failed/malformed response cannot trigger reissue',async({page})=>{
  const {h}=await setup(page);h.state.counselorEnabled=false;await login(page);await page.getByRole('button',{name:'상담사 목록 조회',exact:true}).click();
  await expect(page.locator('#admin-counselors tbody')).toContainText('consult01');await expect(page.locator('[data-counselor-form]')).toHaveCount(0);
  h.state.counselorEnabled=true;
  await page.route('**/secondcareer-admin-counselors',async route=>{
    if(route.request().method()==='POST')return route.fulfill({status:201,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:'{}'});
    return route.fallback();
  });
  await issueForm(page);await expect(page.getByRole('button',{name:'상담사 계정 등록',exact:true})).toBeDisabled();await expect(page.locator('[data-counselor-issued]')).toHaveCount(0);
});
