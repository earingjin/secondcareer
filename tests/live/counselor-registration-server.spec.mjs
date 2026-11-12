import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
const setup=()=>{const h=harness();h.state.counselorEnabled=true;return h};
const input=()=>({name:'합성 상담사',loginId:'new_counselor',requestId:randomUUID()});
const issue=(h,b=input(),token=ids.admin)=>h.call(h.counselors.handleAdminCounselors,token,b);

test('counselor list batches only scoped IDs and handles a low row limit and missing mappings',async()=>{
  const h=setup();h.state.pageSize=17;
  for(let i=0;i<250;i++){
    const id=`30000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
    h.state.tables.user_profiles.push({user_id:id,organization_id:ids.org,role:'counselor',display_name:`상담사 ${i}`});
    if(i!==20)h.state.tables.server_login_lookup.push({user_id:id,login_id:`account_${String(i).padStart(4,'0')}`,internal_email:'secret@example.invalid'});
  }
  const r=await h.call(h.counselors.handleAdminCounselors,ids.admin);
  expect(r.status).toBe(200);expect(r.data.counselors).toHaveLength(251);
  expect(r.data.counselors.find(c=>c.name==='상담사 20').loginId).toBeNull();
  expect(r.data.counselors.find(c=>c.name==='상담사 249').loginId).toBe('account_0249');
  expect(r.data.counselors.some(c=>c.id===ids.other)).toBe(false);
  expect(JSON.stringify(r.data)).not.toMatch(/secret@example|internal_email|password/);
  const queries=h.state.reads.filter(r=>r.table==='server_login_lookup');
  expect(queries.length).toBeLessThan(30);
  for(const q of queries){
    expect(q.columns).toBe('user_id,login_id');
    const filter=q.filters.find(f=>f[0]==='user_id'&&f[2]==='in');
    expect(filter[1].length).toBeLessThanOrEqual(100);expect(filter[1]).not.toContain(ids.other);
  }
});

test('duplicate mappings across page boundaries, invalid IDs and lookup errors fail closed',async()=>{
  for(const kind of ['duplicate-user','duplicate-login','invalid-login','read-error']){
    const h=setup();h.state.pageSize=1;
    const id=randomUUID();h.state.tables.user_profiles.push({user_id:id,organization_id:ids.org,role:'counselor',display_name:'다른 상담사'});
    h.state.tables.server_login_lookup.push({user_id:id,login_id:kind==='duplicate-login'?'consult01':'other_counselor',internal_email:'hidden'});
    if(kind==='duplicate-user')h.state.tables.server_login_lookup.push({user_id:id,login_id:'second_login',internal_email:'hidden'});
    if(kind==='invalid-login')h.state.tables.server_login_lookup.find(m=>m.user_id===id).login_id='BAD LOGIN';
    if(kind==='read-error')h.state.failReadsOf='server_login_lookup';
    const r=await h.call(h.counselors.handleAdminCounselors,ids.admin);
    expect(r.status,kind).toBe(503);expect(r.data).toEqual({error:'COUNSELOR_QUERY_FAILED'});expect(r.data).not.toHaveProperty('counselors');
  }
});

test('issue, first password gate, change and existing many-company assignment preserve records',async()=>{
  const h=setup(),before=JSON.stringify([h.state.tables.participants,h.state.tables.assessments,h.state.tables.assessment_history]);
  const r=await issue(h,{...input(),loginId:' New_Counselor '});expect(r.status).toBe(201);
  const {counselorId:id,temporaryPassword:pw}=r.data;expect(r.data.loginId).toBe('new_counselor');expect(pw.length).toBeGreaterThanOrEqual(12);
  expect(h.signIn('new_counselor',pw)?.id).toBe(id);
  expect((await h.call(h.account.handleAccount,id)).data.mustChangePassword).toBe(true);
  expect((await h.call(h.assessment,id)).status).toBe(403);
  expect((await h.call(h.registration.handleRegistration,id,{displayName:'합성 내담자',phone:'01012345678',requestId:randomUUID()})).data.error).toBe('PASSWORD_CHANGE_REQUIRED');
  expect((await h.call(h.account.handleAccount,id,{action:'change-password',password:pw})).status).toBe(400);
  h.state.failUpdate=true;expect((await h.call(h.account.handleAccount,id,{action:'change-password',password:'Changed-password-123!'})).status).toBe(503);
  expect((await h.call(h.account.handleAccount,id)).data.mustChangePassword).toBe(true);h.state.failUpdate=false;
  expect((await h.call(h.account.handleAccount,id,{action:'change-password',password:'Changed-password-123!'})).status).toBe(200);
  expect(h.signIn('new_counselor',pw)).toBeNull();expect(h.signIn('new_counselor','Changed-password-123!')?.id).toBe(id);
  expect((await h.call(h.assessment,id)).status).toBe(200);
  expect((await h.call(h.account.handleAccount,id)).data.mustChangePassword).toBe(false);
  for(let n=0;n<2;n++){
    const companyId=randomUUID();h.state.tables.client_companies.push({id:companyId,organization_id:ids.org,name:'합성 고객사',status:'active'});
    const url=`https://fixture.invalid/?id=${companyId}&section=counselors`,handler=h.companies.handleAdminCompanies;
    const list=await h.call(handler,ids.admin,null,'GET',url);expect(list.data.counselors).toContainEqual({id,name:'합성 상담사'});
    const body={action:'assign',counselorUserId:id};expect((await h.call(handler,ids.admin,body,'PATCH',url)).status).toBe(201);
    expect((await h.call(handler,ids.admin,body,'PATCH',url)).status).toBe(409);
    expect((await h.call(handler,ids.admin,{...body,action:'unassign'},'PATCH',url)).status).toBe(200);
  }
  expect(JSON.stringify([h.state.tables.participants,h.state.tables.assessments,h.state.tables.assessment_history])).toBe(before);
  const list=await h.call(h.counselors.handleAdminCounselors,ids.admin);expect(list.data.counselors).toContainEqual({id,name:'합성 상담사',loginId:'new_counselor'});
  expect(JSON.stringify(list.data)).not.toMatch(/password|internal_email|digest/);
  expect(JSON.stringify(h.state.tables)).not.toContain(pw);
});

