// 단계 3 설계용 읽기 전용 조사. 앱 코드를 수정하지 않는다.
//  (A) 앱의 최상위 선언(함수/const/let)과 줄 범위·구역
//  (B) 테스트가 page.evaluate 등으로 접근하는 앱 전역 이름(종류·접근 방식·사용 파일)
//  (C) 템플릿 안 인라인 핸들러가 호출하는 함수 이름
//  (D) 호출 관계로 본 역할별 도달 가능성(공유/역할 전용 자동 제안 — 사람이 검토한다)
// 사용: node tests/tools/inventory-step3.mjs [--md docs/단계3-전역-핸들러-조사.md] [--json 출력.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');

// ---------- 문자열·주석·정규식 제거(위치 보존), 템플릿의 ${…} 식은 코드로 유지 ----------
export function codeOnly(s) {
  const out = s.split('');
  let i = 0;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  const prevSig = () => { for (let k = i - 1; k >= 0; k--) { if (!/\s/.test(out[k])) return out[k]; } return ''; };
  function readString(q) { let j = i + 1; while (j < s.length && s[j] !== q) { if (s[j] === '\\') j++; j++; } blank(i, j + 1); i = j + 1; }
  function readTemplate() {
    let j = i + 1, seg = i;
    while (j < s.length) {
      if (s[j] === '\\') { j += 2; continue; }
      if (s[j] === '`') { blank(seg, j + 1); i = j + 1; return; }
      if (s[j] === '$' && s[j + 1] === '{') { blank(seg, j + 2); i = j + 2; const end = run(true); seg = end; j = end + 1; continue; }
      j++;
    }
    blank(seg, s.length); i = s.length;
  }
  function run(untilBrace) {
    let depth = 0;
    while (i < s.length) {
      const c = s[i], n = s[i + 1];
      if (c === '/' && n === '/') { let j = i; while (j < s.length && s[j] !== '\n') j++; blank(i, j); i = j; continue; }
      if (c === '/' && n === '*') { const j = s.indexOf('*/', i + 2); const e = j < 0 ? s.length : j + 2; blank(i, e); i = e; continue; }
      if (c === '"' || c === "'") { readString(c); continue; }
      if (c === '`') { readTemplate(); continue; }
      if (c === '/') {
        const p = prevSig();
        if (p === '' || '(,=:[!&|?{};+-*%<>~^'.includes(p)) { // 정규식 리터럴
          let j = i + 1, cls = false;
          while (j < s.length && (s[j] !== '/' || cls) && s[j] !== '\n') { if (s[j] === '\\') j++; else if (s[j] === '[') cls = true; else if (s[j] === ']') cls = false; j++; }
          blank(i, j + 1); i = j + 1; while (/[a-z]/.test(s[i] || '')) { out[i] = ' '; i++; } continue;
        }
      }
      if (c === '{') depth++;
      if (c === '}') { if (untilBrace && depth === 0) return i; depth--; }
      i++;
    }
    return i;
  }
  run(false);
  return out.join('');
}
// 괄호 짝 찾기(code 는 codeOnly 결과)
function matchClose(code, open) {
  const pair = { '(': ')', '{': '}', '[': ']' }[code[open]]; let d = 0;
  for (let k = open; k < code.length; k++) { if (code[k] === code[open]) d++; else if (code[k] === pair && --d === 0) return k; }
  return -1;
}
const IDENT = /[A-Za-z_$][\w$]*/g;

