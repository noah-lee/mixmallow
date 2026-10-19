import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup.ts'],
    // Every file shares the one test database, which setup.ts truncates before each test.
    fileParallelism: false,
    unstubGlobals: true,
    restoreMocks: true,
  },
});
