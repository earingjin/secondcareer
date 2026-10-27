import {test,expect} from '@playwright/test';
import {resolveTarget,toUrl} from '../lib/target.mjs';

test('copyText preserves clipboard, fallback, failure messages and toast timers',async({page})=>{
  await page.goto(toUrl(resolveTarget()));
  const checks=await page.evaluate(async()=>{
    const clip=Object.getOwnPropertyDescriptor(navigator,'clipboard');
    const original={setTimeout,clearTimeout,execCommand:document.execCommand};
    const checks=[],timers=[],cleared=[],copies=[];
    const check=(name,ok)=>checks.push({name,ok});
    window.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length};
    window.clearTimeout=id=>cleared.push(id);
    const setClip=value=>Object.defineProperty(navigator,'clipboard',{configurable:true,value});
    try{
      setClip({writeText:t=>{copies.push(t);return Promise.resolve()}});
      copyText('clipboard text','custom message');await Promise.resolve();
      const el=$('#toast');
      check('clipboard and custom toast',copies[0]==='clipboard text'&&el.textContent==='custom message'&&el.classList.contains('on'));
      check('toast delay',timers[0].ms===2400);
      copyText('again');await Promise.resolve();
      check('default toast and previous timer cancelled',el.textContent==='복사했습니다'&&cleared.at(-1)===1);
      timers.at(-1).fn();check('toast disappears',!el.classList.contains('on'));
      const fallback=[];
      document.execCommand=cmd=>{const ta=document.querySelector('textarea');fallback.push({cmd,text:ta.value,position:ta.style.position,opacity:ta.style.opacity,selected:document.activeElement===ta});return true};
      for(const [name,api] of [['absent',undefined],['rejected',{writeText:()=>Promise.reject(new Error('denied'))}],['throws',{writeText:()=>{throw new Error('denied')}}]]){
        setClip(api);const before=document.querySelectorAll('textarea').length;
        copyText(name);await Promise.resolve();
        const f=fallback.at(-1);
        check(name+' fallback',f.cmd==='copy'&&f.text===name&&f.position==='fixed'&&f.opacity==='0'&&f.selected&&document.querySelectorAll('textarea').length===before&&el.textContent==='복사했습니다');
      }
      setClip(undefined);document.execCommand=()=>{throw new Error('failed')};copyText('failure');
      check('fallback failure message',el.textContent==='복사하지 못했습니다. 직접 선택해 복사해 주세요');
      check('all toast delays',timers.every(t=>t.ms===2400));
    }finally{
      window.setTimeout=original.setTimeout;window.clearTimeout=original.clearTimeout;document.execCommand=original.execCommand;
      if(clip)Object.defineProperty(navigator,'clipboard',clip);else delete navigator.clipboard;
    }
    return checks;
  });
  expect(checks.filter(c=>!c.ok)).toEqual([]);
});
