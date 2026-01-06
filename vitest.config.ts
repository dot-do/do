import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 10000,
    hookTimeout: 10000,
    // Run test files sequentially to prevent memory exhaustion
    fileParallelism: false,
    // Limit concurrent tests within each file
    maxConcurrency: 1,
    poolOptions: {
      workers: {
        singleWorker: true,
        // Disable isolated storage at the workers level
        // Required for Durable Objects with SQLite storage
        isolatedStorage: false,
        wrangler: { configPath: './wrangler.jsonc' },
      },
    },
  },
})
