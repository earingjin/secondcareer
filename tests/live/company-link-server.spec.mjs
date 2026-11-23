import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import {previewCompanyLinks} from '../../supabase/proposals/company-link-preview.mjs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
const master=(extra={})=>({id:randomUUID(),organization_id:ids.org,name:'Example Company',status:'active',...extra});
const addCompany=(h,c)=>{h.state.tables.client_companies.push(c);h.state.tables.client_company_counselors.push({organization_id:c.organization_id,company_id:c.id,counselor_user_id:ids.counselor,created_at:'2026-11-11T00:00:00Z'})};
const detail=(h,id)=>h.call(h.companies.handleAdminCompanies,ids.admin,null,'GET','https://fixture.invalid/?id='+id);

test('anonymous submitted participant follows admin assignment and reassignment on every counselor report request',async()=>{
  const h=harness(),id=randomUUID(),other=randomUUID(),time='2026-11-23T00:00:00.000Z';
  h.state.tables.user_profiles.push({user_id:other,organization_id:ids.org,role:'counselor',display_name:'상담사 B'});
  h.state.users[other]={id:other,app_metadata:{}};
  const fixture=JSON.parse(fs.readFileSync(new URL('../snapshot/fixture.json',import.meta.url),'utf8')).db[0];
  const answers=Object.fromEntries(['reg','goal','pre','expect','done','preDate'].map(k=>[k,structuredClone(fixture[k])]));
  const p={id,organization_id:ids.org,auth_user_id:null,counselor_user_id:null,company_id:null,company_name:'입력 기업',display_name:'합성 내담자'};
  h.state.tables.participants.push(p);
  h.state.tables.assessments.push({id:randomUUID(),participant_id:id,phase:'pre',status:'submitted',answers,result:{...fixture.result,snapshot:{counselor:null}},updated_at:time,submitted_at:time});
  h.db.rpc=async(_,args)=>{expect(args.p_org).toBe(ids.org);expect(p.counselor_user_id).toBe(args.p_expected);p.counselor_user_id=args.p_target;return {data:{requestId:args.p_request}}};
  const change=async(target,expected)=>h.call(h.assignment.handleParticipantAssignment,ids.admin,{participantId:id,kind:'counselor',targetId:target,expectedId:expected,requestId:randomUUID()});
  const list=actor=>h.call(h.assessment,actor,null,'GET');
  const report=actor=>h.call(h.assessment,actor,null,'GET','https://fixture.invalid/?id='+id+'&kind=c');
  expect((await list(ids.counselor)).data.participants.some(x=>x.id===id)).toBe(false);
  expect((await change(ids.counselor,null)).status).toBe(200);
  expect((await list(ids.counselor)).data.participants.find(x=>x.id===id)).toMatchObject({login_id:null,anonymous_intake:true,company_name:'입력 기업'});
  expect((await report(ids.counselor)).status).toBe(200);
  h.state.postEnabled=true;
  const readsBefore=h.state.reads.length,assignmentRpc=h.db.rpc;
  h.db.rpc=async()=>{throw Error('Unexpected approval RPC')};
  const approval=await h.call(h.assessment,ids.counselor,{action:'post-approve',participantId:id});
  expect(approval.status).toBe(403);
  expect(approval.data.error).toBe('POST_NOT_AVAILABLE');
  expect(h.state.reads.slice(readsBefore).filter(read=>read.table==='post_approvals'||(read.table==='assessments'&&read.filters?.some(filter=>filter[0]==='phase'&&filter[2]==='post')))).toEqual([]);
  h.db.rpc=assignmentRpc;
  h.state.postEnabled=false;
  expect((await change(other,ids.counselor)).status).toBe(200);
  expect((await list(ids.counselor)).data.participants.some(x=>x.id===id)).toBe(false);
  expect((await report(ids.counselor)).status).toBe(403);
  expect((await list(other)).data.participants.some(x=>x.id===id)).toBe(true);
  expect((await report(other)).status).toBe(200);
  expect((await report(ids.other)).status).toBe(403);
  expect((await change(null,other)).status).toBe(200);
  expect((await report(other)).status).toBe(403);
});

