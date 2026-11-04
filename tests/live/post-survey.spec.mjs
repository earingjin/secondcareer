import {test,expect} from '@playwright/test';
import {serve} from '../tools/serve-static.mjs';

// The gate is replaced only in this isolated browser test. Every Supabase
// request is intercepted; these tests never contact the real service.
let server;
test.beforeAll(async()=>{server=await serve('src')});
test.afterAll(async()=>{await server.close()});

async function setup(page,{gate=true,status='submitted',role='participant',pending=false,postAssessments,compare,entry=false,assessmentUrl,loginId,postReadStatus}={}){
 const writes=[],requests=[],state={postAssessments,compare,compareRequests:0,post:null,revision:0,saveStatus:200,submitStatus:200,submitDelay:0,submits:0,postReadStatus};
 await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
 await page.route('**/live/post-test-gate.js',route=>route.fulfill({contentType:'text/javascript',body:'export const postTestGate='+gate+';'}));
 await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url());requests.push({path:url.pathname,method:req.method()});
  if(req.method()==='OPTIONS')return route.fulfill({status:204});
  let data;
  if(url.pathname.endsWith('secondcareer-login')||url.pathname==='/auth/v1/token')data={access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600};
  else if(url.pathname.endsWith('secondcareer-account'))data={profile:{role,display_name:'가상 사용자'},mustChangePassword:pending,registrationAvailable:false,...(assessmentUrl?{assessmentUrl}:{})};
  else if(url.pathname.endsWith('secondcareer-assessment')){
   if(req.method()==='POST'){
    const body=req.postDataJSON();writes.push(body);
    if(body.action==='post-draft'){
     if(state.post?.status==='submitted')return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'LOCKED'})});
     if(state.saveStatus!==200)return route.fulfill({status:state.saveStatus,contentType:'application/json',body:JSON.stringify({error:'SAVE_FAILED'})});
     state.revision++;state.post={status:'draft',answers:structuredClone(body.answers),updatedAt:new Date(Date.UTC(2026,9,29)+state.revision).toISOString()};data=state.post;
    }else if(body.action==='post-submit'){
     state.submits++;if(state.submitDelay)await new Promise(r=>setTimeout(r,state.submitDelay));
     if(state.submitStatus!==200)return route.fulfill({status:state.submitStatus,contentType:'application/json',body:JSON.stringify({error:'SUBMIT_FAILED'})});
     state.revision++;const at=new Date(Date.UTC(2026,9,29)+state.revision).toISOString();state.post={status:'submitted',answers:structuredClone(body.answers),updatedAt:at,submittedAt:at};data=state.post;
    }else data={status:'draft',updatedAt:'revision'};
   }
   else if(url.searchParams.get('phase')==='post'){if(state.postReadStatus)return route.fulfill({status:state.postReadStatus,contentType:'application/json',body:JSON.stringify({error:'PRE_REQUIRED'})});data={assessment:state.post}}
   else if(url.searchParams.has('compare')){state.compareRequests++;if(!state.compare)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'NOT_AVAILABLE'})});data=state.compare}
   else data={profile:{role},participants:[{id:'fixture',display_name:'가상 참여자',counselor_user_id:'counselor',...(loginId?{login_id:loginId}:{})}],counselors:{},assessments:[{id:'assessment',participant_id:'fixture',phase:'pre',status,answers:{reg:{name:'가상 참여자',careers:[{}]},goal:{},expect:{},done:{},pre:Array(15).fill(3)},updated_at:'revision'}],...(state.postAssessments?{postAssessments:state.postAssessments}:{})};
  }else if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204});
  else throw Error('unexpected request');
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(server.url+(entry?'?entry=post':''));await page.locator('#lg-id').fill('client01');await page.locator('#lg-pw').fill('fixture-password');await page.getByRole('button',{name:'로그인',exact:true}).click();
 if(entry){}
 else if(pending)await expect(page.getByRole('heading',{name:'최초 비밀번호 변경'})).toBeVisible();
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
 await setup(page,{gate:false});await expect(page.getByRole('button',{name:'사후진단 실시'})).toHaveCount(0);
 await page.evaluate(()=>{startPost();answerPost(0,5);nextPost()});await expect(page.getByRole('heading',{name:'사후 진단',exact:true})).toHaveCount(0);
});
test('question definitions, scale, validation and state separation',async({page})=>{
 const {writes}=await setup(page);const pre=await page.evaluate(async()=>[...(await import('/shared/state.js')).S.user.pre]);
 await page.getByRole('button',{name:'사후진단 실시'}).click();
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
 const {writes}=await setup(page);await page.getByRole('button',{name:'사후진단 실시'}).click();
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
 await page.getByRole('button',{name:'응답 확인'}).click();await expect(page.getByRole('heading',{name:'최종 제출 확인'})).toBeVisible();
 await page.getByRole('button',{name:'만족도 응답으로 돌아가기'}).click();await expect(page.locator('#q7t')).toHaveValue('가'.repeat(200));
 expect(await page.evaluate(async()=>{const {S}=await import('/shared/state.js');return {pre:S.user.pre,post:S.user.post}})).toEqual(before);
 expect(writes.every(w=>w.action==='post-draft')).toBe(true);
});
for(const width of [320,375,430])test(`satisfaction fits mobile ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});await setup(page);await page.getByRole('button',{name:'사후진단 실시'}).click();await expect(page.getByRole('heading',{name:'사후 진단',exact:true})).toBeVisible();await page.evaluate(()=>{for(let i=0;i<15;i++)answerPost(i,3)});await page.getByRole('button',{name:'다음 · 사후 만족도'}).click();await expect(page.getByRole('heading',{name:'사후 만족도 설문'})).toBeVisible();
 const overflow=await page.locator('.mobile-survey').evaluate(root=>[...root.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.left< -1||r.right>innerWidth+1||el.scrollWidth>el.clientWidth+2)}).map(el=>el.id||el.className));expect(overflow).toEqual([]);
});
// ---- DEV-007B: save/restore, final submit, failure and duplicate handling --------------------
async function fillSurvey(page){
 await page.getByRole('button',{name:'사후진단 실시'}).click();await expect(page.getByRole('heading',{name:'사후 진단',exact:true})).toBeVisible();
 await page.evaluate(()=>{for(let i=0;i<15;i++)answerPost(i,3)});await page.getByRole('button',{name:'다음 · 사후 만족도'}).click();
 for(const key of ['q1','q2','q3a','q3b','q3c','q5fit'])await page.locator('#sat-'+key+' [role=radio]').nth(4).click();
 for(const [key,count] of [['d32',1],['d34',1],['d33',3],['d35',2],['q7',1]])for(let i=0;i<count;i++)await page.locator('#sat-'+key+' .chip').nth(i).click();
 await page.locator('#q7t').fill('의견 가나다');
}
test('satisfaction draft is saved to the server and restored after reload',async({page})=>{
 const {state,writes}=await setup(page);await fillSurvey(page);
 await expect(page.locator('#post-save-status')).toContainText('임시저장 완료');
 expect(state.post.status).toBe('draft');expect(state.post.answers.sat.q1).toBe(5);expect(state.post.answers.sat.d33).toHaveLength(3);expect(state.post.answers.sat.q7txt).toBe('의견 가나다');
 expect(writes.some(w=>w.action==='post-submit')).toBe(false);
 await page.reload();await page.getByRole('button',{name:'사후진단 실시'}).click();await page.getByRole('button',{name:'다음 · 사후 만족도'}).click();
 await expect(page.locator('#sat-q1 [role=radio]').nth(4)).toHaveAttribute('aria-checked','true');
 await expect(page.locator('#sat-d33 .chip b')).toHaveText(['1','2','3']);await expect(page.locator('#q7t')).toHaveValue('의견 가나다');
});
test('final submit shows completion only after the server confirms, once, and locks edits',async({page})=>{
 const {state,writes}=await setup(page);state.submitDelay=300;await fillSurvey(page);
 await page.getByRole('button',{name:'응답 확인'}).click();await expect(page.getByRole('heading',{name:'최종 제출 확인'})).toBeVisible();
 const submit=page.getByRole('button',{name:'최종 제출'});await submit.dblclick();
 await expect(page.getByRole('heading',{name:'사후 진단 제출이 완료되었습니다'})).toBeVisible();
 expect(state.submits).toBe(1);expect(state.post.status).toBe('submitted');expect(state.post.answers.post).toEqual(Array(15).fill(3));expect(state.post.answers.sat.q1).toBe(5);
 expect(await page.evaluate(async()=>[...(await import('/shared/state.js')).S.user.pre])).toEqual(Array(15).fill(3));
 await page.reload();await page.getByRole('button',{name:'사후진단 실시'}).click();
 await expect(page.getByRole('heading',{name:'사후 진단 제출이 완료되었습니다'})).toBeVisible();await expect(page.getByRole('radio')).toHaveCount(0);
 const count=writes.length,snapshot=structuredClone(state.post);
 await page.evaluate(()=>{answerPost(0,5);setSatScore('q1',1);submitPost()});await page.waitForTimeout(1000);
 expect(writes.length).toBe(count);expect(state.post).toEqual(snapshot);
});
test('submit failure and conflict show no completion, then retry succeeds once',async({page})=>{
 const {state}=await setup(page);await fillSurvey(page);await page.getByRole('button',{name:'응답 확인'}).click();
 for(const [status,text] of [[503,'제출하지 못했습니다'],[409,'다른 저장 또는 제출']]){
  state.submitStatus=status;await page.getByRole('button',{name:/최종 제출|다시 제출/}).click();
  await expect(page.getByRole('alert')).toContainText(text);await expect(page.getByRole('heading',{name:'사후 진단 제출이 완료되었습니다'})).toHaveCount(0);expect(state.post.status).toBe('draft');
 }
 state.submitStatus=200;await page.getByRole('button',{name:'다시 제출'}).click();
 await expect(page.getByRole('heading',{name:'사후 진단 제출이 완료되었습니다'})).toBeVisible();expect(state.post.status).toBe('submitted');
});
test('incomplete satisfaction answers cannot reach final submit',async({page})=>{
 const {state}=await setup(page);await page.getByRole('button',{name:'사후진단 실시'}).click();await expect(page.getByRole('heading',{name:'사후 진단',exact:true})).toBeVisible();
 await page.evaluate(()=>{for(let i=0;i<15;i++)answerPost(i,3)});await page.getByRole('button',{name:'다음 · 사후 만족도'}).click();
 await page.getByRole('button',{name:'응답 확인'}).click();await expect(page.getByRole('alert')).toBeVisible();
 await page.evaluate(()=>submitPost());await page.waitForTimeout(300);expect(state.submits).toBe(0);
});
test('saved post draft is restored after reload without changing submitted pre data',async({page})=>{
 const {writes}=await setup(page);await page.getByRole('button',{name:'사후진단 실시'}).click();await page.locator('#post-q-0').getByRole('radio').last().click();
 await page.getByRole('button',{name:'지금 임시저장'}).click();await expect(page.locator('#post-save-status')).toContainText('임시저장 완료');
 await page.reload();await page.getByRole('button',{name:'사후진단 실시'}).click();
 await expect(page.getByRole('status').filter({hasText:'1 / 15 문항 응답'})).toBeVisible();await expect(page.locator('#post-q-0').getByRole('radio').last()).toHaveAttribute('aria-checked','true');
 expect(await page.evaluate(async()=>[...(await import('/shared/state.js')).S.user.pre])).toEqual(Array(15).fill(3));expect(writes.every(w=>w.action==='post-draft')).toBe(true);
});
test('save failure is not reported as success and can be retried',async({page})=>{
 const {state}=await setup(page);state.saveStatus=503;await page.getByRole('button',{name:'사후진단 실시'}).click();await page.locator('#post-q-0').getByRole('radio').first().click();
 await page.getByRole('button',{name:'지금 임시저장'}).click();await expect(page.locator('#post-save-status')).toContainText('임시저장하지 못했습니다');expect(state.post).toBeNull();
 state.saveStatus=200;await page.getByRole('button',{name:'지금 임시저장'}).click();await expect(page.locator('#post-save-status')).toContainText('임시저장 완료');expect(state.post.answers.post[0]).toBe(1);
});
test('version conflict is shown instead of a saved status',async({page})=>{
 const {state}=await setup(page);state.saveStatus=409;await page.getByRole('button',{name:'사후진단 실시'}).click();await page.locator('#post-q-0').getByRole('radio').first().click();
 await page.getByRole('button',{name:'지금 임시저장'}).click();await expect(page.locator('#post-save-status')).toContainText('다른 저장');await expect(page.locator('#post-save-status')).not.toContainText('임시저장 완료');
});
test('post draft is restored after logout and login',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'사후진단 실시'}).click();await page.locator('#post-q-0').getByRole('radio').last().click();
 await page.getByRole('button',{name:'지금 임시저장'}).click();await expect(page.locator('#post-save-status')).toContainText('임시저장 완료');
 await page.getByRole('button',{name:'나중에 하기'}).click();await page.getByRole('button',{name:'로그아웃'}).click();
 await page.locator('#lg-id').fill('client01');await page.locator('#lg-pw').fill('fixture-password');await page.getByRole('button',{name:'로그인',exact:true}).click();
 await page.getByRole('button',{name:'사후진단 실시'}).click();await expect(page.locator('#post-q-0').getByRole('radio').last()).toHaveAttribute('aria-checked','true');
});
test('session expiry during a save returns to login without a success indication',async({page})=>{
 const {state}=await setup(page);state.saveStatus=401;await page.getByRole('button',{name:'사후진단 실시'}).click();await page.locator('#post-q-0').getByRole('radio').first().click();
 await page.getByRole('button',{name:'지금 임시저장'}).click();await expect(page.locator('#lg-id')).toBeVisible();expect(state.post).toBeNull();await expect(page.locator('#post-save-status')).toHaveCount(0);
});
for(const width of [320,375,430])test(`mobile ${width}px: choices and navigation fit and survive rerender`,async({page})=>{
 await page.setViewportSize({width,height:800});await setup(page);await page.getByRole('button',{name:'사후진단 실시'}).click();
 await page.locator('#post-q-0').getByRole('radio').nth(4).click();await page.evaluate(()=>render());
 await expect(page.locator('#post-q-0').getByRole('radio').nth(4)).toHaveAttribute('aria-checked','true');
 const overflow=await page.locator('.mobile-survey').evaluate(root=>[...root.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.left< -1||r.right>innerWidth+1||el.scrollWidth>el.clientWidth+2)}).map(el=>el.id||el.className));
 expect(overflow).toEqual([]);await page.getByRole('button',{name:'나중에 하기'}).click();await page.getByRole('button',{name:'사후진단 실시'}).click();
 await expect(page.locator('#post-q-0').getByRole('radio').nth(4)).toHaveAttribute('aria-checked','true');
});

// ---- DEV-008: counselor pre/post comparison (server responses are fixtures) -------------------
const COMPARE_POST=[5,5,5,4,4,4,3,3,3,2,2,2,1,1,1];
async function compareFixture(page){
 const OPT=await page.evaluate(async()=>{const {OPT}=await import('/js/03-options.js');return Object.fromEntries(['d32','d33','d34','d35','q7'].map(k=>[k,OPT['sat.'+k]]))});
 return {participantId:'fixture',preDate:'2026-10-01',preSubmittedAt:'2026-10-01T00:00:00.000Z',postSubmittedAt:'2026-10-20T00:00:00.000Z',evaluationVersion:'macro-chart-v1-unverified',
  areas:[100,75,50,25,0].map(post=>({pre:50,post,diff:post-50})),items:{pre:Array(15).fill(3),post:COMPARE_POST},
  sat:{q1:5,q2:4,q3a:3,q3b:2,q3c:1,q5fit:4,d32:[OPT.d32[1]],d33:[OPT.d33[2],OPT.d33[0],OPT.d33[1]],d34:[OPT.d34[0]],d35:[OPT.d35[0],OPT.d35[2]],q7:[OPT.q7[3]],q7txt:'상담 의견 <b>원문</b>'}};
}
test('counselor list shows post status and opens the submitted comparison',async({page})=>{
 const {state}=await setup(page,{role:'counselor',postAssessments:[{participant_id:'fixture',status:'submitted',submitted_at:'2026-10-20T00:00:00.000Z'}]});
 state.compare=await compareFixture(page);const data=state.compare;
 const row=page.locator('tr[data-participant="fixture"]');await expect(row.locator('[data-post-status]')).toHaveText('제출 완료');await expect(row).toContainText('2026-10-20');
 await expect(row.getByRole('button',{name:'결과 리포트 · 상담사용 5쪽'})).toBeVisible();
 await row.getByRole('button',{name:'비교 결과 보기'}).click();await expect(page.getByRole('heading',{name:'사전·사후 비교'})).toBeVisible();
 const areas=await page.locator('#cmp-areas tbody tr').evaluateAll(rows=>rows.map(r=>[...r.cells].map(c=>c.textContent)));
 expect(areas).toEqual([['자기인식','50.0','100.0','+50.0'],['직업탐색','50.0','75.0','+25.0'],['의사결정','50.0','50.0','0.0'],['커리어플랜','50.0','25.0','-25.0'],['목표실행','50.0','0.0','-50.0']]);
 const items=await page.locator('#cmp-items tbody tr').evaluateAll(rows=>rows.map(r=>[r.cells[0].textContent,r.cells[3].textContent,r.cells[4].textContent,r.cells[5].textContent]));
 expect(items).toEqual(COMPARE_POST.map((v,i)=>[String(i+1),'3',String(v),v>3?'+'+(v-3):String(v-3)]));
 const sat=page.locator('#cmp-sat');
 for(const k of ['q1','q2','q3a','q3b','q3c','q5fit'])await expect(sat.locator('[data-sat="'+k+'"] dd')).toContainText(data.sat[k]+'점 / 5점');
 await expect(sat.locator('[data-sat="d33"] dd')).toHaveText(data.sat.d33.map((v,i)=>(i+1)+'순위 '+v).join(', '));
 for(const k of ['d32','d34','d35','q7'])await expect(sat.locator('[data-sat="'+k+'"] dd')).toHaveText(data.sat[k].join(', '));
 await expect(sat.locator('[data-sat="q7txt"] dd')).toHaveText(data.sat.q7txt);
 await page.getByRole('button',{name:'담당 내담자 목록으로 돌아가기'}).click();await expect(page.getByRole('heading',{name:'상담사 페이지'})).toBeVisible();
});
test('comparison stays closed for unsubmitted post and when the browser gate is off',async({page})=>{
 const {state}=await setup(page,{role:'counselor',postAssessments:[{participant_id:'fixture',status:'draft',submitted_at:null}]});
 const row=page.locator('tr[data-participant="fixture"]');await expect(row.locator('[data-post-status]')).toHaveText('작성 중');
 await expect(row.getByRole('button',{name:'비교 결과 보기'})).toBeDisabled();
 await page.evaluate(()=>openCompare('fixture'));await expect(page.getByRole('alert')).toBeVisible();expect(state.compareRequests).toBe(0);

});
test('gate off hides post columns even if the server sends post status',async({page})=>{
 const {state}=await setup(page,{gate:false,role:'counselor',postAssessments:[{participant_id:'fixture',status:'submitted',submitted_at:'2026-10-20T00:00:00.000Z'}]});
 await expect(page.locator('[data-post-status]')).toHaveCount(0);await expect(page.getByRole('button',{name:'비교 결과 보기'})).toHaveCount(0);
 await page.evaluate(()=>openCompare('fixture'));expect(state.compareRequests).toBe(0);
});
test('comparison fits a 375px mobile screen without page overflow',async({page})=>{
 await page.setViewportSize({width:375,height:800});
 const {state}=await setup(page,{role:'counselor',postAssessments:[{participant_id:'fixture',status:'submitted',submitted_at:'2026-10-20T00:00:00.000Z'}]});
 state.compare=await compareFixture(page);await page.locator('tr[data-participant="fixture"]').getByRole('button',{name:'비교 결과 보기'}).click();
 await expect(page.getByRole('heading',{name:'사전·사후 비교'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

// ---- DEV-012: post notice link entry and counselor post notice copy (fixtures only) ----------
const POST_HEADING={name:'사후 진단',exact:true};
test('post entry URL keeps the configured address and adds only the entry marker',async({page})=>{
 await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));await page.goto(server.url);
 const urls=await page.evaluate(async()=>{const {postEntryUrl}=await import('/live/assessment-notice.js');return ['https://a.example/diag','https://a.example/diag?org=1#top','http://a.example/diag','not a url',''].map(postEntryUrl)});
 expect(urls).toEqual(['https://a.example/diag?entry=post','https://a.example/diag?org=1&entry=post#top',null,null,null]);
});
test('post link shows a login hint before login',async({page})=>{
 await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
 await page.goto(server.url+'?entry=post');await expect(page.locator('#post-entry-hint')).toContainText('로그인하면 사후진단으로 이동합니다');
 await page.goto(server.url);await expect(page.locator('#lg-id')).toBeVisible();await expect(page.locator('#post-entry-hint')).toHaveCount(0);
});
test('post link opens the post assessment after login and after reload; leaving clears the marker',async({page})=>{
 const {requests}=await setup(page,{entry:true});
 await expect(page.getByRole('heading',POST_HEADING)).toBeVisible();expect(new URL(page.url()).search).toBe('?entry=post');
 expect(requests.some(r=>r.path.endsWith('secondcareer-assessment'))).toBe(true);
 await page.locator('#post-q-0').getByRole('radio').last().click();await page.getByRole('button',{name:'지금 임시저장'}).click();await expect(page.locator('#post-save-status')).toContainText('임시저장 완료');
 await page.reload();await expect(page.getByRole('heading',POST_HEADING)).toBeVisible();await expect(page.locator('#post-q-0').getByRole('radio').last()).toHaveAttribute('aria-checked','true');
 await page.getByRole('button',{name:'나중에 하기'}).click();await expect(page.getByRole('heading',{name:/제출이 완료되었습니다/})).toBeVisible();expect(new URL(page.url()).search).toBe('');
 await page.reload();await expect(page.getByRole('heading',{name:/제출이 완료되었습니다/})).toBeVisible();await expect(page.getByRole('heading',POST_HEADING)).toHaveCount(0);
});
test('post link with an unsubmitted pre assessment explains and stays on the pre survey',async({page})=>{
 await setup(page,{entry:true,status:'draft'});
 await expect(page.getByRole('alert')).toContainText('사전진단을 먼저 완료');await expect(page.locator('#live-save')).toBeVisible();
 await expect(page.getByRole('heading',POST_HEADING)).toHaveCount(0);expect(new URL(page.url()).search).toBe('');
});
test('server refusal of post entry is shown and the marker is cleared',async({page})=>{
 await setup(page,{entry:true,postReadStatus:403});
 await expect(page.getByRole('alert')).toContainText('사후진단을 시작하지 못했습니다');await expect(page.getByRole('heading',POST_HEADING)).toHaveCount(0);
 await expect(page.getByRole('heading',{name:/제출이 완료되었습니다/})).toBeVisible();expect(new URL(page.url()).search).toBe('');
});
test('post link is ignored for counselors and when the browser gate is off',async({browser})=>{
 for(const options of [{role:'counselor'},{gate:false}]){
  const page=await browser.newPage();
  try{
   await setup(page,{entry:true,...options});
   await expect(page.getByRole('heading',options.role?{name:'상담사 페이지'}:{name:/제출이 완료되었습니다/})).toBeVisible();
   await expect(page.getByRole('heading',POST_HEADING)).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);
  }finally{await page.close()}
 }
});
async function mockClipboard(page,fail=false){await page.evaluate(fail=>{window.__copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(fail)throw Error('denied');window.__copied=text}}})},fail)}
const NOTICE_OPTIONS={role:'counselor',assessmentUrl:'https://example.invalid/diagnosis',loginId:'client01'};
test('counselor copies the post notice with link, login ID and no password',async({page})=>{
 await setup(page,{...NOTICE_OPTIONS,postAssessments:[{participant_id:'fixture',status:'draft',submitted_at:null}]});await mockClipboard(page);
 const row=page.locator('tr[data-participant="fixture"]');await expect(row.getByRole('button',{name:'사전진단 안내 복사'})).toBeEnabled();
 await row.getByRole('button',{name:'사후진단 안내 복사'}).click();await expect(page.locator('#copy-notice-status')).toHaveText('사후진단 안내문을 복사했습니다.');
 const text=await page.evaluate(()=>window.__copied);
 expect(text).toContain('가상 참여자님, 사후진단 안내입니다.');expect(text).toContain('접속 링크: https://example.invalid/diagnosis?entry=post');
 expect(text).toContain('아이디: client01');expect(text).toContain('기존 비밀번호');expect(text).toContain('사후진단 15문항과 만족도 조사');
 expect(text).not.toContain('임시 비밀번호');expect(text).not.toContain('fixture');
 await mockClipboard(page,true);await row.getByRole('button',{name:'사후진단 안내 복사'}).click();
 await expect(page.locator('#copy-notice-status')).toHaveText('사후진단 안내문을 복사하지 못했습니다. 클립보드 권한을 확인해 주세요.');
});
test('post notice copy is disabled before pre submission, after post submission and without an address',async({browser})=>{
 for(const [options,reason] of [
  [{...NOTICE_OPTIONS,status:'draft',postAssessments:[]},'사전진단 최종 제출 후 안내할 수 있습니다'],
  [{...NOTICE_OPTIONS,postAssessments:[{participant_id:'fixture',status:'submitted',submitted_at:'2026-10-20T00:00:00.000Z'}]},'사후진단 제출 완료'],
  [{...NOTICE_OPTIONS,assessmentUrl:undefined,postAssessments:[]},'진단 접속 주소 설정이 필요합니다'],
  [{...NOTICE_OPTIONS,loginId:undefined,postAssessments:[]},'로그인 ID가 없습니다']]){
  const page=await browser.newPage();
  try{
   await setup(page,options);await mockClipboard(page);const row=page.locator('tr[data-participant="fixture"]');
   const button=row.getByRole('button',{name:'사후진단 안내 복사'});await expect(button).toBeDisabled();await expect(row).toContainText(reason);
   await page.evaluate(()=>document.querySelector('[data-copy-post-notice]').dispatchEvent(new MouseEvent('click',{bubbles:true})));
   expect(await page.evaluate(()=>window.__copied)).toBe('');
  }finally{await page.close()}
 }
});
test('post notice copy is hidden when the browser gate is off',async({page})=>{
 await setup(page,{...NOTICE_OPTIONS,gate:false,postAssessments:[]});
 await expect(page.getByRole('button',{name:'사전진단 안내 복사'})).toBeVisible();await expect(page.getByRole('button',{name:'사후진단 안내 복사'})).toHaveCount(0);
});