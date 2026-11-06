import {APIError, failure, headers, respond as out} from '../_shared/registration-http.ts';
import {authenticateAdmin} from '../_shared/admin-access.ts';
import {reportCounselors, submittedReport} from '../secondcareer-assessment/shared/report.ts';

// REQ-A-005: an administrator views or prints one participant's individual report
// (counselor 5 pages, client 3 pages). It is a separate endpoint so the counselor
// function keeps its counselor-only rule unchanged.
// - Role and organization come from the server profile (../_shared/admin-access.ts).
// - `id` is only a lookup key: the participant is re-read with this admin's
//   organization on every request; outside it, or not yet submitted, gives one
//   NOT_AVAILABLE answer so the response does not reveal which case applied.
// - The report is rendered by the same server code as the counselor report
//   (secondcareer-assessment/shared/report.ts), so pages, judgements and stored
//   comments/keywords are the same. Only the non-printed toolbar differs: the back
//   button returns to the admin list and the counselor change-history panel (past
//   answer text) is not included.
// - Finer business-scope rules inside an organization are not decided (requirements
//   §10.3); the scope is the administrator's organization.
// - No audit record is written: there is no approved audit store yet (REQ-N-003).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_TOOLBAR = {backV:() => 'admin', backLbl:() => '관리자 참여자 목록', editPanel:() => ''};

export async function handleAdminReport(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (req.method !== 'GET') return out({error:'METHOD_NOT_ALLOWED'}, 405);
  try {
    const {profile, admin, params} = await authenticateAdmin(req, ['id', 'kind']);
    const id = params.get('id') || '';
    if (!UUID.test(id)) throw new APIError('INVALID_REQUEST', 400);
    const {data:part, error:partError} = await admin.from('participants').select('id,display_name,counselor_user_id').eq('organization_id', profile.organization_id).eq('id', id).maybeSingle();
    if (partError) throw new APIError('QUERY_FAILED', 503);
    if (!part) return out({error:'NOT_AVAILABLE'}, 403);
    const {data:a, error:assessmentError} = await admin.from('assessments').select('id,participant_id,phase,status,answers,result,updated_at,submitted_at').eq('participant_id', part.id).eq('phase', 'pre').maybeSingle();
    if (assessmentError) throw new APIError('QUERY_FAILED', 503);
    const {counselors, error:counselorError} = await reportCounselors(admin, profile.organization_id, part.counselor_user_id ? [part.counselor_user_id] : []);
    if (counselorError) throw new APIError('QUERY_FAILED', 503);
    const [status, body] = await submittedReport(admin, part, a, counselors, params.get('kind'), {toolbar:ADMIN_TOOLBAR, withHistory:false});
    return out(body, status);
  } catch (error) { return failure(error); }
}
Deno.serve(handleAdminReport);
