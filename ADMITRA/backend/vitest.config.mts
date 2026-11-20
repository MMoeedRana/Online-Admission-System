import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Tests never use the assistant settings of a local .env file.
    env: { AI_PROVIDER: 'gemini', AI_API_KEY: '', AI_MODEL: '' },
    exclude: ['**/node_modules/**', 'tests/perf/**'],
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
