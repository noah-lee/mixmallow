import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { googleProvider } from './oauth/google.ts';
import { oauthRoutes } from './oauth/routes.ts';
import { authRoutes } from './routes.ts';
import { type AccessTokenPayload, accessCookieName } from './tokens.ts';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      req: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<unknown>;
  }
}

// Registered on the root app, so `authenticate` and `jwt` are visible to every scope
// (and to tests). The routes go in `authRoutesPlugin`, inside the /api scope.
export const authPlugin = fp(async (app) => {
  const { config } = app;

  await app.register(fastifyCookie, { secret: config.COOKIE_SECRET });

  await app.register(fastifyJwt, {
    secret: config.ACCESS_TOKEN_SECRET,
    namespace: 'access',
  });

  await app.register(fastifyJwt, {
    secret: config.REFRESH_TOKEN_SECRET,
    namespace: 'refresh',
  });

  app.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const token = req.cookies[accessCookieName(config.isProd)];
      if (!token) {
        return reply.code(401).send({ error: 'unauthenticated' });
      }
      try {
        req.user = app.jwt.access.verify<AccessTokenPayload>(token);
      } catch {
        return reply.code(401).send({ error: 'unauthenticated' });
      }
    },
  );
});

export const authRoutesPlugin: FastifyPluginAsync = async (app) => {
  await app.register(authRoutes, { prefix: '/auth' });
  // A new provider is a module beside oauth/google.ts, its id in `authProviderSchema`,
  // and an entry here.
  for (const provider of [googleProvider(app.config)]) {
    await app.register(oauthRoutes, {
      prefix: `/auth/${provider.id}`,
      provider,
    });
  }
};
