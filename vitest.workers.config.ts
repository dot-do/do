import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

/**
 * Vitest Configuration for Cloudflare Workers Runtime Tests
 *
 * This config runs tests in the actual Workers runtime using miniflare.
 * Use this for integration tests that need actual Workers APIs.
 *
 * Usage:
 *   CLOUDFLARE_ACCOUNT_ID=xxx pnpm test:workers
 *
 * OR set account_id in proxy/wrangler.jsonc
 *
 * IMPORTANT: Memory management settings are critical!
 * Without concurrency limits, vitest can consume 100GB+ of memory.
 * Workers tests are especially memory-heavy due to miniflare overhead.
 */
export default defineWorkersConfig({
  test: {
    // Workers tests run in Cloudflare Workers runtime
    poolOptions: {
      workers: {
        wrangler: { configPath: './proxy/wrangler.jsonc' },
        miniflare: {
          compatibilityDate: '2026-01-20',
          compatibilityFlags: ['nodejs_compat'],
        },
        // Limit worker instances to prevent memory exhaustion
        // Each miniflare instance consumes significant memory
        maxWorkers: 2,
        minWorkers: 1,
        isolatedStorage: true,
      },
    },

    // Test file patterns - only workers-specific tests
    include: ['**/*.workers.test.ts', '**/*.workers.spec.ts'],

    // Exclude other tests
    exclude: ['**/*.e2e.test.ts', '**/*.e2e.spec.ts', 'node_modules/**', 'proxy/**', 'tail/**'],

    // =========================================================================
    // MEMORY MANAGEMENT: Critical settings to prevent memory exhaustion
    // Workers tests with miniflare are memory-intensive. Limit concurrency.
    // =========================================================================

    // Limit concurrent tests within a single file
    maxConcurrency: 3,

    // Run test files sequentially - miniflare instances are memory-heavy
    fileParallelism: false,

    // Type checking
    typecheck: {
      enabled: true,
    },
  },
})
