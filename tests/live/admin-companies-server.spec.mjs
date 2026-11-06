import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {ITEM_COUNT} from '../../src/js/02-eval-config.js';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
export const fields=(over={})=>({name:'합성 고객사 Alpha',start_date:'2026-11-01',end_date:'2027-02-28',pm_name:'가상 PM',pm_email:'pm@example.invalid',pm_phone:'010-0000-0000',...over});
const call=(h,method='GET',body,query='',token=ids.admin)=>h.call(h.companies.handleAdminCompanies,token,body,method,'https://fixture.invalid/'+query);
const snapshot=h=>JSON.stringify(Object.fromEntries(['participants','assessments','user_profiles','server_login_lookup','assessment_history'].map(k=>[k,h.state.tables[k]])));

test('admin creates multiple independent masters with no participants, edits and toggles status without changing diagnosis/account tables',async()=>{
  const h=harness();h.state.tables.participants.length=0;const before=snapshot(h);
  const a=await call(h,'POST',fields()),b=await call(h,'POST',fields({name:'두 번째 합성 고객사'}));
  expect([a.status,b.status]).toEqual([201,201]);expect(a.data.company.status).toBe('active');
  expect(a.data.company.id).not.toBe(b.data.company.id);expect(a.data.company.organization_id).toBeUndefined();
  const listed=await call(h);expect(listed.data.total).toBe(2);expect(listed.data.companies[0].name).toBe(b.data.company.name);
  expect(listed.data.companies[0].pm_email).toBeUndefined();expect(listed.data.companies[0].pm_phone).toBeUndefined();
  const id=a.data.company.id,q='?id='+id;
  let c=(await call(h,'GET',undefined,q)).data.company;expect(c.pm_email).toBe('pm@example.invalid');
  const updated=await call(h,'PATCH',{name:'수정한 합성 고객사',pm_name:'가상 PM 수정',expectedUpdatedAt:c.updated_at},q);
  expect(updated.status).toBe(200);c=updated.data.company;expect(c.name).toBe('수정한 합성 고객사');
  for(const status of ['inactive','active']){const r=await call(h,'PATCH',{status,expectedUpdatedAt:c.updated_at},q);expect(r.status).toBe(200);c=r.data.company;expect(c.status).toBe(status)}
  expect(snapshot(h)).toBe(before);expect(h.state.tables.client_companies).toHaveLength(2);
  expect(h.state.writes.every(w=>w.table==='client_companies')).toBe(true);
});

test('DB unique-name conflicts include whitespace and English case, inactive names, and concurrent creates; other organizations may reuse names',async()=>{
  const h=harness(),a=(await call(h,'POST',fields({name:'  ACME   Test  '}))).data.company;
  expect(a.name).toBe('ACME Test');
  for(const name of ['acme test',' Acme  Test ','ACME\tTest'])expect((await call(h,'POST',fields({name}))).status).toBe(409);
  await call(h,'PATCH',{status:'inactive',expectedUpdatedAt:a.updated_at},'?id='+a.id);
  expect((await call(h,'POST',fields({name:'acme test'}))).data).toEqual({error:'COMPANY_NAME_UNAVAILABLE'});
  h.state.tables.user_profiles.find(p=>p.user_id===ids.other).role='admin';
  expect((await call(h,'POST',fields({name:'acme test'}),'',ids.other)).status).toBe(201);
  const results=await Promise.all([call(h,'POST',fields({name:'경합 고객사'})),call(h,'POST',fields({name:'경합 고객사'}))]);
  expect(results.map(r=>r.status).sort()).toEqual([201,409]);
  const c=(await call(h,'POST',fields({name:'수정 중복 대상'}))).data.company;
  expect((await call(h,'PATCH',{name:'Acme Test',expectedUpdatedAt:c.updated_at},'?id='+c.id)).status).toBe(409);
});

