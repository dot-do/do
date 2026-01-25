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
 *
 * IMPORTANT: Memory management settings are critical!
 * Without concurrency limits, vitest can consume 100GB+ of memory
 * when running tests across a large codebase. The settings below
 * prevent memory exhaustion by limiting parallel execution.
 */
export default defineConfig({
  test: {
    // Test file patterns - test files alongside source
    include: ['**/*.test.ts', '**/*.spec.ts'],

    // E2E tests and workers tests run in separate configs
    exclude: ['**/*.e2e.test.ts', '**/*.e2e.spec.ts', '**/*.workers.test.ts', 'node_modules/**', 'site/**', 'proxy/**', 'tail/**'],

    // Global test setup
    setupFiles: ['./tests/utils/setup.ts'],

    // Node environment for unit tests (mocked Workers APIs)
    environment: 'node',

    // Globals (describe, it, expect, etc.)
    globals: true,

    // =========================================================================
    // MEMORY MANAGEMENT: Critical settings to prevent memory exhaustion
    // Without these limits, vitest consumed 100GB+ of memory on this codebase.
    // =========================================================================

    // Use threads pool (more memory-efficient than vmThreads)
    pool: 'threads',

    // Limit concurrent tests within a single file
    maxConcurrency: 5,

    // Limit worker threads to prevent memory explosion
    poolOptions: {
      threads: {
        // Limit thread count - prevents spawning too many workers
        maxThreads: 4,
        minThreads: 1,
        // Isolate tests to prevent memory leaks between test files
        isolate: true,
      },
    },

    // Disable file parallelism for heavy test suites
    // This runs test files sequentially while allowing concurrent tests within each file
    fileParallelism: false,

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
      exclude: ['tests/**', 'proxy/**', 'tail/**', 'node_modules/**', '**/*.d.ts', '**/*.test.ts', '**/*.spec.ts'],
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
