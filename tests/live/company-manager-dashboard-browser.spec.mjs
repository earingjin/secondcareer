import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {serve} from '../tools/serve-static.mjs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
let server;test.beforeAll(async()=>{server=await serve('src')});test.afterAll(async()=>{await server.close()});

// STEP 14-D company manager dashboard (protocol mock, synthetic data only).
const counselorB='10000000-0000-4000-8000-0000000000b2',PW='Changed-browser-123!';
const rep=(n,row)=>Array.from({length:n},()=>row);
function add(h,company,rows){
  for(const [counselor,pre,post] of rows){
    const id=randomUUID();
    h.state.tables.participants.push({id,organization_id:ids.org,auth_user_id:randomUUID(),counselor_user_id:counselor,display_name:'숨김참여자'+id.slice(0,4),phone:'01099998888',company_name:company.name,company_id:company.id});
    for(const [phase,status] of [['pre',pre],['post',post]])if(status)h.state.tables.assessments.push({id:randomUUID(),participant_id:id,phase,status,answers:{pre:[1]}});
  }
}
async function setup(page,{postEnabled=false,changed=true,grantB=true}={}){
  const h=harness();h.state.managerEnabled=true;h.state.postEnabled=postEnabled;const calls=[];
  h.state.tables.user_profiles.push({user_id:counselorB,organization_id:ids.org,role:'counselor',display_name:'나상담'});
  const a={id:randomUUID(),name:'가 합성 고객사',organization_id:ids.org,status:'active'},b={id:randomUUID(),name:'나 합성 고객사',organization_id:ids.org,status:'active'};
  h.state.tables.client_companies.push(a,b);
  const issued=(await h.call(h.managers.handleAdminCompanyManagers,ids.admin,{name:'합성 담당자',email:'dash@example.invalid',phone:'01000000000',requestId:randomUUID()},'POST','https://fixture.invalid/?companyId='+a.id)).data;
  const managerId=issued.managerId;
  if(grantB)await h.call(h.managers.handleAdminCompanyManagers,ids.admin,{action:'grant',managerId},'PATCH','https://fixture.invalid/?companyId='+b.id);
  if(changed)await h.call(h.manager.handleCompanyManager,managerId,{action:'change-password',password:PW});
  const gate={delay:null};
  await page.route('**/main.js',r=>r.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
  await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
    const req=route.request(),u=new URL(req.url()),body=req.postDataJSON(),token=req.headers().authorization?.replace(/^Bearer /,'');
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Content-Type':'application/json'};
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
    calls.push({path:u.pathname,search:u.search,method:req.method()});let r;
    if(u.pathname.endsWith('/secondcareer-login')){const id=h.signIn(body.loginId,body.password)?.id;r=id?{status:200,data:{access_token:id,refresh_token:'refresh-'+id,expires_in:3600}}:{status:401,data:{error:'INVALID_CREDENTIALS'}}}
    else if(u.pathname==='/auth/v1/token'){const id=body.refresh_token.replace(/^refresh-/,'');r={status:200,data:{access_token:id,refresh_token:'refresh-'+id,expires_in:3600}}}
    else if(u.pathname==='/auth/v1/logout')return route.fulfill({status:204,headers});
    else{
      const handlers={'secondcareer-account':h.account.handleAccount,'secondcareer-company-manager':h.manager.handleCompanyManager,'secondcareer-company-manager-progress':h.managerProgress.handleCompanyManagerProgress,'secondcareer-assessment':h.assessment,'secondcareer-admin-progress':h.progress.handleAdminProgress};
      const handler=handlers[u.pathname.split('/').at(-1)];if(!handler)throw Error('Unexpected request '+u.pathname);
      if(u.pathname.endsWith('-progress')&&gate.delay)await gate.delay;
      r=await h.call(handler,token,body,req.method(),'https://fixture.invalid/'+u.search);
    }
    return route.fulfill({status:r.status,headers,body:JSON.stringify(r.data)});
  });
  await page.goto(server.url+'?entry=company-manager');
  return {h,a,b,managerId,loginId:issued.loginId,temporaryPassword:issued.temporaryPassword,calls,gate};
}
async function login(page,id,pw){await page.locator('#lg-id').fill(id);await page.locator('#lg-pw').fill(pw);await page.getByRole('button',{name:'로그인',exact:true}).click()}
const dash=page=>page.locator('#company-manager-dashboard');
const kpi=(page,k)=>page.locator(`[data-kpi="${k}"] b`);

