import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
const input=()=>({displayName:'가상 참여자',phone:'010-1234-5678',companyName:'테스트 기업',counselorUserId:ids.other,requestId:randomUUID()});

test('organization assessment URL is validated, scoped to admins and returned on reload',async()=>{
  const h=harness(),action='update-assessment-url';
  const save=url=>h.call(h.account.handleAccount,ids.admin,{action,assessmentUrl:url});
  for(const url of ['http://example.com','javascript:alert(1)','https://user:pass@example.com','https://example.com/#fragment','https://example.com/\npath','https://example.com\\evil'])
    expect((await save(url)).status).toBe(400);
  expect((await h.call(h.account.handleAccount,ids.counselor,{action,assessmentUrl:'https://example.com'})).status).toBe(403);
  expect((await h.call(h.account.handleAccount,ids.admin,{action,assessmentUrl:'https://example.com',organizationId:'other-org'})).status).toBe(400);
  expect((await save('https://example.invalid/diagnosis')).data.assessmentUrl).toBe('https://example.invalid/diagnosis');
  expect((await h.call(h.account.handleAccount,ids.counselor)).data.assessmentUrl).toBe('https://example.invalid/diagnosis');
  expect((await h.call(h.account.handleAccount,ids.admin)).data.assessmentUrl).toBe('https://example.invalid/diagnosis');
  expect((await save('')).data.assessmentUrl).toBeNull();
});

test('authenticated counselor provisions linked Auth account, server password and own assignment',async()=>{
  const h=harness(),r=await h.call(h.registration.handleRegistration,ids.counselor,input());
  expect(r.status).toBe(201);expect(r.data.loginId).toBe('12345678');expect(r.data.temporaryPassword.length).toBeGreaterThanOrEqual(12);
  expect(r.headers.get('cache-control')).toBe('no-store');
  const auth=h.state.created[0],p=h.state.tables.participants.find(p=>p.id===r.data.participantId);
  expect(auth.password).toBe(r.data.temporaryPassword);expect(auth.app_metadata.must_change_password).toBe(true);
  expect(p.auth_user_id).toBe(auth.id);expect(p.counselor_user_id).toBe(ids.counselor);
  expect(h.state.tables.server_login_lookup.find(m=>m.user_id===auth.id).login_id).toBe('12345678');
  expect(JSON.stringify(h.state.tables)).not.toContain(auth.password);
  expect(h.access.participantAccessError(h.state.users[auth.id])).toBe('PASSWORD_CHANGE_REQUIRED');
  const unchanged=await h.call(h.account.handleAccount,auth.id,{action:'change-password',password:r.data.temporaryPassword});
  expect(unchanged.status).toBe(400);expect(h.state.users[auth.id].app_metadata.must_change_password).toBe(true);
  const duplicate=await h.call(h.registration.handleRegistration,ids.counselor,input());
  expect(duplicate.status).toBe(409);expect(h.state.created).toHaveLength(1);expect(duplicate.data.temporaryPassword).toBeUndefined();
});

test('basic authentication, permission, validation and disabled registration prevent Auth writes',async()=>{
  const h=harness();
  for(const [token,body,status] of [[null,input(),401],['expired',input(),401],[ids.participant,input(),403],[ids.admin,input(),403],[ids.counselor,{...input(),phone:'123'},400],[ids.counselor,{...input(),password:'browser-password'},400],[ids.counselor,{...input(),organizationId:ids.org},400]]){
    expect((await h.call(h.registration.handleRegistration,token,body)).status).toBe(status);
  }
  h.state.enabled=false;expect((await h.call(h.registration.handleRegistration,ids.counselor,input())).status).toBe(503);
  expect(h.state.created).toHaveLength(0);
});

test('admin can select only same-organization counselor; account context does not leak another organization',async()=>{
  const h=harness();
  const r=await h.call(h.registration.handleRegistration,ids.admin,{...input(),counselorUserId:ids.counselor});expect(r.status).toBe(201);
  const context=await h.call(h.account.handleAccount,ids.admin);expect(context.data.counselors).toEqual([{id:ids.counselor,name:'상담사'}]);
  const own=await h.call(h.account.handleAccount,ids.counselor);expect(own.data.counselors).toEqual(context.data.counselors);
});

test('pending reservation blocks retry after Auth/DB failure without returning or persisting a password',async()=>{
  for(const failure of ['failCreate','failComplete']){
    const h=harness();h.state[failure]=true;const body=input();
    const first=await h.call(h.registration.handleRegistration,ids.counselor,body);expect(first.status).toBe(503);expect(first.data).toEqual({error:'REGISTRATION_OUTCOME_UNKNOWN'});
    const retry=await h.call(h.registration.handleRegistration,ids.counselor,body);expect(retry.status).toBe(409);
    expect(h.state.created.length).toBe(failure==='failCreate'?0:1);
    expect(JSON.stringify(h.state.tables)).not.toMatch(/password/i);
  }
});

