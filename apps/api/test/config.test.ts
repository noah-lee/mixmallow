import { describe, expect, it } from 'vitest';
import { envSchema } from '../src/config.ts';
import { TEST_ENV } from './helpers/config.ts';

const base = { ...TEST_ENV, DATABASE_URL: 'postgres://u:p@localhost/db_test' };

const s3 = {
  STORAGE_DRIVER: 's3',
  S3_ENDPOINT: 'https://ams3.digitaloceanspaces.com',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
};

function issuePaths(env: Record<string, unknown>) {
  const result = envSchema.safeParse(env);
  return result.success ? [] : result.error.issues.map((i) => i.path[0]);
}

describe('storage config', () => {
  it('accepts the local driver outside production', () => {
    expect(issuePaths(base)).toEqual([]);
  });

  it('accepts a complete s3 config', () => {
    expect(issuePaths({ ...base, ...s3 })).toEqual([]);
  });

  it('requires every S3 variable for the s3 driver', () => {
    expect(issuePaths({ ...base, STORAGE_DRIVER: 's3' })).toEqual([
      'S3_ENDPOINT',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ]);
  });

  it('refuses the local driver in production', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://app.example.com',
    };
    expect(issuePaths(prod)).toEqual(['STORAGE_DRIVER']);
    expect(issuePaths({ ...prod, ...s3 })).toEqual([]);
  });
});
