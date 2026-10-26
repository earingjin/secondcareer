// 화면 기준선 갱신. 기본은 legacy 에서만 갱신한다.
// 기본: HTML·JSON·인쇄 쪽수·CSS 지문. --visual: 캡처 이미지(저장소에 두지 않는 로컬 기준)만.
// 승인된 문구 변경 뒤에는 --target <html> 로 작업본 기준으로 갱신한다. 승인 사유(GEN_APPROVED)가 없으면 거부한다(docs/문구-변경-절차.md).
import { spawnSync } from 'node:child_process';
const visual = process.argv.includes('--visual');
const ti = process.argv.indexOf('--target');
const target = ti >= 0 ? process.argv[ti + 1] : '';
if (ti >= 0 && (!target || !process.env.GEN_APPROVED)) { console.error('--target 은 대상 HTML 과 승인 사유(GEN_APPROVED)가 필요하다.'); process.exit(1); }
const r = spawnSync('npx', ['playwright', 'test', 'tests/snapshot', '--update-snapshots'], { stdio: 'inherit', shell: true, env: { ...process.env, UPDATE: '1', TARGET_HTML: target, VISUAL: visual ? '1' : '' } });
process.exit(r.status ?? 1);