test('allowed company counts, stage table, counselor completion, post not operated, and switching companies',async({page})=>{
  const {h,a,b,loginId,calls}=await setup(page);
  add(h,a,[...rep(5,[ids.counselor,'submitted']),...rep(5,[ids.counselor,null]),...rep(5,[counselorB,'submitted']),...rep(5,[counselorB,'draft'])]);
  h.state.tables.participants.push({id:'unlinked-x',organization_id:ids.org,counselor_user_id:ids.counselor,display_name:'미연결합성X',company_name:a.name});
  add(h,b,rep(3,[ids.counselor,'submitted']));
  await login(page,loginId,PW);
  await expect(page.getByRole('heading',{name:'고객사 진단 현황'})).toBeVisible();
  await expect(kpi(page,'total')).toHaveText('20');await expect(kpi(page,'pre-submitted')).toHaveText('10');await expect(kpi(page,'pre-rate')).toHaveText('50.0%');
  await expect(kpi(page,'post-submitted')).toHaveText('미운영');await expect(kpi(page,'post-rate')).toHaveText('미운영');
  await expect(page.locator('[data-manager-stages] tbody tr').first()).toHaveText(/사전진단\s*5\s*5\s*10\s*50\.0%/);
  await expect(page.locator('[data-post-off]')).toContainText('미운영');
  await expect(page.locator('[data-counselor-row]')).toHaveCount(2);
  await expect(page.locator('[data-counselor-row]').nth(0)).toHaveText(/나상담\s*10\s*5\s*50\.0%\s*미운영/);
  await expect(dash(page).locator('[data-basis]')).toContainText('연결된 참여자 전체');await expect(dash(page).locator('[data-rate-basis]')).toContainText('÷ 연결된 전체 참여 인원');
  await expect(dash(page).locator('[data-privacy-note]')).toContainText('5명 미만');
  // Switching to the second allowed company (3 participants) shows the withheld state, not zeros.
  await page.getByLabel('고객사 선택').selectOption(b.id);
  await expect(dash(page).locator('[data-state="suppressed"]')).toBeVisible();await expect(page.locator('[data-kpi]')).toHaveCount(0);
  await page.getByLabel('고객사 선택').selectOption(a.id);await expect(kpi(page,'total')).toHaveText('20');
  const html=await page.content();for(const s of ['숨김참여자','01099998888','미연결합성X',ids.counselor,counselorB,'unlinked-x'])expect(html).not.toContain(s);
  expect(calls.filter(c=>/secondcareer-assessment|secondcareer-admin-/.test(c.path))).toHaveLength(0);
  expect(calls.filter(c=>c.path.endsWith('-progress')).every(c=>c.method==='GET'&&/^\?companyId=[0-9a-f-]{36}$/.test(c.search))).toBe(true);
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toMatch(/"20"|나상담|숨김/);
  await expect(page.locator('#company-manager-dashboard').getByRole('button')).toHaveText(['새로고침','로그아웃']);
});

test('zero participants, post enabled values, withheld cells and loading are distinct',async({page})=>{
  const {h,a,b,loginId,gate}=await setup(page,{postEnabled:true});
  add(h,b,[...rep(6,[ids.counselor,'submitted','submitted']),...rep(3,[ids.counselor,null,null]),...rep(2,[ids.counselor,'draft',null]),...rep(2,[counselorB,'submitted','draft'])]);
  await login(page,loginId,PW);
  await expect(dash(page).locator('[data-state="empty"]')).toContainText('0명');
  let release;gate.delay=new Promise(r=>{release=r});
  await page.getByLabel('고객사 선택').selectOption(b.id);await expect(page.locator('#manager-progress-status')).toHaveText('고객사 현황을 불러오고 있습니다.');
  release();gate.delay=null;
  await expect(kpi(page,'total')).toHaveText('13');await expect(kpi(page,'pre-submitted')).toHaveText('8');await expect(kpi(page,'pre-rate')).toHaveText('61.5%');
  await expect(page.locator('[data-manager-stages] tbody tr').first()).toHaveText(/사전진단\s*비공개\s*비공개\s*8\s*61\.5%/);
  await expect(kpi(page,'post-submitted')).toHaveText('6');await expect(kpi(page,'post-rate')).toHaveText('46.2%');
  // Counselor rows 2 and 11: the single small row would be total - 11, so both are withheld.
  await expect(page.locator('[data-counselor-row]').nth(0)).toHaveText(/나상담\s*비공개\s*비공개\s*비공개\s*비공개\s*비공개/);
  await expect(page.locator('[data-counselor-row]').nth(1)).toHaveText(/상담사\s*비공개/);
  expect(await page.locator('[data-withheld]').count()).toBeGreaterThan(0);
});

