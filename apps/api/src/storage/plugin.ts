import fp from 'fastify-plugin';
import type { Storage, StorageDriver } from './driver.ts';
import { createS3Driver } from './s3.ts';

declare module 'fastify' {
  interface FastifyInstance {
    storage: Storage;
  }
}

export const storagePlugin = fp<{ driver?: StorageDriver }>(
  async (app, opts) => {
    const driver = opts.driver ?? createS3Driver(app.config);

    app.decorate('storage', {
      presignPut: (input) => driver.presignPut(input),
      presignGet: (key) => driver.presignGet(key),
      headSize: (key) => driver.headSize(key),
      download: (key, filePath, signal) =>
        driver.download(key, filePath, signal),
      upload: (input) => driver.upload(input),
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
  },
);
