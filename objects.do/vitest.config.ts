import { defineConfig } from 'vitest/config'

/**
 * Vitest Configuration for objects.do
 *
 * This config runs unit tests in node environment.
 * Tests validate the GenericDO universal runtime implementation.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**'],
    environment: 'node',
    globals: true,
    pool: 'threads',
    maxConcurrency: 5,
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1,
        isolate: true,
      },
    },
    fileParallelism: false,
    typecheck: {
      enabled: true,
    },
  },
})
