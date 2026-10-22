import { type Database, notes, type Transaction, users } from '@repo/db';
import {
  createNoteBodySchema,
  NOTE_LIMIT_PER_TRACK,
  type Note,
  type NoteListResponse,
  noteIdParamsSchema,
  trackIdParamsSchema,
  updateNoteBodySchema,
} from '@repo/shared/schemas';
import { asc, count, eq, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { omitUndefined } from '../lib/omit-undefined.ts';
import { noteAccess, trackAccess } from '../projects/access.ts';

const notFound = { error: 'not_found' } as const;
const forbidden = { error: 'forbidden' } as const;

// The bound depends on the track row, so it can't live in the shared schema; same shape as
// the app's schema failures.
const beyondTrack = {
  error: 'validation_failed',
  details: [{ path: '/timestampMs', message: 'Must be within the track' }],
} as const;

async function selectNotes(
  db: Database | Transaction,
  where: SQL,
): Promise<Note[]> {
  const rows = await db
    .select({
      note: notes,
      authorName: users.name,
      authorPicture: users.picture,
    })
    .from(notes)
    .innerJoin(users, eq(users.id, notes.userId))
    .where(where)
    .orderBy(asc(notes.timestampMs), asc(notes.createdAt), asc(notes.id));
  return rows.map(({ note, authorName, authorPicture }) => ({
    id: note.id,
    trackId: note.trackId,
    timestampMs: note.timestampMs,
    text: note.text,
    done: note.done,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    author: { id: note.userId, name: authorName, picture: authorPicture },
  }));
}

async function findNote(
  db: Database | Transaction,
  noteId: string,
): Promise<Note> {
  const [note] = await selectNotes(db, eq(notes.id, noteId));
  if (!note) throw new Error('note vanished after write');
  return note;
}

export const noteRoutes: FastifyPluginAsyncZod = async (app) => {
  const auth = { onRequest: [app.authenticate] };

  // Every member sees everyone's notes.
  app.get(
    '/tracks/:trackId/notes',
    { ...auth, schema: { params: trackIdParamsSchema } },
    async (req, reply): Promise<NoteListResponse | typeof notFound> => {
      const { trackId } = req.params;
      if (!(await trackAccess(app.db, req.user.sub, trackId))) {
        reply.code(404);
        return notFound;
      }
      return { items: await selectNotes(app.db, eq(notes.trackId, trackId)) };
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
        const track = await trackAccess(tx, userId, trackId, { lock: true });
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
          .returning({ id: notes.id });
        if (!note) throw new Error('note insert returned no row');
        return { status: 201, body: await findNote(tx, note.id) } as const;
      });
      reply.code(result.status);
      return result.body;
    },
  );

  // Text and time belong to the author; done can also be set by the project owner.
  app.patch(
    '/notes/:noteId',
    {
      ...auth,
      schema: { params: noteIdParamsSchema, body: updateNoteBodySchema },
    },
    async (req, reply) => {
      const userId = req.user.sub;
      const { noteId } = req.params;
      const access = await noteAccess(app.db, userId, noteId);
      if (!access) {
        reply.code(404);
        return notFound;
      }
      const { timestampMs, text, done } = req.body;
      const isAuthor = access.authorId === userId;
      const editsContent = text !== undefined || timestampMs !== undefined;
      if (
        (editsContent && !isAuthor) ||
        (done !== undefined && !isAuthor && access.role !== 'owner')
      ) {
        reply.code(403);
        return forbidden;
      }
      if (timestampMs !== undefined && timestampMs > access.durationMs) {
        reply.code(400);
        return beyondTrack;
      }
      const updated = await app.db
        .update(notes)
        .set(omitUndefined(req.body))
        .where(eq(notes.id, noteId))
        .returning({ id: notes.id });
      if (updated.length === 0) {
        reply.code(404);
        return notFound;
      }
      return findNote(app.db, noteId);
    },
  );

  app.delete(
    '/notes/:noteId',
    { ...auth, schema: { params: noteIdParamsSchema } },
    async (req, reply) => {
      const userId = req.user.sub;
      const { noteId } = req.params;
      const access = await noteAccess(app.db, userId, noteId);
      if (!access) {
        reply.code(404);
        return notFound;
      }
      if (access.authorId !== userId && access.role !== 'owner') {
        reply.code(403);
        return forbidden;
      }
      const [removed] = await app.db
        .delete(notes)
        .where(eq(notes.id, noteId))
        .returning({ id: notes.id });
      if (!removed) {
        reply.code(404);
        return notFound;
      }
      return reply.code(204).send();
    },
  );
};
