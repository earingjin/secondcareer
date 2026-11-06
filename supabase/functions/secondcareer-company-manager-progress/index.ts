import {APIError, failure, headers, respond, authenticate} from '../_shared/registration-http.ts';
import {managerContext} from '../_shared/company-manager-access.ts';
import {readAll, phaseStates, chunks} from '../_shared/admin-access.ts';

// STEP 14-D (REQ-M-002~004): read-only progress counts for one allowed client company.
// - Role, organization, account state, initial password change and company access are
//   re-read from the DB on every request (managerContext). The caller names only companyId.
// - Population is participants.company_id only; company_name-only (unlinked) rows are excluded.
// - Only assessment phase/status and participants.counselor_user_id are read. No participant
//   identifier, name, contact, answer, score, report or admin aggregate is loaded or returned.
// - Small-cell protection (PROVISIONAL, not an approved business policy): any published count
//   of 1..MIN-1 is withheld, and complementary cells are withheld so a hidden value cannot be
//   recovered by subtracting published values from a published total. Withheld values are
//   returned as null, never as 0 and never alongside the original value.
const MIN = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type State = 'draft' | 'submitted' | undefined;
const small = (v: number) => v > 0 && v < MIN;
const rate = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 1000) / 10 : null;

// Cells of one additive group whose sum is published. Returns the indexes to withhold.
// Primary: small cells. Complementary: while one cell alone, or the withheld cells together
// (or their complement within each row, given by `rest`), are still small, also withhold the
// smallest remaining cell.
export function withhold(values: number[], primary: boolean[], rest: number[] = values.map(() => 0)) {
  const hidden = new Set(values.map((_, i) => i).filter(i => primary[i]));
  const sum = (arr: number[]) => [...hidden].reduce((s, i) => s + arr[i], 0);
  while (hidden.size && hidden.size < values.length && (hidden.size === 1 || small(sum(values)) || small(sum(rest)))) {
    let next = -1;
    for (let i = 0; i < values.length; i++) if (!hidden.has(i) && (next < 0 || values[i] < values[next])) next = i;
    hidden.add(next);
  }
  return hidden;
}

function phaseBlock(states: State[], total: number) {
  const counts = {notStarted: 0, draft: 0, submitted: 0};
  for (const s of states) counts[s || 'notStarted']++;
  const keys = ['notStarted', 'draft', 'submitted'] as const, values = keys.map(k => counts[k]);
  const hidden = withhold(values, values.map(small));
  const out: Record<string, number | null> = {};
  keys.forEach((k, i) => { out[k] = hidden.has(i) ? null : values[i]; });
  out.completionRate = out.submitted === null ? null : rate(counts.submitted, total);
  return {available: true, ...out};
}

