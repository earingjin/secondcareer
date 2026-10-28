import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolveTarget,toUrl} from '../lib/target.mjs';

// The repository uses CommonJS for .js files; load the standalone ESM config as an ES module.
const configSource=await readFile(new URL('../../src/js/02-eval-config.js',import.meta.url));
const {ITEMS_PER_AREA}=await import('data:text/javascript;base64,'+configSource.toString('base64'));

test('counselor edit: cancel, unchanged save, validation, history and Assessment copy',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(toUrl(resolveTarget()));
  const probe=await page.evaluateHandle(()=>{
    const p=DB.find(p=>full(p.pre)&&missing(p).length===0);
    S.mode='counselor';S.cc=p.counselor;S.user=null;
    S.res={id:p.id,role:'c'};S.from='cns';nav('result');
    return {id:p.id,before:JSON.stringify(p),result:p.result,history:JSON.stringify(p.history||[]),res:S.res};
  });
  const edit=()=>page.getByRole('button',{name:'응답 수정 (상담사)'}).click();
  const review=()=>page.evaluate(()=>goStep(5));
  const save=()=>page.getByRole('button',{name:'수정 저장·재계산'}).click();

  await edit();
  expect(await page.evaluate(p=>S.user===byId(p.id)&&S.cedit.res===p.res&&S.step===5,probe)).toBe(true);
  await page.evaluate(()=>goStep(1));
  await page.fill('#q-A3 input','취소할 이름');
  await review();await page.getByRole('button',{name:'수정 취소'}).click();
  expect(await page.evaluate(p=>({restored:JSON.stringify(byId(p.id))===p.before,persisted:JSON.stringify(JSON.parse(localStorage.getItem('sp-demo-v5')).db.find(x=>x.id===p.id))===p.before,view:S.view,user:S.user,edit:S.cedit,res:S.res===p.res}),probe)).toEqual({restored:true,persisted:true,view:'result',user:null,edit:null,res:true});
  await expect(page.locator('#toast')).toHaveText('수정을 취소했습니다');

  // Cancel restores a cloned participant; keep the new result reference for the no-op check.
  await page.evaluate(p=>{p.result=byId(p.id).result},probe);
  await edit();await save();
  expect(await page.evaluate(p=>({sameResult:byId(p.id).result===p.result,sameHistory:JSON.stringify(byId(p.id).history||[])===p.history,view:S.view}),probe)).toEqual({sameResult:true,sameHistory:true,view:'result'});
  await expect(page.locator('#toast')).toHaveText('바뀐 응답이 없습니다');

  await edit();await page.evaluate(()=>goStep(1));await page.fill('#q-A3 input','');
  await review();
  const persisted=await page.evaluate(()=>localStorage.getItem('sp-demo-v5'));
  await save();
  expect(await page.evaluate(()=>({view:S.view,editing:!!S.cedit,missing:missing(S.user).map(x=>x.code),showMiss:S.showMiss}))).toEqual({view:'wizard',editing:true,missing:['A3'],showMiss:{0:1,1:1,2:1,3:1,4:1}});
  expect(await page.evaluate(()=>localStorage.getItem('sp-demo-v5'))).toBe(persisted);
  await expect(page.locator('#toast')).toHaveText('누락된 항목이 있어 저장할 수 없습니다');
  await page.evaluate(()=>goStep(1));await page.fill('#q-A3 input','첫 수정 이름');
  await page.evaluate(()=>goStep(3));
  const value=await page.evaluate(()=>S.user.pre[0]===1?5:1);
  await page.locator('#q-C17 .scale button').nth(value-1).click();
  await review();await save();
  await expect(page.locator('#toast')).toHaveText('2개 문항을 수정하고 결과를 다시 계산했습니다');
  const first=await page.evaluate(({p,itemsPerArea})=>{
    const x=byId(p.id),h=x.history.at(-1);
    return {codes:h.changes.map(c=>c.code),name:x.reg.name,raw:x.result.raw[0],sum:x.pre.slice(0,itemsPerArea).reduce((a,b)=>a+b,0),changed:h.resultChanged,by:h.by,expectedBy:COUNSELORS[S.cc].n+' 상담사',updated:x.updatedAt,at:h.at,persisted:JSON.stringify(JSON.parse(localStorage.getItem('sp-demo-v5')).db.find(x=>x.id===p.id))===JSON.stringify(x)};
  },{p:probe,itemsPerArea:ITEMS_PER_AREA});
  expect(first.codes).toEqual(['A3','C17']);expect(first.name).toBe('첫 수정 이름');
  expect(first.raw).toBe(first.sum);expect(first.changed).toBe(true);expect(first.by).toBe(first.expectedBy);
  expect(first.updated).toMatch(/^\d{4}-\d\d-\d\dT/);expect(first.at).toMatch(/^\d{4}-\d\d-\d\dT/);expect(first.persisted).toBe(true);
  await expect(page.locator('.editpanel')).toContainText('결과 재계산됨');

  await edit();await page.evaluate(()=>goStep(1));await page.fill('#q-A3 input','최신 수정 이름');
  await review();await save();
  const panel=page.locator('.editpanel');
  await expect(panel).toContainText('변경 이력 2건');
  await expect(panel.locator('li').first()).toContainText('첫 수정 이름 → 최신 수정 이름');
  await expect(panel.locator('li').nth(1)).toContainText('문항 17');
  await expect(panel).toContainText(await page.evaluate(()=>'평가 버전 '+EVAL_VERSION));
  await panel.locator('summary').click();
  const json=await page.evaluate(p=>JSON.stringify(toAssessment(byId(p.id)),null,2),probe);
  expect(await panel.locator('pre').textContent()).toBe(json);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedAssessment=text}}}));
  await panel.getByRole('button',{name:'JSON 복사'}).click();
  expect(await page.evaluate(()=>window.__copiedAssessment)).toBe(json);
  await expect(page.locator('#toast')).toHaveText('연동 데이터를 복사했습니다');
  await page.emulateMedia({media:'print'});await expect(panel).toBeHidden();
  expect(errors).toEqual([]);await probe.dispose();
});