test('many masters classify by ID; deactivation preserves participants and assessments; detail stays scoped',async()=>{
  const h=harness();h.state.tables.assessments.push({id:'synthetic',participant_id:'existing-participant',status:'submitted'});
  for(let i=0;i<24;i++){
    const c=master({name:'Company '+i});addCompany(h,c);
    h.state.tables.participants.push({id:randomUUID(),organization_id:ids.org,company_id:c.id,
      counselor_user_id:ids.counselor,company_name:c.name,auth_user_id:null});
  }
  const before=structuredClone({participants:h.state.tables.participants,assessments:h.state.tables.assessments});
  const c=h.state.tables.client_companies[0];c.status='inactive';
  expect((await detail(h,c.id)).data.linkage).toEqual({linkedParticipants:1,unlinkedParticipants:1});
  expect({participants:h.state.tables.participants,assessments:h.state.tables.assessments}).toEqual(before);
  const foreign=master({organization_id:'other-org'});h.state.tables.client_companies.push(foreign);
  expect((await detail(h,foreign.id)).status).toBe(403);
  h.state.failReadsOf='participants';expect((await detail(h,c.id)).status).toBe(503);
});

test('read-only migration review normalizes names, never assigns blank/unmatched/ambiguous or another org',()=>{
  const companies=[master({id:'one'}),master({id:'two',name:'Inactive',status:'inactive'}),master({id:'dup1',name:'Duplicate'}),master({id:'dup2',name:' duplicate '}),master({id:'foreign',name:'Foreign',organization_id:'other-org'})];
  const participants=[' example  COMPANY ','Example\tCompany','Inactive','Duplicate','Foreign','  ','Unknown'].map(company_name=>({organization_id:ids.org,company_name,company_id:null}));
  participants.push({organization_id:ids.org,company_name:'Example Company',company_id:'one'});
  const before=JSON.stringify({participants,companies}),result=previewCompanyLinks(participants,companies);
  expect(result.find(r=>r.outcome==='candidate_review')).toMatchObject({companyId:'one',participants:2});
  expect(result.find(r=>r.outcome==='inactive_review').participants).toBe(1);expect(result.find(r=>r.outcome==='ambiguous').companyId).toBeNull();
  expect(result.find(r=>r.outcome==='unmatched').participants).toBe(2);expect(result.find(r=>r.outcome==='blank').participants).toBe(1);
  expect(JSON.stringify({participants,companies})).toBe(before);expect(JSON.stringify(result)).not.toContain('company_name');
});

test('SQL proposal preserves NULL compatibility, composite integrity, restricted RPCs and read-only migration',()=>{
  const sql=fs.readFileSync('supabase/proposals/participant-company-link.sql','utf8'),preview=fs.readFileSync('supabase/proposals/participant-company-link-preview.sql','utf8');
  expect(sql).toContain('add column company_id uuid null');expect(sql).toContain('foreign key(organization_id,company_id)');
  expect(sql).toContain("current_user not in ('service_role','postgres')");expect(sql).toContain('for update');expect(sql).toContain('for share');
  expect(sql).toContain("r.company_cancelled_auth_user_id is not null");expect(sql).toContain('COMPANY_LINK_REQUIRED');
  expect(sql).not.toMatch(/create or replace|drop (?:table|constraint|function)/i);
  expect(preview.replace(/--[^\n]*/g,'')).not.toMatch(/\b(update|insert|delete)\b/i);expect(preview).toContain('begin read only;');
});

test('unapplied supplemental RPC proposal locks assignment only in completion and keeps reviewed signatures',()=>{
  const sql=fs.readFileSync('supabase/proposals/participant-company-counselor-registration.sql','utf8');
  expect(sql).toContain('SCHEMA_REVIEW_REQUIRED');expect(sql).toContain('__REVIEW_COMPLETE_FUNCTION_MD5__');
  expect(sql).toContain('a.counselor_user_id=r.counselor_user_id for share');expect(sql).toContain('grant update(counselor_user_id)');
  const recovery=sql.slice(sql.indexOf('create or replace function public.secondcareer_recover_company_registration'));
  expect(recovery).not.toContain('from public.client_company_counselors');expect(recovery).not.toContain('p.counselor_user_id=r.counselor_user_id');
  for(const condition of ['p.id=r.participant_id','p.auth_user_id=new_user_id','p.organization_id=r.organization_id','p.company_id=r.company_id'])expect(recovery).toContain(condition);
  expect(sql).not.toMatch(/create table|delete from public\.participants|alter table public\.participants/i);
});
