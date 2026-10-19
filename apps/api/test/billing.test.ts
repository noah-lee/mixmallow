import { stripeEvents, stripeSubscriptions } from '@repo/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.ts';
import { TEST_ENV } from './helpers/config.ts';
import { createTestSession } from './helpers/session.ts';

// Offline only: Checkout, Portal and /sync call Stripe's API and aren't covered here.

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());

describe('POST /api/billing/webhook', () => {
  // An event type the handler ignores, so processing it never calls Stripe.
  const payload = JSON.stringify({
    id: 'evt_test_1',
    object: 'event',
    type: 'customer.created',
    data: { object: { id: 'cus_test_1', object: 'customer' } },
  });

  const post = (headers: Record<string, string>) =>
    app.inject({
      method: 'POST',
      url: '/api/billing/webhook',
      headers: { 'content-type': 'application/json', ...headers },
      payload,
    });

  const signed = () =>
    app.stripe.webhooks.generateTestHeaderString({
      payload,
      secret: TEST_ENV.STRIPE_WEBHOOK_SECRET,
    });

  it('rejects a missing signature', async () => {
    const res = await post({});
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'missing_signature' });
  });

  it('rejects a bad signature without recording the event', async () => {
    const res = await post({ 'stripe-signature': 't=1,v1=deadbeef' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_signature' });
    expect(await app.db.select().from(stripeEvents)).toEqual([]);
  });

  it('accepts a signed event once and treats a replay as a no-op', async () => {
    const first = await post({ 'stripe-signature': signed() });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ received: true });

    const replay = await post({ 'stripe-signature': signed() });
    expect(replay.statusCode).toBe(200);

    const rows = await app.db.select().from(stripeEvents);
    expect(rows.map((r) => r.stripeEventId)).toEqual(['evt_test_1']);
  });
});

// Authorization pattern: copy this for every user-owned resource.
describe('GET /api/billing/subscription', () => {
  it('401s without a session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/billing/subscription',
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns only the caller's own subscription", async () => {
    const owner = await createTestSession(app);
    const other = await createTestSession(app);
    await app.db.insert(stripeSubscriptions).values({
      userId: owner.user.id,
      stripeSubscriptionId: 'sub_test_1',
      status: 'active',
      currentPeriodEnd: new Date('2030-01-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    const own = await app.inject({
      method: 'GET',
      url: '/api/billing/subscription',
      cookies: owner.cookies,
    });
    expect(own.statusCode).toBe(200);
    expect(own.json()).toEqual({
      status: 'active',
      currentPeriodEnd: '2030-01-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
    });

    const foreign = await app.inject({
      method: 'GET',
      url: '/api/billing/subscription',
      cookies: other.cookies,
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual({ error: 'no_subscription' });
  });
});
