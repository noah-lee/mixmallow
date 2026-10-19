import {
  boolean,
  index,
  integer,
  jsonb,
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

const createdAt = () =>
  timestamp('created_at', { withTimezone: true, precision: 3 })
    .defaultNow()
    .notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, precision: 3 })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

// Every owned table carries user_id, so each query filters on the owner directly and a
// foreign id behaves exactly like a missing one.

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Version numbers are never reused, even after the newest track is deleted.
    nextVersion: integer('next_version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('projects_user_id_idx').on(t.userId)],
);

export const tracks = pgTable(
  'tracks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    name: text('name').notNull(),
    fileName: text('file_name').notNull(),
    format: text('format').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    durationMs: integer('duration_ms').notNull(),
    peaks: jsonb('peaks').$type<number[]>().notNull(),
    storageKey: text('storage_key').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('tracks_project_version_unique').on(t.projectId, t.version),
    unique('tracks_storage_key_unique').on(t.storageKey),
    index('tracks_user_id_idx').on(t.userId),
  ],
);

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    timestampMs: integer('timestamp_ms').notNull(),
    text: text('text').notNull(),
    done: boolean('done').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('notes_track_order_idx').on(t.trackId, t.timestampMs, t.createdAt),
    index('notes_user_id_idx').on(t.userId),
  ],
);

// A registered upload whose object may not exist yet. At most one per user: registering
// again replaces it. On complete, its storage key moves to the new track.
export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Null for a first upload, which creates the project on complete.
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    fileName: text('file_name').notNull(),
    format: text('format').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key').notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('uploads_user_id_unique').on(t.userId),
    unique('uploads_storage_key_unique').on(t.storageKey),
  ],
);

export type SelectUser = typeof users.$inferSelect;
export type SelectProject = typeof projects.$inferSelect;
export type SelectTrack = typeof tracks.$inferSelect;
export type SelectNote = typeof notes.$inferSelect;
export type SelectUpload = typeof uploads.$inferSelect;
