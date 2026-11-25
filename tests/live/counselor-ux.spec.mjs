import {test,expect} from '@playwright/test';
import {serve} from '../tools/serve-static.mjs';
let server;
test.beforeAll(async()=>{server=await serve('src')});
test.afterAll(async()=>{await server.close()});
async function setup(page){
 const calls=[],state={fail:false,readStatus:200,reportStatus:200,count:25,oneCompany:false};
 await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
 await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async r=>{
  const req=r.request(),u=new URL(req.url());if(req.method()==='OPTIONS')return r.fulfill({status:204});
  let data;
  if(u.pathname.endsWith('/secondcareer-login'))data={access_token:'fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+600};
  else if(u.pathname.endsWith('/secondcareer-account'))data={profile:{role:'counselor'},mustChangePassword:false};
  else if(u.pathname.endsWith('/secondcareer-assessment')){
   if(u.searchParams.has('compare'))return r.fulfill({status:500,contentType:'application/json',body:'{"error":"FAIL"}'});
   if(u.searchParams.has('id')){calls.push(u.search);if(state.reportStatus!==200)return r.fulfill({status:state.reportStatus,contentType:'application/json',body:'{"error":"FORBIDDEN"}'});data={html:`<div id="server-report">${u.searchParams.get('kind')}</div>`}}
   else {if(state.fail||state.readStatus!==200)return r.fulfill({status:state.fail?500:state.readStatus,contentType:'application/json',body:'{"error":"FAIL"}'});const participants=Array.from({length:state.count},(_,i)=>({id:'p'+i,display_name:'테스트'+String(i).padStart(2,'0'),company_name:state.oneCompany?'기업B':i%2?'기업A':'기업B',counselor_user_id:'c',anonymous_intake:i===0}));data={profile:{role:'counselor'},participants,counselors:{},assessments:participants.filter((p,i)=>i!==24).map((p,i)=>({id:'a'+i,participant_id:p.id,phase:'pre',status:'submitted',submitted_at:`2026-11-${String(i+1).padStart(2,'0')}T00:00:00Z`,answers:{}})),postAssessments:[{participant_id:"p1",status:"submitted",submitted_at:"2026-11-20T00:00:00Z"}],postApprovals:[]}}
  }else throw Error('unexpected endpoint '+u.pathname);
  return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(server.url);await page.locator('#lg-id').fill('consult01');await page.locator('#lg-pw').fill('fixture-password');await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.locator('#plist')).toBeVisible();return {calls,state};
}
test('전체 집계, 검색과 기업 필터, 정렬과 페이지 이동',async({page})=>{
 await setup(page);await expect(page.locator('[data-kpi=total] b')).toHaveText('25');await expect(page.locator('[data-kpi=completed] b')).toHaveText('24');await expect(page.locator('#plist tbody tr')).toHaveCount(20);await expect(page.locator('#plist tbody tr').first()).toContainText('테스트23');
 await page.getByRole('button',{name:'다음',exact:true}).click();await expect(page.locator('#plist tbody tr')).toHaveCount(5);
 await page.locator('#cns-company').selectOption({label:'기업A'});await expect(page.locator('.counselor-pagination')).toHaveCount(0);await expect(page.locator('[data-kpi=total] b')).toHaveText('25');
 await page.locator('#cns-name').fill('테스트01');await page.getByRole('button',{name:'검색',exact:true}).click();await expect(page.locator('#plist tbody tr')).toHaveCount(1);await expect(page.locator('#plist tbody')).toContainText('테스트01');await expect(page.locator('[data-kpi=completed] b')).toHaveText('24');
 await page.locator('#cns-status').selectOption('incomplete');await expect(page.locator('#plist')).toContainText('검색 결과 0명');
});
test('세 결과물과 복귀, 미제출 및 타 담당 접근 제한',async({page})=>{
 const {calls}=await setup(page);await page.locator('#cns-name').fill('테스트01');await page.getByRole('button',{name:'검색',exact:true}).click();
 for(const [label,kind] of [['고객등록신청서','i'],['고객용 리포트','p'],['상담사용 리포트','c']]){await page.locator('summary').click();await page.getByRole('button',{name:label,exact:true}).click();await expect(page.locator('#server-report')).toHaveText(kind);await page.getByRole('button',{name:'담당 내담자 목록',exact:true}).click();await expect(page.locator('#cns-name')).toHaveValue('테스트01')}
 expect(calls).toHaveLength(3);await page.evaluate(()=>openRes('p24','c'));await expect(page.getByRole('alert')).toContainText('최종 제출');await page.evaluate(()=>openRes('other','c'));await expect(page.getByRole('alert')).toContainText('담당 내담자');expect(calls).toHaveLength(3);
});
test('무로그인 사후진단 미지원과 조회 실패 구분',async({page})=>{
 const {state}=await setup(page);await page.locator('#cns-name').fill('테스트00');await page.getByRole('button',{name:'검색',exact:true}).click();const row=page.locator('[data-participant="p0"]');await expect(row).toContainText('사후진단 미지원');await expect(row.locator('[data-post-status]')).toHaveCount(0);await expect(row.locator('[data-approve-post]')).toHaveCount(0);
 state.fail=true;await page.getByRole('button',{name:'새로 조회'}).click();await expect(page.locator('[data-kpi=total] b')).toHaveText('—');await expect(page.locator('#plist')).toContainText('조회에 실패했습니다');
});
test('마지막 행 메뉴는 행 높이와 화면 경계를 유지하고 키보드로 닫힌다',async({page})=>{
 await setup(page);const row=page.locator('#plist tbody tr').last(),trigger=row.locator('summary');await trigger.scrollIntoViewIfNeeded();const before=await row.boundingBox();await trigger.focus();await page.keyboard.press('Enter');await expect(row.locator('details')).toHaveAttribute('open','');const panel=row.locator('.counselor-menu'),rect=await panel.boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(1280);expect(rect.y+rect.height).toBeLessThanOrEqual(720);expect((await row.boundingBox()).height).toBe(before.height);
 await page.keyboard.press('Escape');await expect(row.locator('details')).not.toHaveAttribute('open','');await expect(trigger).toBeFocused();await trigger.click();await page.locator('#plist summary').first().click();await expect(page.locator('.counselor-result-menu[open]')).toHaveCount(1);await page.locator('#plist h2').click();await expect(page.locator('.counselor-result-menu[open]')).toHaveCount(0);
});
test('보고서 일시 오류는 이전 보고서를 보존하고 권한 오류는 개인정보를 제거한다',async({page})=>{
 const {state}=await setup(page);await page.locator('summary').first().click();await page.getByRole('button',{name:'고객용 리포트',exact:true}).click();await expect(page.locator('#server-report')).toHaveText('p');state.reportStatus=500;await page.locator('#live-report-kind').getByRole('button',{name:'상담사용 리포트'}).click();await expect(page.locator('#server-report')).toHaveText('p');await expect(page.locator('#live-report-kind').getByRole('button',{name:'고객용 리포트'})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('alert')).toBeVisible();state.reportStatus=403;await page.locator('#live-report-kind').getByRole('button',{name:'상담사용 리포트'}).click();await expect(page.locator('#server-report')).toHaveCount(0);await expect(page.locator('#plist')).toHaveCount(0);await expect(page.getByRole('alert')).toContainText('권한');
});
test('재조회 실패 후 재시도와 필터·페이지 정상화',async({page})=>{
 const {state}=await setup(page);await page.getByRole('button',{name:'다음',exact:true}).click();state.count=5;await page.getByRole('button',{name:'새로 조회'}).click();await expect(page.locator('.counselor-pagination')).toHaveCount(0);await expect(page.locator('#plist tbody tr')).toHaveCount(5);state.count=25;await page.getByRole('button',{name:'새로 조회'}).click();await expect(page.locator('.counselor-pagination')).toContainText('1 / 2');await page.locator('#cns-company').selectOption({label:'기업A'});state.oneCompany=true;await page.getByRole('button',{name:'새로 조회'}).click();await expect(page.locator('#cns-company')).toHaveValue('all');
 state.fail=true;await page.getByRole('button',{name:'새로 조회'}).click();await expect(page.locator('#plist')).toContainText('마지막 성공 조회 데이터');await expect(page.locator('summary').first()).toHaveAttribute('aria-disabled','true');state.fail=false;await page.getByRole('button',{name:'새로 조회'}).click();await expect(page.locator('summary').first()).not.toHaveAttribute('aria-disabled','true');
 state.readStatus=403;await page.getByRole('button',{name:'새로 조회'}).click();await expect(page.locator('#plist')).toHaveCount(0);await expect(page.getByRole('alert')).toContainText('권한');
});
test('최초 보고서 실패와 목록 복귀 시 페이지와 포커스를 복원한다',async({page})=>{
 const {state}=await setup(page);await page.getByRole('button',{name:'다음',exact:true}).click();const row=page.locator('[data-participant="p1"]'),trigger=row.locator('summary');await trigger.scrollIntoViewIfNeeded();const y=await page.evaluate(()=>scrollY);state.reportStatus=500;await trigger.click();await row.getByRole('button',{name:'고객용 리포트'}).click();await expect(page.locator('.counselor-pagination')).toContainText('2 / 2');await expect(trigger).toBeFocused();expect(Math.abs((await page.evaluate(()=>scrollY))-y)).toBeLessThan(3);state.reportStatus=200;await trigger.click();await row.getByRole('button',{name:'고객용 리포트'}).click();await expect(page.locator('#server-report')).toBeVisible();await page.getByRole('button',{name:'담당 내담자 목록',exact:true}).click();await expect(trigger).toBeFocused();await expect(page.locator('.counselor-pagination')).toContainText('2 / 2');
});
test('비교 조회 실패 후 실행 버튼과 위치를 복원한다',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'다음',exact:true}).click();const button=page.locator('[data-participant="p1"] [data-compare-post]');await button.scrollIntoViewIfNeeded();const y=await page.evaluate(()=>scrollY);await button.click();await expect(page.getByRole('alert')).toBeVisible();await expect(button).toBeFocused();await expect(page.locator('.counselor-pagination')).toContainText('2 / 2');expect(Math.abs((await page.evaluate(()=>scrollY))-y)).toBeLessThan(3);
});
for(const width of [375,768,1440])test(`화면 ${width}px`,async({page})=>{await page.setViewportSize({width,height:900});await setup(page);await expect(page.locator('.proto-note')).toBeHidden();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();const trigger=page.locator('#plist summary').last();await trigger.scrollIntoViewIfNeeded();await trigger.click();const panel=page.locator('.counselor-result-menu[open] .counselor-menu');await expect.poll(async()=>{const box=await panel.boundingBox();return box&&box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=900}).toBe(true);await page.emulateMedia({media:'print'});await expect(page.locator('.counselor-workspace')).toBeHidden()});
