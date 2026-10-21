import { closeSync, ftruncateSync, openSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';
import { createTestApp } from '../../apps/api/test/helpers/app.ts';
import { wav } from '../support/audio.ts';
import { E2E_USER, STORAGE_ORIGIN, WEB_ORIGIN } from '../support/env.ts';
import { captureScreenshot, expect, test } from '../support/fixtures.ts';
import { signedInUser } from '../support/session.ts';

let app: Awaited<ReturnType<typeof createTestApp>>;

test.beforeAll(async () => {
  app = await createTestApp();
});

test.afterAll(async () => {
  await app.close();
});

// A user per test: the api keeps one pending upload per user, so tests sharing one would
// replace each other's uploads when they run in parallel.
test.beforeEach(async ({ context }) => {
  const id = crypto.randomUUID();
  const { cookies } = await signedInUser(app, {
    email: `e2e-${id}@example.com`,
    name: E2E_USER.name,
    authProviderId: `e2e-${id}`,
  });
  await context.addCookies(cookies);
});

// No storage exists in e2e, so the browser's PUTs are always answered here.
const STORAGE = `${STORAGE_ORIGIN}/**`;
const CORS = { 'Access-Control-Allow-Origin': '*' };

const PROJECT_ID = '3f0c6f8e-6a43-4c55-9d1e-0f6f2b0d1a01';
const TRACK_ID = '9b7e2c4d-1f3a-4e5b-8c6d-2a1b0c9d8e02';

const MIX = {
  name: 'Midnight Drive.wav',
  mimeType: 'audio/wav',
  buffer: wav(),
};

const fileInput = (page: Page) => page.locator('input[type="file"]');
const dropzone = (page: Page) => page.getByRole('region', { name: 'Upload' });

async function openStart(page: Page) {
  await page.goto('/app/start');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: "Hi E2E, let's add your first mix",
    }),
  ).toBeVisible();
}

function completeResponse() {
  const now = new Date().toISOString();
  return {
    projectId: PROJECT_ID,
    track: {
      id: TRACK_ID,
      projectId: PROJECT_ID,
      version: 1,
      name: 'Midnight Drive',
      format: 'wav',
      sizeBytes: MIX.buffer.length,
      durationMs: 2000,
      createdAt: now,
      updatedAt: now,
      noteCount: 0,
      doneNoteCount: 0,
      peaks: [10, 200, 120],
    },
  };
}

function projectList() {
  const now = new Date().toISOString();
  return {
    items: [
      {
        id: PROJECT_ID,
        name: 'Midnight Drive',
        createdAt: now,
        updatedAt: now,
        trackCount: 1,
        latestTrack: { id: TRACK_ID, version: 1 },
      },
    ],
  };
}

const storageOk = (route: Route) =>
  route.fulfill({ status: 200, headers: CORS, body: '' });

