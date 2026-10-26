// 골든 정답표 수집기. 대상 HTML 을 헤드리스 브라우저로 열어 전역 함수·상수를 직접 호출한다.
// 반복문은 모두 브라우저 안에서 돌리고 결과만 한 번에 받는다.
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { covStart, covTake } from '../coverage/cov.mjs';

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
    const o = { area: ai, raw: r, score: sc, gradeOf: gradeOf(ai, r), gradeUnsure: gradeUnsure(ai, r), gradeTxt: gradeTxt(ai, r), bySet: {} };
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
    for (const [birth, date] of [['1997', '2026-01-01'], ['1996', '2026-12-31'], ['1987', '2026-06-15'], ['1986', '2026-06-15'], ['1977', '2026-06-15'], ['1976', '2026-06-15'], ['1967', '2026-06-15'], ['1966', '2026-06-15'], ['1966', null], ['1997', null], ['1987', null], ['1977', null], ['1967', null], ['', '2026-06-15'], [undefined, '2026-06-15'], ['abc', '2026-06-15'], ['0', '2026-06-15'], ['2027', '2026-06-15'], ['1900', '2026-06-15'], ['1966', '2026']]) {
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
  // 6) 상담사 수정 재계산(recomputeResult 유지 규칙) · applyCounselorEdit
  // 난수는 crypto.getRandomValues 를 대본형으로 바꿔 고정한다(원본 rint 가 이것을 쓴다).
  const realGRV = crypto.getRandomValues.bind(crypto);
  const setQueue = q => { crypto.getRandomValues = a => { a[0] = q.length ? q.shift() : 0; return a; }; };
  const restoreRng = () => { crypto.getRandomValues = realGRV; };
  const cmp = r => r ? [r.comment, r.kw.age ? r.kw.age.code : '-', r.kw.goal ? r.kw.goal.code : '-', r.kw.pro.code, r.area, r.raw.join(','), r.key].join('|') : null;
  const ctxP = (age, g, ai) => {
    const rs = [HI, HI, HI, HI, HI]; rs[ai] = LO;
    return { id: '__x', pre: mk(rs), preDate: '2026-06-15', reg: age == null ? {} : { birth: String(2026 - age) }, goal: g == null ? {} : { b13: [g, '__2순위__'] }, counselor: '102' };
  };
  const ctxList = []; for (const age of [null, 25, 35, 45, 55, 65]) for (const g of [null, ...OPT['goal.b13']]) for (let ai = 0; ai < NA; ai++) ctxList.push([age, g, ai]);
  // 새로 뽑을 때 호출 순서: 연령대(있으면), 13번 분류(있으면), 인생키워드, 코멘트. 새로 뽑으면 마지막 번호가 나오게 한다.
  const roleQueue = p => { const q = [], r = computeResult(p, () => 0); if (r.kw.age) q.push(2); if (r.kw.goal) q.push(2); q.push(8); q.push(2); return q; };
  {
    const rows = [];
    for (const c of ctxList) { // old 없음
      const p = ctxP(...c); setQueue(roleQueue(p)); const n = recomputeResult(p, null);
      rows.push('-|' + c.join('/') + '|' + cmp(n));
    }
    for (const co of ctxList) for (const cn of ctxList) {
      const old = computeResult(ctxP(...co), () => 0);
      const p = ctxP(...cn); setQueue(roleQueue(p));
      const n = recomputeResult(p, old);
      rows.push(co.join('/') + '|' + cn.join('/') + '|' + cmp(n));
    }
    // old 의 kw 일부가 비어 있는 경우
    const oddOld = [['age없음', o => { o.kw.age = null; }], ['goal없음', o => { o.kw.goal = null; }], ['pro없음', o => { o.kw.pro = null; }], ['kw없음', o => { o.kw = null; }]];
    for (const [nm, fn] of oddOld) for (const cn of [[45, '창업', 1], [null, null, 1]]) {
      const old = computeResult(ctxP(45, '창업', 1), () => 0); fn(old);
      const p = ctxP(...cn); setQueue(roleQueue(p));
      let r; try { r = cmp(recomputeResult(p, old)); } catch (e) { r = 'ERR ' + e.message; }
      rows.push('odd:' + nm + '|' + cn.join('/') + '|' + r);
    }
    restoreRng();
    out.recompute = { note: 'old 결과(pick 전부 0 → _01) × 새 응답(새로 뽑으면 코멘트 _03, 연령·분류 _03, 인생키워드 C_10_09). 행: old조건|new조건|결과 요약. 조건=연령/13번보기/최저영역', evaluationVersion: EVAL_VERSION, rows };
  }
  {
    const base = () => { const p = emptyP({ id: '__e', counselor: '102', company: '다이소', status: 'submitted', preDate: '2026-10-22',
      reg: { name: '테스트', gender: '남', birth: '1968', birthDate: '1968-03-15', phone: '010-1234-5678', email: 't@example.com', industry: '금융', income: '기타', incomeEtc: '협의', a1: '동의', consent: true, careers: [{ co: '가', title: '나', task: '다' }, {}, {}] },
      goal: { b11: [OPT['goal.b11'][0]], b12: [OPT['goal.b12'][0]], b13: ['창업', OPT['goal.b13'][1]], b14: [OPT['goal.b14'][0]], b15: '70', b16: '6' },
      pre: [3, 4, 4, 3, 4, 4, 3, 4, 4, 3, 4, 4, 3, 4, 4],
      expect: { d32: [OPT['expect.d32'][0]], d33: OPT['expect.d33'].slice(0, 3), d34: [OPT['expect.d34'][0]], d35: OPT['expect.d35'].slice(0, 2), d36: [OPT['expect.d36'][0]] } });
      p.result = computeResult(p, () => 0); return p; };
    const edits = [
      ['변경 없음', p => {}],
      ['같은 영역 안에서 값만 교환(원점수 동일)', p => { p.pre[0] = 4; p.pre[1] = 3; }],
      ['원점수만 변경, 코멘트 영역 동일', p => { p.pre[3] = 4; p.pre[4] = 4; p.pre[5] = 5; p.pre[0] = 2; }],
      ['코멘트 영역이 바뀜(A→B)', p => { p.pre[3] = 2; }],
      ['A 상승으로 영역 이동', p => { p.pre[0] = 5; }],
      ['13번 1순위 분류 변경(창업→재취업)', p => { p.goal.b13 = ['동일 업종 재취업', OPT['goal.b13'][1]]; }],
      ['13번 1순위 같은 분류 안 변경(동일→다른 업종 재취업)', p => { p.goal.b13 = ['다른 업종 재취업', OPT['goal.b13'][1]]; p.result.kw.goal = { group: '재취업', code: 'B_20_01', text: 'x' }; p.result.key = 'x'; }],
      ['생년월일만 변경(출생연도 필드 그대로)', p => { p.reg.birthDate = '1998-03-15'; }],
      ['생년월일과 출생연도 둘 다 변경', p => { p.reg.birthDate = '1998-03-15'; p.reg.birth = '1998'; }],
      ['업종 변경(계산 무관)', p => { p.reg.industry = '교육'; }],
      ['기대소득 기타 입력 변경', p => { p.reg.incomeEtc = '변경'; }],
      ['기존 결과 없음 + 변경', p => { p.pre[3] = 2; delete p.result; }],
    ];
    const rows = [];
    for (const [nm, fn] of edits) {
      const p = base(), before = JSON.parse(JSON.stringify(p));
      fn(p);
      setQueue(roleQueue(p));
      const n = applyCounselorEdit(p, before, '테스트');
      const h = (p.history || [])[0];
      rows.push({ edit: nm, returned: n, historyLen: (p.history || []).length, changes: h ? h.changes : null, resultChanged: h ? h.resultChanged : null, by: h ? h.by : null, result: cmp(p.result), snapshotCounselor: p.result && p.result.snapshot && p.result.snapshot.counselor ? p.result.snapshot.counselor.code : null, evaluationVersion: p.result && p.result.evaluationVersion, hasUpdatedAt: !!p.updatedAt });
    }
    restoreRng();
    out.counselorEdit = rows;
  }

  // 7) resultOf 재생성 조건(resKey): 키 구성요소가 바뀌면 다시 뽑고, 아니면 저장된 값을 유지한다
  {
    const base = () => emptyP({ id: '__r', pre: [3, 4, 4, 3, 4, 4, 3, 4, 4, 3, 4, 4, 3, 4, 4], preDate: '2026-10-22', reg: { birth: '1968', name: 'A' }, goal: { b13: ['창업', '다른 업종 재취업'] }, counselor: '102', company: '다이소' });
    const muts = [
      ['변경 없음(2회째 호출)', p => {}],
      ['원점수 변경(pre[0] 3→4)', p => { p.pre[0] = 4; }],
      ['원점수 변경(같은 합계로 값 교환)', p => { p.pre[0] = 4; p.pre[1] = 3; }],
      ['출생연도 변경', p => { p.reg.birth = '1969'; }],
      ['출생연도 제거', p => { p.reg.birth = ''; }],
      ['13번 1순위 변경', p => { p.goal.b13[0] = '재능기부 및 사회적 기여'; }],
      ['13번 2순위 변경(키 아님)', p => { p.goal.b13[1] = '결정된 바 없음'; }],
      ['응답연도 변경(preDate 연도)', p => { p.preDate = '2027-01-02'; }],
      ['응답일 같은 해 다른 날(키 아님)', p => { p.preDate = '2026-12-31'; }],
      ['preDate 제거', p => { p.preDate = null; }],
      ['이름 변경(키 아님)', p => { p.reg.name = 'B'; }],
      ['상담사 변경(키 아님)', p => { p.counselor = '27'; }],
      ['사후 응답 추가(키 아님)', p => { p.post = Array(15).fill(4); }],
      ['미완성(pre 한 칸 비움) → null', p => { p.pre[14] = null; }],
      ['저장된 결과 내용만 훼손, 키 동일 → 유지', p => { p.result.comment = 'Code_Z_99'; }],
      ['저장된 key 만 다름 → 재생성', p => { p.result.key = 'old'; }],
    ];
    const rows = [];
    for (const [nm, fn] of muts) {
      const p = base(); setQueue([0, 0, 0, 0]); const r0 = resultOf(p); const k0 = r0.key, c0 = cmp(r0);
      fn(p);
      setQueue([1, 1, 4, 1]); const r1 = resultOf(p);
      rows.push({ mutation: nm, sameObject: r1 === r0, nullResult: r1 === null, beforeKey: k0, afterKey: r1 ? r1.key : null, before: c0, after: r1 ? cmp(r1) : null, stored: p.result ? cmp(p.result) : null });
    }
    const p = base(); setQueue([2, 2, 8, 2]); const rr = resultOf(p);
    rows.push({ mutation: '(결과 없음에서 첫 호출)', sameObject: false, nullResult: false, beforeKey: null, afterKey: rr.key, before: null, after: cmp(rr), stored: cmp(p.result) });
    restoreRng();
    out.resultOf = rows;
  }
  return out;
}

