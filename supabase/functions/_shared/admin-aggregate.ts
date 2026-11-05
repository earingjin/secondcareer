import {APIError} from './registration-http.ts';
import {readAll, phaseRows, companyOf} from './admin-access.ts';
import {AREAS, FACTORS} from '../secondcareer-assessment/js/01-areas.js';
import {AREA_COUNT, ITEMS_PER_AREA, RAW_MAX, SCALE_MIN, SCALE_MAX} from '../secondcareer-assessment/js/02-eval-config.js';
import {sum} from '../secondcareer-assessment/js/04-util.js';
import {rawSums, full} from '../secondcareer-assessment/js/05-engine.js';

// REQ-A-006 common base for the admin pre/post aggregate report (legacy aReport/repData).
// Population (legacy repData `pp`): participants of the administrator's organization,
// optionally one registered company, whose pre AND post assessments are both submitted
// and whose 15 answers each are complete. Satisfaction population (legacy `sv`): those
// of `pp` with a valid satisfaction answer.
// Only answers.pre, answers.post and the two satisfaction scores answers.sat.q1/q2 are read;
// no registration answers, results, names, contacts, free-text opinions or choice answers.
// Later analyses (REQ-A-010..015) need other answer parts; they are not read or
// estimated here until those analyses are implemented.
const collator = new Intl.Collator('ko');
// Engine `full` plus integers: a non-integer stored value would turn sums into strings.
const complete = (a: unknown) => full(a) && (a as unknown[]).every(Number.isInteger);
const validScore = (v: unknown) => Number.isInteger(v) && (v as number) >= SCALE_MIN && (v as number) <= SCALE_MAX;

export type Pair = {pre: number[], post: number[], sat: {q1: number, q2: number} | null};
// Selected JSON parts of the post row; only these three values are fetched.
const POST_COLUMNS = 'post:answers->post,q1:answers->sat->q1,q2:answers->sat->q2';

// withAnswers=false (post assessment not enabled): companies only, no answers are read.
export async function loadPairedPopulation(admin: any, organizationId: string, company: string | null, withAnswers = true) {
  const participants = await readAll(() => admin.from('participants').select('id,company_name').eq('organization_id', organizationId), 'id');
  const companies = [...new Set(participants.map(p => companyOf(p.company_name)).filter(Boolean) as string[])].sort(collator.compare);
  if (company !== null && !companies.includes(company)) throw new APIError('INVALID_REQUEST', 400);
  if (!withAnswers) return {companies, pairs:null, excludedInvalid:0};
  const ids = participants.filter(p => company === null || companyOf(p.company_name) === company).map(p => p.id);
  const pre = await phaseRows(admin, ids, 'pre', 'pre:answers->pre');
  const post = await phaseRows(admin, ids, 'post', POST_COLUMNS);
  const pairs: Pair[] = []; let excludedInvalid = 0;
  for (const id of ids) {
    const a = pre.get(id), b = post.get(id);
    if (a?.status !== 'submitted' || b?.status !== 'submitted') continue;
    // A satisfaction answer counts only when both scores are valid (legacy: `p.sat` present).
    if (complete(a.pre) && complete(b.post)) pairs.push({pre:a.pre, post:b.post, sat:validScore(b.q1) && validScore(b.q2) ? {q1:b.q1, q2:b.q2} : null}); else excludedInvalid++;
  }
  return {companies, pairs, excludedInvalid};
}
export const satisfactionPopulation = (pairs: Pair[]) => pairs.filter(p => p.sat);

// Legacy helpers, same definitions as legacy/index.original.html (mean, r1f).
const mean = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const r1f = (x: number) => Math.round(x * 10) / 10;
// Legacy sort for rankings: change rate descending; equal rates keep the original order (stable sort).
const rankOf = (rates: number[]) => { const order = rates.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map(x => x[1]); return rates.map((_v, i) => order.indexOf(i) + 1); };
const areaStats = (pairs: Pair[]) => {
  const A = (k: 'pre' | 'post') => AREAS.map((_a: unknown, i: number) => r1f(mean(pairs.map(p => rawSums(p[k])[i]))));
  const pre = A('pre'), post = A('post');
  const rate = pre.map((v, i) => v ? r1f((post[i] - v) / v * 100) : 0);
  return {pre, post, rate, diff:pre.map((v, i) => r1f(post[i] - v)), rank:rankOf(rate)};
};

