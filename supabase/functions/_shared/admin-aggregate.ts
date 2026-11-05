import {APIError} from './registration-http.ts';
import {readAll, phaseRows, companyOf} from './admin-access.ts';
import {AREAS, FACTORS} from '../secondcareer-assessment/js/01-areas.js';
import {AREA_COUNT, ITEMS_PER_AREA, RAW_MAX, SCALE_MIN, SCALE_MAX} from '../secondcareer-assessment/js/02-eval-config.js';
import {OPT, LIM} from '../secondcareer-assessment/js/03-options.js';
import {qdOptions} from '../secondcareer-assessment/js/00-question-defs-module.js';
import {sum} from '../secondcareer-assessment/js/04-util.js';
import {rawSums, full} from '../secondcareer-assessment/js/05-engine.js';

// REQ-A-006 common base for the admin pre/post aggregate report (legacy aReport/repData).
// Population (legacy repData `pp`): participants of the administrator's organization,
// optionally one registered company, whose pre AND post assessments are both submitted
// and whose 15 answers each are complete. Satisfaction population (legacy `sv`): those
// of `pp` with a valid satisfaction answer.
// Only these answer parts are read (paths as stored by the assessment function: `fields.expect`,
// SAT_SCORES / SAT_CHOICES): answers.pre, answers.post, answers.expect.d32..d35 (pre), and the
// satisfaction scores answers.sat.q1,q2,q3a,q3b,q3c,q5fit and choices answers.sat.d32..d35 (post).
// Screen 7 also reads q7 and q7txt; free text is reduced to a boolean and never returned.
// Screen 8 additionally reads pre expectation d36. No registration answers, results, names or contacts are read.
// Later analysis (REQ-A-015) needs other answer parts; they are not read or
// estimated here until those analyses are implemented.
const collator = new Intl.Collator('ko');
// Engine `full` plus integers: a non-integer stored value would turn sums into strings.
const complete = (a: unknown) => full(a) && (a as unknown[]).every(Number.isInteger);
const validScore = (v: unknown) => Number.isInteger(v) && (v as number) >= SCALE_MIN && (v as number) <= SCALE_MAX;

// `extra` (legacy: the fields rp4..rp6 read from `expect` and `sat`) is set only when every one of them is valid;
// the screens 4..6 population is the pairs that have it (see detailPopulation).
const CHOICES = ['d32', 'd33', 'd34', 'd35'] as const, SAT_SCORES = ['q3a', 'q3b', 'q3c', 'q5fit'] as const;
type Choices = Record<typeof CHOICES[number], string[]>;
export type Pair = {pre: number[], post: number[], sat: {q1: number, q2: number, q7: string[], hasOpinion: boolean} | null,
  extra: {pre: Choices, sat: Choices & Record<typeof SAT_SCORES[number], number>} | null};
// Selected JSON parts of the rows; only these values are fetched.
const PRE_COLUMNS = 'pre:answers->pre,pd36:answers->expect->d36,' + CHOICES.map(k => 'p' + k + ':answers->expect->' + k).join(',');
const POST_COLUMNS = 'post:answers->post,q1:answers->sat->q1,q2:answers->sat->q2,q7:answers->sat->q7,q7txt:answers->sat->q7txt,' + SAT_SCORES.map(k => k + ':answers->sat->' + k).join(',') + ',' + CHOICES.map(k => 's' + k + ':answers->sat->' + k).join(',');
// Choice arrays are valid when they hold distinct stored option values within the limits the assessment function
// enforces: pre answers exactly LIM picks (missing()), post at least 1 (3 for d33) and at most LIM (cleanSat).
const validChoice = (path: string, v: unknown, min: number) => Array.isArray(v) && v.length >= min && v.length <= LIM[path] && new Set(v).size === v.length && v.every(x => typeof x === 'string' && OPT[path].includes(x));

