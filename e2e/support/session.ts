import {
  accessCookieName,
  refreshCookieName,
} from '../../apps/api/src/auth/tokens.ts';
import type { createTestApp } from '../../apps/api/test/helpers/app.ts';
import { createTestSession } from '../../apps/api/test/helpers/session.ts';

export type BrowserCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Lax';
};

// A new user and the real auth cookies a sign-in would set, shaped for Playwright
// (storageState or `context.addCookies`).
export async function signedInUser(
  app: Awaited<ReturnType<typeof createTestApp>>,
  user: { email: string; name: string; authProviderId?: string },
) {
  const session = await createTestSession(app, user);
  const cookie = (
    name: string,
    value: string,
    cookiePath: string,
  ): BrowserCookie => ({
    name,
    value,
    domain: '127.0.0.1',
    path: cookiePath,
    expires: -1,
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  });
  const cookies = [
    cookie(accessCookieName(false), session.accessToken, '/'),
    // Matches REFRESH_COOKIE_PATH in apps/api/src/auth/tokens.ts.
    cookie(refreshCookieName(false), session.refreshToken, '/api/auth'),
  ];
  return { user: session.user, cookies };
}
