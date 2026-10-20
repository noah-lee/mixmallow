import { testDatabaseUrl } from '@repo/db/testing';
import type { Config } from '../../src/config.ts';

// Dummy values of the right shape. The e2e api boots from TEST_ENV through the real
// loadConfig, so these must also pass its validation; tokens minted in tests and by the
// e2e server agree because both use these secrets.
export const TEST_ENV = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'fatal',
  APP_ORIGIN: 'http://localhost:5173',
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  ACCESS_TOKEN_SECRET: 'test-access-secret-0123456789abcdefghijklmnop',
  REFRESH_TOKEN_SECRET: 'test-refresh-secret-0123456789abcdefghijklmnop',
  COOKIE_SECRET: 'test-cookie-secret-0123456789abcdefghijklmnop',
  // Vitest swaps in the memory driver; the e2e api presigns against this offline.
  S3_ENDPOINT: 'https://storage.test',
  S3_BUCKET: 'test-bucket',
  S3_ACCESS_KEY_ID: 'test-access-key',
  S3_SECRET_ACCESS_KEY: 'test-secret-key',
} as const;

export function createTestConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...TEST_ENV,
    PORT: 0,
    HOST: '127.0.0.1',
    DATABASE_URL: testDatabaseUrl(),
    S3_REGION: 'us-east-1',
    isProd: false,
    ...overrides,
  };
}
