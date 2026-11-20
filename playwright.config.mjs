import { defineConfig } from '@playwright/test';

// Local runs use the installed Google Chrome. CI sets PW_BUNDLED_CHROMIUM=1 to use the
// Chromium that `npx playwright install chromium` downloads, since runners have no Chrome channel.
const channel = process.env.PW_BUNDLED_CHROMIUM === '1' ? undefined : 'chrome';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  workers: 1,
  use: { channel, colorScheme: 'dark', baseURL: 'http://127.0.0.1:4387', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node tests/static-server.mjs', url: 'http://127.0.0.1:4387', reuseExistingServer: false },
});
