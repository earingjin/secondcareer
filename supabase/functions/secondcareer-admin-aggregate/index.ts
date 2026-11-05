import {APIError, failure, headers, respond} from '../_shared/registration-http.ts';
import {authenticateAdmin} from '../_shared/admin-access.ts';
import {loadPairedPopulation, satisfactionPopulation, detailPopulation, areaAnalysis, factorAnalysis, satisfactionAnalysis, stabilityAnalysis, complaintAnalysis, consultingAnalysis, improvementAnalysis, firstSessionAnalysis} from '../_shared/admin-aggregate.ts';

// REQ-A-006/007: admin-only pre/post aggregate report, computed on the server.
// - Role and organization come from the server profile (../_shared/admin-access.ts).
//   `company` (optional) narrows to one registered company inside that organization
//   and must be one of the organization's own companies (legacy company filter).
// - Returns counts and averages only: no names, contacts, login IDs, participant IDs or
//   per-person answers.
// - Implemented analyses: r1 (legacy rp1, area averages/change/rank), r2 (legacy rp2, factor
//   and area detail), r3 (legacy rp3, satisfaction Q1/Q2), r4 (rp4, psychological stability),
//   r5 (rp5, complaint change), r6 (rp6, consulting expectation/effect), and r7 (rp7, improvements).
//   r1/r2 use the pre+post population; r3 and r7 use its satisfaction-answering subset (population.satN); r4..r6 use the subset
//   whose satisfaction and expectation answers are all valid (population.detailN). r8 uses the independent pre-submitted population.
//   r9 is not computed. Without the post feature, r1..r7 remain null while r8 remains available.
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
    const {companies, pairs, excludedInvalid, firstChoices, preExcludedInvalid} = await loadPairedPopulation(admin, profile.organization_id, company, postEnabled);
    return respond({
      scope:'organization', generatedAt:new Date().toISOString(), company, companies,
      post:{available:postEnabled},
      prePopulation:{available:true, n:firstChoices.length, excludedInvalid:preExcludedInvalid},
      population:pairs ? {n:pairs.length, satN:satisfactionPopulation(pairs).length, detailN:detailPopulation(pairs).length, excludedInvalid} : null,
      analyses:{r1:pairs ? areaAnalysis(pairs) : null, r2:pairs ? factorAnalysis(pairs) : null, r3:pairs ? satisfactionAnalysis(pairs) : null,
        r4:pairs ? stabilityAnalysis(pairs) : null, r5:pairs ? complaintAnalysis(pairs) : null, r6:pairs ? consultingAnalysis(pairs) : null, r7:pairs ? improvementAnalysis(pairs) : null, r8:firstSessionAnalysis(firstChoices)}
    });
  } catch (error) { return failure(error); }
}
Deno.serve(handleAdminAggregate);
