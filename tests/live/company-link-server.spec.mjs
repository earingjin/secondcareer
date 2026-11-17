import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import {previewCompanyLinks} from '../../supabase/proposals/company-link-preview.mjs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
const master=(extra={})=>({id:randomUUID(),organization_id:ids.org,name:'Example Company',status:'active',...extra});
const addCompany=(h,c)=>{h.state.tables.client_companies.push(c);h.state.tables.client_company_counselors.push({organization_id:c.organization_id,company_id:c.id,counselor_user_id:ids.counselor,created_at:'2026-11-11T00:00:00Z'})};
const body=c=>({displayName:'합성참여자',phone:'01012345678',counselorUserId:ids.counselor,companyId:c.id,companyName:' example  COMPANY ',requestId:randomUUID()});
const call=(h,b,actor=ids.admin)=>h.call(h.registration.handleRegistration,actor,b);
const detail=(h,id)=>h.call(h.companies.handleAdminCompanies,ids.admin,null,'GET','https://fixture.invalid/?id='+id);

test('registered participant submits calculated diagnosis and only assigned counselor can open report',async()=>{
  const h=harness(),c=master();addCompany(h,c);
  const other=randomUUID();h.state.tables.user_profiles.push({user_id:other,organization_id:ids.org,role:'counselor',display_name:'Other'});h.state.users[other]={id:other,email:'other@example.invalid',app_metadata:{}};
  const created=await call(h,body(c));expect(created.status).toBe(201);
  const user=h.signIn(created.data.loginId,created.data.temporaryPassword);expect(user).toBeTruthy();
  expect((await h.call(h.account.handleAccount,user.id)).data.mustChangePassword).toBe(true);
  expect((await h.call(h.account.handleAccount,user.id,{action:'change-password',password:'New-password-123!'})).status).toBe(200);
  expect(h.signIn(created.data.loginId,created.data.temporaryPassword)).toBeNull();expect(h.signIn(created.data.loginId,'New-password-123!')?.id).toBe(user.id);
  const fixture=JSON.parse(fs.readFileSync(new URL('../snapshot/fixture.json',import.meta.url),'utf8')).db[0];
  const answers=Object.fromEntries(['reg','goal','pre','expect','done'].map(k=>[k,structuredClone(fixture[k])]));
  h.state.testAssessmentWrite=async args=>{
    const part=h.state.tables.participants.find(p=>p.id===args.target);
    if(!part||part.auth_user_id!==args.actor||args.operation!=='submit')return {data:null,error:{code:'403'}};
    const time='2026-11-17T00:00:00.000Z',id=randomUUID();
    h.state.tables.assessments.push({id,participant_id:part.id,phase:'pre',status:'submitted',answers:args.payload,result:args.calculated,updated_at:time,submitted_at:time});
    return {data:{assessmentId:id,status:'submitted',updatedAt:time},error:null};
  };
  const submitted=await h.call(h.assessment,user.id,{action:'submit',answers});expect(submitted.status).toBe(200);
  const saved=h.state.tables.assessments.find(a=>a.participant_id===created.data.participantId);
  const expected=Array.from({length:5},(_,i)=>answers.pre.slice(i*3,i*3+3).reduce((a,b)=>a+b,0));
  expect(saved.result.raw).toEqual(expected);
  expect(h.signIn('consult01','Fixture-password-123!')?.id).toBe(ids.counselor);
  const url='https://fixture.invalid/?id='+created.data.participantId+'&kind=c';
  const report=await h.call(h.assessment,ids.counselor,null,'GET',url);expect(report.status).toBe(200);expect(report.data.html).toContain('<section class="sheet');
  for(const actor of [other,ids.other,user.id])expect((await h.call(h.assessment,actor,null,'GET',url)).status).toBe(403);
});

