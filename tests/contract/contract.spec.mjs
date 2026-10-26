// 단계 2a 대조: 문항 정의 · missing · ansText · toAssessment(연동 계약) · 시드/문구.
// 대상 HTML(기본 legacy, TARGET_HTML 로 변경)에서 다시 수집해 저장된 정답표와 한 건도 다르지 않아야 통과.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { collectContract } from './collect.mjs';
import { toFiles, legacyHashOk, contentOf, contentSha, DATA } from './generate.mjs';
import { LEGACY_HTML } from '../golden/collect.mjs';

const target = process.env.TARGET_HTML ? path.resolve(process.env.TARGET_HTML) : LEGACY_HTML;
const read = n => fs.readFileSync(path.join(DATA, n));
const want = n => JSON.parse(contentOf(n, read(n)).toString());
const got = n => JSON.parse(contentOf(n, files[n]).toString());
// 첫 차이를 알려 주는 비교(큰 JSON 에서 읽을 수 있는 실패 메시지)
function firstDiff(a, b, p = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], p + '/' + k); if (d) return d; }
  }
  return `${p}: 기준=${JSON.stringify(a)?.slice(0, 160)} 현재=${JSON.stringify(b)?.slice(0, 160)}`;
}
let fresh, files;
test.beforeAll(async () => { fresh = await collectContract(target); files = toFiles(fresh); });

test('기준 파일 해시가 SHA256.txt 와 같다', () => { const h = legacyHashOk(); expect(h.got).toBe(h.want); });
test('페이지 스크립트 오류 0건', () => { expect(fresh.pageErrors).toEqual([]); });
test('문항 정의 덤프(36문항 + 연락처·이메일)', () => { expect(firstDiff(want('question-defs.json'), got('question-defs.json'))).toBeNull(); });
test('missing(p): 문항별 비움 · 단계별 · 형식 오류 · 선택 개수', () => { expect(firstDiff(want('missing.json'), got('missing.json'))).toBeNull(); });
test('ansText(p, code): 모든 문항의 가능한 응답값', () => { expect(firstDiff(want('anstext.json.gz'), got('anstext.json.gz'))).toBeNull(); });
test('toAssessment: 대표 응답 · fixture 전원 · 연동 인터페이스', () => {
  const w = want('assessments.json.gz'), g = got('assessments.json.gz');
  expect(firstDiff(w.reps, g.reps)).toBeNull();
  expect(firstDiff(w.fixtureAssessments, g.fixtureAssessments)).toBeNull();
  expect(firstDiff(w.interface, g.interface)).toBeNull();
  expect(g.fixtureResultGenerated).toEqual([]); // 변환 중 결과를 새로 만든 참여자 없음
});
test('시드 데이터(54명·기업 12개)와 문구', () => {
  expect(firstDiff(want('seed.json.gz'), got('seed.json.gz'))).toBeNull();
  expect(firstDiff(want('messages.json'), got('messages.json'))).toBeNull();
});
test('코멘트 전문(CMT)과 cmtParts 출력(제목/본문 분리)', () => {
  expect(want('comments.json').count).toBe(15);
  expect(firstDiff(want('comments.json'), got('comments.json'))).toBeNull();
});
test('문항 전역(QT·QLABEL·OPT·LIM·REQUIRED·WSTEPS·C_CODES·SH·FACTORS): JSON 동일성과 === 쌍 집합', () => {
  const w = want('globals.json'), g = got('globals.json');
  expect(firstDiff(w.json, g.json), 'JSON 값').toBeNull();
  expect(g.keyOrder, '키 순서').toEqual(w.keyOrder);
  expect(g.identity, '=== 인 배열·객체 쌍(집합)').toEqual(w.identity);
  expect(new Set(g.identity).size).toBe(g.identity.length);
});
test('정답표 파일이 모두 내용 단위로 같다(압축 해제 기준)', () => {
  const m = JSON.parse(read('manifest.json').toString());
  for (const n of Object.keys(files)) { expect(contentOf(n, files[n]).equals(contentOf(n, read(n))), n).toBe(true); expect(contentSha(n, files[n]), n + ' manifest').toBe(m.files[n].contentSha256); }
  expect(Object.keys(files).sort()).toEqual(Object.keys(m.files).sort());
});
