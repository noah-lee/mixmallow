import { tracks } from '@repo/db';
import {
  type AudioUrlResponse,
  renameBodySchema,
  type TrackDetail,
  type TrackSummary,
  trackIdParamsSchema,
} from '@repo/shared/schemas';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  findTrackDetail,
  toTrackSummary,
  trackSummaryFields,
} from './queries.ts';

const notFound = { error: 'not_found' } as const;

export const trackRoutes: FastifyPluginAsyncZod = async (app) => {
  const options = {
    onRequest: [app.authenticate],
    schema: { params: trackIdParamsSchema },
  };
  const owned = (userId: string, trackId: string) =>
    and(eq(tracks.id, trackId), eq(tracks.userId, userId));

  app.get(
    '/:trackId',
    options,
    async (req, reply): Promise<TrackDetail | typeof notFound> => {
      const track = await findTrackDetail(
        app.db,
        req.user.sub,
        req.params.trackId,
      );
      if (!track) {
        reply.code(404);
        return notFound;
      }
      return track;
    },
  );

  app.patch(
    '/:trackId',
    { ...options, schema: { ...options.schema, body: renameBodySchema } },
    async (req, reply): Promise<TrackSummary | typeof notFound> => {
      const where = owned(req.user.sub, req.params.trackId);
      const updated = await app.db
        .update(tracks)
        .set({ name: req.body.name })
        .where(where)
        .returning({ id: tracks.id });
      const [row] =
        updated.length > 0
          ? await app.db.select(trackSummaryFields).from(tracks).where(where)
          : [];
      if (!row) {
        reply.code(404);
        return notFound;
      }
      return toTrackSummary(row);
    },
  );

  // Notes cascade; the stored file goes after the commit.
  app.delete('/:trackId', options, async (req, reply) => {
    const [removed] = await app.db
      .delete(tracks)
      .where(owned(req.user.sub, req.params.trackId))
      .returning({ key: tracks.storageKey });
    if (!removed) {
      reply.code(404);
      return notFound;
    }
    await app.storage.deleteMany([removed.key]);
    return reply.code(204).send();
  });

  // Signed URLs expire, so the player asks again when one stops working.
  app.get(
    '/:trackId/audio',
    options,
    async (req, reply): Promise<AudioUrlResponse | typeof notFound> => {
      const [track] = await app.db
        .select({ key: tracks.storageKey })
        .from(tracks)
        .where(owned(req.user.sub, req.params.trackId));
      if (!track) {
        reply.code(404);
        return notFound;
      }
      const { url, expiresAt } = await app.storage.presignGet(track.key);
      return { url, expiresAt: expiresAt.toISOString() };
    },
  );
};
