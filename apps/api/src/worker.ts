import { createDb } from '@repo/db';
import { pino } from 'pino';
import { loadConfig } from './config.ts';
import { createS3Driver } from './storage/s3.ts';
import { ffmpegTranscode } from './transcode/ffmpeg.ts';
import { startWorker } from './transcode/worker.ts';

const config = loadConfig();
const log = pino({ level: config.LOG_LEVEL });
const db = createDb(config.DATABASE_URL);
const worker = startWorker({
  db,
  storage: createS3Driver(config),
  log,
  transcode: ffmpegTranscode,
});
// `docker stop` / redeploys send SIGTERM: hand the job in flight back to the queue
// rather than leaving it for the lease to expire. Registered before `ready` so a stop
// during startup is handled too.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    log.info({ signal }, 'shutting down');
    await worker.stop();
    await db.$client.end();
    process.exit(0);
  });
}

await worker.ready;
log.info('transcode worker listening');
