import {authenticate, APIError, failure, headers, respond} from '../_shared/registration-http.ts';
import {participantAccessError} from '../_shared/participant-access.ts';

// REQ-A-004: read-only progress counts for an administrator.
// - Role and scope come only from the server profile (user_profiles.role/organization_id).
//   The request carries no organization, company or participant identifier.
// - Only submission state is read (assessments.phase/status). Answers, results,
//   personal fields and the calculation engine are never loaded or returned.
// - Finer "business scope" rules are not decided yet (requirements §10.3); the
//   scope applied here is the administrator's own organization, as in the
//   existing account and registration functions.
type Counts = {notStarted: number, draft: number, submitted: number};
const zero = (): Counts => ({notStarted:0, draft:0, submitted:0});

// Key-ordered paging, the same approach as the assessment function: a page
// boundary never shifts and a failed page fails the whole read.
async function readAll(makeQuery: () => any, key: string) {
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
const chunks = <T>(items: T[], size = 100) => { const out: T[][] = []; for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size)); return out; };

// participant_id -> 'draft' | 'submitted'. A missing row means not started.
// Unknown states or two rows for one participant and phase mean the stored
// contract is not what this code expects, so the read fails closed.
async function phaseStates(admin: any, ids: string[], phase: 'pre' | 'post') {
  const states = new Map<string, 'draft' | 'submitted'>(), allowed = new Set(ids);
  for (const group of chunks(ids)) {
    const rows = await readAll(() => admin.from('assessments').select('id,participant_id,status').in('participant_id', group).eq('phase', phase), 'id');
    for (const row of rows) {
      if (!allowed.has(row.participant_id) || !['draft','submitted'].includes(row.status) || states.has(row.participant_id)) throw new APIError('ASSESSMENT_STATE_INVALID', 500);
      states.set(row.participant_id, row.status);
    }
  }
  return states;
}
const add = (counts: Counts, state: 'draft' | 'submitted' | undefined) => { counts[state || 'notStarted']++; };

export async function handleAdminProgress(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (req.method !== 'GET') return respond({error:'METHOD_NOT_ALLOWED'}, 405);
  try {
    const {user, profile, admin} = await authenticate(req);
    const accessError = participantAccessError(user);
    if (accessError) throw new APIError(accessError, 403);
    if (profile.role !== 'admin') throw new APIError('FORBIDDEN', 403);
    // No client-supplied scope is accepted, not even as a filter.
    if (new URL(req.url).search) throw new APIError('INVALID_REQUEST', 400);
    const participants = await readAll(() => admin.from('participants').select('id,company_name').eq('organization_id', profile.organization_id), 'id');
    const ids = participants.map(p => p.id);
    const pre = await phaseStates(admin, ids, 'pre');
    const postEnabled = Deno.env.get('SECONDCAREER_POST_DRAFT_ENABLED') === 'true';
    const post = postEnabled ? await phaseStates(admin, ids, 'post') : null;
    const totals = {pre:zero(), post:zero()}, companies = new Map<string, {name: string | null, total: number, pre: Counts, post: Counts}>();
    for (const p of participants) {
      const name = typeof p.company_name === 'string' && p.company_name.trim() ? p.company_name.trim() : null, key = name ?? '';
      if (!companies.has(key)) companies.set(key, {name, total:0, pre:zero(), post:zero()});
      const c = companies.get(key)!; c.total++;
      add(totals.pre, pre.get(p.id)); add(c.pre, pre.get(p.id));
      if (post) { add(totals.post, post.get(p.id)); add(c.post, post.get(p.id)); }
    }
    // Named companies in Korean order; participants without a company last.
    const list = [...companies.values()].sort((a, b) => a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name, 'ko'));
    const postBlock = (counts: Counts) => post ? {available:true, ...counts} : {available:false};
    return respond({
      scope:'organization', generatedAt:new Date().toISOString(), total:participants.length,
      pre:totals.pre, post:postBlock(totals.post),
      companies:list.map(c => ({name:c.name, total:c.total, pre:c.pre, post:postBlock(c.post)}))
    });
  } catch (error) { return failure(error); }
}
Deno.serve(handleAdminProgress);
