import { defineConfig } from 'vitest/config'

/**
 * Vitest Configuration for DO (Digital Object) Project
 *
 * This config provides:
 * - TypeScript support
 * - Test patterns for src test directories
 * - Coverage thresholds (80%)
 * - Global test setup
 *
 * For Cloudflare Workers runtime tests, use:
 *   pnpm test:workers (vitest --config vitest.workers.config.ts)
 */
export default defineConfig({
  test: {
    // Test file patterns - test files alongside source
    include: [
      '**/*.test.ts',
      '**/*.spec.ts',
    ],

    // E2E tests run in Node (separate config)
    exclude: ['**/*.e2e.test.ts', '**/*.e2e.spec.ts', 'node_modules/**', 'site/**', 'proxy/**', 'tail/**'],

    // Global test setup
    setupFiles: ['./tests/utils/setup.ts'],

    // Node environment for unit tests (mocked Workers APIs)
    environment: 'node',

    // Globals (describe, it, expect, etc.)
    globals: true,

    // Type checking
    typecheck: {
      enabled: true,
    },

    // Coverage configuration
    coverage: {
      enabled: false, // Disable by default, enable with --coverage flag
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './tests/coverage',
      include: ['**/*.ts'],
      exclude: [
        'tests/**',
        'proxy/**',
        'tail/**',
        'node_modules/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
      // Coverage thresholds (80%)
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
