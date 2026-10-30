import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {serve} from '../tools/serve-static.mjs';

// Browser + HTTP protocol mocks only. No request reaches the deployed server;
// this fixture does not implement or verify server validation/calculation.
let server;
test.beforeAll(async()=>{server=await serve('src')});
test.afterAll(async()=>{await server.close()});
const order=['A1','A2','A3','A4','A5','PH','EM','A6','A7','A8','A9','A10','B11','B12','B13','B14','B15','B16',...Array.from({length:15},(_,i)=>'C'+(17+i)),'D32','D33','D34','D35','D36'];
const seed=JSON.parse(fs.readFileSync(new URL('../snapshot/fixture.json',import.meta.url),'utf8')).db[0];
const complete=()=>structuredClone(Object.fromEntries(['reg','goal','pre','expect','done'].map(key=>[key,seed[key]])));

async function setup(page,{answers={},role='participant',disableMobile=false}={}){
  const state={answers:structuredClone(answers),status:'draft',writes:[],reads:0,revision:0};
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
  if(disableMobile)await page.route('**/live/mobile-survey.js',route=>route.fulfill({contentType:'text/javascript',body:`export function createMobileSurvey(deps){return {reset(){},capture(){},prepare(){},mount(){},previous(){},next(){},goStep:deps.goStep,goQ:deps.goQ,nextFrom:deps.nextFrom}}`}));
  await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
    const request=route.request(),url=new URL(request.url()),body=request.postDataJSON();
    if(request.method()==='OPTIONS')return route.fulfill({status:204});
    let data;
    if(url.pathname.endsWith('/secondcareer-login')||url.pathname==='/auth/v1/token')data={access_token:'mock-access',refresh_token:'mock-refresh',expires_in:3600};
    else if(url.pathname.endsWith('/secondcareer-account'))data={profile:{role,display_name:'가상 사용자'},mustChangePassword:false,registrationAvailable:false};
    else if(url.pathname.endsWith('/secondcareer-assessment')){
      if(url.searchParams.has('id'))data={html:'<section class="sheet"><h2>모의 서버 보고서</h2><button class="noprint" onclick="window.print()">인쇄</button></section>'};
      else if(request.method()==='POST'){
        state.writes.push(structuredClone(body));state.answers=structuredClone(body.answers);state.revision++;
        state.status=body.action==='submit'?'submitted':'draft';data={status:state.status,updatedAt:'mock-revision-'+state.revision};
      }else{
        state.reads++;
        data={profile:{role},participants:[{id:'participant',display_name:'가상 응답자',counselor_user_id:'counselor'}],counselors:{counselor:{code:'counselor',n:'가상 상담사'}},assessments:[{id:'assessment',participant_id:'participant',phase:'pre',status:state.status,answers:state.answers,updated_at:'mock-revision-'+state.revision}]};
      }
    }else if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204});
    else throw Error('Unexpected mock request: '+url.pathname);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(server.url);
  await page.locator('#lg-id').fill('client01');await page.locator('#lg-pw').fill('Fixture-password-123!');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  if(role==='participant')await expect(page.locator('#live-save')).toBeVisible();
  else await expect(page.getByRole('heading',{name:role==='admin'?'관리자 참여자 등록':'상담사 페이지'})).toBeVisible();
  return {state,errors};
}
const question=page=>page.locator('.single-question .q:visible');
const next=page=>page.locator('.mobile-question-nav').getByRole('button',{name:/^(다음|응답 검토)$/});
const previous=page=>page.locator('.mobile-question-nav').getByRole('button',{name:'이전',exact:true});
async function at(page,code){await expect(question(page)).toHaveCount(1);await expect(question(page)).toHaveAttribute('id','q-'+code)}
async function jump(page,code){await page.evaluate(async code=>{const {QUESTION_DEFS}=await import('/js/00-question-defs-module.js');goQ(QUESTION_DEFS.find(q=>q.code===code).step,code)},code);await at(page,code)}
async function fill(page,code){
  const q=question(page);
  if(code==='A1')await q.getByRole('radio',{name:'동의',exact:true}).click();
  else if(code==='A2')return; // Assigned counselor is the existing read-only field.
  else if(['A4','A9','A10'].includes(code))await q.locator('.chip').first().click();
  else if(code.startsWith('C'))await q.locator('.scale button').nth(2).click();
  else if(await q.locator('.chip').count()){
    const count=({B13:2,D33:3,D35:2})[code]||1;
    for(let i=0;i<count;i++)await q.locator('.chip').nth(i).click();
  }else await q.locator('input').fill(({A3:'가상 응답자',A5:'19660101',PH:'01012345678',EM:'fixture@example.invalid',A6:'가상기업',A7:'가상직책',A8:'가상업무',B15:'70',B16:'6'})[code]);
}
async function noOverflow(page){
  expect(await page.locator('.mobile-survey').evaluate(root=>[...root.querySelectorAll('*')].filter(el=>{
    const r=el.getBoundingClientRect();return r.width&&r.height&&(r.left< -1||r.right>innerWidth+1||el.scrollWidth>el.clientWidth+2);
  }).map(el=>el.id||el.className))).toEqual([]);
}

