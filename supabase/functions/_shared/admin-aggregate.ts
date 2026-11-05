import {APIError} from './registration-http.ts';
import {readAll, phaseRows, companyOf} from './admin-access.ts';
import {AREAS} from '../secondcareer-assessment/js/01-areas.js';
import {AREA_COUNT, RAW_MAX} from '../secondcareer-assessment/js/02-eval-config.js';
import {sum} from '../secondcareer-assessment/js/04-util.js';
import {rawSums, full} from '../secondcareer-assessment/js/05-engine.js';

// REQ-A-006 common base for the admin pre/post aggregate report (legacy aReport/repData).
// Population (legacy repData `pp`): participants of the administrator's organization,
// optionally one registered company, whose pre AND post assessments are both submitted
// and whose 15 answers each are complete. Only answers.pre / answers.post are read; no
// registration answers, results, names or contacts.
// Later analyses (REQ-A-008..015) need other answer parts; they are not read or
// estimated here until those analyses are implemented.
const collator = new Intl.Collator('ko');
// Engine `full` plus integers: a non-integer stored value would turn sums into strings.
const complete = (a: unknown) => full(a) && (a as unknown[]).every(Number.isInteger);

// withAnswers=false (post assessment not enabled): companies only, no answers are read.
export async function loadPairedPopulation(admin: any, organizationId: string, company: string | null, withAnswers = true) {
  const participants = await readAll(() => admin.from('participants').select('id,company_name').eq('organization_id', organizationId), 'id');
  const companies = [...new Set(participants.map(p => companyOf(p.company_name)).filter(Boolean) as string[])].sort(collator.compare);
  if (company !== null && !companies.includes(company)) throw new APIError('INVALID_REQUEST', 400);
  if (!withAnswers) return {companies, pairs:null, excludedInvalid:0};
  const ids = participants.filter(p => company === null || companyOf(p.company_name) === company).map(p => p.id);
  const pre = await phaseRows(admin, ids, 'pre', 'pre:answers->pre');
  const post = await phaseRows(admin, ids, 'post', 'post:answers->post');
  const pairs: {pre: number[], post: number[]}[] = []; let excludedInvalid = 0;
  for (const id of ids) {
    const a = pre.get(id), b = post.get(id);
    if (a?.status !== 'submitted' || b?.status !== 'submitted') continue;
    if (complete(a.pre) && complete(b.post)) pairs.push({pre:a.pre, post:b.post}); else excludedInvalid++;
  }
  return {companies, pairs, excludedInvalid};
}

// Legacy helpers, same definitions as legacy/index.original.html (mean, r1f).
const mean = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const r1f = (x: number) => Math.round(x * 10) / 10;

// REQ-A-007, legacy rp1 (and the area columns of rp2):
// - area average = per-person area raw score (sum of the area's items) averaged, 1 decimal;
// - change rate = (post - pre) / pre * 100 on the rounded averages, 1 decimal; 0 when pre is 0;
// - difference = post - pre on the rounded averages, 1 decimal (rp2 "변화 스코어");
// - total = sum of the rounded area averages, 1 decimal; its rate as above;
// - rank = change rate descending, ties keep area order (stable sort), 1..5 (rp2; rp1 marks 1..3).
// No population means no figures (legacy shows only a notice).
export function areaAnalysis(pairs: {pre: number[], post: number[]}[]) {
  if (!pairs.length) return null;
  const A = (k: 'pre' | 'post') => AREAS.map((_a: unknown, i: number) => r1f(mean(pairs.map(p => rawSums(p[k])[i]))));
  const pre = A('pre'), post = A('post');
  const rate = pre.map((v, i) => v ? r1f((post[i] - v) / v * 100) : 0);
  const diff = pre.map((v, i) => r1f(post[i] - v));
  const order = rate.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
  const tp = r1f(sum(pre)), tq = r1f(sum(post)), tr = tp ? r1f((tq - tp) / tp * 100) : 0;
  return {
    areaMax:RAW_MAX, totalMax:AREA_COUNT * RAW_MAX,
    areas:AREAS.map((a: {k: string}, i: number) => ({name:a.k, pre:pre[i], post:post[i], diff:diff[i], rate:rate[i], rank:order.indexOf(i) + 1})),
    total:{pre:tp, post:tq, rate:tr}
  };
}
