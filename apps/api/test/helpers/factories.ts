import {
  type Database,
  type SelectUser,
  type Transaction,
  users,
} from '@repo/db';
import { authProviderSchema } from '@repo/shared/schemas';

// One factory per table: valid defaults, unique where the schema requires it, any field
// overridable. Add new ones here as `createX(db, overrides)`.

let seq = 0;
const nextSeq = () => ++seq;

export async function createUser(
  db: Database | Transaction,
  overrides: Partial<typeof users.$inferInsert> = {},
): Promise<SelectUser> {
  const n = nextSeq();
  const [user] = await db
    .insert(users)
    .values({
      email: `user${n}@example.com`,
      authProvider: authProviderSchema.enum.google,
      authProviderId: `google-sub-${n}`,
      name: `User ${n}`,
      ...overrides,
    })
    .returning();
  if (!user) throw new Error('createUser: insert returned no row');
  return user;
}
