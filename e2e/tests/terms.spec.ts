import { SIGNED_OUT } from '../support/env.ts';
import { captureScreenshot, expect, test } from '../support/fixtures.ts';

test.use({ storageState: SIGNED_OUT });

test('default', async ({ page }) => {
  await page.goto('/terms');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Terms of service' }),
  ).toBeVisible();
  await expect(page.getByText(/^Last updated /)).toBeVisible();
  for (const title of [
    'The service',
    'Free plan limits',
    'Your account',
    'Your music',
    'Sharing projects',
    'Acceptable use',
    'Keep your own copies',
    'No warranty',
    'Changes',
    'Contact',
  ]) {
    await expect(
      page.getByRole('heading', { level: 2, name: title }),
    ).toBeVisible();
  }
  await expect(
    page.getByText('up to 1 project', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/100 MB of stored audio/)).toBeVisible();
  await expect(
    page.getByText(
      "up to 500 notes on each version, counting every member's notes",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText(/You keep all rights/)).toBeVisible();
  await expect(
    page.getByText(
      /permission only to store it, show its waveform, and play it back/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText('up to 10 collaborators on each project', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Stripe|subscription/)).toHaveCount(0);
  await captureScreenshot(page, 'terms-default');
});

test('sharing', async ({ page }) => {
  await page.goto('/terms');
  await page
    .getByRole('heading', { level: 2, name: 'Sharing projects' })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByText(/you're responsible for who you invite/),
  ).toBeVisible();
  await expect(
    page.getByText(/remove a member, or reset or turn off the link/),
  ).toBeVisible();
  await expect(
    page.getByText(/owner can mark done or delete anyone's note/),
  ).toBeVisible();
  await page.evaluate('window.scrollBy(0, -16)');
  await captureScreenshot(page, 'terms-sharing', { fullPage: false });
});

test('contact link opens an email to the support address', async ({ page }) => {
  await page.goto('/terms');
  const link = page.getByRole('link', { name: /@/ });
  await expect(link).toHaveCount(1);
  expect(await link.getAttribute('href')).toMatch(/^mailto:\S+@\S+$/);
});

test('privacy link opens the privacy policy', async ({ page }) => {
  await page.goto('/terms');
  await page
    .getByRole('main')
    .getByRole('link', { name: 'privacy policy' })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Privacy policy' }),
  ).toBeVisible();
});
