import { createHmac, timingSafeEqual } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config.ts';
import {
  AUDIO_URL_TTL_MS,
  type StorageDriver,
  UPLOAD_URL_TTL_MS,
} from './driver.ts';

// local-routes.ts is mounted here inside the /api scope (app.ts); move both together.
export const LOCAL_ROUTE_PREFIX = '/api/storage/local';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// Only the shape driver.ts `storageKey` generates, so `..` or an absolute path never
// reaches the filesystem.
const KEY_PATTERN = new RegExp(`^users/${UUID}/${UUID}\\.[a-z0-9]{1,5}$`);

export function isValidKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export function localPath(config: Config, key: string): string {
  if (!isValidKey(key)) throw new Error('invalid storage key');
  return path.join(path.resolve(config.STORAGE_LOCAL_DIR), key);
}

export type PutClaims = {
  key: string;
  exp: number;
  contentType: string;
  sizeBytes: number;
};

export type GetClaims = { key: string; exp: number };

function sign(config: Config, parts: (string | number)[]): string {
  // A subkey, so a URL signature can never stand in for a cookie signature.
  const key = createHmac('sha256', config.COOKIE_SECRET)
    .update('local-storage-urls')
    .digest();
  return createHmac('sha256', key).update(parts.join('\n')).digest('base64url');
}

const putSignature = (config: Config, c: PutClaims) =>
  sign(config, ['PUT', c.key, c.exp, c.contentType, c.sizeBytes]);
const getSignature = (config: Config, c: GetClaims) =>
  sign(config, ['GET', c.key, c.exp]);

export function signedPutUrl(config: Config, claims: PutClaims): string {
  const query = new URLSearchParams({
    exp: String(claims.exp),
    ct: claims.contentType,
    size: String(claims.sizeBytes),
    sig: putSignature(config, claims),
  });
  return `${LOCAL_ROUTE_PREFIX}/${claims.key}?${query}`;
}

export function signedGetUrl(config: Config, claims: GetClaims): string {
  const query = new URLSearchParams({
    exp: String(claims.exp),
    sig: getSignature(config, claims),
  });
  return `${LOCAL_ROUTE_PREFIX}/${claims.key}?${query}`;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type Verdict = 'ok' | 'invalid_signature' | 'url_expired';

function verdict(expected: string, sig: string, exp: number): Verdict {
  if (!safeEqual(expected, sig)) return 'invalid_signature';
  return exp > Date.now() ? 'ok' : 'url_expired';
}

export function verifyPut(
  config: Config,
  claims: PutClaims,
  sig: string,
): Verdict {
  return verdict(putSignature(config, claims), sig, claims.exp);
}

export function verifyGet(
  config: Config,
  claims: GetClaims,
  sig: string,
): Verdict {
  return verdict(getSignature(config, claims), sig, claims.exp);
}

export function createLocalDriver(config: Config): StorageDriver {
  return {
    async presignPut({ key, contentType, sizeBytes }) {
      const exp = Date.now() + UPLOAD_URL_TTL_MS;
      return {
        url: signedPutUrl(config, { key, exp, contentType, sizeBytes }),
        headers: { 'Content-Type': contentType },
        expiresAt: new Date(exp),
      };
    },

    async presignGet(key) {
      const exp = Date.now() + AUDIO_URL_TTL_MS;
      return {
        url: signedGetUrl(config, { key, exp }),
        expiresAt: new Date(exp),
      };
    },

    async headSize(key) {
      try {
        return (await stat(localPath(config, key))).size;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },

    async delete(key) {
      await rm(localPath(config, key), { force: true });
    },
  };
}
