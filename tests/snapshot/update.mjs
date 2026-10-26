// 화면 기준선 갱신. legacy 에서만 갱신한다(TARGET_HTML 지정 불가).
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['playwright', 'test', 'tests/snapshot', '--update-snapshots'], { stdio: 'inherit', shell: true, env: { ...process.env, UPDATE: '1', TARGET_HTML: '' } });
process.exit(r.status ?? 1);
