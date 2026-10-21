import { closeSync, ftruncateSync, openSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { createTestApp } from '../../apps/api/test/helpers/app.ts';
import {
  createNote,
  createProject,
  createTrack,
} from '../../apps/api/test/helpers/factories.ts';
import { wav } from '../support/audio.ts';
import { STORAGE_ORIGIN, WEB_ORIGIN } from '../support/env.ts';
import { captureScreenshot, expect, test } from '../support/fixtures.ts';
import { signedInUser } from '../support/session.ts';

const MB = 1_048_576;

// No storage exists in e2e, so the browser's PUTs are always answered here.
const STORAGE = `${STORAGE_ORIGIN}/**`;
const CORS = { 'Access-Control-Allow-Origin': '*' };

const MIX = {
  name: 'Midnight Drive — final.wav',
  mimeType: 'audio/wav',
  buffer: wav(),
};

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
  const tracks = [];
  for (const v of versions) {
    const track = await createTrack(app.db, {
      userId: user.id,
      projectId: project.id,
      name: v.name,
      format: v.format,
      contentType: v.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      sizeBytes: v.sizeBytes,
      durationMs: v.durationMs,
      createdAt: new Date(v.date),
    });
    for (let i = 0; i < v.notes; i++) {
      await createNote(app.db, {
        userId: user.id,
        trackId: track.id,
        timestampMs: i * 1000,
        done: i < v.done,
      });
    }
    tracks.push(track);
  }
  return { user, project, tracks };
}

const projectUrl = (id: string) => `/app/projects/${id}`;
const rows = (page: Page) => page.getByRole('region', { name: 'Versions' });
const row = (page: Page, label: string) =>
  rows(page)
    .getByRole('listitem')
    .filter({ hasText: new RegExp(`^${label}`) });
const fileInput = (page: Page) => page.locator('input[type="file"]');

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
  await captureScreenshot(page, 'project-loading', { waitForIdle: false });
});

test('default', async ({ page, context }) => {
  const { project } = await seedProject(context);
  await openProject(page, project.id);
  await expect(page.getByText('61.6 MB of 100 MB')).toBeVisible();
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
  await captureScreenshot(page, 'project-default');
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
    { ...SAMPLE[0], sizeBytes: Math.round(99.5 * MB) } as Version,
  ]);
  await openProject(page, project.id);
  await expect(page.getByText('99.5 MB of 100 MB')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Upload a new version' }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      'Free plan: 100 MB used. Delete a version to upload another.',
    ),
  ).toBeVisible();
  await captureScreenshot(page, 'project-storage-full');
});

test('a file bigger than the space left is refused before uploading', async ({
  page,
  context,
}, testInfo) => {
  const { project } = await seedProject(context, [
    { ...SAMPLE[0], sizeBytes: 70 * MB } as Version,
  ]);
  // Sparse, so it costs no disk; the size check runs before anything reads it.
  const big = testInfo.outputPath('Big mix.wav');
  const fd = openSync(big, 'w');
  ftruncateSync(fd, 40 * MB);
  closeSync(fd);

  let registered = false;
  page.on('request', (req) => {
    if (req.url().endsWith('/api/uploads')) registered = true;
  });
  await openProject(page, project.id);
  await fileInput(page).setInputFiles(big);
  await expect(page.getByRole('alert')).toHaveText(
    'Not enough space: 30 MB left. Delete a version to free some up.',
  );
  expect(registered).toBe(false);
  await captureScreenshot(page, 'project-not-enough-space');
});

test('uploading, then cancel', async ({ page, context }) => {
  const { project } = await seedProject(context);
  await page.route(STORAGE, () => {});
  await openProject(page, project.id);
  await fileInput(page).setInputFiles(MIX);

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
  const { project } = await seedProject(context);
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
          format: 'wav',
          sizeBytes: MIX.buffer.length,
          durationMs: 2000,
          createdAt: now,
          updatedAt: now,
          noteCount: 0,
          doneNoteCount: 0,
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

  await page.getByRole('link', { name: 'Go to my project' }).click();
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

test('rename a version', async ({ page, context }) => {
  const { project } = await seedProject(context);
  await openProject(page, project.id);
  await page.getByRole('button', { name: 'More for v2' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename v2' });
  await dialog.getByLabel('Name').fill('Midnight Drive — wider chorus');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(row(page, 'v2')).toContainText('Midnight Drive — wider chorus');
});

test('delete a version', async ({ page, context }) => {
  const { project } = await seedProject(context);
  await openProject(page, project.id);
  await page.getByRole('button', { name: 'More for v2' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog', {
    name: 'Delete v2 and its 7 notes?',
  });
  await expect(dialog).toBeVisible();
  await captureScreenshot(page, 'project-delete-version', { fullPage: false });

  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(dialog).toBeHidden();
  await expect(rows(page).getByRole('listitem')).toHaveCount(2);
  await expect(row(page, 'v2')).toHaveCount(0);
  await expect(page.getByText('51.9 MB of 100 MB')).toBeVisible();
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
