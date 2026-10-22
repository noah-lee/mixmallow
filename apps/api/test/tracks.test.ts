import { notes, tracks, transcodeJobs } from '@repo/db';
import { audioUrlResponseSchema, MB, NAME_MAX } from '@repo/shared/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.ts';
import {
  createNote,
  createProject,
  createTrack,
  createTranscodeJob,
} from './helpers/factories.ts';
import { keyFromUrl } from './helpers/memory-storage.ts';
import { createTestSession } from './helpers/session.ts';
import { uploadTrack, writeStoredObject } from './helpers/uploads.ts';

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

async function sessionWithTrack(
  overrides: Partial<
    Omit<typeof tracks.$inferInsert, 'userId' | 'projectId'>
  > = {},
) {
  const session = await createTestSession(app);
  const project = await createProject(app.db, { userId: session.user.id });
  const track = await createTrack(app.db, {
    userId: session.user.id,
    projectId: project.id,
    ...overrides,
  });
  return { session, project, track };
}

const trackRow = async (id: string) =>
  (await app.db.select().from(tracks).where(eq(tracks.id, id)))[0];

// A WAV whose transcode finished; neither object is in the bucket yet.
async function sessionWithPreviewedTrack(sizeBytes = MB) {
  const session = await createTestSession(app);
  const project = await createProject(app.db, { userId: session.user.id });
  const previewKey = `users/${session.user.id}/${crypto.randomUUID()}.m4a`;
  const track = await createTrack(app.db, {
    userId: session.user.id,
    projectId: project.id,
    sizeBytes,
    previewKey,
  });
  await createTranscodeJob(app.db, { trackId: track.id, status: 'done' });
  return { session, project, track: { ...track, previewKey } };
}

