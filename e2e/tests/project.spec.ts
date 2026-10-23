import { closeSync, ftruncateSync, openSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { projectMembers } from '@repo/db';
import { and, eq } from 'drizzle-orm';
import { createTestApp } from '../../apps/api/test/helpers/app.ts';
import {
  createMember,
  createNote,
  createProject,
  createTrack,
  createUser,
} from '../../apps/api/test/helpers/factories.ts';
import { mp3, wav } from '../support/audio.ts';
import { STORAGE_ORIGIN, WEB_ORIGIN } from '../support/env.ts';
import { captureScreenshot, expect, test } from '../support/fixtures.ts';
import { signedInUser } from '../support/session.ts';

const MB = 1_048_576;

// No storage exists in e2e, so the browser's PUTs are always answered here.
const STORAGE = `${STORAGE_ORIGIN}/**`;
const CORS = { 'Access-Control-Allow-Origin': '*' };

const MIX = {
  name: 'Midnight Drive — final.mp3',
  mimeType: 'audio/mpeg',
  buffer: mp3(),
};

const LIMITS_LINE = 'MP3, AAC or M4A · up to 20 MB per file';
const FORMAT_MESSAGE =
  'Upload an MP3, AAC or M4A file. Export your mix as a 320 kbps MP3 to upload it.';

type Version = {
  name: string;
  format: 'wav' | 'mp3';
  sizeBytes: number;
  durationMs: number;
  date: string;
  notes: number;
  done: number;
};

// Oldest first, so versions number 1, 2, 3.
const SAMPLE: Version[] = [
  {
    name: 'Midnight Drive rough',
    format: 'wav',
    sizeBytes: Math.round(42.1 * MB),
    durationMs: 249_000,
    date: '2026-10-03T15:00:00Z',
    notes: 11,
    done: 11,
  },
  {
    name: 'Midnight Drive',
    format: 'mp3',
    sizeBytes: Math.round(9.7 * MB),
    durationMs: 252_000,
    date: '2026-10-12T15:00:00Z',
    notes: 7,
    done: 4,
  },
  {
    name: 'Midnight Drive — vox up',
    format: 'mp3',
    sizeBytes: Math.round(9.8 * MB),
    durationMs: 252_000,
    date: '2026-10-18T15:00:00Z',
    notes: 2,
    done: 0,
  },
];

let app: Awaited<ReturnType<typeof createTestApp>>;

test.beforeAll(async () => {
  app = await createTestApp();
});

test.afterAll(async () => {
  await app.close();
});

// Each test gets its own user, so tests don't share (or race on) one project.
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
  context: BrowserContext,
  versions: Version[] = SAMPLE,
) {
  const user = await signIn(context);
  const project = await createProject(app.db, {
    userId: user.id,
    name: 'Midnight Drive',
  });
  const tracks = await addVersions(user.id, project.id, versions);
  return { user, project, tracks };
}

async function addVersions(
  userId: string,
  projectId: string,
  versions: Version[],
) {
  const tracks = [];
  for (const v of versions) {
    const track = await createTrack(app.db, {
      userId,
      projectId,
      name: v.name,
      format: v.format,
      contentType: v.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      sizeBytes: v.sizeBytes,
      durationMs: v.durationMs,
      createdAt: new Date(v.date),
    });
    for (let i = 0; i < v.notes; i++) {
      await createNote(app.db, {
        userId,
        trackId: track.id,
        timestampMs: i * 1000,
        done: i < v.done,
      });
    }
    tracks.push(track);
  }
  return tracks;
}

const SAM_AVATAR = 'https://avatars.example.test/sam.png';
const AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#b8d8c8"/><circle cx="32" cy="26" r="12" fill="#4a3a2a"/><rect x="14" y="42" width="36" height="22" rx="11" fill="#c67a9c"/></svg>`;

async function newUser(name: string, picture: string | null = null) {
  const id = crypto.randomUUID();
  return createUser(app.db, {
    email: `user-${id}@example.com`,
    authProviderId: `e2e-${id}`,
    name,
    picture,
  });
}

