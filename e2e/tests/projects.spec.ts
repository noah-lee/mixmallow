import type { BrowserContext, Page } from '@playwright/test';
import { createTestApp } from '../../apps/api/test/helpers/app.ts';
import {
  createMember,
  createProject,
  createTrack,
  createUser,
} from '../../apps/api/test/helpers/factories.ts';
import { WEB_ORIGIN } from '../support/env.ts';
import { captureScreenshot, expect, test } from '../support/fixtures.ts';
import { signedInUser } from '../support/session.ts';

// This year, so the row's date has no year: "Created Oct 3".
const OCT_3 = new Date(new Date().getFullYear(), 9, 3, 12);
const OCT_18 = new Date(new Date().getFullYear(), 9, 18, 12);
const OCT_20 = new Date(new Date().getFullYear(), 9, 20, 12);

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

async function seedShared(
  memberId: string,
  {
    name = 'Glass Hours',
    owner = 'Jo Park' as string | null,
    versions = 2,
    joinedAt = OCT_20,
  } = {},
) {
  const id = crypto.randomUUID();
  const user = await createUser(app.db, {
    email: `owner-${id}@example.com`,
    authProviderId: `e2e-${id}`,
    name: owner,
  });
  const project = await seedProject(user.id, versions, name);
  await createMember(app.db, {
    projectId: project.id,
    userId: memberId,
    createdAt: joinedAt,
  });
  return project;
}

const section = (page: Page, name: string) =>
  page.getByRole('region', { name });

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
  await expect(
    page.getByText('Free plan: 1 of 3 projects', { exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, 'projects-default');
});

const newProject = (page: Page) =>
  page.getByRole('main').getByRole('link', { name: 'New project' });

test('room for a new project', async ({ page, context }) => {
  const { user } = await seed(context);
  await seedProject(user.id, 1, 'Late Bloom');
  await openProjects(page);
  await expect(rows(page)).toHaveCount(2);
  await expect(newProject(page)).toBeEnabled();
  await expect(
    page.getByText('Free plan: 2 of 3 projects', { exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, 'projects-new-project');

  await newProject(page).click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/start`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Start a new project' }),
  ).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Projects' }).click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/projects`);
});

test('at the project limit', async ({ page, context }) => {
  const { user } = await seed(context);
  await seedProject(user.id, 1, 'Late Bloom');
  await seedProject(user.id, 2, 'Paper Moon');
  await openProjects(page);
  await expect(rows(page)).toHaveCount(3);
  const button = page.getByRole('button', { name: 'New project' });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAccessibleDescription(
    'Free plan: 3 of 3 projects. Delete one to start another.',
  );
  await expect(newProject(page)).toHaveCount(0);
  await expect(
    page.getByText('Free plan: 3 of 3 projects', { exact: true }),
  ).toHaveCount(0);
  await captureScreenshot(page, 'projects-at-limit');

  await page.goto('/app/start');
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/projects`);
});

test('deleting a project at the limit frees the button', async ({
  page,
  context,
}) => {
  const { user } = await seed(context);
  await seedProject(user.id, 1, 'Late Bloom');
  const extra = await seedProject(user.id, 1, 'Paper Moon');
  await openProjects(page);
  await expect(
    page.getByRole('button', { name: 'New project' }),
  ).toBeDisabled();
  const res = await page.request.delete(`/api/projects/${extra.id}`);
  expect(res.ok()).toBe(true);
  await page.reload();
  await expect(newProject(page)).toBeEnabled();
  await expect(
    page.getByText('Free plan: 2 of 3 projects', { exact: true }),
  ).toBeVisible();
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

test('shared with you', async ({ page, context }) => {
  const { user } = await seed(context);
  await seedShared(user.id);
  await openProjects(page);

  const own = section(page, 'Your projects');
  await expect(own.getByRole('listitem')).toHaveCount(1);
  await expect(own.getByRole('listitem')).toContainText(
    'Midnight Drive3 versions · Created Oct 3',
  );
  await expect(
    own.getByText('Free plan: 1 of 3 projects', { exact: true }),
  ).toBeVisible();

  const shared = section(page, 'Shared with you');
  await expect(shared.getByRole('listitem')).toHaveCount(1);
  await expect(shared.getByRole('listitem')).toContainText(
    'Glass HoursShared by Jo Park2 versions · Joined Oct 20',
  );
  await captureScreenshot(page, 'projects-shared');
});

test('only shared projects', async ({ page, context }) => {
  const user = await signIn(context);
  await seedShared(user.id);
  await openProjects(page);

  const own = section(page, 'Your projects');
  await expect(own.getByRole('listitem')).toHaveCount(0);
  await expect(own).toContainText("You don't have a project yet");
  await expect(newProject(page)).toHaveCount(0);
  await expect(
    own.getByText('Free plan: 0 of 3 projects', { exact: true }),
  ).toBeVisible();
  await expect(
    section(page, 'Shared with you').getByRole('listitem'),
  ).toContainText('Glass Hours');
  await captureScreenshot(page, 'projects-shared-only');

  await own.getByRole('link', { name: 'Upload a track' }).click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/start`);
});

test('no shared projects shows no section titles', async ({
  page,
  context,
}) => {
  await seed(context);
  await openProjects(page);
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
  await expect(page.getByText('Shared with you')).toHaveCount(0);
});

test('shared projects list newest joined first', async ({ page, context }) => {
  const { user } = await seed(context);
  await seedShared(user.id, { name: 'Older Join', joinedAt: OCT_18 });
  await seedShared(user.id, { name: 'Newer Join', joinedAt: OCT_20 });
  await openProjects(page);
  const shared = section(page, 'Shared with you').getByRole('listitem');
  await expect(shared).toHaveCount(2);
  await expect(shared.nth(0)).toContainText('Newer Join');
  await expect(shared.nth(1)).toContainText('Older Join');
});

test('a shared project by an unnamed owner, one version', async ({
  page,
  context,
}) => {
  const user = await signIn(context);
  await seedShared(user.id, { owner: null, versions: 1 });
  await openProjects(page);
  await expect(
    section(page, 'Shared with you').getByRole('listitem'),
  ).toContainText('Shared by Unnamed user1 version · Joined Oct 20');
});

test('opening a shared project goes to its page', async ({ page, context }) => {
  const user = await signIn(context);
  const project = await seedShared(user.id);
  await openProjects(page);
  await section(page, 'Shared with you').getByRole('link').click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/projects/${project.id}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Glass Hours' }),
  ).toBeVisible();
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
    await expect(newProject(page)).toBeEnabled();
    await captureScreenshot(page, 'projects-usage-unavailable');
  });
});
