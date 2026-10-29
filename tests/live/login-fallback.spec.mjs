import {test,expect} from '@playwright/test';
import {serve} from '../tools/serve-static.mjs';

let server;
test.beforeAll(async()=>{server=await serve('src')});
test.afterAll(async()=>{await server.close()});

async function setup(page,{account='cors',role='counselor',metadata={},authStatus=200,participantCount=1,assessmentStatus='submitted'}={}){
  const calls=[];
  await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
  await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
    calls.push({path,authorization:request.headers().authorization,query:url.search});
    let status=200,data;
    if(path.endsWith('/secondcareer-login'))data={access_token:'fixture-token',expires_at:Math.floor(Date.now()/1000)+3600};
    else if(path.endsWith('/secondcareer-account')){
      if(account==='cors')return route.abort('failed');
      status=account;data={error:'ACCOUNT_UNAVAILABLE'};
    }else if(path==='/auth/v1/user'){
      status=authStatus;data=authStatus===200?{id:'fixture-user',app_metadata:metadata}:{error:'AUTH_INVALID'};
    }else if(path.endsWith('/secondcareer-assessment')){
      if(url.searchParams.has('id'))data={html:'<div>검증용 상담사 리포트</div>'};
      else data={profile:{role,display_name:'기존 계정'},participants:Array.from({length:participantCount},(_,i)=>({id:i?'other':'assigned',display_name:'테스트 참여자',counselor_user_id:'fixture-user'})),assessments:[{id:'assessment',participant_id:'assigned',phase:'pre',status:assessmentStatus,answers:{},submitted_at:assessmentStatus==='submitted'?'2026-10-01T00:00:00Z':null}],counselors:{'fixture-user':{code:'fixture-user',n:'기존 계정'}}};
    }else if(path==='/auth/v1/logout')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*'}});
    else throw Error('Unexpected request: '+path);
    await route.fulfill({status,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body:JSON.stringify(data)});
  });
  await page.goto(server.url);
  return calls;
}
async function login(page){
  await page.locator('#lg-id').fill('consult01');
  await page.locator('#lg-pw').fill('fixture-password');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
}

test('missing account API: verified counselor opens assigned results and report with existing session',async({page})=>{
  const calls=await setup(page);
  await login(page);
  await expect(page.getByRole('heading',{name:'상담사 페이지'})).toBeVisible();
  await expect(page.getByRole('cell',{name:'테스트 참여자'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'참여자 일괄 등록'})).toHaveCount(0);
  await page.getByRole('button',{name:'결과 리포트'}).click();
  await expect(page.getByText('검증용 상담사 리포트')).toBeVisible();
  expect(calls.map(c=>c.path)).toEqual(['/functions/v1/secondcareer-login','/functions/v1/secondcareer-account','/auth/v1/user','/functions/v1/secondcareer-assessment','/functions/v1/secondcareer-assessment']);
  expect(calls.slice(1).every(c=>c.authorization==='Bearer fixture-token')).toBe(true);
  expect(calls.at(-1).query).toBe('?id=assigned');
});

test('fallback supports an absent endpoint but blocks accounts requiring a new password before assessment',async({page})=>{
  const calls=await setup(page,{account:404,role:'participant',metadata:{must_change_password:true}});
  await login(page);
  await expect(page.getByRole('alert')).toContainText('계정 상태를 확인할 수 없어');
  expect(calls.some(c=>c.path.endsWith('/secondcareer-assessment'))).toBe(false);
  await expect(page.locator('#live-save')).toHaveCount(0);
});

test('temporary account API server error falls back only after counselor verification',async({page})=>{
  const calls=await setup(page,{account:503});
  await login(page);
  await expect(page.getByRole('heading',{name:'상담사 페이지'})).toBeVisible();
  expect(calls.filter(c=>c.path==='/auth/v1/user')).toHaveLength(1);
  expect(calls.filter(c=>c.path.endsWith('/secondcareer-assessment'))).toHaveLength(1);
});

