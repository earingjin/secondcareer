// 의존성 없는 정적 파일 서버(테스트용). 배포 호스트를 흉내 내려고 규칙을 일부러 엄격하게 둔다.
//  - 경로가 '/' 로 끝나면 그 디렉터리의 index.html
//  - 끝 슬래시 없는 디렉터리('/counselor')는 404 (Vite 개발 서버·preview 와 같은 동작, 호스트 재작성이 필요한 경우를 드러낸다)
// 사용: node tests/tools/serve-static.mjs <디렉터리> [포트]     또는   import { serve } from './serve-static.mjs'
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };

export function serve(rootDir, { port = 0 } = {}) {
  const root = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end('bad request'); return; }
    let f = path.join(root, p);
    if (!f.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
    if (p.endsWith('/')) f = path.join(f, 'index.html');
    let st; try { st = fs.statSync(f); } catch { st = null; }
    if (!st || st.isDirectory()) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const actual = server.address().port;
      resolve({ server, root, port: actual, url: `http://localhost:${actual}`, close: () => new Promise(r => { server.close(() => r()); server.closeAllConnections?.(); }) });
    });
  });
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) { console.error('사용: node tests/tools/serve-static.mjs <디렉터리> [포트]'); process.exit(1); }
  const s = await serve(dir, { port: +process.argv[3] || 0 });
  console.log(`serving ${s.root} at ${s.url}`);
}
