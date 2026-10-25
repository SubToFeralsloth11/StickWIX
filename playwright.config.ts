import { defineConfig, devices } from '@playwright/test';

// AGENTS.md machine limits: Chromium only, one worker, one dev server.
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5199', trace: 'retain-on-failure', viewport: { width: 1440, height: 900 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: { command: 'pnpm dev', url: 'http://localhost:5199', reuseExistingServer: true, timeout: 60_000 },
});
