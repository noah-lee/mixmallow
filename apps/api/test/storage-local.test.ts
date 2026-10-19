import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { storageKey } from '../src/storage/driver.ts';
import { localPath, signedGetUrl, signedPutUrl } from '../src/storage/local.ts';
import { createTestApp } from './helpers/app.ts';

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

const bytes = Buffer.from('RIFF....WAVEfmt fake audio bytes');
const key = () => storageKey(crypto.randomUUID(), 'wav');

async function presignedPut(k: string, sizeBytes = bytes.length) {
  return app.storage.presignPut({
    key: k,
    contentType: 'audio/wav',
    sizeBytes,
  });
}

function put(url: string, body: Buffer, contentType = 'audio/wav') {
  return app.inject({
    method: 'PUT',
    url,
    headers: { 'content-type': contentType },
    payload: body,
  });
}

function withQuery(url: string, name: string, value: string) {
  const parsed = new URL(url, 'http://local');
  parsed.searchParams.set(name, value);
  return `${parsed.pathname}${parsed.search}`;
}

describe('PUT /api/storage/local/*', () => {
  it('stores the file for a validly signed URL', async () => {
    const k = key();
    const { url, headers } = await presignedPut(k);
    expect(url.startsWith('/api/storage/local/')).toBe(true);
    expect(headers).toEqual({ 'Content-Type': 'audio/wav' });

    const res = await put(url, bytes);
    expect(res.statusCode).toBe(200);
    expect(await readFile(localPath(app.config, k))).toEqual(bytes);
    expect(await app.storage.headSize(k)).toBe(bytes.length);
  });

  it('rejects a tampered signature', async () => {
    const k = key();
    const { url } = await presignedPut(k);
    const res = await put(withQuery(url, 'sig', 'forged'), bytes);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'invalid_signature' });
    expect(existsSync(localPath(app.config, k))).toBe(false);
  });

  it('rejects a URL signed for a larger size than claimed', async () => {
    const { url } = await presignedPut(key());
    const res = await put(withQuery(url, 'size', '999999999'), bytes);
    expect(res.statusCode).toBe(403);
  });

  it('rejects an expired URL', async () => {
    const k = key();
    const url = signedPutUrl(app.config, {
      key: k,
      exp: Date.now() - 1000,
      contentType: 'audio/wav',
      sizeBytes: bytes.length,
    });
    const res = await put(url, bytes);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'url_expired' });
  });

  it('rejects a content type other than the signed one', async () => {
    const { url } = await presignedPut(key());
    const res = await put(url, bytes, 'audio/mpeg');
    expect(res.statusCode).toBe(415);
  });

  it('rejects a body larger than the signed size and keeps nothing', async () => {
    const k = key();
    const { url } = await presignedPut(k, bytes.length - 1);
    const res = await put(url, bytes);
    expect(res.statusCode).toBe(413);
    expect(existsSync(localPath(app.config, k))).toBe(false);
  });

  it.each([
    ['a parent-directory escape', '../../etc/passwd'],
    ['an encoded escape', '..%2F..%2Fsecret.wav'],
    ['a key outside users/', `other/${crypto.randomUUID()}.wav`],
  ])('rejects %s', async (_label, badKey) => {
    const res = await put(
      `/api/storage/local/${badKey}?exp=1&ct=audio%2Fwav&size=1&sig=x`,
      bytes,
    );
    // 400 from key validation, or 404 when the path normalizes out of the route.
    expect([400, 404]).toContain(res.statusCode);
  });
});

describe('GET /api/storage/local/*', () => {
  async function stored() {
    const k = key();
    const { url } = await presignedPut(k);
    await put(url, bytes);
    return k;
  }

  it('serves the whole file', async () => {
    const { url } = await app.storage.presignGet(await stored());
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('audio/wav');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.rawPayload).toEqual(bytes);
  });

  it('serves a byte range', async () => {
    const { url } = await app.storage.presignGet(await stored());
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { range: 'bytes=4-11' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 4-11/${bytes.length}`);
    expect(res.rawPayload).toEqual(bytes.subarray(4, 12));
  });

  it('serves an open-ended range', async () => {
    const { url } = await app.storage.presignGet(await stored());
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { range: 'bytes=10-' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.rawPayload).toEqual(bytes.subarray(10));
  });

  it('answers 416 for a range past the end', async () => {
    const { url } = await app.storage.presignGet(await stored());
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { range: `bytes=${bytes.length}-` },
    });
    expect(res.statusCode).toBe(416);
  });

  it('rejects a tampered or expired signature', async () => {
    const k = await stored();
    const { url } = await app.storage.presignGet(k);
    const tampered = await app.inject({
      method: 'GET',
      url: withQuery(url, 'sig', 'forged'),
    });
    expect(tampered.statusCode).toBe(403);

    const expired = await app.inject({
      method: 'GET',
      url: signedGetUrl(app.config, { key: k, exp: Date.now() - 1000 }),
    });
    expect(expired.statusCode).toBe(403);
  });

  it('404s a signed URL for a missing object', async () => {
    const { url } = await app.storage.presignGet(key());
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(404);
  });
});

describe('storage.deleteMany', () => {
  it('removes objects and ignores ones already gone', async () => {
    const k = key();
    const { url } = await presignedPut(k);
    await put(url, bytes);
    await app.storage.deleteMany([k, key()]);
    expect(await app.storage.headSize(k)).toBeNull();
  });
});
