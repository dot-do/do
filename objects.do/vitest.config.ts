import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

/**
 * Vitest Configuration for objects.do
 *
 * Uses @cloudflare/vitest-pool-workers to run tests in Cloudflare Workers
 * environment with real bindings (worker_loaders, R2, DurableObjects).
 *
 * Note: We use unique DO names per test instead of isolated storage
 * because DO writes to storage during fetch (to persist DO name).
 */
export default defineWorkersConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**'],
    globals: true,
    poolOptions: {
      workers: {
        isolatedStorage: false, // Use unique IDs per test instead
        singleWorker: true,
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          compatibilityDate: '2024-12-01',
          compatibilityFlags: ['nodejs_compat'],
        },
      },
    },
  },
})
