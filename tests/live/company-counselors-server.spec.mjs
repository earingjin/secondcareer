import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
const company=(h,org=ids.org)=>{const c={id:randomUUID(),organization_id:org,name:'합성 고객사',status:'active'};h.state.tables.client_companies.push(c);return c};
const counselor=h=>{const c={user_id:randomUUID(),organization_id:ids.org,role:'counselor',display_name:'합성 상담사'};h.state.tables.user_profiles.push(c);return c.user_id};
const call=(h,c,body=null,token=ids.admin,query='')=>h.call(h.companies.handleAdminCompanies,token,body,body?'PATCH':'GET',`https://fixture.invalid/?id=${c.id}&section=counselors${query}`);
const write=(h,c,id,action='assign')=>call(h,c,{action,counselorUserId:id});

test('many-to-many assignments are independent, projected and paged past Data API limits',async()=>{
  const h=harness(),a=company(h),b=company(h),cs=[ids.counselor,...Array.from({length:6},()=>counselor(h))];
  for(const id of cs)expect((await write(h,a,id)).status).toBe(201);
  expect((await write(h,{id:b.id.toUpperCase()},ids.counselor.toUpperCase())).status).toBe(201);
  h.state.pageSize=2;
  const r=await call(h,a);expect(r.status).toBe(200);expect(r.data.companyId).toBe(a.id);
  expect(r.data.counselors).toHaveLength(7);expect(r.data.assignments).toHaveLength(7);
  expect((await call(h,{id:b.id.toUpperCase()})).data.assignments).toHaveLength(1);
  expect(JSON.stringify(r.data)).not.toMatch(/phone|email|login_id|organization_id|participant/i);
  expect(h.state.reads.filter(r=>r.table==='client_company_counselors').every(r=>r.filters.some(f=>f[0]==='organization_id'&&f[1]===ids.org))).toBe(true);
});

test('foreign/missing company and counselor, non-counselor targets and malformed/extra parameters are refused',async()=>{
  const h=harness(),c=company(h),foreign=company(h,'other-org'),missing={id:randomUUID()};
  for(const target of [foreign,missing])for(const body of [null,{action:'assign',counselorUserId:ids.counselor},{action:'unassign',counselorUserId:ids.counselor}])expect((await call(h,target,body)).status).toBe(403);
  for(const id of [ids.other,ids.admin,ids.participant,randomUUID()])for(const action of ['assign','unassign'])expect((await write(h,c,id,action)).status).toBe(403);
  for(const body of [{action:'assign',counselorUserId:[ids.counselor]},{action:'delete',counselorUserId:ids.counselor},{action:'assign',counselorUserId:ids.counselor,organization_id:ids.org},{action:'assign'}])expect((await call(h,c,body)).status).toBe(400);
  for(const query of ['&organization_id=x','&page=1','&section=counselors'])expect((await call(h,c,null,ids.admin,query)).status).toBe(400);
  expect((await call(h,{id:'bad'})).status).toBe(400);expect(h.state.tables.client_company_counselors).toHaveLength(0);
});

test('all operations require a fresh authenticated admin, not counselor/participant/customer manager',async()=>{
  const h=harness(),c=company(h);
  for(const token of [null,'expired',ids.counselor,ids.participant])for(const body of [null,{action:'assign',counselorUserId:ids.counselor},{action:'unassign',counselorUserId:ids.counselor}])expect((await call(h,c,body,token)).status).toBe([null,'expired'].includes(token)?401:403);
  h.state.tables.user_profiles.find(p=>p.user_id===ids.admin).role='manager';expect((await call(h,c)).status).toBe(403);
  h.state.tables.user_profiles.find(p=>p.user_id===ids.admin).role='admin';h.state.users[ids.admin].app_metadata.must_change_password=true;expect((await call(h,c)).status).toBe(403);
  expect(h.state.writes).toHaveLength(0);
});