// Maya Chen owns "Midnight Drive"; the signed-in Sam Rivera joined it and uploaded `mine`
// after Maya's versions.
async function seedShared(
  context: BrowserContext,
  versions: Version[] = SAMPLE,
  mine: Version[] = [],
) {
  const owner = await newUser('Maya Chen');
  const project = await createProject(app.db, {
    userId: owner.id,
    name: 'Midnight Drive',
  });
  const tracks = await addVersions(owner.id, project.id, versions);
  const id = crypto.randomUUID();
  const { user: me, cookies } = await signedInUser(app, {
    email: `sam-${id}@example.com`,
    name: 'Sam Rivera',
    authProviderId: `e2e-${id}`,
  });
  await context.addCookies(cookies);
  await createMember(app.db, { projectId: project.id, userId: me.id });
  tracks.push(...(await addVersions(me.id, project.id, mine)));
  return { owner, me, project, tracks };
}

const SAM_MIX: Version = {
  name: 'Midnight Drive — Sam mix',
  format: 'mp3',
  sizeBytes: Math.round(9.1 * MB),
  durationMs: 252_000,
  date: '2026-10-23T15:00:00Z',
  notes: 0,
  done: 0,
};

const projectUrl = (id: string) => `/app/projects/${id}`;
const rows = (page: Page) => page.getByRole('region', { name: 'Versions' });
const row = (page: Page, label: string) =>
  rows(page)
    .getByRole('listitem')
    .filter({ hasText: new RegExp(`^${label}`) });
const fileInput = (page: Page) => page.locator('input[type="file"]');
const backLink = (page: Page) =>
  page.getByRole('link', { name: 'Back to projects' });

// Sparse, so it costs no disk; the size checks run before anything reads it.
function sparseFile(path: string, sizeBytes: number) {
  const fd = openSync(path, 'w');
  ftruncateSync(fd, sizeBytes);
  closeSync(fd);
  return path;
}

function watchRegistration(page: Page) {
  const seen = { registered: false };
  page.on('request', (req) => {
    if (req.url().endsWith('/api/uploads')) seen.registered = true;
  });
  return seen;
}

async function openProject(page: Page, id: string) {
  await page.goto(projectUrl(id));
  await expect(
    page.getByRole('heading', { level: 1, name: 'Midnight Drive' }),
  ).toBeVisible();
}

test('loading', async ({ page, context }) => {
  const { project } = await seedProject(context);
  await page.route(`**/api/projects/${project.id}`, () => {});
  await page.goto(projectUrl(project.id));
  await expect(
    page.getByRole('status', { name: 'Loading project' }),
  ).toBeVisible();
  await expect(backLink(page)).toBeVisible();
  await captureScreenshot(page, 'project-loading', { waitForIdle: false });
});

test('default', async ({ page, context }) => {
  const { project } = await seedProject(context);
  await openProject(page, project.id);
  await expect(page.getByText('61.6 MB of 500 MB')).toBeVisible();
  await expect(page.getByText(LIMITS_LINE)).toBeVisible();
  const items = rows(page).getByRole('listitem');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText('v3');
  await expect(items.nth(0)).toContainText('Midnight Drive — vox up');
  await expect(items.nth(0)).toContainText('4:12 · 9.8 MB · MP3 · Oct 18');
  await expect(items.nth(0)).toContainText('2 notes · 0 done');
  await expect(items.nth(1)).toContainText('7 notes · 4 done');
  await expect(items.nth(2)).toContainText('4:09 · 42.1 MB · WAV · Oct 3');
  await expect(items.nth(2)).toContainText('11 notes · 11 done');
  await expect(
    page.getByRole('button', { name: 'Upload a new version' }),
  ).toBeEnabled();
  await expect(backLink(page)).toBeVisible();
  await expect(page.getByText(/^Uploaded by/)).toHaveCount(0);
  await captureScreenshot(page, 'project-default');
});

