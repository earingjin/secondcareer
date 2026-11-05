import {authenticate, APIError} from './registration-http.ts';
import {participantAccessError} from './participant-access.ts';

// Shared by the admin read APIs (REQ-A-004 progress, REQ-A-001/002 directory).
// - Role and scope come only from the server profile (user_profiles.role/organization_id).
//   The request carries no organization, company, counselor or participant identifier.
// - Finer "business scope" rules are not decided yet (requirements §10.3); the scope is
//   the administrator's own organization, as in the account and registration functions.
export async function authenticateAdmin(req: Request, allowedParams: string[] = []) {
  const {user, profile, admin} = await authenticate(req);
  const accessError = participantAccessError(user);
  if (accessError) throw new APIError(accessError, 403);
  if (profile.role !== 'admin') throw new APIError('FORBIDDEN', 403);
  // No client-supplied scope is accepted, not even as a filter. A caller may name
  // target parameters (e.g. a report's participant ID); each is a lookup key that the
  // caller re-checks against this organization, never a permission.
  const params = new URL(req.url).searchParams, keys = [...params.keys()];
  if (keys.some(k => !allowedParams.includes(k)) || new Set(keys).size !== keys.length) throw new APIError('INVALID_REQUEST', 400);
  return {user, profile, admin, params};
}

// Key-ordered paging: a page boundary never shifts and a failed page fails the whole read.
export async function readAll(makeQuery: () => any, key: string) {
  const rows: any[] = []; let cursor: string | null = null;
  for (;;) {
    let query = makeQuery().order(key, {ascending:true}).limit(100);
    if (cursor !== null) query = query.gt(key, cursor);
    const {data, error} = await query;
    if (error || !Array.isArray(data)) throw new APIError('QUERY_FAILED', 503);
    if (!data.length) return rows;
    for (const row of data) {
      if (typeof row[key] !== 'string' || (cursor !== null && row[key] <= cursor)) throw new APIError('QUERY_FAILED', 503);
      cursor = row[key]; rows.push(row);
    }
  }
}
export const chunks = <T>(items: T[], size = 100) => { const out: T[][] = []; for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size)); return out; };

// participant_id -> 'draft' | 'submitted'. A missing row means not started.
// Unknown states or two rows for one participant and phase mean the stored
// contract is not what this code expects, so the read fails closed.
// participant_id -> row with `status` and any extra selected column (e.g. 'pre:answers->pre').
export async function phaseRows(admin: any, ids: string[], phase: 'pre' | 'post', extra = '') {
  const rows = new Map<string, any>(), allowed = new Set(ids), columns = 'id,participant_id,status' + (extra ? ',' + extra : '');
  for (const group of chunks(ids)) {
    for (const row of await readAll(() => admin.from('assessments').select(columns).in('participant_id', group).eq('phase', phase), 'id')) {
      if (!allowed.has(row.participant_id) || !['draft','submitted'].includes(row.status) || rows.has(row.participant_id)) throw new APIError('ASSESSMENT_STATE_INVALID', 500);
      rows.set(row.participant_id, row);
    }
  }
  return rows;
}
export async function phaseStates(admin: any, ids: string[], phase: 'pre' | 'post') {
  const states = new Map<string, 'draft' | 'submitted'>();
  for (const [id, row] of await phaseRows(admin, ids, phase)) states.set(id, row.status);
  return states;
}

// Registered company label (participants.company_name). Blank means "not specified".
export const companyOf = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
// Named companies in Korean order; "not specified" last.
export const byCompany = (a: {name: string | null}, b: {name: string | null}) => a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name, 'ko');
