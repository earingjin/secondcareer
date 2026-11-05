import {APIError, failure, headers, respond} from '../_shared/registration-http.ts';
import {authenticateAdmin} from '../_shared/admin-access.ts';
import {loadPairedPopulation, areaAnalysis} from '../_shared/admin-aggregate.ts';

// REQ-A-006/007: admin-only pre/post aggregate report, computed on the server.
// - Role and organization come from the server profile (../_shared/admin-access.ts).
//   `company` (optional) narrows to one registered company inside that organization
//   and must be one of the organization's own companies (legacy company filter).
// - Returns counts and averages only: no names, contacts, login IDs, participant IDs or
//   per-person answers.
// - Implemented analysis: r1 (legacy rp1, area averages/change/rank). The other legacy
//   screens (r2..r9) are not computed here yet and are not returned.
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
      population:pairs ? {n:pairs.length, excludedInvalid} : null,
      analyses:{r1:pairs ? areaAnalysis(pairs) : null}
    });
  } catch (error) { return failure(error); }
}
Deno.serve(handleAdminAggregate);
