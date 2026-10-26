// 골든 정답표 생성: node tests/golden/generate.mjs
// 기준(legacy/index.original.html)의 해시가 SHA256.txt 와 다르면 생성하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { collect, LEGACY_HTML } from './collect.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA = path.join(here, 'data');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

// 파일명 → [직렬화된 바이트]. 큰 표는 gzip(mtime 고정)으로 저장한다.
export function toFiles(d) {
  const j = o => Buffer.from(JSON.stringify(o, null, 1) + '\n');
  const gz = o => zlib.gzipSync(Buffer.from(JSON.stringify(o)), { level: 9 });
  return {
    'conversion.json': j({ settings: d.settings, rows: d.conversion }),
    'comment-area.json.gz': gz(d.commentArea),
    'compute-result.json.gz': gz(d.computeResult),
    'boundaries.json': j(d.boundaries),
    'self-tests.json': j({ total: d.selfTests.total, ok: d.selfTests.ok, items: d.selfTests.items, htmlSha256: sha(d.selfTestsHtml) }),
  };
}

export function legacyHashOk() {
  const want = fs.readFileSync(path.resolve(here, '../../legacy/SHA256.txt'), 'utf8').trim().split(/\s+/)[0];
  const got = sha(fs.readFileSync(LEGACY_HTML));
  return { want, got, ok: want === got };
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const h = legacyHashOk();
  if (!h.ok) { console.error('legacy 해시 불일치', h); process.exit(1); }
  const d = await collect();
  if (d.pageErrors.length) { console.error('페이지 스크립트 오류', d.pageErrors); process.exit(1); }
  fs.mkdirSync(DATA, { recursive: true });
  const files = toFiles(d), manifest = { legacySha256: h.got, files: {} };
  for (const [n, b] of Object.entries(files)) { fs.writeFileSync(path.join(DATA, n), b); manifest.files[n] = { bytes: b.length, sha256: sha(b) }; }
  manifest.counts = {
    conversionRows: d.conversion.length,
    commentAreaCombos: d.commentArea.count,
    commentAreaIndependentMismatch: d.commentArea.independentMismatch,
    computeResultCases: d.computeResult.total,
    computeResultContexts: Object.keys(d.computeResult.cases).length,
    ageBandRows: d.boundaries.ageBand.length, byBirthRows: d.boundaries.byBirth.length, goalClassRows: d.boundaries.goalClass.length,
    selfTests: d.selfTests.total, selfTestsOk: d.selfTests.ok,
  };
  fs.writeFileSync(path.join(DATA, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  console.log(JSON.stringify(manifest, null, 1));
}
