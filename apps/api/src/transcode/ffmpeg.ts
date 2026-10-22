import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';

export const PREVIEW_EXTENSION = 'm4a';
export const PREVIEW_CONTENT_TYPE = 'audio/mp4';
export const FFMPEG_TIMEOUT_MS = 5 * 60 * 1000;
// Reading one stream header; a probe that runs longer is stuck.
export const PROBE_TIMEOUT_MS = 30 * 1000;

// Turns the original at `input` into the preview at `output`. Injected so tests can run
// without the ffmpeg binary.
export type Transcode = (
  input: string,
  output: string,
  signal: AbortSignal,
) => Promise<void>;

export type AudioStream = { sampleRate: number; channels: number };

// ffprobe prints sample_rate as a string.
const probeSchema = z.object({
  streams: z
    .array(
      z.object({
        sample_rate: z.coerce.number().int().positive(),
        channels: z.number().int().positive(),
      }),
    )
    .min(1),
});

export function parseProbe(json: unknown): AudioStream {
  const [stream] = probeSchema.parse(json).streams;
  if (!stream) throw new Error('no audio stream');
  return { sampleRate: stream.sample_rate, channels: stream.channels };
}

// AAC-LC 192k at 44.1 or 48 kHz, mono kept mono and anything else downmixed to stereo,
// with the index up front so the browser can seek before the whole file arrives.
export function previewArgs(
  input: string,
  output: string,
  { sampleRate, channels }: AudioStream,
): string[] {
  const rate = sampleRate === 44_100 ? 44_100 : 48_000;
  return [
    '-nostdin',
    '-v',
    'error',
    '-i',
    input,
    '-map',
    '0:a:0',
    '-vn',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    String(rate),
    '-ac',
    channels === 1 ? '1' : '2',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    output,
  ];
}

const run = promisify(execFile);

export const ffmpegTranscode: Transcode = async (input, output, signal) => {
  const options = { signal, killSignal: 'SIGKILL' as const };
  const probe = await run(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=sample_rate,channels',
      '-of',
      'json',
      input,
    ],
    { ...options, timeout: PROBE_TIMEOUT_MS },
  );
  const stream = parseProbe(JSON.parse(probe.stdout));
  await run('ffmpeg', previewArgs(input, output, stream), {
    ...options,
    timeout: FFMPEG_TIMEOUT_MS,
  });
};
