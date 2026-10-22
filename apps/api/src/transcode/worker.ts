import { processJob, type WorkerDeps } from './process.ts';
import { claimJob, failJob, releaseJob, TRANSCODE_CHANNEL } from './queue.ts';

export const POLL_MS = 60 * 1000;

// Claims and processes at most one job. false when none was claimable.
export async function runOnce(
  deps: WorkerDeps,
  signal: AbortSignal = new AbortController().signal,
): Promise<boolean> {
  const job = await claimJob(deps.db, deps.log);
  if (!job) return false;
  try {
    await processJob(deps, job, signal);
  } catch (err) {
    if (signal.aborted) {
      await releaseJob(deps.db, job);
      deps.log.info({ jobId: job.id }, 'transcode interrupted; job released');
      return true;
    }
    const error = err instanceof Error ? err.message : String(err);
    const outcome = await failJob(deps.db, job, error);
    const context = { err, jobId: job.id, trackId: job.trackId, outcome };
    if (outcome === 'failed') {
      deps.log.error(context, 'transcode job failed');
    } else {
      deps.log.warn(context, 'transcode attempt failed');
    }
  }
  return true;
}

export type Worker = {
  // Resolves once the LISTEN is in place.
  ready: Promise<void>;
  // Stops claiming, aborts the job in flight (handing it back) and drops the LISTEN.
  stop(): Promise<void>;
};

// One job at a time. A notification wakes it at once; the poll catches missed
// notifications, retries whose delay has passed and jobs abandoned by a crashed worker.
export function startWorker(
  deps: WorkerDeps,
  { pollMs = POLL_MS }: { pollMs?: number } = {},
): Worker {
  const controller = new AbortController();
  const { signal } = controller;
  let pending = true;
  let wake: (() => void) | null = null;
  const kick = () => {
    pending = true;
    wake?.();
  };

  let onListen: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    onListen = resolve;
  });
  const listening = deps.db.$client
    .listen(TRANSCODE_CHANNEL, kick, () => {
      onListen();
      kick();
    })
    .catch((err: unknown) => {
      deps.log.error({ err }, 'transcode LISTEN failed; polling only');
      onListen();
      return null;
    });
  const timer = setInterval(kick, pollMs);

  const loop = (async () => {
    while (!signal.aborted) {
      if (!pending) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = null;
        continue;
      }
      pending = false;
      try {
        while (!signal.aborted && (await runOnce(deps, signal)));
      } catch (err) {
        deps.log.error({ err }, 'transcode worker error');
      }
    }
  })();

  return {
    ready,
    async stop() {
      controller.abort();
      clearInterval(timer);
      wake?.();
      await loop;
      await (await listening)?.unlisten();
    },
  };
}
