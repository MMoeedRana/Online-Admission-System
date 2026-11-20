import { defineConfig } from 'vitest/config';

/** Performance checks of Table 5.1 (`npm run test:perf`); kept out of the normal test run. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/perf/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 600000,
    hookTimeout: 120000,
  },
});
