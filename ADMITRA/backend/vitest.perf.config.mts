import { defineConfig } from 'vitest/config';

/** Performance checks of Table 5.1 (`npm run test:perf`); kept out of the normal test run. */
export default defineConfig({
  test: {
    environment: 'node',
    // Tests never use the assistant settings of a local .env file.
    env: { AI_PROVIDER: 'gemini', AI_API_KEY: '', AI_MODEL: '' },
    include: ['tests/perf/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 600000,
    hookTimeout: 120000,
  },
});
