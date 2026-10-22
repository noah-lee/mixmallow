import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { tracks, transcodeJobs } from '@repo/db';
import { audioUrlResponseSchema } from '@repo/shared/schemas';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  parseProbe,
  previewArgs,
  type Transcode,
} from '../src/transcode/ffmpeg.ts';
import type { WorkerDeps } from '../src/transcode/process.ts';
import { runOnce, startWorker } from '../src/transcode/worker.ts';
import { createTestApp, memoryStorage } from './helpers/app.ts';
import {
  createProject,
  createTrack,
  createTranscodeJob,
} from './helpers/factories.ts';
import { keyFromUrl } from './helpers/memory-storage.ts';
import { createTestSession, type TestSession } from './helpers/session.ts';
import { uploadTrack } from './helpers/uploads.ts';

let app: FastifyInstance;
let tmpDir: string;
beforeAll(async () => {
  app = await createTestApp();
  tmpDir = await mkdtemp(path.join(tmpdir(), 'transcode-test-'));
});
afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  await app.close();
});

const ORIGINAL = Buffer.from('RIFF original wav bytes');
const PREVIEW = Buffer.from('fake m4a preview');
const HOUR_MS = 60 * 60 * 1000;

// Records the original it was handed and writes a fixed preview; `during` runs mid-encode.
function fakeTranscoder(during?: () => Promise<void>) {
  const inputs: Buffer[] = [];
  const transcode: Transcode = async (input, output) => {
    inputs.push(await readFile(input));
    await during?.();
    await writeFile(output, PREVIEW);
  };
  return { inputs, transcode };
}

const failingTranscoder: Transcode = async () => {
  throw new Error('Invalid data found when processing input');
};

const deps = (transcode: Transcode): WorkerDeps => ({
  db: app.db,
  storage: memoryStorage(app),
  log: app.log,
  transcode,
  tmpDir,
});

async function queuedWav(
  jobOverrides: Partial<typeof transcodeJobs.$inferInsert> = {},
) {
  const session = await createTestSession(app);
  const project = await createProject(app.db, { userId: session.user.id });
  const track = await createTrack(app.db, {
    userId: session.user.id,
    projectId: project.id,
    sizeBytes: ORIGINAL.length,
  });
  const storage = memoryStorage(app);
  storage.objects.set(track.storageKey, ORIGINAL.length);
  storage.bodies.set(track.storageKey, ORIGINAL);
  const job = await createTranscodeJob(app.db, {
    trackId: track.id,
    ...jobOverrides,
  });
  return { session, track, job };
}

const jobRow = async (id: string) =>
  (
    await app.db.select().from(transcodeJobs).where(eq(transcodeJobs.id, id))
  )[0];
const trackRow = async (id: string) =>
  (await app.db.select().from(tracks).where(eq(tracks.id, id)))[0];
const makeDue = (id: string) =>
  app.db
    .update(transcodeJobs)
    .set({ runAfter: sql`now() - interval '1 second'` })
    .where(eq(transcodeJobs.id, id));
const previewsOf = (userId: string) =>
  [...memoryStorage(app).objects.keys()].filter(
    (key) => key.startsWith(`users/${userId}/`) && key.endsWith('.m4a'),
  );

