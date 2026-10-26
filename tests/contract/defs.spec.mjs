// 단계 2b: 문항 정의(src/js/00-question-defs.js) 자체 검사. 정의가 없는 대상(legacy)에서는 건너뛴다.
// - 파생 뷰 생성 함수의 결과가 현재 전역(QT·QLABEL·OPT·LIM·REQUIRED·C_CODES·WSTEPS·FACTORS·SH)과 같다
// - 진단 15문항을 영역당 3문항씩 묶으면 i번째 묶음의 factor·area 가 모두 i번째 영역이다(채점이 이 묶음에 의존)
// - 정의의 내부 불변식, 저장 값 경고 주석
import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { newPage, LEGACY_HTML } from '../golden/collect.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = process.env.TARGET_HTML ? path.resolve(process.env.TARGET_HTML) : LEGACY_HTML;
let browser, page, has;
test.beforeAll(async () => {
  browser = await chromium.launch(); page = await newPage(browser);
  await page.goto(pathToFileURL(target).href);
  has = await page.evaluate(() => typeof QUESTION_DEFS !== 'undefined');
});
test.afterAll(async () => { await browser.close(); });

test('파생 뷰 생성 함수의 결과가 현재 전역과 같다(값·키 순서)', async () => {
  test.skip(!has, '이 대상에는 QUESTION_DEFS 가 없다');
  const r = await page.evaluate(() => {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b); // 키 순서까지 비교
    const optPaths = ['goal.b11', 'goal.b12', 'goal.b13', 'goal.b14', 'expect.d32', 'expect.d33', 'expect.d34', 'expect.d35', 'expect.d36', 'reg.industry', 'reg.income'];
    const out = {};
    out.QT = same(qdText(), QT);
    out.REQUIRED = same(qdRequired(), REQUIRED);
    out.OPT = optPaths.map(p => [p, same(qdOptions(p, 'report'), OPT[p])]).filter(x => !x[1]).map(x => x[0]);
    out.QLABEL = Object.keys(QLABEL).map(p => [p, same(qdOptions(p, 'screen'), QLABEL[p])]).filter(x => !x[1]).map(x => x[0]);
    out.LIM = Object.keys(LIM).filter(p => qdByPath(p)).map(p => [p, qdMax(p) === LIM[p]]).filter(x => !x[1]).map(x => x[0]);
    out.limCovered = Object.keys(LIM).filter(p => qdByPath(p));
    out.SH = ['d32', 'd33', 'd34', 'd35', 'd36'].map(k => [k, same(qdOptions('expect.' + k, 'chart'), SH[k])]).filter(x => !x[1]).map(x => x[0]);
    out.C_CODES = same(qdStepCodes(3), C_CODES);
    out.WSTEPS = same(QUESTION_STEPS.map((t, i) => ({ t, codes: qdStepCodes(i) })), WSTEPS);
    out.FACTORS = same(qdFactors(), FACTORS);
    return out;
  });
  expect(r.QT, 'QT').toBe(true); expect(r.REQUIRED, 'REQUIRED').toBe(true);
  expect(r.OPT, 'OPT 불일치 경로').toEqual([]); expect(r.QLABEL, 'QLABEL 불일치 경로').toEqual([]);
  expect(r.LIM, 'LIM 불일치 경로').toEqual([]); expect(r.limCovered.length, '정의가 덮는 LIM 경로 수').toBe(9);
  expect(r.SH, 'SH 불일치').toEqual([]); expect(r.C_CODES, 'C_CODES').toBe(true); expect(r.WSTEPS, 'WSTEPS').toBe(true); expect(r.FACTORS, 'FACTORS').toBe(true);
});

