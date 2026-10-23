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
    page.getByText('up to 3 projects', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'up to 500 MB of stored audio in total, with each file up to 20 MB',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText('MP3, AAC or M4A files only', { exact: true }),
  ).toBeVisible();
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
    page.getByText('up to 1 collaborator on each project', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Stripe|subscription/)).toHaveCount(0);
  await expect(page.getByText(/\bPro\b|upgrade|coming soon/i)).toHaveCount(0);
  await captureScreenshot(page, 'terms-default');
});

test('limits', async ({ page }) => {
  await page.goto('/terms');
  await page
    .getByRole('heading', { level: 2, name: 'Free plan limits' })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByText(/count toward their owner's limits/),
  ).toBeVisible();
  await page.evaluate('window.scrollBy(0, -16)');
  await captureScreenshot(page, 'terms-limits', { fullPage: false });
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
  await expect(page.getByText(/owner can delete anyone's note/)).toBeVisible();
  await expect(
    page.getByText(/A member can rename or delete the versions they uploaded/),
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
