import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  try {
    // Resolve from cwd, not import.meta.dirname: drizzle-kit bundles this config
    // to a temp file before running it, so import.meta.dirname is unreliable here.
    // drizzle-kit runs with cwd at the package root (packages/db).
    const envPath = resolve(process.cwd(), '../../.env');
    Object.assign(process.env, parseEnv(readFileSync(envPath, 'utf8')));
  } catch {
    // .env not present — rely on the environment
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
});
