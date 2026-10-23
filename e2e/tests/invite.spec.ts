import { randomBytes } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';
import { projectMembers } from '@repo/db';
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

const AVATAR_URL = 'https://avatars.example.test/maya.png';
const AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#f9c8a8"/><circle cx="32" cy="26" r="12" fill="#6b4a3a"/><rect x="14" y="42" width="36" height="22" rx="11" fill="#7a9cc6"/></svg>`;
const AUDIO = wav(5);

let app: Awaited<ReturnType<typeof createTestApp>>;

test.beforeAll(async () => {
  app = await createTestApp();
});

test.afterAll(async () => {
  await app.close();
});

test.beforeEach(async ({ page }) => {
  await page.route(AVATAR_URL, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: AVATAR_SVG }),
  );
  // The track page a join lands on asks storage for the audio; none runs in e2e.
  await page.route(`${STORAGE_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: 'audio/wav', body: AUDIO }),
  );
});

const newToken = () => randomBytes(32).toString('base64url');

async function newUser(name: string | null, picture: string | null = null) {
  const id = crypto.randomUUID();
  return createUser(app.db, {
    email: `user-${id}@example.com`,
    authProviderId: `e2e-${id}`,
    name,
    picture,
  });
}

// Maya Chen owns "Midnight Drive" with an active invite link.
async function seedInvite({
  versions = 3,
  ownerName = 'Maya Chen' as string | null,
} = {}) {
  const owner = await newUser(ownerName, AVATAR_URL);
  const token = newToken();
  const project = await createProject(app.db, {
    userId: owner.id,
    name: 'Midnight Drive',
    inviteToken: token,
  });
  const tracks = [];
  for (let i = 0; i < versions; i++) {
    tracks.push(
      await createTrack(app.db, { userId: owner.id, projectId: project.id }),
    );
  }
  return { owner, project, tracks, token };
}

async function signIn(context: BrowserContext, name = 'Sam Rivera') {
  const id = crypto.randomUUID();
  const { user, cookies } = await signedInUser(app, {
    email: `sam-${id}@example.com`,
    name,
    authProviderId: `e2e-${id}`,
  });
  await context.addCookies(cookies);
  return user;
}

async function membersOf(projectId: string, userId: string) {
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

const card = (page: Page) =>
  page.getByRole('heading', { level: 1, name: 'Midnight Drive' });

test('loading', async ({ page }) => {
  const { token } = await seedInvite();
  await page.route('**/api/invites/*', () => {});
  await page.goto(`/invite/${token}`);
  await expect(
    page.getByRole('status', { name: 'Loading invite' }),
  ).toBeVisible();
  await captureScreenshot(page, 'invite-loading', { waitForIdle: false });
});

test('signed out', async ({ page }) => {
  const { token } = await seedInvite();
  await page.goto(`/invite/${token}`);
  await expect(card(page)).toBeVisible();
  const main = page.getByRole('main');
  await expect(main).toContainText('Maya Chen invited you to collaborate on');
  await expect(main).toContainText(
    'Listen to every version and leave timestamped notes.',
  );
  await expect(
    main.getByRole('button', { name: 'Continue with Google' }),
  ).toBeVisible();
  await expect(main.getByRole('button', { name: 'Join project' })).toHaveCount(
    0,
  );
  await captureScreenshot(page, 'invite-signed-out');
});

test('signing in returns to the invite', async ({ page }) => {
  const { token } = await seedInvite();
  await page.route('**/api/auth/google/start*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' }),
  );
  await page.goto(`/invite/${token}`);
  const started = page.waitForRequest('**/api/auth/google/start*');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  const url = new URL((await started).url());
  expect(url.searchParams.get('next')).toBe(`/invite/${token}`);
});

test('signed in', async ({ page, context }) => {
  const { token } = await seedInvite();
  await signIn(context);
  await page.goto(`/invite/${token}`);
  const join = page.getByRole('button', { name: 'Join project' });
  await expect(join).toBeVisible();
  await expect(join).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Continue with Google' }),
  ).toHaveCount(0);
  await captureScreenshot(page, 'invite-signed-in');
});

test('opening the link changes nothing until Join', async ({
  page,
  context,
}) => {
  const { project, token } = await seedInvite();
  const user = await signIn(context);
  await page.goto(`/invite/${token}`);
  await expect(
    page.getByRole('button', { name: 'Join project' }),
  ).toBeVisible();
  expect(await membersOf(project.id, user.id)).toHaveLength(0);
});

test('joining', async ({ page, context }) => {
  const { token } = await seedInvite();
  await signIn(context);
  await page.route('**/api/invites/*/join', () => {});
  await page.goto(`/invite/${token}`);
  const join = page.getByRole('button', { name: 'Join project' });
  await join.click();
  await expect(join).toHaveAttribute('aria-busy', 'true');
  await captureScreenshot(page, 'invite-joining', { waitForIdle: false });
});

test('Join lands on the newest version', async ({ page, context }) => {
  const { project, tracks, token } = await seedInvite();
  const user = await signIn(context);
  await page.goto(`/invite/${token}`);
  await page.getByRole('button', { name: 'Join project' }).click();
  await expect(page).toHaveURL(
    `${WEB_ORIGIN}/app/projects/${project.id}/tracks/${tracks[2]?.id}`,
  );
  expect(await membersOf(project.id, user.id)).toHaveLength(1);
});

test('Join lands on the project when it has no versions', async ({
  page,
  context,
}) => {
  const { project, token } = await seedInvite({ versions: 0 });
  await signIn(context);
  await page.goto(`/invite/${token}`);
  await page.getByRole('button', { name: 'Join project' }).click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/projects/${project.id}`);
  await expect(card(page)).toBeVisible();
});

