import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.ts';
import type { Config } from '../../src/config.ts';
import { createTestConfig } from './config.ts';

// The real app against the test database. Not yet `ready()`, so a test can still add
// routes; `app.inject()` readies it. Close it in afterAll to release the DB pool.
export function createTestApp(
  overrides: Partial<Config> = {},
): Promise<FastifyInstance> {
  return buildApp(createTestConfig(overrides));
}
