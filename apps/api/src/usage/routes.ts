import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { usageFor } from './queries.ts';

export const usageRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', { onRequest: [app.authenticate] }, async (req) =>
    usageFor(app.db, req.user.sub),
  );
};
