import type { BrowserContext, Page } from '@playwright/test';
import { createTestApp } from '../../apps/api/test/helpers/app.ts';
import { createProject } from '../../apps/api/test/helpers/factories.ts';
import { SIGNED_OUT, STORAGE_STATE, WEB_ORIGIN } from '../support/env.ts';
import { captureScreenshot, expect, test } from '../support/fixtures.ts';
import { signedInUser } from '../support/session.ts';

const TAGLINE = 'Notes for every second of your mix.';

let app: Awaited<ReturnType<typeof createTestApp>>;

test.beforeAll(async () => {
  app = await createTestApp();
});

test.afterAll(async () => {
  await app.close();
});

// A new user per test, since the free plan allows one project.
async function newUser() {
  const id = crypto.randomUUID();
  return signedInUser(app, {
    email: `maya.okafor-${id.slice(0, 8)}@gmail.com`,
    name: 'Maya Okafor',
    authProviderId: `e2e-${id}`,
  });
}

async function signInWithProject(context: BrowserContext) {
  const { user, cookies } = await newUser();
  await context.addCookies(cookies);
  return createProject(app.db, { userId: user.id, name: 'Midnight Drive' });
}

const notice = (page: Page) => page.getByRole('status');
const continueButton = (page: Page) =>
  page.getByRole('button', { name: 'Continue with Google' });

// Answers the sign-in redirect, so a test can check where it went without leaving the app.
async function stubSignInStart(page: Page) {
  await page.route('**/api/auth/google/start*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' }),
  );
}

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

  test('next notice', async ({ page }) => {
    const id = crypto.randomUUID();
    await page.goto(`/app/projects/${id}`);
    await expect(page).toHaveURL(
      `${WEB_ORIGIN}/?next=%2Fapp%2Fprojects%2F${id}`,
    );
    await expect(notice(page)).toHaveText('Sign in to continue.');
    const noticeBox = await notice(page).boundingBox();
    const buttonBox = await continueButton(page).boundingBox();
    expect(noticeBox && buttonBox && noticeBox.y < buttonBox.y).toBe(true);
    await captureScreenshot(page, 'landing-next-notice', { fullPage: false });
  });

  test('/app sends a signed-out visitor to landing without next', async ({
    page,
  }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(`${WEB_ORIGIN}/`);
    await expect(continueButton(page)).toBeVisible();
    await expect(notice(page)).toHaveCount(0);
  });

  test('next error', async ({ page }) => {
    await stubSignInStart(page);
    await page.goto('/?error=oauth&next=/app/projects/abc');
    await expect(page.getByRole('alert')).toHaveText(
      "Sign-in didn't work. Please try again.",
    );
    await expect(page).toHaveURL(`${WEB_ORIGIN}/?next=%2Fapp%2Fprojects%2Fabc`);
    // The error banner takes the notice's place.
    await expect(notice(page)).toHaveCount(0);
    await captureScreenshot(page, 'landing-next-error', { fullPage: false });

    const started = page.waitForRequest('**/api/auth/google/start*');
    await continueButton(page).click();
    expect((await started).url()).toBe(
      `${WEB_ORIGIN}/api/auth/google/start?next=%2Fapp%2Fprojects%2Fabc`,
    );
  });

  test('Continue with Google carries next', async ({ page }) => {
    await stubSignInStart(page);
    await page.goto('/?next=%2Fapp%2Fprojects%2Fabc%3Fx%3D1');
    await expect(notice(page)).toBeVisible();
    const started = page.waitForRequest('**/api/auth/google/start*');
    await continueButton(page).click();
    expect((await started).url()).toBe(
      `${WEB_ORIGIN}/api/auth/google/start?next=%2Fapp%2Fprojects%2Fabc%3Fx%3D1`,
    );
  });

  test('the header Sign in carries next too', async ({ page }) => {
    await stubSignInStart(page);
    await page.goto('/?next=%2Fapp%2Fprojects%2Fabc');
    await expect(notice(page)).toBeVisible();
    const started = page.waitForRequest('**/api/auth/google/start*');
    await page
      .getByRole('banner')
      .getByRole('button', { name: 'Sign in' })
      .click();
    expect((await started).url()).toBe(
      `${WEB_ORIGIN}/api/auth/google/start?next=%2Fapp%2Fprojects%2Fabc`,
    );
  });

  test('the header Sign in ignores next on other pages', async ({ page }) => {
    await stubSignInStart(page);
    await page.goto('/privacy?next=%2Fapp%2Fprojects%2Fabc');
    const started = page.waitForRequest('**/api/auth/google/start*');
    await page
      .getByRole('banner')
      .getByRole('button', { name: 'Sign in' })
      .click();
    expect((await started).url()).toBe(`${WEB_ORIGIN}/api/auth/google/start`);
  });

  for (const next of ['//evil.com', '/api/auth/me', 'https://evil.com']) {
    test(`an invalid next (${next}) is ignored`, async ({ page }) => {
      await stubSignInStart(page);
      await page.goto(`/?next=${encodeURIComponent(next)}`);
      await expect(continueButton(page)).toBeVisible();
      await expect(notice(page)).toHaveCount(0);
      const started = page.waitForRequest('**/api/auth/google/start*');
      await continueButton(page).click();
      expect((await started).url()).toBe(`${WEB_ORIGIN}/api/auth/google/start`);
    });
  }

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

