import type { BrowserContext, Page } from '@playwright/test';
import { createTestApp } from '../../apps/api/test/helpers/app.ts';
import {
  createProject,
  createTrack,
} from '../../apps/api/test/helpers/factories.ts';
import { WEB_ORIGIN } from '../support/env.ts';
import { captureScreenshot, expect, test } from '../support/fixtures.ts';
import { signedInUser } from '../support/session.ts';

// This year, so the row's date has no year: "Created Oct 3".
const OCT_3 = new Date(new Date().getFullYear(), 9, 3, 12);

let app: Awaited<ReturnType<typeof createTestApp>>;

test.beforeAll(async () => {
  app = await createTestApp();
});

test.afterAll(async () => {
  await app.close();
});

async function signIn(context: BrowserContext) {
  const id = crypto.randomUUID();
  const { user, cookies } = await signedInUser(app, {
    email: `maya-${id}@example.com`,
    name: 'Maya Lopez',
    authProviderId: `e2e-${id}`,
  });
  await context.addCookies(cookies);
  return user;
}

async function seedProject(
  userId: string,
  versions: number,
  name = 'Midnight Drive',
) {
  const project = await createProject(app.db, {
    userId,
    name,
    createdAt: OCT_3,
    updatedAt: OCT_3,
  });
  for (let i = 0; i < versions; i++) {
    await createTrack(app.db, { userId, projectId: project.id });
  }
  return project;
}

async function seed(context: BrowserContext, versions = 3) {
  const user = await signIn(context);
  const project = await seedProject(user.id, versions);
  return { user, project };
}

const rows = (page: Page) => page.getByRole('main').getByRole('listitem');

async function openProjects(page: Page) {
  await page.goto('/app/projects');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Projects' }),
  ).toBeVisible();
}

test('loading', async ({ page, context }) => {
  await seed(context);
  await page.route('**/api/projects', () => {});
  await page.goto('/app/projects');
  await expect(
    page.getByRole('status', { name: 'Loading projects' }),
  ).toBeVisible();
  await captureScreenshot(page, 'projects-loading', { waitForIdle: false });
});

test('default', async ({ page, context }) => {
  await seed(context);
  await openProjects(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Midnight Drive');
  await expect(rows(page).first()).toContainText('3 versions');
  await expect(rows(page).first()).toContainText('Created Oct 3');
  await expect(page.getByText('Free plan: 1 of 1 projects')).toBeVisible();
  await captureScreenshot(page, 'projects-default');
});

test('opening a project goes to its page', async ({ page, context }) => {
  const { project } = await seed(context);
  await openProjects(page);
  await rows(page).first().getByRole('link').click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/projects/${project.id}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Midnight Drive' }),
  ).toBeVisible();
});

test('one version reads singular', async ({ page, context }) => {
  await seed(context, 1);
  await openProjects(page);
  await expect(rows(page).first()).toContainText('1 version · Created Oct 3');
});

test('a project with no versions', async ({ page, context }) => {
  const { project } = await seed(context, 0);
  await openProjects(page);
  await expect(rows(page).first()).toContainText('0 versions');
  await rows(page).first().getByRole('link').click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/projects/${project.id}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Midnight Drive' }),
  ).toBeVisible();
});

test('no projects redirects to onboarding', async ({ page, context }) => {
  await signIn(context);
  await page.goto('/app/projects');
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/start`);
});

test('only the own projects are listed', async ({ page, context }) => {
  await seed(context);
  const id = crypto.randomUUID();
  const { user: other } = await signedInUser(app, {
    email: `sam-${id}@example.com`,
    name: 'Sam Reed',
    authProviderId: `e2e-${id}`,
  });
  await seedProject(other.id, 1, 'Other Song');
  await openProjects(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Midnight Drive');
  await expect(page.getByText('Other Song')).toHaveCount(0);
});

test.describe('a request fails', () => {
  test.use({
    expectedConsoleError:
      /Failed to load resource: net::ERR_FAILED|AxiosError: Network Error/,
  });

  test('error loading, then Try again', async ({ page, context }) => {
    await seed(context);
    await page.route('**/api/projects', (route) => route.abort());
    await page.goto('/app/projects');
    await expect(page.getByRole('alert')).toContainText(
      "Couldn't load your projects",
    );
    await captureScreenshot(page, 'projects-error');

    await page.unroute('**/api/projects');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(rows(page).first()).toContainText('Midnight Drive');
  });

  test('usage unavailable', async ({ page, context }) => {
    await seed(context);
    let failures = 0;
    await page.route('**/api/usage', (route) => {
      failures++;
      return route.abort();
    });
    await openProjects(page);
    await expect(rows(page).first()).toContainText('Midnight Drive');
    // The first try and both retries.
    await expect.poll(() => failures).toBe(3);
    await expect(page.getByText(/Free plan:/)).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await captureScreenshot(page, 'projects-usage-unavailable');
  });
});
