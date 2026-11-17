import {APIError, failure, headers, respond} from '../_shared/registration-http.ts';
import {authenticateAdmin, readAll, phaseStates, companyOf, byCompany} from '../_shared/admin-access.ts';

// REQ-A-004: read-only progress counts for an administrator.
// Only submission state is read (assessments.phase/status). Answers, results,
// personal fields and the calculation engine are never loaded or returned.
// Authentication, role and organization scope: ../_shared/admin-access.ts.
type Counts = {notStarted: number, draft: number, submitted: number};
const zero = (): Counts => ({notStarted:0, draft:0, submitted:0});
const add = (counts: Counts, state: 'draft' | 'submitted' | undefined) => { counts[state || 'notStarted']++; };

export async function handleAdminProgress(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (req.method !== 'GET') return respond({error:'METHOD_NOT_ALLOWED'}, 405);
  try {
    const {profile, admin, params} = await authenticateAdmin(req, ['companyId']);
    if (params.has('companyId')) {
      const companyId = params.get('companyId')!;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) throw new APIError('INVALID_REQUEST',400);
      const {data:company,error} = await admin.from('client_companies').select('id,name').eq('organization_id',profile.organization_id).eq('id',companyId.toLowerCase()).maybeSingle();
      if (error) throw new APIError('QUERY_FAILED',503);
      if (!company) throw new APIError('FORBIDDEN',403);
      const participants = await readAll(() => admin.from('participants').select('id').eq('organization_id',profile.organization_id).eq('company_id',company.id),'id');
      const ids = participants.map(p=>p.id), pre = await phaseStates(admin,ids,'pre');
      const post = Deno.env.get('SECONDCAREER_POST_DRAFT_ENABLED') === 'true' ? await phaseStates(admin,ids,'post') : null;
      const preCounts=zero(),postCounts=zero();
      for (const p of participants) { add(preCounts,pre.get(p.id)); if(post)add(postCounts,post.get(p.id)); }
      return respond({scope:'company',companyId:company.id,companyName:company.name,generatedAt:new Date().toISOString(),total:participants.length,pre:preCounts,post:post?{available:true,...postCounts}:{available:false}});
    }
    const participants = await readAll(() => admin.from('participants').select('id,company_name').eq('organization_id', profile.organization_id), 'id');
    const ids = participants.map(p => p.id);
    const pre = await phaseStates(admin, ids, 'pre');
    const postEnabled = Deno.env.get('SECONDCAREER_POST_DRAFT_ENABLED') === 'true';
    const post = postEnabled ? await phaseStates(admin, ids, 'post') : null;
    const totals = {pre:zero(), post:zero()}, companies = new Map<string, {name: string | null, total: number, pre: Counts, post: Counts}>();
    for (const p of participants) {
      const name = companyOf(p.company_name), key = name ?? '';
      if (!companies.has(key)) companies.set(key, {name, total:0, pre:zero(), post:zero()});
      const c = companies.get(key)!; c.total++;
      add(totals.pre, pre.get(p.id)); add(c.pre, pre.get(p.id));
      if (post) { add(totals.post, post.get(p.id)); add(c.post, post.get(p.id)); }
    }
    const list = [...companies.values()].sort(byCompany);
    const postBlock = (counts: Counts) => post ? {available:true, ...counts} : {available:false};
    return respond({
      scope:'organization', generatedAt:new Date().toISOString(), total:participants.length,
      pre:totals.pre, post:postBlock(totals.post),
      companies:list.map(c => ({name:c.name, total:c.total, pre:c.pre, post:postBlock(c.post)}))
    });
  } catch (error) { return failure(error); }
}
Deno.serve(handleAdminProgress);
