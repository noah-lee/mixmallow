import fp from 'fastify-plugin';
import type { Storage } from './driver.ts';
import { createLocalDriver } from './local.ts';
import { createS3Driver } from './s3.ts';

declare module 'fastify' {
  interface FastifyInstance {
    storage: Storage;
  }
}

// Registered on the root app; app.ts mounts `localStorageRoutes` inside the /api scope when
// the local driver is in use.
export const storagePlugin = fp(async (app) => {
  const driver =
    app.config.STORAGE_DRIVER === 's3'
      ? createS3Driver(app.config)
      : createLocalDriver(app.config);

  app.decorate('storage', {
    presignPut: (input) => driver.presignPut(input),
    presignGet: (key) => driver.presignGet(key),
    headSize: (key) => driver.headSize(key),
    async deleteMany(keys) {
      const results = await Promise.allSettled(
        keys.map((key) => driver.delete(key)),
      );
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          app.log.error(
            { err: result.reason, key: keys[i] },
            'storage delete failed; object orphaned',
          );
        }
      });
    },
  } satisfies Storage);
});
