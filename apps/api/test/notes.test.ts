import { notes } from '@repo/db';
import {
  NOTE_LIMIT_PER_TRACK,
  NOTE_TEXT_MAX,
  noteListResponseSchema,
} from '@repo/shared/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.ts';
import { createNote, createProject, createTrack } from './helpers/factories.ts';
import { createTestSession, type TestSession } from './helpers/session.ts';

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const DURATION_MS = 252_000;

async function sessionWithTrack() {
  const session = await createTestSession(app);
  const project = await createProject(app.db, { userId: session.user.id });
  const track = await createTrack(app.db, {
    userId: session.user.id,
    projectId: project.id,
    durationMs: DURATION_MS,
  });
  return { session, track };
}

function listNotes(trackId: string, cookies?: Record<string, string>) {
  return app.inject({
    method: 'GET',
    url: `/api/tracks/${trackId}/notes`,
    ...(cookies && { cookies }),
  });
}

function postNote(
  trackId: string,
  payload: Record<string, unknown>,
  cookies?: Record<string, string>,
) {
  return app.inject({
    method: 'POST',
    url: `/api/tracks/${trackId}/notes`,
    payload,
    ...(cookies && { cookies }),
  });
}

function patchNote(
  noteId: string,
  payload: Record<string, unknown>,
  cookies?: Record<string, string>,
) {
  return app.inject({
    method: 'PATCH',
    url: `/api/notes/${noteId}`,
    payload,
    ...(cookies && { cookies }),
  });
}

const noteRow = async (id: string) =>
  (await app.db.select().from(notes).where(eq(notes.id, id)))[0];

async function ownNote(session: TestSession, trackId: string) {
  return createNote(app.db, {
    userId: session.user.id,
    trackId,
    timestampMs: 5000,
    text: 'Original',
  });
}

describe('GET /api/tracks/:trackId/notes', () => {
  it('401s without a session', async () => {
    const res = await listNotes(MISSING_ID);
    expect(res.statusCode).toBe(401);
  });

  it('400s for a non-uuid id', async () => {
    const { cookies } = await createTestSession(app);
    const res = await listNotes('nope', cookies);
    expect(res.statusCode).toBe(400);
  });

  it('returns notes by time, with ties in creation order', async () => {
    const { session, track } = await sessionWithTrack();
    const userId = session.user.id;
    const at = (ms: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, ms));
    const add = (timestampMs: number, text: string, createdAt: Date) =>
      createNote(app.db, {
        userId,
        trackId: track.id,
        timestampMs,
        text,
        createdAt,
      });
    await add(130_000, '2:10', at(0));
    await add(15_000, '0:15 second', at(5));
    await add(60_000, '1:00', at(2));
    await add(15_000, '0:15 first', at(3));

    const res = await listNotes(track.id, session.cookies);
    expect(res.statusCode).toBe(200);
    const { items } = noteListResponseSchema.parse(res.json());
    expect(items.map((n) => n.text)).toEqual([
      '0:15 first',
      '0:15 second',
      '1:00',
      '2:10',
    ]);
  });

  it("404s another user's track", async () => {
    const { session, track } = await sessionWithTrack();
    await ownNote(session, track.id);
    const { cookies } = await createTestSession(app);
    const res = await listNotes(track.id, cookies);
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/tracks/:trackId/notes', () => {
  it('401s without a session', async () => {
    const res = await postNote(MISSING_ID, { timestampMs: 0, text: 'Hi' });
    expect(res.statusCode).toBe(401);
  });

  it.each([
    ['empty text', { timestampMs: 0, text: '' }],
    [
      'text over the limit',
      { timestampMs: 0, text: 'a'.repeat(NOTE_TEXT_MAX + 1) },
    ],
    ['a negative timestamp', { timestampMs: -1, text: 'Hi' }],
    ['a timestamp past the end', { timestampMs: DURATION_MS + 1, text: 'Hi' }],
  ])('rejects %s', async (_label, payload) => {
    const { session, track } = await sessionWithTrack();
    const res = await postNote(track.id, payload, session.cookies);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_failed' });
    expect(
      await app.db.select().from(notes).where(eq(notes.trackId, track.id)),
    ).toEqual([]);
  });

  it('points a timestamp past the end at the timestampMs field', async () => {
    const { session, track } = await sessionWithTrack();
    const res = await postNote(
      track.id,
      { timestampMs: DURATION_MS + 1, text: 'Hi' },
      session.cookies,
    );
    expect(res.json()).toEqual({
      error: 'validation_failed',
      details: [{ path: '/timestampMs', message: 'Must be within the track' }],
    });
  });

  it('creates a note at the given time', async () => {
    const { session, track } = await sessionWithTrack();
    const res = await postNote(
      track.id,
      { timestampMs: 102_300, text: 'Vocal too loud in chorus' },
      session.cookies,
    );
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      id: expect.any(String),
      trackId: track.id,
      timestampMs: 102_300,
      text: 'Vocal too loud in chorus',
      done: false,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('allows a note at the very end and keeps a given done flag', async () => {
    const { session, track } = await sessionWithTrack();
    const res = await postNote(
      track.id,
      { timestampMs: DURATION_MS, text: 'Fade', done: true },
      session.cookies,
    );
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ timestampMs: DURATION_MS, done: true });
  });

  it('refuses a note once the track has the maximum', async () => {
    const { session, track } = await sessionWithTrack();
    await app.db.insert(notes).values(
      Array.from({ length: NOTE_LIMIT_PER_TRACK }, (_, i) => ({
        userId: session.user.id,
        trackId: track.id,
        timestampMs: i,
        text: `Note ${i}`,
      })),
    );
    const res = await postNote(
      track.id,
      { timestampMs: 0, text: 'One more' },
      session.cookies,
    );
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'note_limit_reached' });
  });

  it('lets only one of two simultaneous notes take the last slot', async () => {
    const { session, track } = await sessionWithTrack();
    await app.db.insert(notes).values(
      Array.from({ length: NOTE_LIMIT_PER_TRACK - 1 }, (_, i) => ({
        userId: session.user.id,
        trackId: track.id,
        timestampMs: i,
        text: `Note ${i}`,
      })),
    );
    const payload = { timestampMs: 0, text: 'Last' };
    const results = await Promise.all([
      postNote(track.id, payload, session.cookies),
      postNote(track.id, payload, session.cookies),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 403]);
  });

  it("404s another user's track and creates nothing", async () => {
    const { track } = await sessionWithTrack();
    const { cookies } = await createTestSession(app);
    const res = await postNote(
      track.id,
      { timestampMs: 0, text: 'Hi' },
      cookies,
    );
    expect(res.statusCode).toBe(404);
    expect(
      await app.db.select().from(notes).where(eq(notes.trackId, track.id)),
    ).toEqual([]);
  });
});