test('status transitions leave populated participant, response, report, profile and history data byte-for-byte unchanged',async()=>{
  const h=harness();
  h.state.tables.assessments.push({id:'synthetic-assessment',participant_id:'existing-participant',phase:'pre',status:'submitted',answers:{pre:Array(ITEM_COUNT).fill(3)},result:{marker:'synthetic-report-only'}});
  h.state.tables.assessment_history.push({id:'synthetic-history',assessment_id:'synthetic-assessment',marker:'synthetic-history-only'});
  const before=snapshot(h);let c=(await call(h,'POST',fields({name:'진단 데이터와 독립된 합성 고객사'}))).data.company;
  for(const status of ['inactive','active']){const r=await call(h,'PATCH',{status,expectedUpdatedAt:c.updated_at},'?id='+c.id);expect(r.status).toBe(200);c=r.data.company;expect(snapshot(h)).toBe(before)}
});

test('required fields, unknown properties, invalid calendar dates/email/phone and invalid parameters fail before writes',async()=>{
  const h=harness();
  for(const over of [{name:''},{name:' '.repeat(5)},{pm_name:null},{pm_email:'not-an-email'},{pm_phone:'abc123'},{start_date:'2026-02-30'},{start_date:'2027-03-01'},{end_date:'2026-2-01'},{name:'x'.repeat(201)},{status:'inactive'},{organization_id:ids.org},{id:ids.org},{created_at:'2026-01-01'}])expect((await call(h,'POST',fields(over))).status,JSON.stringify(over)).toBe(400);
  const missing=fields();delete missing.end_date;expect((await call(h,'POST',missing)).status).toBe(400);
  for(const query of ['?organization_id=other-org','?page=0','?page=-1','?page=1.5','?pageSize=10000','?status=deleted','?page=1&page=2','?id=bad','?id='+ids.admin+'&status=all'])expect((await call(h,'GET',undefined,query)).status,query).toBe(400);
  expect(h.state.writes).toHaveLength(0);
  expect((await call(h,'DELETE')).status).toBe(405);
  const opt=await h.companies.handleAdminCompanies(new Request('https://fixture.invalid/',{method:'OPTIONS'}));expect(opt.status).toBe(204);expect(opt.headers.get('access-control-allow-methods')).toContain('PATCH');
});

test('every detail/write uses server organization; foreign and absent IDs have identical refusal and stale updates cannot overwrite',async()=>{
  const h=harness(),a=(await call(h,'POST',fields())).data.company;
  h.state.tables.user_profiles.find(p=>p.user_id===ids.other).role='admin';
  const b=(await call(h,'POST',fields(),' ',ids.other)).data.company;
  for(const id of [b.id,'ffffffff-ffff-4fff-8fff-ffffffffffff'])for(const method of ['GET','PATCH']){
    const r=await call(h,method,method==='PATCH'?{status:'inactive',expectedUpdatedAt:b.updated_at}:undefined,'?id='+id);expect(r.status).toBe(403);expect(r.data).toEqual({error:'FORBIDDEN'});
  }
  const q='?id='+a.id,body={pm_name:'첫 수정',expectedUpdatedAt:a.updated_at};
  expect((await call(h,'PATCH',body,q)).status).toBe(200);
  expect((await call(h,'PATCH',{...body,pm_name:'뒤늦은 덮어쓰기'},q)).data).toEqual({error:'COMPANY_CONFLICT'});
  expect((await call(h,'PATCH',{organization_id:'other-org',expectedUpdatedAt:a.updated_at},q)).status).toBe(400);
  for(const read of h.state.reads.filter(r=>r.table==='client_companies'))expect(read.filters.some(([k])=>k==='organization_id')).toBe(true);
  for(const write of h.state.writes.filter(w=>w.operation==='update')){expect(write.filters.some(([k])=>k==='organization_id')).toBe(true);expect(write.filters.some(([k])=>k==='id')).toBe(true)}
});

