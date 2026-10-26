// 화면 기준선용 고정 입력 데이터.
// 앱이 만드는 시드(54명·기업 12개) 위에 지정한 사례를 더하고, 모든 제출 응답의 결과(코멘트·키워드)를
// 난수 없이 고정값으로 저장한다. 만들어진 JSON(fixture.json)을 매 화면 캡처의 시작 상태로 쓴다.
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, LEGACY_HTML } from '../golden/collect.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_FILE = path.join(here, 'fixture.json');

// 브라우저 안에서 실행. 앱의 전역(DB, ENT, OPT, computeResult …)을 직접 쓴다.
function buildFixture() {
  const FIXED = '2026-10-26T03:00:00.000Z';
  const tri = s => { const b = Math.floor(s / 3), r = s - b * 3; return [b + (r > 0 ? 1 : 0), b + (r > 1 ? 1 : 0), b]; };
  const mk = rs => rs.flatMap(tri);
  const hash = id => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 100003, 7);
  const finalize = p => { // 제출 시점 스냅샷과 같은 모양, 난수 대신 id 에서 정한 고정 선택
    let k = 0; const h = hash(p.id);
    p.result = computeResult(p, n => (h + 7 * k++) % n);
    p.result.evaluationVersion = EVAL_VERSION;
    p.result.at = '2026-10-26';
    const c = COUNSELORS[p.counselor];
    p.result.snapshot = { counselor: c ? Object.assign({ code: p.counselor }, c) : null, generatedAt: FIXED };
  };
  const OP = OPT;
  const ex = i => ({ d32: [OP['expect.d32'][i % 6]], d33: [OP['expect.d33'][i % 7], OP['expect.d33'][(i + 2) % 7], OP['expect.d33'][(i + 4) % 7]], d34: [OP['expect.d34'][i % 6]], d35: [OP['expect.d35'][i % 5], OP['expect.d35'][(i + 1) % 5]], d36: demoD36(i) });
  const gl = i => ({ b11: [OP['goal.b11'][i % 5]], b12: [OP['goal.b12'][(i + 1) % 5]], b13: [OP['goal.b13'][i % 7], OP['goal.b13'][(i + 1) % 7]], b14: [OP['goal.b14'][i % 6]], b15: String(40 + (i * 5) % 61), b16: String(2 + i) });
  const person = (n, nick, name, rs, o = {}) => {
    const id = '9000' + String(n).padStart(4, '0'), i = n;
    const p = emptyP({ id, pw: '123456', nick, company: o.company || '다이소', counselor: o.counselor || '102' });
    p.reg = { name, gender: n % 2 ? '남' : '여', birth: String(o.birth || 1960 + (n * 3) % 40), birthDate: (o.birth || 1960 + (n * 3) % 40) + '-06-15', a1: '동의', consent: true,
      phone: '010-9000-' + String(n).padStart(4, '0'), email: 'snap' + n + '@example.com', addr: '', edu: '', major: '',
      careers: [{ co: o.company || '다이소', dept: '', title: ['사원', '대리', '과장', '차장', '부장'][n % 5], task: ['영업 지원', '생산 관리', '인사 총무', '재무 회계', '연구 개발'][n % 5], yrs: '' }, {}, {}],
      industry: OP['reg.industry'][n % 11], income: OP['reg.income'][n % 4] };
    Object.assign(p.reg, o.reg || {});
    p.goal = gl(i); p.expect = ex(i); p.pre = mk(rs); p.done = { reg: true, goal: true, expect: true };
    p.preDate = '2026-10-' + String(1 + n % 25).padStart(2, '0'); p.status = 'submitted'; p.submittedAt = p.preDate + 'T01:00:00.000Z';
    if (o.post) { p.post = mk(o.post); p.postDate = '2026-10-25'; p.sat = demoSat(n); }
    finalize(p); Object.assign(p, o.after || {});
    return p;
  };
  const L = [];
  // 코멘트 영역 A~E 각각이 최저
  [['에이', 'A', [8, 12, 12, 12, 12]], ['비이', 'B', [12, 8, 12, 12, 12]], ['씨이', 'C', [12, 12, 8, 12, 12]], ['디이', 'D', [12, 12, 12, 8, 12]], ['이이', 'E', [12, 12, 12, 12, 8]]]
    .forEach(([nick, _k, rs], j) => L.push(person(1 + j, nick, '영역' + _k + '최저', rs)));
  L.push(person(6, '동점AB', '동점 A와 B', [8, 8, 12, 12, 12]));        // 동점 → A
  L.push(person(7, '동점CE', '동점 C와 E', [12, 12, 8, 12, 8]));        // 동점 → C
  L.push(person(8, '별표', '판정 별표', [7, 10, 10, 7, 14]));           // 원점수 7·10 → '*'
  L.push(person(9, '최저', '전부 최저', [3, 3, 3, 3, 3]));
  L.push(person(10, '기타입력', '기타 입력', [9, 10, 11, 12, 13], { reg: { industry: '기타', industryEtc: '반려동물 서비스', income: '기타', incomeEtc: '프리랜서 수입 협의' } }));
  L.push(person(11, '사후완료', '사후 완료', [9, 10, 9, 10, 9], { post: [11, 12, 11, 12, 11] }));
  L.push(person(12, '수정이력', '수정 이력', [9, 10, 11, 12, 13], { after: {
    history: [
      { at: '2026-10-20T05:00:00.000Z', by: '가상상담사 A 상담사', changes: [{ code: 'C17', before: '3 · 보통', after: '4 · 그렇다' }, { code: 'C18', before: '2 · 아니다', after: '3 · 보통' }], resultChanged: true },
      { at: '2026-10-22T02:30:00.000Z', by: '관리자 화면(데모)', changes: [{ code: 'A10', before: '기존 임금 80% 수준', after: '기타 (협의)' }], resultChanged: false }],
    updatedAt: '2026-10-22T02:30:00.000Z' } }));
  L.push(person(13, '전부동점', '다섯 영역 동점', [11, 11, 11, 11, 11]));
  L.push(person(14, '최고', '전부 최고', [15, 15, 15, 15, 15]));
  L.push(person(15, '한빛', '한빛 사례', [10, 9, 8, 12, 11], { company: '㈜한빛전자', counselor: '12', post: [12, 11, 10, 13, 12] }));
  DB.push(...L);
  // 시드의 제출 응답에도 같은 방식으로 결과를 고정
  DB.forEach(p => { if (full(p.pre) && !p.result) finalize(p); });
  // 이미 있는 시드 사후 만족도 등은 그대로 둔다
  save();
  return { db: DB.length, ent: ENT.length, withResult: DB.filter(p => p.result).length };
}

export async function makeFixture() {
  const browser = await chromium.launch();
  try {
    const page = await newPage(browser);
    await page.goto(pathToFileURL(LEGACY_HTML).href);
    const info = await page.evaluate(buildFixture);
    const json = await page.evaluate(() => localStorage.getItem('sp-demo-v5'));
    return { info, json };
  } finally { await browser.close(); }
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const { info, json } = await makeFixture();
  fs.writeFileSync(FIXTURE_FILE, json);
  console.log('fixture.json', info, json.length + '자');
}
