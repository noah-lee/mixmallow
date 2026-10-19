import { type Database, type SelectUser, users } from '@repo/db';
import { type AuthProvider, authProviderSchema } from '@repo/shared/schemas';
import { eq } from 'drizzle-orm';

export type SignInIdentity = {
  provider: AuthProvider;
  providerId: string;
  email: string;
  name: string | null;
  picture: string | null;
};

export type SignInResult =
  | { user: SelectUser }
  | { error: 'email_in_use'; existingProvider: AuthProvider | undefined };

function isUniqueViolation(err: unknown, constraint: string): boolean {
  // postgres.js PostgresError; newer drizzle versions wrap it in `cause`.
  for (let e = err; e instanceof Error; e = e.cause) {
    const pg = e as { code?: unknown; constraint_name?: unknown };
    if (pg.code === '23505' && pg.constraint_name === constraint) return true;
  }
  return false;
}

// Creates the user on first sign-in and refreshes their profile on later ones.
// Only call this with an email the provider has verified.
export async function upsertUserFromSignIn(
  db: Database,
  identity: SignInIdentity,
): Promise<SignInResult> {
  const profile = {
    email: identity.email,
    name: identity.name,
    picture: identity.picture,
  };
  try {
    const [user] = await db
      .insert(users)
      .values({
        ...profile,
        authProvider: identity.provider,
        authProviderId: identity.providerId,
      })
      .onConflictDoUpdate({
        target: [users.authProvider, users.authProviderId],
        set: { ...profile, updatedAt: new Date() },
      })
      .returning();
    if (!user) throw new Error('user upsert returned no row');
    return { user };
  } catch (err) {
    // The email belongs to another user: one who signed up through a different provider,
    // or a different account at the same provider (e.g. a deleted and recreated Workspace
    // account). Linking either would be an account takeover.
    if (!isUniqueViolation(err, 'users_email_unique')) throw err;
    const [existing] = await db
      .select({ authProvider: users.authProvider })
      .from(users)
      .where(eq(users.email, identity.email));
    const parsed = authProviderSchema.safeParse(existing?.authProvider);
    return {
      error: 'email_in_use',
      existingProvider: parsed.success ? parsed.data : undefined,
    };
  }
}