// Pre-only analysis is always available; post-disabled requests read only pre and d36.
export async function loadPairedPopulation(admin: any, organizationId: string, company: string | null, withAnswers = true) {
  const participants = await readAll(() => admin.from('participants').select('id,company_name').eq('organization_id', organizationId), 'id');
  const companies = [...new Set(participants.map(p => companyOf(p.company_name)).filter(Boolean) as string[])].sort(collator.compare);
  if (company !== null && !companies.includes(company)) throw new APIError('INVALID_REQUEST', 400);
  const ids = participants.filter(p => company === null || companyOf(p.company_name) === company).map(p => p.id);
  const pre = await phaseRows(admin, ids, 'pre', withAnswers ? PRE_COLUMNS : 'pre:answers->pre,pd36:answers->expect->d36');
  const firstChoices: string[][] = []; let preExcludedInvalid = 0;
  for (const id of ids) {
    const a = pre.get(id);
    if (a?.status !== 'submitted') continue;
    if (!complete(a.pre) || !validChoice('expect.d36', a.pd36, 1)) { preExcludedInvalid++; continue; }
    firstChoices.push(a.pd36);
  }
  if (!withAnswers) return {companies, pairs:null, excludedInvalid:0, firstChoices, preExcludedInvalid};
  const post = await phaseRows(admin, ids, 'post', POST_COLUMNS);
  const pairs: Pair[] = []; let excludedInvalid = 0;
  for (const id of ids) {
    const a = pre.get(id), b = post.get(id);
    if (a?.status !== 'submitted' || b?.status !== 'submitted') continue;
    // A satisfaction answer counts only when both scores are valid (legacy: `p.sat` present).
    if (!complete(a.pre) || !complete(b.post)) { excludedInvalid++; continue; }
    const sat = validScore(b.q1) && validScore(b.q2) ? {q1:b.q1, q2:b.q2, q7:Array.isArray(b.q7) ? b.q7.filter((x: unknown) => typeof x === 'string') : [], hasOpinion:typeof b.q7txt === 'string' && !!b.q7txt.trim()} : null;
    const preOk = CHOICES.every(k => validChoice('expect.' + k, a['p' + k], LIM['expect.' + k]));
    const satOk = SAT_SCORES.every(k => validScore(b[k])) && CHOICES.every(k => validChoice('sat.' + k, b['s' + k], k === 'd33' ? LIM['sat.d33'] : 1));
    const choices = (row: any, prefix: string) => Object.fromEntries(CHOICES.map(k => [k, row[prefix + k]])) as Choices;
    pairs.push({pre:a.pre, post:b.post, sat, extra:sat && preOk && satOk ? {pre:choices(a, 'p'), sat:{...choices(b, 's'), ...Object.fromEntries(SAT_SCORES.map(k => [k, b[k]]))} as any} : null});
  }
  return {companies, pairs, excludedInvalid, firstChoices, preExcludedInvalid};
}
export const satisfactionPopulation = (pairs: Pair[]) => pairs.filter(p => p.sat);
// Population of screens 4..6 (legacy sv for rp4..rp6): satisfaction answered AND every field those screens read is valid.
// The legacy report trusts the answer form; the server leaves out incomplete rows instead of showing NaN or miscounts.
export const detailPopulation = (pairs: Pair[]) => pairs.filter(p => p.extra);

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
// Legacy satCard figures for one 5-point item (also Q5.2 of rp6): see the notes above.
const scoreItem = (vals: number[]) => {
  const n = vals.length, pc = (x: number) => r1f(x / n * 100);
  const distribution = Array.from({length:SCALE_MAX - SCALE_MIN + 1}, (_v, k) => { const score = SCALE_MAX - k, count = vals.filter(x => x === score).length; return {score, count, pct:pc(count)}; });
  const positive = distribution[0].count + distribution[1].count;
  return {n, avg:r1f(mean(vals)), distribution, positive:{count:positive, pct:pc(positive)}};
};
export function satisfactionAnalysis(pairs: Pair[]) {
  const sv = satisfactionPopulation(pairs), n = sv.length;
  if (!n) return null;
  return {n, q1:scoreItem(sv.map(p => p.sat!.q1)), q2:scoreItem(sv.map(p => p.sat!.q2))};
}

// ---- REQ-A-010..012 (legacy rp4, rp5, rp6). Population: detailPopulation (legacy sv). ----
// Counting rules are the legacy ones: a single-choice question counts the first stored value, a multiple-choice
// question counts every participant who picked the option; stored values are compared to the option list
// (OPT['expect.dNN'], the same list for pre expect and post sat). Percentages in the side lists are
// "count / total selections" (legacy sideList), NOT "count / participants"; selections reports the totals.
// Axis scales and labels are display matters of the screen and are not computed here.
const idx = <T,>(a: T[]) => a.map((_v, i) => i);
const firstCounts = (list: Pair[], O: string[], get: (p: Pair) => string[]) => O.map(o => list.filter(p => get(p)[0] === o).length);
const anyCounts = (list: Pair[], O: string[], get: (p: Pair) => string[]) => O.map(o => list.filter(p => get(p).includes(o)).length);
// Legacy TOP3: count descending, equal counts keep the option order (`b[0]-a[0]||a[1]-b[1]`).
const top3 = (counts: number[]) => counts.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, 3).map(x => x[1]);
// The "top" entries of a side list: rank by `rankBy`, figures from `counts` (legacy sideList).
const topEntries = (rankBy: number[], counts: number[]) => { const total = sum(counts); return top3(rankBy).map((i, k) => ({index:i, rank:k + 1, count:counts[i], pct:total ? r1f(counts[i] / total * 100) : 0})); };
const chartLabels = (key: 'd32' | 'd33' | 'd34' | 'd35') => qdOptions('expect.' + key, 'chart') as string[];
const optionList = (key: 'd32' | 'd33' | 'd34' | 'd35') => [...OPT['expect.' + key]] as string[];

