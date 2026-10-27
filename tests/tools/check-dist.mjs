// 단계 3b-1 배포 산출물 검사: 단일 module 진입점이 Vite 번들로 완결됐는지 확인한다.
// 앱 동작 동일성은 기존 골든·계약·스냅샷·e2e가 맡고, 이 도구는 산출물 구조만 검사한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dist = path.join(repo, 'dist');
const list = dir => fs.readdirSync(dir, { recursive: true }).map(f => String(f).split('\\').join('/')).filter(f => fs.statSync(path.join(dir, f)).isFile()).sort();

const problems = [];
if (!fs.existsSync(dist)) { console.error('dist 가 없다. 먼저 npm run build'); process.exit(2); }
const have = list(dist);
if (!have.includes('index.html')) problems.push('dist/index.html 없음');
const html = have.includes('index.html') ? fs.readFileSync(path.join(dist, 'index.html'), 'utf8') : '';
const modules = [...html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi)].map(m=>m[1]);
if (modules.length !== 1) problems.push(`module 진입점 ${modules.length}개(기대 1개)`);
if (/<script\b[^>]*\bsrc=["'][^"']*(?:\/js\/|\/data\/)/i.test(html)) problems.push('classic js/data 스크립트 참조가 남음');
for (const ref of modules) {
  const rel=ref.replace(/^\//,'').split(/[?#]/)[0];
  if (!have.includes(rel)) problems.push(`HTML 이 참조하지만 dist 에 없음: ${rel}`);
  if (!/^assets\/.+\.js$/.test(rel)) problems.push(`module 진입점이 assets/*.js 가 아님: ${rel}`);
}
for (const f of have) {
  if (f.endsWith('.map')) problems.push(`의도하지 않은 sourcemap: ${f}`);
  if (/^(?:js|data)\//.test(f)) problems.push(`classic 원본이 중복 배포됨: ${f}`);
  if (f!=='index.html'&&!/^assets\//.test(f)) problems.push(`예상 밖 배포 파일: ${f}`);
}
console.log(`dist 파일 ${have.length}개 (${have.join(', ')}) · module 진입점 ${modules.length}개`);
if (problems.length) { problems.forEach(p => console.error('  ✗ ' + p)); process.exit(1); }
console.log('OK: dist module 산출물이 완결됐고 classic 원본 중복이 없다');
