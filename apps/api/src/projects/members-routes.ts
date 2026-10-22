import { randomBytes } from 'node:crypto';
import { projectMembers, projects, users } from '@repo/db';
import {
  type InviteLinkResponse,
  type MemberListResponse,
  memberUserIdParamsSchema,
  projectIdParamsSchema,
} from '@repo/shared/schemas';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { projectRole } from './access.ts';

const notFound = { error: 'not_found' } as const;
const forbidden = { error: 'forbidden' } as const;

// Registered under /projects, beside projectRoutes.
export const memberRoutes: FastifyPluginAsyncZod = async (app) => {
  const options = {
    onRequest: [app.authenticate],
    schema: { params: projectIdParamsSchema },
  };
  const inviteUrl = (token: string) =>
    `${app.config.APP_ORIGIN}/invite/${token}`;

  // null when the caller owns the project; otherwise the refusal to send.
  const refuseUnlessOwner = async (userId: string, projectId: string) => {
    const role = await projectRole(app.db, userId, projectId);
    if (role === 'owner') return null;
    return role
      ? ({ status: 403, body: forbidden } as const)
      : ({ status: 404, body: notFound } as const);
  };

  app.get('/:projectId/invite', options, async (req, reply) => {
    const { projectId } = req.params;
    const refusal = await refuseUnlessOwner(req.user.sub, projectId);
    if (refusal) {
      reply.code(refusal.status);
      return refusal.body;
    }
    const [project] = await app.db
      .select({ token: projects.inviteToken })
      .from(projects)
      .where(eq(projects.id, projectId));
    return {
      url: project?.token ? inviteUrl(project.token) : null,
    } satisfies InviteLinkResponse;
  });

  // Creating, resetting and turning a link back on are the same: a fresh token, so every
  // earlier link stops working. Existing members keep their access.
  app.post('/:projectId/invite', options, async (req, reply) => {
    const { projectId } = req.params;
    const refusal = await refuseUnlessOwner(req.user.sub, projectId);
    if (refusal) {
      reply.code(refusal.status);
      return refusal.body;
    }
    const token = randomBytes(32).toString('base64url');
    await app.db
      .update(projects)
      .set({ inviteToken: token })
      .where(eq(projects.id, projectId));
    reply.code(201);
    return { url: inviteUrl(token) } satisfies InviteLinkResponse;
  });

  app.delete('/:projectId/invite', options, async (req, reply) => {
    const { projectId } = req.params;
    const refusal = await refuseUnlessOwner(req.user.sub, projectId);
    if (refusal) {
      reply.code(refusal.status);
      return refusal.body;
    }
    await app.db
      .update(projects)
      .set({ inviteToken: null })
      .where(eq(projects.id, projectId));
    return reply.code(204).send();
  });

  // Owner first, then collaborators in join order. Every member may read it.
  app.get(
    '/:projectId/members',
    options,
    async (req, reply): Promise<MemberListResponse | typeof notFound> => {
      const { projectId } = req.params;
      if (!(await projectRole(app.db, req.user.sub, projectId))) {
        reply.code(404);
        return notFound;
      }
      const person = { id: users.id, name: users.name, picture: users.picture };
      const [owner] = await app.db
        .select(person)
        .from(projects)
        .innerJoin(users, eq(users.id, projects.userId))
        .where(eq(projects.id, projectId));
      if (!owner) throw new Error('project vanished after role check');
      const collaborators = await app.db
        .select({ ...person, joinedAt: projectMembers.createdAt })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(eq(projectMembers.projectId, projectId))
        .orderBy(asc(projectMembers.createdAt), asc(projectMembers.userId));
      return {
        items: [
          { ...owner, role: 'owner', joinedAt: null },
          ...collaborators.map(({ joinedAt, ...rest }) => ({
            ...rest,
            role: 'collaborator' as const,
            joinedAt: joinedAt.toISOString(),
          })),
        ],
      };
    },
  );

  // The owner removes anyone who joined; a collaborator may remove only themself (leave).
  app.delete(
    '/:projectId/members/:userId',
    {
      onRequest: [app.authenticate],
      schema: { params: memberUserIdParamsSchema },
    },
    async (req, reply) => {
      const { projectId, userId } = req.params;
      const role = await projectRole(app.db, req.user.sub, projectId);
      if (!role) {
        reply.code(404);
        return notFound;
      }
      if (role === 'collaborator' && userId !== req.user.sub) {
        reply.code(403);
        return forbidden;
      }
      const removed = await app.db
        .delete(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, userId),
          ),
        )
        .returning({ userId: projectMembers.userId });
      if (removed.length === 0) {
        reply.code(404);
        return notFound;
      }
      return reply.code(204).send();
    },
  );
};
