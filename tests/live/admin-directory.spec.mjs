// REQ-A-001/002 read-only admin directory against the local protocol mock (server-harness.cjs).
// Function code, browser screen and mock only: no real Postgres, RLS, Auth or deployed function.
import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve-static.mjs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
const C2='10000000-0000-4000-8000-000000000005';

function seed(){
  const h=harness(),t=h.state.tables;t.participants.length=0;
  t.user_profiles.push({user_id:C2,organization_id:ids.org,role:'counselor',display_name:'김상담'});h.state.users[C2]={id:C2,app_metadata:{}};
  t.server_login_lookup.push({user_id:C2,login_id:'counsel02',internal_email:'c2@example.invalid'});
  const add=(id,company,counselor,login,pre,org=ids.org)=>{
    t.participants.push({id,organization_id:org,counselor_user_id:counselor,auth_user_id:login?'u-'+id:null,display_name:'참여-'+id,phone:'01099998888',company_name:company});
    if(login)t.server_login_lookup.push({user_id:'u-'+id,login_id:login,internal_email:'secret-'+id+'@example.invalid'});
    if(pre)t.assessments.push({id:'a-'+id,participant_id:id,phase:'pre',status:pre,answers:{reg:{name:'응답원문'}},result:{comment:'결과원문'}});
  };
  add('d1','가 기업',ids.counselor,'part0001','submitted');
  add('d2','가 기업',C2,'part0002','draft');
  add('d3','나 기업',ids.counselor,null,null);
  add('d4','',null,'part0004',null);
  add('d5','나 기업',ids.other,'part0005','submitted');
  add('x1','비밀 기업',ids.other,'other001','submitted','other-org');
  return h;
}
const get=(h,token,url)=>h.call(h.directory.handleAdminDirectory,token,undefined,'GET',url);

test('1·4·5·6 admin gets scoped counselors, companies and participants with server counts',async()=>{
  const h=seed(),r=await get(h,ids.admin);
  expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');
  expect(r.data.organizationName).toBe('테스트 기업');
  expect(r.data.totals).toEqual({participants:5,counselors:2,unassigned:1,unknownCounselor:1});
  expect(r.data.counselors).toEqual([{id:C2,name:'김상담',loginId:'counsel02',assigned:1},{id:ids.counselor,name:'상담사',loginId:'consult01',assigned:2}]);
  expect(r.data.companies).toEqual([{name:'가 기업',total:2,counselors:2},{name:'나 기업',total:2,counselors:1},{name:null,total:1,counselors:0}]);
  expect(r.data.participants).toEqual([
    {id:'d1',name:'참여-d1',loginId:'part0001',companyName:'가 기업',counselorId:ids.counselor,assignment:'assigned',preStatus:'submitted'},
    {id:'d2',name:'참여-d2',loginId:'part0002',companyName:'가 기업',counselorId:C2,assignment:'assigned',preStatus:'draft'},
    {id:'d3',name:'참여-d3',loginId:null,companyName:'나 기업',counselorId:ids.counselor,assignment:'assigned',preStatus:'notStarted'},
    {id:'d5',name:'참여-d5',loginId:'part0005',companyName:'나 기업',counselorId:null,assignment:'unknown',preStatus:'submitted'},
    {id:'d4',name:'참여-d4',loginId:'part0004',companyName:null,counselorId:null,assignment:'unassigned',preStatus:'notStarted'}]);
});

test('3 another organization, its counselor and personal details never appear in the response or the reads',async()=>{
  const h=seed(),r=await get(h,ids.admin),body=JSON.stringify(r.data);
  for(const hidden of ['비밀 기업','other001','다른 조직',ids.other,'01099998888','secret-','example.invalid','응답원문','결과원문','u-d1'])expect(body).not.toContain(hidden);
  const reads=h.state.reads.filter(x=>x.table!=='user_profiles'||x.filters.some(([k])=>k==='role'));
  for(const read of reads.filter(x=>['participants','user_profiles'].includes(x.table)))
    expect(read.filters.some(([k,v,op])=>k==='organization_id'&&v===ids.org&&op==='eq')).toBe(true);
  const columns=table=>new Set(h.state.reads.filter(x=>x.table===table).flatMap(x=>x.columns.split(',')));
  expect([...columns('participants')].sort()).toEqual(['auth_user_id','company_name','counselor_user_id','display_name','id']);
  expect([...columns('server_login_lookup')].sort()).toEqual(['login_id','user_id']);
  expect([...columns('assessments')].sort()).toEqual(['id','participant_id','status']);
  // Login lookups are limited to this organization's counselors and participants.
  const looked=h.state.reads.filter(x=>x.table==='server_login_lookup').flatMap(x=>x.filters.find(([k])=>k==='user_id')[1]);
  expect([...new Set(looked)].sort()).toEqual([C2,ids.counselor,'u-d1','u-d2','u-d4','u-d5'].sort());
});