test('counselor, participant, unrecognized roles, invalid and absent tokens cannot access any company endpoint',async()=>{
  const h=harness();
  h.state.users[ids.counselor].user_metadata={role:'admin',organization_id:ids.org};
  for(const [token,status] of [[ids.counselor,403],[ids.participant,403],[null,401],['expired-token',401]])for(const method of ['GET','POST','PATCH']){
    const r=await call(h,method,method==='GET'?undefined:fields(),method==='PATCH'?'?id='+ids.admin:'',token);expect(r.status).toBe(status);
  }
  expect(h.state.reads.some(r=>r.table==='client_companies')).toBe(false);expect(h.state.writes).toHaveLength(0);
  h.state.tables.user_profiles.find(p=>p.user_id===ids.other).role='manager';expect((await call(h,'GET',undefined,'',ids.other)).status).toBe(403);
});

test('failed database reads/writes and an unconfirmed write cannot report success or leak upstream errors',async()=>{
  const h=harness(),a=(await call(h,'POST',fields())).data.company;
  h.state.failWritesOf='client_companies';
  const before=JSON.stringify(h.state.tables.client_companies);
  for(const [m,b,q] of [['POST',fields({name:'실패할 고객사'}),''],['PATCH',{status:'inactive',expectedUpdatedAt:a.updated_at},'?id='+a.id]]){const r=await call(h,m,b,q);expect(r.status).toBe(503);expect(r.data).toEqual({error:'COMPANY_QUERY_FAILED'})}
  expect(JSON.stringify(h.state.tables.client_companies)).toBe(before);
  h.state.failReadsOf='client_companies';expect((await call(h)).status).toBe(503);expect((await call(h,'GET',undefined,'?id='+a.id)).status).toBe(503);
  h.state.failReadsOf=null;h.state.failWritesOf=null;h.state.companyNoReturn=true;
  expect((await call(h,'POST',fields({name:'결과 미확인 합성'}))).status).toBe(503);
});

test('260 masters are searched, status-filtered and paginated in DB with stable ordering and minimal projections',async()=>{
  const h=harness();
  for(let i=0;i<260;i++)h.state.tables.client_companies.push({...fields({name:'합성 '+String(i).padStart(3,'0')}),id:'30000000-0000-4000-8000-'+String(i).padStart(12,'0'),organization_id:i===259?'other-org':ids.org,status:i%2?'active':'inactive',created_at:new Date(Date.UTC(2026,0,1,0,i)).toISOString(),updated_at:new Date().toISOString()});
  const seen=[];for(let page=1;page<=13;page++){const r=await call(h,'GET',undefined,'?page='+page);expect(r.data.total).toBe(259);expect(r.data.companies.length).toBeLessThanOrEqual(20);seen.push(...r.data.companies.map(c=>c.id))}
  expect(new Set(seen).size).toBe(259);expect(seen).not.toContain('30000000-0000-4000-8000-000000000259');
  const r=await call(h,'GET',undefined,'?search='+encodeURIComponent('합성 01')+'&status=active&pageSize=10');expect(r.data.total).toBe(5);expect(r.data.companies.every(c=>c.name.startsWith('합성 01')&&c.status==='active')).toBe(true);
  for(const read of h.state.reads.filter(r=>r.table==='client_companies')){expect(read.range).not.toBeNull();expect(read.columns).not.toContain('pm_email');expect(read.columns).not.toContain('pm_phone')}
});

test('unapplied SQL proposal has atomic install, collision guard, DB uniqueness, constraints, RLS and no client/delete privileges',()=>{
  const sql=fs.readFileSync('supabase/proposals/client-companies.sql','utf8');
  expect(sql).toMatch(/begin;[\s\S]*commit;/i);expect(sql).toContain('SCHEMA_REVIEW_REQUIRED');
  expect(sql).toMatch(/unique \(organization_id, name_key\)/);expect(sql).toMatch(/end_date >= start_date/);
  expect(sql).toMatch(/enable row level security/i);expect(sql).toMatch(/revoke all on table public.client_companies from public, anon, authenticated, service_role/i);
  expect(sql).not.toMatch(/create policy|security definer|grant\s+(all|delete|truncate)|alter table public\.(participants|assessments|user_profiles)/i);
  expect(sql).toMatch(/references public.organizations\(id\) on delete restrict/);
});
