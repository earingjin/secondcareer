// 캡처 비교(이 PC의 글꼴에 묶인 로컬 점검). 기본 테스트(npm test)에는 포함하지 않는다.
// 기준 이미지가 없으면 먼저 `npm run visual:update` 로 legacy 에서 만든다.
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['playwright', 'test', 'tests/snapshot', ...process.argv.slice(2)], { stdio: 'inherit', shell: true, env: { ...process.env, VISUAL: '1' } });
process.exit(r.status ?? 1);