test('진단 15문항: 영역당 3문항 묶음의 factor·area 가 영역 구성과 어긋나지 않는다', async () => {
  test.skip(!has, '이 대상에는 QUESTION_DEFS 가 없다');
  const r = await page.evaluate(() => {
    const cs = QUESTION_DEFS.filter(d => d.step === 3).sort((a, b) => a.pos - b.pos);
    const groups = [];
    for (let i = 0; i < cs.length; i += ITEMS_PER_AREA) groups.push(cs.slice(i, i + ITEMS_PER_AREA));
    return { n: cs.length, itemsPerArea: ITEMS_PER_AREA, areaCount: AREA_COUNT, areas: AREAS.length,
      groups: groups.map((g, i) => ({ i, size: g.length, areas: [...new Set(g.map(d => d.area))], factors: g.map(d => d.factor) })),
      codes: cs.map(d => d.code), allFactors: cs.map(d => d.factor), allAreaNames: groups.map((g, i) => AREAS[i] && AREAS[i].k) };
  });
  expect(r.n).toBe(r.itemsPerArea * r.areaCount);
  expect(r.areas).toBe(r.areaCount);
  expect(r.groups).toHaveLength(r.areaCount);
  r.groups.forEach(g => { expect(g.size, `묶음 ${g.i} 크기`).toBe(r.itemsPerArea); expect(g.areas, `묶음 ${g.i}(${r.allAreaNames[g.i]}) 의 area`).toEqual([g.i]); });
  expect(new Set(r.allFactors).size, 'factor 중복 없음').toBe(r.n);
  expect(r.codes, '코드 순서 C17…C31').toEqual(Array.from({ length: r.n }, (_, i) => 'C' + (17 + i)));
});

test('정의의 내부 불변식', async () => {
  test.skip(!has, '이 대상에는 QUESTION_DEFS 가 없다');
  const r = await page.evaluate(() => {
    const bad = [];
    const codes = QUESTION_DEFS.map(d => d.code);
    if (new Set(codes).size !== codes.length) bad.push('코드 중복');
    if (codes.length !== 38) bad.push('문항 수 ' + codes.length);
    QUESTION_STEPS.forEach((t, s) => { const ps = QUESTION_DEFS.filter(d => d.step === s).map(d => d.pos).sort((a, b) => a - b); if (ps.some((p, i) => p !== i)) bad.push('단계 ' + s + ' 순서가 0부터 연속이 아님'); });
    QUESTION_DEFS.forEach(d => {
      if (typeof d.text.screen !== 'string' || !d.text.screen) bad.push(d.code + ' 화면 문구');
      if (d.path) { if (!d.options || !d.options.length) bad.push(d.code + ' 보기 없음'); d.options.forEach((o, i) => { if (typeof o.screen !== 'string' || typeof o.report !== 'string') bad.push(d.code + ' 보기 ' + i); }); }
      if (d.options && d.options.some(o => o.chart !== undefined) && d.options.some(o => o.chart === undefined)) bad.push(d.code + ' 차트 라벨 일부만 있음');
      if (d.max !== undefined && (!Number.isInteger(d.max) || d.max < 1 || d.max > d.options.length)) bad.push(d.code + ' max');
      if ((d.factor !== undefined) !== (d.text.report !== null)) bad.push(d.code + ' factor 와 보고서 문구');
    });
    // QLABEL 이 필요한 경로 = 화면 문구와 보고서 문구가 하나라도 다른 경로
    const differ = QUESTION_DEFS.filter(d => d.options && d.options.some(o => o.screen !== o.report)).map(d => d.path).sort();
    if (JSON.stringify(Object.keys(QLABEL).sort()) !== JSON.stringify(differ)) bad.push('QLABEL 경로 ≠ 화면·보고서 문구가 다른 경로: ' + JSON.stringify(differ));
    return bad;
  });
  expect(r).toEqual([]);
});

test('00-question-defs.js 머리 주석: 저장 값 경고와 출처', () => {
  const f = path.join(root, 'src/js/00-question-defs.js');
  test.skip(!fs.existsSync(f), '정의 파일 없음');
  const t = fs.readFileSync(f, 'utf8');
  expect(t).toContain('저장 값. 단계 5에서 코드 저장으로 전환하기 전까지 문구를 바꾸면 기존 응답이 어긋난다');
  expect(t).toContain('tests/tools/gen-question-defs.mjs');
  expect(t).toContain('62fc9dd4c0c0515e204c1697085dec655d59fbac8e495d78676f982d401ad310');
  expect(t).not.toMatch(/^\s*(import|export)\s/m);
});
