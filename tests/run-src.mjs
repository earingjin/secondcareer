// src/index.html 을 대상으로 기본 테스트 전체를 실행한다(단계 1 이후 작업본 검증).
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], { stdio: 'inherit', shell: true, env: { ...process.env, TARGET_HTML: 'src/index.html' } });
process.exit(r.status ?? 1);
