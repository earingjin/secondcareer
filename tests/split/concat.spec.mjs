// 단계 1a 증명: src/js 의 분할 파일을 로드 순서대로 원래 자리에 되돌리면 legacy 와 한 글자도 다르지 않다.
// 제외 방식: 각 분할 파일의 첫 줄(`// src/js/…` 헤더 주석) 한 줄만 제거한다. 그 외 내용은 모두 비교 대상이다.
// 비교는 문서 전체(src/index.html 에서 외부 스크립트 태그를 본문으로 되돌린 결과 === legacy 전체)로 한다.
// 주의: 1b 부터 src 는 승인된 변경(config 상수화 등)으로 legacy 와 의도적으로 달라진다. 내용 동일성 검사 2건은
// 1a 시점(커밋 63e805c) 증명이므로 SPLIT_STRICT=1 일 때만 실행한다. 구조 검사 2건은 항상 실행한다.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const legacy = fs.readFileSync(path.join(root, 'legacy/index.original.html'), 'utf8');
const src = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const RE = /((?:<script src="js\/[^"]+"><\/script>\n)+)<script>\n/g;

const matches = [...src.matchAll(RE)];
const files = matches.length ? [...matches[0][1].matchAll(/src="(js\/[^"]+)"/g)].map(m => m[1]) : [];
const body = f => { const t = fs.readFileSync(path.join(root, 'src', f), 'utf8'); const i = t.indexOf('\n'); return { head: t.slice(0, i), text: t.slice(i + 1) }; };

test('외부 스크립트 태그는 한 묶음이고 로드 순서가 파일 번호 순서다', () => {
  expect(matches).toHaveLength(1);
  expect(files.length).toBeGreaterThan(0);
  expect([...files].sort()).toEqual(files);
  const onDisk = fs.readdirSync(path.join(root, 'src/js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f).sort();
  expect(onDisk).toEqual([...files].sort()); // 참조되지 않는 파일이 없다
});

test('분할 파일: 헤더 주석은 정확히 첫 줄 하나, 모듈 문법 없음', () => {
  for (const f of files) {
    const { head, text } = body(f);
    expect(head, f).toMatch(/^\/\/ src\/js\/\S+ — legacy\/index\.original\.html \d+–\d+행/);
    expect(text, f).not.toMatch(/^\s*(import|export)\s/m);
  }
  expect(src).not.toMatch(/type="module"/);
});

const strict = process.env.SPLIT_STRICT === '1';
test('이어 붙인 텍스트가 legacy 의 해당 구간과 한 글자도 다르지 않다(문서 전체 복원 === legacy)', () => {
  test.skip(!strict, '1b 이후 src 는 legacy 와 의도적으로 다름(1a 시점 증명: 커밋 63e805c)');
  const rebuilt = src.replace(RE, (_, tags) => '<script>\n' + [...tags.matchAll(/src="(js\/[^"]+)"/g)].map(m => body(m[1]).text).join(''));
  if (rebuilt !== legacy) {
    let i = 0; while (i < rebuilt.length && rebuilt[i] === legacy[i]) i++;
    const ln = legacy.slice(0, i).split('\n').length;
    throw new Error(`legacy ${ln}행 부근에서 달라짐: ${JSON.stringify(legacy.slice(i, i + 60))} ≠ ${JSON.stringify(rebuilt.slice(i, i + 60))}`);
  }
  expect(Buffer.from(rebuilt).equals(Buffer.from(legacy))).toBe(true);
});

test('옮긴 구간은 legacy 의 연속된 줄 범위이고 헤더가 가리키는 범위와 일치한다', () => {
  test.skip(!strict, '1b 이후 src 는 legacy 와 의도적으로 다름(1a 시점 증명: 커밋 63e805c)');
  const lines = legacy.split('\n');
  let next = null;
  for (const f of files) {
    const { head, text } = body(f);
    const [, a, b] = /(\d+)–(\d+)행/.exec(head).map(Number);
    expect(text, f).toBe(lines.slice(a - 1, b).join('\n') + '\n');
    if (next !== null) expect(a, f + ' 은 앞 파일 바로 다음 줄에서 시작').toBe(next);
    next = b + 1;
  }
});
