import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.ts';
import type { Config } from '../../src/config.ts';
import { createTestConfig } from './config.ts';
import { createMemoryDriver, type MemoryDriver } from './memory-storage.ts';

const drivers = new WeakMap<FastifyInstance, MemoryDriver>();

// The real app against the test database, with an in-memory bucket. Not yet `ready()`, so
// a test can still add routes; `app.inject()` readies it. Close it in afterAll to release
// the DB pool.
export async function createTestApp(
  overrides: Partial<Config> = {},
): Promise<FastifyInstance> {
  const driver = createMemoryDriver();
  const app = await buildApp(createTestConfig(overrides), {
    storageDriver: driver,
  });
  drivers.set(app, driver);
  return app;
}

export function memoryStorage(app: FastifyInstance): MemoryDriver {
  const driver = drivers.get(app);
  if (!driver) throw new Error('app was not built by createTestApp');
  return driver;
}
