// REQ-A-016 / REQ-A-006 (printing): the whole admin aggregate report, printed from the response the
// screen already loaded. Synthetic answers only, server code through the mock harness (no real Supabase).
// Checks: all nine analyses in order from any tab, the same markup as each screen tab, company filter,
// Base/denominator notes, zero and disabled-post states, loading/failure/stale blocking, no personal data
// or raw opinions, A4 PDF layout (no clipping, no horizontal overflow) and the screen state after printing.
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve-static.mjs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
const TEMPLATE=JSON.parse(fs.readFileSync(new URL('../snapshot/fixture.json',import.meta.url),'utf8')).db[0];
const views=()=>import('../../src/live/admin-aggregate-view.js');
const KEYS=['r1','r2','r3','r4','r5','r6','r7','r8','r9'];
const TITLES=['1. 사전사후 결과','2. 사전사후 상세','3. 만족도','4. 만족도_심리적 안정감','5. 만족도_호소문제의 변화','6. 만족도_컨설팅 기대 및 효과','7. 만족도_전반적인 만족도(개선요인)','8. 첫회기 컨설팅에 대한 기대','9. 만족도_기타의견'];
// Values that must never reach the report: names, phone, login/participant/auth IDs, raw answers and opinions.
const PRIVATE=['개인-','01012341234','응답원문','자유의견원문','결과원문','u-p0','pre-p0','post-p0','admin01','consult01'];

const rng=seed=>{let x=seed;return ()=>(x=(x*1103515245+12345)%2147483648)/2147483648};
const pickN=(arr,n,r)=>{const a=[...arr],out=[];for(let k=0;k<n;k++)out.push(a.splice(Math.floor(r()*a.length),1)[0]);return out};
const answers=(seed,count)=>{const r=rng(seed);return Array.from({length:count},()=>Array.from({length:15},()=>Math.floor(r()*5)+1))};
let O;
test.beforeAll(async()=>{
  const {OPT}=await import('../../src/js/03-options.js');
  O=Object.fromEntries(['d32','d33','d34','d35','d36'].map(k=>[k,OPT['expect.'+k]]));
});
function people(seed,count,{noSat=[],companies=['가 기업','나 기업']}={}){
  const pre=answers(seed,count),post=answers(seed+7,count),r=rng(seed+3),sc=()=>Math.floor(r()*5)+1;
  return pre.map((p,i)=>({pre:p,post:post[i],company:companies[i%companies.length],
    exp:{d32:pickN(O.d32,1,r),d33:pickN(O.d33,3,r),d34:pickN(O.d34,1,r),d35:pickN(O.d35,2,r),d36:pickN(O.d36,r()<.5?1:2,r)},
    sat:noSat.includes(i)?null:{q1:sc(),q2:sc(),q3a:sc(),q3b:sc(),q3c:sc(),q5fit:sc(),d32:pickN(O.d32,1,r),d33:pickN(O.d33,3,r),d34:pickN(O.d34,1,r),d35:pickN(O.d35,r()<.5?1:2,r),q7:pickN(['상담 시간·회기 수','결과 리포트 내용','특별히 없음'],1,r),q7txt:i%3?'자유의견원문 상담 도움':''}}));
}
function seed(list,{postEnabled=true}={}){
  const h=harness(),t=h.state.tables;t.participants.length=0;h.state.postEnabled=postEnabled;
  list.forEach((p,i)=>{
    const id='p'+String(i).padStart(3,'0');
    t.participants.push({id,organization_id:ids.org,counselor_user_id:ids.counselor,auth_user_id:'u-'+id,display_name:'개인-'+id,phone:'01012341234',company_name:p.company});
    t.assessments.push({id:'pre-'+id,participant_id:id,phase:'pre',status:'submitted',answers:{reg:{name:'응답원문-'+id},pre:p.pre,expect:p.exp},result:{comment:'결과원문'}});
    if(p.post)t.assessments.push({id:'post-'+id,participant_id:id,phase:'post',status:'submitted',answers:{post:p.post,...(p.sat?{sat:p.sat}:{})}});
  });
  return h;
}
const get=(h,query='')=>h.call(h.aggregate.handleAdminAggregate,ids.admin,undefined,'GET','https://fixture.invalid/'+query);
// The analysis part of the screen for one tab: everything after the tab bar.
const screenPart=html=>{const i=html.indexOf('data-agg-tabs');return html.slice(html.indexOf('</div>',i)+6)};
const sectionPart=(html,k)=>{const s=html.indexOf(`data-aggp="${k}"`),a=html.indexOf('</h2>',s)+5;return html.slice(a,html.indexOf('</section>',a))};

