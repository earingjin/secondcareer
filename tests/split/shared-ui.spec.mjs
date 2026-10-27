import {test,expect} from '@playwright/test';
import {resolveTarget,toUrl} from '../lib/target.mjs';

test('shared state identity and inline navigation across all roles',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(toUrl(resolveTarget()));
  const state=await page.evaluateHandle(()=>S);
  for(const [id,mode,view] of [['m-c','counselor','cns'],['m-a','admin','admin'],['m-m','client','clogin'],['m-p','participant','login']]){
    await page.click('#'+id);
    expect(await page.evaluate(s=>({same:S===s&&(!document.querySelector('script[type="module"]')||S===window.S),mode:S.mode,view:S.view}),state)).toEqual({same:true,mode,view});
    await expect(page.locator('#'+id)).toHaveClass(/\bon\b/);
    await page.evaluate(()=>{S.err='temporary';nav('form')});
    expect(await page.evaluate(()=>({view:S.view,err:S.err}))).toEqual({view:'form',err:''});
    await page.click('.brand');
    expect(await page.evaluate(()=>S.view)).toBe(view);
  }
  await page.evaluate(()=>{S.user=DB[0];setMode('participant')});
  expect(await page.evaluate(()=>S.view)).toBe('home');
  await page.evaluate(()=>{S.mgr={ent:ENT[0].id,n:'테스트 담당자'};setMode('client')});
  expect(await page.evaluate(()=>S.view)).toBe('cdash');
  expect(await page.evaluate(s=>S===s,state)).toBe(true);
  expect(errors).toEqual([]);
  await state.dispose();
});

test('role change cancels counselor edit before resetting UI and persists restored response',async({page})=>{
  await page.goto(toUrl(resolveTarget()));
  const state=await page.evaluateHandle(()=>S);
  const before=await page.evaluate(()=>{
    setMode('counselor');
    const p=DB.find(p=>full(p.pre));startEdit(p.id);
    const before=JSON.stringify(S.cedit.before),id=p.id;
    p.pre[0]=p.pre[0]===1?2:1;
    S.f={company:'temporary',q:'temporary',st:'temporary',page:3};S.created=['temporary'];S.bulk='temporary';S.berr='temporary';
    return {before,id};
  });
  await page.click('#m-a');
  const result=await page.evaluate(({before,id})=>({
    cancelled:S.cedit===null,restored:JSON.stringify(byId(id))===before,
    persisted:JSON.stringify(JSON.parse(localStorage.getItem('sp-demo-v5')).db.find(p=>p.id===id))===before,
    mode:S.mode,view:S.view,filters:S.f,created:S.created,bulk:S.bulk,berr:S.berr,user:S.user
  }),before);
  expect(result).toEqual({cancelled:true,restored:true,persisted:true,mode:'admin',view:'admin',filters:{company:'전체',q:'',st:'전체',page:1},created:[],bulk:'',berr:'',user:null});
  expect(await page.evaluate(s=>S===s,state)).toBe(true);
  await state.dispose();
});