test('owner goes straight to the project', async ({ page, context }) => {
  const id = crypto.randomUUID();
  const { user, cookies } = await signedInUser(app, {
    email: `maya-${id}@example.com`,
    name: 'Maya Chen',
    authProviderId: `e2e-${id}`,
  });
  await context.addCookies(cookies);
  const token = newToken();
  const project = await createProject(app.db, {
    userId: user.id,
    name: 'Midnight Drive',
    inviteToken: token,
  });
  const track = await createTrack(app.db, {
    userId: user.id,
    projectId: project.id,
  });
  await page.goto(`/invite/${token}`);
  await expect(page).toHaveURL(
    `${WEB_ORIGIN}/app/projects/${project.id}/tracks/${track.id}`,
  );
});

test('a collaborator goes straight to the project', async ({
  page,
  context,
}) => {
  const { project, tracks, token } = await seedInvite();
  const user = await signIn(context);
  await createMember(app.db, { projectId: project.id, userId: user.id });
  await page.goto(`/invite/${token}`);
  await expect(page).toHaveURL(
    `${WEB_ORIGIN}/app/projects/${project.id}/tracks/${tracks[2]?.id}`,
  );
  expect(await membersOf(project.id, user.id)).toHaveLength(1);
});

test('a session lost on the invite page shows the signed-out card', async ({
  page,
  context,
}) => {
  const { token } = await seedInvite();
  await signIn(context);
  const unauthorized = { status: 401, json: { error: 'unauthorized' } };
  await page.route('**/api/invites/*/membership', (route) =>
    route.fulfill(unauthorized),
  );
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill(unauthorized),
  );
  await page.goto(`/invite/${token}`);
  await expect(card(page)).toBeVisible();
  await expect(
    page
      .getByRole('main')
      .getByRole('button', { name: 'Continue with Google' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join project' })).toHaveCount(
    0,
  );
  await expect(page).toHaveURL(`${WEB_ORIGIN}/invite/${token}`);
});

test('invalid link', async ({ page }) => {
  await page.goto(`/invite/${newToken()}`);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: "This invite link isn't valid anymore",
    }),
  ).toBeVisible();
  await expect(page.getByRole('main')).toContainText(
    'Ask the project owner for a new link.',
  );
  await expect(page.getByRole('main')).not.toContainText('Midnight Drive');
  const home = page.getByRole('link', { name: 'Go to mixmallow' });
  await expect(home).toHaveAttribute('href', '/');
  await captureScreenshot(page, 'invite-invalid');
});

