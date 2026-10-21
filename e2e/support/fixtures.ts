import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test as base, type ConsoleMessage, type Page } from '@playwright/test';
import { SCREENSHOT_DIR, WEB_ORIGIN } from './env.ts';

// The browser logs every non-2xx fetch as a console error. These are the app's normal
// signed-out (401 from /auth/me and /auth/refresh) and empty-state (404) answers.
function isExpectedApiStatus(msg: ConsoleMessage): boolean {
  return (
    /^Failed to load resource: .*status of (401|404)\b/.test(msg.text()) &&
    new URL(msg.location().url).pathname.startsWith('/api/')
  );
}

// Import `test` and `expect` from here, not @playwright/test: every test then fails on an
// uncaught page error or a console error. A test that forces a failure lists the console
// errors it causes with `test.use({ expectedConsoleError: /.../ })`.
let testsInWorker = 0;

export const test = base.extend<{
  expectedConsoleError: RegExp | null;
  failOnPageErrors: undefined;
  ownClientAddress: undefined;
}>({
  expectedConsoleError: [null, { option: true }],
  // The api rate-limits per IP and trusts X-Forwarded-For from the loopback proxy, so
  // without this the whole suite shares one 100-a-minute budget. TEST-NET-3 addresses,
  // which the api doesn't treat as proxies. Only /api requests carry it: on a
  // cross-origin request (storage) the header would need CORS approval.
  ownClientAddress: [
    async ({ context }, use, testInfo) => {
      testsInWorker++;
      const address = `203.0.${113 + (testInfo.parallelIndex % 100)}.${(testsInWorker % 254) + 1}`;
      await context.route(`${WEB_ORIGIN}/api/**`, (route) =>
        route.fallback({
          headers: { ...route.request().headers(), 'x-forwarded-for': address },
        }),
      );
      await use(undefined);
    },
    { auto: true },
  ],
  failOnPageErrors: [
    async ({ page, expectedConsoleError }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
      page.on('console', (msg) => {
        if (
          msg.type() === 'error' &&
          !isExpectedApiStatus(msg) &&
          !expectedConsoleError?.test(msg.text())
        ) {
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
// Pass `fullPage: false` for an open overlay: a full-page shot stretches the viewport, so a
// fixed dialog lands mid-page instead of where the user sees it. Pass `waitForIdle: false`
// when the state is a request held open on purpose (network idle would never come).
export async function captureScreenshot(
  page: Page,
  name: string,
  {
    fullPage = true,
    waitForIdle = true,
  }: { fullPage?: boolean; waitForIdle?: boolean } = {},
): Promise<string> {
  const file = shotPath(name);
  if (waitForIdle) await page.waitForLoadState('networkidle');
  await page.screenshot({ path: file, fullPage, animations: 'disabled' });
  return file;
}

function shotPath(name: string): string {
  const slug =
    name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  return path.join(SCREENSHOT_DIR, `${slug}-${test.info().project.name}.png`);
}

// Chromium leaves a full-page shot blank past 16,384 device px, so a long page is saved as
// <name>-<project>-tNN.png tiles of `tileHeight` CSS px each instead. Each tile re-lays out
// the whole page, so the full shot is skipped once it would come out blank anyway.
export async function captureTiles(
  page: Page,
  name: string,
  tileHeight = 1400,
): Promise<string[]> {
  await page.waitForLoadState('networkidle');
  // String expressions: the e2e tsconfig has no DOM lib.
  const height = Number(
    await page.evaluate('document.documentElement.scrollHeight'),
  );
  const scale = Number(await page.evaluate('window.devicePixelRatio'));
  const base =
    height * scale > 16_384
      ? shotPath(name)
      : await captureScreenshot(page, name);
  const width = page.viewportSize()?.width ?? 0;
  const files: string[] = [];
  for (let y = 0, i = 1; y < height; y += tileHeight, i++) {
    const file = base.replace(/\.png$/, `-t${String(i).padStart(2, '0')}.png`);
    await page.screenshot({
      path: file,
      fullPage: true,
      animations: 'disabled',
      clip: { x: 0, y, width, height: Math.min(tileHeight, height - y) },
    });
    files.push(file);
  }
  return files;
}
