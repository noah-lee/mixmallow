import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resetAndMigrate } from '@repo/db/testing';
import { createTestApp } from '../apps/api/test/helpers/app.ts';
import { E2E_USER, STORAGE_STATE } from './support/env.ts';
import { signedInUser } from './support/session.ts';

// Signs in without Google: a fresh database, one user, and that user's real auth cookies
// saved as Playwright storageState. The OAuth flow itself is covered by the api tests.
export default async function globalSetup() {
  await resetAndMigrate();
  const app = await createTestApp();
  try {
    const { cookies } = await signedInUser(app, E2E_USER);
    mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
    writeFileSync(
      STORAGE_STATE,
      JSON.stringify({ cookies, origins: [] }, null, 2),
    );
  } finally {
    await app.close();
  }
}