test('back link opens the projects list', async ({ page, context }) => {
  const { project } = await seedProject(context);
  await openProject(page, project.id);
  await backLink(page).click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/projects`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Projects' }),
  ).toBeVisible();
});

test('opening a version goes to its track page', async ({ page, context }) => {
  const { project, tracks } = await seedProject(context);
  await openProject(page, project.id);
  await row(page, 'v2').getByRole('link').click();
  await expect(page).toHaveURL(
    `${WEB_ORIGIN}/app/projects/${project.id}/tracks/${tracks[1]?.id}`,
  );
});

test('storage full', async ({ page, context }) => {
  const { project } = await seedProject(context, [
    { ...SAMPLE[0], sizeBytes: Math.round(499.5 * MB) } as Version,
  ]);
  await openProject(page, project.id);
  await expect(page.getByText('499.5 MB of 500 MB')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Upload a new version' }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      'Free plan: 500 MB used. Delete a version to upload another.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Drag a new mix here')).toHaveCount(0);
  await captureScreenshot(page, 'project-storage-full');
});

test('a file bigger than the space left is refused before uploading', async ({
  page,
  context,
}, testInfo) => {
  const { project } = await seedProject(context, [
    { ...SAMPLE[0], sizeBytes: 490 * MB } as Version,
  ]);
  const big = sparseFile(testInfo.outputPath('Big mix.mp3'), 15 * MB);

  const seen = watchRegistration(page);
  await openProject(page, project.id);
  await fileInput(page).setInputFiles(big);
  await expect(page.getByRole('alert')).toHaveText(
    'Not enough space: 10 MB left. Delete a version to free some up.',
  );
  expect(seen.registered).toBe(false);
  await captureScreenshot(page, 'project-not-enough-space');
});

test('a WAV file is refused before uploading', async ({ page, context }) => {
  const { project } = await seedProject(context);
  const seen = watchRegistration(page);
  await openProject(page, project.id);
  await expect(fileInput(page)).toHaveAttribute('accept', '.mp3,.aac,.m4a');
  await fileInput(page).setInputFiles({
    name: 'Midnight Drive — final.wav',
    mimeType: 'audio/wav',
    buffer: wav(),
  });
  await expect(page.getByRole('alert')).toHaveText(FORMAT_MESSAGE);
  await expect(
    page.getByRole('button', { name: 'Upload a new version' }),
  ).toBeEnabled();
  expect(seen.registered).toBe(false);
  await captureScreenshot(page, 'project-format-refused');

  await fileInput(page).setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('mix notes'),
  });
  await expect(page.getByRole('alert')).toHaveText(
    'Use an MP3, AAC or M4A file',
  );
  expect(seen.registered).toBe(false);
});

test('a file over 20 MB is refused before uploading', async ({
  page,
  context,
}, testInfo) => {
  const { project } = await seedProject(context);
  const big = sparseFile(testInfo.outputPath('Big mix.mp3'), 25 * MB);
  const seen = watchRegistration(page);
  await openProject(page, project.id);
  await fileInput(page).setInputFiles(big);
  await expect(page.getByRole('alert')).toHaveText('Files can be up to 20 MB');
  expect(seen.registered).toBe(false);
  await captureScreenshot(page, 'project-file-too-large');
});

test.describe('the server refuses the file for the plan', () => {
  test.use({
    expectedConsoleError: /Failed to load resource: .*status of 403/,
  });

  for (const [code, message] of [
    ['file_too_large', 'Files can be up to 20 MB'],
    ['format_not_allowed', FORMAT_MESSAGE],
  ] as const) {
    test(`${code} shows the file message`, async ({ page, context }) => {
      const { project } = await seedProject(context);
      let puts = 0;
      await page.route(STORAGE, (route) => {
        puts++;
        return route.fulfill({ status: 200, headers: CORS, body: '' });
      });
      await page.route('**/api/uploads', (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({ status: 403, json: { error: code } })
          : route.fallback(),
      );
      await openProject(page, project.id);
      await fileInput(page).setInputFiles(MIX);
      await expect(page.getByRole('alert')).toHaveText(message);
      await expect(
        page.getByRole('button', { name: 'Upload a new version' }),
      ).toBeEnabled();
      await expect(rows(page).getByRole('listitem')).toHaveCount(3);
      expect(puts).toBe(0);
    });
  }
});

test('uploading, then cancel', async ({ page, context }) => {
  const { project } = await seedProject(context);
  await page.route(STORAGE, () => {});
  await openProject(page, project.id);
  // Cancel before registration returns aborts it, leaving no upload to delete.
  const registered = page.waitForResponse(
    (res) =>
      res.request().method() === 'POST' &&
      new URL(res.url()).pathname === '/api/uploads',
  );
  await fileInput(page).setInputFiles(MIX);
  await registered;

  const uploadRow = rows(page).getByRole('region', { name: 'Upload' });
  await expect(uploadRow.getByText('Uploading…')).toBeVisible();
  await expect(uploadRow.getByText(MIX.name)).toBeVisible();
  await expect(rows(page).getByRole('listitem').first()).toContainText(
    MIX.name,
  );
  await expect(
    page.getByRole('button', { name: 'Upload a new version' }),
  ).toBeDisabled();
  await captureScreenshot(page, 'project-uploading', { waitForIdle: false });

  const deleted = page.waitForResponse(
    (res) =>
      res.request().method() === 'DELETE' &&
      /\/api\/uploads\/[0-9a-f-]+$/.test(res.url()),
  );
  await uploadRow.getByRole('button', { name: 'Cancel' }).click();
  expect((await deleted).status()).toBe(204);
  await expect(uploadRow).toBeHidden();
  await expect(rows(page).getByRole('listitem')).toHaveCount(3);
});

test.describe('storage refuses the file', () => {
  test.use({
    expectedConsoleError: /Failed to load resource: .*status of 500/,
  });

  test('upload failed, try again, remove', async ({ page, context }) => {
    const { project } = await seedProject(context);
    let puts = 0;
    await page.route(STORAGE, (route) => {
      puts++;
      return route.fulfill({ status: 500, headers: CORS, body: '' });
    });
    await openProject(page, project.id);
    await fileInput(page).setInputFiles(MIX);
    const uploadRow = rows(page).getByRole('region', { name: 'Upload' });
    await expect(uploadRow.getByText('Upload failed')).toBeVisible();
    await captureScreenshot(page, 'project-upload-failed');

    await uploadRow.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => puts).toBe(2);
    await expect(uploadRow.getByText('Upload failed')).toBeVisible();

    const deleted = page.waitForRequest(
      (req) => req.method() === 'DELETE' && req.url().includes('/api/uploads/'),
    );
    await uploadRow.getByRole('button', { name: 'Remove' }).click();
    await deleted;
    await expect(uploadRow).toBeHidden();
    await expect(rows(page).getByRole('listitem')).toHaveCount(3);
  });
});

test('uploading a new version opens it', async ({ page, context }) => {
  const { user, project } = await seedProject(context);
  const trackId = crypto.randomUUID();
  let registerBody: unknown;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/api/uploads')) {
      registerBody = req.postDataJSON();
    }
  });
  await page.route(STORAGE, (route) =>
    route.fulfill({ status: 200, headers: CORS, body: '' }),
  );
  await page.route('**/api/uploads/*/complete', (route) => {
    const now = new Date().toISOString();
    return route.fulfill({
      status: 201,
      json: {
        projectId: project.id,
        track: {
          id: trackId,
          projectId: project.id,
          version: 4,
          name: 'Midnight Drive — final',
          format: 'mp3',
          sizeBytes: MIX.buffer.length,
          durationMs: 2000,
          createdAt: now,
          updatedAt: now,
          noteCount: 0,
          doneNoteCount: 0,
          uploader: { id: user.id, name: user.name, picture: null },
          peaks: [10, 200, 120],
        },
      },
    });
  });
  await openProject(page, project.id);
  await fileInput(page).setInputFiles(MIX);
  await expect(page).toHaveURL(
    `${WEB_ORIGIN}/app/projects/${project.id}/tracks/${trackId}`,
  );
  expect(registerBody).toMatchObject({
    projectId: project.id,
    fileName: MIX.name,
  });
});

test('no versions', async ({ page, context }) => {
  const { project } = await seedProject(context, []);
  await openProject(page, project.id);
  await expect(page.getByText('No versions yet')).toBeVisible();
  await expect(
    page.getByText('Upload a mix to keep working on this song.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Upload a version' }),
  ).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Versions' })).toBeHidden();
  await captureScreenshot(page, 'project-no-versions');
});

test('not found', async ({ page, context }) => {
  await signIn(context);
  await page.goto(projectUrl(crypto.randomUUID()));
  await expect(
    page.getByRole('heading', { name: "This project doesn't exist" }),
  ).toBeVisible();
  await captureScreenshot(page, 'project-not-found');

  await page.getByRole('link', { name: 'Go to projects' }).click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/start`);
});

