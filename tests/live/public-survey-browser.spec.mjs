import {test,expect} from '@playwright/test';
import {serve} from '../tools/serve-static.mjs';
import fs from 'node:fs';
let server;
test.beforeAll(async()=>{server=await serve('src')});
test.afterAll(async()=>server.close());
test.beforeEach(async({page})=>{await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"if(new URLSearchParams(location.search).get('entry')==='pre') import('./live/public-survey.js'); else import('./live/app.js');"}));});
const link='11111111-1111-4111-8111-111111111111';
for(const mobile of [false,true])test(`real inputs format and restore contact details (${mobile?'mobile':'desktop'})`,async({page})=>{
 if(mobile)await page.setViewportSize({width:375,height:800});
 let saved=null,version=0;const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/functions/v1/secondcareer-public-assessment',async route=>{
  const body=route.request().postDataJSON();
  if(body.action==='draft'){saved=body.answers;version++}
  await route.fulfill({json:{intakeId:body.intakeId,status:'draft',version,expiresAt:'2099-01-01T00:00:00Z',...(body.action==='read'&&saved?{answers:saved}:{})}});
 });
 await page.goto(server.url+'/?entry=pre&linkId='+link);await page.getByRole('button',{name:'사전진단 시작하기'}).click();
 await page.getByRole('radio',{name:'동의',exact:true}).click();
 await page.getByRole('button',{name:mobile?'다음':'다음 · 기본정보',exact:true}).last().click();
 const next=async()=>page.getByRole('button',{name:'다음',exact:true}).last().click();
 await page.getByLabel('성함').fill('홍길동');if(mobile)await next();
 await page.getByRole('radio',{name:'남성',exact:true}).click();if(mobile)await next();
 await page.getByLabel('생년월일').fill('19800230');
 if(mobile){await next();await expect(page.locator('#q-A5')).toBeVisible()}
 await page.getByLabel('생년월일').fill('19800315');await expect(page.getByLabel('생년월일')).toHaveValue('1980-03-15');if(mobile)await next();
 await page.getByLabel('휴대전화번호').fill('123');
 if(mobile){await next();await expect(page.locator('#q-PH')).toBeVisible()}
 await page.getByLabel('휴대전화번호').fill('01012345678');await expect(page.getByLabel('휴대전화번호')).toHaveValue('010-1234-5678');
 await expect.poll(()=>saved?.reg?.phone).toBe('010-1234-5678');expect(saved.reg.birthDate).toBe('1980-03-15');
 await page.reload();
 if(mobile){await page.getByRole('button',{name:'이전',exact:true}).last().click();await expect(page.getByLabel('생년월일')).toHaveValue('1980-03-15');await next()}
 else await page.getByRole('button',{name:'다음 · 기본정보',exact:true}).click();
 await expect(page.getByLabel('휴대전화번호')).toHaveValue('010-1234-5678');
 expect(errors).toEqual([]);
});
test('anonymous survey saves, resumes and submits through mocked HTTP',async({page})=>{
 let saved=null,status='draft',version=0;const actions=[];
 await page.route('**/functions/v1/secondcareer-public-assessment',async route=>{
  const body=route.request().postDataJSON();actions.push(body.action);
  if(body.action==='draft'){saved=body.answers;version++}if(body.action==='submit'){saved=body.answers;version++;status='submitted'}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({intakeId:body.intakeId,status,version,expiresAt:'2099-01-01T00:00:00Z',...(body.action==='read'&&saved?{answers:saved}:{}),...(status==='submitted'?{submittedAt:'2026-11-23T00:00:00Z'}:{})})});
 });
 await page.goto(server.url+'/?entry=pre&linkId='+link);await page.getByRole('button',{name:'사전진단 시작하기'}).click();
 await expect(page.locator('#q-A1')).toBeVisible();await expect(page.locator('#q-A2')).toHaveCount(0);
 await page.getByRole('radio',{name:'동의',exact:true}).click();await expect.poll(()=>actions.includes('draft')).toBeTruthy();
 await page.reload();await expect(page.locator('#q-A1')).toBeVisible();expect(actions).toContain('read');
 const fixture=JSON.parse(fs.readFileSync('tests/snapshot/fixture.json','utf8')).db[0];
 await page.evaluate(async f=>{const {S}=await import('/shared/state.js');Object.assign(S.user,{reg:f.reg,goal:f.goal,expect:f.expect,done:f.done,pre:f.pre});window.goStep(5)},fixture);
 await page.getByRole('button',{name:'응답 검토하기'}).click();await page.getByRole('button',{name:'최종 제출'}).click();await expect(page.getByText('설문 제출이 완료되었습니다.',{exact:false}).first()).toBeVisible();expect(actions).toContain('submit');
 await page.reload();await expect(page.getByText('설문 제출이 완료되었습니다.',{exact:false}).first()).toBeVisible();
});
test('invalid link is rejected without network',async({page})=>{await page.goto(server.url+'/?entry=pre');await expect(page.getByRole('alert')).toContainText('링크');});
test('an individual intake must still have an expiry',async({page})=>{
 await page.route('**/functions/v1/secondcareer-public-assessment',async route=>{
  const {intakeId}=route.request().postDataJSON();
  await route.fulfill({json:{intakeId,status:'draft',version:0,expiresAt:null}});
 });
 await page.goto(server.url+'/?entry=pre&linkId='+link);
 await expect(page.getByRole('alert')).toHaveText('서버 응답을 확인하지 못했습니다.');
 await expect(page.locator('#q-A1')).toHaveCount(0);
});
test('mobile advances from consent directly to basic information',async({page})=>{
 await page.setViewportSize({width:375,height:800});
 await page.route('**/functions/v1/secondcareer-public-assessment',async route=>{const b=route.request().postDataJSON();await route.fulfill({json:{intakeId:b.intakeId,status:'draft',version:b.action==='draft'?1:0,expiresAt:'2099-01-01T00:00:00Z'}})});
 await page.goto(server.url+'/?entry=pre&linkId='+link);await page.getByRole('button',{name:'사전진단 시작하기'}).click();await page.getByRole('radio',{name:'동의',exact:true}).click();
 await page.getByRole('button',{name:'다음',exact:true}).last().click();await expect(page.locator('#q-A3')).toBeVisible();await expect(page.locator('#q-A2')).toHaveCount(0);
});
test('draft conflict does not show saved and retains the edited screen',async({page})=>{
 let drafts=0;
 await page.route('**/functions/v1/secondcareer-public-assessment',async route=>{const b=route.request().postDataJSON();if(b.action==='draft'){drafts++;return route.fulfill({status:409,json:{error:'CONFLICT'}})}return route.fulfill({json:{intakeId:b.intakeId,status:'draft',version:0,expiresAt:'2099-01-01T00:00:00Z'}})});
 await page.goto(server.url+'/?entry=pre&linkId='+link);await page.getByRole('button',{name:'사전진단 시작하기'}).click();await page.getByRole('radio',{name:'동의',exact:true}).click();
 await expect(page.locator('#public-save')).toContainText('다른 화면에서 응답이 변경');await expect(page.locator('#q-A1')).toBeVisible();
 await expect(page.locator('#public-save-retry')).toBeHidden();await page.getByRole('button',{name:'다음 · 기본정보'}).click();await page.getByLabel('성함').fill('합성');await page.waitForTimeout(900);expect(drafts).toBe(1);
});