test('revoked company and suspension remove shown counts; expired session and password gate block the dashboard',async({page})=>{
  const {h,a,b,managerId,loginId}=await setup(page);
  add(h,a,rep(5,[ids.counselor,'submitted']));add(h,b,rep(6,[ids.counselor,'draft']));
  await login(page,loginId,PW);await expect(kpi(page,'total')).toHaveText('5');
  // Access to b is revoked while the list still shows it: the 403 re-checks the account, drops b and shows no counts.
  await h.call(h.managers.handleAdminCompanyManagers,ids.admin,{action:'revoke',managerId},'PATCH','https://fixture.invalid/?companyId='+b.id);
  await page.getByLabel('고객사 선택').selectOption(b.id);
  await expect(page.locator('#manager-progress-status')).toContainText('접근 권한이 해제');await expect(page.locator('[data-kpi]')).toHaveCount(0);
  await expect(page.getByLabel('고객사 선택')).toHaveCount(0);await expect(dash(page).locator('[data-manager-company-name]')).toHaveText(a.name);
  await page.getByRole('button',{name:'새로고침'}).click();await expect(kpi(page,'total')).toHaveText('5');
  // Suspension: refresh signs out and clears the screen.
  h.state.tables.company_manager_accounts[0].status='suspended';await page.getByRole('button',{name:'새로고침'}).click();
  await expect(page.locator('#lg-id')).toBeVisible();await expect(page.locator('[data-kpi]')).toHaveCount(0);
  // Reactivated, then suspended while the screen is open: the next read is refused and the counts are removed.
  h.state.tables.company_manager_accounts[0].status='active';await login(page,loginId,PW);await expect(kpi(page,'total')).toHaveText('5');
  await h.call(h.managers.handleAdminCompanyManagers,ids.admin,{action:'grant',managerId},'PATCH','https://fixture.invalid/?companyId='+b.id);
  await page.getByRole('button',{name:'새로고침'}).click();await expect(page.getByLabel('고객사 선택')).toBeVisible();
  h.state.tables.company_manager_accounts[0].status='suspended';await page.getByLabel('고객사 선택').selectOption(b.id);
  await expect(page.locator('#lg-id')).toBeVisible();await expect(page.getByRole('alert')).toContainText('계정이 정지');await expect(page.locator('[data-kpi]')).toHaveCount(0);
  // Expired session.
  h.state.tables.company_manager_accounts[0].status='active';await login(page,loginId,PW);await expect(kpi(page,'total')).toHaveText('5');
  delete h.state.users[managerId];await page.getByLabel('고객사 선택').selectOption(b.id);
  await expect(page.locator('#lg-id')).toBeVisible();await expect(page.getByRole('alert')).toContainText('세션이 만료');await expect(page.locator('[data-kpi]')).toHaveCount(0);
});

test('a manager who has not changed the temporary password gets no counts and no progress request',async({page})=>{
  const {h,a,loginId,temporaryPassword,calls}=await setup(page,{changed:false});add(h,a,rep(5,[ids.counselor,'submitted']));
  await login(page,loginId,temporaryPassword);await expect(page.getByRole('heading',{name:'최초 비밀번호 변경'})).toBeVisible();
  await expect(page.locator('[data-kpi]')).toHaveCount(0);expect(calls.filter(c=>c.path.endsWith('-progress'))).toHaveLength(0);
  await page.getByLabel('새 비밀번호 (12~128자)',{exact:true}).fill(PW);await page.getByLabel('새 비밀번호 확인',{exact:true}).fill(PW);await page.getByRole('button',{name:'변경하고 고객사 확인'}).click();
  await expect(kpi(page,'total')).toHaveText('5');
});
