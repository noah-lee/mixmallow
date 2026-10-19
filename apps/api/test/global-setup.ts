import { rm } from 'node:fs/promises';
import { resetAndMigrate } from '@repo/db/testing';
import { TEST_ENV } from './helpers/config.ts';

// Once per run: rebuild the schema from the committed migrations, so tests always see
// exactly what `pnpm db:migrate` would produce, and drop objects left by the last run.
export default async function setup() {
  await resetAndMigrate();
  await rm(TEST_ENV.STORAGE_LOCAL_DIR, { recursive: true, force: true });
}
