import { notes, tracks, transcodeJobs } from '@repo/db';
import { audioUrlResponseSchema, MB, NAME_MAX } from '@repo/shared/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.ts';
import {
  createMember,
  createNote,
  createProject,
  createTrack,
  createTranscodeJob,
} from './helpers/factories.ts';
import { keyFromUrl } from './helpers/memory-storage.ts';
import { createTestSession, type TestSession } from './helpers/session.ts';
import { shareProject } from './helpers/sharing.ts';
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

describe('tracks of a shared project', () => {
  async function sharedTrack() {
    const shared = await shareProject(app);
    const track = shared.tracks[2];
    if (!track) throw new Error('no track');
    writeStoredObject(app, track.storageKey, 10);
    return { ...shared, track };
  }

  it('gives a collaborator the track and a signed URL for its audio', async () => {
    const { collaborator, track } = await sharedTrack();
    const detail = await app.inject({
      method: 'GET',
      url: `/api/tracks/${track.id}`,
      cookies: collaborator.cookies,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ id: track.id, version: 3 });

    const audio = await app.inject({
      method: 'GET',
      url: `/api/tracks/${track.id}/audio`,
      cookies: collaborator.cookies,
    });
    expect(audio.statusCode).toBe(200);
    const { url } = audioUrlResponseSchema.parse(audio.json());
    expect(keyFromUrl(url)).toBe(track.storageKey);
  });

  it('404s the track and its audio for an outsider', async () => {
    const { outsider, track } = await sharedTrack();
    for (const url of [
      `/api/tracks/${track.id}`,
      `/api/tracks/${track.id}/audio`,
    ]) {
      const res = await app.inject({
        method: 'GET',
        url,
        cookies: outsider.cookies,
      });
      expect(res.statusCode).toBe(404);
    }
  });

  it('forbids a collaborator to rename a version', async () => {
    const { collaborator, track } = await sharedTrack();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/tracks/${track.id}`,
      cookies: collaborator.cookies,
      payload: { name: 'Mine now' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden' });
    expect((await trackRow(track.id))?.name).toBe(track.name);
  });

  it('forbids a collaborator to delete a version and keeps its file', async () => {
    const { collaborator, track } = await sharedTrack();
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/tracks/${track.id}`,
      cookies: collaborator.cookies,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden' });
    expect(await trackRow(track.id)).toBeDefined();
    expect(await app.storage.headSize(track.storageKey)).toBe(10);
  });
});