describe('GET /api/tracks/:trackId', () => {
  it('401s without a session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/tracks/${MISSING_ID}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('400s for a non-uuid id', async () => {
    const { cookies } = await createTestSession(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/tracks/nope',
      cookies,
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns the track with its peaks and duration', async () => {
    const session = await createTestSession(app);
    const { track } = await uploadTrack(app, session, {
      durationMs: 61_500,
      peaks: [10, 20, 30, 40],
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/tracks/${track.id}`,
      cookies: session.cookies,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(track);
    expect(res.json()).toMatchObject({
      durationMs: 61_500,
      peaks: [10, 20, 30, 40],
    });
  });

  it("404s another user's track", async () => {
    const { track } = await sessionWithTrack();
    const { cookies } = await createTestSession(app);
    const res = await app.inject({
      method: 'GET',
      url: `/api/tracks/${track.id}`,
      cookies,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });
});

describe('PATCH /api/tracks/:trackId', () => {
  const rename = (
    trackId: string,
    name: string,
    cookies?: Record<string, string>,
  ) =>
    app.inject({
      method: 'PATCH',
      url: `/api/tracks/${trackId}`,
      payload: { name },
      ...(cookies && { cookies }),
    });

  it('401s without a session', async () => {
    const res = await rename(MISSING_ID, 'Final mix');
    expect(res.statusCode).toBe(401);
  });

  it.each([
    ['an empty', ''],
    ['a too long', 'a'.repeat(NAME_MAX + 1)],
  ])('400s %s name', async (_label, name) => {
    const { session, track } = await sessionWithTrack();
    const res = await rename(track.id, name, session.cookies);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_failed' });
  });

  it('saves the trimmed name', async () => {
    const { session, track } = await sessionWithTrack();
    const res = await rename(track.id, '  Final mix  ', session.cookies);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: track.id, name: 'Final mix' });
    expect(res.json()).not.toHaveProperty('peaks');
    expect((await trackRow(track.id))?.name).toBe('Final mix');
  });

  it("404s another user's track and leaves its name", async () => {
    const { track } = await sessionWithTrack();
    const { cookies } = await createTestSession(app);
    const res = await rename(track.id, 'Mine now', cookies);
    expect(res.statusCode).toBe(404);
    expect((await trackRow(track.id))?.name).toBe(track.name);
  });
});

describe('DELETE /api/tracks/:trackId', () => {
  const remove = (trackId: string, cookies?: Record<string, string>) =>
    app.inject({
      method: 'DELETE',
      url: `/api/tracks/${trackId}`,
      ...(cookies && { cookies }),
    });

  it('401s without a session', async () => {
    const res = await remove(MISSING_ID);
    expect(res.statusCode).toBe(401);
  });

  it('400s for a non-uuid id', async () => {
    const { cookies } = await createTestSession(app);
    const res = await remove('nope', cookies);
    expect(res.statusCode).toBe(400);
  });

  it('deletes the track, its notes and its file, and frees its storage', async () => {
    const { session, track } = await sessionWithTrack({ sizeBytes: 5 * MB });
    await createNote(app.db, { userId: session.user.id, trackId: track.id });
    writeStoredObject(app, track.storageKey, 10);
    const usage = () =>
      app.inject({
        method: 'GET',
        url: '/api/usage',
        cookies: session.cookies,
      });
    expect((await usage()).json().storageUsedBytes).toBe(5 * MB);

    const res = await remove(track.id, session.cookies);
    expect(res.statusCode).toBe(204);
    expect(await trackRow(track.id)).toBeUndefined();
    expect(
      await app.db.select().from(notes).where(eq(notes.trackId, track.id)),
    ).toEqual([]);
    expect(await app.storage.headSize(track.storageKey)).toBeNull();
    expect((await usage()).json().storageUsedBytes).toBe(0);
  });

  it("404s another user's track and leaves it and its file", async () => {
    const { track } = await sessionWithTrack();
    writeStoredObject(app, track.storageKey, 10);
    const { cookies } = await createTestSession(app);
    const res = await remove(track.id, cookies);
    expect(res.statusCode).toBe(404);
    expect(await trackRow(track.id)).toBeDefined();
    expect(await app.storage.headSize(track.storageKey)).toBe(10);
  });

  it('deletes the original, the preview and the job, freeing only the original size', async () => {
    const { session, track } = await sessionWithPreviewedTrack(5 * MB);
    writeStoredObject(app, track.storageKey, 5 * MB);
    writeStoredObject(app, track.previewKey, MB);
    const usage = () =>
      app.inject({
        method: 'GET',
        url: '/api/usage',
        cookies: session.cookies,
      });
    expect((await usage()).json().storageUsedBytes).toBe(5 * MB);

    const res = await remove(track.id, session.cookies);
    expect(res.statusCode).toBe(204);
    expect(await app.storage.headSize(track.storageKey)).toBeNull();
    expect(await app.storage.headSize(track.previewKey)).toBeNull();
    expect(
      await app.db
        .select()
        .from(transcodeJobs)
        .where(eq(transcodeJobs.trackId, track.id)),
    ).toEqual([]);
    expect((await usage()).json().storageUsedBytes).toBe(0);
  });
});

describe('GET /api/tracks/:trackId/audio', () => {
  const audioUrl = (trackId: string, cookies?: Record<string, string>) =>
    app.inject({
      method: 'GET',
      url: `/api/tracks/${trackId}/audio`,
      ...(cookies && { cookies }),
    });

  it('401s without a session', async () => {
    const res = await audioUrl(MISSING_ID);
    expect(res.statusCode).toBe(401);
  });

  it('400s for a non-uuid id', async () => {
    const { cookies } = await createTestSession(app);
    const res = await audioUrl('nope', cookies);
    expect(res.statusCode).toBe(400);
  });

  it("returns a fresh signed URL for the track's file each time", async () => {
    const { session, track } = await sessionWithTrack();

    const res = await audioUrl(track.id, session.cookies);
    expect(res.statusCode).toBe(200);
    const { url, expiresAt } = audioUrlResponseSchema.parse(res.json());
    expect(keyFromUrl(url)).toBe(track.storageKey);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    const again = await audioUrl(track.id, session.cookies);
    expect(again.statusCode).toBe(200);
  });

  it("404s another user's track", async () => {
    const { track } = await sessionWithTrack();
    const { cookies } = await createTestSession(app);
    const res = await audioUrl(track.id, cookies);
    expect(res.statusCode).toBe(404);
  });

  const audioKey = async (trackId: string, cookies: Record<string, string>) => {
    const res = await audioUrl(trackId, cookies);
    expect(res.statusCode).toBe(200);
    return keyFromUrl(audioUrlResponseSchema.parse(res.json()).url);
  };

  it('signs the preview once the track has one', async () => {
    const { session, track } = await sessionWithPreviewedTrack();
    const key = await audioKey(track.id, session.cookies);
    expect(key).toBe(track.previewKey);
    expect(key.endsWith('.m4a')).toBe(true);
  });

  it('signs the original while the transcode is queued or after it failed', async () => {
    const queued = await sessionWithTrack();
    await createTranscodeJob(app.db, { trackId: queued.track.id });
    expect(await audioKey(queued.track.id, queued.session.cookies)).toBe(
      queued.track.storageKey,
    );

    const failed = await sessionWithTrack();
    await createTranscodeJob(app.db, {
      trackId: failed.track.id,
      status: 'failed',
      attempts: 3,
      lastError: 'ffmpeg exited with code 1',
    });
    expect(await audioKey(failed.track.id, failed.session.cookies)).toBe(
      failed.track.storageKey,
    );
  });

  it('signs the original of an MP3', async () => {
    const { session, track } = await sessionWithTrack({
      format: 'mp3',
      fileName: 'Mix.mp3',
      contentType: 'audio/mpeg',
    });
    expect(await audioKey(track.id, session.cookies)).toBe(track.storageKey);
  });

  it("404s another user's track that has a preview", async () => {
    const { track } = await sessionWithPreviewedTrack();
    const { cookies } = await createTestSession(app);
    const res = await audioUrl(track.id, cookies);
    expect(res.statusCode).toBe(404);
  });
});
