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
    'recompute.json.gz': gz(d.recompute),
    'counselor-edit.json': j(d.counselorEdit),
    'result-of.json': j(d.resultOf),
    'self-tests.json': j({ total: d.selfTests.total, ok: d.selfTests.ok, items: d.selfTests.items, htmlSha256: sha(d.selfTestsHtml) }),
  };
}

// 해시·비교는 압축 해제한 내용 기준(gzip 바이트는 Node 버전에 따라 달라질 수 있다)
export const contentOf = (name, buf) => name.endsWith('.gz') ? zlib.gunzipSync(buf) : buf;
export const contentSha = (name, buf) => sha(contentOf(name, buf));

export function legacyHashOk() {
  const want = fs.readFileSync(path.resolve(here, '../../legacy/SHA256.txt'), 'utf8').trim().split(/\s+/)[0];
  const got = sha(fs.readFileSync(LEGACY_HTML));
  return { want, got, ok: want === got };
}

// 승인된 문구 변경 뒤 정답표 갱신: GEN_TARGET=src/index.html GEN_APPROVED="사유" 로 legacy 대신 작업본을 기준으로 생성한다(docs/문구-변경-절차.md).
// GEN_APPROVED 가 없으면 거부한다. 지정하지 않으면 지금처럼 legacy 기준이다.
const GEN_TARGET = process.env.GEN_TARGET ? path.resolve(process.env.GEN_TARGET) : undefined;
if (GEN_TARGET && !process.env.GEN_APPROVED) { console.error('GEN_TARGET 을 쓰려면 승인 사유(GEN_APPROVED)가 필요하다.'); process.exit(1); }
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const h = legacyHashOk();
  if (!h.ok) { console.error('legacy 해시 불일치', h); process.exit(1); }
  const d = await collect(GEN_TARGET);
  if (d.pageErrors.length) { console.error('페이지 스크립트 오류', d.pageErrors); process.exit(1); }
  fs.mkdirSync(DATA, { recursive: true });
  const files = toFiles(d), manifest = { legacySha256: h.got, files: {} };
  for (const [n, b] of Object.entries(files)) { fs.writeFileSync(path.join(DATA, n), b); manifest.files[n] = { storedBytes: b.length, contentBytes: contentOf(n, b).length, contentSha256: contentSha(n, b) }; }
  manifest.counts = {
    conversionRows: d.conversion.length,
    commentAreaCombos: d.commentArea.count,
    commentAreaIndependentMismatch: d.commentArea.independentMismatch,
    computeResultCases: d.computeResult.total,
    recomputeRows: d.recompute.rows.length, counselorEditCases: d.counselorEdit.length, resultOfCases: d.resultOf.length,
    computeResultContexts: Object.keys(d.computeResult.cases).length,
    ageBandRows: d.boundaries.ageBand.length, byBirthRows: d.boundaries.byBirth.length, goalClassRows: d.boundaries.goalClass.length,
    selfTests: d.selfTests.total, selfTestsOk: d.selfTests.ok,
  };
  fs.writeFileSync(path.join(DATA, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  console.log(JSON.stringify(manifest, null, 1));
}
