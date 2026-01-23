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
      },
    },

    // Test file patterns - only workers-specific tests
    include: [
      '**/*.workers.test.ts',
      '**/*.workers.spec.ts',
    ],

    // Exclude other tests
    exclude: ['**/*.e2e.test.ts', '**/*.e2e.spec.ts', 'node_modules/**', 'proxy/**', 'tail/**'],

    // Type checking
    typecheck: {
      enabled: true,
    },
  },
})
