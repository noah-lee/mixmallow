import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { type Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  AUDIO_FORMATS,
  audioFormatSchema,
  fileExtension,
} from '@repo/shared/schemas';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { isValidKey, localPath, verifyGet, verifyPut } from './local.ts';

const keyParamsSchema = z.object({
  '*': z.string().refine(isValidKey, 'Invalid storage key'),
});

const putQuerySchema = z.object({
  exp: z.coerce.number().int(),
  ct: z.string(),
  size: z.coerce.number().int().positive(),
  sig: z.string(),
});

const getQuerySchema = z.object({
  exp: z.coerce.number().int(),
  sig: z.string(),
});

class TooLargeError extends Error {}

// Fails the pipeline as soon as more than `limit` bytes have passed.
function byteLimit(limit: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, done) {
      seen += chunk.length;
      done(seen > limit ? new TooLargeError() : null, chunk);
    },
  });
}

// A single `bytes=start-end` range, or null to send the whole file. Multiple ranges are
// answered with the whole file, which RFC 9110 allows.
function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | 'unsatisfiable' | null {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, from = '', to = ''] = match;
  if (from === '' && to === '') return 'unsatisfiable';
  if (from === '') {
    const suffix = Number(to);
    if (suffix === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(from);
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  if (start >= size || end < start) return 'unsatisfiable';
  return { start, end };
}

// Stands in for an S3 bucket in dev and tests: the signed URL is the authorization, as
// with S3, so there's no session check. app.ts registers this only for STORAGE_DRIVER=local,
// which config.ts refuses in production.
export const localStorageRoutes: FastifyPluginAsyncZod = async (app) => {
  // The body is the raw file, streamed to disk, whatever its content type.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', (_req, payload, done) => done(null, payload));

  app.put(
    '/*',
    { schema: { params: keyParamsSchema, querystring: putQuerySchema } },
    async (req, reply) => {
      const key = req.params['*'];
      const { exp, ct, size, sig } = req.query;
      const verdict = verifyPut(
        app.config,
        { key, exp, contentType: ct, sizeBytes: size },
        sig,
      );
      if (verdict !== 'ok') {
        reply.code(403);
        return { error: verdict };
      }
      const contentType = req.headers['content-type']
        ?.split(';')[0]
        ?.trim()
        .toLowerCase();
      if (contentType !== ct) {
        reply.code(415);
        return { error: 'unsupported_media_type' };
      }
      if (Number(req.headers['content-length'] ?? 0) > size) {
        reply.code(413);
        return { error: 'too_large' };
      }

      const file = localPath(app.config, key);
      const partial = `${file}.${crypto.randomUUID()}.part`;
      await mkdir(path.dirname(file), { recursive: true });
      try {
        await pipeline(
          req.body as Readable,
          byteLimit(size),
          createWriteStream(partial),
        );
        await rename(partial, file);
      } catch (err) {
        await rm(partial, { force: true });
        if (err instanceof TooLargeError) {
          reply.code(413);
          return { error: 'too_large' };
        }
        throw err;
      }
      return { ok: true };
    },
  );

  app.get(
    '/*',
    {
      schema: { params: keyParamsSchema, querystring: getQuerySchema },
      // A player issues a range request per seek; the signature already gates access.
      config: { rateLimit: false },
      // Range responses must go out byte for byte.
      compress: false,
    },
    async (req, reply) => {
      const key = req.params['*'];
      const { exp, sig } = req.query;
      const verdict = verifyGet(app.config, { key, exp }, sig);
      if (verdict !== 'ok') {
        reply.code(403);
        return { error: verdict };
      }

      const file = localPath(app.config, key);
      let size: number;
      try {
        size = (await stat(file)).size;
      } catch {
        reply.code(404);
        return { error: 'not_found' };
      }

      const range = parseRange(req.headers.range, size);
      if (range === 'unsatisfiable') {
        reply.code(416).header('Content-Range', `bytes */${size}`);
        return { error: 'range_not_satisfiable' };
      }
      const format = audioFormatSchema.safeParse(fileExtension(key));
      reply.header(
        'Content-Type',
        format.success
          ? AUDIO_FORMATS[format.data]
          : 'application/octet-stream',
      );
      reply.header('Accept-Ranges', 'bytes');

      if (range) {
        reply
          .code(206)
          .header('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
          .header('Content-Length', range.end - range.start + 1);
        return reply.send(createReadStream(file, range));
      }
      reply.header('Content-Length', size);
      return reply.send(createReadStream(file));
    },
  );
};
