// 시계를 다른 시각으로 고정해 정답표를 다시 만들고, 달라지는 항목을 나열한다.
// 사용: node tests/golden/clockdiff.mjs [ISO 시각, 기본 2027-01-01T00:00:00Z]
import fs from 'node:fs';
import path from 'node:path';
import { collect } from './collect.mjs';
import { toFiles, contentOf, DATA } from './generate.mjs';

const now = process.argv[2] || '2027-01-01T00:00:00Z';
const d = await collect(undefined, { now });
const files = toFiles(d);
const walk = (a, b, p, out) => {
  if (a === b) return;
  if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p + '/' + k, out); return; }
  out.push({ path: p, stored: a, now: b });
};
let any = false;
for (const [n, buf] of Object.entries(files)) {
  const stored = contentOf(n, fs.readFileSync(path.join(DATA, n))), cur = contentOf(n, buf);
  if (stored.equals(cur)) { console.log('동일 ' + n); continue; }
  any = true;
  const out = []; walk(JSON.parse(stored), JSON.parse(cur), '', out);
  console.log('다름 ' + n + ' (' + out.length + '곳)');
  out.slice(0, 15).forEach(o => console.log('   ' + o.path + '  저장=' + JSON.stringify(o.stored) + '  ' + now.slice(0, 10) + '=' + JSON.stringify(o.now)));
}
if (!any) console.log('모든 항목 동일');