test('failed draft retries and retains answers',async({page})=>{
 let attempts=0,saved;
 await page.route('**/functions/v1/secondcareer-public-assessment',async route=>{const b=route.request().postDataJSON();if(b.action==='draft'){attempts++;if(attempts===1)return route.abort('failed');saved=b.answers}return route.fulfill({json:{intakeId:b.intakeId,status:'draft',version:attempts,expiresAt:'2099-01-01T00:00:00Z'}})});
 await page.goto(server.url+'/?entry=pre&linkId='+link);await page.getByRole('button',{name:'사전진단 시작하기'}).click();await page.getByRole('radio',{name:'동의',exact:true}).click();
 await expect(page.locator('#public-save-retry')).toBeVisible();await page.locator('#public-save-retry').click();await expect(page.locator('#public-save')).toContainText('임시저장 완료');expect(saved.reg.a1).toBe('동의');
});

test('complete saved draft resumes at review choice',async({page})=>{
 const f=JSON.parse(fs.readFileSync('tests/snapshot/fixture.json','utf8')).db[0];let started=false;
 await page.route('**/functions/v1/secondcareer-public-assessment',async route=>{const b=route.request().postDataJSON();if(b.action==='start')started=true;await route.fulfill({json:{intakeId:b.intakeId,status:'draft',version:0,expiresAt:'2099-01-01T00:00:00Z',...(b.action==='read'?{answers:{reg:f.reg,goal:f.goal,expect:f.expect,done:f.done,pre:f.pre}}:{})}})});
 await page.goto(server.url+'/?entry=pre&linkId='+link);await expect(page.getByRole('button',{name:'사전진단 시작하기'})).toBeVisible();expect(started).toBeTruthy();await page.reload();await expect(page.getByText('모든 문항에 응답하셨습니다!')).toBeVisible();
});
test('unknown submit response is confirmed with status',async({page})=>{
 let submitted=false;
 await page.route('**/functions/v1/secondcareer-public-assessment',async route=>{const b=route.request().postDataJSON();if(b.action==='submit'){submitted=true;return route.abort('failed')};return route.fulfill({json:{intakeId:b.intakeId,status:submitted?'submitted':'draft',version:submitted?1:0,expiresAt:'2099-01-01T00:00:00Z',...(submitted?{submittedAt:'2026-11-23T00:00:00Z'}:{})}})});
 await page.goto(server.url+'/?entry=pre&linkId='+link);await page.getByRole('button',{name:'사전진단 시작하기'}).click();await page.getByRole('radio',{name:'동의',exact:true}).click();
 const fixture=JSON.parse(fs.readFileSync('tests/snapshot/fixture.json','utf8')).db[0];
 await page.evaluate(async f=>{const {S}=await import('/shared/state.js');Object.assign(S.user,{reg:f.reg,goal:f.goal,expect:f.expect,done:f.done,pre:f.pre});window.goStep(5)},fixture);
 await page.getByRole('button',{name:'응답 검토하기'}).click();await page.getByRole('button',{name:'최종 제출'}).click();await expect(page.getByText('설문 제출이 완료되었습니다.',{exact:false}).first()).toBeVisible();
});

