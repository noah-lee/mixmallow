import { notes, projects, tracks } from '@repo/db';
import { NAME_MAX } from '@repo/shared/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.ts';
import {
  createNote,
  createProject,
  createTrack,
  createUpload,
} from './helpers/factories.ts';
import { createTestSession, type TestSession } from './helpers/session.ts';
import { writeStoredObject } from './helpers/uploads.ts';

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

async function sessionWithProject() {
  const session = await createTestSession(app);
  const project = await createProject(app.db, { userId: session.user.id });
  return { session, project };
}

function addTrack(session: TestSession, projectId: string) {
  return createTrack(app.db, { userId: session.user.id, projectId });
}

describe('GET /api/projects', () => {
  it('401s without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(res.statusCode).toBe(401);
  });

  it('returns an empty list for a new user', async () => {
    const { cookies } = await createTestSession(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
      cookies,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [] });
  });

  it('lists only the own project, with its latest track and track count', async () => {
    const { session, project } = await sessionWithProject();
    await addTrack(session, project.id);
    const latest = await addTrack(session, project.id);
    await sessionWithProject();

    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
      cookies: session.cookies,
    });
    expect(res.json()).toEqual({
      items: [
        {
          id: project.id,
          name: project.name,
          createdAt: project.createdAt.toISOString(),
          updatedAt: expect.any(String),
          trackCount: 2,
          latestTrack: { id: latest.id, version: 2 },
        },
      ],
    });
  });
});

describe('GET /api/projects/:projectId', () => {
  it('401s without a session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${MISSING_ID}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('400s for a non-uuid id', async () => {
    const { cookies } = await createTestSession(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects/nope',
      cookies,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_failed' });
  });

  it('returns the project, with no latest track before any upload', async () => {
    const { session, project } = await sessionWithProject();
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}`,
      cookies: session.cookies,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: project.id,
      trackCount: 0,
      latestTrack: null,
    });
  });

  it("404s another user's project", async () => {
    const { project } = await sessionWithProject();
    const { cookies } = await createTestSession(app);
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}`,
      cookies,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });
});

describe('PATCH /api/projects/:projectId', () => {
  const rename = (
    projectId: string,
    name: string,
    cookies?: Record<string, string>,
  ) =>
    app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      payload: { name },
      ...(cookies && { cookies }),
    });

  it('401s without a session', async () => {
    const res = await rename(MISSING_ID, 'Demo');
    expect(res.statusCode).toBe(401);
  });

  it.each([
    ['an empty', ''],
    ['a too long', 'a'.repeat(NAME_MAX + 1)],
  ])('400s %s name', async (_label, name) => {
    const { session, project } = await sessionWithProject();
    const res = await rename(project.id, name, session.cookies);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_failed' });
  });

  it('saves the trimmed name', async () => {
    const { session, project } = await sessionWithProject();
    const res = await rename(project.id, '  Demo  ', session.cookies);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: project.id, name: 'Demo' });
  });

  it("404s another user's project and leaves its name", async () => {
    const { project } = await sessionWithProject();
    const { cookies } = await createTestSession(app);
    const res = await rename(project.id, 'Mine now', cookies);
    expect(res.statusCode).toBe(404);
    const [row] = await app.db
      .select()
      .from(projects)
      .where(eq(projects.id, project.id));
    expect(row?.name).toBe(project.name);
  });
});

