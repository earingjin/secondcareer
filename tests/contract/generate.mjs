// 2a 정답표 생성: node tests/contract/generate.mjs  (기준은 legacy. 해시가 다르면 생성하지 않는다)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { collectContract } from './collect.mjs';
import { LEGACY_HTML } from '../golden/collect.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA = path.join(here, 'data');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
export const contentOf = (n, b) => n.endsWith('.gz') ? zlib.gunzipSync(b) : b;
export const contentSha = (n, b) => sha(contentOf(n, b));

export function toFiles(d) {
  const j = o => Buffer.from(JSON.stringify(o, null, 1) + '\n');
  const gz = o => zlib.gzipSync(Buffer.from(JSON.stringify(o)), { level: 9 });
  return {
    'question-defs.json': j(d.defs),
    'missing.json': j(d.missing),
    'anstext.json.gz': gz(d.ansText),
    'assessments.json.gz': gz({ reps: d.reps, fixtureAssessments: d.fixtureAssessments, fixtureResultGenerated: d.fixtureResultGenerated, interface: d.interface }),
    'seed.json.gz': gz(d.seed),
    'messages.json': j(d.messages),
    'comments.json': j(d.comments),
    'globals.json': j(d.globals),
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
  const d = await collectContract();
  if (d.pageErrors.length) { console.error('페이지 스크립트 오류', d.pageErrors); process.exit(1); }
  fs.mkdirSync(DATA, { recursive: true });
  const files = toFiles(d), manifest = { legacySha256: h.got, files: {} };
  for (const [n, b] of Object.entries(files)) { fs.writeFileSync(path.join(DATA, n), b); manifest.files[n] = { storedBytes: b.length, contentBytes: contentOf(n, b).length, contentSha256: contentSha(n, b) }; }
  manifest.counts = {
    questions: d.defs.questions.length, numberedQuestions: d.defs.summary.numbered,
    missingCases: d.missing.length,
    ansTextCodes: Object.keys(d.ansText).length, ansTextValues: Object.values(d.ansText).reduce((a, v) => a + v.length, 0),
    repAssessments: d.reps.length, fixtureAssessments: d.fixtureAssessments.length, fixtureResultGenerated: d.fixtureResultGenerated.length,
    commentCount: d.comments.count, globalNodes: d.globals.nodeCount, identityPairs: d.globals.identity.length, seedPersons: d.seed.db.length, seedEnterprises: d.seed.ent.length,
  };
  fs.writeFileSync(path.join(DATA, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  console.log(JSON.stringify(manifest.counts, null, 1));
  Object.entries(manifest.files).forEach(([n, v]) => console.log(n, v.storedBytes, '(내용', v.contentBytes + ')'));
}
