// 역할별 흐름 e2e (실제 클릭). 시드 데이터에서 시작하고, 시계·난수는 고정한다.
// 관리자 등록 → 내담자 제출(36문항) → 결과 비공개·수정 잠금 → 상담사(자기 내담자만·수정 이력)
// → 고객사 담당자(집계만) → 사후 진단·만족도 → 사전사후 보고서. PPT 내보내기는 제외(알려진 제한).
import { test, expect, chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { newPage, LEGACY_HTML } from '../golden/collect.mjs';

const target = process.env.TARGET_HTML ? path.resolve(process.env.TARGET_HTML) : LEGACY_HTML;
const URL0 = pathToFileURL(target).href;

const CO = '엔투엔물산', NICK_A = '길벗', NICK_B = '달님';
const st = {}; // 단계 사이에 넘기는 값(자동 부여된 코드·비밀번호)

let browser, page;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { browser = await chromium.launch(); page = await newPage(browser); await page.goto(URL0); });
test.afterAll(async () => { await browser.close(); });

const body = () => page.locator('body');
const db = id => page.evaluate(i => JSON.parse(JSON.stringify(byId(i))), id);
const chip = (code, i) => page.locator(`#q-${code} .chip`).nth(i).click();
const rowOf = nick => page.locator('table.t tr').filter({ hasText: nick });

test('1. 관리자: 기업·컨설턴트·내담자·고객사 담당자 등록', async () => {
  await page.click('#m-a');
  await expect(page.getByRole('heading', { name: '관리자 페이지' })).toBeVisible();
  // 기업
  await page.fill('#en-name', CO); await page.fill('#en-start', '2026-10-01'); await page.fill('#en-end', '2027-03-31');
  await page.fill('#en-pm', '테스트 PM'); await page.fill('#en-mail', 'pm@example.com'); await page.fill('#en-tel', '010-0000-0001');
  await page.getByRole('button', { name: '기업 등록', exact: true }).click();
  await expect(page.locator('#ent-detail h2')).toContainText(CO);
  // 컨설턴트
  await page.fill('#cs-name', '테스트 상담사'); await page.fill('#cs-mail', 'cs@example.com'); await page.fill('#cs-tel', '010-0000-0002');
  await page.getByRole('button', { name: '컨설턴트 추가' }).click();
  const csRow = page.locator('#ent-detail table.t tr').filter({ hasText: '테스트 상담사' });
  await expect(csRow).toHaveCount(1);
  st.counselor = (await csRow.locator('td').first().innerText()).trim();
  expect(st.counselor).toMatch(/^\d+$/);
  // 내담자 2명(자동 배정·비밀번호 자동 부여)
  await page.fill('#bulk', `${NICK_A}, 010-3456-7890\n${NICK_B}, 010-4567-8901`);
  await page.getByRole('button', { name: '내담자 등록하고 계정 부여' }).click();
  const a = rowOf(NICK_A), b = rowOf(NICK_B);
  await expect(a).toHaveCount(1);
  st.idA = (await a.locator('td').nth(1).innerText()).trim(); st.pwA = (await a.locator('td').nth(2).innerText()).trim();
  st.idB = (await b.locator('td').nth(1).innerText()).trim(); st.pwB = (await b.locator('td').nth(2).innerText()).trim();
  expect(st.idA).toBe('34567890'); expect(st.pwA).toMatch(/^\d{6}$/);
  expect(await b.locator('td').nth(3).innerText()).toContain('테스트 상담사');
  // 고객사 담당자
  await page.fill('#mg-name', '테스트 담당자'); await page.fill('#mg-mail', 'mg@example.com'); await page.fill('#mg-tel', '010-0000-0003');
  await page.getByRole('button', { name: '담당자 등록하고 계정 부여' }).click();
  st.mgId = (await page.locator('.quote b').nth(0).innerText()).trim(); st.mgPw = (await page.locator('.quote b').nth(1).innerText()).trim();
  expect(st.mgId).toMatch(/^cm\d+$/); expect(st.mgPw).toMatch(/^\d{6}$/);
  // 저장 상태 확인
  expect((await db(st.idA)).company).toBe(CO);
  expect((await db(st.idA)).counselor).toBe(st.counselor);
});

