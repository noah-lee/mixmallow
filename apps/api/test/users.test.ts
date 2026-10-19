import { createDb, users } from '@repo/db';
import { testDatabaseUrl } from '@repo/db/testing';
import { afterAll, describe, expect, it } from 'vitest';
import {
  type SignInIdentity,
  upsertUserFromSignIn,
} from '../src/auth/users.ts';

const db = createDb(testDatabaseUrl());
afterAll(() => db.$client.end());

const identity: SignInIdentity = {
  provider: 'google',
  providerId: 'sub-1',
  email: 'ada@example.com',
  name: 'Ada',
  picture: null,
};

describe('upsertUserFromSignIn', () => {
  it('creates the user on first sign-in', async () => {
    const result = await upsertUserFromSignIn(db, identity);
    expect(result).toMatchObject({
      user: { email: 'ada@example.com', authProviderId: 'sub-1' },
    });
  });

  it('refreshes profile fields on a later sign-in without a duplicate', async () => {
    const first = await upsertUserFromSignIn(db, identity);
    const second = await upsertUserFromSignIn(db, {
      ...identity,
      email: 'ada@new.example.com',
      name: 'Ada L.',
      picture: 'https://example.com/ada.png',
    });
    if (!('user' in first) || !('user' in second))
      throw new Error('expected users');
    expect(second.user.id).toBe(first.user.id);
    expect(second.user.sessionId).toBe(first.user.sessionId);
    expect(second.user).toMatchObject({
      email: 'ada@new.example.com',
      name: 'Ada L.',
      picture: 'https://example.com/ada.png',
    });
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it('refuses the same email under a different provider id', async () => {
    await upsertUserFromSignIn(db, identity);
    const result = await upsertUserFromSignIn(db, {
      ...identity,
      providerId: 'sub-2',
    });
    expect(result).toEqual({
      error: 'email_in_use',
      existingProvider: 'google',
    });
    expect(await db.select().from(users)).toHaveLength(1);
  });
});
