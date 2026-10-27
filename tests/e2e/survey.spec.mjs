import {test,expect} from '@playwright/test';
import {resolveTarget,toUrl} from '../lib/target.mjs';

test('survey inputs, selection limits, validation, submission, post survey and counselor editing',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(toUrl(resolveTarget()));
  const probe=await page.evaluateHandle(()=>{
    const p=emptyP({id:'99110022',company:ENT[0].name,counselor:ENT[0].consultants[0].code,status:'draft',
      reg:{a1:'동의',consent:true,name:'설문테스트',gender:'남',birthDate:'1966-01-01',birth:'1966',phone:'010-0000-0000',email:'survey@example.com',careers:[{co:'테스트',title:'테스트',task:'테스트'}],industry:OPT['reg.industry'][0],income:OPT['reg.income'][0]},
      goal:{b11:[OPT['goal.b11'][0]],b12:[OPT['goal.b12'][0]],b13:OPT['goal.b13'].slice(0,2),b14:[OPT['goal.b14'][0]],b15:'70',b16:'6'},
      pre:Array(FACTORS.length).fill(3),expect:{d32:OPT['expect.d32'].slice(0,1),d33:OPT['expect.d33'].slice(0,3),d34:OPT['expect.d34'].slice(0,1),d35:OPT['expect.d35'].slice(0,2),d36:OPT['expect.d36'].slice(0,1)},done:{reg:true,goal:true,expect:true}});
    DB.push(p);S.user=p;S.mode='participant';S.mode2='pre';S.step=1;nav('wizard');
    const probe={writes:0,state:S};const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(...args){probe.writes++;return original.apply(this,args)};
    return probe;
  });
  await page.fill('#q-A3 input','');
  await page.getByRole('button',{name:'다음 · 경력목표'}).click();
  expect(await page.evaluate(()=>S.step)).toBe(1);
  await expect(page.locator('#q-A3')).toContainText('성함을 입력해 주세요');
  await page.fill('#q-A3 input','수정테스트');await page.fill('#q-A7 input','수정직책');
  await page.fill('#q-A5 input','19700102');
  expect(await page.evaluate(()=>[S.user.reg.name,S.user.reg.careers[0].title,S.user.reg.birthDate,S.user.reg.birth])).toEqual(['수정테스트','수정직책','1970-01-02','1970']);
  await page.getByRole('button',{name:'다음 · 경력목표'}).click();
  await page.locator('#q-B11 .chip').nth(1).click();
  expect(await page.evaluate(()=>S.user.goal.b11)).toEqual(await page.evaluate(()=>[OPT['goal.b11'][1]]));
  const writes=await page.evaluate(p=>p.writes,probe);
  await page.locator('#q-B13 .chip').nth(2).click();
  expect(await page.evaluate(p=>p.writes,probe)).toBe(writes);
  await expect(page.locator('#toast')).toHaveText('최대 2개까지 선택할 수 있어요');
  await page.locator('#q-B13 .chip').nth(0).click();await page.locator('#q-B13 .chip').nth(2).click();
  expect(await page.evaluate(()=>S.user.goal.b13)).toEqual(await page.evaluate(()=>[OPT['goal.b13'][1],OPT['goal.b13'][2]]));
  await page.evaluate(()=>goStep(3));
  await page.locator('#q-C17 .scale button').nth(4).click();
  expect(await page.evaluate(()=>S.user.pre[0])).toBe(5);
  await page.evaluate(()=>goStep(5));
  await page.getByRole('button',{name:'최종 제출'}).click();
  expect(await page.evaluate(()=>({status:S.user.status,view:S.view,hasResult:!!S.user.result}))).toEqual({status:'submitted',view:'home',hasResult:true});
  await page.getByRole('button',{name:'사후 진단 시작'}).click();
  expect(await page.evaluate(()=>S.mode2)).toBe('post');
  await page.locator('.scale button').first().click();
  expect(await page.evaluate(()=>[S.user.post[0],S.user.pre[0]])).toEqual([1,5]);
  await page.evaluate(()=>{S.mode='counselor';S.mode2='pre';startEdit(S.user.id);goStep(1)});
  await expect(page.locator('.editbar')).toContainText('상담사 수정 모드');
  await page.fill('#q-A3 input','상담수정테스트');
  expect(await page.evaluate(()=>S.user.reg.name)).toBe('상담수정테스트');
  expect(await page.evaluate(p=>p.state===S,probe)).toBe(true);
  expect(errors).toEqual([]);
  await probe.dispose();
});