test("another user's project is not found", async ({ page, context }) => {
  const other = await seedProject(context);
  await context.clearCookies();
  await signIn(context);
  await page.goto(projectUrl(other.project.id));
  await expect(
    page.getByRole('heading', { name: "This project doesn't exist" }),
  ).toBeVisible();
  await expect(page.getByText('Midnight Drive')).toBeHidden();
});

test('a malformed id is not found without asking the server', async ({
  page,
  context,
}) => {
  await signIn(context);
  let asked = false;
  page.on('request', (req) => {
    if (req.url().includes('/api/projects/')) asked = true;
  });
  await page.goto(projectUrl('not-a-project'));
  await expect(
    page.getByRole('heading', { name: "This project doesn't exist" }),
  ).toBeVisible();
  expect(asked).toBe(false);
});

test.describe('the project fails to load', () => {
  test.use({
    expectedConsoleError:
      /Failed to load resource: net::ERR_FAILED|AxiosError: Network Error/,
  });

  test('error loading', async ({ page, context }) => {
    const { project } = await seedProject(context);
    await page.route(`**/api/projects/${project.id}`, (route) => route.abort());
    await page.goto(projectUrl(project.id));
    await expect(page.getByRole('alert')).toContainText(
      "Couldn't load this project",
    );
    await captureScreenshot(page, 'project-error');

    await page.unroute(`**/api/projects/${project.id}`);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Midnight Drive' }),
    ).toBeVisible();
  });
});

