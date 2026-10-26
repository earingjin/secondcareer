// 화면 기준선 대조. 기본(npm test): HTML(전 화면) · 집계 JSON · 인쇄 쪽수 · CSS 지문.
// 캡처(너비 3 × 테마 2)는 VISUAL=1 일 때만 비교한다(npm run test:visual). 캡처 이미지는 저장소에 두지 않는다.
// 기준 갱신: node tests/snapshot/update.mjs [--visual]  (기준은 legacy 에서만 갱신한다)
import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES } from './scenes.mjs';
import { COMBOS, openContext, runScene, printPages, cssFingerprint } from './capture.mjs';
import { LEGACY_HTML } from '../golden/collect.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(here, 'baseline');
const UPDATE = process.env.UPDATE === '1';
const VISUAL = process.env.VISUAL === '1';
const target = process.env.TARGET_HTML ? path.resolve(process.env.TARGET_HTML) : LEGACY_HTML;
const only = process.env.SCENE ? new RegExp(process.env.SCENE) : null;
const scenes = SCENES.filter(s => !only || only.test(s.id));
const j = o => JSON.stringify(o, null, 1) + '\n';
const rd = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
const wr = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

let browser;
test.beforeAll(async () => { browser = await chromium.launch(); });
test.afterAll(async () => { await browser.close(); });

const printFile = path.join(BASE, 'print-pages.json');
const printNow = {};

for (const combo of (VISUAL ? COMBOS : COMBOS.filter(c => c.w === 1100 && c.theme === 'light'))) {
  const main = combo.w === 1100 && combo.theme === 'light';
  test.describe.serial(`@${combo.w}-${combo.theme}`, () => {
    let page;
    test.beforeAll(async () => { page = await openContext(browser, combo); });
    test.afterAll(async () => { await page.context().close(); });
    for (const s of scenes) {
      if (VISUAL ? !s.png : !main) continue;
      test(s.id, async () => {
        const { html, json } = await runScene(page, s, target);
        if (!VISUAL) {
          const hf = path.join(BASE, 'html', s.id + '.html'), jf = path.join(BASE, 'json', s.id + '.json');
          if (UPDATE) { wr(hf, html); wr(jf, j(json)); }
          else {
            expect(rd(hf), 'HTML 기준 없음: ' + s.id).not.toBeNull();
            expect(html === rd(hf), 'HTML 이 기준과 다름').toBe(true);
            expect(j(json) === rd(jf), '집계 JSON 이 기준과 다름').toBe(true);
          }
          if (s.print) printNow[s.id] = await printPages(page);
        }
        if (VISUAL && s.png) {
          const buf = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide', type: 'jpeg', quality: 80 });
          expect(buf).toMatchSnapshot(`${s.id}@${combo.w}-${combo.theme}.jpg`, { maxDiffPixelRatio: 0 });
        }
      });
    }
  });
}

test('인쇄 쪽수(내담자용 3쪽·상담사용 5쪽, fitSheets 적용 상태)', async () => {
  test.skip(!!only || VISUAL, '일부 화면만 실행 중이거나 캡처 모드');
  if (UPDATE) { wr(printFile, j(printNow)); return; }
  const want = JSON.parse(rd(printFile) || '{}');
  expect(printNow).toEqual(want);
  for (const [id, v] of Object.entries(printNow)) expect(v.pages, id).toBe(id.startsWith('res-p-') ? 3 : 5);
});

test('CSS 규칙 지문(규칙 수·해시)', async () => {
  test.skip(!!only || VISUAL, '일부 화면만 실행 중이거나 캡처 모드');
  const page = await openContext(browser, { w: 1100, theme: 'light' });
  const fp = await cssFingerprint(page, target);
  await page.context().close();
  const f = path.join(BASE, 'css-fingerprint.json');
  if (UPDATE) { wr(f, j(fp)); return; }
  expect(fp).toEqual(JSON.parse(rd(f)));
});
