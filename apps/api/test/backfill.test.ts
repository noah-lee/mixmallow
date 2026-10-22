import { type tracks, transcodeJobs } from '@repo/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backfillJobs } from '../src/transcode/queue.ts';
import { createTestApp } from './helpers/app.ts';
import {
  createProject,
  createTrack,
  createTranscodeJob,
  createUser,
} from './helpers/factories.ts';

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

describe('preview backfill', () => {
  it('queues one job per lossless track without a preview, however often it runs', async () => {
    const user = await createUser(app.db);
    const project = await createProject(app.db, { userId: user.id });
    const track = (overrides: Partial<typeof tracks.$inferInsert> = {}) =>
      createTrack(app.db, {
        userId: user.id,
        projectId: project.id,
        ...overrides,
      });

    const wav = await track();
    const flac = await track({ format: 'flac', fileName: 'Mix.flac' });
    await track({ format: 'mp3', fileName: 'Mix.mp3' });
    await track({ previewKey: `users/${user.id}/${crypto.randomUUID()}.m4a` });
    const failed = await track();
    const failedJob = await createTranscodeJob(app.db, {
      trackId: failed.id,
      status: 'failed',
      attempts: 3,
      lastError: 'ffmpeg exited with code 1',
    });

    expect(await backfillJobs(app.db)).toBe(2);
    expect(await backfillJobs(app.db)).toBe(0);

    const jobs = await app.db.select().from(transcodeJobs);
    expect(jobs).toHaveLength(3);
    expect(
      jobs
        .filter((job) => job.id !== failedJob.id)
        .map((job) => job.trackId)
        .sort(),
    ).toEqual([wav.id, flac.id].sort());
    expect(jobs.find((job) => job.id === failedJob.id)).toMatchObject({
      status: 'failed',
      attempts: 3,
    });
  });
});
