import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.HISTORYMAP_BASE_URL || 'http://localhost:3001';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // WebGL 页面并发多 worker 在本机出现过点击/加载超时 flake，限制并发保证稳定。
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // CI 仅安装 Chromium；保留移动端视口/触控测试意图，避免依赖 WebKit。
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});