test('2 counselor, participant, other roles and unauthenticated or scoped requests are refused',async()=>{
  const h=seed();
  for(const [token,status] of [[ids.counselor,403],[C2,403],[ids.participant,403],[ids.other,403],[null,401],['unknown-token',401]]){
    const r=await get(h,token);expect(r.status).toBe(status);expect(r.data.participants).toBeUndefined();expect(r.data.counselors).toBeUndefined();
  }
  for(const query of ['?organizationId=other-org','?counselor='+ids.other,'?company=x'])expect((await get(h,ids.admin,'https://fixture.invalid/'+query)).status).toBe(400);
  expect((await h.call(h.directory.handleAdminDirectory,ids.admin,{organizationId:'other-org'})).status).toBe(405);
  h.state.users[ids.admin].app_metadata={must_change_password:true};
  expect((await get(h,ids.admin)).data).toEqual({error:'PASSWORD_CHANGE_REQUIRED'});
});

test('7 an empty organization returns empty lists and zero counts',async()=>{
  const h=harness(),t=h.state.tables;t.participants.length=0;
  t.user_profiles.splice(0,t.user_profiles.length,...t.user_profiles.filter(p=>p.role==='admin'||p.organization_id!==ids.org));
  const r=await get(h,ids.admin);
  expect(r.status).toBe(200);
  expect(r.data).toMatchObject({totals:{participants:0,counselors:0,unassigned:0,unknownCounselor:0},counselors:[],companies:[],participants:[]});
});

test('9 company and pre-assessment counts agree with the progress API',async()=>{
  const h=seed(),d=(await get(h,ids.admin)).data,p=(await h.call(h.progress.handleAdminProgress,ids.admin)).data;
  expect(d.totals.participants).toBe(p.total);
  expect(d.companies.map(c=>[c.name,c.total])).toEqual(p.companies.map(c=>[c.name,c.total]));
  for(const state of ['notStarted','draft','submitted'])expect(d.participants.filter(x=>x.preStatus===state).length).toBe(p.pre[state]);
});

test('paged reads, failed reads and a missing organization row fail closed',async()=>{
  const big=harness(),t=big.state.tables;t.participants.length=0;big.state.pageSize=37;
  for(let i=0;i<250;i++){const id='q'+String(i).padStart(4,'0');t.participants.push({id,organization_id:ids.org,counselor_user_id:i%3?ids.counselor:null,auth_user_id:'u-'+id,display_name:'대상'+i,company_name:i%2?'홀':'짝'});t.server_login_lookup.push({user_id:'u-'+id,login_id:'login'+String(i).padStart(4,'0')})}
  const r=await get(big,ids.admin);
  expect(r.status).toBe(200);expect(r.data.participants).toHaveLength(250);expect(r.data.participants.every(p=>p.loginId?.startsWith('login'))).toBe(true);
  expect(r.data.totals).toMatchObject({participants:250,unassigned:84});expect(r.data.counselors[0].assigned).toBe(166);
  for(const table of ['participants','server_login_lookup','assessments']){
    const h=seed();h.state.failReadsOf=table;const failed=await get(h,ids.admin);
    expect(failed.status).toBe(503);expect(failed.data).toEqual({error:'QUERY_FAILED'});
  }
  const noOrg=seed();noOrg.state.tables.organizations.length=0;
  expect((await get(noOrg,ids.admin)).data).toEqual({error:'ORGANIZATION_QUERY_FAILED'});
  const bad=seed();bad.state.tables.assessments.push({id:'a-odd',participant_id:'d3',phase:'pre',status:'archived'});
  expect((await get(bad,ids.admin)).data).toEqual({error:'ASSESSMENT_STATE_INVALID'});
});

