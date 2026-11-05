// REQ-A-004 admin screen with the local protocol mock (server-harness.cjs).
// Browser + mock only: no request reaches a deployed Supabase project.
import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve-static.mjs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
let server;
test.beforeAll(async()=>{server=await serve('src')});
test.afterAll(async()=>{await server.close()});

async function setup(page,{postEnabled=false,progressStatus=null}={}){
  const h=harness();h.state.postEnabled=postEnabled;const calls=[];
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
  await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
    const request=route.request(),url=new URL(request.url()),body=request.postDataJSON(),token=request.headers().authorization?.replace(/^Bearer /,'');
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
    calls.push(url.pathname+url.search);
    let result;
    if(url.pathname.endsWith('/secondcareer-login')){const id=h.signIn(body.loginId,body.password)?.id;result=id?{status:200,data:{access_token:id,refresh_token:'refresh-'+id,expires_at:Math.floor(Date.now()/1000)+3600}}:{status:401,data:{error:'INVALID_CREDENTIALS'}}}
    else if(url.pathname==='/auth/v1/token'){const id=body?.refresh_token?.replace(/^refresh-/,'');result={status:200,data:{access_token:id,refresh_token:'refresh-'+id,expires_in:3600}}}
    else if(url.pathname.endsWith('/secondcareer-account'))result=await h.call(h.account.handleAccount,token,body,request.method());
    else if(url.pathname.endsWith('/secondcareer-register-participant'))result=await h.call(h.registration.handleRegistration,token,body,request.method());
    else if(url.pathname.endsWith('/secondcareer-admin-progress'))result=progressStatus?{status:progressStatus,data:{error:'FIXTURE'}}:await h.call(h.progress.handleAdminProgress,token,body,request.method(),'https://fixture.invalid/'+url.search);
    else if(url.pathname.endsWith('/secondcareer-assessment'))result={status:200,data:{profile:{role:'counselor',display_name:'상담사'},participants:[],assessments:[],counselors:{}}};
    else if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*'}});
    else throw Error('Unexpected API path: '+url.pathname);
    await route.fulfill({status:result.status,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body:JSON.stringify(result.data)});
  });
  await page.goto(server.url);
  return {h,calls,errors};
}
async function login(page,id='admin01'){await page.locator('#lg-id').fill(id);await page.locator('#lg-pw').fill('Fixture-password-123!');await page.getByRole('button',{name:'로그인',exact:true}).click()}
const kpi=(page,name)=>page.locator(`#admin-progress [data-kpi="${name}"] b`);
function addPopulation(h){
  const t=h.state.tables;
  for(const [id,company,pre,post] of [['b1','가 기업','submitted','submitted'],['b2','가 기업','draft',null],['b3','나 기업',null,null],['b4','나 기업','submitted',null]]){
    t.participants.push({id,organization_id:ids.org,counselor_user_id:ids.counselor,auth_user_id:'auth-'+id,display_name:'개인이름-'+id,company_name:company});
    if(pre)t.assessments.push({id:'pre-'+id,participant_id:id,phase:'pre',status:pre});
    if(post)t.assessments.push({id:'post-'+id,participant_id:id,phase:'post',status:post});
  }
  t.participants.push({id:'z9',organization_id:'other-org',counselor_user_id:ids.other,display_name:'다른조직',company_name:'다른 조직 기업'});
}

