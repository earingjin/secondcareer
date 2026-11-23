import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');

test('retired administrator APIs enforce role and stop before Auth creation, reads or writes to business data',async()=>{
  const h=harness(),t=h.state.tables, company='40000000-0000-4000-8000-000000000001';
  t.client_companies.push({id:company,organization_id:ids.org,status:'active'});
  t.client_company_counselors.push({company_id:company,counselor_user_id:ids.counselor,organization_id:ids.org});
  const manager='company-manager';
  t.user_profiles.push({user_id:manager,role:'company_manager',organization_id:ids.org});
  h.state.users[manager]={id:manager,app_metadata:{}};
  const before=structuredClone(t);
  h.db.rpc=async()=>{throw Error('Retired endpoint reached RPC')};
  const companyUrl='https://fixture.invalid/?section=counselors&id='+company;
  const requests=[
    [h.registration.handleRegistration,{displayName:'Fixture',phone:'01012345678',companyId:company},'POST',undefined,'PARTICIPANT_REGISTRATION_RETIRED'],
    [h.unlinked.handleAdminUnlinked,null,'GET','https://fixture.invalid/?page=1','UNLINKED_WORKFLOW_RETIRED'],
    [h.unlinkedLink.handleAdminUnlinkedLink,{participantId:'existing-participant',companyId:company},'POST',undefined,'UNLINKED_WORKFLOW_RETIRED'],
    [h.companies.handleAdminCompanies,null,'GET',companyUrl,'COMPANY_COUNSELOR_ASSIGNMENT_RETIRED'],
    ...['assign','unassign'].map(action=>[h.companies.handleAdminCompanies,{action,counselorUserId:ids.counselor},'PATCH',companyUrl,'COMPANY_COUNSELOR_ASSIGNMENT_RETIRED'])
  ];
  for(const [handler,body,method,url,error] of requests){
    for(const [token,status] of [[null,401],[ids.participant,403],[ids.counselor,403],[manager,403],[ids.admin,410]]){
      const result=await h.call(handler,token,body,method,url);
      expect(result.status).toBe(status);
      if(status===410)expect(result.data).toEqual({error});
    }
  }
  expect(t).toEqual(before);
  expect(h.state.created).toEqual([]);
  expect(h.state.writes).toEqual([]);
  expect(h.state.reads.filter(r=>r.table!=='user_profiles')).toEqual([]);
});

test('STEP 3 compatibility: existing participant pre-draft and submit remain available until STEP 6',async()=>{
  const h=harness(),t=h.state.tables,called=[];
  h.state.testAssessmentWrite=async args=>{
    called.push(args);
    return {data:{assessmentId:'compat-assessment',status:args.operation==='submit'?'submitted':'draft',updatedAt:'2026-11-23T08:00:00Z'},error:null};
  };
  const blank={reg:{},goal:{},expect:{},done:{reg:false,goal:false,expect:false},pre:Array(15).fill(null)};
  const draft=await h.call(h.assessment,ids.participant,{action:'draft',answers:blank,expectedUpdatedAt:null});
  expect(draft.status).toBe(200);
  expect(draft.data.status).toBe('draft');
  expect(called).toHaveLength(1);
  expect(called[0]).toMatchObject({actor:ids.participant,target:t.participants[0].id,operation:'draft',calculated:null});
  expect(called[0].payload.pre).toHaveLength(15);
  const incomplete=await h.call(h.assessment,ids.participant,{action:'submit',answers:blank,expectedUpdatedAt:null});
  expect(incomplete.status).toBe(400);
  expect(incomplete.data.error).toBe('ANSWERS_INCOMPLETE');
  expect(called).toHaveLength(1);
  const fixture=JSON.parse(require('node:fs').readFileSync('tests/snapshot/fixture.json','utf8')).db[0];
  const complete=Object.fromEntries(['reg','goal','expect','done','pre'].map(k=>[k,structuredClone(fixture[k])]));
  const submitted=await h.call(h.assessment,ids.participant,{action:'submit',answers:complete,expectedUpdatedAt:null});
  expect(submitted.status).toBe(200);
  expect(submitted.data.status).toBe('submitted');
  expect(called).toHaveLength(2);
  expect(called[1].operation).toBe('submit');
  expect(called[1].calculated).toBeTruthy();
  expect(called[1].calculated.evaluationVersion).toBeTruthy();
  for(const action of ['draft','submit']){
    expect((await h.call(h.assessment,ids.counselor,{action,answers:complete})).status).toBe(403);
  }
});
