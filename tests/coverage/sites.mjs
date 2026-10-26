// 단계 1b 치환 지점 목록과, 각 지점을 실행한 테스트를 커버리지 기록(COV_OUT JSONL)에서 계산한다.
// 사용: COV_OUT=경로 TARGET_HTML=src/index.html npx playwright test tests/golden tests/snapshot tests/e2e
//       node tests/coverage/sites.mjs 경로 [--md 출력.md]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILES = { html: 'src/index.html', cfg: 'src/js/02-eval-config.js', util: 'src/js/04-util.js', eng: 'src/js/05-engine.js' };

// [id, 파일, 바꾼 후(새 파일에서 찾는 문자열), 바꾸기 전, 설명]
const SITES = [
  ['S01', 'util', 'AREA_IDX.map(i=>toScore(sum(a.slice(i*ITEMS_PER_AREA,(i+1)*ITEMS_PER_AREA))))', '[0,1,2,3,4].map(i=>Math.round(((sum(a.slice(i*3,i*3+3))/3-1)/4*100)*10)/10)', 'areaScores 환산'],
  ['S02', 'eng', 'AREA_IDX.map(i=>sum(a.slice(i*ITEMS_PER_AREA,(i+1)*ITEMS_PER_AREA)))', '[0,1,2,3,4].map(i=>sum(a.slice(i*3,i*3+3)))', 'rawSums 영역 합계'],
  ['S03', 'eng', 'a.length===ITEM_COUNT&&a.every(v=>v>=SCALE_MIN&&v<=SCALE_MAX)', 'a.length===15&&a.every(v=>v>=1&&v<=5)', 'full 응답 완료 판정'],
  ['S04', 'html', 'Array(ITEM_COUNT)', 'Array(15)', '빈 응답 배열 (emptyP · answer · wDiag · 자체 검증 4곳)'],
  ['S05', 'html', 'Array.from({length:ITEM_COUNT}', 'Array.from({length:15}', '시드 데모 응답 · C_CODES'],
  ['S06', 'html', '${n} / ${ITEM_COUNT} 문항 응답', '${n} / 15 문항 응답', '응답 수 표시 문구(사전 진단 · 사후 진단)'],
  ['S07', 'html', 'width:${n/ITEM_COUNT*100}%', 'width:${n/15*100}%', '사후 진단 진행바 폭'],
  ['S08', 'html', ":ITEM_COUNT)+'개 있습니다.'", ":15)+'개 있습니다.'", 'toSat 미응답 개수 오류 문구'],
  ['S09', 'html', 'GRADE_TICKS.forEach', '[0,33.3,58.3,83.3,100].forEach', 'barsSVG 눈금'],
  ['S10', 'html', '${BAL_Y_TICKS.map(', '${[0,20,40,60,80,100].map(', '밸런스 차트 Y축 숫자'],
  ['S11', 'html', '${BAL_Y_LEVELS.map(', "${[['높음',91],['다소<br>높음',70],['보통',45],['다소<br>낮음',17]].map(", '밸런스 차트 Y축 판정 라벨 위치'],
  ['S12', 'html', 'cv=r=>toScore(r).toFixed(1),b=[[RAW_MIN,c[0]],[c[0]+1,c[1]],[c[1]+1,c[2]],[c[2]+1,RAW_MAX]]', 'cv=r=>(Math.round((r-3)*100/12*10)/10).toFixed(1),b=[[3,c[0]],[c[0]+1,c[1]],[c[1]+1,c[2]],[c[2]+1,15]]', 'bandCells 평가기준표(상담사용 5쪽)'],
  ['S13', 'html', "s1[i]+' / '+gradeOf(i,rawSums(x1)[i])", "s1[i]+' / '+level(s1[i])", '자체 검증 Result 5행 판정(level 대체)'],
  ['S14', 'html', "const v=toScore(r);add('평가기준 C22:E34','원점수 '+r+' ('+v+'점)',C22E34[r],gradeOf(0,r))", "const v=Math.round((r-3)*100/12*10)/10;add('평가기준 C22:E34','원점수 '+r+' ('+v+'점)',labelRaw(r),level(v))", '자체 검증 C22:E34 13항목(labelRaw·level 대체)'],
  ['S15', 'html', "const C22E34={3:'다소 낮음'", '(없음)', 'C22E34 고정 표 정의(신규)'],
  ['S16', 'html', 'sum(arr.slice(i*ITEMS_PER_AREA,(i+1)*ITEMS_PER_AREA))', 'sum(arr.slice(i*3,i*3+3))', 'rawA 사전사후 영역 원점수'],
  ['S17', 'html', '평균 합계 (${AREA_COUNT*RAW_MAX}점)', '평균 합계 (75점)', '사전사후 결과 타일 문구(사전·사후 2곳)'],
  ['S18', 'html', '영역별 원점수(${RAW_MAX}점 만점 기준)', '영역별 원점수(15점 만점 기준)', '사전사후 결과 안내 문구'],
  ['S19', 'html', 'max:RAW_MAX,step:1,top,pt:50', 'max:15,step:1,top,pt:50', '사전사후 결과 차트 최대값'],
  ['S20', 'html', '요인은 ${SCALE_MAX}점 평균, 종합은 영역별 원점수(${RAW_MAX}점 만점) 기준', '요인은 5점 평균, 종합은 영역별 원점수(15점 만점) 기준', '사전사후 상세 안내 문구'],
];
const REMOVED = [
  ['R1', 'util', 'function level(v){…}', '제거', '자체 검증 2곳이 gradeOf 로 대체(S13·S14). 골든 conversion 은 필드 제거.'],
  ['R2', 'eng', 'const labelRaw=…', '제거', '자체 검증 C22E34 표로 대체(S14).'],
];
// 정의(로드 시 실행) — 02-eval-config.js 상수
const DEFS = ['AREA_COUNT=5,ITEMS_PER_AREA=3', 'const ITEM_COUNT', 'const RAW_MIN', 'const AREA_IDX', 'const toScore', 'const GRADE_TICKS', 'const BAL_Y_TICKS', 'const BAL_Y_LEVELS'];

