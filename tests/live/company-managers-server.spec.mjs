import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
function setup(){const h=harness();h.state.managerEnabled=true;const company={id:randomUUID(),name:'허용 합성 고객사',organization_id:ids.org,status:'active'};h.state.tables.client_companies.push(company);return {h,company}}
const issueBody=(email='synthetic@example.invalid')=>({name:'합성 담당자',email,phone:'01000000000',requestId:randomUUID()});
const adminCall=(h,c,body=null,method=body?'POST':'GET',actor=ids.admin)=>h.call(h.managers.handleAdminCompanyManagers,actor,body,method,'https://fixture.invalid/?companyId='+c.id);
const context=(h,id,companyId=null)=>h.call(h.manager.handleCompanyManager,id,null,'GET','https://fixture.invalid/'+(companyId?'?companyId='+companyId:''));
const change=(h,id,password='Changed-manager-123!')=>h.call(h.manager.handleCompanyManager,id,{action:'change-password',password});

test('admin issues multiple managers; private mapping, initial change and minimal authorized context',async()=>{
  const {h,company:c}=setup();const first=await adminCall(h,c,issueBody());expect(first.status).toBe(201);
  const {managerId,loginId,temporaryPassword}=first.data;expect(loginId).toMatch(/^cm_[a-f0-9]{16}$/);expect(h.signIn(loginId,temporaryPassword)?.id).toBe(managerId);
  expect((await context(h,managerId)).data).toEqual({profile:{role:'company_manager'},mustChangePassword:true,companies:[]});
  expect((await change(h,managerId,temporaryPassword)).status).toBe(400);expect((await change(h,managerId,'short')).status).toBe(400);
  expect((await change(h,managerId)).data).toEqual({changed:true});expect(h.signIn(loginId,temporaryPassword)).toBeNull();
  expect(h.signIn(loginId,'Changed-manager-123!')?.id).toBe(managerId);
  const view=await context(h,managerId);expect(view.data).toEqual({profile:{role:'company_manager'},mustChangePassword:false,companies:[{id:c.id,name:c.name}]});
  expect((await h.call(h.account.handleAccount,managerId)).data).toEqual(view.data);
  expect((await adminCall(h,c,issueBody('another@example.invalid'))).status).toBe(201);
  const list=(await adminCall(h,c)).data;expect(list.managers).toHaveLength(2);expect(list.managers.every(m=>m.hasAccess&&m.status==='active')).toBe(true);
  expect(JSON.stringify(list)).not.toMatch(/password/i);expect(JSON.stringify(h.state.tables)).not.toContain(temporaryPassword);
});

test('status and access are fresh DB checks, metadata cannot widen scope; grants stay in the organization',async()=>{
  const {h,company:c}=setup(),r=await adminCall(h,c,issueBody()),id=r.data.managerId;
  await change(h,id);const other={id:randomUUID(),organization_id:ids.org,name:'다른 합성 고객사',status:'active'},foreign={id:randomUUID(),organization_id:'other-org',name:'타조직'};h.state.tables.client_companies.push(other,foreign);
  h.state.users[id].user_metadata={role:'admin',organization_id:'other-org',companyId:foreign.id};
  expect((await context(h,id,other.id)).status).toBe(403);expect((await context(h,id,foreign.id)).status).toBe(403);
  const patch=(c,body)=>adminCall(h,c,{managerId:id,...body},'PATCH');
  expect((await patch(other,{action:'grant'})).status).toBe(200);expect((await patch(other,{action:'grant'})).status).toBe(200);
  expect((await context(h,id,other.id)).data.companies).toEqual([{id:other.id,name:other.name}]);
  expect((await patch(foreign,{action:'grant'})).status).toBe(403);
  await patch(c,{action:'status',status:'suspended'});expect((await context(h,id)).status).toBe(403);expect((await h.call(h.account.handleAccount,id)).status).toBe(403);
  await patch(c,{action:'status',status:'active'});expect((await context(h,id)).status).toBe(200);
  await patch(c,{action:'revoke'});expect((await context(h,id,c.id)).status).toBe(403);
  await patch(other,{action:'revoke'});expect((await context(h,id)).status).toBe(403);expect((await change(h,id)).status).toBe(403);
});

test('company manager directly calling every existing personal/admin read and write API is denied',async()=>{
  const {h,company:c}=setup(),id=(await adminCall(h,c,issueBody())).data.managerId;await change(h,id);
  const before=structuredClone(h.state.tables.participants);
  for(const [handler,body,method,url] of [
    [h.progress.handleAdminProgress,null,'GET'],[h.directory.handleAdminDirectory,null,'GET'],[h.aggregate.handleAdminAggregate,null,'GET'],[h.adminReport.handleAdminReport,null,'GET','https://fixture.invalid/?id=existing-participant&kind=p'],
    [h.assessment,null,'GET'],[h.assessment,null,'GET','https://fixture.invalid/?id=existing-participant&kind=c'],[h.assessment,{action:'draft',answers:{}},'POST'],
    [h.companies.handleAdminCompanies,null,'GET'],[h.companies.handleAdminCompanies,{name:'x'},'POST'],[h.companies.handleAdminCompanies,{action:'assign',counselorUserId:ids.counselor},'PATCH','https://fixture.invalid/?id='+c.id+'&section=counselors'],
    [h.registration.handleRegistration,{displayName:'x'},'POST'],[h.account.handleAccount,{action:'update-assessment-url',assessmentUrl:'https://example.invalid'},'POST']
  ])expect((await h.call(handler,id,body,method,url)).status).toBe(403);
  expect((await adminCall(h,c,issueBody('bad@example.invalid'),'POST',id)).status).toBe(403);
  expect((await h.call(h.manager.handleCompanyManager,id,{action:'reset-password',managerId:ids.admin})).status).toBe(403);
  expect((await change(h,id)).status).toBe(403);expect(h.state.tables.participants).toEqual(before);
});

