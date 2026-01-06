import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    // Memory and concurrency limits to prevent runaway resource usage
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Run all tests in a single fork to limit memory
      },
    },
    maxConcurrency: 1, // Run tests sequentially
    testTimeout: 10000, // 10s timeout per test
    hookTimeout: 10000,
    isolate: false, // Share context between tests to reduce memory
  },
})