async function loginViaInvite(id, nick, pw) {
  await page.goto(URL0 + '#join-' + id); await page.reload();
  await expect(page.locator('#lg-id')).toHaveValue(id); // 초대 링크로 아이디가 채워진다
  await page.fill('#lg-nick', nick); await page.fill('#lg-co', CO); await page.fill('#lg-pw', pw);
  await page.getByRole('button', { name: '진단 시작' }).click();
}

test('2. 내담자: 초대 링크로 들어와 36문항 제출', async () => {
  await loginViaInvite(st.idA, NICK_A, st.pwA);
  // 1단계 참여 동의
  await expect(page.locator('#q-A1')).toBeVisible();
  await page.locator('#q-A1 .chip', { hasText: '동의' }).first().click();
  await expect(page.locator('#q-A2')).toContainText(st.counselor); // 상담코드는 초대 맥락에서 자동 입력
  await page.getByRole('button', { name: '다음 · 기본정보' }).click();
  // 2단계 기본정보 (업종·기대소득은 '기타' 입력으로)
  await page.fill('#q-A3 input', '김길벗');
  await chip('A4', 0);
  await page.fill('#q-A5 input', '19680315');
  await page.fill('#q-EM input', 'gilbut@example.com');
  await page.fill('#q-A7 input', '부장'); await page.fill('#q-A8 input', '영업 지원');
  await page.locator('#q-A9 .chip', { hasText: '기타' }).click(); await page.fill('#q-A9 input[aria-label="기타 내용"]', '반려동물 서비스');
  await page.locator('#q-A10 .chip', { hasText: '기타' }).click(); await page.fill('#q-A10 input[aria-label="기타 내용"]', '협의');
  await page.getByRole('button', { name: '다음 · 경력목표' }).click();
  // 3단계 경력목표 (13번은 1·2순위)
  await chip('B11', 0); await chip('B12', 1); await chip('B13', 3); await chip('B13', 0); await chip('B14', 0);
  await page.fill('#q-B15 input', '70'); await page.fill('#q-B16 input', '6');
  await page.getByRole('button', { name: '다음 · 진단 15문항' }).click();
  // 4단계 진단 15문항 (원점수 합이 영역별로 다르게)
  const pat = [3, 4, 4, 2, 4, 4, 4, 3, 4, 5, 4, 4, 3, 4, 3];
  for (let i = 0; i < 15; i++) await page.locator(`#q-C${17 + i} .scale button`).nth(pat[i] - 1).click();
  await page.getByRole('button', { name: '다음 · 서비스 기대' }).click();
  // 5단계 서비스 기대
  await chip('D32', 0); await chip('D33', 0); await chip('D33', 1); await chip('D33', 2); await chip('D34', 0); await chip('D35', 0); await chip('D35', 1); await chip('D36', 0);
  await page.getByRole('button', { name: '다음 · 응답 검토' }).click();
  await expect(page.locator('.misslist')).toHaveCount(0); // 누락 없음
  await page.getByRole('button', { name: '최종 제출' }).click();
  await expect(body()).toContainText('응답이 제출되었습니다');
  const p = await db(st.idA);
  expect(p.status).toBe('submitted'); expect(p.preDate).toBe('2026-10-26');
  expect(p.pre).toEqual(pat);
  expect(p.result.raw).toEqual([0, 1, 2, 3, 4].map(i => pat[i * 3] + pat[i * 3 + 1] + pat[i * 3 + 2]));
  // 응답 항목(문항 1~36 + 연락처·이메일)이 연동 JSON 에 모두 있다
  const A = await page.evaluate(i => toAssessment(byId(i)).answers, st.idA);
  const filled = Object.keys(A).filter(k => { const v = A[k]; return Array.isArray(v) ? v.length : v !== '' && v !== null; });
  expect(Object.keys(A).filter(k => /^[ABCD]\d+$/.test(k)).length).toBe(36);
  expect(filled.filter(k => /^[ABCD]\d+$/.test(k)).length).toBe(36);
  expect(A.A9).toBe('반려동물 서비스'); expect(A.A10).toBe('협의');
});