test('1·2·3·5 print view holds all nine analyses in order, each equal to its screen tab, from any tab',async()=>{
  const {adminAggregateView,adminAggregatePrintView}=await views();
  const h=seed(people(11,9,{noSat:[2,5]})),data=(await get(h)).data;
  const printed=adminAggregatePrintView(data,{organizationName:'테스트 기업'});
  expect([...printed.matchAll(/data-aggp="(r\d)"/g)].map(m=>m[1])).toEqual(KEYS);
  expect([...printed.matchAll(/<h2 class="aggp-h">([^<]*)<\/h2>/g)].map(m=>m[1])).toEqual(TITLES);
  for(const k of KEYS){
    expect(sectionPart(printed,k),k).toBe(screenPart(adminAggregateView({data,tab:k})));
    expect(sectionPart(printed,k),k).toContain('data-agg-base');
  }
  // The open tab does not matter: the printed copy only depends on the data.
  expect(new Set(KEYS.map(()=>adminAggregatePrintView(data,{organizationName:'테스트 기업'}))).size).toBe(1);
  expect(printed).toContain('세컨플래닝 통합 분석보고서');
  expect(printed).toContain('<dd data-aggp-meta="대상 조직">테스트 기업</dd>');
  expect(printed).toContain('<dd data-aggp-meta="선택 기업">전체</dd>');
  expect(printed).toContain(`사전·사후 참여자 ${data.population.n}명`);
  // Base and denominators stay as on the screens: satisfaction screens use satN, 8 uses the pre population.
  expect(sectionPart(printed,'r1')).toContain(`사전·사후 참여자(n=${data.population.n}), 단위: 명]`);
  for(const k of ['r3','r7','r9'])expect(sectionPart(printed,k)).toContain(`만족도 응답 n=${data.population.satN}`);
  for(const k of ['r4','r5','r6'])expect(sectionPart(printed,k)).toContain(`만족도 응답 n=${data.population.detailN}`);
  expect(sectionPart(printed,'r8')).toContain(`유효한 사전진단 완료자(n=${data.prePopulation.n})`);
  for(const k of KEYS.filter(k=>k!=='r8'))expect(sectionPart(printed,k),k).toContain('data-agg-method');
  expect(sectionPart(printed,'r9')).toContain('자유 의견 원문과 발췌문은 제공하지 않습니다');
  for(const v of PRIVATE)expect(printed,v).not.toContain(v);
  expect(printed).not.toMatch(/NaN|undefined|Infinity/);
  // No organization name from the server: nothing is made up.
  const unnamed=adminAggregatePrintView(data);
  expect(unnamed).toContain('<dd data-aggp-meta="대상 조직">관리자 계정의 소속 조직 (조직명 정보 없음)</dd>');
  expect(adminAggregatePrintView(data,{organizationName:'<b>x</b>'})).toContain('&lt;b&gt;x&lt;/b&gt;');
});

test('4 company filter: the printed copy carries only that company\'s server figures',async()=>{
  const {adminAggregatePrintView}=await views();
  const h=seed(people(11,9,{noSat:[2,5]})),all=(await get(h)).data,co=(await get(h,'?company='+encodeURIComponent('가 기업'))).data;
  const printed=adminAggregatePrintView(co);
  expect(co.population.n).toBeLessThan(all.population.n);
  expect(printed).toContain('<dd data-aggp-meta="선택 기업">가 기업</dd>');
  expect(printed).toContain('data-aggp-company="가 기업"');
  expect(sectionPart(printed,'r1')).toContain(`[Base: 가 기업 사전·사후 참여자(n=${co.population.n})`);
  expect(sectionPart(printed,'r8')).toContain(`[Base: 가 기업 유효한 사전진단 완료자(n=${co.prePopulation.n})`);
  expect(printed).not.toContain('전체 기업');
  expect(sectionPart(printed,'r1')).toContain(`<b>${co.population.n}명</b>`);
});

