import type { BrowserContext, Page } from '@playwright/test';
import { createTestApp } from '../../apps/api/test/helpers/app.ts';
import {
  createProject,
  createTrack,
} from '../../apps/api/test/helpers/factories.ts';
import { WEB_ORIGIN } from '../support/env.ts';
import { captureScreenshot, expect, test } from '../support/fixtures.ts';
import { signedInUser } from '../support/session.ts';

const MB = 1_048_576;

let app: Awaited<ReturnType<typeof createTestApp>>;

test.beforeAll(async () => {
  app = await createTestApp();
});

test.afterAll(async () => {
  await app.close();
});

// Each test gets its own user, so signing out everywhere can't end another test's session.
async function signIn(context: BrowserContext, withProject = true) {
  const id = crypto.randomUUID();
  const email = `maya.okafor-${id.slice(0, 8)}@gmail.com`;
  const { user, cookies } = await signedInUser(app, {
    email,
    name: 'Maya Okafor',
    authProviderId: `e2e-${id}`,
  });
  await context.addCookies(cookies);
  if (withProject) {
    const project = await createProject(app.db, {
      userId: user.id,
      name: 'Midnight Drive',
    });
    await createTrack(app.db, {
      userId: user.id,
      projectId: project.id,
      sizeBytes: 62 * MB,
    });
  }
  return { user, email };
}

const usage = (page: Page) => page.getByRole('region', { name: 'Usage' });

async function openAccount(page: Page) {
  await page.goto('/account');
  await expect(usage(page)).toContainText('of 500 MB');
}

test('loading', async ({ page, context }) => {
  await signIn(context);
  await page.route('**/api/usage', () => {});
  await page.goto('/account');
  await expect(
    page.getByRole('status', { name: 'Loading usage' }),
  ).toBeVisible();
  await expect(page.getByText('Maya Okafor')).toBeVisible();
  await captureScreenshot(page, 'account-loading', { waitForIdle: false });
});

test('default', async ({ page, context }) => {
  const { email } = await signIn(context);
  await openAccount(page);
  await expect(page.getByText('Maya Okafor')).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText('Signed in with Google')).toBeVisible();
  await expect(usage(page)).toHaveText(
    'Usage1 of 3 projects · 62 MB of 500 MB',
  );
  await expect(page.getByRole('radio', { name: 'System' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await captureScreenshot(page, 'account-default');
});

test('no projects yet', async ({ page, context }) => {
  await signIn(context, false);
  await openAccount(page);
  await expect(usage(page)).toHaveText('Usage0 of 3 projects · 0 MB of 500 MB');
  await captureScreenshot(page, 'account-empty');
});

test.describe('error', () => {
  test.use({ expectedConsoleError: /status of 500/ });

  test('error loading, then Try again', async ({ page, context }) => {
    await signIn(context);
    let fail = true;
    await page.route('**/api/usage', (route) =>
      fail
        ? route.fulfill({ status: 500, json: { error: 'internal' } })
        : route.fallback(),
    );
    await page.goto('/account');
    // The query retries with backoff before giving up.
    await expect(page.getByRole('alert')).toContainText(
      "Couldn't load your usage",
      { timeout: 15_000 },
    );
    // Sign out stays reachable while usage is down.
    await expect(
      page.getByRole('button', { name: 'Sign out', exact: true }),
    ).toBeEnabled();
    await captureScreenshot(page, 'account-error');

    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(usage(page)).toContainText(
      '1 of 3 projects · 62 MB of 500 MB',
    );
  });

  test('sign out still signs out when the request fails', async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.route('**/api/auth/logout', (route) =>
      route.fulfill({ status: 500, json: { error: 'internal' } }),
    );
    await openAccount(page);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/`);
  });

  test('a failed sign out everywhere shows a toast', async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.route('**/api/auth/logout-all', (route) =>
      route.fulfill({ status: 500, json: { error: 'internal' } }),
    );
    await openAccount(page);
    await page.getByRole('button', { name: 'Sign out on all devices' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Sign out' })
      .click();
    await expect(
      page.getByText("Couldn't sign out everywhere. Try again."),
    ).toBeVisible();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/account`);
  });
});

test('changing the theme applies it and survives a reload', async ({
  page,
  context,
}) => {
  await signIn(context);
  await openAccount(page);
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await captureScreenshot(page, 'account-dark');
});

test('sign out ends the session', async ({ page, context }) => {
  await signIn(context);
  await openAccount(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/`);
  await expect(
    page.getByRole('button', { name: 'Continue with Google' }),
  ).toBeVisible();
  await expect(page.getByText('Sign in to continue.')).toHaveCount(0);
  await page.goto('/account');
  await expect(page).toHaveURL(`${WEB_ORIGIN}/?next=%2Faccount`);
});

test('sign out on all devices ends every session', async ({
  page,
  context,
}) => {
  await signIn(context);
  // The same session's cookies on a second device.
  const otherCookies = await context.cookies();

  await openAccount(page);
  await page.getByRole('button', { name: 'Sign out on all devices' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Sign out on all devices?');
  await dialog.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/`);
  await expect(
    page.getByRole('button', { name: 'Continue with Google' }),
  ).toBeVisible();
  await expect(page.getByText('Sign in to continue.')).toHaveCount(0);

  const refresh = await page.request.post(`${WEB_ORIGIN}/api/auth/refresh`, {
    headers: {
      cookie: otherCookies.map((c) => `${c.name}=${c.value}`).join('; '),
    },
  });
  expect(refresh.status()).toBe(401);
});

test('account deletion links to the contact email', async ({
  page,
  context,
}) => {
  await signIn(context);
  await openAccount(page);
  await expect(
    page
      .getByRole('region', { name: 'Delete account' })
      .getByRole('link', { name: 'hello@example.com' }),
  ).toHaveAttribute('href', /^mailto:hello@example\.com\?/);
});
