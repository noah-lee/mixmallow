import type { BrowserContext, Page, Route } from '@playwright/test';
import { notes as notesTable } from '@repo/db';
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

const STORAGE = `${STORAGE_ORIGIN}/**`;
const DURATION_MS = 252_000;
// A real file as long as the seeded track, so playback and seeking line up with its duration.
const AUDIO = wav(DURATION_MS / 1000);

// 20 peaks a second, like the upload decoder, shaped like a song with quiet and loud parts.
const PEAKS = Array.from({ length: (DURATION_MS / 1000) * 20 }, (_, i) =>
  Math.round(
    Math.min(
      255,
      40 + 190 * Math.abs(Math.sin(i / 7)) * (0.55 + 0.45 * Math.sin(i / 420)),
    ),
  ),
);

const SAMPLE_NOTES = [
  { at: 8_000, text: 'Intro pad a bit too wide, narrow it', done: true },
  { at: 42_000, text: 'Kick and bass fighting around 60 Hz', done: false },
  { at: 62_000, text: 'Chorus vocal too loud, pull 1–2 dB', done: false },
  { at: 102_000, text: 'Snare reverb tail too long here', done: true },
  { at: 151_000, text: 'Love this breakdown, keep it', done: false },
  { at: 235_000, text: 'Fade starts too early', done: false },
];

let app: Awaited<ReturnType<typeof createTestApp>>;

test.beforeAll(async () => {
  app = await createTestApp();
});

test.afterAll(async () => {
  await app.close();
});

// No storage runs in e2e: every test answers the player's audio request here (later routes
// win, so a test can override it).
test.beforeEach(async ({ page }) => {
  await page.route(STORAGE, serveAudio);
});