test('rename project', async ({ page, context }) => {
  const { project } = await seedProject(context);
  await openProject(page, project.id);
  await page.getByRole('button', { name: 'Project options' }).click();
  await page.getByRole('menuitem', { name: 'Rename project' }).click();

  const dialog = page.getByRole('dialog', { name: 'Rename project' });
  const input = dialog.getByLabel('Name');
  await expect(input).toHaveValue('Midnight Drive');
  await input.fill('   ');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Enter a name');
  await captureScreenshot(page, 'project-rename', { fullPage: false });

  await input.fill('Midnight Drive (Club Mix)');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Midnight Drive (Club Mix)' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Midnight Drive (Club Mix)' }),
  ).toBeVisible();
});

test('a renamed project shows its new name in the list without a reload', async ({
  page,
  context,
}) => {
  await seedProject(context);
  await page.goto('/app/projects');
  await page.getByRole('link', { name: /^Midnight Drive/ }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Midnight Drive' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Project options' }).click();
  await page.getByRole('menuitem', { name: 'Rename project' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename project' });
  await dialog.getByLabel('Name').fill('Midnight Drive (Club Mix)');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  await backLink(page).click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/projects`);
  const list = page.getByRole('main').getByRole('listitem');
  await expect(list).toHaveCount(1);
  await expect(list).toContainText('Midnight Drive (Club Mix)');
});

test.describe('a rename the server refuses', () => {
  test.use({
    expectedConsoleError: /Failed to load resource: .*status of 500/,
  });

  test('keeps the dialog open with an error', async ({ page, context }) => {
    const { project } = await seedProject(context);
    await page.route(`**/api/projects/${project.id}`, (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 500, json: { error: 'internal' } })
        : route.continue(),
    );
    await openProject(page, project.id);
    await page.getByRole('button', { name: 'Project options' }).click();
    await page.getByRole('menuitem', { name: 'Rename project' }).click();
    const dialog = page.getByRole('dialog', { name: 'Rename project' });
    await dialog.getByLabel('Name').fill('New name');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('alert')).toContainText("Couldn't rename");
    await expect(dialog.getByLabel('Name')).toHaveValue('New name');
  });
});

test('delete the project', async ({ page, context }) => {
  const { project } = await seedProject(context);
  await openProject(page, project.id);
  await page.getByRole('button', { name: 'Project options' }).click();
  await page.getByRole('menuitem', { name: 'Delete project' }).click();
  const dialog = page.getByRole('alertdialog', {
    name: 'Delete Midnight Drive, its 3 versions and 20 notes?',
  });
  await expect(dialog).toBeVisible();
  await captureScreenshot(page, 'project-delete-project', { fullPage: false });

  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/start`);
  await expect(
    page.getByRole('heading', { name: "Hi Maya, let's add your first mix" }),
  ).toBeVisible();
});

