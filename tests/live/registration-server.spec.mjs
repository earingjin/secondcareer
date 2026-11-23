import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');

test('organization assessment URL is validated, scoped to admins and returned on reload',async()=>{
  const h=harness(),action='update-assessment-url';
  const save=url=>h.call(h.account.handleAccount,ids.admin,{action,assessmentUrl:url});
  for(const url of ['http://example.com','javascript:alert(1)','https://user@example.com','https://user:pass@example.com','https://example.com?x=1','https://example.com?','https://example.com/#fragment','https://example.com/#','https://example.com/\npath','https://example.com\\evil','https://-bad.example/path','https://example.com:65536/path','https://example.com/%ZZ'])
    expect((await save(url)).status).toBe(400);
  for(const url of ['https://example.com','https://sub-domain.example.com/path/to/diagnosis','https://example.com:8443/a%20b','https://example.com/path:99999/'])
    expect((await save(url)).data.assessmentUrl).toBe(url);
  expect((await h.call(h.account.handleAccount,ids.counselor,{action,assessmentUrl:'https://example.com'})).status).toBe(403);
  expect((await h.call(h.account.handleAccount,ids.admin,{action,assessmentUrl:'https://example.com',organizationId:'other-org'})).status).toBe(400);
  expect((await save('https://example.invalid/diagnosis')).data.assessmentUrl).toBe('https://example.invalid/diagnosis');
  expect((await h.call(h.account.handleAccount,ids.counselor)).data.assessmentUrl).toBe('https://example.invalid/diagnosis');
  expect((await h.call(h.account.handleAccount,ids.admin)).data.assessmentUrl).toBe('https://example.invalid/diagnosis');
  expect((await save('')).data.assessmentUrl).toBeNull();
  expect((await save('   ')).data.assessmentUrl).toBeNull();
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
