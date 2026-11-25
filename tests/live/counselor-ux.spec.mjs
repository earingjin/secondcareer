import {test,expect} from '@playwright/test';
import {serve} from '../tools/serve-static.mjs';
let server;
test.beforeAll(async()=>{server=await serve('src')});
test.afterAll(async()=>{await server.close()});
async function setup(page){
 const calls=[],state={fail:false};
 await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
 await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async r=>{
  const req=r.request(),u=new URL(req.url());if(req.method()==='OPTIONS')return r.fulfill({status:204});
  let data;
  if(u.pathname.endsWith('/secondcareer-login'))data={access_token:'fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+600};
  else if(u.pathname.endsWith('/secondcareer-account'))data={profile:{role:'counselor'},mustChangePassword:false};
  else if(u.pathname.endsWith('/secondcareer-assessment')){
   if(u.searchParams.has('id')){calls.push(u.search);data={html:`<div id="server-report">${u.searchParams.get('kind')}</div>`}}
   else {if(state.fail)return r.fulfill({status:500,contentType:'application/json',body:'{"error":"FAIL"}'});const participants=Array.from({length:25},(_,i)=>({id:'p'+i,display_name:'테스트'+String(i).padStart(2,'0'),company_name:i%2?'기업A':'기업B',counselor_user_id:'c',anonymous_intake:i===0}));data={profile:{role:'counselor'},participants,counselors:{},assessments:participants.slice(0,24).map((p,i)=>({id:'a'+i,participant_id:p.id,phase:'pre',status:'submitted',submitted_at:`2026-11-${String(i+1).padStart(2,'0')}T00:00:00Z`,answers:{}})),postAssessments:[],postApprovals:[]}}
  }else throw Error('unexpected endpoint '+u.pathname);
  return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(server.url);await page.locator('#lg-id').fill('consult01');await page.locator('#lg-pw').fill('fixture-password');await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.locator('#plist')).toBeVisible();return {calls,state};
}
test('전체 집계, 검색과 기업 필터, 정렬과 페이지 이동',async({page})=>{
 await setup(page);await expect(page.locator('[data-kpi=total] b')).toHaveText('25');await expect(page.locator('[data-kpi=completed] b')).toHaveText('24');await expect(page.locator('#plist tbody tr')).toHaveCount(20);await expect(page.locator('#plist tbody tr').first()).toContainText('테스트23');
 await page.getByRole('button',{name:'다음',exact:true}).click();await expect(page.locator('#plist tbody tr')).toHaveCount(5);
 await page.locator('#cns-company').selectOption({label:'기업A'});await expect(page.locator('.counselor-pagination')).toContainText('1 / 1');await expect(page.locator('[data-kpi=total] b')).toHaveText('25');
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
for(const width of [375,768,1440])test(`화면 ${width}px`,async({page})=>{await page.setViewportSize({width,height:900});await setup(page);await expect(page.locator('.proto-note')).toBeHidden();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.emulateMedia({media:'print'});await expect(page.locator('.counselor-workspace')).toBeHidden()});
