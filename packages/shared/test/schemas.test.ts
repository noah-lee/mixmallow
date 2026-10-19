import { describe, expect, it } from 'vitest';
import {
  authProviderSchema,
  meResponseSchema,
  subscriptionResponseSchema,
} from '../src/schemas.ts';

const validMe = {
  id: '3f0c8f4e-8f3c-4a8e-9f57-2b1d1c1a6e01',
  email: 'ada@example.com',
  name: 'Ada',
  picture: null,
  isPremium: false,
};

describe('meResponseSchema', () => {
  it('accepts a valid response', () => {
    expect(meResponseSchema.parse(validMe)).toEqual(validMe);
  });

  it.each([
    ['a non-uuid id', { id: 'not-a-uuid' }],
    ['an invalid email', { email: 'nope' }],
    ['a non-url picture', { picture: 'avatar.png' }],
    ['a missing isPremium', { isPremium: undefined }],
  ])('rejects %s', (_label, patch) => {
    expect(meResponseSchema.safeParse({ ...validMe, ...patch }).success).toBe(
      false,
    );
  });
});

describe('authProviderSchema', () => {
  it('accepts known providers only', () => {
    expect(authProviderSchema.safeParse('google').success).toBe(true);
    expect(authProviderSchema.safeParse('github').success).toBe(false);
  });
});

describe('subscriptionResponseSchema', () => {
  it('requires an ISO datetime and a known status', () => {
    const valid = {
      status: 'active',
      currentPeriodEnd: '2026-01-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
    };
    expect(subscriptionResponseSchema.safeParse(valid).success).toBe(true);
    expect(
      subscriptionResponseSchema.safeParse({
        ...valid,
        currentPeriodEnd: '2026-01-01',
      }).success,
    ).toBe(false);
    expect(
      subscriptionResponseSchema.safeParse({ ...valid, status: 'lapsed' })
        .success,
    ).toBe(false);
  });
});
