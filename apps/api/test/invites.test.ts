import { projectMembers, projects } from '@repo/db';
import { inviteLinkResponseSchema, PLANS } from '@repo/shared/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.ts';
import {
  createMember,
  createProject,
  createTrack,
  createUser,
} from './helpers/factories.ts';
import { createTestSession, type TestSession } from './helpers/session.ts';
import { shareProject } from './helpers/sharing.ts';

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const UNKNOWN_TOKEN = 'A'.repeat(43);
// The router refuses params over 100 characters (414) before any handler runs.
const MALFORMED_TOKENS = ['abc', 'x'.repeat(99)];

function inject(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  session?: TestSession,
) {
  return app.inject({
    method,
    url,
    ...(session && { cookies: session.cookies }),
  });
}

async function createLink(session: TestSession, projectId: string) {
  const res = await inject(
    'POST',
    `/api/projects/${projectId}/invite`,
    session,
  );
  expect(res.statusCode).toBe(201);
  const { url } = inviteLinkResponseSchema.parse(res.json());
  if (!url) throw new Error('no url');
  return { url, token: url.split('/invite/')[1] ?? '' };
}

async function sharedWithLink() {
  const shared = await shareProject(app);
  const link = await createLink(shared.owner, shared.project.id);
  return { ...shared, ...link };
}

// The same project with Sam gone, so its only collaborator slot is open.
async function openWithLink() {
  const shared = await sharedWithLink();
  await app.db
    .delete(projectMembers)
    .where(eq(projectMembers.projectId, shared.project.id));
  return shared;
}

const memberIds = async (projectId: string) =>
  (
    await app.db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId))
  ).map((m) => m.userId);

const tokenOf = async (projectId: string) =>
  (await app.db.select().from(projects).where(eq(projects.id, projectId)))[0]
    ?.inviteToken;

async function fill(projectId: string, collaborators: number) {
  for (let i = 0; i < collaborators; i++) {
    const user = await createUser(app.db);
    await createMember(app.db, { projectId, userId: user.id });
  }
}

describe('GET /api/projects/:projectId/invite', () => {
  it('401s without a session', async () => {
    const res = await inject('GET', `/api/projects/${MISSING_ID}/invite`);
    expect(res.statusCode).toBe(401);
  });

  it('400s for a non-uuid id', async () => {
    const { owner } = await shareProject(app);
    const res = await inject('GET', '/api/projects/nope/invite', owner);
    expect(res.statusCode).toBe(400);
  });

  it('has no link until the owner creates one', async () => {
    const { owner, project } = await shareProject(app);
    const res = await inject(
      'GET',
      `/api/projects/${project.id}/invite`,
      owner,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ url: null });
  });

  it('returns the current link to the owner', async () => {
    const { owner, project, url } = await sharedWithLink();
    const res = await inject(
      'GET',
      `/api/projects/${project.id}/invite`,
      owner,
    );
    expect(res.json()).toEqual({ url });
  });

  it('forbids a collaborator and 404s an outsider', async () => {
    const { collaborator, outsider, project } = await sharedWithLink();
    const url = `/api/projects/${project.id}/invite`;
    const forbidden = await inject('GET', url, collaborator);
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toEqual({ error: 'forbidden' });
    const missing = await inject('GET', url, outsider);
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'not_found' });
  });
});

describe('POST /api/projects/:projectId/invite', () => {
  it('401s without a session', async () => {
    const res = await inject('POST', `/api/projects/${MISSING_ID}/invite`);
    expect(res.statusCode).toBe(401);
  });

  it('400s for a non-uuid id', async () => {
    const { owner } = await shareProject(app);
    const res = await inject('POST', '/api/projects/nope/invite', owner);
    expect(res.statusCode).toBe(400);
  });

  it('creates a link on the app origin with a long random token', async () => {
    const { owner, project } = await shareProject(app);
    const { url } = await createLink(owner, project.id);
    expect(url).toMatch(
      new RegExp(`^${app.config.APP_ORIGIN}/invite/[A-Za-z0-9_-]{43}$`),
    );
  });

  it('resets to a new link that replaces the old one, keeping members', async () => {
    const { owner, collaborator, project, url, token } = await sharedWithLink();
    const reset = await createLink(owner, project.id);
    expect(reset.url).not.toBe(url);

    expect((await inject('GET', `/api/invites/${token}`)).statusCode).toBe(404);
    expect(
      (await inject('GET', `/api/invites/${reset.token}`)).statusCode,
    ).toBe(200);
    const res = await inject(
      'GET',
      `/api/projects/${project.id}`,
      collaborator,
    );
    expect(res.statusCode).toBe(200);
  });

  it('forbids a collaborator and leaves the link', async () => {
    const { collaborator, project, token } = await sharedWithLink();
    const res = await inject(
      'POST',
      `/api/projects/${project.id}/invite`,
      collaborator,
    );
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'forbidden' });
    expect(await tokenOf(project.id)).toBe(token);
  });

  it("404s an outsider and leaves the project's link", async () => {
    const { outsider, project, token } = await sharedWithLink();
    const res = await inject(
      'POST',
      `/api/projects/${project.id}/invite`,
      outsider,
    );
    expect(res.statusCode).toBe(404);
    expect(await tokenOf(project.id)).toBe(token);
  });
});

