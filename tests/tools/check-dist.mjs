// dist 가 src 와 바이트 단위로 같은지 확인한다(단계 3a: 앱 코드·CSS·화면은 바뀌지 않는다).
//  - dist/index.html === src/index.html
//  - dist/js, dist/data 의 파일 집합과 각 파일의 내용이 src 와 같다
//  - dist 에 그 밖의 파일(번들 산출물 등)이 없다
// 사용: node tests/tools/check-dist.mjs   (종료코드 0 = 일치)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = path.join(repo, 'src'), dist = path.join(repo, 'dist');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const list = dir => fs.readdirSync(dir, { recursive: true }).map(f => String(f).split('\\').join('/')).filter(f => fs.statSync(path.join(dir, f)).isFile()).sort();

const problems = [];
if (!fs.existsSync(dist)) { console.error('dist 가 없다. 먼저 npm run build'); process.exit(2); }
const want = ['index.html', ...['js', 'data'].flatMap(d => list(path.join(src, d)).map(f => d + '/' + f))].sort();
const have = list(dist);
for (const f of want) if (!have.includes(f)) problems.push('dist 에 없음: ' + f);
for (const f of have) if (!want.includes(f)) problems.push('dist 에 예상 밖 파일: ' + f);
let same = 0;
for (const f of want) { if (!have.includes(f)) continue; if (sha(path.join(src, f)) === sha(path.join(dist, f))) same++; else problems.push('내용 다름: ' + f); }
console.log(`dist 파일 ${have.length}개, src 와 바이트 동일 ${same}/${want.length}개 (index.html ${sha(path.join(src, 'index.html')) === sha(path.join(dist, 'index.html')) ? '동일' : '다름'})`);
if (problems.length) { problems.forEach(p => console.error('  ✗ ' + p)); process.exit(1); }
console.log('OK: dist 는 src 와 같다');
