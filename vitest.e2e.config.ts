import { defineConfig } from 'vitest/config'

/**
 * E2E test configuration
 *
 * E2E tests run in Node and connect to live DOs/Workers deployed on Cloudflare
 * using the CapnWeb RPC WebSocket client.
 *
 * Usage: pnpm test:e2e
 *
 * IMPORTANT: Memory management settings are critical!
 * E2E tests use singleFork to run sequentially, which helps with:
 * 1. Memory management (only one test process at a time)
 * 2. Avoiding rate limits on external services
 * 3. Deterministic test ordering for debugging
 */
export default defineConfig({
  test: {
    // E2E tests only
    include: ['**/*.e2e.{test,spec}.{ts,tsx}'],

    // Standard Node environment for WebSocket connections
    environment: 'node',

    // Longer timeouts for network requests to live services
    testTimeout: 30000,
    hookTimeout: 30000,

    // =========================================================================
    // MEMORY MANAGEMENT: E2E tests run sequentially
    // This prevents memory exhaustion and avoids rate limits on live services.
    // =========================================================================

    // Run e2e tests sequentially to avoid rate limits and memory issues
    pool: 'forks',
    poolOptions: {
      forks: {
        // Single fork ensures sequential execution and minimal memory usage
        singleFork: true,
        // Limit forks as an additional safety measure
        maxForks: 1,
        minForks: 1,
      },
    },

    // Limit concurrent tests within a file (extra safety)
    maxConcurrency: 1,

    // Disable file parallelism - E2E tests should run one at a time
    fileParallelism: false,
  },
})