for(const width of [320,375,390,430])test(`${width}px: all 38 questions in order, manual next, review and submit (protocol mock)`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});const {state,errors}=await setup(page);
  expect(await page.evaluate(async()=>{const {QUESTION_DEFS}=await import('/js/00-question-defs-module.js');return [...QUESTION_DEFS].sort((a,b)=>a.step-b.step||a.pos-b.pos).map(q=>q.code)})).toEqual(order);
  for(const [index,code] of order.entries()){
    await at(page,code);await expect(page.locator('.mobile-question-progress')).toContainText(`${index+1} / 38`);
    await noOverflow(page);await fill(page,code);await at(page,code); // Never auto-advance.
    if(['A1','B13','C17'].includes(code))await page.screenshot({path:testInfo.outputPath(`${width}-${code}.png`)});
    await next(page).click();
  }
  await expect(page.locator('.rv')).toHaveCount(5);await expect(page.locator('[data-mobile-edit]')).toHaveCount(38);
  await expect(page.locator('.single-question')).toHaveCount(0);
  expect(await page.evaluate(async()=>{const {S}=await import('/shared/state.js');return S.user.done})).toMatchObject({reg:true,goal:true});
  await page.getByRole('button',{name:'최종 제출',exact:true}).click();
  await expect(page.getByRole('heading',{name:'가상 응답자님, 제출이 완료되었습니다'})).toBeVisible();
  expect(state.status).toBe('submitted');expect(state.writes.filter(w=>w.action==='submit')).toHaveLength(1);
  const submitted=state.writes.find(w=>w.action==='submit').answers;
  expect(Object.keys(submitted).sort()).toEqual(['done','expect','goal','pre','reg']);
  expect(submitted.reg).toMatchObject({name:'가상 응답자',birthDate:'1966-01-01',birth:'1966',phone:'010-1234-5678'});
  expect(submitted.pre).toEqual(Array(15).fill(3));expect(submitted.goal.b13).toHaveLength(2);expect(submitted.expect.d33).toHaveLength(3);
  expect(errors).toEqual([]);
});

