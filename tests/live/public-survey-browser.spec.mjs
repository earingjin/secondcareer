import {test,expect} from '@playwright/test';
import {serve} from '../tools/serve-static.mjs';
import fs from 'node:fs';
let server;
test.beforeAll(async()=>{server=await serve('src')});
test.afterAll(async()=>server.close());
test.beforeEach(async({page})=>{await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"if(new URLSearchParams(location.search).get('entry')==='pre') import('./live/public-survey.js'); else import('./live/app.js');"}));});
const link='11111111-1111-4111-8111-111111111111';
test('anonymous survey saves, resumes and submits through mocked HTTP',async({page})=>{
 let saved=null,status='draft',version=0;const actions=[];
 await page.route('**/functions/v1/secondcareer-public-assessment',async route=>{
  const body=route.request().postDataJSON();actions.push(body.action);
  if(body.action==='draft'){saved=body.answers;version++}if(body.action==='submit'){saved=body.answers;version++;status='submitted'}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({intakeId:body.intakeId,status,version,expiresAt:'2099-01-01T00:00:00Z',...(body.action==='read'&&saved?{answers:saved}:{}),...(status==='submitted'?{submittedAt:'2026-11-23T00:00:00Z'}:{})})});
 });
 await page.goto(server.url+'/?entry=pre&linkId='+link);
 await expect(page.locator('#q-A1')).toBeVisible();await expect(page.locator('#q-A2')).toHaveCount(0);
 await page.getByRole('radio',{name:'동의',exact:true}).click();await expect.poll(()=>actions.includes('draft')).toBeTruthy();
 await page.reload();await expect(page.locator('#q-A1')).toBeVisible();expect(actions).toContain('read');
 const fixture=JSON.parse(fs.readFileSync('tests/snapshot/fixture.json','utf8')).db[0];
 await page.evaluate(async f=>{const {S}=await import('/shared/state.js');Object.assign(S.user,{reg:f.reg,goal:f.goal,expect:f.expect,done:f.done,pre:f.pre});window.goStep(5)},fixture);
 await page.getByRole('button',{name:'최종 제출'}).click();await expect(page.getByText('설문 제출이 완료되었습니다.',{exact:false}).first()).toBeVisible();expect(actions).toContain('submit');
 await page.reload();await expect(page.getByText('설문 제출이 완료되었습니다.',{exact:false}).first()).toBeVisible();
});
test('invalid link is rejected without network',async({page})=>{await page.goto(server.url+'/?entry=pre');await expect(page.getByRole('alert')).toContainText('링크');});
test('mobile advances from consent directly to basic information',async({page})=>{
 await page.setViewportSize({width:375,height:800});
 await page.route('**/functions/v1/secondcareer-public-assessment',async route=>{const b=route.request().postDataJSON();await route.fulfill({json:{intakeId:b.intakeId,status:'draft',version:b.action==='draft'?1:0,expiresAt:'2099-01-01T00:00:00Z'}})});
 await page.goto(server.url+'/?entry=pre&linkId='+link);await page.getByRole('radio',{name:'동의',exact:true}).click();
 await page.getByRole('button',{name:'다음',exact:true}).last().click();await expect(page.locator('#q-A3')).toBeVisible();await expect(page.locator('#q-A2')).toHaveCount(0);
});
test('draft conflict does not show saved and retains the edited screen',async({page})=>{
 await page.route('**/functions/v1/secondcareer-public-assessment',async route=>{const b=route.request().postDataJSON();if(b.action==='draft')return route.fulfill({status:409,json:{error:'CONFLICT'}});return route.fulfill({json:{intakeId:b.intakeId,status:'draft',version:0,expiresAt:'2099-01-01T00:00:00Z'}})});
 await page.goto(server.url+'/?entry=pre&linkId='+link);await page.getByRole('radio',{name:'동의',exact:true}).click();
 await expect(page.locator('#public-save')).toContainText('다른 화면에서 응답이 변경');await expect(page.locator('#q-A1')).toBeVisible();
});
test('unknown submit response is confirmed with status',async({page})=>{
 let submitted=false;
 await page.route('**/functions/v1/secondcareer-public-assessment',async route=>{const b=route.request().postDataJSON();if(b.action==='submit'){submitted=true;return route.abort('failed')};return route.fulfill({json:{intakeId:b.intakeId,status:submitted?'submitted':'draft',version:submitted?1:0,expiresAt:'2099-01-01T00:00:00Z',...(submitted?{submittedAt:'2026-11-23T00:00:00Z'}:{})}})});
 await page.goto(server.url+'/?entry=pre&linkId='+link);await page.getByRole('radio',{name:'동의',exact:true}).click();
 const fixture=JSON.parse(fs.readFileSync('tests/snapshot/fixture.json','utf8')).db[0];
 await page.evaluate(async f=>{const {S}=await import('/shared/state.js');Object.assign(S.user,{reg:f.reg,goal:f.goal,expect:f.expect,done:f.done,pre:f.pre});window.goStep(5)},fixture);
 await page.getByRole('button',{name:'최종 제출'}).click();await expect(page.getByText('설문 제출이 완료되었습니다.',{exact:false}).first()).toBeVisible();
});
