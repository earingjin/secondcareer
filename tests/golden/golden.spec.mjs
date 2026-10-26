// 골든 대조: 대상 HTML(기본 legacy)에서 같은 입력으로 다시 수집해 저장된 정답표와 한 건도 다르지 않아야 통과.
// 이후 단계에서는 TARGET_HTML=경로 로 새 코드를 지정한다(전역 함수 이름이 같아야 한다).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { collect, LEGACY_HTML } from './collect.mjs';
import { toFiles, legacyHashOk, contentOf, contentSha, DATA } from './generate.mjs';

const target = process.env.TARGET_HTML ? path.resolve(process.env.TARGET_HTML) : LEGACY_HTML;
const read = n => fs.readFileSync(path.join(DATA, n));
const unz = b => JSON.parse(zlib.gunzipSync(b).toString());

let fresh, files;
test.beforeAll(async () => {
  fresh = await collect(target);
  files = toFiles(fresh);
});

test('기준 파일 해시가 SHA256.txt 와 같다', () => {
  const h = legacyHashOk();
  expect(h.got).toBe(h.want);
});

test('페이지 스크립트 오류 0건', () => {
  expect(fresh.pageErrors).toEqual([]);
});

test('환산·판정 (영역 5 × 원점수 13)', () => {
  expect(JSON.parse(files['conversion.json'])).toEqual(JSON.parse(read('conversion.json')));
});

test('코멘트 대상 영역 371,293 조합', () => {
  const want = unz(read('comment-area.json.gz'));
  const got = fresh.commentArea;
  expect(got.count).toBe(want.count);
  expect(got.digits.length).toBe(want.digits.length);
  // 어긋난 첫 위치를 알려주기 위해 문자열 전체 비교 전에 위치를 찾는다
  let first = -1; for (let i = 0; i < want.digits.length; i++) if (got.digits[i] !== want.digits[i]) { first = i; break; }
  expect(first, '어긋난 첫 조합 번호').toBe(-1);
  expect(got.independentMismatch).toBe(0);
});

test('computeResult 무작위 선택 전수', () => {
  const want = unz(read('compute-result.json.gz'));
  expect(fresh.computeResult.total).toBe(want.total);
  expect(fresh.computeResult.pickSeq).toEqual(want.pickSeq); // pick 호출 순서
  const bad = [];
  for (const k of Object.keys(want.cases)) {
    const a = fresh.computeResult.cases[k], b = want.cases[k];
    if (!a || a.length !== b.length || a.some((v, i) => v !== b[i])) bad.push(k);
  }
  expect(bad, '결과가 다른 조건').toEqual([]);
});

test('연령대 경계와 13번 1순위 분류', () => {
  expect(JSON.parse(files['boundaries.json'])).toEqual(JSON.parse(read('boundaries.json')));
});

test('자체 검증 탭 항목별 결과 전체(57건)', () => {
  const want = JSON.parse(read('self-tests.json'));
  expect(JSON.parse(files['self-tests.json'])).toEqual(want);
  expect(want.ok).toBe(want.total);
});

test('상담사 수정 재계산(recomputeResult·applyCounselorEdit)', () => {
  expect(JSON.parse(files['counselor-edit.json'])).toEqual(JSON.parse(read('counselor-edit.json')));
  const want = unz(read('recompute.json.gz')), got = fresh.recompute;
  expect(got.evaluationVersion).toBe(want.evaluationVersion);
  expect(got.rows.length).toBe(want.rows.length);
  const bad = got.rows.filter((r, i) => r !== want.rows[i]).slice(0, 5);
  expect(bad, '어긋난 행(앞 5건)').toEqual([]);
});

test('resultOf 재생성 조건(resKey)', () => {
  expect(JSON.parse(files['result-of.json'])).toEqual(JSON.parse(read('result-of.json')));
});

test('정답표 파일이 모두 내용 단위로 같다(압축 해제 기준)', () => {
  const m = JSON.parse(read('manifest.json'));
  for (const n of Object.keys(files)) {
    expect(contentOf(n, files[n]).equals(contentOf(n, read(n))), n).toBe(true);
    expect(contentSha(n, files[n]), n + ' manifest').toBe(m.files[n].contentSha256);
  }
  expect(Object.keys(files).sort()).toEqual(Object.keys(m.files).sort());
});
