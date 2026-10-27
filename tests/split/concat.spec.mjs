// 단계 1a 증명: src/js 의 분할 파일을 로드 순서대로 원래 자리에 되돌리면 legacy 와 한 글자도 다르지 않다.
// 제외 방식: 각 분할 파일의 첫 줄(`// src/js/…` 헤더 주석) 한 줄만 제거한다. 그 외 내용은 모두 비교 대상이다.
// 비교는 문서 전체(src/index.html 에서 외부 스크립트 태그를 본문으로 되돌린 결과 === legacy 전체)로 한다.
// 주의: 1b 부터 src 는 승인된 변경(config 상수화 등)으로 legacy 와 의도적으로 달라진다. 내용 동일성 검사 2건은
// 1a 시점(커밋 63e805c) 증명이므로 SPLIT_STRICT=1 일 때만 실행한다. 구조 검사 2건은 항상 실행한다.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTarget, toUrl } from '../lib/target.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const legacy = fs.readFileSync(path.join(root, 'legacy/index.original.html'), 'utf8');
const src = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const RE = /((?:<script src="js\/[^"]+"><\/script>\n)+)<script>\n/g;

const matches = [...src.matchAll(RE)];
const files = matches.length ? [...matches[0][1].matchAll(/src="(js\/[^"]+)"/g)].map(m => m[1]) : [];
const body = f => { const t = fs.readFileSync(path.join(root, 'src', f), 'utf8'); const i = t.indexOf('\n'); return { head: t.slice(0, i), text: t.slice(i + 1) }; };

const moduleImports = text => [...text.matchAll(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"];?/gm)].map(m=>m[1]);
const resolveImport = (from,spec) => path.resolve(path.dirname(from),spec);

test('단일 ES 모듈 진입점의 정적 import 그래프가 끊김·고아·순환 없이 src/js·src/data 전체를 포함한다', () => {
  expect(src.match(/<script\s+type="module">/g)||[]).toHaveLength(1);
  expect(src).not.toMatch(/<script\s+src="(?:js|data)\//);
  const inline=/<script\s+type="module">([\s\S]*?)<\/script>/.exec(src);
  expect(inline).not.toBeNull();
  const entry=path.join(root,'src','index.html'),seen=new Set(),visiting=new Set();
  const walk=(file,text)=>{
    if(visiting.has(file))throw new Error('module 순환: '+file);
    if(seen.has(file))return;
    visiting.add(file);
    for(const spec of moduleImports(text)){
      expect(spec,file).toMatch(/^\.\.?\//);
      const dep=resolveImport(file,spec);
      expect(fs.existsSync(dep),`${file} -> ${spec}`).toBe(true);
      walk(dep,fs.readFileSync(dep,'utf8'));
    }
    visiting.delete(file);seen.add(file);
  };
  walk(entry,inline[1]);
  const expected=['js','data'].flatMap(d=>fs.readdirSync(path.join(root,'src',d)).filter(f=>f.endsWith('.js')).map(f=>path.join(root,'src',d,f))).sort();
  expect([...seen].filter(f=>f!==entry).sort()).toEqual(expected);
});

test('테스트 전역 82개·인라인 핸들러 59개·live 상태·SecondPlanning 호환', async ({page}) => {
  const compat=fs.readFileSync(path.join(root,'src/js/06-legacy-globals.js'),'utf8');
  const namesOf=label=>[...new RegExp(`const ${label}=\\[([\\s\\S]*?)\\];`).exec(compat)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
  const testNames=namesOf('TEST_GLOBAL_NAMES'),handlerNames=namesOf('HANDLER_GLOBAL_NAMES');
  expect(testNames).toHaveLength(82);expect(handlerNames).toHaveLength(59);
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(toUrl(resolveTarget()));
  const result=await page.evaluate(({testNames,handlerNames})=>{
    const typeOf=name=>{try{return (0,eval)('typeof '+name)}catch(e){return 'ERR '+e.name}};
    const moduleMode=!!document.querySelector('script[type="module"]');
    const before={DB,ENT,COUNSELORS};
    const db=[],ent=[],counselors={};DB=db;ENT=ent;COUNSELORS=counselors;
    const live={DB:DB===db,ENT:ENT===ent,COUNSELORS:COUNSELORS===counselors};
    if(moduleMode)Object.assign(live,{windowDB:window.DB===db,windowENT:window.ENT===ent,windowCOUNSELORS:window.COUNSELORS===counselors,stateSame:S===window.S});
    DB=before.DB;ENT=before.ENT;COUNSELORS=before.COUNSELORS;
    return {moduleMode,missingTests:testNames.filter(n=>typeOf(n)==='undefined'||typeOf(n).startsWith('ERR ')),missingHandlers:handlerNames.filter(n=>typeOf(n)!=='function'||(moduleMode&&typeof window[n]!=='function')),live,secondPlanning:{type:typeof window.SecondPlanning,keys:Object.keys(window.SecondPlanning||{}).sort()}};
  },{testNames,handlerNames});
  expect(errors).toEqual([]);
  if(result.moduleMode)expect(result.missingTests).toEqual([]);
  else expect(result.missingTests.sort()).toEqual(['AREA_COUNT','ITEMS_PER_AREA','QUESTION_DEFS','QUESTION_STEPS','qdByPath','qdFactors','qdMax','qdOptions','qdRequired','qdStepCodes','qdText'].sort());
  expect(result.missingHandlers).toEqual([]);
  expect(Object.values(result.live)).not.toContain(false);
  expect(result.secondPlanning.type).toBe('object');
  expect(result.secondPlanning.keys).toEqual(['listAssessments','resolveInvite','schemaVersion','toAssessment']);
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
