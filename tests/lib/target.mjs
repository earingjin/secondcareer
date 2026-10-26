// 테스트 대상 지정. 우선순위: TARGET_URL(http/https/file URL) → TARGET_HTML(파일 경로) → legacy.
// 모든 하네스는 이 두 함수만 거친다. 정답표 비교 로직은 대상이 file:// 이든 http:// 이든 같다.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const LEGACY_PATH = path.resolve(here, '../../legacy/index.original.html');
const isUrl = t => /^(https?|file):\/\//i.test(t);

// 대상 문자열(URL 또는 절대 경로)을 돌려준다.
export function resolveTarget(env = process.env) {
  if (env.TARGET_URL) return env.TARGET_URL;
  if (env.TARGET_HTML) return path.resolve(env.TARGET_HTML);
  return LEGACY_PATH;
}
// page.goto 에 넘길 URL. URL 은 그대로, 경로는 file:// 로 바꾼다.
export function toUrl(t) {
  return isUrl(t) ? t : pathToFileURL(t).href;
}
export const isHttp = t => /^https?:\/\//i.test(t);
