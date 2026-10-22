import { randomBytes } from 'node:crypto';
import { projects } from '@repo/db';
import {
  type InviteLinkResponse,
  projectIdParamsSchema,
} from '@repo/shared/schemas';
import { eq } from 'drizzle-orm';
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
};
