import { createDb } from '@repo/db';
import { pino } from 'pino';
import { loadConfig } from './config.ts';
import { backfillJobs } from './transcode/queue.ts';

// Run by deploy.sh after migrating; queues previews for tracks uploaded before the worker
// existed and does nothing once they all have a job.
const config = loadConfig();
const log = pino({ level: config.LOG_LEVEL });
const db = createDb(config.DATABASE_URL);
try {
  const queued = await backfillJobs(db);
  log.info({ queued }, 'preview backfill done');
} finally {
  await db.$client.end();
}
