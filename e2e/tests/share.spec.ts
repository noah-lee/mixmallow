import { randomBytes } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';
import { projectMembers, projects } from '@repo/db';
import { and, eq } from 'drizzle-orm';
import { createTestApp } from '../../apps/api/test/helpers/app.ts';
import {
  createMember,
  createProject,
  createTrack,
  createUser,
} from '../../apps/api/test/helpers/factories.ts';
import { wav } from '../support/audio.ts';
import { STORAGE_ORIGIN, WEB_ORIGIN } from '../support/env.ts';
import { captureScreenshot, expect, test } from '../support/fixtures.ts';
import { signedInUser } from '../support/session.ts';

const SAM_AVATAR = 'https://avatars.example.test/sam.png';
const AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#b8d8c8"/><circle cx="32" cy="26" r="12" fill="#4a3a2a"/><rect x="14" y="42" width="36" height="22" rx="11" fill="#c67a9c"/></svg>`;
const YEAR = new Date().getFullYear();

let app: Awaited<ReturnType<typeof createTestApp>>;

test.beforeAll(async () => {
  app = await createTestApp();
});

test.afterAll(async () => {
  await app.close();
});

test.beforeEach(async ({ page }) => {
  await page.route(SAM_AVATAR, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: AVATAR_SVG }),
  );
  await page.route(`${STORAGE_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'audio/wav', body: wav(5) }),
  );
});

async function newUser(name: string, picture: string | null = null) {
  const id = crypto.randomUUID();
  return createUser(app.db, {
    email: `user-${id}@example.com`,
    authProviderId: `e2e-${id}`,
    name,
    picture,
  });
}

async function signIn(context: BrowserContext, name: string) {
  const id = crypto.randomUUID();
  const { user, cookies } = await signedInUser(app, {
    email: `user-${id}@example.com`,
    name,
    authProviderId: `e2e-${id}`,
  });
  await context.addCookies(cookies);
  return user;
}

// Maya Chen (signed in) owns "Midnight Drive"; Sam joined on Oct 20. More collaborators
// than the free plan allows stand for a project from before the limit.
async function seedOwner(
  context: BrowserContext,
  {
    collaborators = 1,
    link = false,
  }: { collaborators?: number; link?: boolean } = {},
) {
  const owner = await signIn(context, 'Maya Chen');
  const project = await createProject(app.db, {
    userId: owner.id,
    name: 'Midnight Drive',
    inviteToken: link ? randomBytes(32).toString('base64url') : null,
  });
  const names = ['Sam Rivera', 'Jo Park'];
  const members = [];
  for (let i = 0; i < collaborators; i++) {
    const user = await newUser(
      names[i] ?? `Guest ${i + 1}`,
      i === 0 ? SAM_AVATAR : null,
    );
    await createMember(app.db, {
      projectId: project.id,
      userId: user.id,
      createdAt: new Date(
        `${YEAR}-10-${String(20 + i).padStart(2, '0')}T12:00:00Z`,
      ),
    });
    members.push(user);
  }
  return { owner, project, members };
}

async function membership(projectId: string, userId: string) {
  return app.db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    );
}

async function openSheet(page: Page, projectId: string, button = 'Share') {
  await page.goto(`/app/projects/${projectId}`);
  await page.getByRole('button', { name: button, exact: true }).click();
  return page.getByRole('dialog', {
    name: button === 'Share' ? 'Share project' : 'Members',
  });
}

const memberRow = (sheet: ReturnType<Page['getByRole']>, name: string) =>
  sheet.getByRole('listitem').filter({ hasText: name });

const countLine = (sheet: ReturnType<Page['getByRole']>) =>
  sheet.getByText(/^\d+ of \d+ collaborators?$/);

const FULL_COPY = "New people can't join until you remove someone.";

test('loading', async ({ page, context }) => {
  const { project } = await seedOwner(context);
  await page.route('**/api/projects/*/members', () => {});
  await page.route('**/api/projects/*/invite', () => {});
  const sheet = await openSheet(page, project.id);
  await expect(
    sheet.getByRole('status', { name: 'Loading members' }),
  ).toBeVisible();
  await expect(
    sheet.getByRole('status', { name: 'Loading invite link' }),
  ).toBeVisible();
  await captureScreenshot(page, 'share-loading', {
    fullPage: false,
    waitForIdle: false,
  });
});

test('no link, no collaborators yet', async ({ page, context }) => {
  const { project } = await seedOwner(context, { collaborators: 0 });
  const sheet = await openSheet(page, project.id);
  await expect(
    sheet.getByRole('button', { name: 'Create invite link' }),
  ).toBeVisible();
  await expect(countLine(sheet)).toHaveText('0 of 1 collaborator');
  await expect(countLine(sheet)).not.toHaveClass(/text-warning/);
  await expect(sheet).not.toContainText(FULL_COPY);
  await expect(
    sheet.getByText('No one has joined yet.', { exact: true }),
  ).toBeVisible();
  const me = memberRow(sheet, 'You');
  await expect(me).toContainText('Owner');
  await expect(me.getByRole('button')).toHaveCount(0);
  await captureScreenshot(page, 'share-no-link', { fullPage: false });
});

test('link on', async ({ page, context }) => {
  const { project } = await seedOwner(context, {
    collaborators: 0,
    link: true,
  });
  const sheet = await openSheet(page, project.id);
  const field = sheet.getByRole('textbox', { name: 'Invite link' });
  await expect(field).toHaveValue(
    new RegExp(`^${WEB_ORIGIN}/invite/[A-Za-z0-9_-]{43}$`),
  );
  await expect(countLine(sheet)).toHaveText('0 of 1 collaborator');
  await expect(sheet.getByRole('button', { name: 'Copy link' })).toBeVisible();
  await expect(sheet).toContainText(
    'No one has joined yet. Share the link to invite someone.',
  );
  await captureScreenshot(page, 'share-link-on', { fullPage: false });
});

test('full', async ({ page, context }) => {
  const { project } = await seedOwner(context, { link: true });
  const sheet = await openSheet(page, project.id);
  await expect(countLine(sheet)).toHaveText('1 of 1 collaborator');
  await expect(countLine(sheet)).toHaveClass(/text-warning/);
  await expect(sheet).toContainText(FULL_COPY);
  const names = sheet.getByRole('listitem');
  await expect(names).toHaveCount(2);
  await expect(names.nth(0)).toContainText('You');
  await expect(names.nth(0)).toContainText('Owner');
  await expect(names.nth(1)).toContainText('Sam Rivera');
  await expect(names.nth(1)).toContainText('Joined Oct 20');
  await expect(
    sheet.getByRole('button', { name: 'Remove Sam Rivera' }),
  ).toBeVisible();
  await expect(sheet.getByText(/@example\.com/)).toHaveCount(0);
  await captureScreenshot(page, 'share-full', { fullPage: false });
});

test('over the limit from before', async ({ page, context }) => {
  const { project } = await seedOwner(context, {
    collaborators: 3,
    link: true,
  });
  const sheet = await openSheet(page, project.id);
  await expect(countLine(sheet)).toHaveText('3 of 1 collaborator');
  await expect(countLine(sheet)).toHaveClass(/text-warning/);
  await expect(sheet).toContainText(FULL_COPY);
  await expect(sheet.getByRole('listitem')).toHaveCount(4);
  await expect(
    sheet.getByRole('button', { name: 'Remove Jo Park' }),
  ).toBeVisible();
  await captureScreenshot(page, 'share-over-limit', { fullPage: false });
});

test('collaborator view', async ({ page, context }) => {
  const owner = await newUser('Maya Chen');
  const project = await createProject(app.db, {
    userId: owner.id,
    name: 'Midnight Drive',
    inviteToken: randomBytes(32).toString('base64url'),
  });
  const me = await signIn(context, 'Sam Rivera');
  await createMember(app.db, {
    projectId: project.id,
    userId: me.id,
    createdAt: new Date(`${YEAR}-10-20T12:00:00Z`),
  });
  const sheet = await openSheet(page, project.id, 'Members');
  const names = sheet.getByRole('listitem');
  await expect(names).toHaveCount(2);
  await expect(names.nth(0)).toContainText('Maya Chen');
  await expect(names.nth(0)).toContainText('Owner');
  await expect(names.nth(1)).toContainText('You');
  await expect(sheet.getByRole('textbox')).toHaveCount(0);
  await expect(sheet.getByText(/@example\.com/)).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
  await expect(countLine(sheet)).toHaveCount(0);
  await expect(sheet).not.toContainText(FULL_COPY);
  await expect(
    sheet.getByRole('button', { name: 'Leave project' }),
  ).toBeVisible();
  await captureScreenshot(page, 'share-collaborator', { fullPage: false });
});

test.describe('action failed', () => {
  test.use({ expectedConsoleError: /status of 500/ });

  test('shows a toast and keeps the sheet open', async ({ page, context }) => {
    const { project } = await seedOwner(context, { collaborators: 0 });
    await page.route('**/api/projects/*/invite', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, json: { error: 'internal' } })
        : route.fallback(),
    );
    const sheet = await openSheet(page, project.id);
    await sheet.getByRole('button', { name: 'Create invite link' }).click();
    await expect(
      page.getByText("Couldn't update the invite link. Try again."),
    ).toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: 'Create invite link' }),
    ).toBeEnabled();
    await captureScreenshot(page, 'share-action-failed', { fullPage: false });
  });
});

test('project gone while open', async ({ page, context }) => {
  const { project } = await seedOwner(context, { collaborators: 0 });
  const sheet = await openSheet(page, project.id);
  await expect(
    sheet.getByRole('button', { name: 'Create invite link' }),
  ).toBeVisible();
  await app.db.delete(projects).where(eq(projects.id, project.id));
  await sheet.getByRole('button', { name: 'Create invite link' }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole('heading', { name: "This project doesn't exist" }),
  ).toBeVisible();
  await captureScreenshot(page, 'share-gone');
});

test('create, copy, reset and turn off the link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: WEB_ORIGIN,
  });
  const { project } = await seedOwner(context, { collaborators: 0 });
  const sheet = await openSheet(page, project.id);
  await sheet.getByRole('button', { name: 'Create invite link' }).click();
  const field = sheet.getByRole('textbox', { name: 'Invite link' });
  await expect(field).toHaveValue(/\/invite\//);
  const first = await field.inputValue();

  await sheet.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Link copied')).toBeVisible();
  // A string, so it isn't typechecked against Node's globals.
  expect(await page.evaluate('navigator.clipboard.readText()')).toBe(first);

  await sheet.getByRole('button', { name: 'Reset link' }).click();
  const reset = page.getByRole('alertdialog', {
    name: 'Reset the invite link?',
  });
  await reset.getByRole('button', { name: 'Reset link' }).click();
  await expect(reset).toBeHidden();
  await expect(field).not.toHaveValue(first);
  const second = await field.inputValue();
  const [row] = await app.db
    .select({ token: projects.inviteToken })
    .from(projects)
    .where(eq(projects.id, project.id));
  expect(second).toBe(`${WEB_ORIGIN}/invite/${row?.token}`);

  await sheet.getByRole('button', { name: 'Turn off link' }).click();
  const off = page.getByRole('alertdialog', {
    name: 'Turn off the invite link?',
  });
  await off.getByRole('button', { name: 'Turn off link' }).click();
  await expect(off).toBeHidden();
  await expect(
    sheet.getByRole('button', { name: 'Create invite link' }),
  ).toBeVisible();
  const [after] = await app.db
    .select({ token: projects.inviteToken })
    .from(projects)
    .where(eq(projects.id, project.id));
  expect(after?.token).toBeNull();
});

test('owner removes a collaborator', async ({ page, context }) => {
  const { project, members } = await seedOwner(context, { link: true });
  const sam = members[0];
  if (!sam) throw new Error('no collaborator');
  const sheet = await openSheet(page, project.id);
  await sheet.getByRole('button', { name: 'Remove Sam Rivera' }).click();
  const confirm = page.getByRole('alertdialog', {
    name: 'Remove Sam from Midnight Drive?',
  });
  await expect(confirm).toContainText(
    'Their notes and versions stay. They can rejoin with the current link, so reset it to stop that.',
  );
  await captureScreenshot(page, 'share-remove-confirm', { fullPage: false });
  await confirm.getByRole('button', { name: 'Remove' }).click();
  await expect(confirm).toBeHidden();
  await expect(memberRow(sheet, 'Sam Rivera')).toHaveCount(0);
  await expect(countLine(sheet)).toHaveText('0 of 1 collaborator');
  await expect(sheet).not.toContainText(FULL_COPY);
  expect(await membership(project.id, sam.id)).toHaveLength(0);
});

test('collaborator leaves', async ({ page, context }) => {
  const owner = await newUser('Maya Chen');
  const project = await createProject(app.db, {
    userId: owner.id,
    name: 'Midnight Drive',
  });
  const me = await signIn(context, 'Sam Rivera');
  // Their own project keeps /app/projects from redirecting to first-upload.
  await createProject(app.db, { userId: me.id, name: "Sam's song" });
  await createMember(app.db, { projectId: project.id, userId: me.id });
  const sheet = await openSheet(page, project.id, 'Members');
  await sheet.getByRole('button', { name: 'Leave project' }).click();
  const confirm = page.getByRole('alertdialog', {
    name: 'Leave Midnight Drive?',
  });
  await expect(confirm).toContainText(
    'Your notes and versions stay in the project.',
  );
  await captureScreenshot(page, 'share-leave-confirm', { fullPage: false });
  await confirm.getByRole('button', { name: 'Leave project' }).click();
  await expect(page).toHaveURL(/\/app\/projects$/);
  await expect(page.getByRole('link', { name: /Sam's song/ })).toBeVisible();
  await expect(page.getByText('Midnight Drive')).toHaveCount(0);
  expect(await membership(project.id, me.id)).toHaveLength(0);
});

test('opens from the track page', async ({ page, context }) => {
  const { owner, project } = await seedOwner(context, { link: true });
  const track = await createTrack(app.db, {
    userId: owner.id,
    projectId: project.id,
  });
  await page.goto(`/app/projects/${project.id}/tracks/${track.id}`);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Share project' });
  await expect(sheet.getByRole('listitem')).toHaveCount(2);
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
});
