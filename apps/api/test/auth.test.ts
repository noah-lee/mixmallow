import { users } from '@repo/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.ts';
import { isCleared, responseCookie } from './helpers/cookies.ts';
import { createTestSession } from './helpers/session.ts';

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

describe('GET /api/auth/me', () => {
  it('401s without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('401s with a forged access token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { access_token: 'not.a.jwt' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns the signed-in user', async () => {
    const { user, cookies } = await createTestSession(app);
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: null,
      isPremium: false,
    });
  });
});

describe('POST /api/auth/refresh', () => {
  const refresh = (cookies: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: '/api/auth/refresh', cookies });

  it('issues fresh cookies for a valid refresh token', async () => {
    const { refreshToken } = await createTestSession(app);
    const res = await refresh({ refresh_token: refreshToken });
    expect(res.statusCode).toBe(200);
    expect(responseCookie(res, 'access_token')?.value).toBeTruthy();
    expect(responseCookie(res, 'refresh_token')?.path).toBe('/api/auth');
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'garbage'],
  ])('rejects a %s refresh token and clears cookies', async (_label, token) => {
    const res = await refresh(token ? { refresh_token: token } : {});
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
    expect(isCleared(res, 'access_token')).toBe(true);
    expect(isCleared(res, 'refresh_token')).toBe(true);
  });

  it('rejects a revoked session and clears cookies', async () => {
    const { user, refreshToken } = await createTestSession(app);
    await app.db
      .update(users)
      .set({ sessionId: crypto.randomUUID() })
      .where(eq(users.id, user.id));
    const res = await refresh({ refresh_token: refreshToken });
    expect(res.statusCode).toBe(401);
    expect(isCleared(res, 'refresh_token')).toBe(true);
  });

  it('rejects an access token presented as a refresh token', async () => {
    const { accessToken } = await createTestSession(app);
    const res = await refresh({ refresh_token: accessToken });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears cookies without needing a session', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(200);
    expect(isCleared(res, 'access_token')).toBe(true);
    expect(isCleared(res, 'refresh_token')).toBe(true);
  });
});

describe('POST /api/auth/logout-all', () => {
  it('401s without a session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout-all',
    });
    expect(res.statusCode).toBe(401);
  });

  it('revokes every refresh token for the user', async () => {
    const { cookies, refreshToken } = await createTestSession(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout-all',
      cookies,
    });
    expect(res.statusCode).toBe(200);
    const after = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refresh_token: refreshToken },
    });
    expect(after.statusCode).toBe(401);
  });
});