test('admin registration appears only in the assigned counselor assessment list',async()=>{
  const h=harness(),c=master();addCompany(h,c);
  const other=randomUUID();h.state.tables.user_profiles.push({user_id:other,organization_id:ids.org,role:'counselor',display_name:'Other'});
  h.state.users[other]={id:other,email:'other@example.invalid',app_metadata:{}};
  const created=await call(h,body(c));expect(created.status).toBe(201);
  expect(h.state.tables.participants.find(p=>p.id===created.data.participantId)).toMatchObject({company_id:c.id,counselor_user_id:ids.counselor});
  for(const [actor,visible] of [[ids.counselor,true],[other,false],[ids.other,false]]){
    const result=await h.call(h.assessment,actor,null,'GET');expect(result.status).toBe(200);
    expect(result.data.participants.some(p=>p.id===created.data.participantId)).toBe(visible);
  }
});

test('ID registration snapshots canonical master name, keeps legacy NULL data and duplicate protection',async()=>{
  const h=harness(),c=master();addCompany(h,c);
  const old=structuredClone(h.state.tables.participants),b=body(c),r=await call(h,{...b,companyId:b.companyId.toUpperCase()});
  expect(r.status).toBe(201);expect(r.data.companyId).toBe(c.id);expect(r.data.companyName).toBe(c.name);
  const p=h.state.tables.participants.find(p=>p.id===r.data.participantId);
  expect(p.company_id).toBe(c.id);expect(p.company_name).toBe(c.name);expect(h.state.tables.participants.slice(0,old.length)).toEqual(old);
  expect((await call(h,b)).status).toBe(409);expect((await call(h,{...b,requestId:randomUUID()})).status).toBe(409);
  expect(h.state.created).toHaveLength(1);
  expect((await detail(h,c.id)).data.linkage).toEqual({linkedParticipants:1,unlinkedParticipants:1});
});

test('inactive, foreign, missing, malformed ID, wrong name/counselor and non-admin reject before Auth',async()=>{
  for(const scenario of ['inactive','foreign','missing','array','null','name','nameType','counselor','counselorRole','participantRole','expired','anonymous','extra']){
    const h=harness(),c=master();addCompany(h,c);let b=body(c),actor=ids.admin;
    if(scenario==='inactive')c.status='inactive';if(scenario==='foreign')c.organization_id='other-org';if(scenario==='missing')b.companyId=randomUUID();
    if(scenario==='array')b.companyId=[c.id];if(scenario==='null')b.companyId=null;if(scenario==='name')b.companyName='Spoofed';if(scenario==='counselor')b.counselorUserId=ids.other;
    if(scenario==='nameType')b.companyName=123;
    if(scenario==='counselorRole')actor=ids.counselor;if(scenario==='participantRole')actor=ids.participant;if(scenario==='expired')actor='expired';if(scenario==='anonymous')actor=null;if(scenario==='extra')b.organization_id=ids.org;
    expect((await call(h,b,actor)).status,scenario).toBeGreaterThanOrEqual(400);expect(h.state.created,scenario).toHaveLength(0);
  }
});

test('many masters classify by ID; deactivation preserves participants and assessments; detail stays scoped',async()=>{
  const h=harness();h.state.tables.assessments.push({id:'synthetic',participant_id:'existing-participant',status:'submitted'});
  for(let i=0;i<24;i++){
    const c=master({name:'Company '+i});addCompany(h,c);
    expect((await call(h,{...body(c),companyName:'',phone:'010'+String(20000000+i)})).status).toBe(201);
  }
  const before=structuredClone({participants:h.state.tables.participants,assessments:h.state.tables.assessments});
  const c=h.state.tables.client_companies[0];c.status='inactive';
  expect((await detail(h,c.id)).data.linkage).toEqual({linkedParticipants:1,unlinkedParticipants:1});
  expect({participants:h.state.tables.participants,assessments:h.state.tables.assessments}).toEqual(before);
  const foreign=master({organization_id:'other-org'});h.state.tables.client_companies.push(foreign);
  expect((await detail(h,foreign.id)).status).toBe(403);
  h.state.failReadsOf='participants';expect((await detail(h,c.id)).status).toBe(503);
});

