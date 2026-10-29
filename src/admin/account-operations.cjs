const crypto = require('node:crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOGIN = /^[a-z0-9][a-z0-9_-]{5,31}$/;
function validatePlan(p) {
  if (!p || !UUID.test(p.organizationId || '') || !UUID.test(p.counselorId || '')) throw Error('Invalid organization or counselor ID');
  if (!LOGIN.test(p.loginId || '')) throw Error('Invalid login ID');
  if (!/^TEST-[A-Za-z0-9_-]{1,7}$/.test(p.displayName || '')) throw Error('Use a synthetic name: TEST- plus 1–7 ASCII characters');
  return p;
}
function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw Error('Password must be 12–128 characters');
}
async function createParticipant(api, plan, password, journal) {
  validatePlan(plan); validatePassword(password);
  const org = await api.get('organizations', {id: plan.organizationId});
  const counselor = await api.get('user_profiles', {user_id: plan.counselorId});
  if (org.length !== 1 || counselor.length !== 1 || counselor[0].role !== 'counselor' || counselor[0].organization_id !== plan.organizationId) throw Error('Organization or counselor mismatch');
  if ((await api.get('server_login_lookup', {login_id: plan.loginId})).length) throw Error('Login ID already exists');
  const operationId = crypto.randomUUID();
  // Stable per login ID: Auth's unique email constraint rejects concurrent retries.
  const email = `sp-test-${crypto.createHash('sha256').update(plan.loginId).digest('hex').slice(0,48)}@example.invalid`;
  const state = {operationId, email, organizationId:plan.organizationId, counselorId:plan.counselorId, loginId:plan.loginId, displayName:plan.displayName, stage:'auth_pending'};
  await journal.create(state);
  try {
    const user = await api.createUser(email, password);
    if (!user || !UUID.test(user.id || '')) throw Error('Auth response missing user ID');
    state.userId = user.id; state.stage = 'auth_created'; await journal.update(state);
    await api.insert('user_profiles', {user_id:user.id,organization_id:plan.organizationId,role:'participant',display_name:plan.displayName});
    state.stage = 'profile_created'; await journal.update(state);
    await api.insert('server_login_lookup', {user_id:user.id,login_id:plan.loginId,internal_email:email});
    state.stage = 'mapping_created'; await journal.update(state);
    const participantId=crypto.randomUUID(); state.participantId=participantId; state.stage='participant_pending'; await journal.update(state);
    await api.insert('participants', {id:participantId,organization_id:plan.organizationId,counselor_user_id:plan.counselorId,auth_user_id:user.id,display_name:plan.displayName});
    state.stage='complete'; await journal.update(state);
    return state;
  } catch (_) {
    throw Error('Creation incomplete or outcome unknown. Stop; inspect the journal and Auth/DB by its identifiers before any retry. Do not delete automatically.');
  }
}
async function rotatePassword(api, target, password) {
  if (!UUID.test(target.userId || '') || !['participant','counselor'].includes(target.role) || !LOGIN.test(target.loginId || '')) throw Error('Invalid target');
  validatePassword(password);
  const profile=await api.get('user_profiles',{user_id:target.userId});
  const mapping=await api.get('server_login_lookup',{user_id:target.userId});
  const authUser=await api.getUser(target.userId);
  if (profile.length!==1 || profile[0].role!==target.role || mapping.length!==1 || mapping[0].login_id!==target.loginId || authUser?.id!==target.userId || authUser.email!==mapping[0].internal_email) throw Error('Target mapping mismatch');
  await api.updatePassword(target.userId,password);
}
module.exports={validatePlan,validatePassword,createParticipant,rotatePassword};