test('current-question validation, ranks, numbers, privacy and review error jump',async({page})=>{
  await page.setViewportSize({width:375,height:900});await setup(page);
  await next(page).click();await at(page,'A1');await expect(question(page).getByRole('alert')).toContainText('동의 여부');
  await question(page).getByRole('radio',{name:'미동의',exact:true}).click();await next(page).click();await at(page,'A1');
  await expect(question(page).getByRole('alert')).toContainText('동의해야');
  for(const [code,value,message] of [['A3','','성함'],['A5','20260230','실제 날짜'],['PH','123','휴대전화번호 형식'],['EM','invalid','이메일 형식'],['B15','101','0~100'],['B16','601','0~600']]){
    await jump(page,code);await question(page).locator('input').fill(value);await next(page).click();await at(page,code);await expect(question(page).getByRole('alert')).toContainText(message);
  }
  await jump(page,'B13');await question(page).locator('.chip').nth(2).click();await next(page).click();await at(page,'B13');
  await question(page).locator('.chip').nth(0).click();
  await expect(question(page).locator('.chip.on b')).toHaveText(['2','1']);
  await question(page).locator('.chip').nth(1).click();await expect(question(page).locator('.chip.on')).toHaveCount(2);
  await question(page).locator('.chip').nth(2).click();await question(page).locator('.chip').nth(1).click();
  await expect(question(page).locator('.chip.on b')).toHaveText(['1','2']);
  await previous(page).click();await at(page,'B12');await jump(page,'B13');await expect(question(page).locator('.chip.on b')).toHaveText(['1','2']);
  await page.evaluate(()=>goStep(5));await page.locator('.misslist button[onclick*="B16"]').click();await at(page,'B16');
  await question(page).locator('input').fill('6');await next(page).click();await at(page,'B11'); // Existing full-step validation redirects to its first missing item.
});

test('draft save, reload resume, editing, render focus and viewport crossing preserve responses (protocol mock)',async({page})=>{
  await page.setViewportSize({width:390,height:900});const {state}=await setup(page);
  await fill(page,'A1');await next(page).click();await at(page,'A2');await next(page).click();await at(page,'A3');
  await fill(page,'A3');await page.evaluate(()=>render());await at(page,'A3');await expect(question(page).locator('input')).toHaveValue('가상 응답자');
  await expect(question(page).locator('input')).toBeFocused();
  await page.getByRole('button',{name:'지금 임시저장'}).click();await expect.poll(()=>state.writes.filter(w=>w.action==='draft').length).toBeGreaterThan(0);
  await page.reload();await at(page,'A4');
  await previous(page).click();await at(page,'A3');await expect(question(page).locator('input')).toHaveValue('가상 응답자');
  await question(page).locator('input').fill('수정 응답자');
  await page.setViewportSize({width:1440,height:900});await expect(page.locator('.single-question')).toHaveCount(0);await expect(page.locator('#q-A3 input')).toHaveValue('수정 응답자');
  await expect(page.locator('.q:visible')).toHaveCount(10);
  await page.setViewportSize({width:620,height:900});await at(page,'A3');await expect(question(page).locator('input')).toHaveValue('수정 응답자');
  await page.setViewportSize({width:621,height:900});await expect(page.locator('.q:visible')).toHaveCount(10);
  await page.setViewportSize({width:390,height:900});await at(page,'A3');
  await page.getByRole('button',{name:'지금 임시저장'}).click();await expect.poll(()=>state.answers.reg.name).toBe('수정 응답자');
  await page.reload();await at(page,'A4');
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>goQ(2,'B13'));
  await page.setViewportSize({width:390,height:900});await at(page,'B13');
});

test('complete restored answers open review and each review edit opens the exact question',async({page})=>{
  await page.setViewportSize({width:375,height:900});await setup(page,{answers:complete()});
  await expect(page.locator('.rv')).toHaveCount(5);
  for(const code of ['PH','EM','B13','C31','D36']){
    await page.locator(`[data-mobile-edit="${code}"]`).click();await at(page,code);await page.evaluate(()=>goStep(5));
  }
  await page.locator('.card > .acts').getByRole('button',{name:'이전',exact:true}).click();await at(page,'D36');
  await jump(page,'C17');await previous(page).click();await at(page,'B16');
  await next(page).click();await at(page,'C17');await expect(question(page).locator('.scale button.on')).toHaveCount(1);
});

