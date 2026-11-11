import {authenticate, APIError, failure, headers, readBody, respond, secretDigest} from '../_shared/registration-http.ts';
import {generateTemporaryPassword} from '../_shared/temporary-password.ts';
export {generateTemporaryPassword};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function handleRegistration(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (req.method !== 'POST') return respond({error:'METHOD_NOT_ALLOWED'}, 405);
  try {
    const {user, profile, admin} = await authenticate(req);
    if (!['admin','counselor'].includes(profile.role)) throw new APIError('FORBIDDEN', 403);
    // Enable only after SQL review and the existing assessment guard/RLS
    // integration. Frontend routing alone cannot enforce the first change.
    if (Deno.env.get('SECONDCAREER_REGISTRATION_ENABLED') !== 'true') throw new APIError('REGISTRATION_NOT_CONFIGURED', 503);
    const body = await readBody(req);
    if (Object.keys(body).some(k => !['displayName','phone','counselorUserId','companyName','companyId','requestId'].includes(k))) throw new APIError('INVALID_REQUEST');
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g,'') : '';
    const loginId = phone.slice(-8);
    let companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
    const linked = Object.hasOwn(body,'companyId'), companyId = linked && typeof body.companyId === 'string' ? body.companyId.toLowerCase() : linked ? body.companyId : null;
    if (linked && profile.role !== 'admin') throw new APIError('FORBIDDEN', 403);
    if (linked && (typeof companyId !== 'string' || !UUID.test(companyId))) throw new APIError('INVALID_REQUEST');
    if (linked && Object.hasOwn(body,'companyName') && typeof body.companyName !== 'string') throw new APIError('INVALID_REQUEST');
    const counselorUserId = profile.role === 'counselor' ? user.id : body.counselorUserId;
    if (!displayName || displayName.length > 12 || phone.length < 8 || phone.length > 20 || companyName.length > 200 ||
        !UUID.test(counselorUserId || '') || !UUID.test(body.requestId || '')) throw new APIError('INVALID_REQUEST');
    const {data:counselor, error:counselorError} = await admin.from('user_profiles').select('user_id').eq('user_id', counselorUserId).eq('role','counselor').eq('organization_id', profile.organization_id).maybeSingle();
    if (counselorError) throw new APIError('COUNSELOR_QUERY_FAILED', 503);
    if (!counselor) throw new APIError('FORBIDDEN', 403);
    if (linked) {
      const {data:company,error} = await admin.from('client_companies').select('id,name,status').eq('organization_id',profile.organization_id).eq('id',companyId).maybeSingle();
      if (error) throw new APIError('COMPANY_QUERY_FAILED',503);
      if (!company || company.status !== 'active') throw new APIError('COMPANY_UNAVAILABLE',403);
      const key = (s: string) => s.trim().replace(/\s+/gu,' ').replace(/[A-Z]/g,c=>c.toLowerCase());
      if (companyName && key(companyName) !== key(company.name)) throw new APIError('COMPANY_NAME_MISMATCH');
      companyName = company.name;
    }
    const {data:existing, error:lookupError} = await admin.from('server_login_lookup').select('user_id').eq('login_id', loginId).maybeSingle();
    if (lookupError) throw new APIError('LOOKUP_FAILED', 503);
    if (existing) throw new APIError('LOGIN_ID_UNAVAILABLE', 409);
    // Reserve before Auth creation. A pending/complete reservation prevents
    // concurrent/retried creation and never stores the generated password.
    const {error:reserveError} = await admin.from('participant_registration_requests').insert({id:body.requestId, actor_user_id:user.id, organization_id:profile.organization_id, counselor_user_id:counselorUserId, login_id:loginId, display_name:displayName, phone, company_name:companyName,...(linked?{company_id:companyId}:{})});
    if (reserveError) throw new APIError(reserveError.code === '23505' ? 'REGISTRATION_ALREADY_REQUESTED' : 'REGISTRATION_NOT_CONFIGURED', reserveError.code === '23505' ? 409 : 503);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(loginId));
    const internalEmail = 'sp-' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('') + '@accounts.example.invalid';
    const temporaryPassword = generateTemporaryPassword();
    const {data:created, error:createError} = await admin.auth.admin.createUser({email:internalEmail, password:temporaryPassword, email_confirm:true, app_metadata:{must_change_password:true, temporary_password_digest:await secretDigest(temporaryPassword), registration_request_id:body.requestId}});
    if (createError || !created.user) throw new APIError('REGISTRATION_OUTCOME_UNKNOWN', 503);
    // Atomically link profile, private login mapping and participant.
    const args = {request_id:body.requestId, new_user_id:created.user.id, new_internal_email:internalEmail};
    let {data:completed, error:completeError} = await admin.rpc(linked?'secondcareer_complete_company_registration':'secondcareer_complete_registration', args);
    if (linked && (completeError || !completed || typeof completed.participantId !== 'string' || completed.companyId !== companyId || typeof completed.companyName !== 'string')) {
      // Never delete on a timeout alone: recovery serializes with completion on the journal row.
      const {data:recovery,error} = await admin.rpc('secondcareer_recover_company_registration',args);
      if (!error && recovery?.outcome === 'complete' && recovery.companyId === companyId && typeof recovery.participantId === 'string' && typeof recovery.companyName === 'string') { completed=recovery;completeError=null; }
      else {
        if (!error && recovery?.outcome === 'cancelled') await admin.auth.admin.deleteUser(created.user.id);
        throw new APIError('REGISTRATION_OUTCOME_UNKNOWN',503);
      }
    }
    const participantId = linked ? completed?.participantId : completed;
    if (completeError || typeof participantId !== 'string') throw new APIError('REGISTRATION_OUTCOME_UNKNOWN', 503);
    // Sole disclosure; never log, persist, or offer a read/retry secret API.
    return respond({participantId, loginId, displayName, temporaryPassword,...(linked?{companyId,companyName:completed.companyName}:{})}, 201);
  } catch (error) { return failure(error); }
}
Deno.serve(handleRegistration);
