import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  issueAccessToken,
  issueRefreshToken,
  setAuthCookies,
} from '../tokens.ts';
import { upsertUserFromSignIn } from '../users.ts';
import type { OAuthProfile, OAuthProvider } from './provider.ts';

const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_PKCE_COOKIE = 'oauth_pkce';
const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

const base64url = (buf: Buffer) => buf.toString('base64url');

function pkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function randomState(): string {
  return base64url(randomBytes(32));
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

// Authorization Code + PKCE sign-in, mounted once per provider at `/auth/<provider.id>`.
export const oauthRoutes: FastifyPluginAsync<{
  provider: OAuthProvider;
}> = async (app, { provider }) => {
  const { config } = app;
  // Derived from where this plugin is mounted, so it must equal the redirect URI
  // registered with the provider.
  const redirectUri = new URL(`${app.prefix}/callback`, config.APP_ORIGIN).href;
  const oauthCookiePath = app.prefix;
  const oauthCookieOptions = {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax' as const,
    path: oauthCookiePath,
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  };

  app.get('/start', async (_req, reply) => {
    const state = randomState();
    const { verifier, challenge } = pkce();

    reply.setCookie(OAUTH_STATE_COOKIE, state, {
      ...oauthCookieOptions,
      signed: true,
    });
    reply.setCookie(OAUTH_PKCE_COOKIE, verifier, oauthCookieOptions);

    const url = new URL(provider.authorizationEndpoint);
    url.searchParams.set('client_id', provider.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', provider.scope);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    for (const [key, value] of Object.entries(
      provider.extraAuthorizationParams ?? {},
    )) {
      url.searchParams.set(key, value);
    }

    return reply.redirect(url.toString());
  });

  // The browser is mid-redirect here, so failures go back to the landing page
  // (which shows a banner for `?error`) instead of rendering raw JSON.
  // Cancelling on the provider's consent screen lands here too, as `?error=access_denied`.
  const failSignIn = (
    reply: FastifyReply,
    reason: string,
    search: Record<string, string> = { error: 'oauth' },
  ) => {
    app.log.warn({ provider: provider.id, reason }, 'oauth sign-in failed');
    const url = new URL('/', config.APP_ORIGIN);
    for (const [key, value] of Object.entries(search)) {
      url.searchParams.set(key, value);
    }
    return reply.redirect(url.toString());
  };

  app.get('/callback', async (req, reply) => {
    // State and PKCE verification
    const queryResult = callbackQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return failSignIn(reply, 'missing code or state');
    }
    const { code, state } = queryResult.data;

    const signed = req.cookies[OAUTH_STATE_COOKIE];
    const verifier = req.cookies[OAUTH_PKCE_COOKIE];
    reply.clearCookie(OAUTH_STATE_COOKIE, { path: oauthCookiePath });
    reply.clearCookie(OAUTH_PKCE_COOKIE, { path: oauthCookiePath });

    if (!signed || !verifier) {
      return failSignIn(reply, 'missing oauth cookies');
    }
    const unsigned = req.unsignCookie(signed);
    if (!unsigned.valid || !unsigned.value) {
      return failSignIn(reply, 'invalid oauth state');
    }
    if (!constantTimeEqual(unsigned.value, state)) {
      return failSignIn(reply, 'oauth state mismatch');
    }

    let profile: OAuthProfile;
    try {
      profile = await provider.fetchProfile({
        code,
        codeVerifier: verifier,
        redirectUri,
      });
    } catch (err) {
      app.log.error(
        { err, provider: provider.id },
        'oauth profile fetch failed',
      );
      return failSignIn(reply, 'profile fetch failed');
    }
    if (!profile.emailVerified) {
      return failSignIn(reply, 'email not verified');
    }

    const result = await upsertUserFromSignIn(app.db, {
      provider: provider.id,
      providerId: profile.providerId,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });
    if ('error' in result) {
      return failSignIn(reply, 'email belongs to another account', {
        error: 'email_in_use',
        ...(result.existingProvider && { provider: result.existingProvider }),
      });
    }

    const access = issueAccessToken(app, result.user.id);
    const refresh = issueRefreshToken(app, result.user);
    setAuthCookies(reply, access, refresh);

    return reply.redirect(config.APP_ORIGIN);
  });
};
