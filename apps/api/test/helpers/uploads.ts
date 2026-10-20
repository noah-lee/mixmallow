import {
  type CompleteUploadResponse,
  type CreateUploadResponse,
  completeUploadResponseSchema,
  createUploadResponseSchema,
} from '@repo/shared/schemas';
import type { FastifyInstance } from 'fastify';
import { memoryStorage } from './app.ts';
import { keyFromUrl } from './memory-storage.ts';
import type { TestSession } from './session.ts';

// Puts an object of `sizeBytes` straight into the in-memory bucket.
export function writeStoredObject(
  app: FastifyInstance,
  key: string,
  sizeBytes: number,
): void {
  memoryStorage(app).objects.set(key, sizeBytes);
}

export type UploadOptions = {
  fileName?: string;
  bytes?: Buffer;
  projectId?: string;
  durationMs?: number;
  peaks?: number[];
};

export function registerUpload(
  app: FastifyInstance,
  session: TestSession,
  {
    fileName = 'Mix.wav',
    bytes = Buffer.from('fake audio'),
    projectId,
  }: UploadOptions = {},
) {
  return app.inject({
    method: 'POST',
    url: '/api/uploads',
    cookies: session.cookies,
    payload: {
      fileName,
      sizeBytes: bytes.length,
      ...(projectId && { projectId }),
    },
  });
}

// What the browser's PUT to the signed URL leaves in the bucket.
export function putUpload(
  app: FastifyInstance,
  registered: CreateUploadResponse,
  bytes: Buffer,
): void {
  writeStoredObject(app, keyFromUrl(registered.uploadUrl), bytes.length);
}

export function completeUpload(
  app: FastifyInstance,
  session: TestSession,
  uploadId: string,
  { durationMs = 252_000, peaks = [0, 128, 255] }: UploadOptions = {},
) {
  return app.inject({
    method: 'POST',
    url: `/api/uploads/${uploadId}/complete`,
    cookies: session.cookies,
    payload: { durationMs, peaks },
  });
}

// Register → PUT → complete, failing loudly at any step.
export async function uploadTrack(
  app: FastifyInstance,
  session: TestSession,
  options: UploadOptions = {},
): Promise<CompleteUploadResponse> {
  const bytes = options.bytes ?? Buffer.from('fake audio');
  const registered = await registerUpload(app, session, { ...options, bytes });
  if (registered.statusCode !== 201) {
    throw new Error(`register failed: ${registered.body}`);
  }
  const body = createUploadResponseSchema.parse(registered.json());
  putUpload(app, body, bytes);
  const completed = await completeUpload(app, session, body.uploadId, options);
  if (completed.statusCode !== 201) {
    throw new Error(`complete failed: ${completed.body}`);
  }
  return completeUploadResponseSchema.parse(completed.json());
}