test.describe('signed in with next', () => {
  test('goes straight to next', async ({ page, context }) => {
    const project = await signInWithProject(context);
    await page.goto(`/?next=%2Fapp%2Fprojects%2F${project.id}`);
    await expect(page).toHaveURL(`${WEB_ORIGIN}/app/projects/${project.id}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Midnight Drive' }),
    ).toBeVisible();
  });

  test('an invalid next stays on landing', async ({ page, context }) => {
    await signInWithProject(context);
    await page.goto('/?next=%2F%2Fevil.com');
    await expect(
      page.getByRole('link', { name: 'Open mixmallow' }),
    ).toBeVisible();
    await expect(notice(page)).toHaveCount(0);
  });

  test('next grants nothing: another user’s project is not found', async ({
    page,
    context,
  }) => {
    await signInWithProject(context);
    const other = await newUser();
    const theirs = await createProject(app.db, {
      userId: other.user.id,
      name: 'Not yours',
    });
    await page.goto(`/?next=%2Fapp%2Fprojects%2F${theirs.id}`);
    await expect(page).toHaveURL(`${WEB_ORIGIN}/app/projects/${theirs.id}`);
    await expect(
      page.getByRole('heading', { name: "This project doesn't exist" }),
    ).toBeVisible();
  });

  test('an expired session comes back through sign-in', async ({
    page,
    context,
  }) => {
    const project = await signInWithProject(context);
    await page.goto(`/app/projects/${project.id}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Midnight Drive' }),
    ).toBeVisible();

    // Both tokens are rejected from here on.
    let refreshes = 0;
    await page.route('**/api/**', (route) => {
      if (new URL(route.request().url()).pathname === '/api/auth/refresh') {
        refreshes++;
      }
      return route.fulfill({ status: 401, json: { error: 'unauthorized' } });
    });
    const urls: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) urls.push(frame.url());
    });

    await page.getByRole('button', { name: 'Project options' }).click();
    await page.getByRole('menuitem', { name: 'Rename project' }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename project' });
    await dialog.getByLabel('Name').fill('Midnight Drive (Club Mix)');
    await dialog.getByRole('button', { name: 'Save' }).click();

    const landing = `${WEB_ORIGIN}/?next=%2Fapp%2Fprojects%2F${project.id}`;
    await expect(page).toHaveURL(landing);
    await expect(notice(page)).toHaveText('Sign in to continue.');
    await expect(continueButton(page)).toBeVisible();
    expect(refreshes).toBe(1);
    expect(urls).toEqual([landing]);
  });

  test('several requests expiring together redirect once', async ({
    page,
    context,
  }) => {
    const project = await signInWithProject(context);
    await page.goto('/app/projects');
    const projectLink = page.getByRole('link', { name: /Midnight Drive/ });
    await expect(projectLink).toBeVisible();

    const failed = new Set<string>();
    await page.route('**/api/**', (route) => {
      failed.add(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 401, json: { error: 'unauthorized' } });
    });
    const landing = `${WEB_ORIGIN}/?next=%2Fapp%2Fprojects%2F${project.id}`;
    const landings: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && frame.url() === landing) {
        landings.push(frame.url());
      }
    });

    // The project page loads the project and its versions at once; both fail.
    await projectLink.click();
    await expect(page).toHaveURL(landing);
    await expect(notice(page)).toHaveText('Sign in to continue.');
    expect(failed).toContain(`/api/projects/${project.id}`);
    expect(failed).toContain(`/api/projects/${project.id}/tracks`);
    expect(landings).toHaveLength(1);
  });
});

test.describe('refresh unavailable', () => {
  test.use({ expectedConsoleError: /status of 503 / });

  test('a failed refresh that is not a 401 keeps the user signed in', async ({
    page,
    context,
  }) => {
    const project = await signInWithProject(context);
    await page.goto(`/app/projects/${project.id}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Midnight Drive' }),
    ).toBeVisible();

    await page.route('**/api/**', (route) =>
      new URL(route.request().url()).pathname === '/api/auth/refresh'
        ? route.fulfill({ status: 503, json: { error: 'unavailable' } })
        : route.fulfill({ status: 401, json: { error: 'unauthorized' } }),
    );
    await page.getByRole('button', { name: 'Project options' }).click();
    await page.getByRole('menuitem', { name: 'Rename project' }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename project' });
    await dialog.getByLabel('Name').fill('Midnight Drive (Club Mix)');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/app/projects/${project.id}`);
  });
});
