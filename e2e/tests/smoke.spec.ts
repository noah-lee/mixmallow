import {
  E2E_USER,
  SIGNED_OUT,
  STORAGE_STATE,
  WEB_ORIGIN,
} from '../support/env.ts';
import { expect, test } from '../support/fixtures.ts';

test.describe('signed out', () => {
  test.use({ storageState: SIGNED_OUT });

  for (const [route, heading] of [
    ['/', 'Ship your idea this weekend'],
    ['/privacy', 'Privacy policy'],
    ['/terms', 'Terms of service'],
  ] as const) {
    test(`${route} renders`, async ({ page }) => {
      await page.goto(route);
      await expect(
        page.getByRole('heading', { level: 1, name: heading }),
      ).toBeVisible();
    });
  }

  test('landing offers sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: 'Sign in with Google' }),
    ).toBeVisible();
  });

  test('/account sends a signed-out visitor to the landing page', async ({
    page,
  }) => {
    await page.goto('/account');
    await expect(page).toHaveURL(`${WEB_ORIGIN}/`);
    await expect(
      page.getByRole('button', { name: 'Sign in with Google' }),
    ).toBeVisible();
  });

  for (const [query, message] of [
    ['?error=oauth', "Sign-in didn't complete. Try again."],
    [
      '?error=email_in_use&provider=google',
      'That email already has an account. Sign in with Google instead.',
    ],
  ] as const) {
    test(`landing shows the sign-in error for ${query}`, async ({ page }) => {
      await page.goto(`/${query}`);
      await expect(page.getByRole('alert')).toHaveText(message);
      await expect(page).toHaveURL(`${WEB_ORIGIN}/`);
    });
  }
});

test.describe('signed in', () => {
  test.use({ storageState: STORAGE_STATE });

  test('/account shows the user', async ({ page }) => {
    await page.goto('/account');
    await expect(page.getByText(E2E_USER.name)).toBeVisible();
    await expect(page.getByText(E2E_USER.email)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Sign out', exact: true }),
    ).toBeVisible();
  });
});
