// 정적 서버를 띄우고 TARGET_URL 로 테스트를 실행한다(HTTP 대상 검증).
// 사용: node tests/run-url.mjs [--root src|legacy|<디렉터리>] [--page <파일>] [--visual] [playwright 인자…]
//   기본: --root src (페이지 '/')   legacy: --root legacy --page index.original.html
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serve } from './tools/serve-static.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const take = (flag) => { const i = args.indexOf(flag); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const rootArg = take('--root') || 'src';
const page = take('--page') || '';
const vi = args.indexOf('--visual'); const visual = vi >= 0; if (visual) args.splice(vi, 1);
const root = path.isAbsolute(rootArg) ? rootArg : path.join(repo, rootArg);

const s = await serve(root);
const url = s.url + '/' + page;
console.log(`TARGET_URL=${url}  (root: ${root})`);
const env = { ...process.env, TARGET_URL: url, TARGET_HTML: '' };
if (visual) { env.VISUAL = '1'; }
const pw = args.length ? args : (visual ? ['tests/snapshot'] : []);
const child = spawn('npx', ['playwright', 'test', ...pw], { cwd: repo, stdio: 'inherit', shell: true, env });
child.on('exit', async code => { await s.close(); process.exit(code ?? 1); });