test('anonymous welcome and mobile question use page scrolling',async({page})=>{
 await page.setViewportSize({width:320,height:500});
 await page.route('**/functions/v1/secondcareer-public-assessment',async route=>{const b=route.request().postDataJSON();await route.fulfill({json:{intakeId:b.intakeId,status:'draft',version:0,expiresAt:'2099-01-01T00:00:00Z'}})});
 await page.goto(server.url+'/?entry=pre&linkId='+link);
 await expect(page.getByRole('heading',{name:'사전진단 참여 안내'})).toBeVisible();
 await expect(page.locator('.proto-note')).toHaveCount(0);
 await page.getByRole('button',{name:'사전진단 시작하기'}).click();
 await expect(page.locator('#public-save-retry')).toBeHidden();
 const q=page.locator('#q-A1');
 expect(await q.evaluate(el=>({overflow:getComputedStyle(el).overflowY,max:getComputedStyle(el).maxHeight}))).toEqual({overflow:'visible',max:'none'});
 await q.scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY);await page.mouse.move(160,250);await page.mouse.wheel(0,350);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(before);
 for(const width of [320,375,620,768,1440]){await page.setViewportSize({width,height:700});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()}
});

for(const width of [320,375,1440])test(`welcome and numeric fields fit at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});
 await page.route('**/functions/v1/secondcareer-public-assessment',async route=>{const b=route.request().postDataJSON();await route.fulfill({json:{intakeId:b.intakeId,status:'draft',version:0,expiresAt:'2099-01-01T00:00:00Z'}})});
 await page.goto(server.url+'/?entry=pre&linkId='+link);
 await expect(page.locator('.public-welcome .forest')).toHaveCount(1);
 await expect(page.getByText('Good life, Good Work')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.getByRole('button',{name:'사전진단 시작하기'}).click();await page.getByRole('radio',{name:'동의',exact:true}).click();
 await page.evaluate(()=>goQ(2,'B16'));
 const unit=page.locator('#q-B16 .unit');await expect(unit).toBeVisible();
 expect(await unit.evaluate(el=>{const [a,b]=el.children;return a.getBoundingClientRect().right<=b.getBoundingClientRect().left&&b.getBoundingClientRect().right<=innerWidth})).toBeTruthy();
});

test('review choice, correction, direct confirmation and duplicate submission guard',async({page})=>{
 let submissions=0;let release;const waiting=new Promise(resolve=>release=resolve);
 await page.route('**/functions/v1/secondcareer-public-assessment',async route=>{const b=route.request().postDataJSON();if(b.action==='submit'){submissions++;await waiting}await route.fulfill({json:{intakeId:b.intakeId,status:b.action==='submit'?'submitted':'draft',version:0,expiresAt:'2099-01-01T00:00:00Z'}})});
 await page.goto(server.url+'/?entry=pre&linkId='+link);await page.getByRole('button',{name:'사전진단 시작하기'}).click();
 const fixture=JSON.parse(fs.readFileSync('tests/snapshot/fixture.json','utf8')).db[0];
 await page.evaluate(async f=>{const {S}=await import('/shared/state.js');Object.assign(S.user,{reg:f.reg,goal:f.goal,expect:f.expect,done:f.done,pre:f.pre});goStep(5)},fixture);
 await expect(page.getByText('모든 문항에 응답하셨습니다!')).toBeVisible();
 await page.getByRole('button',{name:'응답 검토하기'}).click();await expect(page.locator('.rv').first()).toBeVisible();
 await page.locator('.rv-h button').nth(1).click();await expect(page.locator('#q-A3')).toBeVisible();await expect(page.locator('#q-A3 input')).not.toHaveValue('');
 await page.evaluate(()=>goStep(5));await expect(page.getByRole('button',{name:'바로 제출하기'})).toBeVisible();
 await page.evaluate(async()=>{const {S}=await import('/shared/state.js');S.user.reg.email='invalid'});
 await page.getByRole('button',{name:'바로 제출하기'}).click();await expect(page.locator('#q-EM')).toBeVisible();expect(submissions).toBe(0);
 await page.getByLabel('이메일').fill('fixture@example.invalid');await page.evaluate(()=>goStep(5));
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'바로 제출하기'}).click();
 await expect(page.getByRole('button',{name:'바로 제출하기'})).toBeDisabled();await expect(page.locator('#public-save')).toContainText('제출');
 await expect.poll(()=>submissions).toBe(1);release();await expect(page.getByText('제출 후에는 직접 수정할 수 없습니다.',{exact:false})).toBeVisible();
});
