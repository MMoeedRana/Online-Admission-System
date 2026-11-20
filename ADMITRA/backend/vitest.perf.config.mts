import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { AI_PROVIDER: 'gemini', AI_API_KEY: '', AI_MODEL: '', STORAGE_DRIVER: 'local' },
    include: ['tests/perf/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 600000,
    hookTimeout: 120000,
  },
});