test.describe('a project delete the server refuses', () => {
  test.use({
    expectedConsoleError: /Failed to load resource: .*status of 500/,
  });

  test('keeps the dialog open with a toast', async ({ page, context }) => {
    const { project } = await seedProject(context);
    await page.route(`**/api/projects/${project.id}`, (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 500, json: { error: 'internal' } })
        : route.continue(),
    );
    await openProject(page, project.id);
    await page.getByRole('button', { name: 'Project options' }).click();
    await page.getByRole('menuitem', { name: 'Delete project' }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(
      page.getByText("Couldn't delete the project. Try again."),
    ).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(`${WEB_ORIGIN}${projectUrl(project.id)}`);
  });
});

test('owner with collaborators', async ({ page, context }) => {
  await page.route(SAM_AVATAR, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: AVATAR_SVG }),
  );
  const { project, tracks } = await seedProject(context);
  const sam = await newUser('Sam Rivera', SAM_AVATAR);
  const jo = await newUser('Jo Park');
  for (const user of [sam, jo]) {
    await createMember(app.db, { projectId: project.id, userId: user.id });
    await createNote(app.db, {
      userId: user.id,
      trackId: tracks[2]?.id ?? '',
      timestampMs: 30_000,
    });
  }
  await addVersions(sam.id, project.id, [SAM_MIX]);
  // A member who left keeps their version, and their name on it.
  const gone = await newUser('Lee Hart');
  await addVersions(gone.id, project.id, [
    { ...SAM_MIX, name: 'Midnight Drive — Lee edit', sizeBytes: 2 * MB },
  ]);
  await openProject(page, project.id);
  await expect(row(page, 'v5')).toContainText('Uploaded by Lee Hart');
  await expect(row(page, 'v4')).toContainText('Uploaded by Sam Rivera');
  await expect(row(page, 'v3')).toContainText('Uploaded by you');
  // Rename and delete are on the track page.
  await expect(rows(page).getByRole('button')).toHaveCount(0);
  // v3's own 2 notes plus one from each collaborator.
  await expect(row(page, 'v3')).toContainText('4 notes · 0 done');
  const share = page.getByRole('button', { name: 'Share', exact: true });
  await expect(share).toBeVisible();
  await expect(share.locator('[data-slot="avatar"]')).toHaveCount(2);
  await expect(share.getByText('JP')).toBeVisible();
  await expect(page.getByText('72.7 MB of 500 MB')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Project options' }),
  ).toBeVisible();
  await captureScreenshot(page, 'project-owner-shared');

  await share.click();
  await expect(
    page
      .getByRole('dialog', { name: 'Share project' })
      .getByText('2 of 1 collaborator', { exact: true }),
  ).toBeVisible();
});

