import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Database } from '@repo/db';
import type { FastifyBaseLogger } from 'fastify';
import { type StorageDriver, storageKey } from '../storage/driver.ts';
import {
  PREVIEW_CONTENT_TYPE,
  PREVIEW_EXTENSION,
  type Transcode,
} from './ffmpeg.ts';
import { type ClaimedJob, completeJob } from './queue.ts';

export type WorkerDeps = {
  db: Database;
  storage: StorageDriver;
  log: FastifyBaseLogger;
  transcode: Transcode;
  // Where each job's scratch directory goes; the system temp dir by default.
  tmpDir?: string;
};

// Download → transcode → upload → record. Throws on any failed step; the scratch files
// are gone either way.
export async function processJob(
  deps: WorkerDeps,
  job: ClaimedJob,
  signal: AbortSignal,
): Promise<void> {
  const { db, storage, log } = deps;
  const dir = await mkdtemp(path.join(deps.tmpDir ?? tmpdir(), 'transcode-'));
  try {
    const input = path.join(dir, `original.${job.format}`);
    const output = path.join(dir, `preview.${PREVIEW_EXTENSION}`);
    await storage.download(job.storageKey, input);
    signal.throwIfAborted();
    await deps.transcode(input, output, signal);
    signal.throwIfAborted();

    const key = storageKey(job.userId, PREVIEW_EXTENSION);
    await storage.upload({
      key,
      filePath: output,
      contentType: PREVIEW_CONTENT_TYPE,
    });
    let recorded = false;
    try {
      recorded = await completeJob(db, job, key);
    } finally {
      if (!recorded) await discard(deps, key);
    }
    if (recorded) {
      log.info({ jobId: job.id, trackId: job.trackId }, 'preview ready');
    } else {
      log.info(
        { jobId: job.id, trackId: job.trackId },
        'track deleted or job taken over; preview discarded',
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function discard(deps: WorkerDeps, key: string): Promise<void> {
  try {
    await deps.storage.delete(key);
  } catch (err) {
    deps.log.error({ err, key }, 'storage delete failed; object orphaned');
  }
}
