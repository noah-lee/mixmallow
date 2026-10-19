import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test as base, type ConsoleMessage, type Page } from '@playwright/test';
import { SCREENSHOT_DIR } from './env.ts';

// The browser logs every non-2xx fetch as a console error. These are the app's normal
// signed-out (401 from /auth/me and /auth/refresh) and empty-state (404) answers.
function isExpectedApiStatus(msg: ConsoleMessage): boolean {
  return (
    /^Failed to load resource: .*status of (401|404)\b/.test(msg.text()) &&
    new URL(msg.location().url).pathname.startsWith('/api/')
  );
}

// Import `test` and `expect` from here, not @playwright/test: every test then fails on an
// uncaught page error or a console error.
export const test = base.extend<{ failOnPageErrors: undefined }>({
  failOnPageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !isExpectedApiStatus(msg)) {
          errors.push(`console.error: ${msg.text()} (${msg.location().url})`);
        }
      });
      await use(undefined);
      base.expect(errors, 'page errors / console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export const expect = test.expect;

// Saves a full-page screenshot to e2e/screenshots/<name>-<project>.png (git-ignored) and
// returns the path. Call it from any test after putting the page in the state to capture.
export async function captureScreenshot(
  page: Page,
  name: string,
): Promise<string> {
  const slug =
    name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
  const file = path.join(
    SCREENSHOT_DIR,
    `${slug}-${test.info().project.name}.png`,
  );
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  return file;
}