// ---------- (A) 앱 최상위 선언 ----------
const APP_FILES = [
  ['src/data/feedback-comments.js', 'data'], ['src/data/feedback-keywords.js', 'data'],
  ['src/js/00-question-defs.js', 'js'], ['src/js/01-areas.js', 'js'], ['src/js/02-eval-config.js', 'js'], ['src/js/03-options.js', 'js'], ['src/js/04-util.js', 'js'], ['src/js/05-engine.js', 'js'],
];
const html = rd('src/index.html').split('\n');
const sStart = html.findIndex(l => l === '<script>') + 1, sEnd = html.lastIndexOf('</script>');
const sources = [...APP_FILES.map(([f, k]) => ({ file: f, lines: rd(f).split('\n'), base: 0, group: k })), { file: 'src/index.html#inline', lines: html.slice(sStart, sEnd), base: sStart, group: 'inline' }];
const decls = [];
for (const src of sources) {
  let section = '';
  const L = src.lines;
  const starts = [];
  L.forEach((l, i) => {
    const sec = /^\/\* -+ (.*?) -+ \*\//.exec(l); if (sec) section = sec[1];
    const fn = /^(?:async\s+)?function\s+([\w$]+)/.exec(l);
    const cv = /^(const|let|var)\s+(.*)$/.exec(l);
    if (fn) starts.push({ i, kind: 'function', names: [fn[1]], section });
    else if (cv) {
      let names = [];
      const head = cv[2];
      const m = /^([\w$]+(?:\s*=[^,;(){}\[\]]*)?(?:,\s*[\w$]+(?:\s*=[^,;(){}\[\]]*)?)*)\s*;/.exec(head);
      if (m && m[1].includes(',')) names = m[1].split(',').map(x => x.trim().split('=')[0].trim());
      else names = [/^([\w$]+)/.exec(head)[1]];
      starts.push({ i, kind: cv[1], names, section });
    }
  });
  // 줄 범위: 다음 최상위 문장(0열이 공백·닫는 괄호가 아닌 줄)까지
  const isStmt = l => l && !/^[\s}\])];?/.test(l);
  for (const st of starts) {
    let e = st.i + 1; while (e < L.length && !isStmt(L[e])) e++;
    // 끝의 빈 줄 제거
    let last = e - 1; while (last > st.i && !L[last].trim()) last--;
    const text = L.slice(st.i, last + 1).join('\n');
    for (const n of st.names) decls.push({ name: n, kind: st.kind, file: src.file, group: src.group, line: src.base + st.i + 1, endLine: src.base + last + 1, section: st.section, text });
  }
}
// 최상위 초기화 코드: 선언이 아닌 0열 문장(DB 초기화, 이벤트 리스너, IIFE, window 연결 등). 로드 시 모두 실행되므로 모든 역할의 뿌리로 본다.
{
  const src = sources[sources.length - 1], L = src.lines;
  const isStmt = l => l && !/^[\s}\])];?/.test(l) && !/^(\/\/|\/\*)/.test(l);
  const inDecl = i => decls.some(d => d.file === src.file && d.line - src.base - 1 <= i && i <= d.endLine - src.base - 1);
  for (let i = 0; i < L.length; i++) {
    if (!isStmt(L[i]) || inDecl(i)) continue;
    let e = i + 1; while (e < L.length && !isStmt(L[e]) && !/^(\/\/|\/\*)/.test(L[e])) e++;
    let last = e - 1; while (last > i && !L[last].trim()) last--;
    decls.push({ name: '(init@' + (src.base + i + 1) + ')', kind: 'init', file: src.file, group: 'inline', line: src.base + i + 1, endLine: src.base + last + 1, section: '', text: L.slice(i, last + 1).join('\n') });
  }
}
const byName = new Map(); decls.forEach(d => { if (byName.has(d.name)) console.error('중복 선언 이름:', d.name); byName.set(d.name, d); });
const appNames = new Set([...byName.keys()].filter(n => !n.startsWith('(init@')));
// window 에 직접 붙는 전역
const windowProps = [...rd('src/index.html').matchAll(/window\.(\w+)\s*=/g)].map(m => m[1]);

