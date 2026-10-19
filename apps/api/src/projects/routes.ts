import { projects, tracks } from '@repo/db';
import {
  type Project,
  type ProjectListResponse,
  projectIdParamsSchema,
  renameBodySchema,
  type TrackListResponse,
  trackListQuerySchema,
} from '@repo/shared/schemas';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { decodeCursor, encodeCursor } from '../lib/pagination.ts';
import { toTrackSummary, trackSummaryFields } from '../tracks/queries.ts';
import {
  deleteProject,
  findProject,
  listProjects,
  ownsProject,
} from './queries.ts';

const trackCursorSchema = z.object({ version: z.number().int().positive() });

const notFound = { error: 'not_found' } as const;

export const projectRoutes: FastifyPluginAsyncZod = async (app) => {
  const auth = { onRequest: [app.authenticate] };

  app.get('/', auth, async (req): Promise<ProjectListResponse> => {
    return { items: await listProjects(app.db, req.user.sub) };
  });

  app.get(
    '/:projectId',
    { ...auth, schema: { params: projectIdParamsSchema } },
    async (req, reply): Promise<Project | typeof notFound> => {
      const project = await findProject(
        app.db,
        req.user.sub,
        req.params.projectId,
      );
      if (!project) {
        reply.code(404);
        return notFound;
      }
      return project;
    },
  );

  app.patch(
    '/:projectId',
    {
      ...auth,
      schema: { params: projectIdParamsSchema, body: renameBodySchema },
    },
    async (req, reply): Promise<Project | typeof notFound> => {
      const { projectId } = req.params;
      const updated = await app.db
        .update(projects)
        .set({ name: req.body.name })
        .where(
          and(eq(projects.id, projectId), eq(projects.userId, req.user.sub)),
        )
        .returning({ id: projects.id });
      const project =
        updated.length > 0
          ? await findProject(app.db, req.user.sub, projectId)
          : null;
      if (!project) {
        reply.code(404);
        return notFound;
      }
      return project;
    },
  );

  app.delete(
    '/:projectId',
    { ...auth, schema: { params: projectIdParamsSchema } },
    async (req, reply) => {
      const keys = await deleteProject(
        app.db,
        req.user.sub,
        req.params.projectId,
      );
      if (!keys) {
        reply.code(404);
        return notFound;
      }
      await app.storage.deleteMany(keys);
      return reply.code(204).send();
    },
  );

  app.get(
    '/:projectId/tracks',
    {
      ...auth,
      schema: {
        params: projectIdParamsSchema,
        querystring: trackListQuerySchema,
      },
    },
    async (req, reply): Promise<TrackListResponse | typeof notFound> => {
      const { projectId } = req.params;
      const { cursor, limit } = req.query;
      const after = cursor ? decodeCursor(cursor, trackCursorSchema) : null;
      if (!(await ownsProject(app.db, req.user.sub, projectId))) {
        reply.code(404);
        return notFound;
      }
      const rows = await app.db
        .select(trackSummaryFields)
        .from(tracks)
        .where(
          and(
            eq(tracks.projectId, projectId),
            eq(tracks.userId, req.user.sub),
            after ? lt(tracks.version, after.version) : undefined,
          ),
        )
        .orderBy(desc(tracks.version))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toTrackSummary),
        nextCursor:
          rows.length > limit && last
            ? encodeCursor({ version: last.version })
            : null,
      };
    },
  );
};
