// 단계 2a 정답표 수집기: 문항 정의 · missing(p) · ansText(p, code) · toAssessment(연동 계약) · 시드/문구.
// 대상 HTML 을 헤드리스 브라우저로 열어 전역 함수·상수를 직접 호출한다. 고정 입력은 tests/snapshot/fixture.json.
// 코드 안에서 문항 수 등 숫자는 일부러 리터럴로 쓴다(legacy 와 이후 단계 양쪽에서 같은 수집기를 쓰기 위해).
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { openContext } from '../snapshot/capture.mjs';
import { LEGACY_HTML } from '../golden/collect.mjs';
import { covStart, covTake } from '../coverage/cov.mjs';

function inBrowser() {
  const out = {};
  const codes = Object.keys(QT);
  const copy = o => JSON.parse(JSON.stringify(o === undefined ? null : o));

  // ---------- A. 문항 정의 덤프 ----------
  // 입력 방식·저장 위치는 설문 화면 코드(wReg·wGoal·wDiagPre·wExpect)를 읽고 적은 설명이다. 나머지는 코드의 값을 그대로 읽는다.
  const PATH = { A9: 'reg.industry', A10: 'reg.income', B11: 'goal.b11', B12: 'goal.b12', B13: 'goal.b13', B14: 'goal.b14', D32: 'expect.d32', D33: 'expect.d33', D34: 'expect.d34', D35: 'expect.d35', D36: 'expect.d36' };
  const CONTROL = { A1: '라디오(동의/미동의)', A2: '텍스트(초대 맥락이면 읽기 전용)', A3: '텍스트', A4: '라디오(남성/여성)', A5: '텍스트(YYYY-MM-DD)', PH: '텍스트(전화번호)', EM: '텍스트(이메일)', A6: '텍스트', A7: '텍스트', A8: '텍스트', A9: '라디오+기타 입력', A10: '라디오+기타 입력',
    B11: '칩 단일', B12: '칩 단일', B13: '칩 순위 2개', B14: '칩 단일', B15: '숫자(%)', B16: '숫자(개월)', D32: '칩 단일', D33: '칩 순위 3개', D34: '칩 단일', D35: '칩 2개', D36: '칩 1~2개' };
  const STORE = { A1: 'reg.a1, reg.consent', A2: 'counselor', A3: 'reg.name', A4: 'reg.gender', A5: 'reg.birthDate, reg.birth(연도)', PH: 'reg.phone', EM: 'reg.email', A6: 'reg.careers[0].co', A7: 'reg.careers[0].title', A8: 'reg.careers[0].task', A9: 'reg.industry, reg.industryEtc', A10: 'reg.income, reg.incomeEtc',
    B11: 'goal.b11[]', B12: 'goal.b12[]', B13: 'goal.b13[]', B14: 'goal.b14[]', B15: 'goal.b15', B16: 'goal.b16', D32: 'expect.d32[]', D33: 'expect.d33[]', D34: 'expect.d34[]', D35: 'expect.d35[]', D36: 'expect.d36[]' };
  out.defs = {
    summary: { totalQ: TOTAL_Q, codes, numbered: codes.filter(c => QNO(c)).length, steps: WSTEPS.map(s => ({ title: s.t, codes: s.codes })), cCodes: C_CODES, areas: AREAS.map(a => ({ k: a.k, en: a.en })), scale: SCALE },
    questions: codes.map(c => {
      const d = { code: c, number: QNO(c), text: QT[c], required: REQUIRED[c], step: stepOf(c), stepTitle: (WSTEPS[stepOf(c)] || {}).t };
      if (c[0] === 'C') { const i = +c.slice(1) - 17; d.control = '5점 척도(1~5)'; d.store = 'pre[' + i + ']'; d.scaleLabels = ['전혀 아니다', '아니다', '보통', '그렇다', '매우 그렇다']; d.report = { factor: FACTORS[i][0], factorText: FACTORS[i][1], area: AREAS[Math.floor(i / 3)].k }; }
      else { d.control = CONTROL[c]; d.store = STORE[c]; }
      const path = PATH[c];
      if (path) { d.optionPath = path; d.limit = LIM[path] === undefined ? null : LIM[path]; d.options = { screen: OPT[path].map((o, i) => qLabel(path, i, o)), report: copy(OPT[path]) }; const k = c.toLowerCase(); if (SH[k]) d.chartLabels = copy(SH[k]); }
      if (c === 'A4') d.options = { screen: ['남성', '여성'], stored: ['남', '여'] };
      if (c === 'A1') d.options = { screen: ['동의', '미동의'] };
      return d;
    }),
  };

  // ---------- B. missing(p) ----------
  const okP = () => emptyP({ counselor: '102', reg: { a1: '동의', consent: true, name: '테스트', gender: '남', birthDate: '1968-03-15', birth: '1968', phone: '010-1234-5678', email: 't@example.com', industry: '금융', income: '기타', incomeEtc: '협의', careers: [{ co: '가', title: '나', task: '다' }, {}, {}] },
    goal: { b11: [OPT['goal.b11'][0]], b12: [OPT['goal.b12'][0]], b13: [OPT['goal.b13'][0], OPT['goal.b13'][1]], b14: [OPT['goal.b14'][0]], b15: '70', b16: '6' }, pre: Array(15).fill(3),
    expect: { d32: [OPT['expect.d32'][0]], d33: OPT['expect.d33'].slice(0, 3), d34: [OPT['expect.d34'][0]], d35: OPT['expect.d35'].slice(0, 2), d36: [OPT['expect.d36'][0]] } });
  const BLANK = { A1: p => { delete p.reg.a1; p.reg.consent = false; }, A2: p => { p.counselor = ''; }, A3: p => { p.reg.name = ''; }, A4: p => { p.reg.gender = ''; }, A5: p => { p.reg.birthDate = ''; }, PH: p => { p.reg.phone = ''; }, EM: p => { p.reg.email = ''; },
    A6: p => { p.reg.careers[0].co = ''; }, A7: p => { p.reg.careers[0].title = ''; }, A8: p => { p.reg.careers[0].task = ''; }, A9: p => { p.reg.industry = ''; }, A10: p => { p.reg.income = ''; },
    B11: p => { p.goal.b11 = []; }, B12: p => { p.goal.b12 = []; }, B13: p => { p.goal.b13 = []; }, B14: p => { p.goal.b14 = []; }, B15: p => { p.goal.b15 = ''; }, B16: p => { p.goal.b16 = ''; },
    D32: p => { p.expect.d32 = []; }, D33: p => { p.expect.d33 = []; }, D34: p => { p.expect.d34 = []; }, D35: p => { p.expect.d35 = []; }, D36: p => { p.expect.d36 = []; } };
  for (let i = 0; i < 15; i++) BLANK['C' + (17 + i)] = p => { p.pre[i] = null; };
  const rec = p => missing(p).map(x => [x.code, x.step, x.msg]);
  const M = [];
  const addM = (name, mut) => { const p = okP(); mut(p); M.push({ name, missing: rec(p) }); };
  addM('모두 채움', () => {});
  codes.forEach(c => addM('하나 비움: ' + c, BLANK[c]));
  WSTEPS.slice(0, 5).forEach((s, si) => {
    addM('단계 ' + (si + 1) + ' 전부 비움', p => s.codes.forEach(c => BLANK[c](p)));
    addM('단계 ' + (si + 1) + ' 첫째·마지막 비움', p => { BLANK[s.codes[0]](p); BLANK[s.codes[s.codes.length - 1]](p); });
    addM('단계 ' + (si + 1) + ' 짝수 번째 비움', p => s.codes.forEach((c, i) => { if (i % 2 === 0) BLANK[c](p); }));
  });
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) addM('단계 ' + (a + 1) + '+' + (b + 1) + ' 전부 비움', p => [a, b].forEach(s => WSTEPS[s].codes.forEach(c => BLANK[c](p))));
  addM('전부 비움(채운 사람에서)', p => codes.forEach(c => BLANK[c](p)));
  M.push({ name: '빈 참여자(emptyP)', missing: rec(emptyP({})) });
  M.push({ name: '빈 참여자 + 상담코드 + 동의', missing: rec(emptyP({ counselor: '102', reg: { a1: '동의', consent: true, careers: [{}, {}, {}] } })) });
  // 동의 변형
  addM('A1 미동의', p => { p.reg.a1 = '미동의'; p.reg.consent = false; });
  addM('A1 구형(a1 없음, consent true)', p => { delete p.reg.a1; p.reg.consent = true; });
  addM('A1 구형(a1 없음, consent false)', p => { delete p.reg.a1; p.reg.consent = false; });
  // 형식 오류
  ['', '1968-02-30', '1968-3-5', 'abcd', '19680315', '2099-01-01', '1899-12-31', '1900-01-01', '1968-13-01', '1968-00-10', '2026-10-26', '2026-10-27', '1968-03-15 '].forEach(v => addM('A5 생년월일 ' + JSON.stringify(v), p => { p.reg.birthDate = v; }));
  ['', '010-1234-567', '010-12-3456', '010-1234-5678', '011-123-4567', '016-1234-5678', '017-123-4567', '018-1234-5678', '019-1234-5678', '012-1234-5678', '01012345678', '02-123-4567', '010 1234 5678', ' 010-1234-5678'].forEach(v => addM('PH 전화 ' + JSON.stringify(v), p => { p.reg.phone = v; }));
  ['', 'a@b', 'a@b.c', 'a@b.co', 'a b@c.com', '@x.com', 'a@@x.com', ' t@example.com ', 'x@y.zz', 'x@y z.com'].forEach(v => addM('EM 이메일 ' + JSON.stringify(v), p => { p.reg.email = v; }));
  ['', ' ', '0', '1', '70', '100', '101', '150', '-1', 'abc', '1.5', '1e2', '007', '0100', '1000', ' 50 '].forEach(v => addM('B15 달성가능성 ' + JSON.stringify(v), p => { p.goal.b15 = v; }));
  ['', '0', '6', '600', '601', '999', '1000', '-3', 'a', '12a', '6.5', ' 6 '].forEach(v => addM('B16 소요기간 ' + JSON.stringify(v), p => { p.goal.b16 = v; }));
  const O = OPT;
  // 선택 개수·중복
  addM('B13 1개', p => { p.goal.b13 = [O['goal.b13'][0]]; });
  addM('B13 같은 보기 2번', p => { p.goal.b13 = [O['goal.b13'][0], O['goal.b13'][0]]; });
  addM('B13 3개', p => { p.goal.b13 = O['goal.b13'].slice(0, 3); });
  addM('B11 2개(화면은 1개 한도)', p => { p.goal.b11 = O['goal.b11'].slice(0, 2); });
  addM('B12 2개', p => { p.goal.b12 = O['goal.b12'].slice(0, 2); });
  addM('B14 2개', p => { p.goal.b14 = O['goal.b14'].slice(0, 2); });
  [0, 1, 2, 4, 5].forEach(n => addM('D33 ' + n + '개', p => { p.expect.d33 = O['expect.d33'].slice(0, n); }));
  addM('D33 3개 중복', p => { p.expect.d33 = [O['expect.d33'][0], O['expect.d33'][0], O['expect.d33'][1]]; });
  addM('D32 2개', p => { p.expect.d32 = O['expect.d32'].slice(0, 2); });
  addM('D34 2개', p => { p.expect.d34 = O['expect.d34'].slice(0, 2); });
  [0, 1, 3].forEach(n => addM('D35 ' + n + '개', p => { p.expect.d35 = O['expect.d35'].slice(0, n); }));
  addM('D35 2개 같은 보기', p => { p.expect.d35 = [O['expect.d35'][0], O['expect.d35'][0]]; });
  [0, 1, 2, 3].forEach(n => addM('D36 ' + n + '개', p => { p.expect.d36 = O['expect.d36'].slice(0, n); }));
  // 기타 입력
  addM('A9 기타 + 내용 없음', p => { p.reg.industry = '기타'; p.reg.industryEtc = ''; });
  addM('A9 기타 + 공백만', p => { p.reg.industry = '기타'; p.reg.industryEtc = '   '; });
  addM('A9 기타 + 내용', p => { p.reg.industry = '기타'; p.reg.industryEtc = '반려동물'; });
  addM('A10 기타 + 내용 없음', p => { p.reg.income = '기타'; p.reg.incomeEtc = ''; });
  addM('A10 기타 + 내용', p => { p.reg.income = '기타'; p.reg.incomeEtc = '협의'; });
  // 진단 응답값
  [0, 1, 2, 5, 6, 2.5, '3', '', undefined, 'a', true].forEach(v => addM('C17 값 ' + JSON.stringify(v === undefined ? '(undefined)' : v), p => { p.pre[0] = v; }));
  addM('진단 배열 길이 14', p => { p.pre = Array(14).fill(3); });
  addM('진단 배열 없음', p => { p.pre = null; });
  addM('상담코드 공백', p => { p.counselor = '   '; });
  addM('상담코드 없음(null)', p => { p.counselor = null; });
  addM('이름 공백', p => { p.reg.name = '   '; });
  out.missing = M;

  // ---------- C. ansText(p, code) 전수 ----------
  const A = {};
  const base = () => emptyP({ reg: { careers: [{}, {}, {}] } });
  const put = (code, desc, mut) => { const p = base(); mut(p); (A[code] = A[code] || []).push([desc, ansText(p, code)]); };
  const perms = (arr, k) => { const r = []; const rec2 = (cur, rest) => { if (cur.length === k) { r.push(cur); return; } rest.forEach((x, i) => rec2(cur.concat([x]), rest.filter((_, j) => j !== i))); }; rec2([], arr); return r; };
  [['동의', true], ['미동의', false], [undefined, true], [undefined, false], ['', false]].forEach(([a1, c]) => put('A1', JSON.stringify([a1, c]), p => { if (a1 !== undefined) p.reg.a1 = a1; p.reg.consent = c; }));
  ['', '102', '12', 'abc'].forEach(v => put('A2', JSON.stringify(v), p => { p.counselor = v; }));
  ['', '홍길동', ' 공백 ', '<b>태그</b>'].forEach(v => put('A3', JSON.stringify(v), p => { p.reg.name = v; }));
  ['남', '여', '', '기타', undefined].forEach(v => put('A4', JSON.stringify(v === undefined ? '(undefined)' : v), p => { if (v !== undefined) p.reg.gender = v; }));
  ['', '1968-03-15', 'abc'].forEach(v => put('A5', JSON.stringify(v), p => { p.reg.birthDate = v; }));
  ['', '010-1234-5678'].forEach(v => put('PH', JSON.stringify(v), p => { p.reg.phone = v; }));
  ['', 'a@b.com'].forEach(v => put('EM', JSON.stringify(v), p => { p.reg.email = v; }));
  ['A6:co', 'A7:title', 'A8:task'].forEach(s => { const [c, k] = s.split(':'); ['', '값'].forEach(v => put(c, JSON.stringify(v), p => { p.reg.careers[0][k] = v; })); });
  [['A9', 'industry'], ['A10', 'income']].forEach(([c, k]) => {
    const path = 'reg.' + k;
    OPT[path].forEach(o => { put(c, JSON.stringify(o) + ' + 기타내용 "X"', p => { p.reg[k] = o; p.reg[k + 'Etc'] = 'X'; }); if (o === '기타') put(c, '기타 + 기타내용 없음', p => { p.reg[k] = o; }); });
    put(c, '미선택', p => {}); put(c, '목록에 없는 값', p => { p.reg[k] = '임의 값'; });
  });
  const single = (c, path, grp) => { OPT[path].forEach(o => put(c, JSON.stringify(o), p => { setPath(p, path, [o]); })); put(c, '[]', p => { setPath(p, path, []); }); put(c, '목록에 없는 값', p => { setPath(p, path, ['없는 보기']); }); };
  single('B11', 'goal.b11'); single('B12', 'goal.b12'); single('B14', 'goal.b14'); single('D32', 'expect.d32'); single('D34', 'expect.d34');
  // 순위 문항: 순서 있는 모든 조합
  const multi = (c, path, ks) => { const L = OPT[path]; ks.forEach(k => perms(L, k).forEach(a => put(c, JSON.stringify(a), p => { setPath(p, path, a); }))); put(c, '[]', p => { setPath(p, path, []); }); put(c, '목록에 없는 값 포함', p => { setPath(p, path, [L[0], '없는 보기']); }); };
  multi('B13', 'goal.b13', [1, 2]); multi('D33', 'expect.d33', [1, 2, 3]); multi('D35', 'expect.d35', [1, 2]); multi('D36', 'expect.d36', [1, 2]);
  put('B13', '같은 보기 2번', p => { p.goal.b13 = [OPT['goal.b13'][0], OPT['goal.b13'][0]]; });
  ['', '0', '70', '100', 'abc', null, 0, 70].forEach(v => { put('B15', JSON.stringify(v === undefined ? '(undefined)' : v), p => { p.goal.b15 = v; }); put('B16', JSON.stringify(v), p => { p.goal.b16 = v; }); });
  put('B15', '(undefined)', p => { delete p.goal.b15; }); put('B16', '(undefined)', p => { delete p.goal.b16; });
  for (let i = 0; i < 15; i++) [null, 0, 1, 2, 3, 4, 5, 6, '3'].forEach(v => put('C' + (17 + i), JSON.stringify(v), p => { p.pre[i] = v; }));
  out.ansText = A;

  // ---------- D. toAssessment(연동 계약) ----------
  const fixedSnap = c => ({ counselor: c ? Object.assign({ code: c }, COUNSELORS[c]) : null, generatedAt: '2026-10-26T03:00:00.000Z' });
  const rep = (name, mut) => {
    const p = okP(); p.id = 'rep'; p.company = '다이소'; p.status = 'submitted'; p.preDate = '2026-10-22'; p.submittedAt = '2026-10-22T01:00:00.000Z'; p.done = { reg: true, goal: true, expect: true };
    mut(p);
    if (full(p.pre)) { p.result = computeResult(p, () => 0); p.result.evaluationVersion = EVAL_VERSION; p.result.snapshot = fixedSnap(p.counselor); p.result.at = '2026-10-22'; }
    return { name, assessment: copy(toAssessment(p)) };
  };
  out.reps = [
    rep('대표: 모두 채움', () => {}),
    rep('작성 중(진단 전)', p => { p.status = undefined; p.pre = Array(15).fill(null); p.done = { reg: true, goal: false, expect: false }; p.preDate = null; p.submittedAt = undefined; }),
    rep('업종·기대소득 기타', p => { p.reg.industry = '기타'; p.reg.industryEtc = '반려동물 서비스'; p.reg.income = '기타'; p.reg.incomeEtc = '협의'; }),
    rep('구형 동의(a1 없음, consent true)', p => { delete p.reg.a1; p.reg.consent = true; }),
    rep('미동의', p => { p.reg.a1 = '미동의'; p.reg.consent = false; }),
    rep('상담사 없음', p => { p.counselor = null; }),
    rep('알 수 없는 상담사 코드', p => { p.counselor = '999'; }),
    rep('상담사 12(한빛)', p => { p.counselor = '12'; p.company = '㈜한빛전자'; }),
    rep('13번 1순위만', p => { p.goal.b13 = [OPT['goal.b13'][3]]; }),
    rep('성별 여·생년월일 없음(출생연도만)', p => { p.reg.gender = '여'; p.reg.birthDate = ''; p.reg.birth = '1975'; }),
    rep('성별 없음', p => { p.reg.gender = ''; }),
    rep('달성가능성 빈 값·소요 abc', p => { p.goal.b15 = ''; p.goal.b16 = 'abc'; }),
    rep('달성가능성 0', p => { p.goal.b15 = '0'; }),
    rep('수정 이력 있음', p => { p.history = [{ at: '2026-10-23T05:00:00.000Z', by: '가상상담사 A 상담사', changes: [{ code: 'C17', before: '3 · 보통', after: '4 · 그렇다' }], resultChanged: true }]; }),
    rep('진단 일부 0', p => { p.pre[2] = 0; }),
    rep('사후 응답 있음', p => { p.post = Array(15).fill(4); p.postDate = '2026-10-25'; }),
    rep('원점수 7·10 포함(판정 검토 표시)', p => { p.pre = [3, 2, 2, 4, 3, 3, 4, 3, 3, 3, 2, 2, 3, 4, 4]; }),
    rep('전부 5점', p => { p.pre = Array(15).fill(5); }),
    rep('전부 1점', p => { p.pre = Array(15).fill(1); }),
    rep('회사·직급 비어 있음', p => { p.reg.careers[0] = {}; }),
    rep('연락처 비어 있음', p => { p.reg.phone = ''; p.reg.email = ''; }),
  ];
  const had = new Set(DB.filter(p => p.result).map(p => p.id));
  out.fixtureAssessments = DB.map(p => ({ id: p.id, assessment: copy(toAssessment(p)) }));
  out.fixtureResultGenerated = DB.filter(p => p.result && !had.has(p.id)).map(p => p.id); // toAssessment 가 처음 결과를 만든 참여자(없어야 정상)
  const SP = window.SecondPlanning;
  out.interface = {
    keys: Object.keys(SP).sort(), schemaVersion: SP.schemaVersion,
    resolveInvite: [{ type: 'participant', participantId: '11112222' }, { type: 'participant', participantId: 'nope' }, { type: 'counselor', counselorCode: '27' }, { type: 'counselor', counselorCode: '999' }, null, undefined, { type: 'x' }, {}]
      .map(c => ({ ctx: c === undefined ? '(undefined)' : c, result: copy(SP.resolveInvite(c)) })),
    listAssessments: ['102', '12', '27', '999', '', undefined].map(c => { const L = SP.listAssessments(c); return { code: c === undefined ? '(undefined)' : c, count: L.length, ids: L.map(a => a.id), sameAsToAssessment: L.every(a => JSON.stringify(a) === JSON.stringify(toAssessment(byId(a.id)))) }; }),
  };

  // ---------- E. 시드와 문구 ----------
  out.seed = { db: copy(seed()), ent: copy(seedEnt()), emptyP: copy(emptyP({})) };
  const msgs = [];
  for (const post of [null, Array(15).fill(null), [5, 4, 3, null, null, null, null, null, null, null, null, null, null, null, null]]) { S.user = emptyP({ id: 'x', post }); S.err = ''; S.pstep = 1; S.mode2 = 'post'; S.view = 'wizard'; toSat(); msgs.push(S.err); }
  out.messages = {
    toSat: msgs,
    a2Msg: ['', '   ', '102', '12', 'zzz'].map(v => [v, a2Msg(v)]),
    ageMsg: ['', '1968-03-15', '1968-02-30', '2026-10-26', '2026-10-27', 'abc'].map(v => [v, ageMsg(v)]),
    qName: [...codes, 'ZZ'].map(c => [c, qName(c)]),
    fmt: { phone: ['01012345678', '0101234', '010', '010-12345678', '+82 10 1234 5678', 'abcd'].map(v => [v, fmtPhone(v)]), date: ['19680315', '1968', '196803', '1968-03-15', 'abcd'].map(v => [v, fmtDate(v)]) },
    status: [okP(), emptyP({}), emptyP({ done: { reg: true, goal: true, expect: true }, pre: Array(15).fill(3) })].map(p => [steps(p), status(p).k, status(p).t]),
  };
  // ---------- F. 코멘트 전문(CMT)과 cmtParts ----------
  // 오탈자·공백까지 그대로 기록한다(정리하지 않는다). meta 는 눈으로 확인하기 위한 참고 정보다.
  out.comments = {
    count: Object.keys(CMT).length,
    items: Object.keys(CMT).map(k => ({ code: k, text: CMT[k], parts: cmtParts(k),
      meta: { length: CMT[k].length, newlines: CMT[k].split('\n').length - 1, leadingSpace: /^\s/.test(CMT[k]), trailingSpace: /\s$/.test(CMT[k]), doubleSpaces: CMT[k].split('  ').length - 1 } })),
    // 예외는 종류만 기록한다(메시지에는 변수명이 들어가 단계마다 달라질 수 있다). 'toString' 등은 CMT[code] 가 프로토타입 메서드를 돌려줘 예외가 난다(현재 동작).
    edge: [['Code_Z_99'], [''], ['code_a_01'], ['toString'], ['constructor'], [undefined]].map(([c]) => { let r; try { r = cmtParts(c); } catch (e) { r = 'ERR ' + e.constructor.name; } return [c === undefined ? '(undefined)' : c, r]; }),
  };
  // ---------- G. 문항 관련 전역의 값과 객체 동일성(===) ----------
  // JSON 은 키 순서까지 기록한다. identity 는 같은 배열·객체를 가리키는 위치 쌍을 전부 기록한다(예: WSTEPS[3].codes === C_CODES).
  {
    const roots = { QT, QLABEL, OPT, LIM, REQUIRED, WSTEPS, C_CODES, SH, FACTORS };
    const nodes = [];
    const walk = (o, p) => { if (o && typeof o === 'object') { nodes.push([p, o]); Object.keys(o).forEach(k => walk(o[k], p + (Array.isArray(o) ? '[' + k + ']' : '[' + JSON.stringify(k) + ']'))); } };
    Object.keys(roots).forEach(k => walk(roots[k], k));
    const pairs = [];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (nodes[i][1] === nodes[j][1]) pairs.push(nodes[i][0] + ' === ' + nodes[j][0]);
    out.globals = { json: copy(roots), keyOrder: Object.fromEntries(Object.keys(roots).map(k => [k, Object.keys(roots[k])])), nodeCount: nodes.length, identity: pairs.sort() };
  }
  // ---------- H. 코멘트·키워드 데이터의 직접 덤프(키 순서·배열 순서 포함) ----------
  out.feedbackData = {
    CMT: copy(CMT), KW_AGE: copy(KW_AGE), KW_GOAL: copy(KW_GOAL), KW_PRO: copy(KW_PRO), GOAL_TO_KW: copy(GOAL_TO_KW),
    keyOrder: { CMT: Object.keys(CMT), KW_AGE: Object.keys(KW_AGE), KW_GOAL: Object.keys(KW_GOAL) },
    counts: { CMT: Object.keys(CMT).length, KW_AGE: Object.values(KW_AGE).flat().length, KW_GOAL: Object.values(KW_GOAL).flat().length, KW_PRO: KW_PRO.length, GOAL_TO_KW: GOAL_TO_KW.length },
  };
  return out;
}

export async function collectContract(htmlPath = LEGACY_HTML) {
  const browser = await chromium.launch();
  try {
    const page = await openContext(browser, { w: 1100, theme: 'light' });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await covStart(page);
    await page.goto(pathToFileURL(htmlPath).href);
    await page.waitForFunction(() => typeof missing === 'function' && typeof toAssessment === 'function');
    const data = await page.evaluate(inBrowser);
    await covTake(page, 'contract:collect');
    data.pageErrors = errors;
    return data;
  } finally { await browser.close(); }
}
