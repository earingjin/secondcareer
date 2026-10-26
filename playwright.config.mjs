import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.mjs',
  timeout: 120000,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results',
  // 캡처 기준 이미지 위치: tests/snapshot/baseline/img/<이름>.jpg
  snapshotPathTemplate: '{testDir}/snapshot/baseline/img/{arg}{ext}',
});
