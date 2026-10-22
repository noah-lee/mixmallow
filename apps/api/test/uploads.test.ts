import { projects, tracks, transcodeJobs, uploads } from '@repo/db';
import {
  completeUploadResponseSchema,
  createUploadResponseSchema,
  MAX_FILE_BYTES,
  MB,
  STORAGE_LIMIT_BYTES,
} from '@repo/shared/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.ts';
import {
  createProject,
  createTrack,
  createUpload,
} from './helpers/factories.ts';
import { keyFromUrl } from './helpers/memory-storage.ts';
import { createTestSession, type TestSession } from './helpers/session.ts';
import { shareProject } from './helpers/sharing.ts';
import {
  completeUpload,
  putUpload,
  registerUpload,
  uploadTrack,
  writeStoredObject,
} from './helpers/uploads.ts';

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const audio = Buffer.from('RIFF fake wav bytes');

const uploadRows = (userId: string) =>
  app.db.select().from(uploads).where(eq(uploads.userId, userId));
const trackRows = (userId: string) =>
  app.db.select().from(tracks).where(eq(tracks.userId, userId));
const jobRows = () => app.db.select().from(transcodeJobs);

function register(session: TestSession, payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/api/uploads',
    cookies: session.cookies,
    payload,
  });
}

async function registered(session: TestSession, projectId?: string) {
  const res = await registerUpload(app, session, {
    bytes: audio,
    ...(projectId && { projectId }),
  });
  expect(res.statusCode).toBe(201);
  return createUploadResponseSchema.parse(res.json());
}

async function storedTrack(session: TestSession, sizeBytes: number) {
  const project = await createProject(app.db, { userId: session.user.id });
  await createTrack(app.db, {
    userId: session.user.id,
    projectId: project.id,
    sizeBytes,
  });
  return project;
}

describe('POST /api/uploads', () => {
  it('401s without a session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      payload: { fileName: 'a.wav', sizeBytes: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it.each([
    ['a video file', { fileName: 'clip.mp4', sizeBytes: 1000 }],
    ['a text file', { fileName: 'notes.txt', sizeBytes: 1000 }],
    [
      'a file over the size limit',
      { fileName: 'a.wav', sizeBytes: MAX_FILE_BYTES + 1 },
    ],
  ])('rejects %s and records nothing', async (_label, payload) => {
    const session = await createTestSession(app);
    const res = await register(session, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_failed' });
    expect(await uploadRows(session.user.id)).toEqual([]);
  });

  it('refuses a file that would go over the storage limit', async () => {
    const session = await createTestSession(app);
    const project = await storedTrack(session, 70 * MB);
    const res = await register(session, {
      projectId: project.id,
      fileName: 'a.wav',
      sizeBytes: 40 * MB,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'storage_limit_reached' });
    expect(await uploadRows(session.user.id)).toEqual([]);
  });

  it('allows filling storage exactly to the limit', async () => {
    const session = await createTestSession(app);
    const project = await storedTrack(session, 70 * MB);
    const res = await register(session, {
      projectId: project.id,
      fileName: 'a.wav',
      sizeBytes: STORAGE_LIMIT_BYTES - 70 * MB,
    });
    expect(res.statusCode).toBe(201);
  });

  it('refuses a new project once the project limit is reached', async () => {
    const session = await createTestSession(app);
    await createProject(app.db, { userId: session.user.id });
    const res = await register(session, { fileName: 'a.wav', sizeBytes: 10 });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'project_limit_reached' });
  });

  it("404s another user's project", async () => {
    const other = await createTestSession(app);
    const project = await createProject(app.db, { userId: other.user.id });
    const session = await createTestSession(app);
    const res = await register(session, {
      projectId: project.id,
      fileName: 'a.wav',
      sizeBytes: 10,
    });
    expect(res.statusCode).toBe(404);
    expect(await uploadRows(session.user.id)).toEqual([]);
  });

  it('returns a signed PUT with the content type taken from the extension', async () => {
    const session = await createTestSession(app);
    const res = await register(session, { fileName: 'Mix.MP3', sizeBytes: 10 });
    expect(res.statusCode).toBe(201);
    const body = createUploadResponseSchema.parse(res.json());
    expect(body.method).toBe('PUT');
    expect(body.headers).toEqual({ 'Content-Type': 'audio/mpeg' });
    const [row] = await uploadRows(session.user.id);
    expect(row).toMatchObject({
      id: body.uploadId,
      format: 'mp3',
      contentType: 'audio/mpeg',
      projectId: null,
    });
  });

  it('replaces a previous pending upload and its stored file', async () => {
    const session = await createTestSession(app);
    const first = await registered(session);
    putUpload(app, first, audio);
    const [firstRow] = await uploadRows(session.user.id);
    if (!firstRow) throw new Error('no first upload');

    const second = await registered(session);
    const rows = await uploadRows(session.user.id);
    expect(rows.map((r) => r.id)).toEqual([second.uploadId]);
    expect(await app.storage.headSize(firstRow.storageKey)).toBeNull();
  });
});

