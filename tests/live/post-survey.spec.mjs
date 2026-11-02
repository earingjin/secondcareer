import {test,expect} from '@playwright/test';
import {serve} from '../tools/serve-static.mjs';

// The gate is replaced only in this isolated browser test. Every Supabase
// request is intercepted; these tests never contact the real service.
let server;
test.beforeAll(async()=>{server=await serve('src')});
test.afterAll(async()=>{await server.close()});

async function setup(page,{gate=true,status='submitted',role='participant',pending=false}={}){
 const writes=[],requests=[],state={post:null,revision:0,saveStatus:200};
 await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
 if(gate)await page.route('**/live/post-test-gate.js',route=>route.fulfill({contentType:'text/javascript',body:'export const postTestGate=true;'}));
 await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url());requests.push({path:url.pathname,method:req.method()});
  if(req.method()==='OPTIONS')return route.fulfill({status:204});
  let data;
  if(url.pathname.endsWith('secondcareer-login')||url.pathname==='/auth/v1/token')data={access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600};
  else if(url.pathname.endsWith('secondcareer-account'))data={profile:{role,display_name:'가상 사용자'},mustChangePassword:pending,registrationAvailable:false};
  else if(url.pathname.endsWith('secondcareer-assessment')){
   if(req.method()==='POST'){
    const body=req.postDataJSON();writes.push(body);
    if(body.action==='post-draft'){
     if(state.saveStatus!==200)return route.fulfill({status:state.saveStatus,contentType:'application/json',body:JSON.stringify({error:'SAVE_FAILED'})});
     state.revision++;state.post={status:'draft',answers:structuredClone(body.answers),updatedAt:new Date(Date.UTC(2026,9,29)+state.revision).toISOString()};data=state.post;
    }else data={status:'draft',updatedAt:'revision'};
   }
   else if(url.searchParams.get('phase')==='post')data={assessment:state.post};
   else data={profile:{role},participants:[{id:'fixture',display_name:'가상 참여자',counselor_user_id:'counselor'}],counselors:{},assessments:[{id:'assessment',participant_id:'fixture',phase:'pre',status,answers:{reg:{name:'가상 참여자',careers:[{}]},goal:{},expect:{},done:{},pre:Array(15).fill(3)},updated_at:'revision'}]};
  }else if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204});
  else throw Error('unexpected request');
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(server.url);await page.locator('#lg-id').fill('client01');await page.locator('#lg-pw').fill('fixture-password');await page.getByRole('button',{name:'로그인',exact:true}).click();
 if(pending)await expect(page.getByRole('heading',{name:'최초 비밀번호 변경'})).toBeVisible();
 else if(role==='counselor')await expect(page.getByRole('heading',{name:'상담사 페이지'})).toBeVisible();
 else if(status==='submitted')await expect(page.getByRole('heading',{name:/제출이 완료되었습니다/})).toBeVisible();
 else await expect(page.locator('#live-save')).toBeVisible();
 return {writes,requests,state};
}

