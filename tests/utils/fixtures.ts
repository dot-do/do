/**
 * Test Fixtures for DO (Digital Object) Testing
 *
 * Provides reusable test data and fixture factories.
 */

import type {
  DigitalObjectIdentity,
  DigitalObjectRef,
  DOType,
  DOMetadata,
} from '../../types/identity'
import type {
  CDCEvent,
  CDCCursor,
  CDCBatch,
  CDCOperation,
  Snapshot,
  StorageTier,
} from '../../types/storage'
import type {
  RPCRequest,
  RPCResponse,
  RPCError,
  DOStats,
  WebSocketState,
} from '../../types/rpc'

// =============================================================================
// Identity Fixtures
// =============================================================================

/**
 * Sample DO identities for testing
 */
export const fixtures = {
  // Business DOs
  business: {
    $id: 'https://startups.studio',
    $type: 'Business',
    $version: 1,
    $createdAt: 1705968000000, // 2024-01-23
    $updatedAt: 1705968000000,
  } as DigitalObjectIdentity,

  startup: {
    $id: 'https://headless.ly',
    $type: 'Startup',
    $context: 'https://startups.studio',
    $version: 3,
    $createdAt: 1705968000000,
    $updatedAt: 1706054400000,
  } as DigitalObjectIdentity,

  saas: {
    $id: 'https://crm.headless.ly',
    $type: 'SaaS',
    $context: 'https://headless.ly',
    $version: 5,
    $createdAt: 1705968000000,
    $updatedAt: 1706140800000,
  } as DigitalObjectIdentity,

  tenant: {
    $id: 'https://crm.headless.ly/acme',
    $type: 'Tenant',
    $context: 'https://crm.headless.ly',
    $version: 12,
    $createdAt: 1705968000000,
    $updatedAt: 1706227200000,
  } as DigitalObjectIdentity,

  // Content DOs
  site: {
    $id: 'https://docs.headless.ly',
    $type: 'Site',
    $context: 'https://headless.ly',
    $version: 8,
    $createdAt: 1705968000000,
    $updatedAt: 1706313600000,
  } as DigitalObjectIdentity,

  // Agent DOs
  agent: {
    $id: 'https://agents.do/sales-agent',
    $type: 'https://schema.org.ai/Agent',
    $version: 2,
    $createdAt: 1705968000000,
    $updatedAt: 1706400000000,
  } as DigitalObjectIdentity,
}

/**
 * Sample DO metadata
 */
export const metadataFixtures: Record<string, DOMetadata> = {
  business: {
    name: 'Startups Studio',
    description: 'AI-powered startup generation platform',
    tags: ['startup', 'ai', 'platform'],
    labels: { tier: 'enterprise', region: 'global' },
  },
  startup: {
    name: 'Headless.ly',
    description: 'Headless CMS platform for developers',
    tags: ['cms', 'headless', 'api-first'],
    labels: { stage: 'series-a', vertical: 'developer-tools' },
  },
}

// =============================================================================
// CDC Fixtures
// =============================================================================

/**
 * Sample CDC events
 */
export const cdcFixtures = {
  insertEvent: {
    id: 'evt-001',
    operation: 'INSERT' as CDCOperation,
    collection: 'users',
    documentId: 'user-123',
    timestamp: Date.now(),
    sequence: 1,
    after: { id: 'user-123', name: 'Alice', email: 'alice@example.com' },
  } as CDCEvent,

  updateEvent: {
    id: 'evt-002',
    operation: 'UPDATE' as CDCOperation,
    collection: 'users',
    documentId: 'user-123',
    timestamp: Date.now(),
    sequence: 2,
    before: { id: 'user-123', name: 'Alice', email: 'alice@example.com' },
    after: { id: 'user-123', name: 'Alice Smith', email: 'alice@example.com' },
    changedFields: ['name'],
  } as CDCEvent,

  deleteEvent: {
    id: 'evt-003',
    operation: 'DELETE' as CDCOperation,
    collection: 'users',
    documentId: 'user-456',
    timestamp: Date.now(),
    sequence: 3,
    before: { id: 'user-456', name: 'Bob', email: 'bob@example.com' },
  } as CDCEvent,

  cursor: {
    sequence: 100,
    timestamp: Date.now(),
  } as CDCCursor,

  batch: {
    events: [],
    cursor: { sequence: 100, timestamp: Date.now() },
    hasMore: false,
  } as CDCBatch,
}

// =============================================================================
// RPC Fixtures
// =============================================================================

/**
 * Sample RPC requests and responses
 */
