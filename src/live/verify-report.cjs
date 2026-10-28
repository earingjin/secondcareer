// Read the user's submitted assessment through the real counselor UI. Never
// edit answers, emit credentials, or write reports outside ignored test output.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {createServer}=require('node:http'),path=require('node:path');
const {chromium}=require('@playwright/test');
const {loadEnv}=require('vite');
let phase='configuration',browser,server;
(async()=>{
  const env=loadEnv('development',process.cwd(),'SECONDCAREER_');
  const password=process.env.SECONDCAREER_COUNSELOR_PASSWORD||env.SECONDCAREER_COUNSELOR_PASSWORD;
  assert.ok(password,'credential configured');
  server=createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),file=path.join('dist',u.pathname==='/'?'index.html':u.pathname);try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(file))}catch{res.statusCode=404;res.end()}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch();const page=await browser.newPage();
  phase='counselor login';await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForSelector('#lg-id');
  await page.evaluate(({password})=>{document.querySelector('#lg-id').value='consult01';document.querySelector('#lg-pw').value=password},{password});
  await page.click('button[type=submit]');await page.waitForSelector('button[onclick^="openRes"]');
  console.log('PASS real counselor login and submitted participant access');
  phase='counselor KPIs and filters';
  const total=await page.locator('#plist tbody tr[data-participant]').count();
  const completed=await page.locator('#plist tbody .s-pre').count();
  const expectCounts=async(n,done)=>{
    assert.equal(await page.locator('[data-kpi="total"] b').textContent(),String(n));
    assert.equal(await page.locator('[data-kpi="completed"] b').textContent(),String(done));
    assert.equal(await page.locator('[data-kpi="incomplete"] b').textContent(),String(n-done));
    assert.equal(await page.locator('#plist tbody tr[data-participant]').count(),n);
  };
  await expectCounts(total,completed);
  await page.selectOption('#cns-status','submitted');await expectCounts(completed,completed);
  await page.selectOption('#cns-status','incomplete');await expectCounts(total-completed,0);
  await page.click('button[onclick="filterCounselor(true)"]');
  const firstName=await page.locator('#plist tbody tr[data-participant] td b').first().textContent();
  await page.fill('#cns-name',firstName);await page.locator('#plist button[type="submit"]').click();
  assert.ok(await page.locator('#plist tbody tr[data-participant]').count()>0);
  await page.click('button[onclick="filterCounselor(true)"]');await expectCounts(total,completed);
  console.log('PASS real counselor KPI/list consistency, name search and status filters');
  phase='submitted report';await page.click('button[onclick^="openRes"]');await page.waitForSelector('.sheet');
  assert.equal(await page.locator('.sheet').count(),5);assert.equal(await page.locator('.editpanel').count(),1);
  console.log('PASS real submitted assessment report');
  phase='browser PDF';fs.mkdirSync('test-results',{recursive:true});
  const pdf=await page.pdf({path:'test-results/actual-report.pdf',preferCSSPageSize:true,printBackground:true});
  const text=pdf.toString('latin1'),pages=(text.match(/\/Type \/Page\b/g)||[]).length;assert.equal(pages,5);
  const box=/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);assert.ok(box&&Math.abs(+box[1]-595)<2&&Math.abs(+box[2]-842)<2);
  console.log('PASS real report browser PDF: 5 A4 pages');
  phase='logout';await page.evaluate(()=>logout());await page.waitForSelector('#lg-id');console.log('PASS counselor session logout');
})().catch(()=>{console.error('FAIL',phase,'expected response or UI condition was not met');process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve))});