describe('POST /api/uploads/:uploadId/complete', () => {
  it('401s without a session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/uploads/${MISSING_ID}/complete`,
      payload: { durationMs: 1000, peaks: [1] },
    });
    expect(res.statusCode).toBe(401);
  });

  it.each([
    ['peaks above 255', { durationMs: 1000, peaks: [0, 256] }],
    ['negative peaks', { durationMs: 1000, peaks: [-1] }],
    ['no peaks', { durationMs: 1000, peaks: [] }],
    ['a zero duration', { durationMs: 0, peaks: [1] }],
  ])('rejects %s', async (_label, payload) => {
    const session = await createTestSession(app);
    const { uploadId } = await registered(session);
    const res = await app.inject({
      method: 'POST',
      url: `/api/uploads/${uploadId}/complete`,
      cookies: session.cookies,
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_failed' });
  });

  it('creates the project and version 1 from the first upload', async () => {
    const session = await createTestSession(app);
    const result = await uploadTrack(app, session, {
      fileName: 'Midnight Drive.wav',
      bytes: audio,
      durationMs: 252_000,
      peaks: [3, 200, 17],
    });
    expect(result.track).toMatchObject({
      projectId: result.projectId,
      version: 1,
      name: 'Midnight Drive',
      format: 'wav',
      sizeBytes: audio.length,
      durationMs: 252_000,
      peaks: [3, 200, 17],
      noteCount: 0,
      doneNoteCount: 0,
    });
    const [project] = await app.db
      .select()
      .from(projects)
      .where(eq(projects.id, result.projectId));
    expect(project).toMatchObject({
      userId: session.user.id,
      name: 'Midnight Drive',
    });
    expect(await uploadRows(session.user.id)).toEqual([]);
  });

  it('gives an upload into an existing project the next version', async () => {
    const session = await createTestSession(app);
    const first = await uploadTrack(app, session, { bytes: audio });
    const second = await uploadTrack(app, session, {
      bytes: audio,
      projectId: first.projectId,
      fileName: 'Mix v2.flac',
    });
    expect(second.projectId).toBe(first.projectId);
    expect(second.track).toMatchObject({ version: 2, format: 'flac' });
  });

  it('never reuses the number of a deleted version', async () => {
    const session = await createTestSession(app);
    const project = await createProject(app.db, { userId: session.user.id });
    const userId = session.user.id;
    await createTrack(app.db, { userId, projectId: project.id });
    const v2 = await createTrack(app.db, { userId, projectId: project.id });
    await createTrack(app.db, { userId, projectId: project.id });
    await app.db.delete(tracks).where(eq(tracks.id, v2.id));

    const result = await uploadTrack(app, session, {
      bytes: audio,
      projectId: project.id,
    });
    expect(result.track.version).toBe(4);
  });

  it('answers 409 until the file is stored, keeping the upload for a retry', async () => {
    const session = await createTestSession(app);
    const { uploadId } = await registered(session);
    const res = await completeUpload(app, session, uploadId);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'upload_incomplete' });
    expect(await trackRows(session.user.id)).toEqual([]);
    expect(await uploadRows(session.user.id)).toHaveLength(1);

    const usage = await app.inject({
      method: 'GET',
      url: '/api/usage',
      cookies: session.cookies,
    });
    expect(usage.json()).toMatchObject({
      projectCount: 0,
      storageUsedBytes: 0,
    });
  });

  it('refuses a stored file whose size differs, deleting it and the upload', async () => {
    const session = await createTestSession(app);
    const { uploadId } = await registered(session);
    const [row] = await uploadRows(session.user.id);
    if (!row) throw new Error('no upload');
    writeStoredObject(app, row.storageKey, audio.length + 5);

    const res = await completeUpload(app, session, uploadId);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'upload_size_mismatch' });
    expect(await uploadRows(session.user.id)).toEqual([]);
    expect(await app.storage.headSize(row.storageKey)).toBeNull();
    expect(await trackRows(session.user.id)).toEqual([]);
  });

  it('refuses when storage filled up after registering, deleting the file', async () => {
    const session = await createTestSession(app);
    const project = await storedTrack(
      session,
      STORAGE_LIMIT_BYTES - audio.length,
    );
    const upload = await registered(session, project.id);
    putUpload(app, upload, audio);
    const [row] = await uploadRows(session.user.id);
    if (!row) throw new Error('no upload');
    await createTrack(app.db, {
      userId: session.user.id,
      projectId: project.id,
      sizeBytes: 1,
    });

    const res = await completeUpload(app, session, upload.uploadId);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'storage_limit_reached' });
    expect(await app.storage.headSize(row.storageKey)).toBeNull();
    expect(await uploadRows(session.user.id)).toEqual([]);
  });

  it('creates one track when the same upload is completed twice at once', async () => {
    const session = await createTestSession(app);
    const upload = await registered(session);
    putUpload(app, upload, audio);
    const results = await Promise.all([
      completeUpload(app, session, upload.uploadId),
      completeUpload(app, session, upload.uploadId),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 404]);
    expect(await trackRows(session.user.id)).toHaveLength(1);
  });

  it("404s another user's upload and leaves it in place", async () => {
    const owner = await createTestSession(app);
    const upload = await registered(owner);
    putUpload(app, upload, audio);
    const session = await createTestSession(app);
    const res = await completeUpload(app, session, upload.uploadId);
    expect(res.statusCode).toBe(404);
    expect(await uploadRows(owner.user.id)).toHaveLength(1);
    expect(await trackRows(session.user.id)).toEqual([]);
  });

  it('queues one transcode job for a completed WAV and answers as before', async () => {
    const session = await createTestSession(app);
    const upload = await registered(session);
    putUpload(app, upload, audio);
    const res = await completeUpload(app, session, upload.uploadId);
    expect(res.statusCode).toBe(201);
    const body = completeUploadResponseSchema.parse(res.json());
    expect(res.json()).toEqual(body);

    const jobs = await jobRows();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      trackId: body.track.id,
      status: 'queued',
      attempts: 0,
    });
  });

  it('queues a transcode job for a completed FLAC', async () => {
    const session = await createTestSession(app);
    const { track } = await uploadTrack(app, session, { fileName: 'Mix.flac' });
    const jobs = await jobRows();
    expect(jobs.map((job) => job.trackId)).toEqual([track.id]);
  });

  it('queues no transcode job for MP3, AAC or M4A', async () => {
    const session = await createTestSession(app);
    const { projectId } = await uploadTrack(app, session, {
      fileName: 'Mix.mp3',
    });
    await uploadTrack(app, session, { fileName: 'Mix.aac', projectId });
    await uploadTrack(app, session, { fileName: 'Mix.m4a', projectId });
    expect(await trackRows(session.user.id)).toHaveLength(3);
    expect(await jobRows()).toEqual([]);
  });

  it('queues no transcode job when completing fails', async () => {
    const session = await createTestSession(app);
    const incomplete = await registered(session);
    expect(
      (await completeUpload(app, session, incomplete.uploadId)).json(),
    ).toEqual({ error: 'upload_incomplete' });

    const mismatched = await registered(session);
    writeStoredObject(app, keyFromUrl(mismatched.uploadUrl), audio.length + 5);
    expect(
      (await completeUpload(app, session, mismatched.uploadId)).json(),
    ).toEqual({ error: 'upload_size_mismatch' });

    const project = await storedTrack(
      session,
      STORAGE_LIMIT_BYTES - audio.length,
    );
    const overLimit = await registered(session, project.id);
    putUpload(app, overLimit, audio);
    await createTrack(app.db, {
      userId: session.user.id,
      projectId: project.id,
      sizeBytes: 1,
    });
    expect(
      (await completeUpload(app, session, overLimit.uploadId)).json(),
    ).toEqual({ error: 'storage_limit_reached' });

    expect(await jobRows()).toEqual([]);
  });

  it('queues one transcode job when the same upload is completed twice at once', async () => {
    const session = await createTestSession(app);
    const upload = await registered(session);
    putUpload(app, upload, audio);
    await Promise.all([
      completeUpload(app, session, upload.uploadId),
      completeUpload(app, session, upload.uploadId),
    ]);
    const [track] = await trackRows(session.user.id);
    const jobs = await jobRows();
    expect(jobs.map((job) => job.trackId)).toEqual([track?.id]);
  });
});

