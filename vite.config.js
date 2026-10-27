// 단계 3b-1: src/index.html 의 단일 ES 모듈 진입점을 Vite 가 번들한다.
// 단계 3a의 classic 스크립트 복사는 모듈 번들과 원본 파일을 중복 배포하므로 제거한다.
const path = require('node:path');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'dist');

module.exports = {
  root: SRC,
  appType: 'mpa',
  build: { outDir: OUT, emptyOutDir: true },
};