test('a malformed link is invalid without asking the server', async ({
  page,
  context,
}) => {
  await signIn(context);
  let asked = false;
  await page.route('**/api/invites/**', (route) => {
    asked = true;
    return route.fallback();
  });
  await page.goto('/invite/not-a-token');
  await expect(
    page.getByRole('heading', { name: "This invite link isn't valid anymore" }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Go to mixmallow' }),
  ).toHaveAttribute('href', '/app');
  expect(asked).toBe(false);
});

test('a link reset while the card is open is invalid on Join', async ({
  page,
  context,
}) => {
  const { token } = await seedInvite();
  await signIn(context);
  await page.route('**/api/invites/*/join', (route) =>
    route.fulfill({ status: 404, json: { error: 'not_found' } }),
  );
  await page.goto(`/invite/${token}`);
  await page.getByRole('button', { name: 'Join project' }).click();
  await expect(
    page.getByRole('heading', { name: "This invite link isn't valid anymore" }),
  ).toBeVisible();
});

test.describe('the project is full', () => {
  test.use({ expectedConsoleError: /status of 403/ });

  test('project full', async ({ page, context }) => {
    const { project, token } = await seedInvite();
    for (let i = 0; i < 10; i++) {
      const member = await newUser(`Member ${i + 1}`);
      await createMember(app.db, { projectId: project.id, userId: member.id });
    }
    const user = await signIn(context);
    await page.goto(`/invite/${token}`);
    await page.getByRole('button', { name: 'Join project' }).click();
    const full = page.getByRole('status').filter({
      hasText: 'This project is full',
    });
    await expect(full).toContainText('Ask Maya to make room.');
    await expect(card(page)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Join project' }),
    ).toHaveCount(0);
    expect(await membersOf(project.id, user.id)).toHaveLength(0);
    await captureScreenshot(page, 'invite-full');
  });

  test('a nameless owner', async ({ page, context }) => {
    const { token } = await seedInvite({ ownerName: null });
    await signIn(context);
    await page.route('**/api/invites/*/join', (route) =>
      route.fulfill({ status: 403, json: { error: 'project_full' } }),
    );
    await page.goto(`/invite/${token}`);
    await expect(page.getByRole('main')).toContainText(
      'Someone invited you to collaborate on',
    );
    await page.getByRole('button', { name: 'Join project' }).click();
    await expect(page.getByRole('main')).toContainText(
      'Ask the project owner to make room.',
    );
  });
});

test.describe('error', () => {
  test.use({ expectedConsoleError: /status of 500/ });

  test('error loading, then Try again', async ({ page }) => {
    const { token } = await seedInvite();
    let fail = true;
    await page.route(`**/api/invites/${token}`, (route) =>
      fail
        ? route.fulfill({ status: 500, json: { error: 'internal' } })
        : route.fallback(),
    );
    await page.goto(`/invite/${token}`);
    // Two retries with backoff (~3 s) come before the error state.
    await expect(page.getByText("Couldn't load this invite")).toBeVisible({
      timeout: 10_000,
    });
    await captureScreenshot(page, 'invite-error');
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(card(page)).toBeVisible();
  });

  test('a failed join shows a toast and keeps the button', async ({
    page,
    context,
  }) => {
    const { token } = await seedInvite();
    await signIn(context);
    await page.route('**/api/invites/*/join', (route) =>
      route.fulfill({ status: 500, json: { error: 'internal' } }),
    );
    await page.goto(`/invite/${token}`);
    const join = page.getByRole('button', { name: 'Join project' });
    await join.click();
    await expect(
      page.getByText("Couldn't join the project. Try again."),
    ).toBeVisible();
    await expect(join).not.toHaveAttribute('aria-busy', 'true');
  });
});
