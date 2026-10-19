import { z } from 'zod';

// Each value is an api route segment (`/api/auth/<provider>/start`) and the value of
// `users.auth_provider`.
export const authProviderSchema = z.enum(['google']);

export type AuthProvider = z.infer<typeof authProviderSchema>;

export const meResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().nullable(),
  picture: z.url().nullable(),
  isPremium: z.boolean(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

export const subscriptionStatusSchema = z.enum([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
]);

export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const subscriptionResponseSchema = z.object({
  status: subscriptionStatusSchema,
  currentPeriodEnd: z.iso.datetime(),
  cancelAtPeriodEnd: z.boolean(),
});

export type SubscriptionResponse = z.infer<typeof subscriptionResponseSchema>;

export const checkoutResponseSchema = z.object({
  url: z.url(),
});

export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
