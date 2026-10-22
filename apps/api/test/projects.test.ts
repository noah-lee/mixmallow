import { notes, projectMembers, projects, tracks } from '@repo/db';
import { NAME_MAX } from '@repo/shared/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.ts';
import {
  createMember,
  createNote,
  createProject,
  createTrack,
  createUpload,
} from './helpers/factories.ts';
import { createTestSession, type TestSession } from './helpers/session.ts';
import { shareProject } from './helpers/sharing.ts';
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
    expect(res.json()).toEqual({ items: [], shared: [] });
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
          role: 'owner',
          owner: {
            id: session.user.id,
            name: session.user.name,
            picture: null,
          },
          collaboratorCount: 0,
          joinedAt: null,
        },
      ],
      shared: [],
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
    writeStoredObject(app, track.storageKey, 10);
    writeStoredObject(app, upload.storageKey, 10);
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
    expect(list.json()).toEqual({ items: [], shared: [] });
  });

  it("deletes every track's original and preview objects", async () => {
    const { session, project } = await sessionWithProject();
    const previewKey = `users/${session.user.id}/${crypto.randomUUID()}.m4a`;
    const previewed = await createTrack(app.db, {
      userId: session.user.id,
      projectId: project.id,
      previewKey,
    });
    const pending = await addTrack(session, project.id);
    const keys = [previewed.storageKey, previewKey, pending.storageKey];
    for (const key of keys) writeStoredObject(app, key, 10);

    const res = await remove(project.id, session.cookies);
    expect(res.statusCode).toBe(204);
    for (const key of keys) {
      expect(await app.storage.headSize(key)).toBeNull();
    }
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

describe('shared projects', () => {
  const get = (url: string, session: TestSession) =>
    app.inject({ method: 'GET', url, cookies: session.cookies });

  it('lists a joined project under shared, newest joined first, with its owner', async () => {
    const first = await shareProject(app);
    const second = await createProject(app.db, {
      userId: first.owner.user.id,
    });
    const member = await createMember(app.db, {
      projectId: second.id,
      userId: first.collaborator.user.id,
      createdAt: new Date(first.member.createdAt.getTime() + 1000),
    });

    const res = await get('/api/projects', first.collaborator);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toEqual([]);
    expect(body.shared.map((p: { id: string }) => p.id)).toEqual([
      second.id,
      first.project.id,
    ]);
    expect(body.shared[0]).toMatchObject({
      role: 'collaborator',
      owner: { id: first.owner.user.id, name: 'Maya', picture: null },
      joinedAt: member.createdAt.toISOString(),
      collaboratorCount: 1,
    });
    expect(body.shared[1]).toMatchObject({
      trackCount: 3,
      latestTrack: { id: first.tracks[2]?.id, version: 3 },
    });
  });

  it("keeps a joined project out of the owner's shared list and counts its collaborators", async () => {
    const { owner, project } = await shareProject(app);
    const res = await get('/api/projects', owner);
    expect(res.json()).toMatchObject({
      items: [{ id: project.id, role: 'owner', collaboratorCount: 1 }],
      shared: [],
    });
  });

  it('shows a collaborator the project with their role and join time', async () => {
    const { collaborator, project, member, owner } = await shareProject(app);
    const res = await get(`/api/projects/${project.id}`, collaborator);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: project.id,
      role: 'collaborator',
      owner: { id: owner.user.id, name: 'Maya' },
      collaboratorCount: 1,
      joinedAt: member.createdAt.toISOString(),
    });
  });

  it('lists every version to a collaborator', async () => {
    const { collaborator, project } = await shareProject(app);
    const res = await get(`/api/projects/${project.id}/tracks`, collaborator);
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((t: { version: number }) => t.version)).toEqual(
      [3, 2, 1],
    );
  });

  it('404s the project and its versions for an outsider', async () => {
    const { outsider, project } = await shareProject(app);
    for (const url of [
      `/api/projects/${project.id}`,
      `/api/projects/${project.id}/tracks`,
    ]) {
      const res = await get(url, outsider);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'not_found' });
    }
  });

  it('forbids a collaborator to rename the project', async () => {
    const { collaborator, project } = await shareProject(app);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}`,
      cookies: collaborator.cookies,
      payload: { name: 'Taken over' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden' });
    const [row] = await app.db
      .select()
      .from(projects)
      .where(eq(projects.id, project.id));
    expect(row?.name).toBe(project.name);
  });

  it('forbids a collaborator to delete the project and keeps its rows and files', async () => {
    const { collaborator, project, tracks: versions } = await shareProject(app);
    const track = versions[0];
    if (!track) throw new Error('no track');
    writeStoredObject(app, track.storageKey, 10);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}`,
      cookies: collaborator.cookies,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden' });
    expect(
      await app.db.select().from(projects).where(eq(projects.id, project.id)),
    ).toHaveLength(1);
    expect(
      await app.db
        .select()
        .from(tracks)
        .where(eq(tracks.projectId, project.id)),
    ).toHaveLength(3);
    expect(await app.storage.headSize(track.storageKey)).toBe(10);
  });

  it('drops a deleted project from the shared list and 404s its pages', async () => {
    const {
      owner,
      collaborator,
      project,
      tracks: versions,
    } = await shareProject(app);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${project.id}`,
      cookies: owner.cookies,
    });
    expect(res.statusCode).toBe(204);
    expect(
      await app.db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.projectId, project.id)),
    ).toEqual([]);

    const list = await get('/api/projects', collaborator);
    expect(list.json()).toEqual({ items: [], shared: [] });
    for (const url of [
      `/api/projects/${project.id}`,
      `/api/tracks/${versions[2]?.id}`,
    ]) {
      expect((await get(url, collaborator)).statusCode).toBe(404);
    }
  });
});