test('entry route sends a user without a project to onboarding', async ({
  page,
}) => {
  await page.goto('/app');
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/start`);
});

test('empty', async ({ page }) => {
  await openStart(page);
  await expect(
    page.getByRole('button', { name: 'Choose a file' }),
  ).toBeVisible();
  await expect(
    page.getByText('WAV, MP3, FLAC or AAC · up to 100 MB per file'),
  ).toBeVisible();
  await expect(
    page.getByText('Free: 1 project, 100 MB of mixes'),
  ).toBeVisible();
  await captureScreenshot(page, 'first-upload-empty');
});

test('drag over', async ({ page }) => {
  await openStart(page);
  const dataTransfer = await page.evaluateHandle('new DataTransfer()');
  await dropzone(page).dispatchEvent('dragenter', { dataTransfer });
  await expect(page.getByText('Drop it here')).toBeVisible();
  await expect(dropzone(page)).toHaveAttribute('data-active', 'true');
  await captureScreenshot(page, 'first-upload-drag-over');
});

test('rejected format', async ({ page }) => {
  await openStart(page);
  await fileInput(page).setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not audio'),
  });
  await expect(page.getByRole('alert')).toHaveText(
    'Use a WAV, MP3, FLAC or AAC file',
  );
  await expect(
    page.getByRole('button', { name: 'Choose a file' }),
  ).toBeEnabled();
  await captureScreenshot(page, 'first-upload-rejected-format');
});

test('rejected size', async ({ page }, testInfo) => {
  // Sparse, so it costs no disk; the size check runs before anything reads it.
  const big = testInfo.outputPath('Huge mix.wav');
  const fd = openSync(big, 'w');
  ftruncateSync(fd, 101 * 1_048_576);
  closeSync(fd);

  let registered = false;
  page.on('request', (req) => {
    if (req.url().endsWith('/api/uploads')) registered = true;
  });
  await openStart(page);
  await fileInput(page).setInputFiles(big);
  await expect(page.getByRole('alert')).toHaveText('Files can be up to 100 MB');
  expect(registered).toBe(false);
  await captureScreenshot(page, 'first-upload-rejected-size');
});

test('rejected unreadable', async ({ page }) => {
  await openStart(page);
  await fileInput(page).setInputFiles({
    name: 'Broken.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('definitely not a wave file'),
  });
  await expect(page.getByRole('alert')).toHaveText(
    "This file couldn't be read as audio",
  );
  await captureScreenshot(page, 'first-upload-rejected-unreadable');
});

test('reading', async ({ page }) => {
  // Hold the decode so the step stays on screen.
  await page.addInitScript(
    'BaseAudioContext.prototype.decodeAudioData = () => new Promise(() => {})',
  );
  await openStart(page);
  await fileInput(page).setInputFiles(MIX);
  await expect(page.getByRole('status')).toHaveText('Reading waveform…');
  await expect(page.getByText(MIX.name)).toBeVisible();
  await captureScreenshot(page, 'first-upload-reading');
});

test('uploading, then cancel', async ({ page }) => {
  await page.route(STORAGE, () => {});
  await openStart(page);
  // Cancel before registration returns aborts it, leaving no upload to delete.
  const registered = page.waitForResponse(
    (res) =>
      res.request().method() === 'POST' &&
      new URL(res.url()).pathname === '/api/uploads',
  );
  await fileInput(page).setInputFiles(MIX);
  await registered;
  await expect(page.getByText('Uploading…')).toBeVisible();
  await expect(page.getByText(MIX.name)).toBeVisible();
  await expect(page.getByText('0:02')).toBeVisible();
  await expect(
    page.getByRole('progressbar', { name: 'Upload progress' }),
  ).toBeVisible();
  await captureScreenshot(page, 'first-upload-uploading', {
    waitForIdle: false,
  });

  const deleted = page.waitForResponse(
    (res) =>
      res.request().method() === 'DELETE' &&
      /\/api\/uploads\/[0-9a-f-]+$/.test(res.url()),
  );
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect((await deleted).status()).toBe(204);
  await expect(
    page.getByRole('button', { name: 'Choose a file' }),
  ).toBeVisible();
});

test('finishing', async ({ page }) => {
  await page.route(STORAGE, storageOk);
  await page.route('**/api/uploads/*/complete', () => {});
  await openStart(page);
  await fileInput(page).setInputFiles(MIX);
  await expect(page.getByRole('status')).toHaveText('Almost there…');
  await captureScreenshot(page, 'first-upload-finishing', {
    waitForIdle: false,
  });
});

test.describe('storage refuses the file', () => {
  test.use({
    expectedConsoleError: /Failed to load resource: .*status of 500/,
  });

  test('upload failed, try again, choose another', async ({ page }) => {
    let puts = 0;
    await page.route(STORAGE, (route) => {
      puts++;
      return route.fulfill({ status: 500, headers: CORS, body: '' });
    });
    await openStart(page);
    await fileInput(page).setInputFiles(MIX);
    await expect(page.getByText('Upload failed')).toBeVisible();
    await captureScreenshot(page, 'first-upload-failed');

    const registered = page.waitForResponse(
      (res) =>
        res.request().method() === 'POST' && res.url().endsWith('/api/uploads'),
    );
    await page.getByRole('button', { name: 'Try again' }).click();
    expect((await registered).status()).toBe(201);
    await expect(page.getByText('Upload failed')).toBeVisible();
    expect(puts).toBe(2);

    const deleted = page.waitForRequest(
      (req) => req.method() === 'DELETE' && req.url().includes('/api/uploads/'),
    );
    await page.getByRole('button', { name: 'Choose another' }).click();
    await deleted;
    await expect(
      page.getByRole('button', { name: 'Choose a file' }),
    ).toBeVisible();
  });
});

test('dropping a file uploads it and opens the new track', async ({ page }) => {
  let completeBody: unknown;
  await page.route(STORAGE, storageOk);
  await page.route('**/api/uploads/*/complete', (route) => {
    completeBody = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: completeResponse() });
  });
  await openStart(page);

  // A string expression: the e2e tsconfig has no DOM lib.
  const dataTransfer = await page.evaluateHandle(`(() => {
    const bytes = Uint8Array.from(atob('${MIX.buffer.toString('base64')}'), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], '${MIX.name}', { type: 'audio/wav' }));
    return dt;
  })()`);
  await dropzone(page).dispatchEvent('drop', { dataTransfer });

  await expect(page).toHaveURL(
    `${WEB_ORIGIN}/app/projects/${PROJECT_ID}/tracks/${TRACK_ID}`,
  );
  expect(completeBody).toMatchObject({ durationMs: 2000 });
  const { peaks } = completeBody as { peaks: number[] };
  expect(peaks).toHaveLength(40);
  expect(Math.max(...peaks)).toBeGreaterThan(100);
});

test('a user who has a project is sent to its newest version', async ({
  page,
}) => {
  await page.route('**/api/projects', (route) =>
    route.fulfill({ json: projectList() }),
  );
  await page.goto('/app/start');
  await expect(page).toHaveURL(
    `${WEB_ORIGIN}/app/projects/${PROJECT_ID}/tracks/${TRACK_ID}`,
  );
});

test.describe('projects fail to load', () => {
  test.use({
    expectedConsoleError:
      /Failed to load resource: net::ERR_FAILED|AxiosError: Network Error/,
  });

  test('entry error', async ({ page }) => {
    await page.route('**/api/projects', (route) => route.abort());
    await page.goto('/app');
    await expect(page.getByRole('alert')).toContainText(
      "Couldn't load your projects",
    );
    await captureScreenshot(page, 'first-upload-entry-error');

    await page.unroute('**/api/projects');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page).toHaveURL(`${WEB_ORIGIN}/app/start`);
  });
});

test.describe('the project limit is reached mid-flow', () => {
  test.use({
    expectedConsoleError: /Failed to load resource: .*status of 403/,
  });

  test('a refused registration goes back to the entry route', async ({
    page,
  }) => {
    let refused = false;
    await page.route('**/api/uploads', (route) => {
      refused = true;
      return route.fulfill({
        status: 403,
        json: { error: 'project_limit_reached' },
      });
    });
    await page.route('**/api/projects', (route) =>
      refused ? route.fulfill({ json: projectList() }) : route.continue(),
    );
    await openStart(page);
    await fileInput(page).setInputFiles(MIX);
    await expect(page).toHaveURL(
      `${WEB_ORIGIN}/app/projects/${PROJECT_ID}/tracks/${TRACK_ID}`,
    );
  });
});
