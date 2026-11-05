import {APIError, failure, headers, respond} from '../_shared/registration-http.ts';
import {authenticateAdmin} from '../_shared/admin-access.ts';
import {loadPairedPopulation, satisfactionPopulation, areaAnalysis, factorAnalysis, satisfactionAnalysis} from '../_shared/admin-aggregate.ts';

// REQ-A-006/007: admin-only pre/post aggregate report, computed on the server.
// - Role and organization come from the server profile (../_shared/admin-access.ts).
//   `company` (optional) narrows to one registered company inside that organization
//   and must be one of the organization's own companies (legacy company filter).
// - Returns counts and averages only: no names, contacts, login IDs, participant IDs or
//   per-person answers.
// - Implemented analyses: r1 (legacy rp1, area averages/change/rank), r2 (legacy rp2, factor
//   and area detail) and r3 (legacy rp3, satisfaction Q1/Q2). r1/r2 use the pre+post
//   population; r3 uses its satisfaction-answering subset (population.satN). The other
//   legacy screens (r4..r9) are not computed here yet and are not returned.
// - Without the post assessment feature there is no post data: post.available=false,
//   no population and no figures.
// - No audit record is written: there is no approved audit store yet (REQ-N-003).
export async function handleAdminAggregate(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (req.method !== 'GET') return respond({error:'METHOD_NOT_ALLOWED'}, 405);
  try {
    const {profile, admin, params} = await authenticateAdmin(req, ['company']);
    let company: string | null = null;
    if (params.has('company')) {
      company = (params.get('company') || '').trim();
      if (!company || company.length > 200) throw new APIError('INVALID_REQUEST', 400);
    }
    const postEnabled = Deno.env.get('SECONDCAREER_POST_DRAFT_ENABLED') === 'true';
    const {companies, pairs, excludedInvalid} = await loadPairedPopulation(admin, profile.organization_id, company, postEnabled);
    return respond({
      scope:'organization', generatedAt:new Date().toISOString(), company, companies,
      post:{available:postEnabled},
      population:pairs ? {n:pairs.length, satN:satisfactionPopulation(pairs).length, excludedInvalid} : null,
      analyses:{r1:pairs ? areaAnalysis(pairs) : null, r2:pairs ? factorAnalysis(pairs) : null, r3:pairs ? satisfactionAnalysis(pairs) : null}
    });
  } catch (error) { return failure(error); }
}
Deno.serve(handleAdminAggregate);
