import {
  type Database,
  type Transaction,
  tracks,
  transcodeJobs,
} from '@repo/db';
import type { AudioFormat } from '@repo/shared/schemas';
import {
  and,
  eq,
  isNull,
  lt,
  lte,
  or,
  sql,
  TransactionRollbackError,
} from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';

// Lossless originals get a compressed preview for playback; lossy ones stream as they are.
export const PREVIEW_SOURCE_FORMATS: readonly AudioFormat[] = ['wav', 'flac'];

export function needsPreview(format: string): boolean {
  return (PREVIEW_SOURCE_FORMATS as readonly string[]).includes(format);
}

export const TRANSCODE_CHANNEL = 'transcode_jobs';
export const MAX_ATTEMPTS = 3;
// Longer than the ffmpeg timeout plus both transfers, so a live worker never loses its job.
export const LEASE_MS = 10 * 60 * 1000;
// Delay before the 2nd and 3rd attempts.
export const RETRY_DELAYS_MS = [60 * 1000, 5 * 60 * 1000] as const;

const afterMs = (ms: number) =>
  sql`now() + make_interval(secs => ${ms / 1000})`;

// Inside the transaction that creates the track, so the job and the wake-up only exist
// if the track commits.
export async function enqueueTranscode(
  tx: Database | Transaction,
  trackId: string,
): Promise<void> {
  await tx.insert(transcodeJobs).values({ trackId }).onConflictDoNothing();
  await notifyWorkers(tx);
}

export async function notifyWorkers(db: Database | Transaction): Promise<void> {
  await db.execute(sql`select pg_notify(${TRANSCODE_CHANNEL}, '')`);
}

export type ClaimedJob = {
  id: string;
  trackId: string;
  // The fencing token: completion and failure only apply while it is still current.
  attempts: number;
  userId: string;
  storageKey: string;
  format: string;
};

// A queued job whose delay has passed, or a running one whose worker stopped renewing it
// (crashed). Skips rows another worker holds, so each job goes to one worker.
export async function claimJob(
  db: Database,
  log: FastifyBaseLogger,
): Promise<ClaimedJob | null> {
  return db.transaction(async (tx) => {
    for (;;) {
      const [job] = await tx
        .select({ id: transcodeJobs.id, attempts: transcodeJobs.attempts })
        .from(transcodeJobs)
        .where(
          or(
            and(
              eq(transcodeJobs.status, 'queued'),
              lte(transcodeJobs.runAfter, sql`now()`),
            ),
            and(
              eq(transcodeJobs.status, 'running'),
              lt(transcodeJobs.leaseExpiresAt, sql`now()`),
            ),
          ),
        )
        .orderBy(transcodeJobs.runAfter)
        .limit(1)
        .for('update', { skipLocked: true });
      if (!job) return null;

      if (job.attempts >= MAX_ATTEMPTS) {
        await tx
          .update(transcodeJobs)
          .set({
            status: 'failed',
            leaseExpiresAt: null,
            lastError: 'lease expired',
          })
          .where(eq(transcodeJobs.id, job.id));
        log.error({ jobId: job.id }, 'transcode job failed: lease expired');
        continue;
      }

      const [claimed] = await tx
        .update(transcodeJobs)
        .set({
          status: 'running',
          attempts: sql`${transcodeJobs.attempts} + 1`,
          leaseExpiresAt: afterMs(LEASE_MS),
        })
        .where(eq(transcodeJobs.id, job.id))
        .returning({
          id: transcodeJobs.id,
          trackId: transcodeJobs.trackId,
          attempts: transcodeJobs.attempts,
        });
      if (!claimed) throw new Error('claimed job vanished under lock');
      const [track] = await tx
        .select({
          userId: tracks.userId,
          storageKey: tracks.storageKey,
          format: tracks.format,
        })
        .from(tracks)
        .where(eq(tracks.id, claimed.trackId));
      if (!track) throw new Error('job has no track');
      return { ...claimed, ...track };
    }
  });
}

const current = (job: ClaimedJob) =>
  and(
    eq(transcodeJobs.id, job.id),
    eq(transcodeJobs.status, 'running'),
    eq(transcodeJobs.attempts, job.attempts),
  );

// false when nothing was written: the track is gone, or another worker took the job over.
// The caller then owns the uploaded preview and must delete it.
export async function completeJob(
  db: Database,
  job: ClaimedJob,
  previewKey: string,
): Promise<boolean> {
  try {
    await db.transaction(async (tx) => {
      // Tracks before jobs, the order a track delete locks them in. updated_at stays: the
      // track the owner sees hasn't changed.
      const [track] = await tx
        .update(tracks)
        .set({ previewKey, updatedAt: sql`${tracks.updatedAt}` })
        .where(and(eq(tracks.id, job.trackId), isNull(tracks.previewKey)))
        .returning({ id: tracks.id });
      if (!track) tx.rollback();
      const [done] = await tx
        .update(transcodeJobs)
        .set({ status: 'done', leaseExpiresAt: null, lastError: null })
        .where(current(job))
        .returning({ id: transcodeJobs.id });
      if (!done) tx.rollback();
    });
    return true;
  } catch (err) {
    if (err instanceof TransactionRollbackError) return false;
    throw err;
  }
}

export type FailOutcome = 'retry' | 'failed' | 'stale';

export async function failJob(
  db: Database | Transaction,
  job: ClaimedJob,
  error: string,
): Promise<FailOutcome> {
  const delay = RETRY_DELAYS_MS[job.attempts - 1];
  const [row] = await db
    .update(transcodeJobs)
    .set(
      job.attempts >= MAX_ATTEMPTS || delay === undefined
        ? { status: 'failed', leaseExpiresAt: null, lastError: error }
        : {
            status: 'queued',
            runAfter: afterMs(delay),
            leaseExpiresAt: null,
            lastError: error,
          },
    )
    .where(current(job))
    .returning({ status: transcodeJobs.status });
  if (!row) return 'stale';
  return row.status === 'failed' ? 'failed' : 'retry';
}

// Hands an interrupted job back (worker shutting down) without spending its attempt.
export async function releaseJob(
  db: Database | Transaction,
  job: ClaimedJob,
): Promise<void> {
  await db
    .update(transcodeJobs)
    .set({
      status: 'queued',
      attempts: sql`${transcodeJobs.attempts} - 1`,
      runAfter: sql`now()`,
      leaseExpiresAt: null,
    })
    .where(current(job));
}

// Queues every lossless track that has neither a preview nor a job (a failed job counts,
// so it is not retried). Safe to re-run. Returns how many jobs it queued.
export async function backfillJobs(db: Database): Promise<number> {
  const formats = sql.join(
    PREVIEW_SOURCE_FORMATS.map((format) => sql`${format}`),
    sql`, `,
  );
  return db.transaction(async (tx) => {
    const queued = await tx.execute(sql`
      insert into transcode_jobs (track_id)
      select t.id from tracks t
      where t.format in (${formats})
        and t.preview_key is null
        and not exists (select 1 from transcode_jobs j where j.track_id = t.id)
      on conflict do nothing
      returning id`);
    if (queued.length > 0) await notifyWorkers(tx);
    return queued.length;
  });
}
