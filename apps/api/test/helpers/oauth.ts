import type { FastifyInstance } from 'fastify';
import { vi } from 'vitest';
import { TEST_ENV } from './config.ts';

export type IdTokenClaims = {
  iss?: string;
  aud?: string;
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

// JWT-shaped but unsigned: google.ts checks the claims, not the signature, because the
// token comes straight from Google's token endpoint over TLS.
export function fakeIdToken(claims: IdTokenClaims): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return [
    encode({ alg: 'RS256', typ: 'JWT' }),
    encode({
      iss: 'https://accounts.google.com',
      aud: TEST_ENV.GOOGLE_CLIENT_ID,
      ...claims,
    }),
    'fake-signature',
  ].join('.');
}

// Replaces the global fetch that oauth/google.ts uses for the token exchange. Returns the
// mock so a test can inspect the request. Undone by `unstubGlobals` in vitest.config.ts.
export function stubGoogleTokenEndpoint(
  response: { claims: IdTokenClaims } | { status: number; body?: unknown } = {
    claims: {
      sub: 'google-sub-1',
      email: 'ada@example.com',
      email_verified: true,
    },
  },
) {
  const fetchMock = vi.fn(
    async (_input: string | URL | Request, _init?: RequestInit) =>
      'claims' in response
        ? Response.json({ id_token: fakeIdToken(response.claims) })
        : Response.json(response.body ?? { error: 'invalid_grant' }, {
            status: response.status,
          }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Runs /start and returns what the browser would carry back to /callback.
export async function startSignIn(app: FastifyInstance, provider = 'google') {
  const res = await app.inject({
    method: 'GET',
    url: `/api/auth/${provider}/start`,
  });
  const location = new URL(res.headers.location ?? '');
  const cookie = (name: string) =>
    res.cookies.find((c) => c.name === name)?.value ?? '';
  return {
    res,
    location,
    state: location.searchParams.get('state') ?? '',
    // Pass as `app.inject({ cookies })` on the callback.
    cookies: {
      oauth_state: cookie('oauth_state'),
      oauth_pkce: cookie('oauth_pkce'),
    },
  };
}