test('owner without collaborators shows a plain Share button', async ({
  page,
  context,
}) => {
  let askedMembers = false;
  page.on('request', (req) => {
    if (new URL(req.url()).pathname.endsWith('/members')) askedMembers = true;
  });
  const { project } = await seedProject(context);
  await openProject(page, project.id);
  const share = page.getByRole('button', { name: 'Share', exact: true });
  await expect(share).toBeVisible();
  await expect(share.locator('[data-slot="avatar"]')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  expect(askedMembers).toBe(false);
});

test('collaborator', async ({ page, context }) => {
  let askedUsage = false;
  page.on('request', (req) => {
    if (req.url().endsWith('/api/usage')) askedUsage = true;
  });
  const { project } = await seedShared(context, SAMPLE, [SAM_MIX]);
  await openProject(page, project.id);
  await expect(page.getByText('Shared by Maya Chen')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Members', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0);
  const items = rows(page).getByRole('listitem');
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText('Midnight Drive — Sam mix');
  await expect(items.nth(0)).toContainText('Uploaded by you');
  await expect(items.nth(0)).toContainText('4:12 · 9.1 MB · MP3 · Oct 23');
  await expect(items.nth(0)).toContainText('No notes');
  await expect(items.nth(1)).toContainText('Uploaded by Maya Chen');
  await expect(items.nth(1)).toContainText('2 notes · 0 done');
  await expect(items.nth(3)).toContainText('11 notes · 11 done');
  await expect(rows(page).getByRole('button')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Upload a new version' }),
  ).toBeEnabled();
  await expect(page.getByText(LIMITS_LINE)).toBeVisible();
  await expect(page.getByText(/of 500 MB/)).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Project options' }),
  ).toHaveCount(0);
  expect(askedUsage).toBe(false);
  await captureScreenshot(page, 'project-collaborator');
});

test('collaborator opens a version', async ({ page, context }) => {
  const { project, tracks } = await seedShared(context);
  await openProject(page, project.id);
  await row(page, 'v2').getByRole('link').click();
  await expect(page).toHaveURL(
    `${WEB_ORIGIN}/app/projects/${project.id}/tracks/${tracks[1]?.id}`,
  );
});

test('collaborator, no versions', async ({ page, context }) => {
  const { project } = await seedShared(context, []);
  await openProject(page, project.id);
  await expect(page.getByText('No versions yet')).toBeVisible();
  await expect(
    page.getByText('Upload a mix to keep working on this song.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Upload a version' }),
  ).toBeEnabled();
  await expect(page.getByText(/of 500 MB/)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Versions' })).toBeHidden();
  await captureScreenshot(page, 'project-collaborator-no-versions');
});

test("collaborator, a file outside the owner's plan is refused", async ({
  page,
  context,
}, testInfo) => {
  const { project } = await seedShared(context);
  const seen = watchRegistration(page);
  await openProject(page, project.id);
  await fileInput(page).setInputFiles({
    name: 'Midnight Drive — Sam mix.flac',
    mimeType: 'audio/flac',
    buffer: Buffer.from('fLaC'),
  });
  await expect(page.getByRole('alert')).toHaveText(FORMAT_MESSAGE);
  await expect(page.getByText(/MB left|Free plan/)).toHaveCount(0);
  await captureScreenshot(page, 'project-collaborator-format-refused');

  await fileInput(page).setInputFiles(
    sparseFile(testInfo.outputPath('Sam mix.mp3'), 25 * MB),
  );
  await expect(page.getByRole('alert')).toHaveText('Files can be up to 20 MB');
  expect(seen.registered).toBe(false);
});

test('collaborator, project full', async ({ page, context }) => {
  const { project } = await seedShared(context, [
    { ...SAMPLE[0], sizeBytes: Math.round(499.5 * MB) } as Version,
  ]);
  await openProject(page, project.id);
  await expect(
    page.getByRole('button', { name: 'Upload a new version' }),
  ).toBeDisabled();
  await expect(
    page.getByText("This project can't accept more uploads."),
  ).toBeVisible();
  await expect(page.getByText(/MB of 500 MB|Free plan/)).toHaveCount(0);
  await expect(page.getByText('Drag a new mix here')).toHaveCount(0);
  await captureScreenshot(page, 'project-collaborator-full');
});

test.describe("the owner's storage refuses the file", () => {
  test.use({
    expectedConsoleError: /Failed to load resource: .*status of 403/,
  });

  test('collaborator, file too big', async ({ page, context }) => {
    // 1 MB left of Maya's storage; the file is about 1.6 MB.
    const { project } = await seedShared(context, [
      { ...SAMPLE[0], sizeBytes: 499 * MB } as Version,
    ]);
    let puts = 0;
    await page.route(STORAGE, (route) => {
      puts++;
      return route.fulfill({ status: 200, headers: CORS, body: '' });
    });
    const refused = page.waitForResponse(
      (res) =>
        res.request().method() === 'POST' &&
        new URL(res.url()).pathname === '/api/uploads',
    );
    await openProject(page, project.id);
    const big = {
      ...MIX,
      name: 'Midnight Drive — long.mp3',
      buffer: Buffer.concat(Array.from({ length: 100 }, () => MIX.buffer)),
    };
    await fileInput(page).setInputFiles(big);
    const res = await refused;
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: 'storage_limit_reached' });

    const uploadRow = rows(page).getByRole('region', { name: 'Upload' });
    await expect(
      uploadRow.getByText("This project can't accept this file."),
    ).toBeVisible();
    await expect(uploadRow.getByText(big.name)).toBeVisible();
    await expect(
      uploadRow.getByRole('button', { name: 'Try again' }),
    ).toHaveCount(0);
    await expect(page.getByText(/MB left/)).toHaveCount(0);
    expect(puts).toBe(0);
    await captureScreenshot(page, 'project-collaborator-file-too-big');

    await uploadRow.getByRole('button', { name: 'Choose another' }).click();
    await expect(uploadRow).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Upload a new version' }),
    ).toBeEnabled();
  });

  test('collaborator, file refused on completion', async ({
    page,
    context,
  }) => {
    const { project } = await seedShared(context);
    await page.route(STORAGE, (route) =>
      route.fulfill({ status: 200, headers: CORS, body: '' }),
    );
    // Another member's upload took the space between registering and completing.
    await page.route('**/api/uploads/*/complete', (route) =>
      route.fulfill({ status: 403, json: { error: 'storage_limit_reached' } }),
    );
    await openProject(page, project.id);
    await fileInput(page).setInputFiles(MIX);
    const uploadRow = rows(page).getByRole('region', { name: 'Upload' });
    await expect(
      uploadRow.getByText("This project can't accept this file."),
    ).toBeVisible();
    await expect(
      uploadRow.getByRole('button', { name: 'Try again' }),
    ).toHaveCount(0);
    await expect(row(page, 'v4')).toHaveCount(0);
    await expect(
      uploadRow.getByRole('button', { name: 'Choose another' }),
    ).toBeVisible();
  });
});

