import type { BrowserContext, Page } from '@playwright/test';
import { createTestApp } from '../../apps/api/test/helpers/app.ts';
import {
  createProject,
  createTrack,
} from '../../apps/api/test/helpers/factories.ts';
import { SIGNED_OUT, WEB_ORIGIN } from '../support/env.ts';
import { captureScreenshot, expect, test } from '../support/fixtures.ts';
import { signedInUser } from '../support/session.ts';

let app: Awaited<ReturnType<typeof createTestApp>>;

test.beforeAll(async () => {
  app = await createTestApp();
});

test.afterAll(async () => {
  await app.close();
});

async function signInWithProject(context: BrowserContext) {
  const id = crypto.randomUUID();
  const { user, cookies } = await signedInUser(app, {
    email: `maya-${id}@example.com`,
    name: 'Maya Lopez',
    authProviderId: `e2e-${id}`,
  });
  await context.addCookies(cookies);
  const project = await createProject(app.db, {
    userId: user.id,
    name: 'Midnight Drive',
  });
  await createTrack(app.db, { userId: user.id, projectId: project.id });
  return project;
}

// The project page also has a "Projects" back link, so stay inside the header.
const projectsLink = (page: Page) =>
  page.getByRole('banner').getByRole('link', { name: 'Projects' });

test('signed in', async ({ page, context }) => {
  await signInWithProject(context);
  await page.goto('/account');
  await expect(projectsLink(page)).toBeVisible();
  await expect(projectsLink(page)).not.toHaveAttribute('aria-current');
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Account' }),
  ).toBeVisible();
  const box = await projectsLink(page).boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await captureScreenshot(page, 'site-header-signed-in');
});

test('Projects opens the projects list', async ({ page, context }) => {
  await signInWithProject(context);
  await page.goto('/account');
  await projectsLink(page).click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/projects`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Projects' }),
  ).toBeVisible();
  await expect(projectsLink(page)).toHaveAttribute('aria-current', 'page');
  // Off the link, so the shot shows the active state without hover.
  await page.mouse.move(0, 0);
  await captureScreenshot(page, 'site-header-on-projects');
});

test('Projects opens the list from a project page', async ({
  page,
  context,
}) => {
  const project = await signInWithProject(context);
  await page.goto(`/app/projects/${project.id}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Midnight Drive' }),
  ).toBeVisible();
  await expect(projectsLink(page)).toHaveAttribute('aria-current', 'location');
  await expect(projectsLink(page)).toHaveAttribute('data-status', 'active');
  await projectsLink(page).click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/projects`);
});

test.describe('signed out', () => {
  test.use({ storageState: SIGNED_OUT });

  test('signed out', async ({ page }) => {
    await page.goto('/privacy');
    await expect(
      page.getByRole('banner').getByRole('button', { name: 'Sign in' }),
    ).toBeVisible();
    await expect(projectsLink(page)).toHaveCount(0);
    await captureScreenshot(page, 'site-header-signed-out');
  });
});
