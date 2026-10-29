import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validatePlan,createParticipant,rotatePassword}=require('../../src/admin/account-operations.cjs');
const org='11111111-1111-4111-8111-111111111111', counselor='22222222-2222-4222-8222-222222222222', user='33333333-3333-4333-8333-333333333333';
const plan={organizationId:org,counselorId:counselor,loginId:'test-client',displayName:'TEST-one'};
function mock({duplicate=false,wrongOrg=false,failAt=''}={}){
  const writes=[],states=[];let step=0;
  const api={get:async(table)=>table==='organizations'?[{id:org}]:table==='user_profiles'?[{role:'counselor',organization_id:wrongOrg?user:org}]:duplicate?[{user_id:user}]:[],
    createUser:async()=>{writes.push('auth');if(failAt==='auth')throw Error('fixture');return {id:user}},
    insert:async(table,row)=>{writes.push(table);if(table===failAt)throw Error('fixture');expect(row.user_id||row.auth_user_id).toBe(user)},
    updatePassword:async()=>{writes.push('password')}};
  const journal={create:async state=>{states.push({...state})},update:async state=>{states.push({...state})}};
  return {api,journal,writes,states};
}
test('validates synthetic identity and organization inputs',()=>{
  expect(()=>validatePlan({...plan,loginId:'bad'})).toThrow();
  expect(()=>validatePlan({...plan,displayName:'Real Person'})).toThrow();
  expect(()=>validatePlan({...plan,organizationId:'bad'})).toThrow();
});
test('creates only a new linked participant and records its identifiers',async()=>{
  const m=mock();const result=await createParticipant(m.api,plan,'synthetic-password',m.journal);
  expect(m.writes).toEqual(['auth','user_profiles','server_login_lookup','participants']);
  expect(result.stage).toBe('complete');expect(result.participantId).toBeTruthy();
  expect(JSON.stringify(m.states)).not.toContain('synthetic-password');
});
test('rejects duplicates and mismatched counselor before writes',async()=>{
  for(const options of [{duplicate:true},{wrongOrg:true}]){const m=mock(options);await expect(createParticipant(m.api,plan,'synthetic-password',m.journal)).rejects.toThrow();expect(m.writes).toEqual([]);expect(m.states).toEqual([])}
});
test('an existing recovery journal blocks a retry before creating an Auth user',async()=>{
  const m=mock();m.journal.create=async()=>{throw Error('journal already exists')};
  await expect(createParticipant(m.api,plan,'synthetic-password',m.journal)).rejects.toThrow(/journal already exists/);expect(m.writes).toEqual([]);
});
test('stops on each creation failure and preserves a recovery journal',async()=>{
  for(const failAt of ['auth','user_profiles','server_login_lookup','participants']){const m=mock({failAt});await expect(createParticipant(m.api,plan,'synthetic-password',m.journal)).rejects.toThrow(/outcome unknown/);expect(m.states.length).toBeGreaterThan(0);expect(m.states.at(-1).stage).not.toBe('complete');expect(m.writes.at(-1)).toBe(failAt)}
});
test('password rotation requires matching identity and role',async()=>{
  const m=mock();m.api.get=async(table)=>table==='user_profiles'?[{role:'participant'}]:[{login_id:plan.loginId,internal_email:'fixture@example.invalid'}];m.api.getUser=async()=>({id:user,email:'fixture@example.invalid'});
  await expect(rotatePassword(m.api,{userId:user,role:'counselor',loginId:plan.loginId},'synthetic-password')).rejects.toThrow(/mismatch/);expect(m.writes).toEqual([]);
  await rotatePassword(m.api,{userId:user,role:'participant',loginId:plan.loginId},'synthetic-password');expect(m.writes).toEqual(['password']);
});
