import { projectMembers, projects, users } from '@repo/db';
import {
  type InviteMembershipResponse,
  type InviteResponse,
  inviteTokenParamsSchema,
  inviteTokenSchema,
  type JoinResponse,
} from '@repo/shared/schemas';
import { count, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { projectRole } from '../projects/access.ts';
import { landingFor } from '../projects/queries.ts';
import { planFor } from '../usage/plan.ts';

const notFound = { error: 'not_found' } as const;

// A malformed, unknown, reset or turned-off token all look the same: 404.
const validToken = (token: string) =>
  inviteTokenSchema.safeParse(token).success;

export const inviteRoutes: FastifyPluginAsyncZod = async (app) => {
  const auth = { onRequest: [app.authenticate] };
  const params = { schema: { params: inviteTokenParamsSchema } };

  const projectByToken = async (token: string) => {
    if (!validToken(token)) return null;
    const [project] = await app.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.inviteToken, token));
    return project ?? null;
  };

  // Public: anyone holding the link sees who is inviting them, and to what.
  app.get(
    '/:token',
    params,
    async (req, reply): Promise<InviteResponse | typeof notFound> => {
      const { token } = req.params;
      const [invite] = validToken(token)
        ? await app.db
            .select({
              projectName: projects.name,
              name: users.name,
              picture: users.picture,
            })
            .from(projects)
            .innerJoin(users, eq(users.id, projects.userId))
            .where(eq(projects.inviteToken, token))
        : [];
      if (!invite) {
        reply.code(404);
        return notFound;
      }
      return {
        projectName: invite.projectName,
        owner: { name: invite.name, picture: invite.picture },
      };
    },
  );

  app.get(
    '/:token/membership',
    { ...auth, ...params },
    async (req, reply): Promise<InviteMembershipResponse | typeof notFound> => {
      const project = await projectByToken(req.params.token);
      if (!project) {
        reply.code(404);
        return notFound;
      }
      const role = await projectRole(app.db, req.user.sub, project.id);
      return { membership: role ? await landingFor(app.db, project.id) : null };
    },
  );

  // Joining again, or as the owner, changes nothing and lands the same way.
  app.post('/:token/join', { ...auth, ...params }, async (req, reply) => {
    const userId = req.user.sub;
    const { token } = req.params;
    if (!validToken(token)) {
      reply.code(404);
      return notFound;
    }
    const result = await app.db.transaction(async (tx) => {
      // Locked so two joins for the last slot can't both see room for one more.
      const [project] = await tx
        .select({ id: projects.id, ownerId: projects.userId })
        .from(projects)
        .where(eq(projects.inviteToken, token))
        .for('update');
      if (!project) return { status: 404, body: notFound } as const;
      if (!(await projectRole(tx, userId, project.id))) {
        const [members] = await tx
          .select({ n: count() })
          .from(projectMembers)
          .where(eq(projectMembers.projectId, project.id));
        if ((members?.n ?? 0) >= planFor(project.ownerId).collaboratorLimit) {
          return { status: 403, body: { error: 'project_full' } } as const;
        }
        await tx
          .insert(projectMembers)
          .values({ projectId: project.id, userId })
          .onConflictDoNothing();
      }
      const landing: JoinResponse = await landingFor(tx, project.id);
      return { status: 200, body: landing } as const;
    });
    reply.code(result.status);
    return result.body;
  });
};