test('admin sees organization totals, completion rate and per-company counts; post shown only when enabled',async({page})=>{
  const {h,errors}=await setup(page,{postEnabled:true});addPopulation(h);await login(page);
  await expect(page.getByRole('heading',{name:'관리자 참여자 등록'})).toBeVisible();
  await expect(kpi(page,'total')).toHaveText('5');
  await expect(kpi(page,'pre-submitted')).toHaveText('2');await expect(kpi(page,'pre-incomplete')).toHaveText('3');
  await expect(kpi(page,'pre-rate')).toHaveText('40.0%');await expect(kpi(page,'post-submitted')).toHaveText('1');
  const breakdown=page.locator('[data-progress-breakdown] tbody tr');
  await expect(breakdown.nth(0)).toHaveText(/사전진단\s*2\s*1\s*2/);await expect(breakdown.nth(1)).toHaveText(/사후진단\s*4\s*0\s*1/);
  const rows=page.locator('[data-progress-companies] tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveText(/가 기업\s*2\s*1\s*1\s*50\.0%\s*1/);
  await expect(rows.nth(1)).toHaveText(/나 기업\s*2\s*1\s*1\s*50\.0%\s*0/);
  await expect(rows.nth(2)).toHaveText(/테스트기업\s*1\s*0\s*1\s*0\.0%\s*0/);
  await expect(page.locator('[data-progress-companies] tfoot')).toHaveText(/합계\s*5\s*2\s*3\s*40\.0%\s*1/);
  await expect(page.locator('[data-post-note]')).toContainText('분모');
  const text=await page.locator('#admin-progress').innerText();
  expect(text).not.toContain('개인이름');expect(text).not.toContain('다른 조직 기업');
  expect(errors).toEqual([]);
});

test('post disabled is explained without a rate; zero participants show "-" instead of dividing by zero',async({page})=>{
  const {h}=await setup(page);h.state.tables.participants.length=0;await login(page);
  await expect(kpi(page,'total')).toHaveText('0');await expect(kpi(page,'pre-rate')).toHaveText('-');
  await expect(kpi(page,'post-submitted')).toHaveCount(0);
  await expect(page.locator('[data-post-note]')).toContainText('사용 설정되어 있지 않아');
  await expect(page.locator('[data-progress-companies]')).toContainText('등록된 참여자가 없습니다.');
  await expect(page.locator('#admin-progress')).not.toContainText('NaN');await expect(page.locator('#admin-progress')).not.toContainText('Infinity');
});

test('10 registration and URL settings keep working; refresh reloads counts without clearing other inputs',async({page})=>{
  const {h,calls}=await setup(page);await login(page);
  await expect(kpi(page,'total')).toHaveText('1');
  await page.getByLabel('진단 접속 주소 (HTTPS)').fill('https://example.invalid/assessment');
  await page.getByRole('button',{name:'주소 저장'}).click();await expect(page.getByText('진단 접속 주소를 저장했습니다.')).toBeVisible();
  expect(h.state.tables.organizations[0].assessment_url).toBe('https://example.invalid/assessment');
  await page.locator('#registration-counselor').selectOption(ids.counselor);
  for(const [label,value] of Object.entries({'이름':'현황확인','연락처':'010-1357-2468','소속기업':'새 기업'}))await page.getByRole('textbox',{name:`1행 ${label}`}).fill(value);
  await page.getByRole('button',{name:'실제 계정 일괄 등록'}).click();await expect(page.getByRole('cell',{name:'등록 완료',exact:true})).toBeVisible();
  await page.getByLabel('진단 접속 주소 (HTTPS)').fill('https://example.invalid/unsaved');
  await page.getByRole('button',{name:'새로 조회'}).click();
  await expect(kpi(page,'total')).toHaveText('2');
  await expect(page.locator('[data-progress-companies] tbody tr')).toHaveCount(2);
  // In-place refresh: the unsaved URL input and the one-time password row stay as they were.
  await expect(page.getByLabel('진단 접속 주소 (HTTPS)')).toHaveValue('https://example.invalid/unsaved');
  await expect(page.getByLabel('현황확인 임시 비밀번호')).toHaveCount(1);
  expect(calls.filter(c=>c.startsWith('/functions/v1/secondcareer-admin-progress'))).toEqual(['/functions/v1/secondcareer-admin-progress','/functions/v1/secondcareer-admin-progress']);
});

test('refused or failed progress reads show a message and no stale counts',async({page})=>{
  for(const [status,message] of [[403,'진단 현황을 조회할 권한이 없습니다.'],[503,'진단 현황을 불러오지 못했습니다.']]){
    await setup(page,{progressStatus:status});await login(page);
    await expect(page.locator('#admin-progress-status')).toContainText(message);
    await expect(page.locator('#admin-progress [data-kpi]')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'주소 저장'})).toBeVisible();
    await page.getByRole('button',{name:'로그아웃',exact:true}).click();
  }
});

test('rate helper never divides by zero; inconsistent responses are rejected before display',async()=>{
  const {progressRate,validProgress}=await import('../../src/live/admin-progress-view.js');
  expect(progressRate(0,0)).toBeNull();expect(progressRate(3,0)).toBeNull();expect(progressRate(1,3)).toBe(33.3);expect(progressRate(2,2)).toBe(100);
  const ok={scope:'organization',generatedAt:'2026-10-26T03:00:00Z',total:3,pre:{notStarted:1,draft:1,submitted:1},post:{available:false},companies:[{name:'가',total:2,pre:{notStarted:1,draft:0,submitted:1},post:{available:false}},{name:null,total:1,pre:{notStarted:0,draft:1,submitted:0},post:{available:false}}]};
  expect(validProgress(ok)).toBe(true);
  const bad=[d=>{d.total=4},d=>{d.pre.submitted=2},d=>{d.companies[0].pre.draft=1},d=>{d.companies.pop()},d=>{d.post={available:false,submitted:0}},d=>{d.companies[1].name='가'},d=>{d.scope='all'},d=>{d.companies[0].total=0}];
  for(const change of bad){const d=structuredClone(ok);change(d);expect(validProgress(d)).toBe(false)}
});

test('counselor and participant screens do not request the admin progress API',async({page})=>{
  const {calls}=await setup(page);await login(page,'consult01');
  await expect(page.getByRole('heading',{name:'상담사 페이지'})).toBeVisible();
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();
  expect(calls.some(c=>c.includes('admin-progress'))).toBe(false);
});