test('preflight DB failure creates no Auth; transaction failure cleans only confirmed new Auth and locks retry',async()=>{
  for(const scenario of ['read','complete','deactivate','recovery','delete']){
    const h=harness(),c=master();addCompany(h,c);const b=body(c),before=h.state.tables.user_profiles.length;
    if(scenario==='read')h.state.failReadsOf='client_companies';
    else if(scenario==='deactivate')h.state.beforeCompanyCompletion=()=>{c.status='inactive'};
    else {h.state.failComplete=true;if(scenario==='recovery')h.state.failRecovery=true;if(scenario==='delete')h.state.failDelete=true}
    expect((await call(h,b)).status,scenario).toBe(503);
    expect(h.state.tables.user_profiles).toHaveLength(before);expect(h.state.tables.participants).toHaveLength(1);
    expect(h.state.users[ids.participant]).toBeTruthy();
    if(['complete','deactivate'].includes(scenario)){expect(h.state.deleted).toHaveLength(1);expect(h.state.users[h.state.created[0].id]).toBeUndefined()}
    else expect(h.state.deleted||[]).toHaveLength(0);
    if(scenario!=='read'){expect(h.state.tables.participant_registration_requests).toHaveLength(1);expect((await call(h,b)).status).toBeGreaterThanOrEqual(400)}
  }
});

