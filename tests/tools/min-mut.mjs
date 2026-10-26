// 최소 변조 시험(6건): 테스트 도구나 정답표 생성 방식이 바뀔 때만 쓴다. 변형 정의와 사용법: docs/변조-시험-최소-실행기.md
// 변형마다: 임시 복사본(저장소 밖 Temp 아래)을 정적 서버로 서빙 → TARGET_URL → 지정 테스트만, 첫 실패 시 중단(--max-failures=1), 변형당 3분 제한.
// 사용: node tests/tools/min-mut.mjs [번호들]        예) node tests/tools/min-mut.mjs 1   /   node tests/tools/min-mut.mjs 1,2,3,4,5,6 (기본)
//       node tests/tools/min-mut.mjs --list          변형 목록 출력
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serve } from './serve-static.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rest = process.argv.slice(2).filter(a => !a.startsWith('--'));
const which = (rest[0] || '1,2,3,4,5,6').split(',').map(Number);
const TMP = path.join(os.tmpdir(), 'sp-min');
const LIMIT = 180000;

const V = {
  1: { name: '골든: 판정 경계 7→8', spec: 'tests/golden/golden.spec.mjs', g: '환산·판정', des: /환산·판정/, from: "(VBA fun1 참조표)',cut:[[7,10,13]", to: "(VBA fun1 참조표)',cut:[[8,10,13]" },
  2: { name: '계약: 문항 문구 1글자', spec: 'tests/contract/contract.spec.mjs', g: '문항 정의 덤프', des: /문항 정의 덤프/, from: "A3:'귀하의 성함을 입력해주세요.'", to: "A3:'귀하의 이름을 입력해주세요.'" },
  3: { name: 'HTML 스냅샷: 로그인 제목 문구', spec: 'tests/snapshot/snapshot.spec.mjs', g: 'p-login', env: { SCENE: '^p-login$' }, des: /p-login/, from: '<h2>진단 시작하기</h2>', to: '<h2>진단 시작하기!</h2>' },
  4: { name: 'CSS 지문: 색상 1단계', spec: 'tests/snapshot/snapshot.spec.mjs', g: 'CSS 규칙 지문', des: /CSS 규칙 지문/, from: '--coral:#2F7C82;', to: '--coral:#2F7C83;' },
  5: { name: 'e2e: 제출 후 수정 잠금 해제', spec: 'tests/e2e/roles.spec.mjs', g: '관리자: 기업|내담자: 초대 링크|제출 후 결과가 보이지 않고', des: /3\. 제출 후/, from: 'if(!post&&isSubmitted(p)&&!S.cedit)return', to: 'if(false)return', note: '흐름 시험이라 앞의 1·2단계가 선행 조건으로 함께 실행됨(판정은 3단계)' },
};

if (process.argv.includes('--list')) { for (const [n, v] of Object.entries(V)) console.log(`${n}  ${v.name}  [${v.spec} -g ${v.g}]`); console.log('6  대상 확인: 변조 서버 실패 + 원본 서버 통과  [1번과 같은 테스트를 원본 서버에 실행]'); process.exit(0); }