export const rpcFixtures = {
  pingRequest: {
    id: 'req-001',
    method: 'do.system.ping',
  } as RPCRequest,

  pingResponse: {
    id: 'req-001',
    result: { pong: true, timestamp: Date.now() },
  } as RPCResponse,

  errorResponse: {
    id: 'req-002',
    error: {
      code: -32601,
      message: 'Method not found',
    } as RPCError,
  } as RPCResponse,

  statsResponse: {
    id: 'req-003',
    result: {
      identity: fixtures.startup,
      storage: {
        usedBytes: 1024000,
        tableCount: 5,
        rowCount: 1500,
      },
      connections: {
        active: 3,
        hibernating: 12,
      },
      cdc: {
        sequence: 100,
        pendingEvents: 5,
        subscribers: 2,
      },
      uptime: 86400000,
      lastActivity: Date.now(),
    } as DOStats,
  } as RPCResponse<DOStats>,
}

// =============================================================================
// Storage Fixtures
// =============================================================================

/**
 * Sample snapshot data
 */
export const storageFixtures = {
  snapshot: {
    id: 'snap-001',
    doId: 'https://crm.headless.ly/acme',
    doType: 'Tenant',
    timestamp: Date.now(),
    version: 12,
    tables: {
      users: [
        { id: 'user-1', name: 'Alice', role: 'admin' },
        { id: 'user-2', name: 'Bob', role: 'user' },
      ],
      projects: [
        { id: 'proj-1', name: 'Website Redesign', status: 'active' },
      ],
    },
    metadata: {
      sizeBytes: 4096,
      rowCount: 3,
      type: 'Full' as const,
    },
  } satisfies Snapshot,

  tiers: ['Hot', 'Warm', 'Cold'] satisfies StorageTier[],
}

// =============================================================================
// WebSocket Fixtures
// =============================================================================

/**
 * Sample WebSocket states
 */
export const websocketFixtures = {
  activeConnection: {
    id: 'ws-001',
    status: 'Open',
    connectedAt: Date.now() - 60000,
    lastMessageAt: Date.now() - 5000,
    subscriptions: ['do.cdc.users', 'do.events.orders'],
    data: { userId: 'user-123', role: 'admin' },
  } satisfies WebSocketState,

  hibernatingConnection: {
    id: 'ws-002',
    status: 'Hibernating',
    connectedAt: Date.now() - 3600000,
    hibernatedAt: Date.now() - 1800000,
    lastMessageAt: Date.now() - 1800000,
    subscriptions: ['do.cdc.users'],
    data: { userId: 'user-456' },
  } satisfies WebSocketState,
}

// =============================================================================
// Factory Functions
// =============================================================================

let idCounter = 0

/**
 * Generate a unique ID for tests
 */
export function generateId(prefix = 'test'): string {
  return `${prefix}-${++idCounter}-${Date.now()}`
}

/**
 * Reset the ID counter (useful between tests)
 */
export function resetIdCounter(): void {
  idCounter = 0
}

/**
 * Create a DO identity with custom values
 */
export function createIdentity(
  overrides: Partial<DigitalObjectIdentity> = {}
): DigitalObjectIdentity {
  return {
    $id: `https://test-${generateId()}.example.com`,
    $type: 'Test',
    $version: 1,
    $createdAt: Date.now(),
    $updatedAt: Date.now(),
    ...overrides,
  }
}

/**
 * Create a hierarchy of DO identities for testing parent-child relationships
 */
export function createDOHierarchy(): {
  parent: DigitalObjectIdentity
  child: DigitalObjectIdentity
  grandchild: DigitalObjectIdentity
} {
  const parent = createIdentity({
    $id: 'https://parent.example.com',
    $type: 'Business',
  })

  const child = createIdentity({
    $id: 'https://child.parent.example.com',
    $type: 'Startup',
    $context: parent.$id,
  })

  const grandchild = createIdentity({
    $id: 'https://grandchild.child.parent.example.com',
    $type: 'SaaS',
    $context: child.$id,
  })

  return { parent, child, grandchild }
}

/**
 * Create a batch of CDC events
 */
export function createCDCEventBatch(
  count: number,
  options: {
    collection?: string
    operation?: CDCOperation
  } = {}
): CDCEvent[] {
  const { collection = 'items', operation = 'INSERT' } = options
  const startSequence = Date.now()

  return Array.from({ length: count }, (_, i) => ({
    id: generateId('evt'),
    operation,
    collection,
    documentId: generateId('doc'),
    timestamp: Date.now() + i,
    sequence: startSequence + i,
    after: operation !== 'DELETE' ? { id: generateId('item'), index: i } : undefined,
    before: operation !== 'INSERT' ? { id: generateId('item'), index: i } : undefined,
  }))
}

/**
 * Create test users for authentication/authorization tests
 */
export function createTestUsers() {
  return {
    admin: {
      id: 'user-admin',
      name: 'Admin User',
      email: 'admin@example.com',
      roles: ['admin', 'user'],
    },
    user: {
      id: 'user-regular',
      name: 'Regular User',
      email: 'user@example.com',
      roles: ['user'],
    },
    guest: {
      id: 'user-guest',
      name: 'Guest User',
      email: 'guest@example.com',
      roles: ['guest'],
    },
  }
}
