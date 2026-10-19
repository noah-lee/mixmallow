import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.ts';

const LIMIT = 100;

// A fresh app per test, so each starts with an empty in-memory rate-limit store.
let app: FastifyInstance;
beforeEach(async () => {
  app = await createTestApp();
});
afterEach(() => app.close());

describe('per-IP rate limit', () => {
  it.each(['/api/auth/me', '/api/billing/subscription'])(
    'counts unauthenticated requests to guarded %s',
    async (url) => {
      for (let i = 0; i < LIMIT; i++) {
        const res = await app.inject({ method: 'GET', url });
        expect(res.statusCode).toBe(401);
      }
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(429);
      expect(res.json()).toEqual({ error: 'rate_limited' });
    },
  );

  it('never limits the Stripe webhook', async () => {
    for (let i = 0; i <= LIMIT + 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/billing/webhook',
        headers: { 'content-type': 'application/json' },
        payload: '{}',
      });
      expect(res.statusCode).toBe(400);
    }
  });
});
