import { defineConfig, devices } from '@playwright/test';

// E2E_PREVIEW=1 runs the suite against the production build (`vite build && vite preview`).
const preview = !!process.env.E2E_PREVIEW;
const port = preview ? 4173 : 5173;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    acceptDownloads: true,
    locale: 'bn-BD',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: preview ? 'npx vite build && npx vite preview --port 4173 --strictPort' : 'npx vite --port 5173 --strictPort',
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
