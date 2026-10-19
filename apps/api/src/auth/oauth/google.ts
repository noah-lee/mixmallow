import { z } from 'zod';
import type { Config } from '../../config.ts';
import type { OAuthProvider } from './provider.ts';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const tokenResponseSchema = z.object({
  id_token: z.string(),
});

// The id_token comes straight from Google's token endpoint over TLS, so its signature
// needn't be checked (OIDC Core 3.1.3.7), but its issuer and audience must be.
const idTokenPayloadSchema = z.object({
  iss: z.enum(['https://accounts.google.com', 'accounts.google.com']),
  aud: z.string(),
  sub: z.string(),
  email: z.email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
  picture: z.url().optional(),
});

function decodeIdTokenPayload(idToken: string): unknown {
  const payload = idToken.split('.')[1];
  if (!payload) throw new Error('malformed id_token');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

export function googleProvider(config: Config): OAuthProvider {
  return {
    id: 'google',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: config.GOOGLE_CLIENT_ID,
    scope: 'openid email profile',
    extraAuthorizationParams: {
      access_type: 'online',
      prompt: 'select_account',
    },

    async fetchProfile({ code, codeVerifier, redirectUri }) {
      const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: codeVerifier,
          client_id: config.GOOGLE_CLIENT_ID,
          client_secret: config.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
        }),
      });
      if (!res.ok) {
        throw new Error(`google token exchange failed with ${res.status}`);
      }

      const { id_token } = tokenResponseSchema.parse(await res.json());
      const payload = idTokenPayloadSchema.parse(
        decodeIdTokenPayload(id_token),
      );
      if (payload.aud !== config.GOOGLE_CLIENT_ID) {
        throw new Error('id_token audience mismatch');
      }

      return {
        providerId: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified,
        name: payload.name ?? null,
        picture: payload.picture ?? null,
      };
    },
  };
}