async function audioKey(session: TestSession, trackId: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/api/tracks/${trackId}/audio`,
    cookies: session.cookies,
  });
  expect(res.statusCode).toBe(200);
  return keyFromUrl(audioUrlResponseSchema.parse(res.json()).url);
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('transcode worker', () => {
  it('stores an AAC preview for a queued WAV and leaves the original alone', async () => {
    const { session, track, job } = await queuedWav();
    const { inputs, transcode } = fakeTranscoder();

    expect(await runOnce(deps(transcode))).toBe(true);

    expect(inputs).toEqual([ORIGINAL]);
    const row = await trackRow(track.id);
    const previewKey = row?.previewKey ?? '';
    expect(previewKey).toMatch(
      new RegExp(`^users/${session.user.id}/[0-9a-f-]{36}\\.m4a$`),
    );
    const storage = memoryStorage(app);
    expect(storage.bodies.get(previewKey)).toEqual(PREVIEW);
    expect(storage.contentTypes.get(previewKey)).toBe('audio/mp4');
    expect(storage.bodies.get(track.storageKey)).toEqual(ORIGINAL);
    expect(row?.storageKey).toBe(track.storageKey);
    expect(row?.updatedAt).toEqual(track.updatedAt);
    expect(await jobRow(job.id)).toMatchObject({
      status: 'done',
      attempts: 1,
      leaseExpiresAt: null,
    });
  });

  it('picks up a job from an upload without waiting for the poll', async () => {
    const session = await createTestSession(app);
    const { transcode } = fakeTranscoder();
    const worker = startWorker(deps(transcode), { pollMs: HOUR_MS });
    try {
      await worker.ready;
      const { track } = await uploadTrack(app, session, {
        fileName: 'Mix.wav',
      });
      await waitFor(async () => {
        const [job] = await app.db
          .select()
          .from(transcodeJobs)
          .where(eq(transcodeJobs.trackId, track.id));
        return job?.status === 'done';
      });
      expect((await trackRow(track.id))?.previewKey).toMatch(/\.m4a$/);
    } finally {
      await worker.stop();
    }
  });

  it('marks the job failed after three failed attempts and keeps playing the original', async () => {
    const { session, track, job } = await queuedWav();
    for (let attempt = 1; attempt <= 3; attempt++) {
      await makeDue(job.id);
      expect(await runOnce(deps(failingTranscoder))).toBe(true);
    }

    expect(await jobRow(job.id)).toMatchObject({
      status: 'failed',
      attempts: 3,
      lastError: 'Invalid data found when processing input',
    });
    await makeDue(job.id);
    expect(await runOnce(deps(failingTranscoder))).toBe(false);
    expect((await trackRow(track.id))?.previewKey).toBeNull();
    expect(previewsOf(session.user.id)).toEqual([]);
    expect(await audioKey(session, track.id)).toBe(track.storageKey);
  });

  it('retries a failed attempt after one minute, then after five', async () => {
    const { job } = await queuedWav();
    const delayOf = async () => {
      const row = await jobRow(job.id);
      return (row?.runAfter.getTime() ?? 0) - Date.now();
    };

    await runOnce(deps(failingTranscoder));
    expect(await jobRow(job.id)).toMatchObject({
      status: 'queued',
      attempts: 1,
    });
    expect(Math.abs((await delayOf()) - 60_000)).toBeLessThan(10_000);
    expect(await runOnce(deps(failingTranscoder))).toBe(false);

    await makeDue(job.id);
    await runOnce(deps(failingTranscoder));
    expect((await jobRow(job.id))?.attempts).toBe(2);
    expect(Math.abs((await delayOf()) - 5 * 60_000)).toBeLessThan(10_000);
    expect(await runOnce(deps(failingTranscoder))).toBe(false);
  });

  it('reclaims and completes a running job whose lease expired', async () => {
    const { track, job } = await queuedWav({
      status: 'running',
      attempts: 1,
      leaseExpiresAt: new Date(Date.now() - 1000),
    });
    const { transcode } = fakeTranscoder();

    expect(await runOnce(deps(transcode))).toBe(true);

    expect(await jobRow(job.id)).toMatchObject({ status: 'done', attempts: 2 });
    expect((await trackRow(track.id))?.previewKey).toMatch(/\.m4a$/);
  });

  it('leaves a running job alone while its lease holds', async () => {
    const { job } = await queuedWav({
      status: 'running',
      attempts: 1,
      leaseExpiresAt: new Date(Date.now() + HOUR_MS),
    });
    expect(await runOnce(deps(fakeTranscoder().transcode))).toBe(false);
    expect((await jobRow(job.id))?.attempts).toBe(1);
  });

  it('gives one job to only one of two workers', async () => {
    const { job } = await queuedWav();
    const { inputs, transcode } = fakeTranscoder(
      () => new Promise((resolve) => setTimeout(resolve, 200)),
    );
    const workers = [
      startWorker(deps(transcode), { pollMs: HOUR_MS }),
      startWorker(deps(transcode), { pollMs: HOUR_MS }),
    ];
    try {
      await Promise.all(workers.map((worker) => worker.ready));
      await waitFor(async () => (await jobRow(job.id))?.status === 'done');
      await new Promise((resolve) => setTimeout(resolve, 300));
    } finally {
      await Promise.all(workers.map((worker) => worker.stop()));
    }
    expect(inputs).toHaveLength(1);
    expect((await jobRow(job.id))?.attempts).toBe(1);
  });

  it('discards the preview of a track deleted while it was transcoding', async () => {
    const { session, track } = await queuedWav();
    const { transcode } = fakeTranscoder(async () => {
      await app.db.delete(tracks).where(eq(tracks.id, track.id));
    });

    expect(await runOnce(deps(transcode))).toBe(true);

    expect(await trackRow(track.id)).toBeUndefined();
    expect(previewsOf(session.user.id)).toEqual([]);
    expect(
      await app.db
        .select()
        .from(transcodeJobs)
        .where(eq(transcodeJobs.trackId, track.id)),
    ).toEqual([]);
  });

  it('discards the preview when another worker took the job over', async () => {
    const { session, track, job } = await queuedWav();
    const { transcode } = fakeTranscoder(async () => {
      await app.db
        .update(transcodeJobs)
        .set({ attempts: sql`${transcodeJobs.attempts} + 1` })
        .where(eq(transcodeJobs.id, job.id));
    });

    expect(await runOnce(deps(transcode))).toBe(true);

    expect((await trackRow(track.id))?.previewKey).toBeNull();
    expect(previewsOf(session.user.id)).toEqual([]);
    expect(await jobRow(job.id)).toMatchObject({
      status: 'running',
      attempts: 2,
    });
  });

  it('removes its temp files after a success and after a failure', async () => {
    await queuedWav();
    await runOnce(deps(fakeTranscoder().transcode));
    expect(await readdir(tmpDir)).toEqual([]);

    await queuedWav();
    await runOnce(deps(failingTranscoder));
    expect(await readdir(tmpDir)).toEqual([]);
  });
});

describe('preview encoding', () => {
  const args = (sampleRate: number, channels: number) =>
    previewArgs('in.wav', 'out.m4a', { sampleRate, channels });
  const flagValue = (list: string[], flag: string) =>
    list[list.indexOf(flag) + 1];

  it('encodes AAC at 192k with the index up front', () => {
    const list = args(44_100, 2);
    expect(flagValue(list, '-c:a')).toBe('aac');
    expect(flagValue(list, '-b:a')).toBe('192k');
    expect(flagValue(list, '-movflags')).toBe('+faststart');
    expect(flagValue(list, '-f')).toBe('mp4');
    expect(flagValue(list, '-i')).toBe('in.wav');
    expect(list.at(-1)).toBe('out.m4a');
  });

  it('keeps 44.1 and 48 kHz and resamples anything else to 48 kHz', () => {
    expect(flagValue(args(44_100, 2), '-ar')).toBe('44100');
    expect(flagValue(args(48_000, 2), '-ar')).toBe('48000');
    expect(flagValue(args(96_000, 2), '-ar')).toBe('48000');
  });

  it('keeps mono and downmixes more than two channels to stereo', () => {
    expect(flagValue(args(48_000, 1), '-ac')).toBe('1');
    expect(flagValue(args(48_000, 2), '-ac')).toBe('2');
    expect(flagValue(args(48_000, 6), '-ac')).toBe('2');
  });

  it('reads the first audio stream from ffprobe output', () => {
    expect(
      parseProbe({ streams: [{ sample_rate: '44100', channels: 2 }] }),
    ).toEqual({ sampleRate: 44_100, channels: 2 });
  });

  it('rejects ffprobe output without an audio stream', () => {
    expect(() => parseProbe({ streams: [] })).toThrow();
    expect(() => parseProbe({})).toThrow();
  });
});