test('directory response check rejects lists and counts that disagree',async()=>{
  const {validDirectory,filterParticipants}=await import('../../src/live/admin-directory-view.js');
  const h=seed(),ok=(await get(h,ids.admin)).data;
  expect(validDirectory(ok)).toBe(true);
  const changes=[d=>{d.totals.participants=6},d=>{d.totals.unassigned=0},d=>{d.counselors[0].assigned=5},d=>{d.companies[0].total=3},d=>{d.participants.pop()},
    d=>{d.participants[0].counselorId='someone-else'},d=>{d.participants[0].preStatus='archived'},d=>{d.companies[1].name='가 기업'},d=>{d.scope='all'},d=>{d.participants[4].counselorId=C2}];
  for(const change of changes){const d=structuredClone(ok);change(d);expect(validDirectory(d)).toBe(false)}
  expect(filterParticipants(ok,{company:'1'}).map(p=>p.name)).toEqual(['참여-d3','참여-d5']);
  expect(filterParticipants(ok,{counselor:'unassigned'}).map(p=>p.name)).toEqual(['참여-d4']);
  expect(filterParticipants(ok,{counselor:ids.counselor,status:'submitted'}).map(p=>p.name)).toEqual(['참여-d1']);
  expect(filterParticipants(ok,{company:'2'}).map(p=>p.name)).toEqual(['참여-d4']);
});