test('role, org, scope, feature and validation fail closed',async()=>{
  const h=setup();for(const token of [null,ids.counselor,ids.participant,ids.other])expect((await issue(h,input(),token)).status).toBe(token?403:401);
  const handler=h.counselors.handleAdminCounselors;
  expect((await h.call(handler,ids.admin,input(),'POST','https://fixture.invalid/?organization_id=other')).status).toBe(400);
  for(const b of [{...input(),organization_id:ids.org},{...input(),role:'admin'},{...input(),loginId:'123'},{...input(),name:''},{...input(),name:'x\ny'}])expect((await issue(h,b)).status).toBe(400);
  h.state.counselorEnabled=false;expect((await issue(h)).data.error).toBe('COUNSELOR_NOT_CONFIGURED');expect(h.state.created).toHaveLength(0);
  h.state.counselorEnabled=true;await issue(h);
  h.state.tables.user_profiles.find(p=>p.user_id===ids.other).role='admin';
  const list=await h.call(handler,ids.other);expect(list.data.counselors).toEqual([]);
  expect((await issue(h,{...input(),loginId:'other_counselor'},ids.other)).status).toBe(201);
  expect((await h.call(handler,ids.admin)).data.counselors.some(c=>c.loginId==='other_counselor')).toBe(false);
});

test('normalized duplicates, concurrent requests and reused request IDs never create twice',async()=>{
  const h=setup(),b=input(),results=await Promise.all([issue(h,b),issue(h,b)]);
  expect(results.map(r=>r.status).sort()).toEqual([201,409]);expect(h.state.created).toHaveLength(1);
  expect((await issue(h,{...input(),loginId:'NEW_COUNSELOR'})).status).toBe(409);
  expect((await issue(h,{...b,loginId:'another_id'})).status).toBe(409);expect(h.state.created).toHaveLength(1);
  expect((await issue(h,{...input(),loginId:'admin01'})).status).toBe(409);
});

