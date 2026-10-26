// 문항 정의(src/js/00-question-defs.js) 생성 스크립트. 단계 2b 출처 기록.
// legacy/index.original.html 을 헤드리스 브라우저로 실행해 QT·QLABEL·OPT·LIM·REQUIRED·WSTEPS·SH·FACTORS 에서 추출한다.
// 손으로 입력한 값은 CODE_PATH(문항 코드 → 보기 경로 대응)뿐이며, 설문 화면 코드(wReg·wGoal·wExpect)를 읽고 적었다.
// 생성 결과 파일은 이후 사람이 편집하는 원본이다. 그래서 파일이 이미 있으면 덮어쓰지 않는다(--force 로만).
// 사용: node tests/tools/gen-question-defs.mjs            (표준 출력으로 미리보기)
//       node tests/tools/gen-question-defs.mjs --write    (src/js/00-question-defs.js 생성)
import { chromium } from '@playwright/test';
import { pathToFileURL, fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { newPage, LEGACY_HTML } from '../golden/collect.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(root, 'src/js/00-question-defs.js');
const CODE_PATH = { A9: 'reg.industry', A10: 'reg.income', B11: 'goal.b11', B12: 'goal.b12', B13: 'goal.b13', B14: 'goal.b14', D32: 'expect.d32', D33: 'expect.d33', D34: 'expect.d34', D35: 'expect.d35', D36: 'expect.d36' };
const AREA_ITEMS = 3; // 진단 문항 i 의 영역 = floor(i / 3) (legacy 의 영역 대응 규칙. 코드 곳곳의 i/3, i*3+j 와 같다)

async function extract() {
  const b = await chromium.launch();
  try {
    const page = await newPage(b);
    await page.goto(pathToFileURL(LEGACY_HTML).href);
    return await page.evaluate(paths => ({
      QT: JSON.parse(JSON.stringify(QT)), QLABEL: JSON.parse(JSON.stringify(QLABEL)), REQUIRED: JSON.parse(JSON.stringify(REQUIRED)), LIM: JSON.parse(JSON.stringify(LIM)),
      OPT: Object.fromEntries(paths.map(p => [p, JSON.parse(JSON.stringify(OPT[p]))])),
      screen: Object.fromEntries(paths.map(p => [p, OPT[p].map((o, i) => qLabel(p, i, o))])), // 화면에 표시되는 보기 문구(QLABEL 이 없으면 OPT)
      WSTEPS: WSTEPS.map(s => ({ keys: Object.keys(s), t: s.t, codes: [...s.codes] })),
      SH: JSON.parse(JSON.stringify(SH)), FACTORS: JSON.parse(JSON.stringify(FACTORS)), AREAS: AREAS.map(a => a.k),
    }), Object.values(CODE_PATH));
  } finally { await b.close(); }
}

const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
const qa = a => '[' + a.map(q).join(',') + ']';

function build(d) {
  const codes = Object.keys(d.QT);
  // 점검: WSTEPS 항목은 t·codes 두 키뿐이다(데이터 외 필드가 없다).
  d.WSTEPS.forEach(s => assert.deepEqual(s.keys, ['t', 'codes']));
  const stepOf = c => d.WSTEPS.findIndex(s => s.codes.includes(c));
  codes.forEach(c => { assert.equal(d.WSTEPS.filter(s => s.codes.includes(c)).length, 1, c + ' 은 한 단계에만 속한다'); assert.ok(stepOf(c) >= 0); });
  const defs = codes.map(c => {
    const step = stepOf(c), pos = d.WSTEPS[step].codes.indexOf(c);
    const o = { code: c, step, pos, required: d.REQUIRED[c], text: { screen: d.QT[c], report: null } };
    const cIdx = c[0] === 'C' ? +c.slice(1) - 17 : -1;
    if (cIdx >= 0) { o.text.report = d.FACTORS[cIdx][1]; o.area = Math.floor(cIdx / AREA_ITEMS); o.factor = d.FACTORS[cIdx][0]; }
    const p = CODE_PATH[c];
    if (p) {
      o.path = p;
      if (d.LIM[p] !== undefined) o.max = d.LIM[p];
      const sh = d.SH[c.toLowerCase()];
      if (sh) assert.equal(sh.length, d.OPT[p].length, c + ' 차트 라벨 수');
      o.options = d.OPT[p].map((rep, i) => { const e = { screen: d.screen[p][i], report: rep }; if (sh) e.chart = sh[i]; return e; });
    }
    return o;
  });
  // 점검: QLABEL 이 있는 경로 = 화면 문구와 보고서 문구가 하나라도 다른 경로
  const differ = Object.values(CODE_PATH).filter(p => d.screen[p].some((s, i) => s !== d.OPT[p][i])).sort();
  assert.deepEqual(Object.keys(d.QLABEL).sort(), differ);
  // 점검: 문항 정의에서 빠진 SH·LIM 항목(범위 밖) 확인
  assert.deepEqual(Object.keys(d.SH).sort(), ['d32', 'd33', 'd34', 'd35', 'd36']);
  return { defs, steps: d.WSTEPS.map(s => s.t) };
}

function render({ defs, steps }, sha) {
  const L = [];
  L.push(`// src/js/00-question-defs.js — 단계 2b 신규. 문항 정의의 단일 원본(36문항 + 연락처·이메일).`);
  L.push(`// 생성: tests/tools/gen-question-defs.mjs 가 legacy/index.original.html(sha256 ${sha})을 실행해 QT·QLABEL·OPT·LIM·REQUIRED·WSTEPS·SH·FACTORS 에서 추출했다.`);
  L.push(`// 생성 결과는 이후 사람이 편집하는 원본이다. 스크립트를 다시 돌려 덮어쓰지 않는다.`);
  L.push(`//`);
  L.push(`// 필드: code 문항 코드 · step/pos 소속 단계(QUESTION_STEPS 인덱스)와 단계 안 순서 · required 필수 여부`);
  L.push(`//   text.screen 설문 화면 문구(QT) · text.report 보고서용 문구(진단 문항의 요인 문장, 없으면 null)`);
  L.push(`//   path 보기 목록 이름(OPT 의 키) · max 선택 개수 한도(LIM) · area 진단 문항의 영역 번호(AREAS 의 인덱스) · factor 요인명`);
  L.push(`//   options[].screen 설문 화면에 표시하는 보기 문구(QLABEL) · options[].report 저장 값(OPT) · options[].chart 차트 라벨(SH)`);
  L.push(`// options[].report 는 저장 값. 단계 5에서 코드 저장으로 전환하기 전까지 문구를 바꾸면 기존 응답이 어긋난다.`);
  L.push(`// 화면용 문구와 보고서용 문구는 합치지 않고 문항마다 두 필드로 모두 유지한다(문구 차이 목록: docs/decisions.md).`);
  L.push(`// 이 파일은 다른 파일에 의존하지 않는다. 가장 먼저 로드한다(01-areas.js 의 FACTORS 와 03-options.js 의 OPT·LIM 이 쓴다).`);
  L.push('');
  L.push(`const QUESTION_STEPS=${qa(steps)};`);
  L.push(`const QUESTION_DEFS=[`);
  defs.forEach((d, i) => {
    const head = `code:${q(d.code)},step:${d.step},pos:${d.pos},required:${d.required},text:{screen:${q(d.text.screen)},report:${d.text.report === null ? 'null' : q(d.text.report)}}`;
    const extra = [];
    if (d.area !== undefined) extra.push(`area:${d.area},factor:${q(d.factor)}`);
    if (d.path) extra.push(`path:${q(d.path)}`);
    if (d.max !== undefined) extra.push(`max:${d.max}`);
    const tail = i < defs.length - 1 ? ',' : '';
    if (!d.options) { L.push(` {${head}${extra.length ? ',' + extra.join(',') : ''}}${tail}`); return; }
    L.push(` {${head},${extra.join(',')},options:[`);
    d.options.forEach((o, j) => L.push(`   {screen:${q(o.screen)},report:${q(o.report)}${o.chart !== undefined ? ',chart:' + q(o.chart) : ''}}${j < d.options.length - 1 ? ',' : ''}`));
    L.push(`  ]}${tail}`);
  });
  L.push(`];`);
  L.push('');
  L.push(`// ---------- 파생 뷰 생성 함수(순수 함수) ----------`);
  L.push(`// 기존 전역 이름(QT·QLABEL·OPT·LIM·REQUIRED·C_CODES·WSTEPS·FACTORS·SH)은 원래 자리에서 이 함수로 값만 만든다.`);
  L.push(`const qdByPath=p=>QUESTION_DEFS.find(d=>d.path===p);`);
  L.push(`const qdText=()=>Object.fromEntries(QUESTION_DEFS.map(d=>[d.code,d.text.screen]));`);
  L.push(`const qdRequired=()=>Object.fromEntries(QUESTION_DEFS.map(d=>[d.code,d.required]));`);
  L.push(`const qdOptions=(path,field)=>qdByPath(path).options.map(o=>o[field]);   // field: 'screen' | 'report' | 'chart'`);
  L.push(`const qdMax=path=>qdByPath(path).max;`);
  L.push(`const qdStepCodes=n=>QUESTION_DEFS.filter(d=>d.step===n).sort((a,b)=>a.pos-b.pos).map(d=>d.code);`);
  L.push(`const qdFactors=()=>QUESTION_DEFS.filter(d=>d.factor!==undefined).sort((a,b)=>a.pos-b.pos).map(d=>[d.factor,d.text.report]);`);
  L.push('');
  return L.join('\n');
}

const sha = crypto.createHash('sha256').update(fs.readFileSync(LEGACY_HTML)).digest('hex');
const want = fs.readFileSync(path.join(root, 'legacy/SHA256.txt'), 'utf8').trim().split(/\s+/)[0];
if (sha !== want) { console.error('legacy 해시 불일치'); process.exit(1); }
const data = await extract();
const built = build(data);
const text = render(built, sha);
// 자체 점검: 생성한 파일을 실행해 만든 값이 추출한 데이터와 같다.
const ctx = vm.createContext({});
vm.runInContext(text + '\n;this.out={QUESTION_DEFS,QUESTION_STEPS,QT:qdText(),REQ:qdRequired()}', ctx);
assert.deepEqual(JSON.parse(JSON.stringify(ctx.out.QUESTION_DEFS)), built.defs);
assert.deepEqual(JSON.parse(JSON.stringify(ctx.out.QT)), data.QT);
assert.deepEqual(Object.keys(ctx.out.QT), Object.keys(data.QT)); // 키 순서
assert.deepEqual(JSON.parse(JSON.stringify(ctx.out.REQ)), data.REQUIRED);
console.error(`문항 ${built.defs.length}개, 보기 ${built.defs.reduce((a, d) => a + (d.options ? d.options.length : 0), 0)}개, 진단 문항 ${built.defs.filter(d => d.factor).length}개, 줄 ${text.split('\n').length}`);
if (process.argv.includes('--write')) {
  if (fs.existsSync(OUT) && !process.argv.includes('--force')) { console.error(OUT + ' 이 이미 있다. 사람이 편집하는 원본이므로 덮어쓰지 않는다(--force).'); process.exit(1); }
  fs.writeFileSync(OUT, text);
  console.error('생성: ' + path.relative(root, OUT));
} else process.stdout.write(text);
