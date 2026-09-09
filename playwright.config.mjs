import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  workers: 1,
  use: { channel: 'chrome', colorScheme: 'dark', baseURL: 'http://127.0.0.1:4387', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node tests/static-server.mjs', url: 'http://127.0.0.1:4387', reuseExistingServer: false },
});
