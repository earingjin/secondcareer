import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
const uuid=()=>crypto.randomUUID();
function fixture(){
  const h=harness(),a={id:uuid(),organization_id:ids.org,name:'A기업',status:'active'},b={id:uuid(),organization_id:ids.org,name:'B기업',status:'active'},p={id:uuid(),organization_id:ids.org,company_id:null,company_name:'옛 기업명',display_name:'참여자',counselor_user_id:ids.counselor,auth_user_id:ids.participant,phone:'01000000000'};
  h.state.tables.client_companies.push(a,b);h.state.tables.participants.push(p);
  h.state.tables.client_company_counselors.push({organization_id:ids.org,company_id:a.id,counselor_user_id:ids.counselor});
  return {h,a,b,p,body:{participantId:p.id,companyId:a.id,requestId:uuid()}};
}
const call=(h,body,actor=ids.admin)=>h.call(h.unlinkedLink.handleAdminUnlinkedLink,actor,body);

test('link updates only company_id, writes one event and preserves legacy participant and assessment data',async()=>{
  const {h,a,p,body}=fixture();const before=structuredClone(p),assessments=structuredClone(h.state.tables.assessments);
  const r=await call(h,body);expect(r.status).toBe(200);expect(r.data).toMatchObject({outcome:'linked',participantId:p.id,companyId:a.id,companyName:a.name,requestId:body.requestId});
  expect({...p,company_id:null}).toEqual(before);expect(h.state.tables.assessments).toEqual(assessments);
  expect(h.state.tables.participant_company_link_events).toHaveLength(1);expect(h.state.tables.participant_company_link_events[0]).toMatchObject({participant_id:p.id,old_company_id:null,new_company_id:a.id,actor_admin_user_id:ids.admin});
  expect(h.state.writes.filter(w=>w.table==='participants')).toEqual([{table:'participants',operation:'update',columns:['company_id']}]);
  const list=await h.call(h.unlinked.handleAdminUnlinked,ids.admin,null,'GET');expect(list.data.participants.some(row=>row.id===p.id)).toBe(false);
  const directory=await h.call(h.directory.handleAdminDirectory,ids.admin,null,'GET','https://fixture.invalid/?companyId='+a.id);expect(directory.data.participants.some(row=>row.id===p.id)).toBe(true);
});

test('roles, organization, malformed or extra input cannot link',async()=>{
  const {h,a,p,body}=fixture();for(const actor of [ids.counselor,ids.participant,ids.other])expect((await call(h,body,actor)).status).toBe(403);
  h.state.tables.user_profiles.find(u=>u.user_id===ids.other).role='company_manager';expect((await call(h,body,ids.other)).status).toBe(403);
  for(const patch of [{organizationId:ids.org},{companyName:a.name},{counselorUserId:ids.counselor},{participantId:'bad'},{companyId:'bad'},{requestId:'bad'}])expect((await call(h,{...body,...patch})).status).toBe(400);
  expect((await call(h,{...body,participantId:uuid()})).status).toBe(403);
  h.state.tables.participants.find(x=>x.id===p.id).organization_id='other-org';expect((await call(h,body)).status).toBe(403);
  expect(h.state.tables.participant_company_link_events).toHaveLength(0);
});

test('inactive, foreign or unassigned target and missing counselor defer without writes',async()=>{
  const {h,a,b,p,body}=fixture();a.status='inactive';expect((await call(h,body)).data.error).toBe('COMPANY_INACTIVE');a.status='active';
  a.organization_id='other-org';expect((await call(h,body)).status).toBe(403);a.organization_id=ids.org;
  expect((await call(h,{...body,companyId:b.id})).data.error).toBe('COUNSELOR_REVIEW_REQUIRED');
  p.counselor_user_id=null;expect((await call(h,body)).data.error).toBe('COUNSELOR_REVIEW_REQUIRED');
  expect(p.company_id).toBeNull();expect(h.state.tables.participant_company_link_events).toHaveLength(0);
});

test('same request replays once; changed request and second company conflict',async()=>{
  const {h,a,b,p,body}=fixture();expect((await call(h,body)).data.outcome).toBe('linked');
  expect((await call(h,body)).data.outcome).toBe('already_completed');
  expect((await call(h,{...body,companyId:b.id})).data.error).toBe('REQUEST_CONFLICT');
  expect((await call(h,{...body,requestId:uuid(),companyId:b.id})).data.error).toBe('COMPANY_CONFLICT');
  expect(p.company_id).toBe(a.id);expect(h.state.tables.participant_company_link_events).toHaveLength(1);
});

test('concurrent different-company requests produce one success and audit failure leaves no link',async()=>{
  const {h,a,b,p,body}=fixture();h.state.tables.client_company_counselors.push({organization_id:ids.org,company_id:b.id,counselor_user_id:ids.counselor});
  let arrivals=0,release;const gate=new Promise(resolve=>{release=resolve});
  h.state.beforeUnlinkedCommit=async()=>{if(++arrivals===2)release();await gate};
  const outcomes=await Promise.all([call(h,body),call(h,{...body,companyId:b.id,requestId:uuid()})]);
  expect(arrivals).toBe(2);
  expect(outcomes.map(r=>r.status).sort()).toEqual([200,409]);expect([a.id,b.id]).toContain(p.company_id);expect(h.state.tables.participant_company_link_events).toHaveLength(1);
  const next=fixture();next.h.state.failUnlinkedAudit=true;expect((await call(next.h,next.body)).status).toBe(503);expect(next.p.company_id).toBeNull();expect(next.h.state.tables.participant_company_link_events).toHaveLength(0);
});

test('review SQL keeps existing link guards and restricts the new RPC and audit table',()=>{
  const sql=readFileSync('supabase/proposals/admin-unlinked-link.sql','utf8');
  for(const required of ['participants_company_org_fk','participants_org_company_idx','participants_company_link_guard','unique(participant_id)','request_id uuid not null unique','enable row level security','grant select,insert on public.participant_company_link_events to service_role','security invoker set search_path','company_id is null','grant execute on function public.secondcareer_link_unlinked_participant'])expect(sql.toLowerCase()).toContain(required.toLowerCase());
  expect(sql).not.toMatch(/alter table public\.participants (drop|disable)|drop trigger participants_company_link_guard/i);
});