test('6·7 zero population, no satisfaction answers and a disabled post feature print reasons, not figures',async()=>{
  const {adminAggregatePrintView}=await views();
  const noFigures=s=>expect(s).not.toMatch(/<svg|class="tiles|class="hbrow|<table|NaN/);
  const off=adminAggregatePrintView((await get(seed(people(11,9),{postEnabled:false}))).data);
  for(const k of KEYS.filter(k=>k!=='r8')){expect(sectionPart(off,k),k).toContain('사후진단 기능이 이 서비스 환경에서 사용 설정되어 있지 않아');noFigures(sectionPart(off,k))}
  expect(sectionPart(off,'r8')).toContain('<svg');
  expect(off).toContain('사전·사후 분석 미집계 (사후진단 기능 사용 안 함)');
  const noSat=adminAggregatePrintView((await get(seed(people(11,4,{noSat:[0,1,2,3]})))).data);
  expect(sectionPart(noSat,'r1')).toContain('<svg');
  for(const k of ['r3','r4','r5','r6','r7','r9']){expect(sectionPart(noSat,k),k).toContain('사후 만족도 설문에 응답한 참여자가 아직 없습니다.');noFigures(sectionPart(noSat,k))}
  const zero=adminAggregatePrintView((await get(seed([]))).data);
  for(const k of KEYS.filter(k=>k!=='r8')){expect(sectionPart(zero,k),k).toContain('사전·사후를 모두 완료한 참여자가 아직 없습니다.');noFigures(sectionPart(zero,k))}
  expect(sectionPart(zero,'r8')).toContain('유효한 사전진단 완료자가 아직 없습니다.');
  expect(zero).toContain('사전진단 완료자 0명 · 사전·사후 참여자 0명 · 만족도 응답 0명');
});

