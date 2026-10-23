import { tracks } from '@repo/db';
import {
  type AudioUrlResponse,
  renameBodySchema,
  type TrackDetail,
  type TrackSummary,
  trackIdParamsSchema,
} from '@repo/shared/schemas';
import { eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { type TrackAccess, trackAccess } from '../projects/access.ts';
import {
  findTrackDetail,
  toTrackSummary,
  trackSummaryFields,
} from './queries.ts';

const notFound = { error: 'not_found' } as const;
const forbidden = { error: 'forbidden' } as const;

// The owner manages every version; a collaborator only the ones they uploaded.
const canManage = (access: TrackAccess, userId: string) =>
  access.role === 'owner' || access.uploaderId === userId;

export const trackRoutes: FastifyPluginAsyncZod = async (app) => {
  const options = {
    onRequest: [app.authenticate],
    schema: { params: trackIdParamsSchema },
  };

  app.get(
    '/:trackId',
    options,
    async (req, reply): Promise<TrackDetail | typeof notFound> => {
      const access = await trackAccess(
        app.db,
        req.user.sub,
        req.params.trackId,
      );
      const track = access
        ? await findTrackDetail(app.db, req.params.trackId)
        : null;
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
    async (
      req,
      reply,
    ): Promise<TrackSummary | typeof notFound | typeof forbidden> => {
      const userId = req.user.sub;
      const { trackId } = req.params;
      const result = await app.db.transaction(async (tx) => {
        const access = await trackAccess(tx, userId, trackId, { lock: true });
        if (!access) return { status: 404, body: notFound } as const;
        if (!canManage(access, userId)) {
          return { status: 403, body: forbidden } as const;
        }
        const where = eq(tracks.id, trackId);
        await tx.update(tracks).set({ name: req.body.name }).where(where);
        const [row] = await tx
          .select(trackSummaryFields)
          .from(tracks)
          .where(where);
        if (!row) throw new Error('track vanished under lock');
        return { status: 200, body: toTrackSummary(row) } as const;
      });
      reply.code(result.status);
      return result.body;
    },
  );

  // Notes and the transcode job cascade; the stored files go after the commit.
  app.delete('/:trackId', options, async (req, reply) => {
    const userId = req.user.sub;
    const { trackId } = req.params;
    const result = await app.db.transaction(async (tx) => {
      const access = await trackAccess(tx, userId, trackId, { lock: true });
      if (!access) return { status: 404, body: notFound } as const;
      if (!canManage(access, userId)) {
        return { status: 403, body: forbidden } as const;
      }
      const [removed] = await tx
        .delete(tracks)
        .where(eq(tracks.id, trackId))
        .returning({ key: tracks.storageKey, previewKey: tracks.previewKey });
      if (!removed) throw new Error('track vanished under lock');
      return { status: 204, removed } as const;
    });
    if (result.status !== 204) {
      reply.code(result.status);
      return result.body;
    }
    const { removed } = result;
    await app.storage.deleteMany(
      removed.previewKey ? [removed.key, removed.previewKey] : [removed.key],
    );
    return reply.code(204).send();
  });

  // Signed URLs expire, so the player asks again when one stops working. Plays the
  // compressed preview once it exists, else the original.
  app.get(
    '/:trackId/audio',
    options,
    async (req, reply): Promise<AudioUrlResponse | typeof notFound> => {
      const { trackId } = req.params;
      const access = await trackAccess(app.db, req.user.sub, trackId);
      const [track] = access
        ? await app.db
            .select({
              key: sql<string>`coalesce(${tracks.previewKey}, ${tracks.storageKey})`,
            })
            .from(tracks)
            .where(eq(tracks.id, trackId))
        : [];
      if (!track) {
        reply.code(404);
        return notFound;
      }
      const { url, expiresAt } = await app.storage.presignGet(track.key);
      return { url, expiresAt: expiresAt.toISOString() };
    },
  );
};