// 시계·난수를 고정하는 공통 환경. 골든과 화면 기준선이 같이 쓴다.
export const FIXED_NOW = '2026-10-26T03:00:00Z';
export const DETERMINISTIC_INIT = `(() => {
  let s = 20261026;
  const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = rnd;
  try { crypto.getRandomValues = a => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(rnd() * 4294967296); return a; }; } catch (e) {}
})();`;

export async function newPage(browser, { now = FIXED_NOW, viewport } = {}) {
  const ctx = await browser.newContext({ timezoneId: 'Asia/Seoul', locale: 'ko-KR', viewport: viewport || { width: 1100, height: 900 } });
  await ctx.addInitScript(DETERMINISTIC_INIT);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(now)); // Date 만 고정, 타이머는 그대로 동작
  return page;
}

export async function collect(htmlPath = LEGACY_HTML, { now = FIXED_NOW } = {}) {
  const browser = await chromium.launch();
  try {
    const page = await newPage(browser, { now });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await covStart(page);
    await page.goto(pathToFileURL(htmlPath).href);
    await page.waitForFunction(() => typeof computeResult === 'function' && typeof selfTests === 'function');
    const data = await page.evaluate(inBrowser);
    await covTake(page, 'golden:collect');
    data.pageErrors = errors;
    return data;
  } finally {
    await browser.close();
  }
}
