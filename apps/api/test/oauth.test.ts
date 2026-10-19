import { createHash } from 'node:crypto';
import { users } from '@repo/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.ts';
import { TEST_ENV } from './helpers/config.ts';
import { responseCookie } from './helpers/cookies.ts';
import { createUser } from './helpers/factories.ts';
import { startSignIn, stubGoogleTokenEndpoint } from './helpers/oauth.ts';

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

const callback = (query: string, cookies: Record<string, string>) =>
  app.inject({
    method: 'GET',
    url: `/api/auth/google/callback?${query}`,
    cookies,
  });

const OAUTH_ERROR = `${TEST_ENV.APP_ORIGIN}/?error=oauth`;

function expectSignedOut(res: Awaited<ReturnType<typeof callback>>) {
  expect(responseCookie(res, 'access_token')).toBeUndefined();
  expect(responseCookie(res, 'refresh_token')).toBeUndefined();
}

describe('GET /api/auth/google/start', () => {
  it('redirects to Google with PKCE S256 and state, and sets the oauth cookies', async () => {
    const { res, location, state } = await startSignIn(app);
    expect(res.statusCode).toBe(302);
    expect(location.origin + location.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    const params = location.searchParams;
    expect(params.get('client_id')).toBe(TEST_ENV.GOOGLE_CLIENT_ID);
    expect(params.get('redirect_uri')).toBe(
      `${TEST_ENV.APP_ORIGIN}/api/auth/google/callback`,
    );
    expect(params.get('response_type')).toBe('code');
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(state.length).toBeGreaterThan(20);

    const verifier = responseCookie(res, 'oauth_pkce');
    expect(verifier?.httpOnly).toBe(true);
    expect(verifier?.path).toBe('/api/auth/google');
    expect(params.get('code_challenge')).toBe(
      createHash('sha256')
        .update(verifier?.value ?? '')
        .digest('base64url'),
    );
    // Signed, so it isn't the bare state.
    const stateCookie = responseCookie(res, 'oauth_state');
    expect(stateCookie?.value).toContain(state);
    expect(stateCookie?.value).not.toBe(state);
  });
});

describe('GET /api/auth/google/callback', () => {
  it('creates the user, sets auth cookies and redirects to the app', async () => {
    const fetchMock = stubGoogleTokenEndpoint({
      claims: {
        sub: 'sub-ada',
        email: 'ada@example.com',
        email_verified: true,
        name: 'Ada',
      },
    });
    const { state, cookies } = await startSignIn(app);
    const res = await callback(`code=the-code&state=${state}`, cookies);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(TEST_ENV.APP_ORIGIN);
    expect(responseCookie(res, 'access_token')?.value).toBeTruthy();
    expect(responseCookie(res, 'refresh_token')?.value).toBeTruthy();

    const body = new URLSearchParams(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    );
    expect(body.get('code')).toBe('the-code');
    expect(body.get('code_verifier')).toBe(cookies.oauth_pkce);

    const rows = await app.db.select().from(users);
    expect(rows).toMatchObject([
      {
        email: 'ada@example.com',
        name: 'Ada',
        authProvider: 'google',
        authProviderId: 'sub-ada',
      },
    ]);
  });

  // Each case still stubs a valid Google response, so only the check under test stands
  // between the request and a session.
  it('rejects a state that does not match the cookie', async () => {
    stubGoogleTokenEndpoint();
    const { cookies } = await startSignIn(app);
    const res = await callback('code=c&state=attacker-state', cookies);
    expect(res.headers.location).toBe(OAUTH_ERROR);
    expectSignedOut(res);
  });

  it('rejects a callback without the oauth cookies', async () => {
    stubGoogleTokenEndpoint();
    const { state } = await startSignIn(app);
    const res = await callback(`code=c&state=${state}`, {});
    expect(res.headers.location).toBe(OAUTH_ERROR);
    expectSignedOut(res);
  });

  it('rejects an unverified email', async () => {
    stubGoogleTokenEndpoint({
      claims: { sub: 's', email: 'ada@example.com', email_verified: false },
    });
    const { state, cookies } = await startSignIn(app);
    const res = await callback(`code=c&state=${state}`, cookies);
    expect(res.headers.location).toBe(OAUTH_ERROR);
    expectSignedOut(res);
    expect(await app.db.select().from(users)).toEqual([]);
  });

  it('rejects a failed token exchange', async () => {
    stubGoogleTokenEndpoint({ status: 400 });
    const { state, cookies } = await startSignIn(app);
    const res = await callback(`code=c&state=${state}`, cookies);
    expect(res.headers.location).toBe(OAUTH_ERROR);
    expectSignedOut(res);
  });

  it('rejects an id_token for another client', async () => {
    stubGoogleTokenEndpoint({
      claims: {
        aud: 'someone-elses-client',
        sub: 's',
        email: 'ada@example.com',
        email_verified: true,
      },
    });
    const { state, cookies } = await startSignIn(app);
    const res = await callback(`code=c&state=${state}`, cookies);
    expect(res.headers.location).toBe(OAUTH_ERROR);
    expectSignedOut(res);
  });

  it('refuses an email owned by another user, without touching that user', async () => {
    const existing = await createUser(app.db, {
      email: 'ada@example.com',
      authProviderId: 'original-sub',
      name: 'Original',
    });
    stubGoogleTokenEndpoint({
      claims: {
        sub: 'different-sub',
        email: 'ada@example.com',
        email_verified: true,
        name: 'Impostor',
      },
    });
    const { state, cookies } = await startSignIn(app);
    const res = await callback(`code=c&state=${state}`, cookies);

    expect(res.headers.location).toBe(
      `${TEST_ENV.APP_ORIGIN}/?error=email_in_use&provider=google`,
    );
    expectSignedOut(res);
    expect(await app.db.select().from(users)).toEqual([existing]);
  });

  it('omits ?provider when the existing account has an unknown provider', async () => {
    await createUser(app.db, {
      email: 'ada@example.com',
      authProvider: 'retired-provider',
    });
    stubGoogleTokenEndpoint();
    const { state, cookies } = await startSignIn(app);
    const res = await callback(`code=c&state=${state}`, cookies);
    expect(res.headers.location).toBe(
      `${TEST_ENV.APP_ORIGIN}/?error=email_in_use`,
    );
  });
});
