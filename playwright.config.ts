import { defineConfig, devices } from '@playwright/test';

// AGENTS.md machine limits: Chromium only, one worker, one dev server.
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5199', trace: 'retain-on-failure', viewport: { width: 1440, height: 900 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: { command: 'pnpm dev --host 127.0.0.1', url: 'http://127.0.0.1:5199', reuseExistingServer: true, timeout: 60_000 },
});