test.describe('admin aggregate printing in the browser',()=>{
  let server;
  test.beforeAll(async()=>{server=await serve('src')});
  test.afterAll(async()=>{await server.close()});
  async function open(page,h,{aggregate}={}){
    const calls=[];
    await page.addInitScript(()=>{window.printCalls=[];window.print=()=>{const el=document.getElementById('admin-aggregate-print');window.printCalls.push({container:!!el,sections:el?el.querySelectorAll('[data-aggp]').length:0,printing:document.body.classList.contains('agg-printing')})}});
    await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
    await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
      const request=route.request(),u=new URL(request.url()),body=request.postDataJSON(),token=request.headers().authorization?.replace(/^Bearer /,'');
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
      calls.push(u.pathname+u.search);let result;const q='https://fixture.invalid/'+u.search;
      if(u.pathname.endsWith('/secondcareer-login')){const id=h.signIn(body.loginId,body.password)?.id;result=id?{status:200,data:{access_token:id,refresh_token:'refresh-'+id,expires_at:Math.floor(Date.now()/1000)+3600}}:{status:401,data:{error:'INVALID_CREDENTIALS'}}}
      else if(u.pathname.endsWith('/secondcareer-account'))result=await h.call(h.account.handleAccount,token,body,request.method());
      else if(u.pathname.endsWith('/secondcareer-admin-progress'))result=await h.call(h.progress.handleAdminProgress,token,body,request.method(),q);
      else if(u.pathname.endsWith('/secondcareer-admin-directory'))result=await h.call(h.directory.handleAdminDirectory,token,body,request.method(),q);
      else if(u.pathname.endsWith('/secondcareer-admin-aggregate'))result=aggregate?await aggregate(()=>h.call(h.aggregate.handleAdminAggregate,token,body,request.method(),q)):await h.call(h.aggregate.handleAdminAggregate,token,body,request.method(),q);
      else if(u.pathname.endsWith('/secondcareer-assessment'))result=await h.call(h.assessment,token,body,request.method(),q);
      else if(u.pathname==='/auth/v1/logout')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*'}});
      else throw Error('Unexpected API path: '+u.pathname);
      await route.fulfill({status:result.status,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body:JSON.stringify(result.data)});
    });
    await page.goto(server.url);
    return calls;
  }
  async function login(page,id='admin01'){await page.locator('#lg-id').fill(id);await page.locator('#lg-pw').fill('Fixture-password-123!');await page.getByRole('button',{name:'로그인',exact:true}).click()}
  const sec=page=>page.locator('#admin-aggregate');
  const printButton=page=>sec(page).getByRole('button',{name:'전체 보고서 인쇄'});
  const openReport=async page=>{await login(page);await sec(page).getByRole('button',{name:'통합 분석보고서 열기'}).click();await expect(sec(page).locator('[data-agg-tabs]')).toBeVisible()};
  const aggCalls=calls=>calls.filter(c=>c.includes('admin-aggregate')).length;
  // Layout in print media: page count, and every analysis block inside the A4 content width and shorter than a page.
  async function printLayout(page){
    // A4 portrait minus the 8mm @page margins is about 733 CSS px wide (the width fitSheets also uses).
    const viewport=page.viewportSize();await page.setViewportSize({width:733,height:1000});await page.emulateMedia({media:'print'});
    const layout=await page.evaluate(()=>{
      const root=document.getElementById('admin-aggregate-print'),box=root.getBoundingClientRect(),over=[],tall=[];
      for(const el of root.querySelectorAll('*')){const r=el.getBoundingClientRect();if(r.width&&r.right>box.right+0.5)over.push(el.tagName+'.'+el.className);}
      for(const el of root.querySelectorAll('svg,table,.tiles,.sat2>div,.sidechart>div,.hbrow,.topitem'))if(el.getBoundingClientRect().height>1000)tall.push(el.tagName+'.'+el.className);
      const scroll=[...root.querySelectorAll('.scroll')].map(e=>e.scrollWidth-e.clientWidth);
      const svgs=root.querySelectorAll('svg').length,app=getComputedStyle(document.getElementById('app')).display,shown=getComputedStyle(root).display;
      const breaks=[...root.querySelectorAll('.aggp-sec')].map(s=>getComputedStyle(s).breakBefore);
      const avoid=[...root.querySelectorAll('svg,table')].every(e=>getComputedStyle(e).breakInside==='avoid');
      return {width:box.width,over,tall,scroll,svgs,app,shown,breaks,avoid,text:root.innerText};
    });
    const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});
    await page.emulateMedia({media:null});await page.setViewportSize(viewport);
    const s=pdf.toString('latin1');
    const counts=[...s.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g)].map(m=>+m[1]).concat([...s.matchAll(/\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/g)].map(m=>+m[1]));
    return {...layout,pages:counts.length?Math.max(...counts):null,pdf};
  }

  test('2·3·10·11 print from tab 5: nine analyses equal to the screens, A4 PDF without clipping, screen state kept',async({page},testInfo)=>{
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    const h=seed(people(11,9,{noSat:[2,5]})),calls=await open(page,h);await openReport(page);
    await expect(printButton(page)).toBeEnabled();
    // Screen markup of each tab, read from the live page before printing.
    const screens={};
    for(const k of KEYS){await sec(page).locator(`[data-agg-tab="${k}"]`).click();await expect(sec(page).locator(`[data-agg-tab="${k}"]`)).toHaveAttribute('aria-selected','true');screens[k]=screenPart(await sec(page).innerHTML())}
    await sec(page).locator('[data-agg-tab="r5"]').click();
    const storage=await page.evaluate(()=>JSON.stringify([{...localStorage},{...sessionStorage}]));
    await printButton(page).click();
    expect(await page.evaluate(()=>window.printCalls)).toEqual([{container:true,sections:9,printing:true}]);
    expect(aggCalls(calls)).toBe(1);
    const root=page.locator('#admin-aggregate-print');
    await expect(root).toBeHidden();
    expect(await root.locator('[data-aggp]').evaluateAll(els=>els.map(e=>e.dataset.aggp))).toEqual(KEYS);
    expect(await root.locator('.aggp-h').allTextContents()).toEqual(TITLES);
    for(const k of KEYS)expect(sectionPart(await root.innerHTML(),k),k).toBe(screens[k]);
    await expect(root.locator('[data-aggp-meta="대상 조직"]')).toHaveText('테스트 기업');
    await expect(root.locator('[data-aggp-meta="선택 기업"]')).toHaveText('전체');
    const layout=await printLayout(page);
    expect(layout.app).toBe('none');expect(layout.shown).toBe('block');
    expect(layout.over).toEqual([]);expect(layout.tall).toEqual([]);expect(layout.scroll.every(v=>v<=0)).toBe(true);
    expect(layout.breaks).toEqual(['auto',...Array(8).fill('page')]);expect(layout.avoid).toBe(true);
    expect(layout.width).toBeLessThanOrEqual(740);
    expect(layout.pages).toBeGreaterThanOrEqual(9);expect(layout.pages).toBeLessThanOrEqual(18);
    for(const t of TITLES)expect(layout.text).toContain(t);
    for(const v of PRIVATE)expect(layout.text,v).not.toContain(v);
    expect(layout.text).not.toMatch(/NaN|undefined/);
    fs.writeFileSync(testInfo.outputPath('aggregate-report.pdf'),layout.pdf);
    // After printing: the copy is gone, the tab and company stay, nothing was stored, no new request.
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
    await expect(root).toHaveCount(0);expect(await page.evaluate(()=>document.body.classList.contains('agg-printing'))).toBe(false);
    await expect(sec(page).locator('[data-agg-tab="r5"]')).toHaveAttribute('aria-selected','true');
    await expect(sec(page).locator('#agg-company')).toHaveValue('');
    expect(await page.evaluate(()=>JSON.stringify([{...localStorage},{...sessionStorage}]))).toBe(storage);
    expect(aggCalls(calls)).toBe(1);
    // Ordinary printing of the admin page afterwards is not switched to the report.
    await page.emulateMedia({media:'print'});expect(await page.evaluate(()=>getComputedStyle(document.getElementById('app')).display)).not.toBe('none');await page.emulateMedia({media:null});
    expect(errors).toEqual([]);
  });

  test('4·11 company filter: printing after a company change carries only that company and keeps the choice',async({page})=>{
    const h=seed(people(11,9,{noSat:[2,5]})),calls=await open(page,h);await openReport(page);
    await sec(page).locator('[data-agg-tab="r8"]').click();
    await sec(page).locator('#agg-company').selectOption('가 기업');
    await expect(sec(page).locator('[data-agg-base]')).toContainText('가 기업');
    const co=(await get(h,'?company='+encodeURIComponent('가 기업'))).data;
    await printButton(page).click();
    const root=page.locator('#admin-aggregate-print');
    await expect(root.locator('[data-aggp-meta="선택 기업"]')).toHaveText('가 기업');
    await expect(root.locator('[data-aggp="r1"] [data-agg-base]')).toContainText(`[Base: 가 기업 사전·사후 참여자(n=${co.population.n})`);
    await expect(root.locator('[data-aggp="r8"] [data-agg-base]')).toContainText(`[Base: 가 기업 유효한 사전진단 완료자(n=${co.prePopulation.n})`);
    await expect(root.locator('[data-agg-kpi="n"] b')).toHaveText(`${co.population.n}명`);
    expect(await root.innerText()).not.toContain('전체 기업');
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
    await expect(sec(page).locator('#agg-company')).toHaveValue('가 기업');
    await expect(sec(page).locator('[data-agg-tab="r8"]')).toHaveAttribute('aria-selected','true');
    // A company change removes a copy that was not printed yet; the next print uses the new response only.
    await printButton(page).click();await expect(root).toHaveCount(1);
    await sec(page).locator('#agg-company').selectOption('나 기업');
    await expect(sec(page).locator('[data-agg-base]')).toContainText('나 기업');await expect(root).toHaveCount(0);
    await printButton(page).click();await expect(root.locator('[data-aggp-meta="선택 기업"]')).toHaveText('나 기업');
    expect(aggCalls(calls)).toBe(3);
  });

  test('8 printing is blocked while loading, after a failed read and when the selection no longer matches the data',async({page})=>{
    let gate=null,fail=false,openGate;
    const h=seed(people(11,9));
    await open(page,h,{aggregate:async run=>{if(fail)return {status:500,data:{error:'FIXTURE'}};if(gate)await gate;return run()}});
    await login(page);
    await expect(printButton(page)).toBeDisabled();
    gate=new Promise(r=>{openGate=r});
    await sec(page).getByRole('button',{name:'통합 분석보고서 열기'}).click();
    await expect(sec(page).locator('#admin-aggregate-status')).toHaveText('통합 분석을 집계하고 있습니다.');
    await expect(printButton(page)).toBeDisabled();
    gate=null;openGate();
    await expect(sec(page).locator('[data-agg-base]')).toBeVisible();await expect(printButton(page)).toBeEnabled();
    // Selection changed without a matching response (stale state): refused with a message.
    await page.evaluate(()=>{document.querySelector('#agg-company').value='가 기업'});
    await printButton(page).click();
    expect(await page.evaluate(()=>window.printCalls.length)).toBe(0);await expect(page.locator('#admin-aggregate-print')).toHaveCount(0);
    await expect(sec(page).locator('#admin-aggregate-status')).toContainText('일치하지 않아 인쇄할 수 없습니다');
    // A failed reload drops the old figures: nothing left to print.
    fail=true;await sec(page).getByRole('button',{name:'통합 분석 다시 불러오기'}).click();
    await expect(sec(page).locator('#admin-aggregate-status')).not.toHaveText('');
    await expect(sec(page).locator('[data-agg-base]')).toHaveCount(0);await expect(printButton(page)).toBeDisabled();
    expect(await page.evaluate(()=>window.printCalls.length)).toBe(0);await expect(page.locator('#admin-aggregate-print')).toHaveCount(0);
  });

  test('7 disabled post feature prints all nine sections with the reason instead of figures',async({page})=>{
    const h=seed(people(11,9),{postEnabled:false});await open(page,h);await openReport(page);
    await printButton(page).click();
    const root=page.locator('#admin-aggregate-print');
    await expect(root.locator('[data-aggp]')).toHaveCount(9);
    for(const k of KEYS.filter(k=>k!=='r8')){await expect(root.locator(`[data-aggp="${k}"] [data-agg-empty]`)).toContainText('사후진단 기능');await expect(root.locator(`[data-aggp="${k}"] svg, [data-aggp="${k}"] table`)).toHaveCount(0)}
    await expect(root.locator('[data-aggp="r8"] svg')).toHaveCount(1);
    const layout=await printLayout(page);expect(layout.over).toEqual([]);expect(layout.pages).toBeGreaterThanOrEqual(9);
  });

  test('9 counselors get no print control, no copy and no aggregate request; logout removes a pending copy',async({page})=>{
    const h=seed(people(11,3),{postEnabled:false}),calls=await open(page,h);
    await openReport(page);await printButton(page).click();await expect(page.locator('#admin-aggregate-print')).toHaveCount(1);
    await page.evaluate(()=>logout());await expect(page.getByRole('heading',{name:'세컨플래닝 로그인'})).toBeVisible();
    await expect(page.locator('#admin-aggregate-print')).toHaveCount(0);expect(await page.evaluate(()=>document.body.classList.contains('agg-printing'))).toBe(false);
    const before=aggCalls(calls);
    await login(page,'consult01');await expect(page.getByRole('heading',{name:'상담사 페이지'})).toBeVisible();
    await expect(page.locator('[data-admin-aggregate]')).toHaveCount(0);await expect(page.locator('#admin-aggregate-print')).toHaveCount(0);
    expect(aggCalls(calls)).toBe(before);
  });
});
