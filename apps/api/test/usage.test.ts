import {
  MAX_FILE_BYTES,
  MB,
  PROJECT_LIMIT,
  STORAGE_LIMIT_BYTES,
} from '@repo/shared/schemas';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.ts';
import {
  createProject,
  createTrack,
  createUpload,
} from './helpers/factories.ts';
import { createTestSession } from './helpers/session.ts';
import { shareProject } from './helpers/sharing.ts';
import { registerUpload, writeStoredObject } from './helpers/uploads.ts';

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

const getUsage = (cookies?: Record<string, string>) =>
  app.inject({ method: 'GET', url: '/api/usage', ...(cookies && { cookies }) });

describe('GET /api/usage', () => {
  it('401s without a session', async () => {
    const res = await getUsage();
    expect(res.statusCode).toBe(401);
  });

  it('returns zeros and the limits for a new user', async () => {
    const { cookies } = await createTestSession(app);
    const res = await getUsage(cookies);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      projectCount: 0,
      projectLimit: PROJECT_LIMIT,
      storageUsedBytes: 0,
      storageLimitBytes: STORAGE_LIMIT_BYTES,
      maxFileBytes: MAX_FILE_BYTES,
    });
  });

  it("counts only the user's own committed tracks", async () => {
    const a = await createTestSession(app);
    const b = await createTestSession(app);
    const project = await createProject(app.db, { userId: a.user.id });
    await createTrack(app.db, {
      userId: a.user.id,
      projectId: project.id,
      sizeBytes: 3 * MB,
    });
    await createTrack(app.db, {
      userId: a.user.id,
      projectId: project.id,
      sizeBytes: 2 * MB,
    });
    await createUpload(app.db, { userId: a.user.id, sizeBytes: 40 * MB });
    const other = await createProject(app.db, { userId: b.user.id });
    await createTrack(app.db, {
      userId: b.user.id,
      projectId: other.id,
      sizeBytes: 7 * MB,
    });

    const res = await getUsage(a.cookies);
    expect(res.json()).toMatchObject({
      projectCount: 1,
      storageUsedBytes: 5 * MB,
    });
  });

  it("leaves joined projects out of a collaborator's counts", async () => {
    const { collaborator } = await shareProject(app);
    const res = await getUsage(collaborator.cookies);
    expect(res.json()).toMatchObject({
      projectCount: 0,
      storageUsedBytes: 0,
    });
  });

  it('leaves previews out of storage used and the storage limit', async () => {
    const session = await createTestSession(app);
    const project = await createProject(app.db, { userId: session.user.id });
    for (let i = 0; i < 7; i++) {
      const previewKey = `users/${session.user.id}/${crypto.randomUUID()}.m4a`;
      const track = await createTrack(app.db, {
        userId: session.user.id,
        projectId: project.id,
        sizeBytes: 10 * MB,
        previewKey,
      });
      writeStoredObject(app, track.storageKey, 10 * MB);
      writeStoredObject(app, previewKey, 2 * MB);
    }

    const res = await getUsage(session.cookies);
    expect(res.json()).toMatchObject({ storageUsedBytes: 70 * MB });

    const upload = await registerUpload(app, session, {
      bytes: Buffer.alloc(40 * MB),
      projectId: project.id,
    });
    expect(upload.statusCode).toBe(403);
    expect(upload.json()).toEqual({ error: 'storage_limit_reached' });
  });
});
