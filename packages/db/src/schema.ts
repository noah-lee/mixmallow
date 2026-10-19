import {
  boolean,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// Every timestamp is precision 3 (milliseconds), matching a JS Date, so values
// round-trip exactly (e.g. for a timestamp-based pagination cursor).

// One sign-in method per user: the provider that created the account, and that
// provider's stable user id (e.g. the OIDC `sub`). Signing in through a different
// provider with an email that's already taken is refused, not linked.
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    authProvider: text('auth_provider').notNull(),
    authProviderId: text('auth_provider_id').notNull(),
    name: text('name'),
    picture: text('picture'),
    sessionId: uuid('session_id').defaultRandom().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('users_auth_provider_account_unique').on(
      t.authProvider,
      t.authProviderId,
    ),
  ],
);

export const stripeCustomers = pgTable('stripe_customers', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
    .defaultNow()
    .notNull(),
});

export const stripeSubscriptions = pgTable('stripe_subscriptions', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  status: text('status').notNull(),
  currentPeriodEnd: timestamp('current_period_end', {
    withTimezone: true,
    precision: 3,
  }).notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const stripeEvents = pgTable('stripe_events', {
  stripeEventId: text('stripe_event_id').primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true, precision: 3 })
    .defaultNow()
    .notNull(),
});

export type SelectUser = typeof users.$inferSelect;
