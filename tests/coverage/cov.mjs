// 실행 지점 확인용 커버리지 훅. 환경 변수 COV_OUT(JSONL 파일 경로)이 있을 때만 동작한다.
// 라벨(테스트·화면 이름)별로 V8 블록 커버리지를 기록한다. 앱 코드는 수정하지 않는다.
import fs from 'node:fs';

export const COV_OUT = process.env.COV_OUT;
const opt = { resetOnNavigation: false, reportAnonymousScripts: true };

export async function covStart(page) {
  if (!COV_OUT) return;
  await page.coverage.startJSCoverage(opt);
}

// 지금까지의 커버리지를 라벨로 저장하고 새로 시작한다.
export async function covTake(page, label) {
  if (!COV_OUT) return;
  const entries = await page.coverage.stopJSCoverage();
  const keep = entries.filter(e => /\/(?:index\.html)?$|\/index\.original\.html$|\/js\/\d\d-[\w-]+\.js$|\/data\/feedback-[\w-]+\.js$/.test(e.url))
    .map(e => ({ url: e.url, len: e.source.length, ranges: e.functions.flatMap(f => f.ranges.map(r => [r.startOffset, r.endOffset, r.count])) }));
  fs.appendFileSync(COV_OUT, JSON.stringify({ label, entries: keep }) + '\n');
  await page.coverage.startJSCoverage(opt);
}
