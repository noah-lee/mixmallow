import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const migrationsFolder = path.resolve(import.meta.dirname, '../migrations');

const client = postgres(databaseUrl, { max: 1 });
await migrate(drizzle(client), { migrationsFolder });
await client.end();
