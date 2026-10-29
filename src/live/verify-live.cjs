// Real Supabase + production build, read-only. No answer writes or PII artifacts.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createServer}=require('node:http'),{chromium}=require('@playwright/test');
const {loadEnv}=require('vite');
let server,browser,phase='configuration';
(async()=>{
  const env=loadEnv('development',process.cwd(),'SECONDCAREER_');
  const passwordFor=role=>process.env[`SECONDCAREER_${role}_PASSWORD`]||env[`SECONDCAREER_${role}_PASSWORD`];
  assert.ok(passwordFor('CLIENT')&&passwordFor('COUNSELOR'));
  const root=path.resolve('dist');
  server=createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)){res.statusCode=403;res.end();return}
    try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}
    catch{res.statusCode=404;res.end()}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch();
  for(const [id,role] of [['client01','CLIENT'],['consult01','COUNSELOR']]){
    const context=await browser.newContext({viewport:{width:role==='CLIENT'?375:1100,height:900}});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',()=>errors.push('pageerror'));
    // Guard against accidental production answer mutations in this verifier.
    await page.route('**/functions/v1/secondcareer-assessment**',route=>route.request().method()==='POST'?route.abort():route.continue());
    try{
      phase=role+' UI login';await page.goto('http://127.0.0.1:'+server.address().port);
      await page.locator('#lg-id').fill(id);await page.locator('#lg-pw').fill(passwordFor(role));
      await page.locator('button[type=submit]').click();
      if(role==='CLIENT'){
        await page.waitForFunction(()=>!!document.querySelector('#live-save')||document.querySelector('#app h2')?.textContent.includes('제출이 완료되었습니다'),{},{timeout:30000});
        console.log('PASS real participant UI login at mobile width');
        const submitted=await page.locator('#app h2').evaluateAll(es=>es.some(e=>e.textContent.includes('제출이 완료되었습니다')));
        console.log(submitted?'UNVERIFIED new draft/submit: existing assessment is submitted; preserved':'UNVERIFIED draft/submit: write validation requires a designated disposable test account');
      }else{
        await page.waitForSelector('#plist',{timeout:30000});
        console.log('PASS real counselor UI login and assigned participant list');
        phase='real submitted report';const reports=page.locator('#plist button[onclick^="openRes"]');
        if(!await reports.count()){console.log('UNVERIFIED report/print: no assigned submitted assessment');continue}
        await reports.first().click();await page.waitForSelector('.sheet',{timeout:30000});
        assert.equal(await page.locator('.sheet').count(),5);
        console.log('PASS real submitted report: five sheets');
        phase='print handler and PDF';
        await page.emulateMedia({media:'print'});
        await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
        const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});
        await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
        const text=pdf.toString('latin1'),count=(text.match(/\/Type \/Page\b/g)||[]).length;
        const box=/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
        assert.equal(count,5);assert.ok(box&&Math.abs(+box[1]-595)<2&&Math.abs(+box[2]-842)<2);
        console.log('PASS real report PDF: five A4 pages, memory only; physical print and visual clipping not verified');
      }
      phase=role+' session storage';
      assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length,engine:typeof window.computeResult,db:typeof window.DB})),{local:0,session:0,engine:'undefined',db:'undefined'});
      assert.deepEqual(errors,[]);
    }finally{
      // Use the real app logout without exposing its in-memory token.
      await page.evaluate(()=>window.logout?.()).catch(()=>{});
      await context.close();
    }
  }
})().catch(()=>{console.error('FAIL',phase,'expected response or UI condition was not met');process.exitCode=1})
  .finally(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve))});
