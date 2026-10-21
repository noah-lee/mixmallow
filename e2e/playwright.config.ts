import { defineConfig, devices } from '@playwright/test';
import { testDatabaseUrl } from '@repo/db/testing';
import { TEST_ENV } from '../apps/api/test/helpers/config.ts';
import { API_PORT, S3_ENDPOINT, WEB_ORIGIN, WEB_PORT } from './support/env.ts';

// `pnpm e2e:shots` sets SHOT_ROUTES and runs only the screenshot spec.
const shots = Boolean(process.env.SHOT_ROUTES);

export default defineConfig({
  testDir: './tests',
  testMatch: shots ? 'shots.spec.ts' : '*.spec.ts',
  testIgnore: shots ? [] : 'shots.spec.ts',
  outputDir: './test-results',
  globalSetup: './global-setup.ts',
  forbidOnly: true,
  retries: 0,
  reporter: [['line'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      // The real api, booted through loadConfig from the same dummy env the vitest helpers
      // use, so tokens minted in global-setup.ts verify here.
      command: 'node src/server.ts',
      cwd: '../apps/api',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: {
        ...TEST_ENV,
        LOG_LEVEL: 'warn',
        DATABASE_URL: testDatabaseUrl(),
        HOST: '127.0.0.1',
        PORT: String(API_PORT),
        APP_ORIGIN: WEB_ORIGIN,
        S3_ENDPOINT,
      },
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // A production build behind `vite preview`, which inherits the dev proxy (PORT
      // points it at the api above). Avoids the dev server's mid-test dependency reloads.
      command: `pnpm exec vite build --logLevel error && pnpm exec vite preview --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      cwd: '../apps/web',
      url: WEB_ORIGIN,
      env: { PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
