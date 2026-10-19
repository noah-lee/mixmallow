import { stripeSubscriptions, users } from '@repo/db';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import {
  clearAuthCookies,
  issueAccessToken,
  issueRefreshToken,
  type RefreshTokenPayload,
  refreshCookieName,
  rejectSession,
  setAuthCookies,
} from './tokens.ts';

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { onRequest: [app.authenticate] }, async (req, reply) => {
    const [row] = await app.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        picture: users.picture,
        subscriptionStatus: stripeSubscriptions.status,
      })
      .from(users)
      .leftJoin(stripeSubscriptions, eq(stripeSubscriptions.userId, users.id))
      .where(eq(users.id, req.user.sub));
    if (!row) {
      return rejectSession(reply);
    }
    const { subscriptionStatus, ...user } = row;
    return {
      ...user,
      isPremium:
        subscriptionStatus === 'active' || subscriptionStatus === 'trialing',
    };
  });

  app.post('/refresh', async (req, reply) => {
    const cookie = req.cookies[refreshCookieName(app.config.isProd)];
    if (!cookie) {
      return rejectSession(reply);
    }
    let payload: RefreshTokenPayload;
    try {
      payload = app.jwt.refresh.verify<RefreshTokenPayload>(cookie);
    } catch {
      return rejectSession(reply);
    }
    const [user] = await app.db
      .select({ id: users.id, sessionId: users.sessionId })
      .from(users)
      .where(eq(users.id, payload.sub));
    if (!user || user.sessionId !== payload.sid) {
      return rejectSession(reply);
    }
    const access = issueAccessToken(app, user.id);
    const refresh = issueRefreshToken(app, user);
    setAuthCookies(reply, access, refresh);
    return { ok: true };
  });

  // Unguarded: with an expired session, a guarded logout would 401 and leave the
  // refresh cookie behind. Clearing cookies needs no identity.
  app.post('/logout', async (_req, reply) => {
    clearAuthCookies(reply);
    return { ok: true };
  });

  app.post(
    '/logout-all',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      await app.db
        .update(users)
        .set({ sessionId: crypto.randomUUID() })
        .where(eq(users.id, req.user.sub));
      clearAuthCookies(reply);
      return { ok: true };
    },
  );
};