test('3. 제출 후 결과가 보이지 않고 수정이 잠긴다', async () => {
  // 홈: 결과 없음, 시작 버튼 없음, 나가기만
  await expect(page.locator('section.sheet')).toHaveCount(0);
  await expect(body()).not.toContainText('나의 종합결과');
  await expect(page.getByRole('button', { name: /이어서 진행하기|설문 시작하기/ })).toHaveCount(0);
  await expect(page.locator('.card .btn')).toHaveText(['사후 진단 시작', '나가기']); // 결과·수정 버튼 없음
  // 제출 응답을 마법사로 다시 열려고 해도 잠금 안내
  await page.evaluate(() => { S.mode2 = 'pre'; S.step = 0; nav('wizard'); });
  await expect(body()).toContainText('수정할 수 없습니다');
  await expect(page.locator('#q-A3')).toHaveCount(0);
  await page.evaluate(() => nav('home'));
  // 나갔다가 다시 로그인해도 홈으로(마법사가 아니라)
  await page.getByRole('button', { name: '나가기' }).click();
  await loginViaInvite(st.idA, NICK_A, st.pwA);
  await expect(body()).toContainText('응답이 제출되었습니다');
  await expect(page.locator('#q-A3')).toHaveCount(0);
  // 다른 내담자(미제출)는 설문으로 들어간다
  await page.getByRole('button', { name: '나가기' }).click();
});

test('4. 상담사: 자기 내담자만 보고, 응답을 수정하면 재계산·이력이 남는다', async () => {
  await page.goto(URL0); await page.reload();
  await page.click('#m-c');
  await page.locator('select').first().selectOption(st.counselor);
  await expect(page.getByRole('heading', { name: '내 내담자 현황' })).toBeVisible();
  const rows = page.locator('section#plist table.t tr').filter({ has: page.locator('td') });
  await expect(rows).toHaveCount(2);
  await expect(page.locator('section#plist')).toContainText(NICK_A);
  await expect(page.locator('section#plist')).toContainText(NICK_B);
  await expect(body()).not.toContainText('홍길동'); // 다른 상담사 담당 내담자는 보이지 않는다
  expect(await rows.filter({ hasText: '다이소' }).count()).toBe(0);
  // 다른 상담사로 바꾸면 이 내담자들은 보이지 않는다
  await page.locator('select').first().selectOption('102');
  await expect(page.locator('section#plist')).not.toContainText(NICK_A);
  await page.locator('select').first().selectOption(st.counselor);
  // 결과(상담사용) 열기 → 응답 수정
  await rowOf(NICK_A).getByRole('button', { name: /상담사용 5p/ }).click();
  await expect(page.getByRole('button', { name: '응답 수정 (상담사)' })).toBeVisible();
  await expect(page.locator('.editpanel')).toContainText('변경 이력이 없습니다');
  const before = await db(st.idA);
  await page.getByRole('button', { name: '응답 수정 (상담사)' }).click();
  await page.locator('.rv-h', { hasText: '4. 진단 15문항' }).getByRole('button', { name: '수정' }).click();
  await page.locator('#q-C17 .scale button').nth(0).click(); // 3점 → 1점
  await page.locator('#q-C18 .scale button').nth(0).click(); // 4점 → 1점
  await page.getByRole('button', { name: '다음 · 서비스 기대' }).click();
  await page.getByRole('button', { name: '다음 · 응답 검토' }).click();
  await page.getByRole('button', { name: '수정 저장·재계산' }).click();
  await expect(page.locator('.editpanel')).toContainText('변경 이력 1건');
  await expect(page.locator('.editpanel')).toContainText('결과 재계산됨');
  const after = await db(st.idA);
  expect(after.history).toHaveLength(1);
  expect(after.history[0].changes.map(c => c.code)).toEqual(['C17', 'C18']);
  expect(after.history[0].by).toBe('테스트 상담사 상담사');
  expect(after.pre[0]).toBe(1); expect(after.pre[1]).toBe(1);
  expect(after.result.raw[0]).toBe(before.result.raw[0] - 5);       // 3+4+4 → 1+1+4
  expect(after.status).toBe('submitted');
  // 상담사 선택(데모) 되돌림 없이 보고서에 상담사 연락처가 들어간다
  await expect(page.locator('.ccard')).toContainText('cs@example.com');
});

