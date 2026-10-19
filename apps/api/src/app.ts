import { existsSync } from 'node:fs';
import path from 'node:path';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { createDb, type Database } from '@repo/db';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { authPlugin, authRoutesPlugin } from './auth/plugin.ts';
import type { Config } from './config.ts';
import { localStorageRoutes } from './storage/local-routes.ts';
import { storagePlugin } from './storage/plugin.ts';
import { s3BucketOrigin } from './storage/s3.ts';

// The built SPA, beside dist/ in the image (the Dockerfile copies it there). Absent in dev,
// where Vite serves the SPA and proxies /api here.
const WEB_ROOT = path.resolve(import.meta.dirname, '../public');

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    config: Config;
  }
}

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    // Behind the host's TLS proxy (via Docker's port forwarding), the socket peer is a
    // private address. Trusting only private hops makes req.ip the first public
    // address in X-Forwarded-For, so the rate limit is per client, not global,
    // and a client can't spoof it by sending its own header.
    trustProxy: ['loopback', 'uniquelocal'],
  });

  // Must be set before any plugin declares a Zod route schema; Fastify binds
  // the compilers when routes are registered, not when requests arrive.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // No CORS plugin: the SPA and api share one origin. The one cross-origin party is the
  // S3 bucket, which the browser uploads to and plays from directly (its own CORS rules
  // live on the bucket).
  const storageOrigins =
    config.STORAGE_DRIVER === 's3' ? [s3BucketOrigin(config)] : [];
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", 'https:', 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", ...storageOrigins],
        mediaSrc: ["'self'", ...storageOrigins],
        frameAncestors: ["'none'"],
      },
    },
    frameguard: { action: 'deny' },
  });
  await app.register(compress);

  const db = createDb(config.DATABASE_URL);
  app.decorate('config', config);
  app.decorate('db', db);

  app.addHook('onClose', async () => {
    await db.$client.end();
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    // Bad client input is expected traffic, not a server fault: answer with
    // per-field detail so callers can fix the request.
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({
        error: 'validation_failed',
        details: err.validation.map((v) => ({
          path: v.instancePath,
          message: v.message,
        })),
      });
    }

    const statusCode = err.statusCode ?? 500;
    if (statusCode >= 500) {
      req.log.error({ err }, 'request failed');
      // Never leak internal error details in production.
      if (config.isProd) {
        return reply.code(statusCode).send({ error: 'internal_server_error' });
      }
    } else {
      // Client errors are expected traffic, so keep them out of error-level logs.
      req.log.info({ err }, 'request rejected');
      if (statusCode === 429) {
        return reply.code(429).send({ error: 'rate_limited' });
      }
    }
    return reply.code(statusCode).send({ error: err.message });
  });

  // Shared services (cookies, jwt, authenticate, storage) decorate the root, so every scope
  // sees them; routes stay in the /api scope below. Must come before the routes use them.
  await app.register(authPlugin);
  await app.register(storagePlugin);

  await app.register(
    async (api) => {
      // Coarse per-IP limit across the api. Scoped here so loading the SPA's assets
      // doesn't spend it. A route opts out with `config: { rateLimit: false }`.
      // A scope-wide hook, not the plugin's per-route one (`global: false`): scope hooks
      // run before a route's own onRequest hooks, so a request is counted before
      // authenticate can reject it.
      await api.register(rateLimit, {
        global: false,
        max: 100,
        timeWindow: '1 minute',
      });
      const limit = api.rateLimit();
      api.addHook('onRequest', async function (req, reply) {
        if (req.routeOptions.config.rateLimit === false) return;
        await limit.call(this, req, reply);
      });
      await api.register(authRoutesPlugin);
      if (config.STORAGE_DRIVER === 'local') {
        await api.register(localStorageRoutes, { prefix: '/storage/local' });
      }

      api.get('/health', async () => ({ status: 'ok' }));

      api.get('/health/db', async (_req, reply) => {
        try {
          await app.db.$client`SELECT 1`;
          return { status: 'ok' };
        } catch (err) {
          app.log.error({ err }, 'db health check failed');
          reply.code(503);
          return { status: 'error' };
        }
      });
    },
    { prefix: '/api' },
  );

  const serveWeb = existsSync(WEB_ROOT);
  if (serveWeb) {
    await app.register(fastifyStatic, {
      root: WEB_ROOT,
      cacheControl: false,
      setHeaders: (reply, filePath) => {
        // Vite content-hashes everything under assets/; the rest must revalidate so a
        // deploy is picked up.
        const hashed = filePath.includes(`${path.sep}assets${path.sep}`);
        reply.header(
          'Cache-Control',
          hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
  } else if (config.isProd) {
    throw new Error(`SPA build not found at ${WEB_ROOT}`);
  }

  app.setNotFoundHandler((req, reply) => {
    // Client-side routes: a browser navigation to any non-api path gets the SPA shell.
    const isPageLoad =
      (req.method === 'GET' || req.method === 'HEAD') &&
      !/^\/api(\/|\?|$)/.test(req.url) &&
      req.headers.accept?.includes('text/html');
    if (isPageLoad && serveWeb) {
      return reply.sendFile('index.html');
    }
    reply.code(404);
    return { error: 'not_found' };
  });

  return app;
}
