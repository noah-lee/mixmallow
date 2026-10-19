import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTestApp } from './helpers/app.ts';

describe('without an SPA build', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp();
    // A throwaway route with a Zod schema, to exercise the app's real error handler.
    app
      .withTypeProvider<ZodTypeProvider>()
      .post(
        '/api/__test/validate',
        { schema: { body: z.object({ email: z.email() }) } },
        async (req) => ({ email: req.body.email }),
      );
  });
  afterAll(() => app.close());

  it('answers /api/health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('answers /api/health/db from the test database', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health/db' });
    expect(res.statusCode).toBe(200);
  });

  it.each([
    ['an unknown api path', '/api/nope', 'text/html'],
    ['a non-html request', '/some/page', 'application/json'],
  ])('404s %s as JSON', async (_label, url, accept) => {
    const res = await app.inject({ method: 'GET', url, headers: { accept } });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('turns a schema failure into 400 validation_failed with details', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/__test/validate',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: 'validation_failed',
      details: [{ path: '/email', message: expect.any(String) }],
    });
  });
});

// app.ts serves the SPA from apps/api/public when it exists (the image copies it there).
describe('with an SPA build', () => {
  const webRoot = path.resolve(import.meta.dirname, '../public');
  const created = !existsSync(webRoot);
  let app: FastifyInstance;

  beforeAll(async () => {
    if (created) {
      mkdirSync(webRoot);
      writeFileSync(
        path.join(webRoot, 'index.html'),
        '<!doctype html><title>spa</title>',
      );
    }
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
    if (created) rmSync(webRoot, { recursive: true, force: true });
  });

  it('serves index.html to a browser navigation outside /api', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/account',
      headers: { accept: 'text/html' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('still 404s unknown api paths as JSON', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/nope',
      headers: { accept: 'text/html' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });
});
