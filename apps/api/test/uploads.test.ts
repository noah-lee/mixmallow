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
  createMember,
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

async function registered(
  session: TestSession,
  projectId?: string,
  bytes = audio,
) {
  const res = await registerUpload(app, session, {
    bytes,
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
  // A fresh app, so this block gets its own per-IP rate-limit budget.
  beforeAll(async () => {
    await app.close();
    app = await createTestApp();
  });

  const usageOf = async (session: TestSession) =>
    (
      await app.inject({
        method: 'GET',
        url: '/api/usage',
        cookies: session.cookies,
      })
    ).json().storageUsedBytes;

  // Leaves the owner `left` bytes of storage on top of shareProject's three 1 MB versions.
  async function fillOwner(
    shared: Awaited<ReturnType<typeof shareProject>>,
    left: number,
  ) {
    await createTrack(app.db, {
      userId: shared.owner.user.id,
      projectId: shared.project.id,
      sizeBytes: STORAGE_LIMIT_BYTES - 3 * MB - left,
    });
  }

  async function joinAs(name: string, projectId: string) {
    const session = await createTestSession(app, { name });
    await createMember(app.db, { projectId, userId: session.user.id });
    return session;
  }

  it('registers and completes a version into a joined project, credited to the uploader', async () => {
    const { owner, collaborator, project } = await shareProject(app);
    const result = await uploadTrack(app, collaborator, {
      bytes: audio,
      projectId: project.id,
    });
    const sam = {
      id: collaborator.user.id,
      name: 'Sam',
      picture: 'https://example.com/sam.png',
    };
    expect(result.projectId).toBe(project.id);
    expect(result.track).toMatchObject({ version: 4, uploader: sam });
    expect(await trackRows(collaborator.user.id)).toHaveLength(1);

    for (const session of [owner, collaborator]) {
      const list = await app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/tracks`,
        cookies: session.cookies,
      });
      expect(list.json().items[0]).toMatchObject({
        id: result.track.id,
        version: 4,
        uploader: sam,
      });
      const detail = await app.inject({
        method: 'GET',
        url: `/api/tracks/${result.track.id}`,
        cookies: session.cookies,
      });
      expect(detail.json()).toMatchObject({ version: 4, uploader: sam });
    }
  });

  it("counts the version toward the owner's storage, not the uploader's", async () => {
    const { owner, collaborator, project } = await shareProject(app);
    await createTrack(app.db, {
      userId: owner.user.id,
      projectId: project.id,
      sizeBytes: 59 * MB,
    });
    await storedTrack(collaborator, 10 * MB);
    expect(await usageOf(owner)).toBe(62 * MB);

    await uploadTrack(app, collaborator, {
      bytes: Buffer.alloc(9 * MB),
      projectId: project.id,
    });
    expect(await usageOf(owner)).toBe(71 * MB);
    expect(await usageOf(collaborator)).toBe(10 * MB);
  });

  it("refuses to register a file bigger than the owner's space left", async () => {
    const shared = await shareProject(app);
    await fillOwner(shared, 5 * MB);
    const res = await register(shared.collaborator, {
      projectId: shared.project.id,
      fileName: 'a.wav',
      sizeBytes: 6 * MB,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'storage_limit_reached' });
    expect(await uploadRows(shared.collaborator.user.id)).toEqual([]);
  });

  it("ignores the uploader's own full storage when uploading to a joined project", async () => {
    const { collaborator, project } = await shareProject(app);
    await storedTrack(collaborator, STORAGE_LIMIT_BYTES);
    const res = await registerUpload(app, collaborator, {
      bytes: audio,
      projectId: project.id,
    });
    expect(res.statusCode).toBe(201);
  });

  it('lets only the first of two uploads that together overfill the owner complete', async () => {
    const shared = await shareProject(app);
    await fillOwner(shared, 10 * MB);
    const jo = await joinAs('Jo', shared.project.id);
    const bytes = Buffer.alloc(6 * MB);
    const first = await registered(
      shared.collaborator,
      shared.project.id,
      bytes,
    );
    const second = await registered(jo, shared.project.id, bytes);
    putUpload(app, first, bytes);
    putUpload(app, second, bytes);

    const done = await completeUpload(app, shared.collaborator, first.uploadId);
    expect(done.statusCode).toBe(201);
    const refused = await completeUpload(app, jo, second.uploadId);
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toEqual({ error: 'storage_limit_reached' });
    expect(await app.storage.headSize(keyFromUrl(second.uploadUrl))).toBeNull();
    expect(await uploadRows(jo.user.id)).toEqual([]);
    expect(await trackRows(jo.user.id)).toEqual([]);
    expect(await usageOf(shared.owner)).toBeLessThanOrEqual(
      STORAGE_LIMIT_BYTES,
    );
  });

  it('completes only one of two overfilling uploads sent at once', async () => {
    const shared = await shareProject(app);
    await fillOwner(shared, 10 * MB);
    const jo = await joinAs('Jo', shared.project.id);
    const bytes = Buffer.alloc(6 * MB);
    const first = await registered(
      shared.collaborator,
      shared.project.id,
      bytes,
    );
    const second = await registered(jo, shared.project.id, bytes);
    putUpload(app, first, bytes);
    putUpload(app, second, bytes);

    const results = await Promise.all([
      completeUpload(app, shared.collaborator, first.uploadId),
      completeUpload(app, jo, second.uploadId),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 403]);
    expect(await usageOf(shared.owner)).toBe(STORAGE_LIMIT_BYTES - 4 * MB);
  });

  it('completes uploads crossing between two owners at once', async () => {
    const { owner, collaborator, project } = await shareProject(app);
    const samsProject = await storedTrack(collaborator, MB);
    await createMember(app.db, {
      projectId: samsProject.id,
      userId: owner.user.id,
    });
    const intoMaya = await registered(collaborator, project.id);
    const intoSam = await registered(owner, samsProject.id);
    putUpload(app, intoMaya, audio);
    putUpload(app, intoSam, audio);

    const results = await Promise.all([
      completeUpload(app, collaborator, intoMaya.uploadId),
      completeUpload(app, owner, intoSam.uploadId),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([201, 201]);
  });

  it('404s completion after the uploader was removed, discarding the upload and file', async () => {
    const { owner, collaborator, project } = await shareProject(app);
    const upload = await registered(collaborator, project.id);
    putUpload(app, upload, audio);
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}/members/${collaborator.user.id}`,
      cookies: owner.cookies,
    });
    expect(removed.statusCode).toBe(204);

    const res = await completeUpload(app, collaborator, upload.uploadId);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
    expect(await trackRows(collaborator.user.id)).toEqual([]);
    expect(await uploadRows(collaborator.user.id)).toEqual([]);
    expect(await app.storage.headSize(keyFromUrl(upload.uploadUrl))).toBeNull();
  });

  it('404s completion after the project was deleted', async () => {
    const { owner, collaborator, project } = await shareProject(app);
    const upload = await registered(collaborator, project.id);
    putUpload(app, upload, audio);
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}`,
      cookies: owner.cookies,
    });
    expect(deleted.statusCode).toBe(204);

    const res = await completeUpload(app, collaborator, upload.uploadId);
    expect(res.statusCode).toBe(404);
    expect(await trackRows(collaborator.user.id)).toEqual([]);
  });

  it("404s an outsider's registration and their completion of a member's upload", async () => {
    const { collaborator, outsider, project } = await shareProject(app);
    const res = await register(outsider, {
      projectId: project.id,
      fileName: 'a.wav',
      sizeBytes: 10,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
    expect(await uploadRows(outsider.user.id)).toEqual([]);

    const upload = await registered(collaborator, project.id);
    putUpload(app, upload, audio);
    const completed = await completeUpload(app, outsider, upload.uploadId);
    expect(completed.statusCode).toBe(404);
    expect(await uploadRows(collaborator.user.id)).toHaveLength(1);
    expect(await trackRows(outsider.user.id)).toEqual([]);
  });

  it('rejects a project id that is not a uuid', async () => {
    const { collaborator } = await shareProject(app);
    const res = await register(collaborator, {
      projectId: 'nope',
      fileName: 'a.wav',
      sizeBytes: 10,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_failed' });
  });

  it("replaces a pending upload to the member's own project with one into a joined project", async () => {
    const { collaborator, project } = await shareProject(app);
    const own = await createProject(app.db, { userId: collaborator.user.id });
    const first = await registered(collaborator, own.id);
    putUpload(app, first, audio);

    const second = await registered(collaborator, project.id);
    const rows = await uploadRows(collaborator.user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: second.uploadId,
      projectId: project.id,
    });
    expect(await app.storage.headSize(keyFromUrl(first.uploadUrl))).toBeNull();
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
