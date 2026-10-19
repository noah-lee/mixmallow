import type { SelectUser, users } from '@repo/db';
import type { FastifyInstance } from 'fastify';
import {
  accessCookieName,
  issueAccessToken,
  issueRefreshToken,
  refreshCookieName,
} from '../../src/auth/tokens.ts';
import { createUser } from './factories.ts';

export type TestSession = {
  user: SelectUser;
  accessToken: string;
  refreshToken: string;
  // Keyed by the app's cookie names; pass as `app.inject({ cookies })`.
  cookies: Record<string, string>;
};

// Inserts a user and mints the same tokens a real sign-in would, using the app's own
// signer. This is how a test is "logged in"; there is no bypass route.
export async function createTestSession(
  app: FastifyInstance,
  userOverrides: Partial<typeof users.$inferInsert> = {},
): Promise<TestSession> {
  const user = await createUser(app.db, userOverrides);
  const accessToken = issueAccessToken(app, user.id);
  const refreshToken = issueRefreshToken(app, user);
  const { isProd } = app.config;
  return {
    user,
    accessToken,
    refreshToken,
    cookies: {
      [accessCookieName(isProd)]: accessToken,
      [refreshCookieName(isProd)]: refreshToken,
    },
  };
}
