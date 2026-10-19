import fp from 'fastify-plugin';
import { createStripeClient, type StripeClient } from './stripe.ts';

declare module 'fastify' {
  interface FastifyInstance {
    stripe: StripeClient;
  }
}

// Registered on the root app; app.ts mounts `billingRoutes` inside the /api scope.
export const billingPlugin = fp(async (app) => {
  app.decorate('stripe', createStripeClient(app.config.STRIPE_SECRET_KEY));
});
