import { truncateAll } from '@repo/db/testing';
import { beforeEach } from 'vitest';

beforeEach(async () => {
  await truncateAll();
});
