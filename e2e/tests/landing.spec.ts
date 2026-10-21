import { SIGNED_OUT, STORAGE_STATE, WEB_ORIGIN } from '../support/env.ts';
import { captureScreenshot, expect, test } from '../support/fixtures.ts';

const TAGLINE = 'Notes for every second of your mix.';

test.describe('signed out', () => {
  test.use({ storageState: SIGNED_OUT });

  test('default', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: TAGLINE }),
    ).toBeVisible();
    for (const title of [
      'Every bounce is a version',
      'Pin notes to the exact moment',
      'Just for you — nothing is shared',
    ]) {
      await expect(
        page.getByRole('heading', { level: 2, name: title }),
      ).toBeVisible();
    }
    await expect(
      page.getByText('Free: 1 project, 100 MB of mixes'),
    ).toBeVisible();
    await expect(
      page.getByRole('img', { name: /waveform with notes/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Continue with Google' }),
    ).toBeVisible();
    await captureScreenshot(page, 'landing-default');
  });

  test('error oauth', async ({ page }) => {
    await page.goto('/?error=oauth');
    await expect(page.getByRole('alert')).toHaveText(
      "Sign-in didn't work. Please try again.",
    );
    await expect(page).toHaveURL(`${WEB_ORIGIN}/`);
    await captureScreenshot(page, 'landing-error-oauth');
  });

  test('error email in use', async ({ page }) => {
    await page.goto('/?error=email_in_use&provider=google');
    await expect(page.getByRole('alert')).toHaveText(
      'That email already has an account. Sign in with Google instead.',
    );
    await expect(page).toHaveURL(`${WEB_ORIGIN}/`);
    await captureScreenshot(page, 'landing-error-email-in-use');
  });

  test('Continue with Google starts the sign-in redirect', async ({ page }) => {
    await page.route('**/api/auth/google/start', (route) =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' }),
    );
    await page.goto('/?error=oauth');
    await expect(page.getByRole('alert')).toBeVisible();
    const started = page.waitForRequest('**/api/auth/google/start');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await started;
    await expect(page).toHaveURL(`${WEB_ORIGIN}/api/auth/google/start`);
  });

  test('footer links open privacy and terms', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Privacy' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Privacy policy' }),
    ).toBeVisible();
    await page.goBack();
    await page.getByRole('link', { name: 'Terms' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Terms of service' }),
    ).toBeVisible();
  });
});

test.describe('signed in', () => {
  test.use({ storageState: STORAGE_STATE });

  test('signed in', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: TAGLINE }),
    ).toBeVisible();
    const open = page.getByRole('link', { name: 'Open mixmallow' });
    await expect(open).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Continue with Google' }),
    ).toHaveCount(0);
    await captureScreenshot(page, 'landing-signed-in');

    await open.click();
    // No project yet, so the entry route sends a new user to onboarding.
    await expect(page).toHaveURL(`${WEB_ORIGIN}/app/start`);
  });
});