test('collaborator removed during an upload', async ({ page, context }) => {
  const { project, me } = await seedShared(context);
  await page.route(STORAGE, (route) =>
    route.fulfill({ status: 200, headers: CORS, body: '' }),
  );
  // Storage never holds the file in e2e; the api answers as it does for a removed uploader.
  await page.route('**/api/uploads/*/complete', (route) =>
    route.fulfill({ status: 404, json: { error: 'not_found' } }),
  );
  await openProject(page, project.id);
  await fileInput(page).setInputFiles(MIX);
  const uploadRow = rows(page).getByRole('region', { name: 'Upload' });
  await expect(uploadRow.getByText('Upload failed')).toBeVisible();
  await captureScreenshot(page, 'project-collaborator-removed-during-upload');

  await app.db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, project.id),
        eq(projectMembers.userId, me.id),
      ),
    );
  await page.reload();
  await expect(
    page.getByRole('heading', { name: "This project doesn't exist" }),
  ).toBeVisible();
});

test('collaborator uploads a version', async ({ page, context }) => {
  const { project, me } = await seedShared(context);
  const trackId = crypto.randomUUID();
  let registerBody: unknown;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/api/uploads')) {
      registerBody = req.postDataJSON();
    }
  });
  await page.route(STORAGE, (route) =>
    route.fulfill({ status: 200, headers: CORS, body: '' }),
  );
  await page.route('**/api/uploads/*/complete', (route) => {
    const now = new Date().toISOString();
    return route.fulfill({
      status: 201,
      json: {
        projectId: project.id,
        track: {
          id: trackId,
          projectId: project.id,
          version: 4,
          name: 'Midnight Drive — final',
          format: 'mp3',
          sizeBytes: MIX.buffer.length,
          durationMs: 2000,
          createdAt: now,
          updatedAt: now,
          noteCount: 0,
          doneNoteCount: 0,
          uploader: { id: me.id, name: me.name, picture: null },
          peaks: [10, 200, 120],
        },
      },
    });
  });
  await openProject(page, project.id);
  await fileInput(page).setInputFiles(MIX);
  await expect(page).toHaveURL(
    `${WEB_ORIGIN}/app/projects/${project.id}/tracks/${trackId}`,
  );
  expect(registerBody).toMatchObject({
    projectId: project.id,
    fileName: MIX.name,
  });
});

test('a removed collaborator gets not found', async ({ page, context }) => {
  const { project, me } = await seedShared(context);
  await openProject(page, project.id);
  await app.db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, project.id),
        eq(projectMembers.userId, me.id),
      ),
    );
  await page.reload();
  await expect(
    page.getByRole('heading', { name: "This project doesn't exist" }),
  ).toBeVisible();
  await expect(page.getByText('Shared by Maya Chen')).toBeHidden();
});

test('a collaborator removed while the page is open gets not found from Members', async ({
  page,
  context,
}) => {
  const { project, me } = await seedShared(context);
  await openProject(page, project.id);
  await app.db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, project.id),
        eq(projectMembers.userId, me.id),
      ),
    );
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: "This project doesn't exist" }),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(`${WEB_ORIGIN}${projectUrl(project.id)}`);
});
