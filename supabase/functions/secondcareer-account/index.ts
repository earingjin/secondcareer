import {authenticate, APIError, failure, headers, readBody, respond, secretDigest} from '../_shared/registration-http.ts';
import {participantAccessError} from '../_shared/participant-access.ts';

export async function handleAccount(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (!['GET','POST'].includes(req.method)) return respond({error:'METHOD_NOT_ALLOWED'}, 405);
  try {
    const {user, profile, admin} = await authenticate(req);
    const accessError=participantAccessError(user);
    if(accessError==='ACCOUNT_STATE_INVALID')throw new APIError(accessError,403);
    if(profile.role==='participant'){
      const {data:participant,error}=await admin.from('participants').select('id').eq('auth_user_id',user.id).eq('organization_id',profile.organization_id).maybeSingle();
      if(error)throw new APIError('PARTICIPANT_QUERY_FAILED',503);
      if(!participant)throw new APIError('PARTICIPANT_NOT_LINKED',403);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (body.action === 'update-assessment-url') {
        if (profile.role !== 'admin') throw new APIError('FORBIDDEN', 403);
        if (Object.keys(body).some(k => !['action','assessmentUrl'].includes(k)) ||
            !(body.assessmentUrl === null || typeof body.assessmentUrl === 'string')) throw new APIError('INVALID_ASSESSMENT_URL');
        const value = typeof body.assessmentUrl === 'string' ? body.assessmentUrl.trim() : '';
        if (value) {
          let url: URL;
          try { url = new URL(value); } catch { throw new APIError('INVALID_ASSESSMENT_URL'); }
          if (value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value) || !/^https:\/\//i.test(value) ||
              url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) throw new APIError('INVALID_ASSESSMENT_URL');
        }
        const {data, error} = await admin.from('organizations').update({assessment_url:value || null}).eq('id', profile.organization_id).select('assessment_url').maybeSingle();
        if (error || !data) throw new APIError('ORGANIZATION_UPDATE_FAILED', 503);
        return respond({assessmentUrl:data.assessment_url});
      }
      if (Object.keys(body).some(k => !['action','password'].includes(k)) || body.action !== 'change-password' ||
          typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) throw new APIError('INVALID_PASSWORD');
      if (profile.role !== 'participant' || accessError!=='PASSWORD_CHANGE_REQUIRED') throw new APIError('FORBIDDEN', 403);
      if (user.app_metadata?.temporary_password_digest === await secretDigest(body.password)) throw new APIError('INVALID_PASSWORD');
      // One Auth update changes password and trusted flag. Never store the
      // password in an application table or user-editable metadata.
      const {error} = await admin.auth.admin.updateUserById(user.id, {password:body.password, app_metadata:{...user.app_metadata, temporary_password_digest:null, must_change_password:false}});
      if (error) throw new APIError('PASSWORD_UPDATE_FAILED', 503);
      return respond({changed:true});
    }
    const mustChangePassword = accessError==='PASSWORD_CHANGE_REQUIRED';
    if (profile.role === 'participant') return respond({profile, mustChangePassword});
    const {data:org, error:orgError} = await admin.from('organizations').select('name,assessment_url').eq('id', profile.organization_id).maybeSingle();
    if (orgError || !org) throw new APIError('ORGANIZATION_QUERY_FAILED', 503);
    let query = admin.from('user_profiles').select('user_id,display_name').eq('organization_id', profile.organization_id).eq('role','counselor');
    if (profile.role === 'counselor') query = query.eq('user_id', user.id);
    const {data:counselors, error} = await query;
    if (error) throw new APIError('COUNSELOR_QUERY_FAILED', 503);
    return respond({profile, mustChangePassword, registrationAvailable:Deno.env.get('SECONDCAREER_REGISTRATION_ENABLED')==='true', organizationName:org.name, assessmentUrl:org.assessment_url || null, counselors:(counselors || []).map(c => ({id:c.user_id, name:c.display_name || c.user_id}))});
  } catch (error) { return failure(error); }
}
Deno.serve(handleAccount);