// REQ-A-010, rp4: Q3.1 first-choice mind state before/after; "positive" = the first two options;
// Q3.2 averages of q3a, q3b, q3c (1 decimal).
export function stabilityAnalysis(pairs: Pair[]) {
  const sv = detailPopulation(pairs), n = sv.length;
  if (!n) return null;
  const O = optionList('d32'), pre = firstCounts(sv, O, p => p.extra!.pre.d32), post = firstCounts(sv, O, p => p.extra!.sat.d32);
  const pos = (a: number[]) => n ? r1f((a[0] + a[1]) / n * 100) : 0, p0 = pos(pre), p1 = pos(post);
  return {n, options:O, labels:chartLabels('d32'), pre, post, positive:{pre:p0, post:p1, change:r1f(p1 - p0)},
    scores:(['q3a', 'q3b', 'q3c'] as const).map(key => ({key, avg:r1f(mean(sv.map(p => p.extra!.sat[key])))}))};
}

// REQ-A-011, rp5: Q4 multiple-choice d33 before/after; TOP3 by the pre count; change = (post - pre) / pre * 100, 0 without pre.
export function complaintAnalysis(pairs: Pair[]) {
  const sv = detailPopulation(pairs);
  if (!sv.length) return null;
  const O = optionList('d33'), pre = anyCounts(sv, O, p => p.extra!.pre.d33), post = anyCounts(sv, O, p => p.extra!.sat.d33);
  return {n:sv.length, options:O, labels:chartLabels('d33'), pre, post, change:idx(O).map(i => pre[i] ? r1f((post[i] - pre[i]) / pre[i] * 100) : 0),
    top:topEntries(pre, pre), selections:{pre:sum(pre), post:sum(post)}};
}

// REQ-A-012, rp6: Q5.0 d34 first choice (expectation before, most helpful after; TOP3 by the pre count),
// Q5.2 fulfilment score q5fit (satCard figures), Q6.0 d35 multiple choice (obstacle before, overcome after;
// TOP3 by the POST count, as in the legacy report).
export function consultingAnalysis(pairs: Pair[]) {
  const sv = detailPopulation(pairs);
  if (!sv.length) return null;
  const O5 = optionList('d34'), e0 = firstCounts(sv, O5, p => p.extra!.pre.d34), e1 = firstCounts(sv, O5, p => p.extra!.sat.d34);
  const O6 = optionList('d35'), b0 = anyCounts(sv, O6, p => p.extra!.pre.d35), b1 = anyCounts(sv, O6, p => p.extra!.sat.d35);
  return {n:sv.length,
    q5:{options:O5, labels:chartLabels('d34'), pre:e0, post:e1, top:topEntries(e0, e0), selections:{pre:sum(e0), post:sum(e1)}},
    fit:scoreItem(sv.map(p => p.extra!.sat.q5fit)),
    q6:{options:O6, labels:chartLabels('d35'), pre:b0, post:b1, top:topEntries(b1, b1), selections:{pre:sum(b0), post:sum(b1)}}};
}

// REQ-A-013: rp7 uses the satisfaction population, including unanswered q7 as zero selections.
export function improvementAnalysis(pairs: Pair[]) {
  const sv = satisfactionPopulation(pairs), n = sv.length;
  if (!n) return null;
  const options = [...OPT['sat.q7']] as string[];
  const counts = options.map(o => sv.filter(p => p.sat!.q7.includes(o)).length);
  const order = counts.map((_v, i) => i).sort((a, b) => counts[b] - counts[a] || a - b);
  return {n, avg1:r1f(mean(sv.map(p => p.sat!.q1))), avg2:r1f(mean(sv.map(p => p.sat!.q2))),
    opinions:sv.filter(p => p.sat!.hasOpinion).length, options, counts, order, percentages:counts.map(c => r1f(c / n * 100))};
}

// REQ-A-014, rp8: count every distinct selection, rank by count with option order as tie-breaker.
// Percentages use the valid pre-submitted population, not the number of selections.
export function firstSessionAnalysis(choices: string[][]) {
  const n = choices.length;
  if (!n) return null;
  const options = [...OPT['expect.d36']] as string[], labels = qdOptions('expect.d36', 'chart') as string[];
  const counts = options.map(o => choices.filter(c => c.includes(o)).length);
  const percentages = counts.map(c => r1f(c / n * 100));
  const top = top3(counts).map((index, k) => ({index, rank:k + 1, count:counts[index], pct:percentages[index]}));
  return {n, options, labels, counts, percentages, top, selections:sum(counts)};
}