function runPw(spec, g, env) {
  return new Promise(resolve => {
    const json = path.join(TMP, 'r.json'); fs.rmSync(json, { force: true });
    const c = spawn('npx', ['playwright', 'test', spec, '-g', JSON.stringify(g), '--max-failures=1', '--timeout=60000', '--reporter=json'], { cwd: repo, shell: true, env: { ...process.env, ...env, TARGET_HTML: '', PLAYWRIGHT_JSON_OUTPUT_NAME: json } });
    let o = ''; c.stdout.on('data', d => o += d); c.stderr.on('data', d => o += d);
    const t0 = Date.now();
    const timer = setTimeout(() => { spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { shell: true, stdio: 'ignore' }); resolve({ timeout: true, ms: Date.now() - t0, json }); }, LIMIT);
    c.on('exit', code => { clearTimeout(timer); resolve({ code, ms: Date.now() - t0, json, o }); });
  });
}
function tests(jsonFile) {
  const out = [];
  const j = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  const walk = (s, t) => { const tt = s.title && !s.title.endsWith('.mjs') ? [...t, s.title] : t; (s.specs || []).forEach(sp => (sp.tests || []).forEach(x => out.push({ title: [...tt, sp.title].join(' › '), status: (x.results || []).slice(-1)[0]?.status || x.status }))); (s.suites || []).forEach(c => walk(c, tt)); };
  (j.suites || []).forEach(s => walk(s, []));
  return out;
}
function classify(r, des) {
  if (r.timeout) return ['시간 초과', ''];
  let ts; try { ts = tests(r.json); } catch (e) { return ['오류', '결과 파일 읽기 실패: ' + e.message.slice(0, 60)]; }
  if (!ts.length) return ['오류', '실행된 테스트 없음'];
  const failed = ts.filter(t => t.status === 'failed' || t.status === 'timedOut');
  if (failed.some(t => des.test(t.title))) return ['잡힘', failed.map(t => t.title.split(' › ').slice(-1)[0].slice(0, 40)).join(' / ')];
  if (failed.length) return ['다른 테스트가 잡음', failed.map(t => t.title.split(' › ').slice(-1)[0].slice(0, 40)).join(' / ')];
  const des2 = ts.filter(t => des.test(t.title));
  if (des2.length && des2.every(t => t.status === 'passed')) return ['안 잡힘', '지정 테스트 통과'];
  return ['오류', '지정 테스트가 실행되지 않음: ' + ts.map(t => t.status).join(',')];
}
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
const rows = [];
for (const n of which.filter(x => x <= 5)) {
  const v = V[n]; const dir = path.join(TMP, 'v' + n); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'index.original.html'); let s = fs.readFileSync(path.join(repo, 'legacy/index.original.html'), 'utf8');
  const cnt = s.split(v.from).length - 1; if (cnt !== 1) { rows.push({ n, name: v.name, verdict: '오류', detail: `변조 대상 문자열 ${cnt}회`, sec: 0 }); console.log(`${n} 오류: 변조 대상 ${cnt}회`); continue; }
  fs.writeFileSync(f, s.replace(v.from, () => v.to));
  const srv = await serve(dir);
  const r = await runPw(v.spec, v.g, { ...(v.env || {}), TARGET_URL: srv.url + '/index.original.html' });
  await srv.close();
  const [verdict, detail] = classify(r, v.des);
  rows.push({ n, name: v.name, verdict, detail, sec: +(r.ms / 1000).toFixed(1), note: v.note });
  console.log(`${n} ${v.name}: ${verdict} (${(r.ms / 1000).toFixed(1)}초) — ${detail}`);
}
if (which.includes(6)) {
  // 대상 확인: 같은 지정 테스트(골든 환산·판정)를 원본 legacy 서버에 대해 실행 → 통과해야 한다
  const v = V[1]; const dir = path.join(TMP, 'orig'); fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(repo, 'legacy/index.original.html'), path.join(dir, 'index.original.html'));
  const srv = await serve(dir);
  const r = await runPw(v.spec, v.g, { TARGET_URL: srv.url + '/index.original.html' });
  await srv.close();
  let verdict, detail;
  if (r.timeout) { verdict = '시간 초과'; detail = ''; } else {
    try { const ts = tests(r.json); const des = ts.filter(t => v.des.test(t.title)); verdict = des.length && des.every(t => t.status === 'passed') ? '원본 서버 통과' : '오류'; detail = ts.map(t => t.status).join(','); } catch (e) { verdict = '오류'; detail = e.message.slice(0, 60); }
  }
  const mut = rows.find(x => x.n === 1);
  const both = mut && mut.verdict === '잡힘' && verdict === '원본 서버 통과';
  rows.push({ n: 6, name: '대상 확인: 변조 서버 실패 + 원본 서버 통과', verdict: both ? '잡힘' : (mut ? (mut.verdict + ' / ' + verdict) : verdict + ' (변조 서버 결과는 1번 필요)'), detail: `원본 서버: ${verdict} ${detail}`, sec: +(r.ms / 1000).toFixed(1) });
  console.log(`6 대상 확인: 변조 서버(1번)=${mut ? mut.verdict : '미실행'}, 원본 서버=${verdict} (${(r.ms / 1000).toFixed(1)}초)`);
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log('임시 폴더 정리:', TMP);
console.log(JSON.stringify(rows));