describe('versions uploaded by a collaborator', () => {
  // Maya owns the project, Sam uploaded v4 (5 MB), Jo is another collaborator.
  async function collaboratorVersion() {
    const shared = await shareProject(app);
    const jo = await createTestSession(app, { name: 'Jo' });
    await createMember(app.db, {
      projectId: shared.project.id,
      userId: jo.user.id,
    });
    const track = await createTrack(app.db, {
      userId: shared.collaborator.user.id,
      projectId: shared.project.id,
      sizeBytes: 5 * MB,
    });
    writeStoredObject(app, track.storageKey, 10);
    return { ...shared, jo, track };
  }

  const rename = (trackId: string, session: TestSession, name = 'Renamed') =>
    app.inject({
      method: 'PATCH',
      url: `/api/tracks/${trackId}`,
      cookies: session.cookies,
      payload: { name },
    });
  const remove = (trackId: string, session: TestSession) =>
    app.inject({
      method: 'DELETE',
      url: `/api/tracks/${trackId}`,
      cookies: session.cookies,
    });
  const usedBy = async (session: TestSession) =>
    (
      await app.inject({
        method: 'GET',
        url: '/api/usage',
        cookies: session.cookies,
      })
    ).json().storageUsedBytes;

  it('lets the uploader rename and delete their own version', async () => {
    const { collaborator, track } = await collaboratorVersion();
    const renamed = await rename(track.id, collaborator, '  Sam mix  ');
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({ id: track.id, name: 'Sam mix' });

    const res = await remove(track.id, collaborator);
    expect(res.statusCode).toBe(204);
    expect(await trackRow(track.id)).toBeUndefined();
    expect(await app.storage.headSize(track.storageKey)).toBeNull();
  });

  it("forbids another collaborator to rename or delete the uploader's version", async () => {
    const { jo, track } = await collaboratorVersion();
    for (const res of [
      await rename(track.id, jo),
      await remove(track.id, jo),
    ]) {
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'forbidden' });
    }
    expect((await trackRow(track.id))?.name).toBe(track.name);
    expect(await app.storage.headSize(track.storageKey)).toBe(10);
  });

  it("deletes the uploader's version with everyone's notes and frees the owner's storage", async () => {
    const { owner, collaborator, jo, track } = await collaboratorVersion();
    for (const author of [owner, owner, jo, jo, collaborator, collaborator]) {
      await createNote(app.db, { userId: author.user.id, trackId: track.id });
    }
    const before = await usedBy(owner);

    const res = await remove(track.id, collaborator);
    expect(res.statusCode).toBe(204);
    expect(
      await app.db.select().from(notes).where(eq(notes.trackId, track.id)),
    ).toEqual([]);
    expect(await app.storage.headSize(track.storageKey)).toBeNull();
    expect(await usedBy(owner)).toBe(before - 5 * MB);
  });

  it("lets the owner rename and then delete a collaborator's version", async () => {
    const { owner, track } = await collaboratorVersion();
    const renamed = await rename(track.id, owner, 'Owner pick');
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({ name: 'Owner pick' });
    expect((await remove(track.id, owner)).statusCode).toBe(204);
    expect(await trackRow(track.id)).toBeUndefined();
  });

  it("keeps a removed uploader's version for the owner and 404s it for the uploader", async () => {
    const { owner, collaborator, project, track } = await collaboratorVersion();
    const left = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}/members/${collaborator.user.id}`,
      cookies: owner.cookies,
    });
    expect(left.statusCode).toBe(204);

    const list = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/tracks`,
      cookies: owner.cookies,
    });
    expect(list.json().items[0]).toMatchObject({
      id: track.id,
      uploader: { id: collaborator.user.id, name: 'Sam' },
    });
    expect(await usedBy(owner)).toBe(8 * MB);

    const get = await app.inject({
      method: 'GET',
      url: `/api/tracks/${track.id}`,
      cookies: collaborator.cookies,
    });
    for (const res of [
      get,
      await rename(track.id, collaborator),
      await remove(track.id, collaborator),
    ]) {
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'not_found' });
    }
    expect((await trackRow(track.id))?.name).toBe(track.name);

    expect((await rename(track.id, owner, 'Kept')).statusCode).toBe(200);
    expect((await remove(track.id, owner)).statusCode).toBe(204);
  });

  it("404s an outsider's rename or delete of any version", async () => {
    const {
      outsider,
      track,
      tracks: ownerVersions,
    } = await collaboratorVersion();
    for (const id of [track.id, ownerVersions[0]?.id ?? MISSING_ID]) {
      for (const res of [
        await rename(id, outsider),
        await remove(id, outsider),
      ]) {
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ error: 'not_found' });
      }
    }
    expect((await trackRow(track.id))?.name).toBe(track.name);
    expect(await app.storage.headSize(track.storageKey)).toBe(10);
  });

  it('names the uploader, without an email, in the detail and the rename response', async () => {
    const { owner, collaborator, track } = await collaboratorVersion();
    const sam = {
      id: collaborator.user.id,
      name: 'Sam',
      picture: 'https://example.com/sam.png',
    };
    const detail = await app.inject({
      method: 'GET',
      url: `/api/tracks/${track.id}`,
      cookies: owner.cookies,
    });
    expect(detail.json().uploader).toEqual(sam);
    const renamed = await rename(track.id, collaborator);
    expect(renamed.json().uploader).toEqual(sam);
  });
});
