// npm run test:dist — 빌드한 dist 를 vite preview 로 띄워 TARGET_URL 로 전체 테스트를 실행하고, 끝나면 서버를 종료한다.
// 순서: vite build → check-dist(src 와 바이트 동일) → preview 기동 → playwright → preview 종료
// 사용: node tests/run-dist.mjs [--visual] [playwright 인자…]   (--visual: 캡처 비교만, tests/snapshot)
// 시간 제한: 빌드 90초, 점검 30초, preview 기동 30초, 테스트 300초. 초과하면 프로세스 트리를 종료하고 실패로 끝낸다.
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const vi = args.indexOf('--visual'); const visual = vi >= 0; if (visual) args.splice(vi, 1);
const kill = pid => spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { shell: true, stdio: 'ignore' });

function run(cmd, cmdArgs, { ms, env = {}, label }) {
  return new Promise(resolve => {
    const c = spawn(cmd, cmdArgs, { cwd: repo, shell: true, stdio: 'inherit', env: { ...process.env, ...env } });
    const t = setTimeout(() => { console.error(`[run-dist] ${label}: ${ms / 1000}초 제한 초과 — 종료`); kill(c.pid); resolve({ code: 124 }); }, ms);
    c.on('exit', code => { clearTimeout(t); resolve({ code: code ?? 1 }); });
  });
}
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });

let preview = null;
const stop = () => { if (preview) { kill(preview.pid); preview = null; } };
process.on('SIGINT', () => { stop(); process.exit(130); });
process.on('exit', stop);

console.log('[run-dist] 1/4 vite build');
let r = await run('npx', ['vite', 'build'], { ms: 90000, label: 'build' });
if (r.code) { console.error('[run-dist] 빌드 실패'); process.exit(r.code); }
console.log('[run-dist] 2/4 dist 와 src 비교');
r = await run('node', ['tests/tools/check-dist.mjs'], { ms: 30000, label: 'check-dist' });
if (r.code) { console.error('[run-dist] dist 가 src 와 다르다'); process.exit(r.code); }

const port = await freePort();
console.log(`[run-dist] 3/4 vite preview (포트 ${port})`);
preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: repo, shell: true, stdio: 'ignore' });
let ready = false;
for (let i = 0; i < 75 && !ready; i++) { try { const x = await fetch(`http://localhost:${port}/`); ready = x.status === 200; } catch { /* 아직 */ } if (!ready) await new Promise(r => setTimeout(r, 400)); }
if (!ready) { console.error('[run-dist] preview 가 30초 안에 응답하지 않음'); stop(); process.exit(3); }

console.log(`[run-dist] 4/4 playwright (TARGET_URL=http://localhost:${port}/)${visual ? ' [캡처 비교]' : ''}`);
const pw = args.length ? args : (visual ? ['tests/snapshot'] : []);
const env = { TARGET_URL: `http://localhost:${port}/`, TARGET_HTML: '' };
if (visual) env.VISUAL = '1';
r = await run('npx', ['playwright', 'test', ...pw], { ms: 300000, env, label: 'playwright' });
stop();
console.log(`[run-dist] 종료코드 ${r.code} — preview 서버 종료`);
process.exit(r.code);
