import { notes, projectMembers } from '@repo/db';
import { memberListResponseSchema } from '@repo/shared/schemas';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.ts';
import { createMember, createNote } from './helpers/factories.ts';
import { createTestSession, type TestSession } from './helpers/session.ts';
import { shareProject } from './helpers/sharing.ts';

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

function inject(method: 'GET' | 'DELETE', url: string, session?: TestSession) {
  return app.inject({
    method,
    url,
    ...(session && { cookies: session.cookies }),
  });
}

const isMember = async (projectId: string, userId: string) =>
  (
    await app.db
      .select()
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      )
  ).length > 0;

describe('GET /api/projects/:projectId/members', () => {
  it('401s without a session', async () => {
    const res = await inject('GET', `/api/projects/${MISSING_ID}/members`);
    expect(res.statusCode).toBe(401);
  });

  it('400s for a non-uuid id', async () => {
    const { owner } = await shareProject(app);
    const res = await inject('GET', '/api/projects/nope/members', owner);
    expect(res.statusCode).toBe(400);
  });

  it('404s an outsider', async () => {
    const { outsider, project } = await shareProject(app);
    const res = await inject(
      'GET',
      `/api/projects/${project.id}/members`,
      outsider,
    );
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('lists the owner first, then collaborators in join order, without emails', async () => {
    const { owner, collaborator, project, member } = await shareProject(app);
    const later = await createTestSession(app, { name: 'Lee' });
    const laterMember = await createMember(app.db, {
      projectId: project.id,
      userId: later.user.id,
      createdAt: new Date(member.createdAt.getTime() + 1000),
    });

    for (const session of [owner, collaborator]) {
      const res = await inject(
        'GET',
        `/api/projects/${project.id}/members`,
        session,
      );
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        items: [
          {
            id: owner.user.id,
            name: 'Maya',
            picture: null,
            role: 'owner',
            joinedAt: null,
          },
          {
            id: collaborator.user.id,
            name: 'Sam',
            picture: 'https://example.com/sam.png',
            role: 'collaborator',
            joinedAt: member.createdAt.toISOString(),
          },
          {
            id: later.user.id,
            name: 'Lee',
            picture: null,
            role: 'collaborator',
            joinedAt: laterMember.createdAt.toISOString(),
          },
        ],
      });
      expect(memberListResponseSchema.safeParse(res.json()).success).toBe(true);
      expect(res.body).not.toContain('email');
      expect(res.body).not.toContain('@example.com');
    }
  });
});

describe('DELETE /api/projects/:projectId/members/:userId', () => {
  const remove = (projectId: string, userId: string, session?: TestSession) =>
    inject('DELETE', `/api/projects/${projectId}/members/${userId}`, session);

  it('401s without a session', async () => {
    const res = await remove(MISSING_ID, MISSING_ID);
    expect(res.statusCode).toBe(401);
  });

  it('400s for a non-uuid id', async () => {
    const { owner, project } = await shareProject(app);
    expect((await remove(project.id, 'nope', owner)).statusCode).toBe(400);
    expect((await remove('nope', owner.user.id, owner)).statusCode).toBe(400);
  });

  it('404s an outsider and keeps the member', async () => {
    const { outsider, collaborator, project } = await shareProject(app);
    const res = await remove(project.id, collaborator.user.id, outsider);
    expect(res.statusCode).toBe(404);
    expect(await isMember(project.id, collaborator.user.id)).toBe(true);
  });

  it("404s the owner's own id and anyone who never joined", async () => {
    const { owner, outsider, project } = await shareProject(app);
    for (const userId of [owner.user.id, outsider.user.id]) {
      const res = await remove(project.id, userId, owner);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'not_found' });
    }
  });

  it('forbids a collaborator to remove someone else', async () => {
    const { owner, collaborator, project } = await shareProject(app);
    const other = await createTestSession(app);
    await createMember(app.db, {
      projectId: project.id,
      userId: other.user.id,
    });
    for (const userId of [other.user.id, owner.user.id]) {
      const res = await remove(project.id, userId, collaborator);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'forbidden' });
    }
    expect(await isMember(project.id, other.user.id)).toBe(true);
  });

  it('removes a collaborator, ending their access but keeping their notes for the owner', async () => {
    const { owner, collaborator, project, tracks } = await shareProject(app);
    const track = tracks[2];
    if (!track) throw new Error('no track');
    const samNote = await createNote(app.db, {
      userId: collaborator.user.id,
      trackId: track.id,
    });

    const res = await remove(project.id, collaborator.user.id, owner);
    expect(res.statusCode).toBe(204);
    expect(await isMember(project.id, collaborator.user.id)).toBe(false);

    for (const url of [
      `/api/projects/${project.id}`,
      `/api/projects/${project.id}/tracks`,
      `/api/tracks/${track.id}/notes`,
    ]) {
      expect((await inject('GET', url, collaborator)).statusCode).toBe(404);
    }
    const samDelete = await inject(
      'DELETE',
      `/api/notes/${samNote.id}`,
      collaborator,
    );
    expect(samDelete.statusCode).toBe(404);

    const list = await inject('GET', `/api/tracks/${track.id}/notes`, owner);
    expect(list.json().items).toEqual([
      expect.objectContaining({
        id: samNote.id,
        author: expect.objectContaining({
          id: collaborator.user.id,
          name: 'Sam',
        }),
      }),
    ]);
    const mayaDelete = await inject(
      'DELETE',
      `/api/notes/${samNote.id}`,
      owner,
    );
    expect(mayaDelete.statusCode).toBe(204);
  });

  it('lets a collaborator leave, dropping the project from their list but not their notes', async () => {
    const { collaborator, project, tracks } = await shareProject(app);
    const track = tracks[0];
    if (!track) throw new Error('no track');
    const note = await createNote(app.db, {
      userId: collaborator.user.id,
      trackId: track.id,
    });

    const res = await remove(project.id, collaborator.user.id, collaborator);
    expect(res.statusCode).toBe(204);
    const list = await inject('GET', '/api/projects', collaborator);
    expect(list.json().shared).toEqual([]);
    expect(
      await app.db.select().from(notes).where(eq(notes.id, note.id)),
    ).toHaveLength(1);
  });
});
