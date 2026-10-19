import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resetAndMigrate } from '@repo/db/testing';
import {
  accessCookieName,
  refreshCookieName,
} from '../apps/api/src/auth/tokens.ts';
import { createTestApp } from '../apps/api/test/helpers/app.ts';
import { createTestSession } from '../apps/api/test/helpers/session.ts';
import { E2E_USER, STORAGE_STATE } from './support/env.ts';

// Signs in without Google: a fresh database, one user, and that user's real auth cookies
// saved as Playwright storageState. The OAuth flow itself is covered by the api tests.
export default async function globalSetup() {
  await resetAndMigrate();
  const app = await createTestApp();
  try {
    const session = await createTestSession(app, E2E_USER);
    const cookie = (name: string, value: string, cookiePath: string) => ({
      name,
      value,
      domain: '127.0.0.1',
      path: cookiePath,
      expires: -1,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax' as const,
    });
    const state = {
      cookies: [
        cookie(accessCookieName(false), session.accessToken, '/'),
        // Matches REFRESH_COOKIE_PATH in apps/api/src/auth/tokens.ts.
        cookie(refreshCookieName(false), session.refreshToken, '/api/auth'),
      ],
      origins: [],
    };
    mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
    writeFileSync(STORAGE_STATE, JSON.stringify(state, null, 2));
  } finally {
    await app.close();
  }
}