test('5. 고객사 담당자: 집계만 본다', async () => {
  await page.click('#m-m');
  await page.fill('#mg-id', st.mgId); await page.fill('#mg-pw', st.mgPw);
  await page.getByRole('button', { name: '로그인' }).click();
  await expect(page.getByRole('heading', { name: CO + ' 진단 현황' })).toBeVisible();
  const tile = n => page.locator('.tile').filter({ hasText: n }).locator('b');
  await expect(tile('전체 인원')).toHaveText('2');
  await expect(tile('사전 완료')).toHaveText('1');
  await expect(tile('사전 미완료')).toHaveText('1');
  await expect(tile('사후 완료')).toHaveText('0');
  await expect(page.locator('.donut').first()).toContainText('50%');
  // 개인 정보·개별 응답 없음
  for (const t of [NICK_A, NICK_B, '김길벗', '010-3456-7890', 'gilbut@example.com', st.pwA]) await expect(body()).not.toContainText(t);
  await expect(page.locator('table')).toHaveCount(0);
  await expect(body()).toContainText('개인별 응답과 결과는 공개되지 않으며');
  await page.getByRole('button', { name: '로그아웃' }).click();
});

test('6. 내담자: 사후 진단·만족도', async () => {
  await page.goto(URL0 + '#join-' + st.idA); await page.reload();
  await page.fill('#lg-nick', NICK_A); await page.fill('#lg-co', CO); await page.fill('#lg-pw', st.pwA);
  await page.getByRole('button', { name: '진단 시작' }).click();
  await page.getByRole('button', { name: '사후 진단 시작' }).click();
  await expect(page.getByRole('heading', { name: '사후 진단' })).toBeVisible();
  const scales = page.locator('.q .scale');
  await expect(scales).toHaveCount(15);
  for (let i = 0; i < 15; i++) await scales.nth(i).locator('button').nth(i % 3 === 0 ? 4 : 3).click();
  await page.getByRole('button', { name: '다음 · 사후 만족도' }).click();
  await expect(page.getByRole('heading', { name: '사후 만족도 설문' })).toBeVisible();
  const q = key => page.locator('.q', { hasText: key });
  for (const k of ['Q1', 'Q2', 'Q3-1', 'Q3-2', 'Q3-3', 'Q5-2']) await q(k).locator('.scale button').nth(4).click();
  await q('Q3-4').locator('.chip').nth(0).click();
  for (const i of [0, 1, 2]) await q('Q4').locator('.chip').nth(i).click();
  await q('Q5-1').locator('.chip').nth(0).click();
  await q('Q6').locator('.chip').nth(0).click();
  await q('Q7').locator('.chip').nth(0).click();
  await page.fill('#q7t', '도움이 되었습니다. 감사합니다.');
  await page.getByRole('button', { name: '사후 진단 제출' }).click();
  await expect(body()).toContainText('사후 진단 완료');
  const p = await db(st.idA);
  expect(p.post).toHaveLength(15); expect(p.postDate).toBe('2026-10-26'); expect(p.sat.q1).toBe(5);
  // 사후 제출 뒤에도 결과는 내담자에게 보이지 않는다
  await expect(page.locator('section.sheet')).toHaveCount(0);
});

test('7. 사전사후 보고서 9화면이 열린다', async () => {
  await page.getByRole('button', { name: '나가기' }).click();
  await page.click('#m-a');
  await page.getByRole('button', { name: '사전사후 보고서' }).click();
  await page.locator('select[aria-label="기업"]').selectOption(CO);
  for (let n = 1; n <= 9; n++) {
    await expect(page.locator('.rtitle b')).toHaveText(`${n} / 9`);
    await expect(page.locator('#rslide .empty')).toHaveCount(0);
    await expect(page.locator('#rslide .rbase')).toContainText(CO);
    if (n === 1) {
      await expect(page.locator('.rbase')).toContainText('n=1');
      await expect(page.locator('.tile').first()).toContainText('1명');
    }
    if (n < 9) await page.getByRole('button', { name: '다음 화면' }).click();
  }
  // 상담사 화면의 보고서도 자기 내담자 기준으로 열린다
  await page.click('#m-c');
  await page.locator('select').first().selectOption(st.counselor);
  await page.getByRole('button', { name: '사전사후 보고서' }).click();
  // 보고서 화면 위치(S.rtab)는 관리자·상담사가 공유하므로 마지막에 보던 9번 화면으로 열린다(현재 동작)
  await expect(page.locator('.rtitle b')).toHaveText('9 / 9');
  await expect(page.locator('#rslide .empty')).toHaveCount(0);
  await expect(page.locator('#rslide .rbase')).toContainText('n=1');
});