// REQ-A-007, legacy rp1 (and the area columns of rp2):
// - area average = per-person area raw score (sum of the area's items) averaged, 1 decimal;
// - change rate = (post - pre) / pre * 100 on the rounded averages, 1 decimal; 0 when pre is 0;
// - difference = post - pre on the rounded averages, 1 decimal (rp2 "변화 스코어");
// - total = sum of the rounded area averages, 1 decimal; its rate as above;
// - rank = change rate descending, ties keep area order (stable sort), 1..5 (rp2; rp1 marks 1..3).
// No population means no figures (legacy shows only a notice).
export function areaAnalysis(pairs: Pair[]) {
  if (!pairs.length) return null;
  const s = areaStats(pairs);
  const tp = r1f(sum(s.pre)), tq = r1f(sum(s.post)), tr = tp ? r1f((tq - tp) / tp * 100) : 0;
  return {
    areaMax:RAW_MAX, totalMax:AREA_COUNT * RAW_MAX,
    areas:AREAS.map((a: {k: string}, i: number) => ({name:a.k, pre:s.pre[i], post:s.post[i], diff:s.diff[i], rate:s.rate[i], rank:s.rank[i]})),
    total:{pre:tp, post:tq, rate:tr}
  };
}

// REQ-A-008, legacy rp2:
// - factor = one diagnosis item (FACTORS[i] <-> answers index i, area = floor(i / 3)); its average
//   is the mean of that item over the population, 1 decimal, on the 5-point scale;
// - difference, change rate and rank use the same formulas as the areas, on the rounded averages;
//   factor ranks are 1..15 (legacy marks the top 5), area ranks 1..5 (legacy marks the top 3).
export function factorAnalysis(pairs: Pair[]) {
  if (!pairs.length) return null;
  const F = (k: 'pre' | 'post') => FACTORS.map((_f: unknown, i: number) => r1f(mean(pairs.map(p => p[k][i]))));
  const pre = F('pre'), post = F('post');
  const rate = pre.map((v, i) => v ? r1f((post[i] - v) / v * 100) : 0);
  const rank = rankOf(rate), s = areaStats(pairs);
  return {
    scaleMax:SCALE_MAX, areaMax:RAW_MAX,
    factors:FACTORS.map((f: string[], i: number) => ({name:f[0], area:Math.floor(i / ITEMS_PER_AREA), pre:pre[i], post:post[i], diff:r1f(post[i] - pre[i]), rate:rate[i], rank:rank[i]})),
    areas:AREAS.map((a: {k: string}, i: number) => ({name:a.k, pre:s.pre[i], post:s.post[i], diff:s.diff[i], rate:s.rate[i], rank:s.rank[i]}))
  };
}

// REQ-A-009, legacy rp3 (satCard) for Q1 overall satisfaction and Q2 usefulness for a new career:
// - population: pre+post submitted participants with a valid satisfaction answer (legacy `sv`);
//   Q1 and Q2 are both required for that answer, so both items share the same n;
// - average = mean of the scores, 1 decimal; distribution counts per score 5..1;
//   percentage = count / n * 100, 1 decimal; "positive" = scores 5 and 4 together.
export function satisfactionAnalysis(pairs: Pair[]) {
  const sv = satisfactionPopulation(pairs), n = sv.length;
  if (!n) return null;
  const item = (key: 'q1' | 'q2') => {
    const vals = sv.map(p => p.sat![key]), pc = (x: number) => r1f(x / n * 100);
    const distribution = Array.from({length:SCALE_MAX - SCALE_MIN + 1}, (_v, k) => { const score = SCALE_MAX - k, count = vals.filter(x => x === score).length; return {score, count, pct:pc(count)}; });
    const positive = distribution[0].count + distribution[1].count;
    return {n, avg:r1f(mean(vals)), distribution, positive:{count:positive, pct:pc(positive)}};
  };
  return {n, q1:item('q1'), q2:item('q2')};
}