describe('PATCH /api/notes/:noteId', () => {
  it('401s without a session', async () => {
    const res = await patchNote(MISSING_ID, { done: true });
    expect(res.statusCode).toBe(401);
  });

  it('400s an empty body', async () => {
    const { session, track } = await sessionWithTrack();
    const note = await ownNote(session, track.id);
    const res = await patchNote(note.id, {}, session.cookies);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_failed' });
  });

  it('saves edited text', async () => {
    const { session, track } = await sessionWithTrack();
    const note = await ownNote(session, track.id);
    const res = await patchNote(
      note.id,
      { text: ' Kick too boomy ' },
      session.cookies,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: note.id, text: 'Kick too boomy' });

    const list = await listNotes(track.id, session.cookies);
    expect(list.json().items[0]).toMatchObject({ text: 'Kick too boomy' });
  });

  it('marks a note done and back', async () => {
    const { session, track } = await sessionWithTrack();
    const note = await ownNote(session, track.id);
    await patchNote(note.id, { done: true }, session.cookies);
    expect((await noteRow(note.id))?.done).toBe(true);
    const res = await patchNote(note.id, { done: false }, session.cookies);
    expect(res.json()).toMatchObject({ done: false });
    expect((await noteRow(note.id))?.done).toBe(false);
  });

  it('rejects moving a note past the end of the track', async () => {
    const { session, track } = await sessionWithTrack();
    const note = await ownNote(session, track.id);
    const res = await patchNote(
      note.id,
      { timestampMs: DURATION_MS + 1 },
      session.cookies,
    );
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_failed' });
    expect((await noteRow(note.id))?.timestampMs).toBe(5000);
  });

  it("404s another user's note and leaves it", async () => {
    const { session, track } = await sessionWithTrack();
    const note = await ownNote(session, track.id);
    const { cookies } = await createTestSession(app);
    const res = await patchNote(
      note.id,
      { text: 'Hijacked', done: true },
      cookies,
    );
    expect(res.statusCode).toBe(404);
    expect(await noteRow(note.id)).toMatchObject({
      text: 'Original',
      done: false,
    });
  });
});

describe('DELETE /api/notes/:noteId', () => {
  const remove = (noteId: string, cookies?: Record<string, string>) =>
    app.inject({
      method: 'DELETE',
      url: `/api/notes/${noteId}`,
      ...(cookies && { cookies }),
    });

  it('401s without a session', async () => {
    const res = await remove(MISSING_ID);
    expect(res.statusCode).toBe(401);
  });

  it('400s for a non-uuid id', async () => {
    const { cookies } = await createTestSession(app);
    const res = await remove('nope', cookies);
    expect(res.statusCode).toBe(400);
  });

  it('deletes the note from the list', async () => {
    const { session, track } = await sessionWithTrack();
    const note = await ownNote(session, track.id);
    const res = await remove(note.id, session.cookies);
    expect(res.statusCode).toBe(204);
    const list = await listNotes(track.id, session.cookies);
    expect(list.json()).toEqual({ items: [] });
  });

  it("404s another user's note and leaves it", async () => {
    const { session, track } = await sessionWithTrack();
    const note = await ownNote(session, track.id);
    const { cookies } = await createTestSession(app);
    const res = await remove(note.id, cookies);
    expect(res.statusCode).toBe(404);
    expect(await noteRow(note.id)).toBeDefined();
  });
});
