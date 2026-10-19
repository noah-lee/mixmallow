import { notes, type SelectNote, tracks } from '@repo/db';
import {
  createNoteBodySchema,
  NOTE_LIMIT_PER_TRACK,
  type Note,
  type NoteListResponse,
  noteIdParamsSchema,
  trackIdParamsSchema,
  updateNoteBodySchema,
} from '@repo/shared/schemas';
import { and, asc, count, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { omitUndefined } from '../lib/omit-undefined.ts';

const notFound = { error: 'not_found' } as const;

// The bound depends on the track row, so it can't live in the shared schema; same shape as
// the app's schema failures.
const beyondTrack = {
  error: 'validation_failed',
  details: [{ path: '/timestampMs', message: 'Must be within the track' }],
} as const;

function toNote(row: SelectNote): Note {
  return {
    id: row.id,
    trackId: row.trackId,
    timestampMs: row.timestampMs,
    text: row.text,
    done: row.done,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const noteRoutes: FastifyPluginAsyncZod = async (app) => {
  const auth = { onRequest: [app.authenticate] };

  app.get(
    '/tracks/:trackId/notes',
    { ...auth, schema: { params: trackIdParamsSchema } },
    async (req, reply): Promise<NoteListResponse | typeof notFound> => {
      const userId = req.user.sub;
      const { trackId } = req.params;
      const [track] = await app.db
        .select({ id: tracks.id })
        .from(tracks)
        .where(and(eq(tracks.id, trackId), eq(tracks.userId, userId)));
      if (!track) {
        reply.code(404);
        return notFound;
      }
      const rows = await app.db
        .select()
        .from(notes)
        .where(and(eq(notes.trackId, trackId), eq(notes.userId, userId)))
        .orderBy(asc(notes.timestampMs), asc(notes.createdAt), asc(notes.id));
      return { items: rows.map(toNote) };
    },
  );

  app.post(
    '/tracks/:trackId/notes',
    {
      ...auth,
      schema: { params: trackIdParamsSchema, body: createNoteBodySchema },
    },
    async (req, reply) => {
      const userId = req.user.sub;
      const { trackId } = req.params;
      const result = await app.db.transaction(async (tx) => {
        // Locks the track so concurrent creates count each other's notes.
        const [track] = await tx
          .select({ durationMs: tracks.durationMs })
          .from(tracks)
          .where(and(eq(tracks.id, trackId), eq(tracks.userId, userId)))
          .for('update');
        if (!track) return { status: 404, body: notFound } as const;
        if (req.body.timestampMs > track.durationMs) {
          return { status: 400, body: beyondTrack } as const;
        }
        const [existing] = await tx
          .select({ n: count() })
          .from(notes)
          .where(eq(notes.trackId, trackId));
        if ((existing?.n ?? 0) >= NOTE_LIMIT_PER_TRACK) {
          return {
            status: 403,
            body: { error: 'note_limit_reached' },
          } as const;
        }
        const [note] = await tx
          .insert(notes)
          .values({
            userId,
            trackId,
            timestampMs: req.body.timestampMs,
            text: req.body.text,
            done: req.body.done ?? false,
          })
          .returning();
        if (!note) throw new Error('note insert returned no row');
        return { status: 201, body: toNote(note) } as const;
      });
      reply.code(result.status);
      return result.body;
    },
  );

  app.patch(
    '/notes/:noteId',
    {
      ...auth,
      schema: { params: noteIdParamsSchema, body: updateNoteBodySchema },
    },
    async (req, reply) => {
      const userId = req.user.sub;
      const { noteId } = req.params;
      const owned = and(eq(notes.id, noteId), eq(notes.userId, userId));
      const [current] = await app.db
        .select({ durationMs: tracks.durationMs })
        .from(notes)
        .innerJoin(tracks, eq(tracks.id, notes.trackId))
        .where(owned);
      if (!current) {
        reply.code(404);
        return notFound;
      }
      const { timestampMs } = req.body;
      if (timestampMs !== undefined && timestampMs > current.durationMs) {
        reply.code(400);
        return beyondTrack;
      }
      const [note] = await app.db
        .update(notes)
        .set(omitUndefined(req.body))
        .where(owned)
        .returning();
      if (!note) {
        reply.code(404);
        return notFound;
      }
      return toNote(note);
    },
  );

  app.delete(
    '/notes/:noteId',
    { ...auth, schema: { params: noteIdParamsSchema } },
    async (req, reply) => {
      const [removed] = await app.db
        .delete(notes)
        .where(
          and(eq(notes.id, req.params.noteId), eq(notes.userId, req.user.sub)),
        )
        .returning({ id: notes.id });
      if (!removed) {
        reply.code(404);
        return notFound;
      }
      return reply.code(204).send();
    },
  );
};
