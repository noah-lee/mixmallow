import { SIGNED_OUT } from '../support/env.ts';
import { captureScreenshot, expect, test } from '../support/fixtures.ts';

test.use({ storageState: SIGNED_OUT });

test('default', async ({ page }) => {
  await page.goto('/privacy');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Privacy policy' }),
  ).toBeVisible();
  await expect(page.getByText(/^Last updated /)).toBeVisible();
  for (const title of [
    'What we collect',
    'How we use it',
    'Google user data',
    "Where it's stored",
    'Keeping and deleting your data',
    'Children',
    'Changes',
    'Contact',
  ]) {
    await expect(
      page.getByRole('heading', { level: 2, name: title }),
    ).toBeVisible();
  }
  await expect(page.getByText(/DigitalOcean Spaces/)).toBeVisible();
  await expect(page.getByText(/takes no payments/)).toBeVisible();
  await expect(page.getByText(/Stripe/)).toHaveCount(0);
  await captureScreenshot(page, 'privacy-default');
});

test('contact links open an email to the support address', async ({ page }) => {
  await page.goto('/privacy');
  const links = page.getByRole('link', { name: /@/ });
  await expect(links).toHaveCount(2);
  for (const href of await links.evaluateAll((els) =>
    els.map((el) => el.getAttribute('href')),
  )) {
    expect(href).toMatch(/^mailto:\S+@\S+$/);
  }
});
