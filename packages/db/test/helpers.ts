import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Test-only helpers, exported as `@repo/db/testing`. Nothing in src/ imports this, so it
// never reaches the production bundle.

export const MIGRATIONS_FOLDER = path.resolve(
  import.meta.dirname,
  '../migrations',
);

const ROOT_ENV_FILE = path.resolve(import.meta.dirname, '../../../.env');

// TEST_DATABASE_URL from the environment, else from the repo-root .env. Only that one
// variable is read from .env, so tests never pick up real secrets or DATABASE_URL.
export function testDatabaseUrl(): string {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    try {
      url = parseEnv(readFileSync(ROOT_ENV_FILE, 'utf8')).TEST_DATABASE_URL;
    } catch {
      // No .env: fall through to the error below.
    }
  }
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set (env or repo-root .env). See README "Testing".',
    );
  }
  // Tests drop and truncate everything: refuse anything that isn't clearly a test database.
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against database "${dbName}": TEST_DATABASE_URL must name a database ending in _test.`,
    );
  }
  return url;
}

function testClient(url: string) {
  return postgres(url, { max: 1, onnotice: () => {} });
}

// Drops every table (and drizzle's migration journal), then applies the committed migrations.
export async function resetAndMigrate(url = testDatabaseUrl()): Promise<void> {
  const client = testClient(url);
  try {
    await client.unsafe(
      'DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;',
    );
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
}

// Empties every table in `public`, so new tables are covered without listing them here.
export async function truncateAll(url = testDatabaseUrl()): Promise<void> {
  const client = testClient(url);
  try {
    const tables = await client<{ name: string }[]>`
      SELECT quote_ident(tablename) AS name FROM pg_tables WHERE schemaname = 'public'`;
    if (tables.length === 0) return;
    await client.unsafe(
      `TRUNCATE ${tables.map((t) => t.name).join(', ')} RESTART IDENTITY CASCADE`,
    );
  } finally {
    await client.end();
  }
}
