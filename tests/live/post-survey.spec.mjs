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
 await page.getByRole('button',{name:'다음 · 사후 만족도'}).click();await expect(page.getByRole('heading',{name:'사후 만족도 설문'})).toBeVisible();
 await page.getByRole('button',{name:'이전',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'15 / 15 문항 응답'})).toBeVisible();expect(writes.every(w=>w.action==='post-draft')).toBe(true);
});
test('satisfaction questions, validation, order and session-only state',async({page})=>{
 const {writes}=await setup(page);await page.getByRole('button',{name:'개발용 사후 진단'}).click();
 await expect(page.getByRole('heading',{name:'사후 진단',exact:true})).toBeVisible();
 await page.evaluate(()=>{for(let i=0;i<15;i++)answerPost(i,3)});
 const before=await page.evaluate(async()=>{const {S}=await import('/shared/state.js');return {pre:[...S.user.pre],post:[...S.user.post]}});
 await page.getByRole('button',{name:'다음 · 사후 만족도'}).click();
 const questions={q1:'세컨플래닝 서비스에 대한 전반적인 만족도',q2:'새로운 경력을 만들어 가는 데 유익했습니까?',q3a:'상담 이후 막연한 불안이 줄었다',q3b:'미래에 대한 자신감이 높아졌다',q3c:'마음이 이전보다 안정되었다',d32:'서비스 이후 현재의 마음 상태는 어떠하십니까?',d33:'서비스 이후 가장 고민되는 부분 3가지를 순서대로 선택해 주세요.',d34:'컨설팅에서 가장 도움이 된 부분 한 가지를 선택해 주세요.',q5fit:'컨설팅 전에 기대했던 부분이 충족되었습니까?',d35:'가장 크게 극복된 경력준비 장애요인 (최대 2가지)',q7:'서비스에서 개선이 필요하다고 느낀 점 (최대 2가지)'};
 for(const [key,text] of Object.entries(questions))await expect(page.locator('#sat-'+key+' .qt')).toContainText(text);
 const options=await page.evaluate(async()=>{const {OPT}=await import('/js/03-options.js');return Object.fromEntries(['d32','d33','d34','d35','q7'].map(k=>[k,OPT['sat.'+k]]))});
 for(const [key,values] of Object.entries(options))expect(await page.locator('#sat-'+key+' .chip').allTextContents()).toEqual(values);
 await page.getByRole('button',{name:'응답 확인'}).click();await expect(page.getByRole('alert')).toContainText('11개');await expect(page.locator('#sat-q1')).toBeFocused();
 for(const key of ['q1','q2','q3a','q3b','q3c','q5fit']){
  const radios=page.locator('#sat-'+key+' [role=radio]');expect(await radios.allTextContents()).toEqual(['1','2','3','4','5']);await radios.nth(4).click();
 }
 for(const key of ['d32','d34'])await page.locator('#sat-'+key+' .chip').first().click();
 for(const key of ['d33','d35','q7']){
  const chips=page.locator('#sat-'+key+' .chip');const count=key==='d33'?3:2;
  for(let i=0;i<count;i++)await chips.nth(i).click();await chips.nth(count).click();await expect(chips.filter({has:page.locator('b')})).toHaveCount(count);
 }
 const chips=page.locator('#sat-d33 .chip');await chips.nth(0).click();await chips.nth(3).click();
 expect(await page.evaluate(async()=>{const {S}=await import('/shared/state.js');return S.user.sat.d33})).toEqual([options.d33[1],options.d33[2],options.d33[3]]);
 await page.locator('#q7t').fill('가'.repeat(200));await page.evaluate(()=>render());await expect(page.locator('#q7t')).toHaveValue('가'.repeat(200));
 await page.getByRole('button',{name:'이전',exact:true}).click();await page.getByRole('button',{name:'다음 · 사후 만족도'}).click();await expect(page.locator('#q7t')).toHaveValue('가'.repeat(200));
 await page.evaluate(async()=>{const {S}=await import('/shared/state.js');S.user.sat.d33[1]=S.user.sat.d33[0]});await page.getByRole('button',{name:'응답 확인'}).click();await expect(page.getByRole('alert')).toBeVisible();
 await page.evaluate(async()=>{const {S}=await import('/shared/state.js');const {OPT}=await import('/js/03-options.js');S.user.sat.d33=[OPT['sat.d33'][1],OPT['sat.d33'][2],OPT['sat.d33'][3]]});
 await page.evaluate(async()=>{const {S}=await import('/shared/state.js');const {OPT}=await import('/js/03-options.js');S.user.sat.q1=6;S.user.sat.d35=OPT['sat.d35'].slice(0,3);S.user.sat.q7txt='가'.repeat(201)});
 await page.getByRole('button',{name:'응답 확인'}).click();await expect(page.getByRole('alert')).toContainText('3개');
 await page.evaluate(async()=>{const {S}=await import('/shared/state.js');S.user.sat.q1=5;S.user.sat.d35=S.user.sat.d35.slice(0,2);S.user.sat.q7txt='가'.repeat(200)});
 await page.getByRole('button',{name:'응답 확인'}).click();await expect(page.getByText(/최종 제출 기능은 준비 중/)).toBeVisible();
 await page.getByRole('button',{name:'만족도 응답으로 돌아가기'}).click();await expect(page.locator('#q7t')).toHaveValue('가'.repeat(200));
 expect(await page.evaluate(async()=>{const {S}=await import('/shared/state.js');return {pre:S.user.pre,post:S.user.post}})).toEqual(before);
 expect(writes.every(w=>w.action==='post-draft'&&!('sat' in w.answers))).toBe(true);
});
for(const width of [320,375,430])test(`satisfaction fits mobile ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});await setup(page);await page.getByRole('button',{name:'개발용 사후 진단'}).click();await expect(page.getByRole('heading',{name:'사후 진단',exact:true})).toBeVisible();await page.evaluate(()=>{for(let i=0;i<15;i++)answerPost(i,3)});await page.getByRole('button',{name:'다음 · 사후 만족도'}).click();await expect(page.getByRole('heading',{name:'사후 만족도 설문'})).toBeVisible();
 const overflow=await page.locator('.mobile-survey').evaluate(root=>[...root.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.left< -1||r.right>innerWidth+1||el.scrollWidth>el.clientWidth+2)}).map(el=>el.id||el.className));expect(overflow).toEqual([]);
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
