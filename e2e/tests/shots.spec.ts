import { SIGNED_OUT, STORAGE_STATE } from '../support/env.ts';
import { captureScreenshot, test } from '../support/fixtures.ts';

// Driven by `pnpm e2e:shots` (e2e/shots.ts), which sets these variables.
const routes = (process.env.SHOT_ROUTES ?? '/').split(',');
test.use({
  storageState: process.env.SHOT_SIGNED_OUT ? SIGNED_OUT : STORAGE_STATE,
});

for (const route of routes) {
  test(`screenshot ${route}`, async ({ page }) => {
    await page.goto(route);
    const file = await captureScreenshot(page, route);
    console.log(`screenshot: ${file}`);
  });
}
