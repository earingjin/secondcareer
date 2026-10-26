// 한 화면을 렌더하고 HTML·집계 JSON·(선택) 인쇄 쪽수·캡처를 얻는다.
import fs from 'node:fs';
import { toUrl } from '../lib/target.mjs';
import { newPage, LEGACY_HTML } from '../golden/collect.mjs';
import { FIXTURE_FILE } from './fixture.mjs';

export const COMBOS = [375, 768, 1100].flatMap(w => ['light', 'dark'].map(theme => ({ w, theme })));
export const FIXTURE_JSON = () => fs.readFileSync(FIXTURE_FILE, 'utf8');

// 컨텍스트(너비·테마별) 생성. 시계·난수 고정 + 고정 입력 데이터를 로컬 저장소에 먼저 넣는다.
export async function openContext(browser, { w, theme }, now) {
  const page = await newPage(browser, { now, viewport: { width: w, height: 900 } });
  const ctx = page.context();
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  const fx = FIXTURE_JSON();
  await ctx.addInitScript(`try{localStorage.setItem('sp-demo-v5', ${JSON.stringify(fx)})}catch(e){}`);
  return page;
}

// 화면 안의 집계 숫자(평균·비율·건수)를 구조로 뽑는다. 화면이 계산한 값을 그대로 읽는다.
function extractNumbers() {
  const root = document.querySelector('#app');
  const T = el => el.textContent.replace(/\s+/g, ' ').trim();
  const q = (sel, f) => [...root.querySelectorAll(sel)].map(f);
  return {
    tiles: q('.tile', T),
    tables: q('table', t => [...t.rows].map(r => [...r.cells].map(T))),
    hbrows: q('.hbrow', T),
    legends: q('.legend', T),
    pieLabels: q('.pie-lab, .dn-lab, .rtitle, .rbase', T),
    svg: q('svg[aria-label]', s => ({
      label: s.getAttribute('aria-label'),
      texts: [...s.querySelectorAll('text')].map(T),
      heights: [...s.querySelectorAll('rect[height]')].map(r => Math.round(+r.getAttribute('height') * 100) / 100),
      dash: [...s.querySelectorAll('circle[stroke-dasharray]')].map(c => c.getAttribute('stroke-dasharray')),
    })),
    stacked: q('.stk span', s => (s.getAttribute('title') || '') + ' | ' + s.style.width),
    levels: q('.myres .lv, .g-l', T),
    bars: q('.bal-col .bb em', T),
    comment: q('.cmt-b', T),
    keywords: q('.kw p', T),
    sheets: root.querySelectorAll('section.sheet').length,
    printSheets: [...root.querySelectorAll('section.sheet')].filter(s => !s.classList.contains('noprintpage')).length,
    unsureNote: q('.unsure', T),
    misc: q('.progressbar span', s => s.style.width),
  };
}

const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

export async function runScene(page, scene, htmlPath = LEGACY_HTML) {
  await page.goto(toUrl(htmlPath));
  await page.waitForFunction(() => typeof render === 'function' && !!document.querySelector('#app').innerHTML);
  await page.evaluate(scene.run, scene.arg);
  await settle(page);
  await page.evaluate(() => { const t = document.querySelector('#toast'); if (t) t.classList.remove('on'); window.scrollTo(0, 0); });
  const html = await page.evaluate(() => {
    const nice = s => s.replace(/></g, '>\n<');
    return nice(document.querySelector('header.nav').outerHTML) + '\n' + nice(document.querySelector('#app').innerHTML) + '\n';
  });
  const json = await page.evaluate(extractNumbers);
  return { html, json };
}

// 인쇄 쪽수: 인쇄 미디어로 바꾸면 앱의 fitSheets 가 동작한다. PDF 쪽수는 Pages 개체의 /Count 로 읽는다.
export async function printPages(page) {
  await page.emulateMedia({ media: 'print' });
  await settle(page);
  await page.evaluate(() => fitSheets(true)); // beforeprint 와 같은 동작. 미디어 전환 이벤트는 타이밍이 흔들려 직접 호출한다
  const fit = await page.evaluate(() => [...document.querySelectorAll('.sheet')].filter(e => e.style.zoom || e.style.width).length);
  const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: null });
  const s = buf.toString('latin1');
  const counts = [...s.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g)].map(m => +m[1]).concat([...s.matchAll(/\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/g)].map(m => +m[1]));
  const pageObjs = (s.match(/\/Type\s*\/Page[^s]/g) || []).length;
  return { pages: counts.length ? Math.max(...counts) : null, pageObjects: pageObjs, fitSheetsApplied: fit };
}

// CSS 규칙 지문: 적용된 모든 규칙의 cssText 를 순서대로 이어 해시한다. CSS 를 파일로 옮겨도 규칙이 같으면 같다.
export async function cssFingerprint(page, htmlPath = LEGACY_HTML) {
  await page.goto(toUrl(htmlPath));
  return page.evaluate(async () => {
    const rules = [];
    for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) rules.push(r.cssText); } catch (e) { rules.push('BLOCKED'); } }
    const text = rules.join('\n');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return { rules: rules.length, chars: text.length, sha256: [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('') };
  });
}