test('PC and mobile send identical edited fields, scale values and ranked/multiple selections (protocol mock)',async({browser})=>{
  const payloads=[];
  for(const width of [375,1440]){
    const page=await browser.newPage({viewport:{width,height:900}}),{state}=await setup(page,{answers:complete()});
    for(const [step,code] of [[2,'B13'],[4,'D33'],[4,'D35'],[4,'D36']]){
      await page.evaluate(({step,code})=>goQ(step,code),{step,code});
      const chips=page.locator('#q-'+code+' .chip');
      while(await page.locator('#q-'+code+' .chip.on').count())await page.locator('#q-'+code+' .chip.on').first().click();
      const choices=({B13:[2,0],D33:[2,0,3],D35:[1,3],D36:[0,1,2]})[code];
      for(const index of choices)await chips.nth(index).click();
    }
    await page.evaluate(()=>goQ(3,'C17'));await page.locator('#q-C17 .scale button').nth(4).click();
    await page.evaluate(()=>goQ(1,'A3'));await page.locator('#q-A3 input').fill('동일한 수정 응답');
    await page.evaluate(()=>goQ(2,'B15'));await page.locator('#q-B15 input').fill('80');
    await page.getByRole('button',{name:'지금 임시저장'}).click();
    await expect.poll(()=>state.answers.goal.b15).toBe('80');
    expect(state.answers.expect.d36).toHaveLength(2);expect(state.answers.pre[0]).toBe(5);
    payloads.push(state.answers);await page.close();
  }
  expect(payloads[0]).toEqual(payloads[1]);
});

test('long current question scrolls internally; printing reveals the original full step',async({page},testInfo)=>{
  await page.setViewportSize({width:320,height:640});await setup(page);
  const q=question(page);expect(await q.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await q.evaluate(el=>el.scrollTop=el.scrollHeight);expect(await q.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({path:testInfo.outputPath('320-consent-scroll.png')});
  await page.emulateMedia({media:'print'});await expect(page.locator('.q:visible')).toHaveCount(2);await expect(page.locator('.mobile-question-nav')).toBeHidden();
});

test('1440px desktop and mobile print match the controller-disabled layout',async({browser})=>{
  const enabled=await browser.newPage({viewport:{width:1440,height:900}}),disabled=await browser.newPage({viewport:{width:1440,height:900}});
  await setup(enabled,{answers:complete()});await setup(disabled,{answers:complete(),disableMobile:true});
  for(let step=0;step<6;step++){
    for(const page of [enabled,disabled])await page.evaluate(step=>goStep(step),step);
    expect(await enabled.locator('#app').screenshot()).toEqual(await disabled.locator('#app').screenshot());
  }
  for(const page of [enabled,disabled]){await page.setViewportSize({width:375,height:900});await page.evaluate(()=>goStep(3));await page.emulateMedia({media:'print'})}
  expect(await enabled.locator('#app').screenshot()).toEqual(await disabled.locator('#app').screenshot());
  await enabled.close();await disabled.close();
});

test('counselor and admin receive no mobile navigation; pre/post and edit gates remain explicit',async({browser})=>{
  for(const role of ['counselor','admin']){
    const page=await browser.newPage({viewport:{width:375,height:900}});await setup(page,{role,answers:complete()});
    await expect(page.locator('.mobile-question-nav,[data-mobile-edit]')).toHaveCount(0);
    const input=page.locator(role==='admin'?'#assessment-url':'#cns-name');await input.fill('미저장 입력');
    await page.setViewportSize({width:1440,height:900});await page.setViewportSize({width:375,height:900});
    await expect(input).toHaveValue('미저장 입력');await page.close();
  }
  const page=await browser.newPage({viewport:{width:375,height:900}});await setup(page,{answers:complete()});
  await page.evaluate(async()=>{const {S}=await import('/shared/state.js');S.mode2='post';render()});await expect(page.locator('.single-question')).toHaveCount(0);
  await page.evaluate(async()=>{const {S}=await import('/shared/state.js');S.mode2='pre';S.cedit={};S.step=1;render()});await expect(page.locator('.q:visible')).toHaveCount(10);await expect(page.locator('.mobile-question-nav')).toHaveCount(0);
  await page.close();
});
