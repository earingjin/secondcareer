import {test,expect} from '@playwright/test';
import {resolveTarget,toUrl} from '../lib/target.mjs';

test('resultOf: incomplete/cache/new/key change preserve identity, persistence order and random/date calls',async({page})=>{
  await page.goto(toUrl(resolveTarget()));
  const checks=await page.evaluate(()=>{
    const original={db:DB,random:crypto.getRandomValues,date:Date,setItem:Storage.prototype.setItem};
    let events=[],saved=[];
    crypto.getRandomValues=function(a){events.push('random');a[0]=0;return a};
    window.Date=class extends original.date{constructor(...args){super(...(args.length?args:['2026-10-26T03:00:00Z']));if(!args.length)events.push('date')}};
    Storage.prototype.setItem=function(key,value){events.push('save');saved.push(JSON.parse(value).db[0].result)};
    const checks=[];
    const check=(name,ok)=>checks.push({name,ok});
    try{
      for(const birth of ['', '1966'])for(const goal of [[],[OPT['goal.b13'][0]]])for(const preDate of ['', '2026-10-22']){
        const p={pre:Array(FACTORS.length).fill(3),reg:{birth},goal:{b13:goal},preDate};
        DB=[p];events=[];saved=[];
        const expected=computeResult(p),trace=events.slice();
        check('random count',trace.filter(x=>x==='random').length===2+Number(!!birth)+Number(!!goal.length));
        check('date count',trace.filter(x=>x==='date').length===(preDate?1:2));
        events=[];
        const result=resultOf(p);
        check('new result and assigned identity',result===p.result&&JSON.stringify(result)===JSON.stringify(expected));
        check('save once after calculation with new result',JSON.stringify(events)===JSON.stringify([...trace,'save'])&&saved.length===1&&JSON.stringify(saved[0])===JSON.stringify(result));
        events=[];check('cache identity',resultOf(p)===result&&events.length===0);
        p.pre[0]=0;events=[];check('incomplete preserves old result',resultOf(p)===null&&p.result===result&&events.length===0);
        p.pre[0]=4;events=[];saved=[];
        const next=resultOf(p);
        check('key change calculates once and saves assigned result',next===p.result&&next!==result&&events.filter(x=>x==='save').length===1&&events.at(-1)==='save'&&JSON.stringify(saved[0])===JSON.stringify(next));
        check('key change preserves random/date trace',JSON.stringify(events.slice(0,-1))===JSON.stringify(trace));
      }
    }finally{DB=original.db;crypto.getRandomValues=original.random;window.Date=original.date;Storage.prototype.setItem=original.setItem}
    return checks;
  });
  expect(checks.filter(c=>!c.ok)).toEqual([]);
});