describe('DELETE /api/uploads/:uploadId', () => {
  const cancel = (uploadId: string, cookies?: Record<string, string>) =>
    app.inject({
      method: 'DELETE',
      url: `/api/uploads/${uploadId}`,
      ...(cookies && { cookies }),
    });

  it('401s without a session', async () => {
    const res = await cancel(MISSING_ID);
    expect(res.statusCode).toBe(401);
  });

  it('400s for a non-uuid id', async () => {
    const { cookies } = await createTestSession(app);
    const res = await cancel('nope', cookies);
    expect(res.statusCode).toBe(400);
  });

  it('cancels the upload and deletes its stored file', async () => {
    const session = await createTestSession(app);
    const upload = await registered(session);
    putUpload(app, upload, audio);
    const [row] = await uploadRows(session.user.id);
    if (!row) throw new Error('no upload');

    const res = await cancel(upload.uploadId, session.cookies);
    expect(res.statusCode).toBe(204);
    expect(await uploadRows(session.user.id)).toEqual([]);
    expect(await app.storage.headSize(row.storageKey)).toBeNull();
  });

  it("404s another user's upload and leaves it in place", async () => {
    const owner = await createTestSession(app);
    const upload = await createUpload(app.db, { userId: owner.user.id });
    writeStoredObject(app, upload.storageKey, 10);
    const { cookies } = await createTestSession(app);
    const res = await cancel(upload.id, cookies);
    expect(res.statusCode).toBe(404);
    expect(await uploadRows(owner.user.id)).toHaveLength(1);
    expect(await app.storage.headSize(upload.storageKey)).toBe(10);
  });
});

describe('uploads by a collaborator', () => {
  it('forbids uploading a version into a joined project', async () => {
    const { collaborator, project } = await shareProject(app);
    const res = await register(collaborator, {
      projectId: project.id,
      fileName: 'a.wav',
      sizeBytes: 10,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden' });
    expect(await uploadRows(collaborator.user.id)).toEqual([]);
  });

  it("creates the collaborator's own project from a first upload and leaves the owner's usage", async () => {
    const { owner, collaborator } = await shareProject(app);
    const usage = (session: TestSession) =>
      app.inject({
        method: 'GET',
        url: '/api/usage',
        cookies: session.cookies,
      });
    const before = (await usage(owner)).json();

    const result = await uploadTrack(app, collaborator, { bytes: audio });
    const [project] = await app.db
      .select()
      .from(projects)
      .where(eq(projects.id, result.projectId));
    expect(project?.userId).toBe(collaborator.user.id);
    expect((await usage(owner)).json()).toEqual(before);
    expect((await usage(collaborator)).json()).toMatchObject({
      projectCount: 1,
      storageUsedBytes: audio.length,
    });
  });
});