// ---------- (B) 테스트가 접근하는 전역 ----------
const TEST_FILES = ['tests/golden/collect.mjs', 'tests/contract/collect.mjs', 'tests/contract/defs.spec.mjs', 'tests/snapshot/scenes.mjs', 'tests/snapshot/capture.mjs', 'tests/snapshot/fixture.mjs', 'tests/snapshot/snapshot.spec.mjs', 'tests/e2e/roles.spec.mjs'];
const NAMED_REGIONS = ['inBrowser', 'buildFixture', 'extractNumbers'];
function pageRegions(file) {
  const raw = rd(file), code = codeOnly(raw), regs = [];
  for (const m of code.matchAll(/\.(evaluate|waitForFunction|evaluateHandle|\$eval|\$\$eval)\s*\(/g)) {
    const open = m.index + m[0].length - 1, close = matchClose(code, open);
    if (close > 0) regs.push({ kind: m[1], start: open, end: close });
  }
  for (const nm of NAMED_REGIONS) {
    const m = new RegExp('function\\s+' + nm + '\\s*\\(').exec(code);
    if (m) { const open = code.indexOf('{', m.index); const close = matchClose(code, open); regs.push({ kind: 'function ' + nm, start: open, end: close }); }
  }
  if (file.endsWith('scenes.mjs')) regs.push({ kind: 'scenes(전체)', start: 0, end: code.length });
  // 겹침 병합
  regs.sort((a, b) => a.start - b.start);
  const merged = []; for (const r of regs) { const l = merged[merged.length - 1]; if (l && r.start <= l.end) l.end = Math.max(l.end, r.end); else merged.push({ ...r }); }
  return { raw, code, regs: merged };
}
const droppedShadow = new Set();
const used = new Map(); // name -> {files:Set, call, read, assign, propAssign, kinds}
for (const f of TEST_FILES) {
  const { code, regs } = pageRegions(f);
  for (const r of regs) {
    const seg = code.slice(r.start, r.end);
    // 영역 안에서 로컬로 선언된 이름(겹침 표시용)
    const locals = new Set([...seg.matchAll(/\b(?:const|let|var)\s+([\w$]+)/g)].map(m => m[1]));
    // 함수·화살표 함수의 매개변수도 지역 이름으로 본다
    for (const m of seg.matchAll(/\(([^()]*)\)\s*=>|function\s*[\w$]*\s*\(([^()]*)\)|([\w$]+)\s*=>/g)) (m[1] ?? m[2] ?? m[3] ?? '').split(',').forEach(p => { const n = p.trim().replace(/^\.\.\./, '').split('=')[0].trim(); if (/^[\w$]+$/.test(n)) locals.add(n); });
    // 구조 분해 선언({ a, b } = …, [a, b] of …)의 이름
    for (const m of seg.matchAll(/\b(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g)) m[1].split(',').forEach(p => { const n = p.trim().split(':').pop().split('=')[0].trim(); if (/^[\w$]+$/.test(n)) locals.add(n); });
    for (const m of seg.matchAll(IDENT)) {
      const name = m[0]; if (!appNames.has(name)) continue;
      if (locals.has(name)) { droppedShadow.add(name + ' (' + f.replace('tests/', '') + ')'); continue; } // 지역 선언·매개변수와 이름이 같은 것은 앱 전역 접근이 아니라고 본다
      const before = seg[m.index - 1] === undefined ? '' : seg.slice(0, m.index).trimEnd().slice(-1);
      if (before === '.') continue; // 속성 접근
      const after = seg.slice(m.index + name.length);
      const nx = after.trimStart();
      if (/^:(?!:)/.test(nx) && /[{,]\s*$/.test(seg.slice(0, m.index))) continue; // 객체 리터럴 키
      const u = used.get(name) || { files: new Set(), call: 0, read: 0, assign: 0, propAssign: 0, localShadow: new Set() };
      u.files.add(f.replace('tests/', ''));
      if (/^\(/.test(nx)) u.call++; else if (/^=(?!=)/.test(nx)) u.assign++; else if (/^(\.|\[)[^=]*?=(?!=)/.test(nx.split(/[;\n]/)[0]) && /^(\.[\w$.]+|\[[^\]]*\])+\s*=(?!=)/.test(nx)) u.propAssign++; else u.read++;
      if (locals.has(name)) u.localShadow.add(f.replace('tests/', ''));
      used.set(name, u);
    }
  }
}
const kindRank = { function: 0, const: 1, let: 2, var: 3 };
const usedList = [...used.entries()].map(([name, u]) => ({ name, kind: byName.get(name).kind, group: byName.get(name).group, file: byName.get(name).file, files: [...u.files].sort(), call: u.call, read: u.read, assign: u.assign, propAssign: u.propAssign, shadow: [...u.localShadow] }))
  .sort((a, b) => kindRank[a.kind] - kindRank[b.kind] || a.name.localeCompare(b.name));

// ---------- (C) 인라인 핸들러 ----------
const htmlNoStyle = html.map((l, i) => ({ l, i })).filter(({ i }) => i < 6 || i > 430); // <style> 블록 제외
const handlerAttrs = []; // {line, event, raw, enclosing}
const declAt = ln => decls.filter(d => d.file === 'src/index.html#inline' && d.line <= ln && ln <= d.endLine).map(d => d.name)[0] || '(최상위 HTML)';
for (const { l, i } of htmlNoStyle) {
  for (const m of l.matchAll(/\bon(click|input|change|submit|keydown|keyup|focus|blur|mouseover|load|error)=(["'])((?:(?!\2).)*)\2/g)) {
    handlerAttrs.push({ line: i + 1, event: 'on' + m[1], raw: m[3], enclosing: declAt(i + 1) });
  }
}
// 속성 문자열은 각 줄에 닫는 따옴표가 있다고 가정(점검: 열린 on*= 개수와 비교)
const openCount = htmlNoStyle.reduce((a, { l }) => a + (l.match(/(?<![\w.$])on(?:click|input|change|submit|keydown|keyup|focus|blur|mouseover|load|error)=/g) || []).length, 0);
const KW = new Set(['if', 'for', 'while', 'switch', 'return', 'function', 'typeof', 'new', 'catch', 'event', 'this', 'window', 'document', 'JSON', 'Math', 'String', 'Number', 'Array', 'Object', 'Date']);
function handlerCalls(raw) {
  // ${…}(렌더 시점 식)는 제거하되, 문자열로 남는 호출(nav('…'))을 위해 한 번 더 원문도 본다
  const stripped = raw.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
  const names = new Set(), refs = new Set();
  for (const src of [stripped, raw]) {
    const c = codeOnly(src.replace(/'[^']*'/g, m => "'" + ' '.repeat(m.length - 2) + "'"));
    for (const m of c.matchAll(IDENT)) {
      const nm = m[0]; if (!appNames.has(nm) || KW.has(nm)) continue;
      const prev = c.slice(0, m.index).trimEnd().slice(-1); if (prev === '.') continue;
      const nx = c.slice(m.index + nm.length).trimStart();
      if (/^\(/.test(nx)) names.add(nm); else refs.add(nm);
    }
  }
  return { names: [...names], refs: [...refs] };
}
const handlerFns = new Map(); // name -> {count, by:Set(enclosing), events:Set}
const handlerRefs = new Map();
const templated = [];
for (const h of handlerAttrs) {
  const hasTpl = h.raw.includes('${');
  const { names, refs } = handlerCalls(h.raw);
  for (const n of names) { const e = handlerFns.get(n) || { count: 0, by: new Set(), events: new Set() }; e.count++; e.by.add(h.enclosing); e.events.add(h.event); handlerFns.set(n, e); }
  for (const n of refs) { const e = handlerRefs.get(n) || { count: 0, by: new Set() }; e.count++; e.by.add(h.enclosing); handlerRefs.set(n, e); }
  if (hasTpl) templated.push(h);
}
const handlerList = [...handlerFns.entries()].map(([name, e]) => ({ name, kind: byName.get(name).kind, count: e.count, events: [...e.events], by: [...e.by] })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
const handlerRefList = [...handlerRefs.entries()].map(([name, e]) => ({ name, kind: byName.get(name).kind, count: e.count })).sort((a, b) => b.count - a.count);

// ---------- (D) 호출 관계와 역할별 도달 ----------
// 정적 의존: 함수 본문(문자열 속 핸들러 호출 포함)에 다른 최상위 이름이 나타나면 간선. 시작 코드(init)는 따로 둔다.
const wordRe = new Map(); appNames.forEach(n => wordRe.set(n, new RegExp('(?<![\\w$.])' + n.replace(/\$/g, '\\$') + '(?![\\w$])')));
const inits = decls.filter(d => d.kind === 'init');
const edges = new Map();
for (const d of decls) {
  const set = new Set();
  for (const n of appNames) { if (n === d.name) continue; if (d.group !== 'inline' && byName.get(n).group === 'inline') continue; if (wordRe.get(n).test(d.text)) set.add(n); }
  edges.set(d.name, set);
}
const VIEWS = ['vLogin', 'vHome', 'vWizard', 'vResult', 'vForm', 'vAdmin', 'vCns', 'vClogin', 'vCdash'];
const VIEW_OF = { login: 'vLogin', home: 'vHome', wizard: 'vWizard', result: 'vResult', form: 'vForm', admin: 'vAdmin', cns: 'vCns', clogin: 'vClogin', cdash: 'vCdash' };
// render 의 V 맵(화면 이름 → 뷰 함수)은 진입점마다 달라지므로 정적 간선에서 제외한다. setMode·goHome 은 역할 전환(데모)이라 제외.
['render', 'setMode', 'goHome'].forEach(r => VIEWS.forEach(v => edges.get(r)?.delete(v)));
// 화면 전환 문자열: nav('result'), S.view='cns' → 그 화면을 진입점이 등록해야 한다(레지스트리 조회). setMode·goHome·render·시작 코드는 제외.
const navTargets = new Map(); // 함수 -> Set(view 함수)
for (const d of decls) {
  if (['setMode', 'goHome', 'render'].includes(d.name) || d.kind === 'init') continue;
  const t = new Set();
  for (const m of d.text.matchAll(/nav\(\s*['"](\w+)['"]\s*\)|S\.view\s*=\s*['"](\w+)['"]/g)) { const v = VIEW_OF[m[1] || m[2]]; if (v) t.add(v); }
  if (t.size) navTargets.set(d.name, t);
}
const ROLE_ROOTS = { participant: ['vLogin', 'vHome', 'vWizard'], counselor: ['vCns'], admin: ['vAdmin'], manager: ['vClogin', 'vCdash'] };
const CORE = ['render', 'nav', 'save'];
const closure = (roots) => { const seen = new Set(), q = [...roots]; while (q.length) { const n = q.pop(); if (seen.has(n) || !edges.has(n)) continue; seen.add(n); edges.get(n).forEach(x => q.push(x)); } return seen; };
// 진입점이 등록하는 화면(제안, 코드 읽기로 정함): 참여자는 로그인·홈·마법사, 상담사·관리자는 자기 화면 + 결과 + 마법사(응답 수정), 고객사는 로그인·대시보드.
const REGISTERED = { participant: ['vLogin', 'vHome', 'vWizard'], counselor: ['vCns', 'vResult', 'vWizard'], admin: ['vAdmin', 'vResult', 'vWizard'], manager: ['vClogin', 'vCdash'] };
const entries = {};
for (const [role, roots] of Object.entries(ROLE_ROOTS)) {
  // (참고) 화면 전환 문자열로 닫은 집합: 공유 코드가 가리키는 모든 화면까지 넣은 과대 추정
  let views = new Set(roots), cl;
  for (;;) { cl = closure([...views, ...CORE]); const before = views.size; for (const fn of cl) (navTargets.get(fn) || []).forEach(v => views.add(v)); if (views.size === before) break; }
  const closedViews = [...views];
  // 제안 집합: 등록 화면에서 시작한 정적 의존만 진입점 코드로 본다
  const reg = REGISTERED[role];
  const own = closure([...reg, ...CORE]);
  // 이 진입점 코드가 문자열로 가리키지만 등록하지 않는 화면(공유 코드가 다른 역할 화면 이름을 쓰는 곳)
  const cross = [];
  for (const fn of own) for (const v of (navTargets.get(fn) || [])) if (!reg.includes(v)) cross.push([fn, v]);
  entries[role] = { roots, registered: reg, closedViews, closure: own, cross };
}
const placement = [];
for (const d of decls) {
  if (d.group !== 'inline' || d.kind === 'init') continue;
  const roles = Object.keys(entries).filter(r => entries[r].closure.has(d.name));
  placement.push({ name: d.name, kind: d.kind, line: d.line, lines: d.endLine - d.line + 1, section: d.section, roles });
}
const unreached = placement.filter(p => !p.roles.length);
const pc = {};
placement.forEach(p => { const k = p.roles.length === 0 ? '(미도달)' : p.roles.length === 1 ? p.roles[0] + ' 전용' : p.roles.length === 4 ? '공유(4역할)' : '공유(' + p.roles.join('+') + ')'; (pc[k] = pc[k] || []).push(p); });
const initRefs = inits.map(d => ({ at: d.line, text: d.text.split('\n')[0].slice(0, 90), refs: [...appNames].filter(n => wordRe.get(n).test(d.text)) }));
const entrySummary = Object.fromEntries(Object.entries(entries).map(([r, e]) => [r, { registered: e.registered, closedViews: e.closedViews, functions: [...e.closure].filter(n => byName.get(n)?.group === 'inline').length, cross: e.cross.map(([a, b]) => a + '→' + b) }]));

// ---------- 출력 ----------
const result = {
  decl: { total: decls.length, byKind: Object.fromEntries(['function', 'const', 'let'].map(k => [k, decls.filter(d => d.kind === k).length])), byGroup: Object.fromEntries(['data', 'js', 'inline'].map(k => [k, decls.filter(d => d.group === k).length])), windowProps },
  tests: { files: TEST_FILES, names: usedList },
  handlers: { attrs: handlerAttrs.length, openCount, templated: templated.length, functions: handlerList, stateRefs: handlerRefList },
  placement: Object.fromEntries(Object.entries(pc).map(([k, v]) => [k, v.map(x => x.name)])),
  unreached: unreached.map(u => u.name),
  entries: entrySummary, initRefs,
};
if (process.argv.includes('--json')) fs.writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify({ ...result, handlerAttrs, templated, placementDetail: placement }, null, 1));
if (process.argv.includes('--md')) {
  const f = process.argv[process.argv.indexOf('--md') + 1];
  const L = [];
  const kinds = k => usedList.filter(u => u.kind === k);
  L.push('# 단계 3 설계용 조사 (읽기 전용, 자동 생성)', '', '생성: `node tests/tools/inventory-step3.mjs --md docs/단계3-전역-핸들러-조사.md` (기준: 작업본 `src`, 커밋 `step-2c`). 앱 코드는 수정하지 않았다. 문자열·주석·정규식을 걷어낸 뒤 식별자를 읽는 방식이라 완전한 파서는 아니다. 한계는 마지막 장에 적었다.', '');
  L.push('## 1. 앱 최상위 선언', '', `- 전체 ${result.decl.total}개: 함수 ${result.decl.byKind.function}, const ${result.decl.byKind.const}, let ${result.decl.byKind.let}`, `- 위치: 데이터 파일 ${result.decl.byGroup.data}, \`src/js/*.js\` ${result.decl.byGroup.js}, \`index.html\` 인라인 ${result.decl.byGroup.inline}`, `- \`window\`에 직접 붙이는 것: ${windowProps.map(w => '`window.' + w + '`').join(', ')}`, '');
  L.push('## 2. 테스트가 접근하는 앱 전역 이름', '', `대상 파일: ${TEST_FILES.map(x => '`' + x.replace('tests/', '') + '`').join(', ')}. \`page.evaluate\`·\`waitForFunction\`·이름 있는 in-page 함수(\`inBrowser\`, \`buildFixture\`, \`extractNumbers\`)와 \`scenes.mjs\` 전체를 in-page 코드로 보고 읽었다.`, '',
    `**합계 ${usedList.length}개** — 함수 ${kinds('function').length}, const ${kinds('const').length}, let ${kinds('let').length}`, '',
    '단계 3에서 모듈로 바꾸면 이 이름은 모두 전역이 아니게 되어 **접근이 깨진다**(어댑터 필요). 표의 "대입" 열이 0이 아닌 이름은 모듈 안의 바인딩과 `window` 값이 갈라질 수 있어 특히 주의한다.', '',
    '| 이름 | 종류 | 정의 위치 | 호출 | 읽기 | 대입 | 속성 대입 | 사용 파일 | 비고 |', '|---|---|---|---|---|---|---|---|---|',
    ...usedList.map(u => `| \`${u.name}\` | ${u.kind} | ${u.file.replace('src/', '')} | ${u.call} | ${u.read} | ${u.assign} | ${u.propAssign} | ${u.files.join(', ')} | ${[u.kind === 'let' ? '**let(재대입 가능)**' : '', u.assign ? '**재대입**' : '', u.shadow.length ? '로컬 선언과 이름 겹침 확인 필요: ' + u.shadow.join(',') : ''].filter(Boolean).join(' · ')} |`), '');
  L.push(`지역 선언·매개변수와 이름이 겹쳐 **제외한 이름**: ${[...droppedShadow].sort().join(', ') || '없음'} (앱 전역 접근이 아니라고 판단, 오탐 방지)`, '', '테스트가 `window`의 앱 속성도 직접 읽는다: ' + windowProps.map(w => '`window.' + w + '`').join(', ') + ' (contract 수집기).', '');
  L.push('## 3. 인라인 핸들러', '', `- 템플릿·정적 HTML의 \`on*=\` 속성 ${handlerAttrs.length}개(열린 \`on*=\` ${openCount}개와 ${handlerAttrs.length === openCount ? '일치' : '**불일치 — 확인 필요**'}), 이 중 \`\${…}\` 식을 포함한 것 ${templated.length}개`, `- 핸들러가 호출하는 앱 함수 **${handlerList.length}개**`, `- 핸들러 코드가 직접 읽는 앱 상태·상수 **${handlerRefList.length}개**: ${handlerRefList.map(x => '`' + x.name + '`(' + x.count + ')').join(', ')}`, '',
    '| 함수 | 종류 | 속성 수 | 이벤트 | 들어 있는 화면 함수 |', '|---|---|---|---|---|',
    ...handlerList.map(h => `| \`${h.name}\` | ${h.kind} | ${h.count} | ${h.events.join(',')} | ${h.by.slice(0, 4).join(', ')}${h.by.length > 4 ? ' 외 ' + (h.by.length - 4) : ''} |`), '',
    '### `${…}` 식을 포함한 핸들러 속성(수동 확인 대상)', '', ...templated.map(h => `- ${h.line}행 \`${h.event}\` (${h.enclosing}): \`${h.raw.slice(0, 140).replace(/`/g, "'")}\``), '');
  L.push('## 4. 호출 관계로 본 역할별 도달 (자동 제안)', '', '뿌리: 참여자 `vLogin·vHome·vWizard`, 상담사 `vCns`, 관리자 `vAdmin`, 고객사 `vClogin·vCdash` + 공통 `render·nav·save`. `render`의 화면 맵과 `setMode`·`goHome`은 진입점마다 달라지므로 간선에서 제외했다. 호출은 함수 본문(문자열 안의 핸들러 호출 포함)에서 이름을 찾아 판정했다. **사람이 검토하는 초안이다.**', '');
  for (const [k, v] of Object.entries(pc).sort()) L.push(`- **${k}** (${v.length}개): ${v.map(x => '`' + x.name + '`').join(', ')}`);
  L.push('', '### 진입점별 등록 화면(제안)과 필요한 인라인 함수 수', '',
    '"등록 화면"은 코드를 읽고 정한 제안이다(참여자: 로그인·홈·마법사 / 상담사·관리자: 자기 화면 + 결과 + 마법사(응답 수정) / 고객사: 로그인·대시보드). "닫힌 집합"은 화면 전환 문자열(`nav(\'home\')` 등)이 가리키는 화면을 모두 더한 과대 추정이다.', '',
    '| 진입점 | 등록 화면(제안) | 닫힌 집합(참고) | 필요한 인라인 함수 수 |', '|---|---|---|---|',
    ...Object.entries(entrySummary).map(([r, e]) => `| ${r} | ${e.registered.join(', ')} | ${e.closedViews.join(', ')} | ${e.functions} |`), '',
    '### 등록하지 않는 화면을 문자열로 가리키는 곳(공유 코드가 다른 역할 화면 이름을 쓰는 곳 — 위험 목록)', '',
    ...Object.entries(entrySummary).map(([r, e]) => `- **${r}**: ${e.cross.length ? e.cross.map(c => '`' + c + '`').join(', ') : '없음'}`), '',
    '### 시작 코드(최상위 초기화 문장)와 참조하는 이름', '',
    ...initRefs.map(x => `- ${x.at}행 \`${x.text.replace(/`/g, "'")}\` → ${x.refs.slice(0, 12).map(n => '`' + n + '`').join(', ') || '(없음)'}${x.refs.length > 12 ? ' 외 ' + (x.refs.length - 12) : ''}`), '',
    `### 미도달 ${unreached.length}개 설명`, '', '- 시작 코드·이벤트 리스너에서만 부르는 것: `seedEnt`, `DEFMG`, `fitSheets`, `reportOn`', '- 진입점 전환(데모): `setMode`, `goHome`', '- 앱 안에서 부르는 곳이 없는 것(죽은 코드로 보임): `selEtc`, `wDiag_pre_unused`, `vForm`, `vForm_disabled`, `openRes`(테스트의 화면 시나리오가 `openRes`를 직접 호출한다)', '',
    '참고: 이름이 본문에 나타나는지로 간선을 만들기 때문에, 함수의 지역 변수·매개변수와 이름이 겹치면 가짜 간선이 생긴다(예: `forestSVG`의 매개변수 `seed`가 `seed()`로 잡혀 `seed`가 참여자·고객사 공유로 나옴).', '');
  L.push('', '## 5. 조사의 한계', '', '- 식별자 추출은 정규식 기반 토크나이저라 정규식 리터럴·중첩 템플릿에서 드물게 틀릴 수 있다.', '- 테스트의 in-page 코드와 Node 쪽 코드를 영역 단위로 나눴으므로, 같은 이름의 Node 쪽 변수는 제외되지만 in-page 영역 안의 로컬 변수와 이름이 겹치면 "비고"에 표시한다.', '- 호출 관계는 이름이 본문에 나타나는지로 판정하므로 문자열 속 같은 단어도 간선이 될 수 있다(과대 추정). 문자열로만 호출되는 핸들러는 포함된다.', '');
  fs.writeFileSync(path.join(root, f), L.join('\n'));
}
console.log(JSON.stringify({ decl: result.decl, testNames: { total: usedList.length, function: usedList.filter(u => u.kind === 'function').length, const: usedList.filter(u => u.kind === 'const').length, let: usedList.filter(u => u.kind === 'let').length }, handlers: { attrs: handlerAttrs.length, openCount, templated: templated.length, functions: handlerList.length, stateRefs: handlerRefList.length }, placementCounts: Object.fromEntries(Object.entries(pc).map(([k, v]) => [k, v.length])), unreached: unreached.length }, null, 1));
