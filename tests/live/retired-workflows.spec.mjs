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

test('existing participant pre-diagnosis draft and submit stop before the write RPC',async()=>{
  const h=harness(),t=h.state.tables;
  t.assessments.push({id:'draft',participant_id:t.participants[0].id,phase:'pre',status:'draft',answers:{pre:[]}});
  const before=structuredClone(t);
  h.db.rpc=async()=>{throw Error('Retired action reached RPC')};
  for(const action of ['draft','submit']){
    const body={action,answers:{}};
    expect((await h.call(h.assessment,ids.participant,body)).data).toEqual({error:'AUTHENTICATED_PRE_RETIRED'});
    expect((await h.call(h.assessment,ids.participant,body)).status).toBe(410);
    expect((await h.call(h.assessment,ids.counselor,body)).status).toBe(403);
  }
  expect(t).toEqual(before);
  const state=await h.call(h.assessment,ids.participant,null,'GET');
  expect(state.data.assessments[0].status).toBe('draft');
});