test('duplicates, request replay, Auth failure, completion loss/failure and recovery failure never re-disclose passwords',async()=>{
  for(const failure of ['none','failCreate','failManagerComplete','failManagerRecovery','loseManagerResponse']){
    const {h,company:c}=setup(),b=issueBody();if(failure==='failManagerRecovery'){h.state.failManagerComplete=true;h.state.failManagerRecovery=true}else if(failure!=='none')h.state[failure]=true;
    const r=await adminCall(h,c,b);expect(r.status,failure).toBe(['none','loseManagerResponse'].includes(failure)?201:503);
    if(r.status!==201)expect(r.data).not.toHaveProperty('temporaryPassword');
    expect((await adminCall(h,c,b)).status).toBe(409);expect((await adminCall(h,c,{...b,requestId:randomUUID(),email:b.email.toUpperCase()})).status).toBe(409);
    expect(h.state.created.length).toBe(failure==='failCreate'?0:1);expect(h.state.deleted||[]).toHaveLength(0);
    if(['failManagerComplete','failManagerRecovery'].includes(failure)){expect(h.state.tables.company_manager_accounts).toHaveLength(0);expect(h.state.tables.server_login_lookup.some(m=>m.user_id===h.state.created[0].id)).toBe(false)}
  }
});

test('invalid/foreign/unauthenticated admin requests, unavailable feature and DB errors fail closed',async()=>{
  const {h,company:c}=setup();for(const actor of [null,'expired',ids.counselor,ids.participant])expect((await adminCall(h,c,issueBody(),'POST',actor)).status).toBe([null,'expired'].includes(actor)?401:403);
  for(const b of [{...issueBody(),email:'bad'},{...issueBody(),phone:'abc'},{...issueBody(),name:''},{...issueBody(),organization_id:ids.org}])expect((await adminCall(h,c,b)).status).toBe(400);
  expect((await adminCall(h,{id:randomUUID()},issueBody())).status).toBe(403);
  h.state.managerEnabled=false;expect((await adminCall(h,c,issueBody())).status).toBe(503);h.state.managerEnabled=true;
  h.state.failWritesOf='company_manager_registration_requests';expect((await adminCall(h,c,issueBody())).status).toBe(503);expect(h.state.created).toHaveLength(0);
});

test('concurrent issuance reserves one email, and DB state/read failures cannot report success or expose context',async()=>{
  const {h,company:c}=setup();const results=await Promise.all([adminCall(h,c,issueBody()),adminCall(h,c,issueBody())]);
  expect(results.map(r=>r.status).sort()).toEqual([201,409]);expect(h.state.created).toHaveLength(1);
  const id=results.find(r=>r.status===201).data.managerId;await change(h,id);
  h.state.failWritesOf='company_manager_accounts';expect((await adminCall(h,c,{action:'status',managerId:id,status:'suspended'},'PATCH')).status).toBe(503);expect(h.state.tables.company_manager_accounts[0].status).toBe('active');
  h.state.failWritesOf=null;h.state.failReadsOf='company_manager_access';expect((await context(h,id)).status).toBe(503);expect((await context(h,id)).data).not.toHaveProperty('companies');
  h.state.failReadsOf=null;
  for(const [action,extra] of [['status',{status:'inactive'}],['revoke',{}]])expect((await adminCall(h,c,{action,managerId:id,...extra},'PATCH',id)).status).toBe(403);
});

test('password partial failure retains DB gate; original legacy roles and passwords remain usable',async()=>{
  const {h,company:c}=setup(),r=await adminCall(h,c,issueBody()),id=r.data.managerId;h.state.failUpdate=true;expect((await change(h,id)).status).toBe(503);expect((await context(h,id)).data.mustChangePassword).toBe(true);
  h.state.failUpdate=false;h.state.failManagerPassword=true;expect((await change(h,id)).status).toBe(503);expect(h.signIn(r.data.loginId,'Changed-manager-123!')?.id).toBe(id);expect((await context(h,id)).data.mustChangePassword).toBe(true);
  h.state.failManagerPassword=false;expect((await change(h,id,'Another-manager-123!')).status).toBe(200);
  for(const login of ['admin01','consult01','client01'])expect(h.signIn(login,'Fixture-password-123!')).toBeTruthy();
});

test('SQL proposal fails before unreviewed role CHECK replacement, scopes FKs and restricts clients and RPCs',()=>{
  const sql=fs.readFileSync('supabase/proposals/company-manager-accounts.sql','utf8');
  expect(sql).toContain('__REVIEW_EXACT_PG_GET_CONSTRAINTDEF__');expect(sql).toContain('actual is distinct from reviewed_check_definition');expect(sql).toContain('company_manager_deny');expect(sql).toContain('as restrictive for all to authenticated');
  expect(sql).toContain('foreign key(organization_id,manager_user_id)');expect(sql).toContain("role in ('participant','counselor','admin','company_manager')");expect(sql).toContain('from public,anon,authenticated,service_role');
  expect(sql).not.toMatch(/delete from (?:auth|public\.(?:participants|assessments))/i);expect(sql).toContain('for update');
});
