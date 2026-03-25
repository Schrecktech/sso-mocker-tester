import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 3000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    screenshot: 'on',
    video: 'on',
    trace: 'on',
  },
  outputDir: 'test-results',
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
});