describe('DELETE /api/projects/:projectId', () => {
  const remove = (projectId: string, cookies?: Record<string, string>) =>
    app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
      ...(cookies && { cookies }),
    });

  async function populatedProject() {
    const { session, project } = await sessionWithProject();
    const track = await addTrack(session, project.id);
    await createNote(app.db, { userId: session.user.id, trackId: track.id });
    const upload = await createUpload(app.db, {
      userId: session.user.id,
      projectId: project.id,
    });
    await writeStoredObject(app, track.storageKey, 10);
    await writeStoredObject(app, upload.storageKey, 10);
    return { session, project, track, upload };
  }

  it('401s without a session', async () => {
    const res = await remove(MISSING_ID);
    expect(res.statusCode).toBe(401);
  });

  it('400s for a non-uuid id', async () => {
    const { cookies } = await createTestSession(app);
    const res = await remove('nope', cookies);
    expect(res.statusCode).toBe(400);
  });

  it('deletes the project with its tracks, notes and stored files', async () => {
    const { session, project, track, upload } = await populatedProject();
    const res = await remove(project.id, session.cookies);
    expect(res.statusCode).toBe(204);

    expect(
      await app.db.select().from(tracks).where(eq(tracks.id, track.id)),
    ).toEqual([]);
    expect(
      await app.db.select().from(notes).where(eq(notes.trackId, track.id)),
    ).toEqual([]);
    expect(await app.storage.headSize(track.storageKey)).toBeNull();
    expect(await app.storage.headSize(upload.storageKey)).toBeNull();

    const list = await app.inject({
      method: 'GET',
      url: '/api/projects',
      cookies: session.cookies,
    });
    expect(list.json()).toEqual({ items: [] });
  });

  it("404s another user's project and leaves its rows and files", async () => {
    const { project, track } = await populatedProject();
    const { cookies } = await createTestSession(app);
    const res = await remove(project.id, cookies);
    expect(res.statusCode).toBe(404);
    expect(
      await app.db.select().from(tracks).where(eq(tracks.id, track.id)),
    ).toHaveLength(1);
    expect(
      await app.db.select().from(notes).where(eq(notes.trackId, track.id)),
    ).toHaveLength(1);
    expect(await app.storage.headSize(track.storageKey)).toBe(10);
  });
});

describe('GET /api/projects/:projectId/tracks', () => {
  const list = (url: string, cookies?: Record<string, string>) =>
    app.inject({ method: 'GET', url, ...(cookies && { cookies }) });

  it('401s without a session', async () => {
    const res = await list(`/api/projects/${MISSING_ID}/tracks`);
    expect(res.statusCode).toBe(401);
  });

  it('400s a bad cursor', async () => {
    const { session, project } = await sessionWithProject();
    const res = await list(
      `/api/projects/${project.id}/tracks?cursor=garbage`,
      session.cookies,
    );
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_cursor' });
  });

  it('400s an out-of-range limit', async () => {
    const { session, project } = await sessionWithProject();
    const res = await list(
      `/api/projects/${project.id}/tracks?limit=0`,
      session.cookies,
    );
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_failed' });
  });

  it('lists newest first and paginates', async () => {
    const { session, project } = await sessionWithProject();
    for (let i = 0; i < 3; i++) await addTrack(session, project.id);

    const first = await list(
      `/api/projects/${project.id}/tracks?limit=2`,
      session.cookies,
    );
    expect(first.statusCode).toBe(200);
    const page1 = first.json();
    expect(page1.items.map((t: { version: number }) => t.version)).toEqual([
      3, 2,
    ]);
    expect(page1.nextCursor).toEqual(expect.any(String));

    const second = await list(
      `/api/projects/${project.id}/tracks?limit=2&cursor=${page1.nextCursor}`,
      session.cookies,
    );
    const page2 = second.json();
    expect(page2.items.map((t: { version: number }) => t.version)).toEqual([1]);
    expect(page2.nextCursor).toBeNull();
  });

  it('lists a newly added version first', async () => {
    const { session, project } = await sessionWithProject();
    await addTrack(session, project.id);
    await addTrack(session, project.id);
    const v3 = await addTrack(session, project.id);
    const res = await list(
      `/api/projects/${project.id}/tracks`,
      session.cookies,
    );
    expect(res.json().items[0]).toMatchObject({ id: v3.id, version: 3 });
  });

  it('counts notes and done notes per track', async () => {
    const { session, project } = await sessionWithProject();
    const track = await addTrack(session, project.id);
    const userId = session.user.id;
    await createNote(app.db, { userId, trackId: track.id });
    await createNote(app.db, { userId, trackId: track.id, done: true });
    await createNote(app.db, { userId, trackId: track.id, done: true });

    const res = await list(
      `/api/projects/${project.id}/tracks`,
      session.cookies,
    );
    expect(res.json().items).toEqual([
      {
        id: track.id,
        projectId: project.id,
        version: 1,
        name: track.name,
        format: 'wav',
        sizeBytes: track.sizeBytes,
        durationMs: track.durationMs,
        createdAt: track.createdAt.toISOString(),
        updatedAt: track.updatedAt.toISOString(),
        noteCount: 3,
        doneNoteCount: 2,
      },
    ]);
  });

  it("404s another user's project", async () => {
    const { session, project } = await sessionWithProject();
    await addTrack(session, project.id);
    const { cookies } = await createTestSession(app);
    const res = await list(`/api/projects/${project.id}/tracks`, cookies);
    expect(res.statusCode).toBe(404);
  });
});