const covFile = process.argv[2];
const mdOut = process.argv.includes('--md') ? process.argv[process.argv.indexOf('--md') + 1] : null;
const lines = fs.readFileSync(covFile, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const text = k => fs.readFileSync(path.join(root, FILES[k]), 'utf8');
const T = { html: text('html'), cfg: text('cfg'), util: text('util'), eng: text('eng') };
const inlineStart = T.html.indexOf('<script>\n') + '<script>'.length;
const lineOf = (k, off) => T[k].slice(0, off).split('\n').length;

// 한 항목(라벨)에서 offset 이 실행됐는지: 해당 스크립트의 범위 중 offset 을 포함하는 가장 좁은 범위의 count > 0, 어느 로드든 하나라도.
function hit(entries, k, off) {
  const rel = k === 'html' ? off - inlineStart : off;
  for (const e of entries) {
    const isHtml = /\/(?:index\.html)?$/.test(e.url), isThis = k === 'html' ? isHtml : e.url.endsWith(FILES[k].replace('src/', ''));
    if (!isThis) continue;
    let best = null;
    for (const [s, en, c] of e.ranges) if (s <= rel && rel < en && (!best || en - s <= best[1] - best[0])) best = [s, en, c];
    if (best && best[2] > 0) return true;
  }
  return false;
}
const group = l => l.startsWith('snapshot:') ? 'snapshot' : l.startsWith('e2e:') ? 'e2e' : 'golden';
const out = [];
for (const [id, k, after, before, desc] of SITES) {
  let from = 0, n = 0;
  while ((from = T[k].indexOf(after, from)) >= 0) {
    n++;
    const tests = lines.filter(l => hit(l.entries, k, from + Math.min(after.length - 1, 10))).map(l => l.label);
    out.push({ id: n > 1 || (T[k].indexOf(after, from + 1) >= 0) ? id + '-' + n : id, file: FILES[k], line: lineOf(k, from), before, after: after.length > 60 ? after.slice(0, 57) + '…' : after, desc, tests });
    from += after.length;
  }
  if (!n) out.push({ id, file: FILES[k], line: '-', before, after, desc, tests: null });
}
const summarize = ts => {
  if (!ts.length) return '**미검증**';
  const g = { golden: [], snapshot: [], e2e: [] };
  ts.forEach(t => g[group(t)].push(t.replace(/^(snapshot|e2e|golden):/, '')));
  const part = (name, a) => a.length ? `${name} ${a.length}건` + (name === '스냅샷' ? `(${a.slice(0, 3).join(', ')}${a.length > 3 ? ' …' : ''})` : name === 'e2e' ? `(${a.map(x => x.match(/^(\d)/)?.[1]).join(',')}단계)` : '') : null;
  return [part('골든', g.golden), part('스냅샷', g.snapshot), part('e2e', g.e2e)].filter(Boolean).join(' · ');
};
const rows = out.map(o => ({ ...o, tests: o.tests === null ? null : summarize(o.tests), unverified: o.tests !== null && !o.tests.length }));
const unver = rows.filter(r => r.unverified || r.tests === null);
console.log('지점', rows.length, '미검증', unver.length);
rows.forEach(r => console.log(`${r.id}\t${r.file}:${r.line}\t${r.tests}`));
const defHit = DEFS.map(d => { const i = T.cfg.indexOf(d); return [d, i >= 0 ? hit(lines[0].entries, 'cfg', i) : null]; });
console.log('정의', JSON.stringify(defHit));
if (mdOut) {
  const esc = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const md = ['# 단계 1b 치환 지점과 실행 테스트', '', '`src/index.html`·`src/js/*` 기준 줄 번호. 실행 테스트는 V8 블록 커버리지(`COV_OUT`)로 측정했다. **실행됨은 단언됨과 다르다**(그 지점의 값이 정답표·스냅샷에 반영되는지는 별도).', '',
    '| ID | 파일:줄 | 바꾸기 전 | 바꾼 후 | 설명 | 실행하는 테스트 |', '|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.id} | ${r.file}:${r.line} | \`${esc(r.before)}\` | \`${esc(r.after)}\` | ${esc(r.desc)} | ${esc(r.tests)} |`),
    '', '## 제거된 함수', '', '| ID | 파일 | 대상 | 비고 |', '|---|---|---|---|', ...REMOVED.map(r => `| ${r[0]} | ${FILES[r[1]]} | ${esc(r[2])} | ${esc(r[4])} |`),
    '', '## 미검증', '', unver.length ? unver.map(r => `- ${r.id} (${r.file}:${r.line}) ${r.desc}`).join('\n') : '- 없음'];
  fs.writeFileSync(path.join(root, mdOut), md.join('\n') + '\n');
}
