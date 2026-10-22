import { type Database, type Transaction, transcodeJobs } from '@repo/db';
import type { AudioFormat } from '@repo/shared/schemas';
import { sql } from 'drizzle-orm';

// Lossless originals get a compressed preview for playback; lossy ones stream as they are.
export const PREVIEW_SOURCE_FORMATS: readonly AudioFormat[] = ['wav', 'flac'];

export function needsPreview(format: string): boolean {
  return (PREVIEW_SOURCE_FORMATS as readonly string[]).includes(format);
}

export const TRANSCODE_CHANNEL = 'transcode_jobs';

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