test('only submitted participant can enter via the isolated test gate',async({page})=>{
 await setup(page,{status:'draft'});await page.evaluate(()=>startPost());await expect(page.getByRole('heading',{name:'사후 진단',exact:true})).toHaveCount(0);
});
test('temporary-password account and counselor cannot enter even with test gate',async({browser})=>{
 for(const options of [{pending:true},{role:'counselor'}]){
  const page=await browser.newPage();try{await setup(page,options);await page.evaluate(()=>startPost());await expect(page.getByRole('heading',{name:'사후 진단',exact:true})).toHaveCount(0)}finally{await page.close()}
 }
});
test('normal path hides the unfinished feature and rejects direct calls',async({page})=>{
 await setup(page,{gate:false});await expect(page.getByRole('button',{name:'개발용 사후 진단'})).toHaveCount(0);
 await page.evaluate(()=>{startPost();answerPost(0,5);nextPost()});await expect(page.getByRole('heading',{name:'사후 진단',exact:true})).toHaveCount(0);
});
test('question definitions, scale, validation and state separation',async({page})=>{
 const {writes}=await setup(page);const pre=await page.evaluate(async()=>[...(await import('/shared/state.js')).S.user.pre]);
 await page.getByRole('button',{name:'개발용 사후 진단'}).click();
 await expect(page.getByRole('heading',{name:'사후 진단',exact:true})).toBeVisible();
 await expect(page.locator('.area-head')).toHaveCount(5);await expect(page.locator('[id^="post-q-"]')).toHaveCount(15);
 const expected=await page.evaluate(async()=>{const {FACTORS,AREAS}=await import('/js/01-areas.js');const {SCALE}=await import('/js/02-eval-config.js');return {factors:FACTORS,areas:AREAS.map(a=>a.k),scale:SCALE}});
 expect(await page.locator('.area-head .badge').allTextContents()).toEqual(expected.areas);
 for(let i=0;i<expected.factors.length;i++){
  const q=page.locator('#post-q-'+i);await expect(q.locator('.qt')).toContainText(expected.factors[i][1]);
  expect(await q.locator('[role=radio] span').allTextContents()).toEqual(expected.scale);
 }
 await expect(page.getByRole('status').filter({hasText:'0 / 15 문항 응답'})).toBeVisible();
 await page.getByRole('button',{name:'다음 · 사후 만족도'}).click();await expect(page.getByRole('alert')).toContainText('15개');
 for(let i=0;i<5;i++)await page.locator('#post-q-'+i).getByRole('radio').nth(i).click();
 await expect(page.getByRole('status').filter({hasText:'5 / 15 문항 응답'})).toBeVisible();
 await page.getByRole('button',{name:'다음 · 사후 만족도'}).click();await expect(page.getByRole('alert')).toContainText('10개');
 await page.evaluate(()=>{answer(0,5);answerPost(5,0);answerPost(5,1.5);answerPost(15,2);render()});
 await expect(page.getByRole('status').filter({hasText:'5 / 15 문항 응답'})).toBeVisible();
 for(let i=0;i<5;i++)await expect(page.locator('#post-q-'+i).getByRole('radio').nth(i)).toHaveAttribute('aria-checked','true');
 for(let i=5;i<15;i++)await page.locator('#post-q-'+i).getByRole('radio').nth(2).click();
 await expect(page.getByRole('status').filter({hasText:'15 / 15 문항 응답'})).toBeVisible();
 expect(await page.evaluate(async()=>[...(await import('/shared/state.js')).S.user.pre])).toEqual(pre);expect(writes.every(w=>w.action==='post-draft')).toBe(true);
 await page.getByRole('button',{name:'다음 · 사후 만족도'}).click();await expect(page.getByText(/아직 준비 중입니다/)).toBeVisible();
 await expect(page.getByText(/최종 제출은 아직 준비 중입니다/)).toBeVisible();await page.getByRole('button',{name:'사후 진단으로 돌아가기'}).click();
 await expect(page.getByRole('status').filter({hasText:'15 / 15 문항 응답'})).toBeVisible();expect(writes.every(w=>w.action==='post-draft')).toBe(true);
});
test('saved post draft is restored after reload without changing submitted pre data',async({page})=>{
 const {writes}=await setup(page);await page.getByRole('button',{name:'개발용 사후 진단'}).click();await page.locator('#post-q-0').getByRole('radio').last().click();
 await page.getByRole('button',{name:'지금 임시저장'}).click();await expect(page.locator('#post-save-status')).toContainText('임시저장 완료');
 await page.reload();await page.getByRole('button',{name:'개발용 사후 진단'}).click();
 await expect(page.getByRole('status').filter({hasText:'1 / 15 문항 응답'})).toBeVisible();await expect(page.locator('#post-q-0').getByRole('radio').last()).toHaveAttribute('aria-checked','true');
 expect(await page.evaluate(async()=>[...(await import('/shared/state.js')).S.user.pre])).toEqual(Array(15).fill(3));expect(writes.every(w=>w.action==='post-draft')).toBe(true);
});
test('save failure is not reported as success and can be retried',async({page})=>{
 const {state}=await setup(page);state.saveStatus=503;await page.getByRole('button',{name:'개발용 사후 진단'}).click();await page.locator('#post-q-0').getByRole('radio').first().click();
 await page.getByRole('button',{name:'지금 임시저장'}).click();await expect(page.locator('#post-save-status')).toContainText('임시저장하지 못했습니다');expect(state.post).toBeNull();
 state.saveStatus=200;await page.getByRole('button',{name:'지금 임시저장'}).click();await expect(page.locator('#post-save-status')).toContainText('임시저장 완료');expect(state.post.answers.post[0]).toBe(1);
});
test('version conflict is shown instead of a saved status',async({page})=>{
 const {state}=await setup(page);state.saveStatus=409;await page.getByRole('button',{name:'개발용 사후 진단'}).click();await page.locator('#post-q-0').getByRole('radio').first().click();
 await page.getByRole('button',{name:'지금 임시저장'}).click();await expect(page.locator('#post-save-status')).toContainText('다른 저장');await expect(page.locator('#post-save-status')).not.toContainText('임시저장 완료');
});
test('post draft is restored after logout and login',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'개발용 사후 진단'}).click();await page.locator('#post-q-0').getByRole('radio').last().click();
 await page.getByRole('button',{name:'지금 임시저장'}).click();await expect(page.locator('#post-save-status')).toContainText('임시저장 완료');
 await page.getByRole('button',{name:'나중에 하기'}).click();await page.getByRole('button',{name:'로그아웃'}).click();
 await page.locator('#lg-id').fill('client01');await page.locator('#lg-pw').fill('fixture-password');await page.getByRole('button',{name:'로그인',exact:true}).click();
 await page.getByRole('button',{name:'개발용 사후 진단'}).click();await expect(page.locator('#post-q-0').getByRole('radio').last()).toHaveAttribute('aria-checked','true');
});
test('session expiry during a save returns to login without a success indication',async({page})=>{
 const {state}=await setup(page);state.saveStatus=401;await page.getByRole('button',{name:'개발용 사후 진단'}).click();await page.locator('#post-q-0').getByRole('radio').first().click();
 await page.getByRole('button',{name:'지금 임시저장'}).click();await expect(page.locator('#lg-id')).toBeVisible();expect(state.post).toBeNull();await expect(page.locator('#post-save-status')).toHaveCount(0);
});
for(const width of [320,375,430])test(`mobile ${width}px: choices and navigation fit and survive rerender`,async({page})=>{
 await page.setViewportSize({width,height:800});await setup(page);await page.getByRole('button',{name:'개발용 사후 진단'}).click();
 await page.locator('#post-q-0').getByRole('radio').nth(4).click();await page.evaluate(()=>render());
 await expect(page.locator('#post-q-0').getByRole('radio').nth(4)).toHaveAttribute('aria-checked','true');
 const overflow=await page.locator('.mobile-survey').evaluate(root=>[...root.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.left< -1||r.right>innerWidth+1||el.scrollWidth>el.clientWidth+2)}).map(el=>el.id||el.className));
 expect(overflow).toEqual([]);await page.getByRole('button',{name:'나중에 하기'}).click();await page.getByRole('button',{name:'개발용 사후 진단'}).click();
 await expect(page.locator('#post-q-0').getByRole('radio').nth(4)).toHaveAttribute('aria-checked','true');
});
