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
    'Sharing a project',
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

test('sharing', async ({ page }) => {
  await page.goto('/privacy');
  const heading = page.getByRole('heading', {
    level: 2,
    name: 'Sharing a project',
  });
  await heading.scrollIntoViewIfNeeded();
  await expect(
    page.getByText(/Anyone who has the link can see the owner's name/),
  ).toBeVisible();
  await expect(
    page.getByText(/Your email address is never shown to other users/),
  ).toBeVisible();
  await expect(page.getByText(/no other .+ user can see them/)).toHaveCount(0);
  await expect(
    page.getByText(/to anyone with the invite link\. It isn't\s+transferred/),
  ).toBeVisible();
  await page.evaluate('window.scrollBy(0, -16)');
  await captureScreenshot(page, 'privacy-sharing', { fullPage: false });
});

test('collaborator uploads', async ({ page }) => {
  await page.goto('/privacy');
  const paragraph = page.getByText(/^Every member can upload versions./);
  await paragraph.scrollIntoViewIfNeeded();
  await expect(paragraph).toContainText(
    "counts toward the owner's storage, not the uploader's",
  );
  await expect(
    page.getByText(/the versions you uploaded stay in the project/),
  ).toBeVisible();
  await expect(
    page.getByText(/by its uploader or the project's owner/),
  ).toBeVisible();
  await expect(
    page.getByText(/every version you uploaded and note you wrote/),
  ).toBeVisible();
  await page.evaluate('window.scrollBy(0, -16)');
  await captureScreenshot(page, 'privacy-collaborator-uploads', {
    fullPage: false,
  });
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