describe('DELETE /api/projects/:projectId/invite', () => {
  it('401s without a session', async () => {
    const res = await inject('DELETE', `/api/projects/${MISSING_ID}/invite`);
    expect(res.statusCode).toBe(401);
  });

  it('400s for a non-uuid id', async () => {
    const { owner } = await shareProject(app);
    const res = await inject('DELETE', '/api/projects/nope/invite', owner);
    expect(res.statusCode).toBe(400);
  });

  it('turns the link off; a new one never reuses an earlier token', async () => {
    const { owner, project, url, token } = await sharedWithLink();
    const off = await inject(
      'DELETE',
      `/api/projects/${project.id}/invite`,
      owner,
    );
    expect(off.statusCode).toBe(204);
    const again = await inject(
      'DELETE',
      `/api/projects/${project.id}/invite`,
      owner,
    );
    expect(again.statusCode).toBe(204);

    const current = await inject(
      'GET',
      `/api/projects/${project.id}/invite`,
      owner,
    );
    expect(current.json()).toEqual({ url: null });
    expect((await inject('GET', `/api/invites/${token}`)).statusCode).toBe(404);

    const recreated = await createLink(owner, project.id);
    expect(recreated.url).not.toBe(url);
  });

  it('forbids a collaborator and 404s an outsider, leaving the link on', async () => {
    const { collaborator, outsider, project, token } = await sharedWithLink();
    const url = `/api/projects/${project.id}/invite`;
    expect((await inject('DELETE', url, collaborator)).statusCode).toBe(403);
    expect((await inject('DELETE', url, outsider)).statusCode).toBe(404);
    expect(await tokenOf(project.id)).toBe(token);
  });
});

