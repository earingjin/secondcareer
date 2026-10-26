// 코멘트·키워드 문구 데이터 파일 생성 스크립트. 단계 2c 출처 기록.
// legacy/index.original.html 을 헤드리스 브라우저로 실행해 CMT·KW_AGE·KW_GOAL·KW_PRO·GOAL_TO_KW 를 추출하고,
// 전역 변수를 정의하는 일반 스크립트 2개를 만든다(JSON 로드가 아님). 손으로 옮기지 않는다.
//   src/data/feedback-comments.js   CMT (코멘트 15개 전문)
//   src/data/feedback-keywords.js   KW_AGE · KW_GOAL · KW_PRO · GOAL_TO_KW
// 문구는 한 글자도 정리하지 않는다(오탈자·이중 공백·끝 공백 포함). 생성 결과는 이후 사람이 편집하는 원본이므로
// 파일이 이미 있으면 덮어쓰지 않는다(--force 로만).
// 사용: node tests/tools/gen-feedback-data.mjs            (미리보기: 요약만 출력)
//       node tests/tools/gen-feedback-data.mjs --write    (파일 생성)
import { chromium } from '@playwright/test';
import { pathToFileURL, fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { newPage, LEGACY_HTML } from '../golden/collect.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_C = path.join(root, 'src/data/feedback-comments.js');
const OUT_K = path.join(root, 'src/data/feedback-keywords.js');

const sha = crypto.createHash('sha256').update(fs.readFileSync(LEGACY_HTML)).digest('hex');
const want = fs.readFileSync(path.join(root, 'legacy/SHA256.txt'), 'utf8').trim().split(/\s+/)[0];
if (sha !== want) { console.error('legacy 해시 불일치'); process.exit(1); }

const b = await chromium.launch();
let d;
try {
  const page = await newPage(b);
  await page.goto(pathToFileURL(LEGACY_HTML).href);
  d = await page.evaluate(() => JSON.parse(JSON.stringify({ CMT, KW_AGE, KW_GOAL, KW_PRO, GOAL_TO_KW })));
} finally { await b.close(); }

const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
const pair = ([c, t]) => `[${q(c)},${q(t)}]`;

const head = (what, files) => [
  `// ${what}`,
  `// 생성: tests/tools/gen-feedback-data.mjs 가 legacy/index.original.html(sha256 ${sha})을 실행해 추출했다.`,
  `// 이 파일은 전역 변수를 정의하는 일반 스크립트(<script src>)다. 의존하는 파일이 없어 가장 먼저 로드한다(src/index.html).`,
  `// 생성 결과는 이후 사람이 편집하는 원본이다. 스크립트를 다시 돌려 덮어쓰지 않는다. 문구를 바꾸는 절차: docs/문구-변경-절차.md`,
  `// 문구는 원문 그대로다(오탈자·이중 공백·끝 공백 포함). 고치려면 먼저 절차 문서를 읽는다.`,
];

const comments = [
  ...head('src/data/feedback-comments.js — 결과 코멘트 문구(CMT). 단계 2c 신규.'),
  `// 코멘트 코드 = 'Code_' + 영역 알파벳(A~E) + '_0' + 번호(1~3). 영역 5개 × 3개 = 15개. 개수·코드를 바꾸면 엔진의 무작위 선택(pick(3))과 어긋난다.`,
  `// 제목과 본문은 첫 줄바꿈으로 나뉜다(cmtParts). 첫 줄이 제목이다.`,
  `// comment feedback_01_결과코멘트 D5:E23 (원문 그대로)`,
  `const CMT={`,
  ...Object.entries(d.CMT).map(([k, v], i, a) => `${JSON.stringify(k)}: ${JSON.stringify(v)}${i < a.length - 1 ? ',' : ''}`),
  `};`,
  '',
].join('\n');

const kwAge = Object.entries(d.KW_AGE).map(([k, v], i, a) => ` ${q(k)}:[${v.map(pair).join(',')}]${i < a.length - 1 ? ',' : ''}`);
const kwGoal = Object.entries(d.KW_GOAL).map(([k, v], i, a) => ` ${q(k)}:[${v.map(pair).join(',')}]${i < a.length - 1 ? ',' : ''}`);
const keywords = [
  ...head('src/data/feedback-keywords.js — 인생키워드 문구(KW_AGE·KW_GOAL·KW_PRO)와 13번 분류표(GOAL_TO_KW). 단계 2c 신규.'),
  `// 항목은 [코드, 문구]. 연령대·경력목표는 그룹마다 3개, KW_PRO 는 9개다. 개수를 바꾸면 엔진의 무작위 선택(pick(3), pick(9))과 어긋난다.`,
  `// GOAL_TO_KW 는 문구가 아니라 분류 규칙이다: 13번 1순위 보기(OPT['goal.b13'])의 순서대로 키워드 그룹을 지정한다. 바꾸려면 계산 로직 변경으로 승인받는다.`,
  `// comment feedback_02_인생키워드`,
  `const KW_AGE={`, ...kwAge.map(l => l.replace(/^ /, '')).map(l => l), `};`,
  `const KW_GOAL={`, ...kwGoal.map(l => l.replace(/^ /, '')), `};`,
  `const KW_PRO=[`, ...d.KW_PRO.map((e, i, a) => ` ${pair(e)}${i < a.length - 1 ? ',' : ''}`), `];`,
  `// 13번 1순위 → 인생키워드 경력목표 분류 (OPT['goal.b13'] 순서)`,
  `const GOAL_TO_KW=[${d.GOAL_TO_KW.map(q).join(',')}];`,
  '',
].join('\n');

// 자체 점검: 생성한 파일을 실행해 만든 값이 추출한 값과 완전히 같다(문구·키 순서·배열 순서).
const run = text => { const c = vm.createContext({}); vm.runInContext(text + '\n;this.o={CMT:typeof CMT==="undefined"?null:CMT,KW_AGE:typeof KW_AGE==="undefined"?null:KW_AGE,KW_GOAL:typeof KW_GOAL==="undefined"?null:KW_GOAL,KW_PRO:typeof KW_PRO==="undefined"?null:KW_PRO,GOAL_TO_KW:typeof GOAL_TO_KW==="undefined"?null:GOAL_TO_KW}', c); return JSON.parse(JSON.stringify(c.o)); };
const oc = run(comments), ok = run(keywords);
assert.deepEqual(oc.CMT, d.CMT); assert.deepEqual(Object.keys(oc.CMT), Object.keys(d.CMT));
for (const k of ['KW_AGE', 'KW_GOAL', 'KW_PRO', 'GOAL_TO_KW']) assert.deepEqual(ok[k], d[k]);
assert.deepEqual(Object.keys(ok.KW_AGE), Object.keys(d.KW_AGE)); assert.deepEqual(Object.keys(ok.KW_GOAL), Object.keys(d.KW_GOAL));
console.error(`CMT ${Object.keys(d.CMT).length}개, KW_AGE ${Object.values(d.KW_AGE).flat().length}개, KW_GOAL ${Object.values(d.KW_GOAL).flat().length}개, KW_PRO ${d.KW_PRO.length}개, GOAL_TO_KW ${d.GOAL_TO_KW.length}개`);
if (process.argv.includes('--write')) {
  for (const [f, t] of [[OUT_C, comments], [OUT_K, keywords]]) {
    if (fs.existsSync(f) && !process.argv.includes('--force')) { console.error(f + ' 이 이미 있다. 사람이 편집하는 원본이므로 덮어쓰지 않는다(--force).'); process.exit(1); }
  }
  fs.mkdirSync(path.dirname(OUT_C), { recursive: true });
  fs.writeFileSync(OUT_C, comments); fs.writeFileSync(OUT_K, keywords);
  console.error('생성: ' + path.relative(root, OUT_C) + ', ' + path.relative(root, OUT_K));
}