// Browser screen with the same mock.
test.describe('admin screen',()=>{
  let server;
  test.beforeAll(async()=>{server=await serve('src')});
  test.afterAll(async()=>{await server.close()});
  async function open(page,h,{directoryStatus=null}={}){
    const calls=[];
    await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
    await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
      const request=route.request(),url=new URL(request.url()),body=request.postDataJSON(),token=request.headers().authorization?.replace(/^Bearer /,'');
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
      calls.push(url.pathname);let result;
      if(url.pathname.endsWith('/secondcareer-login')){const id=h.signIn(body.loginId,body.password)?.id;result=id?{status:200,data:{access_token:id,refresh_token:'refresh-'+id,expires_at:Math.floor(Date.now()/1000)+3600}}:{status:401,data:{error:'INVALID_CREDENTIALS'}}}
      else if(url.pathname.endsWith('/secondcareer-account'))result=await h.call(h.account.handleAccount,token,body,request.method());
      else if(url.pathname.endsWith('/secondcareer-register-participant'))result=await h.call(h.registration.handleRegistration,token,body,request.method());
      else if(url.pathname.endsWith('/secondcareer-admin-progress'))result=await h.call(h.progress.handleAdminProgress,token,body,request.method());
      else if(url.pathname.endsWith('/secondcareer-admin-companies'))result=await h.call(h.companies.handleAdminCompanies,token,body,request.method(),'https://fixture.invalid/'+url.search);
      else if(url.pathname.endsWith('/secondcareer-admin-directory'))result=directoryStatus?{status:directoryStatus,data:{error:'FIXTURE'}}:await h.call(h.directory.handleAdminDirectory,token,body,request.method());
      else if(url.pathname.endsWith('/secondcareer-assessment'))result={status:200,data:{profile:{role:'counselor',display_name:'상담사'},participants:[],assessments:[],counselors:{}}};
      else if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*'}});
      else throw Error('Unexpected API path: '+url.pathname);
      await route.fulfill({status:result.status,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body:JSON.stringify(result.data)});
    });
    await page.goto(server.url);
    return calls;
  }
  async function login(page,id='admin01'){await page.locator('#lg-id').fill(id);await page.locator('#lg-pw').fill('Fixture-password-123!');await page.getByRole('button',{name:'로그인',exact:true}).click()}
  const kpi=(page,key)=>page.locator(`#admin-directory [data-dir-kpi="${key}"] b`);

  test('admin sees counselors, companies and participants; filters work; progress, URL and registration stay',async({page})=>{
    const h=seed(),errors=[];page.on('pageerror',e=>errors.push(String(e)));await open(page,h);await login(page);
    await expect(page.getByRole('heading',{name:'관리자 페이지'})).toBeVisible();
    await expect(kpi(page,'participants')).toHaveText('5');await expect(kpi(page,'counselors')).toHaveText('2');
    await expect(kpi(page,'unassigned')).toHaveText('1');await expect(kpi(page,'unknown')).toHaveText('1');
    await expect(page.locator('#admin-progress [data-kpi="total"] b')).toHaveText('5');
    await expect(page.locator('[data-dir-scope]')).toContainText('운영 조직: 테스트 기업');
    const counselors=page.locator('[data-dir-counselors] tbody tr');
    await expect(counselors).toHaveCount(4);
    await expect(counselors.nth(0)).toHaveText(/김상담\s*counsel02\s*1/);await expect(counselors.nth(1)).toHaveText(/상담사\s*consult01\s*2/);
    await expect(counselors.nth(2)).toHaveText(/담당 상담사 미배정\s*-\s*1/);await expect(counselors.nth(3)).toHaveText(/담당 확인 필요\s*-\s*1/);
    await expect(page.locator('[data-dir-companies] tbody tr')).toHaveText([/가 기업\s*2\s*2/,/나 기업\s*2\s*1/,/소속기업 미지정\s*1\s*0/]);
    const rows=page.locator('[data-dir-participants] tbody tr[data-dir-participant]');
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(3)).toHaveText(/참여-d5\s*part0005\s*나 기업\s*담당 확인 필요\s*제출 완료/);
    await expect(rows.nth(4)).toHaveText(/참여-d4\s*part0004\s*소속기업 미지정\s*미배정\s*미시작/);
    await page.locator('#dir-company').selectOption({label:'가 기업'});await expect(rows).toHaveCount(2);
    await page.locator('#dir-status').selectOption('draft');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('참여-d2');
    await page.locator('#dir-company').selectOption('all');await page.locator('#dir-status').selectOption('all');
    await page.locator('#dir-counselor').selectOption('unassigned');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('참여-d4');
    await expect(page.locator('[data-dir-count]')).toHaveText('조건에 맞는 참여자 1명 / 등록 참여자 5명');
    const text=await page.locator('#admin-directory').innerText();
    for(const hidden of ['비밀 기업','other001','01099998888','응답원문'])expect(text).not.toContain(hidden);
    // URL setting and registration keep working; refreshing the lists keeps the other inputs.
    await page.getByLabel('진단 접속 주소 (HTTPS)').fill('https://example.invalid/assessment');
    await page.getByRole('button',{name:'주소 저장'}).click();await expect(page.getByText('진단 접속 주소를 저장했습니다.')).toBeVisible();
    await page.locator('#registration-counselor').selectOption(ids.counselor);
    for(const [label,value] of Object.entries({'이름':'신규등록','연락처':'010-2222-3333','소속기업':'가 기업'}))await page.getByRole('textbox',{name:`1행 ${label}`}).fill(value);
    await page.getByRole('button',{name:'실제 계정 일괄 등록'}).click();await expect(page.getByRole('cell',{name:'등록 완료',exact:true})).toBeVisible();
    await page.getByLabel('진단 접속 주소 (HTTPS)').fill('https://example.invalid/unsaved');
    await page.getByRole('button',{name:'관리 목록 다시 불러오기'}).click();
    await expect(kpi(page,'participants')).toHaveText('6');
    await expect(page.locator('#dir-counselor')).toHaveValue('unassigned');
    await page.locator('#dir-counselor').selectOption(ids.counselor);await expect(rows).toHaveCount(3);await expect(rows.filter({hasText:'신규등록'})).toHaveText(/신규등록\s*22223333\s*가 기업\s*상담사\s*미시작/);
    await expect(page.getByLabel('진단 접속 주소 (HTTPS)')).toHaveValue('https://example.invalid/unsaved');
    await expect(page.getByLabel('신규등록 임시 비밀번호')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('empty organization and refused lists are shown without breaking the rest of the page',async({page})=>{
    const empty=harness();empty.state.tables.participants.length=0;
    empty.state.tables.user_profiles.splice(0,empty.state.tables.user_profiles.length,...empty.state.tables.user_profiles.filter(p=>p.role==='admin'));
    await open(page,empty);await login(page);
    await expect(kpi(page,'participants')).toHaveText('0');
    await expect(page.locator('[data-dir-counselors]')).toContainText('등록된 상담사가 없습니다.');
    await expect(page.locator('[data-dir-participants]')).toContainText('등록된 참여자가 없습니다.');
    await page.getByRole('button',{name:'로그아웃',exact:true}).click();
    await open(page,seed(),{directoryStatus:403});await login(page);
    await expect(page.locator('#admin-directory-status')).toHaveText('운영 관리 목록을 조회할 권한이 없습니다.');
    await expect(page.locator('#admin-directory [data-dir-kpi]')).toHaveCount(0);
    await expect(page.locator('#admin-progress [data-kpi="total"] b')).toHaveText('5');
    await expect(page.getByRole('button',{name:'주소 저장'})).toBeVisible();
  });

  test('counselor screen does not call the admin directory',async({page})=>{
    const calls=await open(page,seed());await login(page,'consult01');
    await expect(page.getByRole('heading',{name:'상담사 페이지'})).toBeVisible();
    expect(calls.some(c=>c.includes('admin-directory'))).toBe(false);
  });
});