for(const account of ['cors',404,503])test(`existing participant can resume a draft when account API is ${account}`,async({page})=>{
  const calls=await setup(page,{account,role:'participant',metadata:{must_change_password:false},assessmentStatus:'draft'});
  await login(page);
  await expect(page.locator('#live-save')).toBeVisible();
  expect(calls.map(c=>c.path)).toEqual(['/functions/v1/secondcareer-login','/functions/v1/secondcareer-account','/auth/v1/user','/functions/v1/secondcareer-assessment']);
  await expect(page.getByRole('heading',{name:'참여자 일괄 등록'})).toHaveCount(0);
});

test('legacy participant with no password flag sees submitted confirmation',async({page})=>{
  await setup(page,{role:'participant'});await login(page);
  await expect(page.getByRole('heading',{name:'테스트 참여자님, 제출이 완료되었습니다'})).toBeVisible();
});

for(const participantCount of [0,2])test(`participant mapping with ${participantCount} rows fails closed`,async({page})=>{
  await setup(page,{role:'participant',participantCount});await login(page);
  await expect(page.getByRole('alert')).toContainText('계정 상태를 확인할 수 없어');
  await expect(page.locator('#live-save')).toHaveCount(0);
});

test('registered participant cannot bypass account API even with a completed flag',async({page})=>{
  const calls=await setup(page,{role:'participant',metadata:{must_change_password:false,registration_request_id:'fixture-registration'}});
  await login(page);
  await expect(page.getByRole('alert')).toContainText('계정 상태를 확인할 수 없어');
  expect(calls.filter(c=>c.path.endsWith('/secondcareer-assessment'))).toHaveLength(1);
  await expect(page.locator('#live-save')).toHaveCount(0);
});

test('administrator cannot use the existing-account fallback',async({page})=>{
  await setup(page,{role:'admin'});await login(page);
  await expect(page.getByRole('alert')).toContainText('계정 상태를 확인할 수 없어');
});

test('untrusted or missing Auth metadata fails closed without requesting assessments',async({page})=>{
  const calls=await setup(page,{metadata:{must_change_password:'true'}});
  await login(page);
  await expect(page.getByRole('alert')).toContainText('계정 상태를 확인할 수 없어');
  expect(calls.some(c=>c.path.endsWith('/secondcareer-assessment'))).toBe(false);
});

test('missing Auth metadata fails closed without requesting assessments',async({page})=>{
  const calls=await setup(page,{metadata:null});
  await login(page);
  await expect(page.getByRole('alert')).toContainText('계정 상태를 확인할 수 없어');
  expect(calls.some(c=>c.path.endsWith('/secondcareer-assessment'))).toBe(false);
});

test('new registration marker cannot use the legacy fallback when its flag is missing',async({page})=>{
  const calls=await setup(page,{metadata:{registration_request_id:'fixture-registration'}});
  await login(page);
  await expect(page.getByRole('alert')).toContainText('계정 상태를 확인할 수 없어');
  expect(calls.some(c=>c.path.endsWith('/secondcareer-assessment'))).toBe(false);
});

for(const status of [401,403,429])test(`account API explicit HTTP ${status} does not trigger fallback`,async({page})=>{
  const calls=await setup(page,{account:status});
  await login(page);
  await expect(page.getByRole('heading',{name:'세컨플래닝 로그인'})).toBeVisible();
  expect(calls.some(c=>c.path==='/auth/v1/user')).toBe(false);
  expect(calls.some(c=>c.path.endsWith('/secondcareer-assessment'))).toBe(false);
});

test('invalid Auth session does not trigger assessment fallback',async({page})=>{
  const calls=await setup(page,{authStatus:401});
  await login(page);
  await expect(page.getByRole('heading',{name:'세컨플래닝 로그인'})).toBeVisible();
  expect(calls.some(c=>c.path.endsWith('/secondcareer-assessment'))).toBe(false);
});
