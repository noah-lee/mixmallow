import type { FastifyInstance, FastifyReply } from 'fastify';

// @fastify/jwt registered with two namespaces exposes the synchronous signer/
// verifier on the instance as app.jwt.access and app.jwt.refresh (the
// `${namespace}JwtSign` helpers it also creates live on reply/request and are
// async, which is not what we want here).
declare module '@fastify/jwt' {
  interface JWT {
    access: JWT;
    refresh: JWT;
  }
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

// Where authRoutes is mounted (the `/api` scope in app.ts + `/auth`). Move it with them.
const REFRESH_COOKIE_PATH = '/api/auth';

export type AccessTokenPayload = { sub: string };
export type RefreshTokenPayload = { sub: string; sid: string };

export function accessCookieName(isProd: boolean): string {
  return isProd ? '__Host-access_token' : 'access_token';
}

export function refreshCookieName(isProd: boolean): string {
  // __Host- requires Path=/. The refresh cookie scopes to /api/auth, so we fall
  // back to __Secure- (which only requires the Secure attribute).
  return isProd ? '__Secure-refresh_token' : 'refresh_token';
}

type CookieKind = 'access' | 'refresh';

function cookieOptions(kind: CookieKind, isProd: boolean) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: kind === 'access' ? '/' : REFRESH_COOKIE_PATH,
    maxAge:
      kind === 'access' ? ACCESS_TOKEN_TTL_SECONDS : REFRESH_TOKEN_TTL_SECONDS,
  };
}

export function issueAccessToken(app: FastifyInstance, userId: string): string {
  const payload: AccessTokenPayload = { sub: userId };
  return app.jwt.access.sign(payload, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

export function issueRefreshToken(
  app: FastifyInstance,
  user: { id: string; sessionId: string },
): string {
  const payload: RefreshTokenPayload = { sub: user.id, sid: user.sessionId };
  return app.jwt.refresh.sign(payload, {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function setAuthCookies(
  reply: FastifyReply,
  access: string,
  refresh: string,
): void {
  const { isProd } = reply.server.config;
  reply.setCookie(
    accessCookieName(isProd),
    access,
    cookieOptions('access', isProd),
  );
  reply.setCookie(
    refreshCookieName(isProd),
    refresh,
    cookieOptions('refresh', isProd),
  );
}

// Browsers drop a Set-Cookie for a __Host-/__Secure- name that lacks Secure,
// deletions included, so clear with the same attributes the cookie was set with.
export function clearAuthCookies(reply: FastifyReply): void {
  const { isProd } = reply.server.config;
  reply.clearCookie(accessCookieName(isProd), cookieOptions('access', isProd));
  reply.clearCookie(
    refreshCookieName(isProd),
    cookieOptions('refresh', isProd),
  );
}

// Terminal auth rejection: the session is dead (no/invalid refresh token,
// revoked session, or missing user), so clear the cookies to stop the client
// resending them and return 401. Distinct from the authenticate guard's 401,
// which is recoverable via /refresh and must leave cookies intact.
export function rejectSession(reply: FastifyReply) {
  clearAuthCookies(reply);
  reply.code(401);
  return { error: 'unauthenticated' } as const;
}
