import { resetAndMigrate } from '@repo/db/testing';

// Once per run: rebuild the schema from the committed migrations, so tests always see
// exactly what `pnpm db:migrate` would produce.
export default async function setup() {
  await resetAndMigrate();
}
