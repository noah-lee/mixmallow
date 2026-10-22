import { readFile, writeFile } from 'node:fs/promises';
import {
  AUDIO_URL_TTL_MS,
  type StorageDriver,
  UPLOAD_URL_TTL_MS,
} from '../../src/storage/driver.ts';

// Stands in for the bucket: object sizes by key. URLs are inert; a test "uploads" by
// writing to `objects` (see putUpload), since the PUT itself is the bucket's job. Bodies
// and content types exist only for objects written with real bytes (`upload`, or a test
// setting `bodies`); downloading a size-only object yields that many zero bytes.
export const MEMORY_STORAGE_ORIGIN = 'https://storage.test';

export type MemoryDriver = StorageDriver & {
  objects: Map<string, number>;
  bodies: Map<string, Buffer>;
  contentTypes: Map<string, string>;
};

export function createMemoryDriver(): MemoryDriver {
  const objects = new Map<string, number>();
  const bodies = new Map<string, Buffer>();
  const contentTypes = new Map<string, string>();
  return {
    objects,
    bodies,
    contentTypes,
    async presignPut({ key, contentType }) {
      return {
        url: `${MEMORY_STORAGE_ORIGIN}/${key}?op=put`,
        headers: { 'Content-Type': contentType },
        expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_MS),
      };
    },
    async presignGet(key) {
      return {
        url: `${MEMORY_STORAGE_ORIGIN}/${key}?op=get`,
        expiresAt: new Date(Date.now() + AUDIO_URL_TTL_MS),
      };
    },
    async headSize(key) {
      return objects.get(key) ?? null;
    },
    async delete(key) {
      objects.delete(key);
      bodies.delete(key);
      contentTypes.delete(key);
    },
    async download(key, filePath) {
      const size = objects.get(key);
      if (size === undefined) throw new Error(`no such object: ${key}`);
      await writeFile(filePath, bodies.get(key) ?? Buffer.alloc(size));
    },
    async upload({ key, filePath, contentType }) {
      const body = await readFile(filePath);
      objects.set(key, body.length);
      bodies.set(key, body);
      contentTypes.set(key, contentType);
    },
  };
}

// The key a memory-driver URL points at.
export function keyFromUrl(url: string): string {
  return new URL(url).pathname.slice(1);
}
