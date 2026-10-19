import Stripe from 'stripe';

export type StripeClient = Stripe;

// Pin the API version explicitly so upgrading the `stripe` package is a
// deliberate step, not a silent behavior change. It must match the version the
// installed SDK's types describe, and the webhook endpoint's version in the dashboard.
const STRIPE_API_VERSION = '2026-09-30.endive';

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
}
