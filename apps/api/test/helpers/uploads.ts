import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { localPath } from '../../src/storage/local.ts';

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
