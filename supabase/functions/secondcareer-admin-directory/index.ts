import {APIError, failure, headers, respond} from '../_shared/registration-http.ts';
import {authenticateAdmin, readAll, chunks, phaseStates, companyOf, byCompany} from '../_shared/admin-access.ts';

// REQ-A-001/002 (read only): the administrator's organization, its registered
// companies, counselors and participants. Nothing here creates, changes or deletes
// an account, assignment or company; those flows have no approved server contract yet.
// - "Organization" is the operating tenant (organizations, user_profiles.organization_id).
//   "Company" is the participant's registered 소속기업 text (participants.company_name).
//   The two are reported separately and never mixed.
// - Returned per participant: participant ID (report lookup key), registered display
//   name, login ID, company label, counselor reference and pre-assessment state. No phone, e-mail, internal Auth
//   e-mail, answers, results or post-assessment content.
// Authentication, role and organization scope: ../_shared/admin-access.ts.
const collator = new Intl.Collator('ko');

async function loginIds(admin: any, userIds: string[]) {
  const ids = new Map<string, string>();
  for (const group of chunks(userIds)) {
    for (const row of await readAll(() => admin.from('server_login_lookup').select('user_id,login_id').in('user_id', group), 'user_id')) {
      if (typeof row.login_id === 'string') ids.set(row.user_id, row.login_id);
    }
  }
  return ids;
}

export async function handleAdminDirectory(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (req.method !== 'GET') return respond({error:'METHOD_NOT_ALLOWED'}, 405);
  try {
    const {profile, admin} = await authenticateAdmin(req);
    const org = profile.organization_id;
    const {data:organization, error:orgError} = await admin.from('organizations').select('name').eq('id', org).maybeSingle();
    if (orgError || !organization) throw new APIError('ORGANIZATION_QUERY_FAILED', 503);
    const counselorRows = await readAll(() => admin.from('user_profiles').select('user_id,display_name').eq('organization_id', org).eq('role', 'counselor'), 'user_id');
    const participants = await readAll(() => admin.from('participants').select('id,display_name,company_name,counselor_user_id,auth_user_id').eq('organization_id', org), 'id');
    const pre = await phaseStates(admin, participants.map(p => p.id), 'pre');
    const logins = await loginIds(admin, [...new Set([...counselorRows.map(c => c.user_id), ...participants.map(p => p.auth_user_id).filter(Boolean)])]);

    const counselors = new Map<string, {id: string, name: string, loginId: string | null, assigned: number}>();
    for (const c of counselorRows) counselors.set(c.user_id, {id:c.user_id, name:typeof c.display_name === 'string' && c.display_name.trim() ? c.display_name.trim() : '이름 미등록', loginId:logins.get(c.user_id) ?? null, assigned:0});
    const companies = new Map<string, {name: string | null, total: number, counselors: Set<string>}>();
    let unassigned = 0, unknownCounselor = 0;
    const list = participants.map(p => {
      const companyName = companyOf(p.company_name), key = companyName ?? '';
      if (!companies.has(key)) companies.set(key, {name:companyName, total:0, counselors:new Set()});
      const company = companies.get(key)!; company.total++;
      // A reference to someone who is not a counselor of this organization is reported as
      // "needs checking" without revealing who it points to.
      const counselor = p.counselor_user_id ? counselors.get(p.counselor_user_id) : undefined;
      const assignment = !p.counselor_user_id ? 'unassigned' : counselor ? 'assigned' : 'unknown';
      if (counselor) { counselor.assigned++; company.counselors.add(counselor.id); }
      else if (assignment === 'unassigned') unassigned++; else unknownCounselor++;
      // `id` lets the admin screen ask for this participant's report. It is a lookup key
      // only: secondcareer-admin-report re-checks the organization on every request.
      return {id:p.id, name:p.display_name || '', loginId:(p.auth_user_id && logins.get(p.auth_user_id)) || null, companyName,
        counselorId:counselor ? counselor.id : null, assignment, preStatus:pre.get(p.id) || 'notStarted'};
    });
    list.sort((a, b) => byCompany({name:a.companyName}, {name:b.companyName}) || collator.compare(a.name, b.name) || collator.compare(a.loginId || '', b.loginId || ''));
    return respond({
      scope:'organization', generatedAt:new Date().toISOString(), organizationName:organization.name || '',
      totals:{participants:list.length, counselors:counselors.size, unassigned, unknownCounselor},
      counselors:[...counselors.values()].sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.loginId || '', b.loginId || '')),
      companies:[...companies.values()].sort(byCompany).map(c => ({name:c.name, total:c.total, counselors:c.counselors.size})),
      participants:list
    });
  } catch (error) { return failure(error); }
}
Deno.serve(handleAdminDirectory);