test('fresh trusted flag requires password update; legacy participant remains unchanged',async()=>{
  const h=harness();
  expect((await h.call(h.account.handleAccount,ids.participant)).data.mustChangePassword).toBe(false);
  h.state.users[ids.participant].app_metadata={must_change_password:true,other:'keep'};
  h.state.users[ids.participant].user_metadata={must_change_password:false};
  expect((await h.call(h.account.handleAccount,ids.participant)).data.mustChangePassword).toBe(true);
  expect((await h.call(h.account.handleAccount,ids.participant,{action:'change-password',password:'short'})).status).toBe(400);
  const changed=await h.call(h.account.handleAccount,ids.participant,{action:'change-password',password:'Changed-password-123!'});
  expect(changed.data.changed).toBe(true);expect(h.state.updated[0].id).toBe(ids.participant);
  expect(h.state.users[ids.participant].app_metadata).toEqual({must_change_password:false,temporary_password_digest:null,other:'keep'});
  expect(h.access.participantAccessError(h.state.users[ids.participant])).toBeNull();
  expect((await h.call(h.account.handleAccount,ids.counselor,{action:'change-password',password:'Changed-password-123!'})).status).toBe(403);
});

test('new account uses the existing private login mapping and only the changed password works afterwards',async()=>{
  const h=harness(),before=JSON.parse(JSON.stringify(h.state.tables));
  const created=await h.call(h.registration.handleRegistration,ids.counselor,input());
  const {loginId,temporaryPassword,participantId}=created.data;
  const user=h.signIn(loginId,temporaryPassword);
  expect(user).toBeTruthy();expect(h.signIn(loginId,'incorrect-password')).toBeNull();
  expect((await h.call(h.account.handleAccount,user.id)).data.mustChangePassword).toBe(true);
  const changed=await h.call(h.account.handleAccount,user.id,{action:'change-password',password:'Changed-password-123!'});
  expect(changed.status).toBe(200);
  expect(h.signIn(loginId,temporaryPassword)).toBeNull();
  expect(h.signIn(loginId,'Changed-password-123!')?.id).toBe(user.id);
  expect((await h.call(h.account.handleAccount,user.id)).data.mustChangePassword).toBe(false);
  expect(h.state.tables.participants.find(p=>p.id===participantId).auth_user_id).toBe(user.id);
  for(const table of ['user_profiles','server_login_lookup','participants'])
    expect(JSON.parse(JSON.stringify(h.state.tables[table].slice(0,before[table].length)))).toEqual(before[table]);
});

test('orphan participant cannot clear the first-password gate',async()=>{
  const h=harness();h.state.users[ids.participant].app_metadata={must_change_password:true};
  h.state.tables.participants.length=0;
  expect((await h.call(h.account.handleAccount,ids.participant)).data.error).toBe('PARTICIPANT_NOT_LINKED');
  expect((await h.call(h.account.handleAccount,ids.participant,{action:'change-password',password:'Changed-password-123!'})).status).toBe(403);
  expect(h.state.updated).toHaveLength(0);
  expect(h.state.users[ids.participant].app_metadata.must_change_password).toBe(true);
});

test('new registration marker without an explicit completed flag stays blocked, malformed state is rejected',async()=>{
  const h=harness(),user=h.state.users[ids.participant];
  user.app_metadata={registration_request_id:randomUUID()};
  expect(h.access.participantAccessError(user)).toBe('PASSWORD_CHANGE_REQUIRED');
  expect((await h.call(h.account.handleAccount,ids.participant)).data.mustChangePassword).toBe(true);
  user.app_metadata={must_change_password:'false'};
  expect(h.access.participantAccessError(user)).toBe('ACCOUNT_STATE_INVALID');
  expect((await h.call(h.account.handleAccount,ids.participant)).status).toBe(403);
});

test('registration remains unavailable without the server enable flag while counselor context is still readable',async()=>{
  const h=harness();h.state.enabled=false;
  const response=await h.call(h.account.handleAccount,ids.counselor);
  expect(response.status).toBe(200);expect(response.data.profile.role).toBe('counselor');
  expect(response.data.registrationAvailable).toBe(false);
  expect((await h.call(h.registration.handleRegistration,ids.counselor,input())).status).toBe(503);
  expect(h.state.created).toHaveLength(0);expect(h.state.tables.participant_registration_requests).toHaveLength(0);
});

test('failed Auth password update leaves the gate and temporary credential intact',async()=>{
  const h=harness(),created=await h.call(h.registration.handleRegistration,ids.counselor,input());
  const user=h.signIn(created.data.loginId,created.data.temporaryPassword);h.state.failUpdate=true;
  expect((await h.call(h.account.handleAccount,user.id,{action:'change-password',password:'Changed-password-123!'})).status).toBe(503);
  expect(h.state.users[user.id].app_metadata.must_change_password).toBe(true);
  expect(h.signIn(created.data.loginId,created.data.temporaryPassword)?.id).toBe(user.id);
});
