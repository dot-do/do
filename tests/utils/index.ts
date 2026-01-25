/**
 * Test Utilities for DO (Digital Object) Project
 *
 * Re-exports test utilities and fixtures.
 *
 * IMPORTANT: No mocks! Per CLAUDE.md NO MOCKS policy:
 * - Workers tests use real miniflare via vitest.workers.config.ts
 * - Node tests use inline mock helpers where absolutely necessary
 *
 * @see tests/storage.workers.test.ts for real environment testing pattern
 */

// Setup utilities
export { waitFor, createDeferred, sleep } from './setup'

// Fixtures (test data, not mocks)
export {
  // Sample data
  fixtures,
  metadataFixtures,
  cdcFixtures,
  rpcFixtures,
  storageFixtures,
  websocketFixtures,
  // Factory functions
  generateId,
  resetIdCounter,
  createIdentity,
  createDOHierarchy,
  createCDCEventBatch,
  createTestUsers,
} from './fixtures'
