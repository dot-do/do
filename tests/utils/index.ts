/**
 * Test Utilities for DO (Digital Object) Project
 *
 * Re-exports all test utilities, mocks, and fixtures.
 */

// Setup utilities
export { waitFor, createDeferred, sleep } from './setup'

// Mocks
export {
  // DurableObject mocks
  createMockDurableObjectStorage,
  createMockDurableObjectState,
  createMockDurableObjectNamespace,
  createMockDurableObjectStub,
  // WebSocket mocks
  createMockWebSocket,
  // Identity mocks
  createMockDOIdentity,
  // CDC mocks
  createMockCDCEvent,
  createMockCDCCursor,
  createMockCDCBatch,
  // RPC mocks
  createMockRPCRequest,
  createMockRPCResponse,
  // Environment mocks
  createMockEnv,
  createMockKVNamespace,
  createMockR2Bucket,
  createMockAI,
  // Types
  type MockEnv,
} from './mocks'

// Fixtures
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
