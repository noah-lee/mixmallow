import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type CompleteUploadResponse,
  type CreateUploadResponse,
  completeUploadResponseSchema,
  createUploadResponseSchema,
} from '@repo/shared/schemas';
import type { FastifyInstance } from 'fastify';
import { localPath } from '../../src/storage/local.ts';
import type { TestSession } from './session.ts';

// Puts an object straight into the local driver's directory, for tests where only its
// existence or size matters.
export async function writeStoredObject(
  app: FastifyInstance,
  key: string,
  bytes: Buffer | number,
): Promise<void> {
  const file = localPath(app.config, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    typeof bytes === 'number' ? Buffer.alloc(bytes) : bytes,
  );
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

// PUTs the bytes to the signed URL the way a browser would.
export function putUpload(
  app: FastifyInstance,
  registered: CreateUploadResponse,
  bytes: Buffer,
) {
  return app.inject({
    method: 'PUT',
    url: registered.uploadUrl,
    headers: registered.headers,
    payload: bytes,
  });
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
  const put = await putUpload(app, body, bytes);
  if (put.statusCode !== 200) throw new Error(`PUT failed: ${put.body}`);
  const completed = await completeUpload(app, session, body.uploadId, options);
  if (completed.statusCode !== 201) {
    throw new Error(`complete failed: ${completed.body}`);
  }
  return completeUploadResponseSchema.parse(completed.json());
}