test('deactivation preserves assignments; removing one relation never changes participant/auth/diagnosis/report records',async()=>{
  const h=harness(),a=company(h),b=company(h),other=counselor(h);
  h.state.tables.assessments.push({id:'synthetic-report',participant_id:'existing-participant',phase:'pre',status:'submitted',result:{synthetic:true}});
  h.state.tables.assessment_history.push({id:'synthetic-history'});
  const before=structuredClone(h.state.tables);delete before.client_companies;delete before.client_company_counselors;
  for(const [c,id] of [[a,ids.counselor],[a,other],[b,ids.counselor]])expect((await write(h,c,id)).status).toBe(201);
  a.status='inactive';expect((await call(h,a)).data.assignments).toHaveLength(2);
  expect((await write(h,a,ids.counselor,'unassign')).data.changed).toBe(true);
  expect((await write(h,a,ids.counselor,'unassign')).data.changed).toBe(false);
  // Inactive master status does not create an extra assignment permission rule.
  expect((await write(h,a,ids.counselor)).status).toBe(201);
  const after=structuredClone(h.state.tables);delete after.client_companies;delete after.client_company_counselors;expect(after).toEqual(before);
  expect(h.state.created).toHaveLength(0);expect(h.state.updated).toHaveLength(0);expect((await call(h,b)).data.assignments).toHaveLength(1);
});

test('concurrent adds conflict on the DB key; repeated concurrent removals are idempotent',async()=>{
  const h=harness(),c=company(h);
  const add=await Promise.all([write(h,c,ids.counselor),write(h,c,ids.counselor)]);
  expect(add.map(r=>r.status).sort()).toEqual([201,409]);expect(add.find(r=>r.status===409).data.error).toBe('ASSIGNMENT_EXISTS');
  expect(h.state.tables.client_company_counselors).toHaveLength(1);
  const remove=await Promise.all([write(h,c,ids.counselor,'unassign'),write(h,c,ids.counselor,'unassign')]);
  expect(remove.map(r=>r.data.changed).sort()).toEqual([false,true]);expect(h.state.tables.client_company_counselors).toHaveLength(0);
});

test('DB errors, FK races and missing write confirmation fail closed without false success',async()=>{
  for(const stage of ['companyRead','profileRead','relationRead','add','remove','roleRace','orgRace','companyRace','noReturn']){
    const h=harness(),c=company(h);
    if(stage==='remove')await write(h,c,ids.counselor);
    if(stage==='companyRead')h.state.failReadsOf='client_companies';if(stage==='profileRead')h.state.failReadsOf='user_profiles';if(stage==='relationRead')h.state.failReadsOf='client_company_counselors';
    if(['add','remove'].includes(stage))h.state.failWritesOf='client_company_counselors';
    if(stage==='roleRace')h.state.beforeAssignmentWrite=()=>h.state.tables.user_profiles.find(p=>p.user_id===ids.counselor).role='participant';
    if(stage==='orgRace')h.state.beforeAssignmentWrite=()=>h.state.tables.user_profiles.find(p=>p.user_id===ids.counselor).organization_id='other-org';
    if(stage==='companyRace')h.state.beforeAssignmentWrite=()=>{c.organization_id='other-org'};
    if(stage==='noReturn')h.state.assignmentNoReturn=true;
    const r=stage.endsWith('Read')?await call(h,c):await write(h,c,ids.counselor,stage==='remove'?'unassign':'assign');
    expect(r.status,stage).toBe(stage.endsWith('Race')?409:503);expect(r.data).not.toHaveProperty('assigned');
    if(['add','roleRace','orgRace','companyRace'].includes(stage))expect(h.state.tables.client_company_counselors).toHaveLength(0);
    if(stage==='remove')expect(h.state.tables.client_company_counselors).toHaveLength(1);
  }
});

test('unapplied SQL is additive, restricts role/org relationships, blocks direct clients and has no participant writes',()=>{
  const sql=fs.readFileSync('supabase/proposals/client-company-counselors.sql','utf8'),code=sql.replace(/--[^\n]*/g,'');
  expect(code).toContain('primary key(organization_id,company_id,counselor_user_id)');expect(code).toContain("generated always as ('counselor'::text) stored");
  expect(code).toContain('foreign key(organization_id,counselor_user_id,counselor_role)');expect(code).toContain('references public.client_companies(organization_id,id)');
  expect(code).toContain('enable row level security');expect(code).toContain('from public,anon,authenticated,service_role');expect(code).toContain('grant select,delete');
  expect(code).not.toMatch(/\b(?:drop|cascade)\b|create or replace|\b(?:update|insert into|delete from) public\.(?:participants|assessments|user_profiles|client_companies)\b/i);
  expect(code).toContain('on update restrict on delete restrict');expect(code).toContain('begin;');expect(code).toContain('commit;');
});
