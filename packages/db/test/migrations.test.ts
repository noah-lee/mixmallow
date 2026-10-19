import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import {
  MIGRATIONS_FOLDER,
  resetAndMigrate,
  testDatabaseUrl,
} from './helpers.ts';

const url = testDatabaseUrl();
const sql = postgres(url, { max: 1, onnotice: () => {} });

afterAll(async () => {
  await sql.end();
});

describe('migrations', () => {
  it('apply cleanly to an empty database', async () => {
    await resetAndMigrate(url);

    const tables = await sql<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    expect(tables.map((t) => t.tablename)).toEqual([
      'stripe_customers',
      'stripe_events',
      'stripe_subscriptions',
      'users',
    ]);

    const [applied] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
    expect(applied?.count).toBe(
      readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER }).length,
    );
  });
});
