import { describe, expect, it } from 'vitest';
import { envSchema } from '../src/config.ts';
import { TEST_ENV } from './helpers/config.ts';

const base = { ...TEST_ENV, DATABASE_URL: 'postgres://u:p@localhost/db_test' };

function issuePaths(env: Record<string, unknown>) {
  const result = envSchema.safeParse(env);
  return result.success ? [] : result.error.issues.map((i) => i.path[0]);
}

describe('storage config', () => {
  it('accepts a complete S3 config', () => {
    expect(issuePaths(base)).toEqual([]);
  });

  it('requires every S3 variable', () => {
    const {
      S3_ENDPOINT,
      S3_BUCKET,
      S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY,
      ...rest
    } = base;
    expect(issuePaths(rest)).toEqual([
      'S3_ENDPOINT',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ]);
  });
});
