import { defineConfig } from 'vitest/config'

/**
 * E2E test configuration
 *
 * E2E tests run in Node and connect to live DOs/Workers deployed on Cloudflare
 * using the CapnWeb RPC WebSocket client.
 *
 * Usage: pnpm test:e2e
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

    // Run e2e tests sequentially to avoid rate limits
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})
