// 단계 3a: Vite 도입. 진입점은 src/index.html 하나이고 앱 코드·CSS·화면은 바뀌지 않는다.
// 일반 <script src> 는 Vite 가 번들하지도 복사하지도 않으므로, 빌드가 끝난 뒤(closeBundle) src/js·src/data 를 dist 로 그대로 복사한다.
// 개발 서버(vite)는 root(src)를 그대로 서빙하므로 /js/…, /data/… 가 별도 설정 없이 열린다. preview 는 dist 를 서빙한다.
// 의존성은 vite 하나뿐이다(이 파일은 vite 를 import 하지 않는다).
const fs = require('node:fs');
const path = require('node:path');

const COPY_DIRS = ['js', 'data'];
const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'dist');

function copyClassicScripts() {
  return {
    name: 'copy-classic-scripts',
    apply: 'build',
    closeBundle() {
      for (const d of COPY_DIRS) fs.cpSync(path.join(SRC, d), path.join(OUT, d), { recursive: true });
      console.log(`[copy-classic-scripts] ${COPY_DIRS.join(', ')} -> dist`);
    },
  };
}

module.exports = {
  root: SRC,
  appType: 'mpa',
  build: { outDir: OUT, emptyOutDir: true },
  plugins: [copyClassicScripts()],
};