test('Auth/completion failure or response loss keeps reservation and never discloses secrets on retry',async()=>{
  for(const flag of ['failCreate','failCounselorComplete','throwCounselorComplete']){
    const h=setup();h.state[flag]=true;const b=input(),r=await issue(h,b);
    expect(r.status).toBe(503);expect(r.data).toEqual({error:'COUNSELOR_OUTCOME_UNKNOWN'});
    h.state[flag]=false;expect((await issue(h,b)).status).toBe(409);expect(h.state.created.length).toBe(flag==='failCreate'?0:1);
    expect(h.state.deleted||[]).toEqual([]);expect(JSON.stringify(h.state.tables)).not.toMatch(/password/);
  }
  const h=setup();h.state.failCounselorReserve=true;expect((await issue(h)).status).toBe(503);expect(h.state.created).toHaveLength(0);
});

test('completion response loss is confirmed for the same Auth user without creating again',async()=>{
  const h=setup();h.state.loseCounselorResponse=true;
  expect((await issue(h)).status).toBe(201);expect(h.state.created).toHaveLength(1);expect(h.state.tables.user_profiles.filter(p=>p.role==='counselor'&&p.organization_id===ids.org)).toHaveLength(2);
});

test('existing roles and passwords remain usable; SQL is explicitly blocked pending review',async()=>{
  const h=setup();await issue(h);
  for(const id of ['admin01','consult01','client01'])expect(h.signIn(id,'Fixture-password-123!')).toBeTruthy();
  expect((await h.call(h.account.handleAccount,ids.counselor,{action:'change-password',password:'Changed-password-123!'})).status).toBe(403);
  const sql=fs.readFileSync('supabase/proposals/counselor-registration.sql','utf8');
  expect(sql).toContain('SCHEMA_REVIEW_REQUIRED');expect(sql).toContain('for update');expect(sql).toContain('security invoker');expect(sql).toContain('from public,anon,authenticated');expect(sql).not.toMatch(/delete from|alter table public\.(participants|user_profiles|server_login_lookup)/i);
});

test('unchanged login handler accepts new counselor and all existing roles under the same Auth mapping contract',async()=>{
  const h=setup(),r=await issue(h),pw=r.data.temporaryPassword;
  expect((await h.call(h.login,null,{loginId:'NEW_COUNSELOR',password:pw})).data.access_token).toBe(r.data.counselorId);
  for(const loginId of ['admin01','consult01','client01'])expect((await h.call(h.login,null,{loginId,password:'Fixture-password-123!'})).status).toBe(200);
  const companyId=randomUUID(),email='manager@example.invalid';h.state.managerEnabled=true;
  h.state.tables.client_companies.push({id:companyId,organization_id:ids.org,name:'합성 고객사',status:'active'});
  const manager=await h.call(h.managers.handleAdminCompanyManagers,ids.admin,{name:'합성 담당자',email,phone:'01000000000',requestId:randomUUID()},'POST','https://fixture.invalid/?companyId='+companyId);
  expect(manager.status).toBe(201);
  h.state.tables.company_manager_accounts[0].email_key=email; // DB-generated column in the real contract.
  expect((await h.call(h.login,null,{loginId:email,password:manager.data.temporaryPassword})).data.access_token).toBe(manager.data.managerId);
  await h.call(h.account.handleAccount,r.data.counselorId,{action:'change-password',password:'Changed-password-123!'});
  expect((await h.call(h.login,null,{loginId:'new_counselor',password:pw})).status).toBe(401);
  expect((await h.call(h.login,null,{loginId:'new_counselor',password:'Changed-password-123!'})).status).toBe(200);
});
