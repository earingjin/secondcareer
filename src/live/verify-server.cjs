// Run with --experimental-vm-modules. Read deployed Edge files as one JSON line
// on stdin; never write private server sources or credentials to this repository.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const assert=require('node:assert/strict'),zlib=require('node:zlib');
const {createServer}=require('node:http');
const {chromium}=require('@playwright/test');
const clone=x=>JSON.parse(JSON.stringify(x));

(async()=>{
  const files=await new Promise(resolve=>{let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>{s+=c;if(s.includes('\n')){process.stdin.pause();resolve(JSON.parse(s.slice(0,s.indexOf('\n'))))}})});
  const sources=Object.fromEntries(files.map(f=>[f.name,f.content]));
  for(const name of Object.keys(sources).filter(n=>n.endsWith('.js'))){
    assert.equal(sources[name],fs.readFileSync(path.join('src',name),'utf8'),'deployed source changed: '+name);
  }
  let handler,stored=null,history=[],ticks=0;
  const extraAssessments=[];
  const org='organization-fixture',participant='participant-fixture',counselor='counselor-fixture',owner='owner-fixture';
  const profiles=[{user_id:owner,organization_id:org,role:'participant',display_name:'Fixture Client'},{user_id:counselor,organization_id:org,role:'counselor',display_name:'Fixture Counselor'},{user_id:'unassigned',organization_id:org,role:'counselor',display_name:'Unassigned'}];
  const participants=[{id:participant,auth_user_id:owner,counselor_user_id:counselor,organization_id:org,display_name:'Fixture Client'}];
  const tables=()=>({user_profiles:profiles,participants,assessments:[...(stored?[stored]:[]),...extraAssessments],assessment_history:history});
  function from(name){
    let rows=clone(tables()[name]||[]);
    const q={select(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},in(k,vs){rows=rows.filter(r=>vs.includes(r[k]));return q},limit(n){rows=rows.slice(0,n);return q},order(){return q},maybeSingle:async()=>({data:rows[0]||null,error:null}),then(resolve,reject){return Promise.resolve({data:rows,error:null}).then(resolve,reject)}};return q;
  }
  const client={from,auth:{getUser:async token=>({data:{user:profiles.some(p=>p.user_id===token)?{id:token}:null},error:null})},rpc:async(_name,args)=>{
    if(stored&&stored.updated_at!==args.expected_updated_at)return {error:{code:'40001'}};
    const before=clone(stored);stored={id:'assessment-fixture',participant_id:participant,phase:'pre',status:args.operation==='draft'?'draft':'submitted',answers:clone(args.payload),result:clone(args.calculated),submitted_at:args.operation==='draft'?null:new Date().toISOString(),updated_at:new Date(Date.now()+(++ticks)).toISOString()};
    history.push({assessment_id:stored.id,action:args.operation,before_data:before?{answers:before.answers,result:before.result}:null,after_data:{answers:stored.answers,result:stored.result},created_at:stored.updated_at});
    return {data:{assessmentId:stored.id,status:stored.status,updatedAt:stored.updated_at},error:null};
  }};
  const context=vm.createContext({console,Request,Response,URL,TextEncoder,TextDecoder,Uint8Array,Uint32Array,crypto:require('node:crypto').webcrypto,Date,Math,Deno:{env:{get:()=> 'server-test-value'},serve:f=>{handler=f}}});
  const modules={};
  const npm=new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',()=>client)},{context,identifier:'supabase'});
  function moduleFor(name){return modules[name]||(modules[name]=new vm.SourceTextModule(sources[name],{context,identifier:name}))}
  const root=moduleFor('index.ts');
  await root.link((specifier,ref)=>specifier.startsWith('npm:')?npm:moduleFor(path.posix.normalize(path.posix.join(path.posix.dirname(ref.identifier),specifier))));
  await root.evaluate();assert.equal(typeof handler,'function');
  const engine=modules['js/05-engine.js'].namespace,config=modules['js/02-eval-config.js'].namespace,options=modules['js/03-options.js'].namespace;
  const golden=JSON.parse(zlib.gunzipSync(fs.readFileSync('tests/golden/data/compute-result.json.gz')));
  let count=0;
  for(const [key,expected] of Object.entries(golden.cases)){
    const [age,g,ai]=key.split('|'),rs=Array(config.AREA_COUNT).fill(config.RAW_MAX);rs[+ai]=config.RAW_MIN;
    const pre=rs.flatMap(s=>{const b=Math.floor(s/config.ITEMS_PER_AREA),r=s%config.ITEMS_PER_AREA;return Array.from({length:config.ITEMS_PER_AREA},(_,i)=>b+(i<r?1:0))});
    const p={pre,preDate:'2026-06-15',reg:age==='-'?{}:{birth:String(2026-Number(age))},goal:g==='-'?{}:{b13:[options.OPT['goal.b13'][+g],'__2순위__']}};
    const seq=golden.pickSeq[key],idx=seq.map(()=>0);let n=0;
    for(;;){let at=0;const result=engine.computeResult(p,()=>idx[at++]);delete result.at;assert.equal(JSON.stringify(result),expected[n++]);count++;let j=idx.length-1;while(j>=0&&++idx[j]>=seq[j]){idx[j]=0;j--}if(j<0)break}
    assert.equal(n,expected.length);
  }
  assert.equal(count,golden.total);console.log('PASS server computeResult golden cases:',count);
  const opts=options.OPT;
  const answers={reg:{a1:'동의',consent:true,name:'Fixture Client',gender:'남',birthDate:'1966-01-01',birth:'1966',phone:'010-0000-0000',email:'fixture@example.com',careers:[{co:'Fixture Company',title:'Fixture Title',task:'Fixture Task'}],industry:opts['reg.industry'][0],income:opts['reg.income'][0]},goal:{b11:opts['goal.b11'].slice(0,1),b12:opts['goal.b12'].slice(0,1),b13:opts['goal.b13'].slice(0,2),b14:opts['goal.b14'].slice(0,1),b15:'70',b16:'6'},pre:Array(config.ITEM_COUNT).fill(3),expect:{d32:opts['expect.d32'].slice(0,1),d33:opts['expect.d33'].slice(0,3),d34:opts['expect.d34'].slice(0,1),d35:opts['expect.d35'].slice(0,2),d36:opts['expect.d36'].slice(0,1)},done:{reg:true,goal:true,expect:true}};
  async function request(token,body,id){const r=await handler(new Request('https://fixture.invalid/'+(id?'?id='+encodeURIComponent(id):''),{method:body?'POST':'GET',headers:token?{authorization:'Bearer '+token}: {},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,data:await r.json()}}
  assert.equal((await request(null)).status,401);assert.equal((await request('expired')).status,401);
  assert.equal((await request(owner,{action:'draft',answers:{pre:answers.pre}})).status,400);
  assert.equal((await request(owner,{action:'edit',participantId:participant,answers})).status,403);
  assert.equal((await request(owner,null,participant)).status,403);
  assert.equal((await request('unassigned',null,participant)).status,403);
  const partial=clone(answers);partial.pre.fill(null);partial.reg.name='';
  assert.equal((await request(owner,{action:'draft',answers:partial})).status,200);
  assert.equal(stored.answers.reg.name,'');assert.equal(stored.result,null);
  assert.equal((await request(owner,{action:'submit',answers:partial,expectedUpdatedAt:stored.updated_at})).status,400);
  stored=null;history=[];
  const errors=[];
  const server=createServer((req,res)=>{const url=new URL(req.url,'http://localhost');const f=path.join('dist',url.pathname==='/'?'index.html':url.pathname);try{res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(f))}catch{res.statusCode=404;res.end()}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));
    let failDraft=false,expireRequests=false;
    await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
      const r=route.request(),u=new URL(r.url()),body=r.postData()?JSON.parse(r.postData()):null;
      if(u.pathname.endsWith('/secondcareer-login'))return route.fulfill({status:body.password==='fixture-pass'?200:401,json:body.password==='fixture-pass'?{access_token:body.loginId==='consult01'?counselor:owner,expires_at:Math.floor(Date.now()/1000)+600}:{error:'INVALID_CREDENTIALS'}});
      if(u.pathname.endsWith('/logout'))return route.fulfill({status:204});
      if(expireRequests)return route.fulfill({status:401,json:{error:'AUTH_INVALID'}});
      if(u.pathname.endsWith('/secondcareer-account'))return route.fulfill({status:404,json:{error:'NOT_FOUND'}});
      if(u.pathname==='/auth/v1/user')return route.fulfill({json:{id:r.headers().authorization?.replace('Bearer ',''),app_metadata:{}}});
      if(failDraft&&body?.action==='draft')return route.fulfill({status:503,json:{error:'SAVE_FAILED'}});
      const result=await request(r.headers().authorization?.replace('Bearer ',''),body,u.searchParams.get('id'));return route.fulfill({status:result.status,json:result.data});
    });
    const origin='http://127.0.0.1:'+server.address().port;
    await page.goto(origin);await page.waitForSelector('#lg-id');
    assert.equal(await page.locator('.seg').count(),0);
    async function login(id,pw='fixture-pass'){await page.fill('#lg-id',id);await page.fill('#lg-pw',pw);await page.click('button[type=submit]')}
    await login('client01','wrong-pass');await page.waitForFunction(()=>document.body.textContent.includes('아이디 또는 비밀번호'));
    await login('client01');await page.waitForSelector('#q-A1');
    await page.evaluate(()=>goStep(1));await page.fill('#q-A3 input','Actual Input Fixture');
    await page.click('button[onclick="retrySave()"]');await page.waitForFunction(()=>document.querySelector('#live-save')?.textContent.includes('임시저장 완료'));
    assert.equal(stored.answers.reg.name,'Actual Input Fixture');assert.ok(stored.answers.goal&&stored.answers.expect);
    await page.click('button[onclick="logout()"]');await page.waitForSelector('#lg-id');
    // Prepare only the mock backend with complete synthetic responses. No live
    // Supabase account or table receives these fixtures.
    stored.answers=clone(answers);
    await login('client01');await page.waitForSelector('#q-A1');await page.evaluate(()=>goStep(1));
    await page.fill('#q-A7 input','Edited From Survey');failDraft=true;
    await page.click('button[onclick="retrySave()"]');await page.waitForFunction(()=>document.querySelector('#live-save')?.textContent.includes('서버 처리 결과를 확인하지 못했습니다'));
    assert.equal(stored.answers.reg.careers[0].title,'Fixture Title');
    failDraft=false;await page.click('button[onclick="retrySave()"]');await page.waitForFunction(()=>document.querySelector('#live-save')?.textContent.includes('임시저장 완료'));
    assert.equal(stored.answers.reg.careers[0].title,'Edited From Survey');
    await page.evaluate(()=>goStep(5));await page.click('button[onclick="submitPre()"]');await page.waitForFunction(()=>document.body.textContent.includes('제출이 완료되었습니다'));
    assert.equal(stored.status,'submitted');assert.ok(stored.result);const fixed=JSON.stringify(stored.result);
    assert.equal((await request(owner,{action:'submit',answers})).status,200);assert.equal(JSON.stringify(stored.result),fixed);
    assert.equal((await request(owner,{action:'draft',answers})).status,409);
    assert.equal((await request(owner)).data.assessments[0].result,undefined);
    await page.click('button[onclick="logout()"]');await page.waitForSelector('#lg-id');
    // These rows exist only in this mock server. No demo records are imported
    // by the application or written to the real Supabase database.
    participants.push({id:'draft-fixture',auth_user_id:'draft-owner',counselor_user_id:counselor,organization_id:org,display_name:'Draft Fixture'},
      {id:'new-fixture',auth_user_id:'new-owner',counselor_user_id:counselor,organization_id:org,display_name:'New Fixture'},
      {id:'other-fixture',auth_user_id:'other-owner',counselor_user_id:'unassigned',organization_id:org,display_name:'Other Counselor Fixture'});
    const draftAnswers=clone(answers);draftAnswers.reg.name='Draft Fixture';draftAnswers.reg.careers[0].co='Draft Company';
    extraAssessments.push({id:'draft-assessment',participant_id:'draft-fixture',phase:'pre',status:'draft',answers:draftAnswers,result:null,updated_at:new Date().toISOString(),submitted_at:null});
    await login('consult01');await page.waitForSelector('button[onclick^="openRes"]');
    async function counts(total,completed,incomplete){
      assert.equal(await page.locator('[data-kpi="total"] b').textContent(),String(total));
      assert.equal(await page.locator('[data-kpi="completed"] b').textContent(),String(completed));
      assert.equal(await page.locator('[data-kpi="incomplete"] b').textContent(),String(incomplete));
      assert.equal(await page.locator('#plist tbody tr[data-participant]').count(),total);
      assert.equal(completed+incomplete,total);
    }
    await counts(3,1,2);assert.equal(await page.evaluate(()=>window.scrollY),0);assert.ok((await page.locator('#plist').textContent()).includes('Draft Company'));
    assert.ok(!(await page.locator('#plist').textContent()).includes('Other Counselor Fixture'));
    await page.fill('#cns-name','  fIxTuRe ClIeNt  ');await page.locator('#plist button[type="submit"]').click();await counts(1,1,0);
    await page.selectOption('#cns-status','draft');await counts(0,0,0);
    await page.click('button[onclick="filterCounselor(true)"]');await counts(3,1,2);
    for(const [status,total,completed,incomplete] of [['draft',1,0,1],['new',1,0,1],['incomplete',2,0,2],['submitted',1,1,0]]){
      await page.selectOption('#cns-status',status);await counts(total,completed,incomplete);
    }
    await page.click('button[onclick="filterCounselor(true)"]');await page.fill('#cns-name','Other Counselor Fixture');
    await page.locator('#plist button[type="submit"]').click();await counts(0,0,0);
    await page.click('button[onclick="filterCounselor(true)"]');
    assert.equal(await page.locator('#plist button[onclick^="openRes"]').count(),1);
    console.log('PASS counselor KPI/list consistency, submitted-only completion, names, companies, search, every status filter and assigned-only scope');
    await page.screenshot({path:'test-results/counselor-list.png',fullPage:true});
    await page.click('button[onclick^="openRes"]');await page.waitForSelector('.sheet');
    assert.equal(await page.locator('.sheet').count(),5);assert.equal(await page.locator('.editpanel').count(),1);
    await page.screenshot({path:'test-results/live-report.png',fullPage:true});
    const pdf=await page.pdf({path:'test-results/live-report.pdf',preferCSSPageSize:true,printBackground:true});assert.ok(pdf.length>10000);
    const pages=(pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;assert.equal(pages,5);console.log('PASS browser PDF: 5 A4 pages');
    await page.click('button[onclick^="startEdit"]');await page.evaluate(()=>goStep(1));await page.waitForSelector('#q-A3');
    await page.fill('#q-A3 input','Cancelled Edit');await page.evaluate(()=>goStep(5));await page.click('button[onclick="cancelEdit()"]');assert.equal(stored.answers.reg.name,'Fixture Client');
    await page.click('button[onclick^="startEdit"]');await page.evaluate(()=>goStep(1));await page.fill('#q-A3 input','Abandoned Edit');
    await page.evaluate(()=>goHome());await counts(3,1,2);
    await page.click('button[onclick^="openRes"]');await page.waitForSelector('.sheet');
    assert.ok((await page.locator('.sheet').first().textContent()).includes('Fixture Client'));
    await page.click('button[onclick^="startEdit"]');await page.evaluate(()=>goStep(1));await page.waitForSelector('#q-A3');await page.fill('#q-A3 input','Counselor Edit');
    await page.evaluate(()=>goStep(3));await page.locator('.scale.lk').first().locator('button').first().click();
    await page.evaluate(()=>goStep(5));await page.click('button[onclick="saveEdit()"]');await page.waitForFunction(()=>!!document.querySelector('.sheet')&&!document.querySelector('#q-A3'));
    assert.equal(stored.answers.reg.name,'Counselor Edit');assert.equal(stored.result.comment,JSON.parse(fixed).comment);assert.equal(JSON.stringify(stored.result.kw),JSON.stringify(JSON.parse(fixed).kw));
    assert.ok(await page.locator('.editpanel').textContent().then(s=>s.includes('Counselor Edit')));
    assert.equal(stored.result.raw[0],JSON.parse(fixed).raw[0]-2);
    assert.deepEqual(stored.result.raw.slice(1),JSON.parse(fixed).raw.slice(1));
    assert.equal(history.filter(h=>h.action==='edit').length,1);
    assert.equal(history.find(h=>h.action==='edit').after_data.answers.pre[0],1);
    const last=JSON.stringify(stored.result),edits=history.filter(h=>h.action==='edit').length;
    await page.click('button[onclick^="startEdit"]');await page.evaluate(()=>goStep(1));await page.waitForSelector('#q-A3');await page.evaluate(()=>goStep(5));await page.click('button[onclick="saveEdit()"]');await page.waitForSelector('.sheet');
    assert.equal(JSON.stringify(stored.result),last);assert.equal(history.filter(h=>h.action==='edit').length,edits);
    assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length,engine:typeof window.computeResult,db:typeof window.DB,state:typeof window.S})),{local:0,session:0,engine:'undefined',db:'undefined',state:'undefined'});
    expireRequests=true;await page.evaluate(()=>nav('cns'));await page.click('button[onclick="refresh()"]');await page.waitForSelector('#lg-id');assert.equal(await page.locator('.sheet').count(),0);
    assert.deepEqual(errors,[]);console.log('PASS live browser mock integration: login failure/success, full draft, save failure/retry, submit, assigned counselor, cancel/edit/unchanged save, memory-only session, expired session cleanup');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