test('lost success response recovers committed link without deletion; rename uses transaction master',async()=>{
  const h=harness(),c=master();addCompany(h,c);h.state.loseCompanyResponse=true;
  h.state.beforeCompanyCompletion=()=>{c.name='Renamed Company'};
  const r=await call(h,body(c));expect(r.status).toBe(201);expect(r.data.companyName).toBe('Renamed Company');
  expect(h.state.tables.participants.at(-1).company_name).toBe('Renamed Company');expect(h.state.deleted||[]).toHaveLength(0);
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

test('linked registration rejects unassigned, wrong-company and wrong-org relations before Auth or reservation',async()=>{
  for(const scenario of ['missing','other-company','other-org','read-error']){
    const h=harness(),c=master();addCompany(h,c);
    if(scenario==='missing')h.state.tables.client_company_counselors=[];
    if(scenario==='other-company')h.state.tables.client_company_counselors[0].company_id=randomUUID();
    if(scenario==='other-org')h.state.tables.client_company_counselors[0].organization_id='other-org';
    if(scenario==='read-error')h.state.failReadsOf='client_company_counselors';
    const r=await call(h,body(c));expect(r.status,scenario).toBe(scenario==='read-error'?503:403);
    expect(r.data.error).toBe(scenario==='read-error'?'ASSIGNMENT_QUERY_FAILED':'COUNSELOR_NOT_ASSIGNED');
    expect(h.state.created).toHaveLength(0);expect(h.state.tables.participant_registration_requests).toHaveLength(0);
  }
});

test('one counselor can register into multiple assigned companies; later unassignment preserves old records',async()=>{
  const h=harness(),a=master(),b=master();addCompany(h,a);addCompany(h,b);
  expect((await call(h,body(a))).status).toBe(201);
  expect((await call(h,{...body(b),phone:'01023456789'})).status).toBe(201);
  const before=structuredClone([h.state.tables.participants,h.state.tables.assessments]);
  h.state.tables.client_company_counselors=h.state.tables.client_company_counselors.filter(r=>r.company_id!==a.id);
  expect([h.state.tables.participants,h.state.tables.assessments]).toEqual(before);
  expect((await call(h,{...body(a),phone:'01034567890'})).status).toBe(403);
  expect((await call(h,{...body(b),phone:'01034567890'})).status).toBe(201);
});

test('mock ordering: unassign before completion refuses and recovers only confirmed cancellation',async()=>{
  for(const failRecovery of [false,true]){
    const h=harness(),c=master();addCompany(h,c);h.state.failRecovery=failRecovery;
    const before=structuredClone(h.state.tables.participants),b=body(c);
    h.state.beforeCompanyCompletion=()=>{h.state.tables.client_company_counselors=[]};
    expect((await call(h,b)).status).toBe(503);expect(h.state.tables.participants).toEqual(before);
    expect(h.state.deleted||[]).toHaveLength(failRecovery?0:1);
    h.state.beforeCompanyCompletion=null;h.state.tables.client_company_counselors.push({organization_id:ids.org,company_id:c.id,counselor_user_id:ids.counselor});
    expect((await call(h,b)).status).toBe(409);expect(h.state.created).toHaveLength(1);
  }
});

test('mock ordering: committed registration recovers after unassignment and lost response',async()=>{
  const h=harness(),c=master();addCompany(h,c);h.state.loseCompanyResponse=true;
  h.state.afterCompanyCompletion=()=>{h.state.tables.client_company_counselors=[]};
  const r=await call(h,body(c));expect(r.status).toBe(201);expect(h.state.deleted||[]).toHaveLength(0);
  expect(h.state.tables.participants.find(p=>p.id===r.data.participantId)).toMatchObject({company_id:c.id,counselor_user_id:ids.counselor});
});

test('mock committed recovery returns stored result after Auth email changes and response is lost',async()=>{
  const h=harness(),c=master();addCompany(h,c);h.state.loseCompanyResponse=true;
  h.state.afterCompanyCompletion=()=>{h.state.users[h.state.created.at(-1).id].email='changed@example.invalid'};
  const r=await call(h,body(c));expect(r.status).toBe(201);expect(h.state.deleted||[]).toHaveLength(0);
  expect(h.state.tables.participant_registration_requests[0].status).toBe('complete');
  expect(h.state.tables.participants.find(p=>p.id===r.data.participantId)).toMatchObject({company_id:c.id,counselor_user_id:ids.counselor});
});

test('completed recovery uses stable identities and permits a different current counselor',async()=>{
  const h=harness(),c=master();addCompany(h,c);const issued=await call(h,body(c));expect(issued.status).toBe(201);
  const request=h.state.tables.participant_registration_requests[0],p=h.state.tables.participants.find(p=>p.id===issued.data.participantId);
  const args={request_id:request.id,new_user_id:request.auth_user_id,new_internal_email:'unused'};
  for(const current of [request.counselor_user_id,randomUUID()]){p.counselor_user_id=current;expect((await h.recoverCompany(args)).data?.outcome).toBe('complete')}
  h.state.tables.client_company_counselors=[];expect((await h.recoverCompany(args)).data?.outcome).toBe('complete');
  for(const [field,value] of [['id',randomUUID()],['auth_user_id',randomUUID()],['organization_id','other-org'],['company_id',randomUUID()]]){
    const original=p[field];p[field]=value;expect((await h.recoverCompany(args)).error).toBeTruthy();p[field]=original;
  }
  expect((await h.recoverCompany({...args,new_user_id:randomUUID()})).error).toBeTruthy();
  expect(request.counselor_user_id).toBe(ids.counselor);expect(h.state.deleted||[]).toHaveLength(0);
});

test('mock pending recovery refuses cancellation and Auth deletion when Auth identity no longer matches',async()=>{
  for(const change of ['email','request','missing']){
    const h=harness(),c=master();addCompany(h,c);h.state.failComplete=true;
    h.state.beforeCompanyCompletion=()=>{
      const id=h.state.created.at(-1).id;
      if(change==='email')h.state.users[id].email='changed@example.invalid';
      if(change==='request')h.state.users[id].app_metadata.registration_request_id=randomUUID();
      if(change==='missing')delete h.state.users[id];
    };
    const r=await call(h,body(c));expect(r.status,change).toBe(503);expect(r.data.error).toBe('REGISTRATION_OUTCOME_UNKNOWN');
    expect(h.state.deleted||[]).toHaveLength(0);expect(h.state.tables.participants).toHaveLength(1);
    expect(h.state.tables.participant_registration_requests[0].company_cancelled_auth_user_id).toBeUndefined();
  }
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