// Answers Range requests the way object storage does; without them Chrome can't seek.
function serveAudio(route: Route) {
  const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '');
  if (!range) {
    return route.fulfill({
      status: 200,
      contentType: 'audio/wav',
      headers: { 'Accept-Ranges': 'bytes' },
      body: AUDIO,
    });
  }
  const start = Number(range[1]);
  const end = range[2] ? Number(range[2]) : AUDIO.length - 1;
  return route.fulfill({
    status: 206,
    contentType: 'audio/wav',
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${AUDIO.length}`,
    },
    body: AUDIO.subarray(start, end + 1),
  });
}

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

// Project "Midnight Drive" with v1 and v2; v2 (returned as `track`) carries the notes.
async function seedTrack(
  context: BrowserContext,
  notes: typeof SAMPLE_NOTES = SAMPLE_NOTES,
) {
  const user = await signIn(context);
  const project = await createProject(app.db, {
    userId: user.id,
    name: 'Midnight Drive',
  });
  const base = {
    userId: user.id,
    projectId: project.id,
    durationMs: DURATION_MS,
    peaks: PEAKS,
  };
  const v1 = await createTrack(app.db, {
    ...base,
    name: 'Midnight Drive rough',
    createdAt: new Date('2026-10-03T15:00:00Z'),
  });
  const track = await createTrack(app.db, {
    ...base,
    name: 'Midnight Drive',
    createdAt: new Date('2026-10-12T15:00:00Z'),
  });
  for (const note of notes) {
    await createNote(app.db, {
      userId: user.id,
      trackId: track.id,
      timestampMs: note.at,
      text: note.text,
      done: note.done,
    });
  }
  return { user, project, track, v1 };
}

const trackUrl = (projectId: string, trackId: string) =>
  `/app/projects/${projectId}/tracks/${trackId}`;
const notesRegion = (page: Page) =>
  page.getByRole('region', { name: /notes/i });
const noteRows = (page: Page) => notesRegion(page).getByRole('listitem');
const noteRow = (page: Page, text: string) =>
  noteRows(page).filter({ hasText: text });
const waveform = (page: Page) => page.locator('[data-waveform]');
const markers = (page: Page) => page.locator('[data-marker]');
// Close notes share one marker, so count the notes the markers stand for.
const markedNotes = (page: Page) =>
  markers(page).evaluateAll((els) =>
    els.reduce((sum, el) => sum + Number(el.getAttribute('data-count')), 0),
  );
const playButton = (page: Page) =>
  page.getByRole('button', { name: 'Play', exact: true });
const pauseButton = (page: Page) =>
  page.getByRole('button', { name: 'Pause', exact: true });
const currentTime = (page: Page) => page.getByTestId('current-time');
const noteField = (page: Page) => page.getByLabel('Note', { exact: true });
const isPhone = () => test.info().project.name === 'mobile';
// Shots of an open form are viewport-sized: a full-page capture resizes the viewport, which
// crosses the desktop breakpoint and remounts the form without its draft.

async function openTrack(page: Page, projectId: string, trackId: string) {
  await page.goto(trackUrl(projectId, trackId));
  await expect(
    page.getByRole('heading', { level: 1, name: /Midnight Drive/ }),
  ).toBeVisible();
}

// Phones open the bottom sheet; desktop has the form inline already.
async function startNote(page: Page) {
  if (isPhone()) await page.getByRole('button', { name: 'Add note' }).click();
  await noteField(page).click();
}

async function waitForAudio(page: Page) {
  await expect(playButton(page)).not.toHaveAttribute('aria-busy');
}

test('loading', async ({ page, context }) => {
  const { project, track } = await seedTrack(context);
  await page.route(`**/api/tracks/${track.id}`, () => {});
  await page.goto(trackUrl(project.id, track.id));
  await expect(
    page.getByRole('status', { name: 'Loading track' }),
  ).toBeVisible();
  await captureScreenshot(page, 'track-loading', { waitForIdle: false });
});

test('waveform ready, audio buffering', async ({ page, context }) => {
  const { project, track } = await seedTrack(context);
  await page.route(STORAGE, () => {});
  await openTrack(page, project.id, track.id);
  await expect(waveform(page)).toBeVisible();
  await expect(markers(page).first()).toBeAttached();
  await expect(playButton(page)).toHaveAttribute('aria-busy', 'true');
  await captureScreenshot(page, 'track-buffering', { waitForIdle: false });
});

test('default', async ({ page, context }) => {
  const { project, track } = await seedTrack(context);
  await openTrack(page, project.id, track.id);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'v2Midnight Drive',
  );
  await expect(
    page.getByRole('link', { name: 'Midnight Drive', exact: true }),
  ).toHaveAttribute('href', `/app/projects/${project.id}`);
  const chips = page
    .getByRole('navigation', { name: 'Versions' })
    .getByRole('link');
  await expect(chips).toHaveText(['v2', 'v1']);
  await expect(chips.first()).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('heading', { name: '6 notes · 2 done' }),
  ).toBeVisible();
  await expect(noteRows(page).locator('button > span.font-mono')).toHaveText([
    '0:08',
    '0:42',
    '1:02',
    '1:42',
    '2:31',
    '3:55',
  ]);
  await expect(currentTime(page)).toHaveText('0:00');
  await expect(page.getByText('/ 4:12')).toBeVisible();
  await waitForAudio(page);
  await captureScreenshot(page, 'track-default');
});

test('playing', async ({ page, context }) => {
  const { project, track } = await seedTrack(context);
  await openTrack(page, project.id, track.id);
  await waitForAudio(page);
  // Seek just before the 0:42 note, then play past it.
  await noteRow(page, 'Kick and bass')
    .getByRole('button', { name: /Play from/ })
    .click();
  await expect(currentTime(page)).toHaveText('0:42');
  await playButton(page).click();
  await expect(pauseButton(page)).toBeVisible();
  await expect(currentTime(page)).toHaveText('0:43', { timeout: 5000 });
  await expect(noteRow(page, 'Kick and bass')).toHaveAttribute(
    'data-active',
    'true',
  );
  await pauseButton(page).click();
  await expect(playButton(page)).toBeVisible();
  await expect(noteRow(page, 'Kick and bass')).not.toHaveAttribute(
    'data-active',
  );
  // Paused, nothing is highlighted; play again to capture the playing state.
  await playButton(page).click();
  await expect(noteRow(page, 'Kick and bass')).toHaveAttribute(
    'data-active',
    'true',
  );
  await captureScreenshot(page, 'track-playing', { waitForIdle: false });
});

test('clicking at 75% of the waveform seeks to 75% of the track', async ({
  page,
  context,
}) => {
  const { project, track } = await seedTrack(context);
  await openTrack(page, project.id, track.id);
  const box = await waveform(page).boundingBox();
  if (!box) throw new Error('waveform has no box');
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 3);
  await expect(currentTime(page)).toHaveText('3:09');
});

test('tapping a note or a marker seeks to it', async ({ page, context }) => {
  const { project, track } = await seedTrack(context);
  await openTrack(page, project.id, track.id);
  await noteRow(page, 'Chorus vocal')
    .getByRole('button', { name: /Play from/ })
    .click();
  await expect(currentTime(page)).toHaveText('1:02');
  await markers(page).last().click();
  await expect(currentTime(page)).toHaveText('3:55');
});

test('zoomed', async ({ page, context }) => {
  const { project, track } = await seedTrack(context);
  await openTrack(page, project.id, track.id);
  const scroller = waveform(page).locator('..');
  const overflow = () =>
    scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(await overflow()).toBe(0);
  await expect(page.getByRole('button', { name: 'Zoom out' })).toBeDisabled();

  await noteRow(page, 'Love this breakdown')
    .getByRole('button', { name: /Play from/ })
    .click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(waveform(page)).toHaveAttribute('data-zoom', '4');
  expect(await overflow()).toBeGreaterThan(0);
  // Zooming keeps the playhead in view.
  const playhead = await page.locator('[data-playhead]').boundingBox();
  const view = await scroller.boundingBox();
  if (!playhead || !view) throw new Error('missing boxes');
  expect(playhead.x).toBeGreaterThan(view.x);
  expect(playhead.x).toBeLessThan(view.x + view.width);
  await captureScreenshot(page, 'track-zoomed');

  await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect(waveform(page)).toHaveAttribute('data-zoom', '1');
  expect(await overflow()).toBe(0);
});

test('no notes', async ({ page, context }) => {
  const { project, track } = await seedTrack(context, []);
  await openTrack(page, project.id, track.id);
  await expect(page.getByText('No notes yet')).toBeVisible();
  await expect(
    page.getByText('Press play and add one when something catches your ear.'),
  ).toBeVisible();
  await expect(markers(page)).toHaveCount(0);
  await waitForAudio(page);
  await captureScreenshot(page, 'track-no-notes');
});

test('adding a note at the playhead, nudged', async ({ page, context }) => {
  const { project, track } = await seedTrack(context);
  await openTrack(page, project.id, track.id);
  await waitForAudio(page);
  await noteRow(page, 'Snare reverb')
    .getByRole('button', { name: /Play from/ })
    .click();
  await startNote(page);
  await noteField(page).fill('Vocal too loud in chorus');
  await page.getByRole('button', { name: '1 second later' }).click();
  await page.getByRole('button', { name: '1 second later' }).click();
  const form = page.locator('form').filter({ has: noteField(page) });
  await expect(form.getByText('1:44')).toBeVisible();
  await captureScreenshot(page, 'track-adding', { fullPage: false });

  await form.getByRole('button', { name: 'Save' }).click();
  await expect(noteRow(page, 'Vocal too loud in chorus')).toContainText('1:44');
  await expect(noteRows(page).nth(4)).toContainText('Vocal too loud in chorus');
  await expect(
    page.getByRole('heading', { name: '7 notes · 2 done' }),
  ).toBeVisible();
  await expect.poll(() => markedNotes(page)).toBe(7);
  if (!isPhone()) await expect(noteField(page)).toHaveValue('');
});

test('adding: validation', async ({ page, context }) => {
  const { project, track } = await seedTrack(context);
  await openTrack(page, project.id, track.id);
  await startNote(page);
  const form = page.locator('form').filter({ has: noteField(page) });
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByText('Write something first')).toBeVisible();
  await captureScreenshot(page, 'track-validation', { fullPage: false });

  await noteField(page).fill('x'.repeat(2001));
  await expect(form.getByText('2,001 / 2,000')).toBeVisible();
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(
    form.getByText('Notes can be up to 2,000 characters'),
  ).toBeVisible();
});

test.describe('a time outside the track', () => {
  test.use({
    expectedConsoleError: /Failed to load resource: .*status of 400/,
  });

  test('adding: a time outside the track', async ({ page, context }) => {
    const { project, track } = await seedTrack(context);
    // The nudge buttons stop at the ends, so only the server can refuse a time.
    await page.route(`**/api/tracks/${track.id}/notes`, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 400,
            json: {
              error: 'validation_failed',
              details: [
                { path: '/timestampMs', message: 'Must be within the track' },
              ],
            },
          })
        : route.fallback(),
    );
    await openTrack(page, project.id, track.id);
    await startNote(page);
    await noteField(page).fill('Too late');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Must be within the track')).toBeVisible();
    await expect(noteField(page)).toHaveValue('Too late');
  });
});

test.describe('saving fails', () => {
  test.use({
    expectedConsoleError: /Failed to load resource: .*status of 500/,
  });

  test('saving failed', async ({ page, context }) => {
    const { project, track } = await seedTrack(context);
    await page.route(`**/api/tracks/${track.id}/notes`, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, json: { error: 'internal' } })
        : route.fallback(),
    );
    await openTrack(page, project.id, track.id);
    await startNote(page);
    await noteField(page).fill('Hi-hats a touch harsh');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText(
      "Couldn't save the note",
    );
    await expect(noteField(page)).toHaveValue('Hi-hats a touch harsh');
    await captureScreenshot(page, 'track-save-failed', {
      fullPage: false,
    });

    await page.unroute(`**/api/tracks/${track.id}/notes`);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(noteRow(page, 'Hi-hats a touch harsh')).toBeVisible();
  });
});

test('editing a note', async ({ page, context }) => {
  const { project, track } = await seedTrack(context);
  await openTrack(page, project.id, track.id);
  await noteRow(page, 'Fade starts')
    .getByRole('button', { name: /More for note/ })
    .click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await expect(noteField(page)).toHaveValue('Fade starts too early');
  await expect(noteField(page)).toBeFocused();
  await noteField(page).fill('Fade starts too early, push it 8 bars');
  await page.getByRole('button', { name: '1 second earlier' }).click();
  await captureScreenshot(page, 'track-editing', { fullPage: false });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(noteRow(page, 'push it 8 bars')).toContainText('3:54');

  await page.reload();
  await expect(
    noteRow(page, 'Fade starts too early, push it 8 bars'),
  ).toContainText('3:54');
});

test('marking done and undone', async ({ page, context }) => {
  const { project, track } = await seedTrack(context);
  await openTrack(page, project.id, track.id);
  const done = page.getByRole('checkbox', { name: 'Done: note at 0:42' });
  const saved = () =>
    page.waitForResponse(
      (res) => res.request().method() === 'PATCH' && res.ok(),
    );
  let patch = saved();
  await done.click();
  await expect(done).toBeChecked();
  await expect(
    page.getByRole('heading', { name: '6 notes · 3 done' }),
  ).toBeVisible();
  await patch;
  await page.reload();
  await expect(done).toBeChecked();
  patch = saved();
  await done.click();
  await expect(done).not.toBeChecked();
  await patch;
  await page.reload();
  await expect(done).not.toBeChecked();
});

test.describe('a done toggle that fails', () => {
  test.use({
    expectedConsoleError: /Failed to load resource: .*status of 500/,
  });

  test('rolls back with a toast', async ({ page, context }) => {
    const { project, track } = await seedTrack(context);
    await page.route('**/api/notes/*', (route) =>
      route.fulfill({ status: 500, json: { error: 'internal' } }),
    );
    await openTrack(page, project.id, track.id);
    const done = page.getByRole('checkbox', { name: 'Done: note at 0:42' });
    await done.click();
    await expect(
      page.getByText("Couldn't update the note. Try again."),
    ).toBeVisible();
    await expect(done).not.toBeChecked();
  });
});

test('deleting a note, then undo', async ({ page, context }) => {
  const { project, track } = await seedTrack(context);
  await openTrack(page, project.id, track.id);
  await noteRow(page, 'Love this breakdown')
    .getByRole('button', { name: /More for note/ })
    .click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(noteRow(page, 'Love this breakdown')).toHaveCount(0);
  await expect.poll(() => markedNotes(page)).toBe(5);
  await expect(page.getByText('Note deleted')).toBeVisible();
  await captureScreenshot(page, 'track-note-deleted', { fullPage: false });

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(noteRow(page, 'Love this breakdown')).toContainText('2:31');
  await expect.poll(() => markedNotes(page)).toBe(6);
  await page.reload();
  await expect(noteRow(page, 'Love this breakdown')).toBeVisible();
});

test('note limit', async ({ page, context }) => {
  const { user, project, track } = await seedTrack(context, []);
  await app.db.insert(notesTable).values(
    Array.from({ length: 500 }, (_, i) => ({
      userId: user.id,
      trackId: track.id,
      timestampMs: i * 500,
      text: `Note ${i + 1}`,
    })),
  );
  await openTrack(page, project.id, track.id);
  await expect(
    page.getByText('This version has the maximum of 500 notes.'),
  ).toBeVisible();
  if (isPhone()) {
    await expect(page.getByRole('button', { name: 'Add note' })).toBeDisabled();
  } else {
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  }
  await captureScreenshot(page, 'track-note-limit', { fullPage: false });
});

test.describe('the audio fails', () => {
  test.use({
    expectedConsoleError: /Failed to load resource/,
  });

  test('audio failed', async ({ page, context }) => {
    const { project, track } = await seedTrack(context);
    let audioUrlRequests = 0;
    page.on('request', (req) => {
      if (req.url().endsWith(`/api/tracks/${track.id}/audio`))
        audioUrlRequests++;
    });
    await page.route(STORAGE, (route) => route.abort());
    await openTrack(page, project.id, track.id);
    await expect(page.getByRole('alert')).toContainText(
      "Couldn't load the audio",
    );
    // The first failure asks for a fresh link before giving up.
    expect(audioUrlRequests).toBe(2);
    await expect(waveform(page)).toBeVisible();
    await expect(noteRows(page)).toHaveCount(6);
    await expect(playButton(page)).toBeDisabled();
    await noteRow(page, 'Chorus vocal')
      .getByRole('button', { name: /Play from/ })
      .click();
    await expect(currentTime(page)).toHaveText('1:02');
    await captureScreenshot(page, 'track-audio-failed');

    await page.unroute(STORAGE);
    await page.route(STORAGE, serveAudio);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await waitForAudio(page);
  });
});

test.describe('the track fails to load', () => {
  test.use({
    expectedConsoleError:
      /Failed to load resource: net::ERR_FAILED|AxiosError: Network Error/,
  });

  test('error loading', async ({ page, context }) => {
    const { project, track } = await seedTrack(context);
    await page.route(`**/api/tracks/${track.id}`, (route) => route.abort());
    await page.goto(trackUrl(project.id, track.id));
    await expect(page.getByRole('alert')).toContainText(
      "Couldn't load this track",
    );
    await captureScreenshot(page, 'track-error');

    await page.unroute(`**/api/tracks/${track.id}`);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'v2Midnight Drive',
    );
  });
});

test('not found', async ({ page, context }) => {
  const { project } = await seedTrack(context);
  await page.goto(trackUrl(project.id, crypto.randomUUID()));
  await expect(
    page.getByRole('heading', { name: "This track doesn't exist" }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Go to my project' }),
  ).toHaveAttribute('href', '/app');
  await captureScreenshot(page, 'track-not-found');
});

test("another user's track is not found", async ({ page, context }) => {
  const other = await seedTrack(context);
  await context.clearCookies();
  const { project } = await seedTrack(context);
  // Their track under my project id, and under their own.
  for (const projectId of [project.id, other.project.id]) {
    await page.goto(trackUrl(projectId, other.track.id));
    await expect(
      page.getByRole('heading', { name: "This track doesn't exist" }),
    ).toBeVisible();
  }
});

test('a track under the wrong project is not found', async ({
  page,
  context,
}) => {
  const { track } = await seedTrack(context);
  const elsewhere = await createProject(app.db, {
    userId: track.userId,
    name: 'Other song',
  });
  await page.goto(trackUrl(elsewhere.id, track.id));
  await expect(
    page.getByRole('heading', { name: "This track doesn't exist" }),
  ).toBeVisible();
});

test('switching versions', async ({ page, context }) => {
  const { project, track, v1 } = await seedTrack(context);
  await openTrack(page, project.id, track.id);
  await page.getByRole('link', { name: /^v1: / }).click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}${trackUrl(project.id, v1.id)}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'v1Midnight Drive rough',
  );
  await expect(page.getByText('No notes yet')).toBeVisible();
});

test('Space plays and pauses', async ({ page, context }) => {
  const { project, track } = await seedTrack(context);
  await openTrack(page, project.id, track.id);
  await waitForAudio(page);
  await page.getByRole('heading', { level: 1 }).click();
  await page.keyboard.press('Space');
  await expect(pauseButton(page)).toBeVisible();
  await page.keyboard.press('Space');
  await expect(playButton(page)).toBeVisible();
  // Typing a space in a note doesn't toggle playback.
  await startNote(page);
  await noteField(page).fill('a');
  await noteField(page).press('Space');
  await expect(page.locator('button[data-variant="play"]')).toHaveAttribute(
    'aria-label',
    'Play',
  );
  await expect(noteField(page)).toHaveValue('a ');
});

test('renaming the version', async ({ page, context }) => {
  const { project, track } = await seedTrack(context);
  await openTrack(page, project.id, track.id);
  await page.getByRole('button', { name: 'Options for v2' }).click();
  await page.getByRole('menuitem', { name: 'Rename v2' }).click();
  await page
    .getByRole('textbox', { name: 'Name' })
    .fill('Midnight Drive — vox up');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'v2Midnight Drive — vox up',
  );
});

test('deleting the version', async ({ page, context }) => {
  const { project, track } = await seedTrack(context);
  await openTrack(page, project.id, track.id);
  await page.getByRole('button', { name: 'Options for v2' }).click();
  await page.getByRole('menuitem', { name: 'Delete v2' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete v2 and its 6 notes?');
  await captureScreenshot(page, 'track-delete-version', { fullPage: false });
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(`${WEB_ORIGIN}/app/projects/${project.id}`);
  await expect(
    page.getByRole('region', { name: 'Versions' }).getByRole('listitem'),
  ).toHaveCount(1);
});