export async function handleCompanyManagerProgress(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (req.method !== 'GET') return respond({error:'METHOD_NOT_ALLOWED'}, 405);
  try {
    const context = await authenticate(req, ['company_manager']), {admin, profile} = context;
    const params = new URL(req.url).searchParams, keys = [...params.keys()], companyId = params.get('companyId');
    if (keys.length !== 1 || keys[0] !== 'companyId' || !companyId || !UUID.test(companyId)) throw new APIError('INVALID_REQUEST');
    // Feature flag, active account and company access (fresh DB reads); 403 when not allowed.
    const view = await managerContext(context, companyId.toLowerCase());
    if (view.mustChangePassword) throw new APIError('PASSWORD_CHANGE_REQUIRED', 403);
    const company = view.companies.find((c: any) => c.id === companyId.toLowerCase());
    if (!company || view.companies.length !== 1) throw new APIError('FORBIDDEN', 403);
    const org = profile.organization_id;
    const participants = await readAll(() => admin.from('participants').select('id,counselor_user_id').eq('organization_id', org).eq('company_id', company.id), 'id');
    const ids = participants.map(p => p.id), total = participants.length;
    const postEnabled = Deno.env.get('SECONDCAREER_POST_DRAFT_ENABLED') === 'true';
    const pre = await phaseStates(admin, ids, 'pre'), post = postEnabled ? await phaseStates(admin, ids, 'post') : null;
    const base = {companyId:company.id, companyName:company.name, generatedAt:new Date().toISOString(), basis:'participants.company_id',
      suppression:{minimumGroupSize:MIN, provisional:true}, postAvailable:postEnabled};
    if (total === 0) return respond({...base, total:0, suppressed:false, pre:phaseBlock([], 0), post:postEnabled ? phaseBlock([], 0) : {available:false}, counselors:[]});
    if (total < MIN) return respond({...base, total:null, suppressed:true, pre:null, post:postEnabled ? null : {available:false}, counselors:[]});

    // Counselor groups from the participant's own counselor_user_id (not 14-B2 company assignments).
    const counselorIds = [...new Set(participants.map(p => p.counselor_user_id).filter((v): v is string => typeof v === 'string'))];
    const names = new Map<string, string>();
    for (const group of chunks(counselorIds)) {
      const rows = await readAll(() => admin.from('user_profiles').select('user_id,display_name').eq('organization_id', org).eq('role', 'counselor').in('user_id', group), 'user_id');
      for (const r of rows) names.set(r.user_id, typeof r.display_name === 'string' && r.display_name.trim() ? r.display_name.trim() : '이름 미등록 상담사');
    }
    const groups = new Map<string, {label: string, unresolved: boolean, pre: State[], post: State[]}>();
    for (const p of participants) {
      const key = names.has(p.counselor_user_id) ? p.counselor_user_id : '';
      if (!groups.has(key)) groups.set(key, {label: key ? names.get(key)! : '담당 확인 필요', unresolved: !key, pre: [], post: []});
      const g = groups.get(key)!; g.pre.push(pre.get(p.id)); if (post) g.post.push(post.get(p.id));
    }
    const rows = [...groups.values()].sort((a, b) => a.unresolved ? 1 : b.unresolved ? -1 : a.label.localeCompare(b.label, 'ko'));
    const preBlock = phaseBlock(participants.map(p => pre.get(p.id)), total);
    const postBlock = post ? phaseBlock(participants.map(p => post.get(p.id)), total) : {available:false};

    // Row totals: one additive group summing to the published company total.
    const totals = rows.map(r => r.pre.length), hiddenTotal = withhold(totals, totals.map(small));
    const done = (phase: 'pre' | 'post') => rows.map(r => r[phase].filter(s => s === 'submitted').length);
    const submittedColumn = (counts: number[], companySubmittedHidden: boolean) => {
      // A withheld company figure would be recoverable as the sum of rows, so all rows are withheld.
      if (companySubmittedHidden) return new Set(rows.map((_, i) => i));
      // Row primary: hidden row total, or a small submitted / not-submitted part of the row.
      const open = counts.map((v, i) => totals[i] - v);
      return withhold(counts, counts.map((v, i) => hiddenTotal.has(i) || small(v) || small(open[i])), open);
    };
    const preDone = done('pre'), postDone = post ? done('post') : null;
    const preHidden = submittedColumn(preDone, preBlock.submitted === null);
    const postHidden = postDone ? submittedColumn(postDone, (postBlock as any).submitted === null) : null;
    const cell = (hidden: Set<number>, counts: number[], i: number) => hidden.has(i) ? {submitted:null, completionRate:null} : {submitted:counts[i], completionRate:rate(counts[i], totals[i])};
    const counselors = rows.map((r, i) => ({label:r.label, unresolved:r.unresolved, total:hiddenTotal.has(i) ? null : totals[i],
      pre:cell(preHidden, preDone, i), post:postHidden && postDone ? cell(postHidden, postDone, i) : {available:false}}));
    return respond({...base, total, suppressed:false, pre:preBlock, post:postBlock, counselors});
  } catch (error) { return failure(error); }
}
Deno.serve(handleCompanyManagerProgress);
