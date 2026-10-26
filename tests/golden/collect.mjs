// 골든 정답표 수집기. 대상 HTML 을 헤드리스 브라우저로 열어 전역 함수·상수를 직접 호출한다.
// 반복문은 모두 브라우저 안에서 돌리고 결과만 한 번에 받는다.
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const LEGACY_HTML = path.resolve(here, '../../legacy/index.original.html');

// 브라우저 안에서 실행되는 함수. 외부 변수를 참조하지 않는다.
function inBrowser() {
  const out = {};
  const NA = 5, LO = 3, HI = 15; // 영역 수, 원점수 범위(수집 범위일 뿐 계산 규칙이 아니다)
  const RAWS = []; for (let r = LO; r <= HI; r++) RAWS.push(r);
  // 영역 합계가 s 인 대표 응답 3개 (각 1~5)
  const tri = s => { const b = Math.floor(s / 3), r = s - b * 3; return [b + (r > 0 ? 1 : 0), b + (r > 1 ? 1 : 0), b]; };
  const mk = rs => { const a = []; rs.forEach(s => a.push(...tri(s))); return a; };

  // 1) 환산·판정: 영역 × 원점수
  out.conversion = [];
  for (let ai = 0; ai < NA; ai++) for (const r of RAWS) {
    const rs = [LO, LO, LO, LO, LO]; rs[ai] = r;
    const x = mk(rs), sc = areaScores(x)[ai];
    const o = { area: ai, raw: r, score: sc, level: level(sc), labelRaw: labelRaw(r), gradeOf: gradeOf(ai, r), gradeUnsure: gradeUnsure(ai, r), gradeTxt: gradeTxt(ai, r), bySet: {} };
    for (const k of Object.keys(GRADE_SETS)) o.bySet[k] = gradeBy(k, ai, r);
    out.conversion.push(o);
  }
  out.settings = { ACTIVE_GRADE, ACTIVE_COMPARE, REF_AVG, GRADE_NAMES, GOAL_TO_KW, b13: OPT['goal.b13'],
    gradeSets: JSON.parse(JSON.stringify(GRADE_SETS)), compareSets: JSON.parse(JSON.stringify(COMPARE_SETS)) };

  // 2) 코멘트 대상 영역: 다섯 영역 원점수 조합 전수. 숫자 한 글자(영역 번호)를 순서대로 이어 붙인다.
  {
    const n = HI - LO + 1; let s = '', mismatch = 0;
    for (let a = LO; a <= HI; a++) for (let b = LO; b <= HI; b++) for (let c = LO; c <= HI; c++) for (let d = LO; d <= HI; d++) for (let e = LO; e <= HI; e++) {
      const rs = [a, b, c, d, e], ai = commentArea(mk(rs));
      s += ai;
      // 독립 검증(최저 원점수, 동점 시 앞 영역)
      let m = 0; rs.forEach((v, i) => { if (v < rs[m]) m = i });
      if (m !== ai) mismatch++;
    }
    out.commentArea = { count: Math.pow(n, NA), order: 'a,b,c,d,e 순 중첩 반복(a가 바깥), 원점수 ' + LO + '~' + HI, digits: s, independentMismatch: mismatch };
  }

  // 3) computeResult 무작위 선택 전수
  {
    const bands = [null, 25, 35, 45, 55, 65];           // 연령대별 대표 나이 (null = 출생연도 없음)
    const b13 = [null, ...OPT['goal.b13']];              // null = 13번 응답 없음
    const Y = 2026, preDate = '2026-06-15';
    const cases = {}, seqs = {}; let total = 0;
    for (const age of bands) for (const g of b13) for (let ai = 0; ai < NA; ai++) {
      const rs = [HI, HI, HI, HI, HI]; rs[ai] = LO;
      const p = { pre: mk(rs), preDate, reg: age == null ? {} : { birth: String(Y - age) }, goal: g == null ? {} : { b13: [g, '__2순위__'] } };
      // 호출 순서 기록
      const log = []; computeResult(p, n => { log.push(n); return 0; });
      const ctx = (age == null ? '-' : age) + '|' + (g == null ? '-' : OPT['goal.b13'].indexOf(g)) + '|' + ai;
      seqs[ctx] = log;
      const list = []; const idx = log.map(() => 0);
      for (;;) {
        let k = 0;
        const r = computeResult(p, n => { const v = idx[k++]; return v; });
        delete r.at; // 오늘 날짜(실행일)라 제외
        list.push(JSON.stringify(r));
        let j = log.length - 1;
        while (j >= 0 && ++idx[j] >= log[j]) { idx[j] = 0; j--; }
        if (j < 0) break;
      }
      cases[ctx] = list; total += list.length;
    }
    out.computeResult = { total, note: '키=연령대(나이)|13번1순위 번호|코멘트 영역. 값=pick 인덱스 조합 순서(마지막 호출이 가장 안쪽)의 결과 JSON(at 제외)', pickSeq: seqs, cases };
  }

  // 4) 연령대 경계와 13번 1순위 분류
  {
    const ab = []; for (let a = -5; a <= 110; a++) ab.push([a, ageBand(a)]);
    const byBirth = [];
    for (const [birth, date] of [['1997', '2026-01-01'], ['1996', '2026-12-31'], ['1987', '2026-06-15'], ['1986', '2026-06-15'], ['1977', '2026-06-15'], ['1976', '2026-06-15'], ['1967', '2026-06-15'], ['1966', '2026-06-15'], ['1966', null], ['', '2026-06-15'], [undefined, '2026-06-15'], ['abc', '2026-06-15'], ['0', '2026-06-15'], ['2027', '2026-06-15'], ['1900', '2026-06-15'], ['1966', '2026']]) {
      const p = { pre: Array(15).fill(3), preDate: date, reg: birth === undefined ? {} : { birth }, goal: {} };
      const r = computeResult(p, () => 0);
      byBirth.push({ birth: birth === undefined ? '(undefined)' : birth, preDate: date, band: r.kw.age ? r.kw.age.band : null, age: r.kw.age ? r.kw.age.code : null });
    }
    const goals = [];
    const cand = [...OPT['goal.b13'], '', '없는 보기', undefined];
    for (const g of cand) for (const second of [undefined, OPT['goal.b13'][3]]) {
      const b = g === undefined ? [] : [g]; if (second !== undefined) b.push(second);
      const p = { pre: Array(15).fill(3), preDate: '2026-06-15', reg: { birth: '1966' }, goal: { b13: b } };
      const r = computeResult(p, () => 0);
      goals.push({ b13: b, group: r.kw.goal ? r.kw.goal.group : null, code: r.kw.goal ? r.kw.goal.code : null });
    }
    out.boundaries = { ageBand: ab, byBirth, goalClass: goals };
  }

  // 5) 자체 검증 탭(원본 대조 검증) 항목별 결과 전체
  {
    const T = selfTests();
    out.selfTests = { total: T.length, ok: T.filter(t => t.ok).length, items: T };
    out.selfTestsHtml = vVerify();
  }
  return out;
}

export async function collect(htmlPath = LEGACY_HTML) {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(pathToFileURL(htmlPath).href);
    await page.waitForFunction(() => typeof computeResult === 'function' && typeof selfTests === 'function');
    const data = await page.evaluate(inBrowser);
    data.pageErrors = errors;
    return data;
  } finally {
    await browser.close();
  }
}
