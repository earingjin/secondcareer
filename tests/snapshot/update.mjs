// 화면 기준선 갱신. legacy 에서만 갱신한다(TARGET_HTML 지정 불가).
// 기본: HTML·JSON·인쇄 쪽수·CSS 지문. --visual: 캡처 이미지(저장소에 두지 않는 로컬 기준)만.
import { spawnSync } from 'node:child_process';
const visual = process.argv.includes('--visual');
const r = spawnSync('npx', ['playwright', 'test', 'tests/snapshot', '--update-snapshots'], { stdio: 'inherit', shell: true, env: { ...process.env, UPDATE: '1', TARGET_HTML: '', VISUAL: visual ? '1' : '' } });
process.exit(r.status ?? 1);
