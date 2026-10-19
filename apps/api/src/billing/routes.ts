import {
  type Database,
  stripeCustomers,
  stripeEvents,
  stripeSubscriptions,
  type Transaction,
} from '@repo/db';
import type { SubscriptionResponse } from '@repo/shared/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type Stripe from 'stripe';
import {
  ENDED_SUBSCRIPTION_STATUSES,
  extractCustomerId,
  syncSubscriptionForCustomer,
} from './sync.ts';

const SUBSCRIPTION_SYNC_EVENTS = new Set<Stripe.Event.Type>([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
]);

async function handleEvent(
  app: FastifyInstance,
  db: Database | Transaction,
  event: Stripe.Event,
): Promise<void> {
  if (!SUBSCRIPTION_SYNC_EVENTS.has(event.type)) {
    app.log.info({ type: event.type }, 'unhandled stripe event type');
    return;
  }

  const customerId = extractCustomerId(event.data.object);
  if (!customerId) {
    app.log.warn(
      { eventId: event.id, type: event.type },
      'stripe event has no customer id',
    );
    return;
  }

  // Dunning hook: to notify users on failed payments, branch on event.type
  // here (e.g. 'invoice.payment_failed') and send an email after resolving
  // the user's email from the customer id.
  const result = await syncSubscriptionForCustomer(db, app.stripe, customerId);
  if (result !== 'synced') {
    app.log.warn(
      { eventId: event.id, type: event.type, result },
      'stripe subscription sync skipped',
    );
  }
}

async function selectCustomerIdByUserId(
  db: Database | Transaction,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: stripeCustomers.stripeCustomerId })
    .from(stripeCustomers)
    .where(eq(stripeCustomers.userId, userId));
  return row?.id ?? null;
}

async function getOrCreateCustomer(
  app: FastifyInstance,
  userId: string,
): Promise<string> {
  const existing = await selectCustomerIdByUserId(app.db, userId);
  if (existing) return existing;

  const customer = await app.stripe.customers.create({ metadata: { userId } });
  const [inserted] = await app.db
    .insert(stripeCustomers)
    .values({ userId, stripeCustomerId: customer.id })
    .onConflictDoNothing()
    .returning({ id: stripeCustomers.stripeCustomerId });
  if (inserted) return inserted.id;

  // Concurrent request created the row first; load and return it.
  const now = await selectCustomerIdByUserId(app.db, userId);
  if (!now) throw new Error('failed to persist stripe customer');
  return now;
}

export const billingRoutes: FastifyPluginAsync = async (app) => {
  // Stripe verifies webhook signatures against the raw request bytes, so the
  // webhook lives in its own encapsulated scope where JSON bodies stay
  // unparsed buffers; every other route keeps Fastify's default JSON parser.
  await app.register(async (scope) => {
    scope.removeContentTypeParser('application/json');
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => done(null, body),
    );

    scope.post(
      '/webhook',
      { config: { rateLimit: false } },
      async (req, reply) => {
        const rawBody = req.body as Buffer | undefined;
        const signature = req.headers['stripe-signature'];
        if (!rawBody || typeof signature !== 'string') {
          reply.code(400);
          return { error: 'missing_signature' };
        }

        let event: Stripe.Event;
        try {
          event = app.stripe.webhooks.constructEvent(
            rawBody,
            signature,
            app.config.STRIPE_WEBHOOK_SECRET,
          );
        } catch (err) {
          app.log.warn({ err }, 'stripe webhook signature verification failed');
          reply.code(400);
          return { error: 'invalid_signature' };
        }

        // The processed-event marker commits atomically with the handler's
        // writes: if the handler throws, the marker rolls back and Stripe's
        // retry of the same event id is reprocessed instead of deduplicated.
        try {
          await app.db.transaction(async (tx) => {
            const [marker] = await tx
              .insert(stripeEvents)
              .values({ stripeEventId: event.id })
              .onConflictDoNothing()
              .returning();
            if (!marker) return; // already processed
            await handleEvent(app, tx, event);
          });
        } catch (err) {
          app.log.error(
            { err, eventId: event.id, type: event.type },
            'webhook handler failed',
          );
          reply.code(500);
          return { error: 'handler_failed' };
        }

        return { received: true };
      },
    );
  });

  app.post(
    '/checkout',
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const existing = await selectCustomerIdByUserId(app.db, req.user.sub);
      if (existing) {
        // Sync first: right after a checkout the webhook may not have landed yet, and a
        // second checkout would start a second, separately billed subscription.
        await syncSubscriptionForCustomer(app.db, app.stripe, existing);
        const [sub] = await app.db
          .select({ status: stripeSubscriptions.status })
          .from(stripeSubscriptions)
          .where(eq(stripeSubscriptions.userId, req.user.sub));
        if (sub && !ENDED_SUBSCRIPTION_STATUSES.has(sub.status)) {
          reply.code(409);
          return { error: 'already_subscribed' };
        }
      }
      const customerId =
        existing ?? (await getOrCreateCustomer(app, req.user.sub));
      const session = await app.stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [
          { price: app.config.STRIPE_PREMIUM_PRICE_ID, quantity: 1 },
        ],
        success_url: `${app.config.APP_ORIGIN}/account?checkout=success`,
        cancel_url: `${app.config.APP_ORIGIN}/account?checkout=canceled`,
        allow_promotion_codes: true,
      });
      if (!session.url) throw new Error('stripe checkout session missing url');
      return { url: session.url };
    },
  );

  app.post('/sync', { onRequest: [app.authenticate] }, async (req) => {
    const customerId = await selectCustomerIdByUserId(app.db, req.user.sub);
    if (customerId) {
      await syncSubscriptionForCustomer(app.db, app.stripe, customerId);
    }
    return { ok: true };
  });

  app.post('/portal', { onRequest: [app.authenticate] }, async (req, reply) => {
    const customerId = await selectCustomerIdByUserId(app.db, req.user.sub);
    if (!customerId) {
      reply.code(404);
      return { error: 'no_customer' };
    }
    const session = await app.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${app.config.APP_ORIGIN}/account`,
    });
    return { url: session.url };
  });

  app.get(
    '/subscription',
    { onRequest: [app.authenticate] },
    async (req, reply): Promise<SubscriptionResponse | { error: string }> => {
      const [row] = await app.db
        .select({
          status: stripeSubscriptions.status,
          currentPeriodEnd: stripeSubscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: stripeSubscriptions.cancelAtPeriodEnd,
        })
        .from(stripeSubscriptions)
        .where(eq(stripeSubscriptions.userId, req.user.sub));
      if (!row) {
        reply.code(404);
        return { error: 'no_subscription' };
      }
      return {
        status: row.status as SubscriptionResponse['status'],
        currentPeriodEnd: row.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      };
    },
  );
};
