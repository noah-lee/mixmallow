import {
  AUDIO_URL_TTL_MS,
  type StorageDriver,
  UPLOAD_URL_TTL_MS,
} from '../../src/storage/driver.ts';

// Stands in for the bucket: object sizes by key. URLs are inert; a test "uploads" by
// writing to `objects` (see putUpload), since the PUT itself is the bucket's job.
export const MEMORY_STORAGE_ORIGIN = 'https://storage.test';

export type MemoryDriver = StorageDriver & { objects: Map<string, number> };

export function createMemoryDriver(): MemoryDriver {
  const objects = new Map<string, number>();
  return {
    objects,
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
    },
  };
}

// The key a memory-driver URL points at.
export function keyFromUrl(url: string): string {
  return new URL(url).pathname.slice(1);
}
