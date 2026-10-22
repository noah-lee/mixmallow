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
    ['/', 'Notes for every second of your mix.'],
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

  test('/account sends a signed-out visitor to the landing page', async ({
    page,
  }) => {
    await page.goto('/account');
    await expect(page).toHaveURL(`${WEB_ORIGIN}/`);
    await expect(
      page.getByRole('button', { name: 'Continue with Google' }),
    ).toBeVisible();
  });

  test('/app/projects sends a signed-out visitor to the landing page', async ({
    page,
  }) => {
    await page.goto('/app/projects');
    await expect(page).toHaveURL(`${WEB_ORIGIN}/`);
    await expect(
      page.getByRole('button', { name: 'Continue with Google' }),
    ).toBeVisible();
  });
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
