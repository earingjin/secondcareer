import {test,expect} from '@playwright/test';
import {resolveTarget,toUrl} from '../lib/target.mjs';

test('recomputeResult preserves selection references, counselor snapshot and event order',async({page})=>{
  await page.goto(toUrl(resolveTarget()));
  const checks=await page.evaluate(()=>{
    const original={counselors:COUNSELORS,random:crypto.getRandomValues,date:Date};
    const checks=[],check=(name,ok)=>checks.push({name,ok});
    let events=[];
    crypto.getRandomValues=function(a){events.push('random:'+a.length);a[0]=0;return a};
    window.Date=class extends original.date{constructor(...args){super(...(args.length?args:['2026-10-26T03:00:00Z']));if(!args.length)events.push('date')}};
    try{
      const goal=OPT['goal.b13'][0],otherGoal=OPT['goal.b13'][3];
      const counselor={code:'stored-code',n:'상담사',nested:{x:1}};
      COUNSELORS=new Proxy({'07':counselor},{get(o,k){events.push('counselor');return o[k]}});
      const make=()=>({pre:Array(FACTORS.length).fill(3),preDate:'2026-10-22',reg:{birth:'1966'},goal:{b13:[goal]},counselor:'07'});
      const base=make();events=[];const first=recomputeResult(base,null);
      check('initial calculation before snapshot',JSON.stringify(events)===JSON.stringify(['random:1','random:1','random:1','random:1','date','counselor','counselor','date']));
      check('initial snapshot',first.snapshot.counselor.code==='stored-code'&&first.snapshot.counselor!==counselor&&first.snapshot.counselor.nested===counselor.nested&&first.snapshot.generatedAt==='2026-10-26T03:00:00.000Z'&&first.evaluationVersion===EVAL_VERSION);
      const old={...first,comment:'old-comment',kw:{age:{...first.kw.age,marker:'age'},goal:{...first.kw.goal,marker:'goal'},pro:{...first.kw.pro,marker:'pro'}}};
      for(const [name,change] of [
        ['same',()=>{}],['area',p=>{p.pre[3]=1}],['age',p=>{p.reg.birth='1986'}],['goal',p=>{p.goal.b13=[otherGoal]}],
        ['missing counselor',p=>{p.counselor='missing'}]
      ]){
        const p=make();change(p);events=[];const before=JSON.stringify(old),n=recomputeResult(p,old);
        check(name+' old unchanged',JSON.stringify(old)===before);
        check(name+' calculation and snapshot order',JSON.stringify(events)===JSON.stringify(['random:1','random:1','random:1','random:1','date','counselor',...(name==='missing counselor'?[]:['counselor']),'date']));
        check(name+' comment',name==='area'?n.comment!==old.comment:n.comment===old.comment);
        check(name+' age identity',name==='age'?n.kw.age!==old.kw.age:n.kw.age===old.kw.age);
        check(name+' goal identity',name==='goal'?n.kw.goal!==old.kw.goal:n.kw.goal===old.kw.goal);
        check(name+' professional identity',n.kw.pro===old.kw.pro);
        check(name+' counselor',name==='missing counselor'?n.snapshot.counselor===null:n.snapshot.counselor.code==='stored-code');
      }
      const p=make(),before=JSON.parse(JSON.stringify(p));p.pre[0]=4;p.result=old;events=[];
      const count=applyCounselorEdit(p,before,'tester');
      check('edit history',count===1&&p.history.length===1&&p.history[0].changes.length===1&&p.history[0].by==='tester'&&p.result.snapshot.generatedAt==='2026-10-26T03:00:00.000Z');
      check('edit dates after snapshot',JSON.stringify(events.slice(-3))===JSON.stringify(['date','date','date']));
    }finally{COUNSELORS=original.counselors;crypto.getRandomValues=original.random;window.Date=original.date}
    return checks;
  });
  expect(checks.filter(c=>!c.ok)).toEqual([]);
});
