import { defineConfig, devices } from '@playwright/test';

const port = 4310;

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  outputDir: '../test-results',
  use: { baseURL: `http://127.0.0.1:${port}`, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node --import tsx e2e/server.ts', cwd: '..', url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false, timeout: 60_000, env: { E2E_PORT: String(port) },
  },
});
