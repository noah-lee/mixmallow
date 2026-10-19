import {
  type Database,
  stripeCustomers,
  stripeSubscriptions,
  type Transaction,
} from '@repo/db';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import type { StripeClient } from './stripe.ts';

// Any other status is a subscription the customer still manages through the portal.
export const ENDED_SUBSCRIPTION_STATUSES = new Set<string>([
  'canceled',
  'incomplete_expired',
]);

export async function selectUserIdByCustomerId(
  db: Database | Transaction,
  customerId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ userId: stripeCustomers.userId })
    .from(stripeCustomers)
    .where(eq(stripeCustomers.stripeCustomerId, customerId));
  return row?.userId ?? null;
}

function mapStripeSubscription(sub: Stripe.Subscription) {
  // The billing period lives on each item, not the subscription (API 2025-03-31.basil+).
  const periodEnd = Math.max(
    ...sub.items.data.map((item) => item.current_period_end),
  );
  if (!Number.isFinite(periodEnd)) {
    throw new Error(`stripe subscription ${sub.id} has no items`);
  }
  return {
    stripeSubscriptionId: sub.id,
    status: sub.status,
    currentPeriodEnd: new Date(periodEnd * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
}

// A Stripe event's data object (subscription, invoice, checkout session, …)
// carries the customer as either a bare id string or an expanded object.
export function extractCustomerId(eventObject: object): string | null {
  const customer = (eventObject as { customer?: unknown }).customer;
  if (typeof customer === 'string') return customer;
  if (typeof customer === 'object' && customer !== null) {
    const id = (customer as { id?: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return null;
}

export async function syncSubscriptionForCustomer(
  db: Database | Transaction,
  stripe: StripeClient,
  customerId: string,
): Promise<'synced' | 'unknown_customer'> {
  const userId = await selectUserIdByCustomerId(db, customerId);
  if (!userId) return 'unknown_customer';

  // Newest first. Prefer one that hasn't ended: a newer abandoned or expired one must not
  // mask an older live subscription.
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10,
  });
  const subscription =
    subs.data.find((sub) => !ENDED_SUBSCRIPTION_STATUSES.has(sub.status)) ??
    subs.data[0];

  if (!subscription) {
    await db
      .delete(stripeSubscriptions)
      .where(eq(stripeSubscriptions.userId, userId));
    return 'synced';
  }

  const dbSub = mapStripeSubscription(subscription);
  await db
    .insert(stripeSubscriptions)
    .values({ userId, ...dbSub })
    .onConflictDoUpdate({
      target: stripeSubscriptions.userId,
      set: { ...dbSub, updatedAt: new Date() },
    });
  return 'synced';
}