describe('GET /api/invites/:token', () => {
  it('shows only the project name and the owner, without a session', async () => {
    const { owner, project, token } = await sharedWithLink();
    await app.db
      .update(projects)
      .set({ name: 'Midnight Drive' })
      .where(eq(projects.id, project.id));
    const res = await inject('GET', `/api/invites/${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      projectName: 'Midnight Drive',
      owner: { name: 'Maya', picture: null },
    });
    expect(res.body).not.toContain(owner.user.email);
    expect(res.body).not.toContain(project.id);
  });

  it('404s an unknown or malformed token', async () => {
    await sharedWithLink();
    for (const token of [UNKNOWN_TOKEN, ...MALFORMED_TOKENS]) {
      const res = await inject('GET', `/api/invites/${token}`);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'not_found' });
    }
  });

  it('refuses an over-long token without revealing the project', async () => {
    const { project } = await sharedWithLink();
    const res = await inject('GET', `/api/invites/${'x'.repeat(200)}`);
    expect(res.statusCode).toBe(414);
    expect(res.body).not.toContain(project.name);
  });
});

describe('GET /api/invites/:token/membership', () => {
  it('401s without a session', async () => {
    const { token } = await sharedWithLink();
    const res = await inject('GET', `/api/invites/${token}/membership`);
    expect(res.statusCode).toBe(401);
  });

  it('404s an unknown or malformed token', async () => {
    const { outsider } = await sharedWithLink();
    for (const token of [UNKNOWN_TOKEN, ...MALFORMED_TOKENS]) {
      const res = await inject(
        'GET',
        `/api/invites/${token}/membership`,
        outsider,
      );
      expect(res.statusCode).toBe(404);
    }
  });

  it('is null for someone who has not joined', async () => {
    const { outsider, token } = await sharedWithLink();
    const res = await inject(
      'GET',
      `/api/invites/${token}/membership`,
      outsider,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ membership: null });
  });

  it('lands the owner and a collaborator on the newest version', async () => {
    const { owner, collaborator, project, tracks, token } =
      await sharedWithLink();
    for (const session of [owner, collaborator]) {
      const res = await inject(
        'GET',
        `/api/invites/${token}/membership`,
        session,
      );
      expect(res.json()).toEqual({
        membership: {
          projectId: project.id,
          latestTrack: { id: tracks[2]?.id, version: 3 },
        },
      });
    }
  });
});

describe('POST /api/invites/:token/join', () => {
  const join = (token: string, session?: TestSession) =>
    inject('POST', `/api/invites/${token}/join`, session);

  it('401s without a session', async () => {
    const { token } = await sharedWithLink();
    expect((await join(token)).statusCode).toBe(401);
  });

  it('404s an unknown or malformed token and joins nothing', async () => {
    const { outsider, project } = await sharedWithLink();
    for (const token of [UNKNOWN_TOKEN, ...MALFORMED_TOKENS]) {
      const res = await join(token, outsider);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'not_found' });
    }
    expect(await memberIds(project.id)).not.toContain(outsider.user.id);
  });

  it('joins and lands on the newest version', async () => {
    const { outsider, project, tracks, token } = await openWithLink();
    const res = await join(token, outsider);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      projectId: project.id,
      latestTrack: { id: tracks[2]?.id, version: 3 },
    });
    expect(await memberIds(project.id)).toContain(outsider.user.id);
    const membership = await inject(
      'GET',
      `/api/invites/${token}/membership`,
      outsider,
    );
    expect(membership.json().membership).not.toBeNull();
  });

  it('lands on the project when it has no versions yet', async () => {
    const owner = await createTestSession(app);
    const project = await createProject(app.db, { userId: owner.user.id });
    const { token } = await createLink(owner, project.id);
    const joiner = await createTestSession(app);
    const res = await join(token, joiner);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ projectId: project.id, latestTrack: null });
  });

  it('changes nothing for the owner or someone who already joined', async () => {
    const { owner, collaborator, project, token } = await sharedWithLink();
    const before = await app.db
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.projectId, project.id));
    for (const session of [owner, collaborator]) {
      const res = await join(token, session);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ projectId: project.id });
    }
    expect(
      await app.db
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.projectId, project.id)),
    ).toEqual(before);
  });

  it('refuses a new collaborator once the project is full, keeping the link', async () => {
    const { outsider, project, token } = await sharedWithLink();
    await fill(project.id, PLANS.free.collaboratorLimit - 1);
    const res = await join(token, outsider);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'project_full' });
    expect(await memberIds(project.id)).toHaveLength(
      PLANS.free.collaboratorLimit,
    );
    expect(await tokenOf(project.id)).toBe(token);
    expect((await inject('GET', `/api/invites/${token}`)).statusCode).toBe(200);
  });

  it('lets only one of two simultaneous joins take the only slot', async () => {
    const owner = await createTestSession(app);
    const project = await createProject(app.db, { userId: owner.user.id });
    const { token } = await createLink(owner, project.id);
    const a = await createTestSession(app);
    const b = await createTestSession(app);
    const results = await Promise.all([join(token, a), join(token, b)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 403]);
    expect(await memberIds(project.id)).toHaveLength(1);
  });

  it('refuses a second collaborator and frees the slot when the first is removed', async () => {
    const { owner, collaborator, outsider, project, token } =
      await sharedWithLink();
    const refused = await join(token, outsider);
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toEqual({ error: 'project_full' });
    expect(await memberIds(project.id)).toEqual([collaborator.user.id]);
    expect(await tokenOf(project.id)).toBe(token);

    const removed = await inject(
      'DELETE',
      `/api/projects/${project.id}/members/${collaborator.user.id}`,
      owner,
    );
    expect(removed.statusCode).toBe(204);
    expect((await join(token, outsider)).statusCode).toBe(200);
    expect(await memberIds(project.id)).toEqual([outsider.user.id]);
  });

  it('keeps every collaborator of a project already over the limit, refusing more', async () => {
    const owner = await createTestSession(app);
    const project = await createProject(app.db, { userId: owner.user.id });
    const track = await createTrack(app.db, {
      userId: owner.user.id,
      projectId: project.id,
    });
    const members = [];
    for (let i = 0; i < 3; i++) {
      const member = await createTestSession(app);
      await createMember(app.db, {
        projectId: project.id,
        userId: member.user.id,
      });
      members.push(member);
    }
    for (const member of members) {
      const res = await inject('GET', `/api/projects/${project.id}`, member);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ collaboratorCount: 3 });
      const tracks = await inject(
        'GET',
        `/api/projects/${project.id}/tracks`,
        member,
      );
      expect(tracks.statusCode).toBe(200);
      expect(tracks.json().items.map((t: { id: string }) => t.id)).toEqual([
        track.id,
      ]);
    }
    const { token } = await createLink(owner, project.id);
    const fourth = await createTestSession(app);
    const res = await join(token, fourth);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'project_full' });
    expect(await memberIds(project.id)).toHaveLength(3);
  });

  it("leaves the joiner's own usage unchanged", async () => {
    const { outsider, token } = await openWithLink();
    const usage = () => inject('GET', '/api/usage', outsider);
    const before = (await usage()).json();
    expect((await join(token, outsider)).statusCode).toBe(200);
    expect((await usage()).json()).toEqual(before);
  });
});
