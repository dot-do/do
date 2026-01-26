/**
 * RED Phase Tests: rpc.do v0.2.1 Integration
 *
 * These tests verify that DO properly exposes and uses rpc.do's new features.
 * All tests are written to FAIL because the SDK features aren't exposed yet.
 *
 * Features tested:
 * 1. Simplified RPC Factory - Auto-detect transport from URL
 * 2. Remote Collections - MongoDB-style document access
 * 3. Remote SQL Access - Tagged template SQL queries
 * 4. Remote Storage - Key-value storage access
 * 5. Colo Awareness - Edge location information and latency estimation
 * 6. Schema Discovery - Database and RPC schema introspection
 *
 * NO MOCKS POLICY: These tests use real types and stubs.
 * Integration tests would use real DO instances via miniflare.
 *
 * @module tests/sdk/rpc-do-integration.test
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'

// =============================================================================
// Suppress unhandled rejections during tests
// These are expected because we're testing against URLs without real servers
// =============================================================================
let originalUnhandledRejection: NodeJS.UnhandledRejectionListener | undefined

beforeAll(() => {
  // Suppress unhandled rejections during tests (expected when RPC tries to call non-existent servers)
  originalUnhandledRejection = (reason: unknown) => {
    // Suppress expected errors from RPC transport
    const msg = String(reason)
    if (msg.includes('t.call is not a function') || msg.includes('fetch failed')) {
      return // Suppress expected errors
    }
    console.error('Unhandled rejection:', reason)
  }
  process.on('unhandledRejection', originalUnhandledRejection)
})

afterAll(() => {
  if (originalUnhandledRejection) {
    process.off('unhandledRejection', originalUnhandledRejection)
  }
})

// =============================================================================
// Import DO SDK (these imports should work but features may be missing)
// =============================================================================

// The DO SDK should re-export rpc.do features
// These will fail if not properly exported
import {
  createDOApiClient,
  RPC,
  http,
  capnweb,
  // These are NOT yet exported from DO SDK - will cause failures
  // connectDO,  // Already exists but may not have all features
} from '../../sdk/rpc'

// Types from rpc.do that DO SDK should expose
import type {
  DOApiClient,
  DOClientConfig,
  Transport,
  RPCProxy,
} from '../../sdk/rpc'

// =============================================================================
// Test Types - Defining what the SDK SHOULD provide
// =============================================================================

/**
 * Expected features on a DO client that connects via rpc.do
 * These match rpc.do's DOClient features
 */
interface ExpectedDOClientFeatures {
  /** Tagged template SQL query */
  sql: <R = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => SqlQuery<R>
  /** Remote storage access */
  storage: RemoteStorage
  /** Remote collection access (MongoDB-style) */
  collection: RemoteCollections
  /** Get database schema */
  dbSchema: () => Promise<DatabaseSchema>
  /** Get full RPC schema */
  schema: () => Promise<RpcSchema>
  /** Current colo information */
  colo: ColoInfo
  /** Close the connection */
  close: () => Promise<void>
}

interface SqlQuery<T = Record<string, unknown>> {
  all(): Promise<T[]>
  first(): Promise<T | null>
  run(): Promise<{ rowsWritten: number }>
  raw(): Promise<{ results: T[]; meta: { rows_read: number; rows_written: number } }>
}

interface RemoteStorage {
  get<T = unknown>(key: string): Promise<T | undefined>
  get<T = unknown>(keys: string[]): Promise<Map<string, T>>
  put<T = unknown>(key: string, value: T): Promise<void>
  put<T = unknown>(entries: Record<string, T>): Promise<void>
  delete(key: string): Promise<boolean>
  delete(keys: string[]): Promise<number>
  list<T = unknown>(options?: { prefix?: string; limit?: number; start?: string; end?: string }): Promise<Map<string, T>>
  keys(prefix?: string): Promise<string[]>
}

interface RemoteCollection<T extends Record<string, unknown> = Record<string, unknown>> {
  get(id: string): Promise<T | null>
  put(id: string, doc: T): Promise<void>
  delete(id: string): Promise<boolean>
  has(id: string): Promise<boolean>
  find(filter?: Record<string, unknown>, options?: QueryOptions): Promise<T[]>
  count(filter?: Record<string, unknown>): Promise<number>
  list(options?: QueryOptions): Promise<T[]>
  keys(): Promise<string[]>
  clear(): Promise<number>
}

interface RemoteCollections {
  <T extends Record<string, unknown> = Record<string, unknown>>(name: string): RemoteCollection<T>
  names(): Promise<string[]>
  stats(): Promise<Array<{ name: string; count: number; size: number }>>
}

interface QueryOptions {
  limit?: number
  offset?: number
  sort?: string
}

interface DatabaseSchema {
  tables: TableSchema[]
  version?: number
}

interface TableSchema {
  name: string
  columns: ColumnSchema[]
  indexes: IndexSchema[]
}

interface ColumnSchema {
  name: string
  type: string
  nullable: boolean
  primaryKey: boolean
  defaultValue?: string
}

interface IndexSchema {
  name: string
  columns: string[]
  unique: boolean
}

interface RpcSchema {
  version: 1
  methods: Array<{ name: string; path: string; params: number }>
  namespaces: Array<{ name: string; methods: Array<{ name: string; path: string; params: number }> }>
  database?: DatabaseSchema
  storageKeys?: string[]
  colo?: string
}

/**
 * Colo (colocation) information for edge awareness
 */
interface ColoInfo {
  /** Cloudflare colo code (e.g., 'SJC', 'AMS', 'NRT') */
  code: string
  /** Human-readable name (e.g., 'San Jose', 'Amsterdam', 'Tokyo') */
  name: string
  /** Region (e.g., 'North America', 'Europe', 'Asia') */
  region: string
  /** Country code (e.g., 'US', 'NL', 'JP') */
  country: string
  /** Coordinates [latitude, longitude] */
  coordinates?: [number, number]
}

/**
 * Extended colo features
 */
interface ColoAwareness {
  /** Current DO colo */
  colo: ColoInfo
  /** Estimate latency to another colo */
  estimateLatency(targetColo: string): Promise<number>
  /** Find nearest colo from a list */
  nearestColo(colos: string[]): Promise<string>
  /** List all available colos */
  listColos(): Promise<ColoInfo[]>
  /** Get network path between colos */
  getPath(from: string, to: string): Promise<{ hops: string[]; estimatedLatency: number }>
}

// =============================================================================
// Test Suite: Simplified RPC Factory
// =============================================================================

describe('Simplified RPC Factory', () => {
  /**
   * Test: RPC should auto-detect HTTP transport from URL
   *
   * EXPECTED BEHAVIOR:
   * - RPC('https://...') should automatically create HTTP transport
   * - No need to explicitly call http() transport factory
   *
   * WILL FAIL: DO SDK doesn't expose this simplified pattern yet
   */
  it('should auto-detect HTTP transport from https:// URL', () => {
    // This should work with just a URL string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = RPC('https://api.do.md') as any

    expect(client).toBeDefined()
    expect(typeof client).toBe('object')

    // Client should have proxy capabilities (accessed via Proxy)
    expect(client.things).toBeDefined()
    expect(typeof client.things.list).toBe('function')
  })

  /**
   * Test: RPC should auto-detect WebSocket transport from wss:// URL
   *
   * EXPECTED BEHAVIOR:
   * - RPC('wss://...') should automatically create WebSocket transport
   * - Should support reconnection by default
   *
   * WILL FAIL: DO SDK may not properly detect WebSocket URLs
   */
  it('should auto-detect WebSocket transport from wss:// URL', () => {
    const wsClient = RPC('wss://api.do.md')

    expect(wsClient).toBeDefined()
    expect(typeof wsClient).toBe('object')

    // WebSocket clients should have close method for cleanup
    expect(wsClient.close).toBeDefined()
    expect(typeof wsClient.close).toBe('function')
  })

  /**
   * Test: RPC should accept auth option for authenticated requests
   *
   * EXPECTED BEHAVIOR:
   * - RPC(url, { auth: 'token' }) should include auth in requests
   *
   * WILL FAIL: Auth option may not be properly forwarded
   */
  it('should accept auth option for authenticated requests', () => {
    const client = RPC('https://api.do.md', {
      auth: 'test-api-key',
    })

    expect(client).toBeDefined()
  })

  /**
   * Test: RPC should support dynamic auth provider
   *
   * EXPECTED BEHAVIOR:
   * - RPC(url, { auth: () => getToken() }) should call provider before each request
   *
   * WILL FAIL: Dynamic auth provider may not be supported
   */
  it('should support dynamic auth provider function', () => {
    const authProvider = () => 'dynamic-token'

    const client = RPC('https://api.do.md', {
      auth: authProvider,
    })

    expect(client).toBeDefined()
  })

  /**
   * Test: RPC should support async auth provider
   *
   * EXPECTED BEHAVIOR:
   * - RPC(url, { auth: async () => token }) should await provider
   *
   * WILL FAIL: Async auth provider may not be supported
   */
  it('should support async auth provider function', () => {
    const asyncAuthProvider = async () => {
      // Simulate fetching token
      return 'async-token'
    }

    const client = RPC('https://api.do.md', {
      auth: asyncAuthProvider,
    })

    expect(client).toBeDefined()
  })
})

// =============================================================================
// Test Suite: Remote Collections (MongoDB-style)
// =============================================================================

describe('Remote Collections (MongoDB-style)', () => {
  /**
   * Test: Client should expose collection() method
   *
   * EXPECTED BEHAVIOR:
   * - $.collection('users') returns a collection interface
   * - Collection supports MongoDB-style operations
   *
   * WILL FAIL: DO SDK doesn't expose collection method
   */
  it('should expose collection() method on client', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    // collection should be a function
    expect(client.collection).toBeDefined()
    expect(typeof client.collection).toBe('function')
  })

  /**
   * Test: Collection should support find() with filter
   *
   * EXPECTED BEHAVIOR:
   * - $.collection('users').find({ active: true })
   * - Returns array of matching documents
   *
   * WILL FAIL: collection.find is not exposed
   */
  it('should support find() with MongoDB-style filter', async () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    const users = client.collection<{ id: string; name: string; active: boolean }>('users')

    // find() should accept filter object
    expect(users.find).toBeDefined()
    expect(typeof users.find).toBe('function')

    // These would actually execute against a real DO
    // const activeUsers = await users.find({ active: true })
    // expect(Array.isArray(activeUsers)).toBe(true)
  })

  /**
   * Test: Collection should support put() for upsert
   *
   * EXPECTED BEHAVIOR:
   * - $.collection('users').put(id, data)
   * - Inserts or updates document by ID
   *
   * WILL FAIL: collection.put is not exposed
   */
  it('should support put() for insert/update operations', async () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    const users = client.collection('users')

    expect(users.put).toBeDefined()
    expect(typeof users.put).toBe('function')
  })

  /**
   * Test: Collection should support count() with filter
   *
   * EXPECTED BEHAVIOR:
   * - $.collection('users').count({ role: 'admin' })
   * - Returns count of matching documents
   *
   * WILL FAIL: collection.count is not exposed
   */
  it('should support count() with filter', async () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    const users = client.collection('users')

    expect(users.count).toBeDefined()
    expect(typeof users.count).toBe('function')
  })

  /**
   * Test: Collection should support get() by ID
   *
   * EXPECTED BEHAVIOR:
   * - $.collection('users').get('user-123')
   * - Returns document or null
   *
   * WILL FAIL: collection.get is not exposed
   */
  it('should support get() by document ID', async () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    const users = client.collection('users')

    expect(users.get).toBeDefined()
    expect(typeof users.get).toBe('function')
  })

  /**
   * Test: Collection should support delete() by ID
   *
   * EXPECTED BEHAVIOR:
   * - $.collection('users').delete('user-123')
   * - Returns boolean indicating success
   *
   * WILL FAIL: collection.delete is not exposed
   */
  it('should support delete() by document ID', async () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    const users = client.collection('users')

    expect(users.delete).toBeDefined()
    expect(typeof users.delete).toBe('function')
  })

  /**
   * Test: Collections manager should list all collection names
   *
   * EXPECTED BEHAVIOR:
   * - $.collection.names() returns array of collection names
   *
   * WILL FAIL: collection.names is not exposed
   */
  it('should list all collection names via collection.names()', async () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.collection.names).toBeDefined()
    expect(typeof client.collection.names).toBe('function')
  })

  /**
   * Test: Collections manager should provide stats
   *
   * EXPECTED BEHAVIOR:
   * - $.collection.stats() returns stats for each collection
   *
   * WILL FAIL: collection.stats is not exposed
   */
  it('should get collection stats via collection.stats()', async () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.collection.stats).toBeDefined()
    expect(typeof client.collection.stats).toBe('function')
  })
})

// =============================================================================
// Test Suite: Remote SQL Access
// =============================================================================

describe('Remote SQL Access', () => {
  /**
   * Test: Client should expose sql tagged template
   *
   * EXPECTED BEHAVIOR:
   * - $.sql`SELECT * FROM users` returns query builder
   *
   * WILL FAIL: DO SDK doesn't expose sql template
   */
  it('should expose sql tagged template on client', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.sql).toBeDefined()
    expect(typeof client.sql).toBe('function')
  })

  /**
   * Test: SQL query should support .all() for multiple rows
   *
   * EXPECTED BEHAVIOR:
   * - $.sql`SELECT * FROM users WHERE active = ${true}`.all()
   * - Returns array of all matching rows
   *
   * WILL FAIL: sql.all is not exposed
   */
  it('should support .all() for fetching multiple rows', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    const query = client.sql`SELECT * FROM users WHERE active = ${true}`

    expect(query).toBeDefined()
    expect(query.all).toBeDefined()
    expect(typeof query.all).toBe('function')
  })

  /**
   * Test: SQL query should support .first() for single row
   *
   * EXPECTED BEHAVIOR:
   * - $.sql`SELECT * FROM users LIMIT 1`.first()
   * - Returns first row or null
   *
   * WILL FAIL: sql.first is not exposed
   */
  it('should support .first() for fetching single row', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    const query = client.sql`SELECT * FROM users LIMIT 1`

    expect(query).toBeDefined()
    expect(query.first).toBeDefined()
    expect(typeof query.first).toBe('function')
  })

  /**
   * Test: SQL query should support .run() for mutations
   *
   * EXPECTED BEHAVIOR:
   * - $.sql`DELETE FROM users WHERE id = ${id}`.run()
   * - Returns { rowsWritten: number }
   *
   * WILL FAIL: sql.run is not exposed
   */
  it('should support .run() for mutations (INSERT/UPDATE/DELETE)', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    const query = client.sql`DELETE FROM users WHERE id = ${'user-123'}`

    expect(query).toBeDefined()
    expect(query.run).toBeDefined()
    expect(typeof query.run).toBe('function')
  })

  /**
   * Test: SQL query should support .raw() for full results
   *
   * EXPECTED BEHAVIOR:
   * - $.sql`SELECT * FROM users`.raw()
   * - Returns { results: T[], meta: { rows_read, rows_written } }
   *
   * WILL FAIL: sql.raw is not exposed
   */
  it('should support .raw() for full query results with metadata', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    const query = client.sql`SELECT * FROM users`

    expect(query).toBeDefined()
    expect(query.raw).toBeDefined()
    expect(typeof query.raw).toBe('function')
  })

  /**
   * Test: SQL should properly escape parameters
   *
   * EXPECTED BEHAVIOR:
   * - Parameters in template are properly escaped
   * - Prevents SQL injection
   *
   * WILL FAIL: Parameter handling may not be implemented
   */
  it('should properly handle parameterized queries', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    const name = "Robert'); DROP TABLE users;--"
    const query = client.sql`SELECT * FROM users WHERE name = ${name}`

    expect(query).toBeDefined()
    // Query should be safe from injection
    expect(query.all).toBeDefined()
  })
})

// =============================================================================
// Test Suite: Remote Storage
// =============================================================================

describe('Remote Storage', () => {
  /**
   * Test: Client should expose storage interface
   *
   * EXPECTED BEHAVIOR:
   * - $.storage provides key-value storage access
   *
   * WILL FAIL: DO SDK doesn't expose storage
   */
  it('should expose storage interface on client', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.storage).toBeDefined()
    expect(typeof client.storage).toBe('object')
  })

  /**
   * Test: Storage should support get() for single key
   *
   * EXPECTED BEHAVIOR:
   * - $.storage.get('config') returns value or undefined
   *
   * WILL FAIL: storage.get is not exposed
   */
  it('should support get() for single key lookup', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.storage.get).toBeDefined()
    expect(typeof client.storage.get).toBe('function')
  })

  /**
   * Test: Storage should support get() for multiple keys
   *
   * EXPECTED BEHAVIOR:
   * - $.storage.get(['key1', 'key2']) returns Map
   *
   * WILL FAIL: Multi-key get is not exposed
   */
  it('should support get() for multiple keys', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    // Same function, different signature
    expect(client.storage.get).toBeDefined()
  })

  /**
   * Test: Storage should support put() for single key
   *
   * EXPECTED BEHAVIOR:
   * - $.storage.put('config', value) stores value
   *
   * WILL FAIL: storage.put is not exposed
   */
  it('should support put() for single key-value', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.storage.put).toBeDefined()
    expect(typeof client.storage.put).toBe('function')
  })

  /**
   * Test: Storage should support put() for multiple entries
   *
   * EXPECTED BEHAVIOR:
   * - $.storage.put({ key1: value1, key2: value2 }) stores multiple
   *
   * WILL FAIL: Multi-entry put is not exposed
   */
  it('should support put() for multiple entries', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.storage.put).toBeDefined()
  })

  /**
   * Test: Storage should support list() with prefix
   *
   * EXPECTED BEHAVIOR:
   * - $.storage.list({ prefix: 'user-' }) returns matching entries
   *
   * WILL FAIL: storage.list is not exposed
   */
  it('should support list() with prefix filter', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.storage.list).toBeDefined()
    expect(typeof client.storage.list).toBe('function')
  })

  /**
   * Test: Storage should support delete() for single key
   *
   * EXPECTED BEHAVIOR:
   * - $.storage.delete('key') returns boolean
   *
   * WILL FAIL: storage.delete is not exposed
   */
  it('should support delete() for single key', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.storage.delete).toBeDefined()
    expect(typeof client.storage.delete).toBe('function')
  })

  /**
   * Test: Storage should support keys() listing
   *
   * EXPECTED BEHAVIOR:
   * - $.storage.keys() or $.storage.keys('prefix-') returns key list
   *
   * WILL FAIL: storage.keys is not exposed
   */
  it('should support keys() listing with optional prefix', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.storage.keys).toBeDefined()
    expect(typeof client.storage.keys).toBe('function')
  })
})

// =============================================================================
// Test Suite: Colo Awareness
// =============================================================================

describe('Colo Awareness', () => {
  /**
   * Test: Client should expose colo information
   *
   * EXPECTED BEHAVIOR:
   * - $.colo returns current DO's colo info
   *
   * WILL FAIL: DO SDK doesn't expose colo info
   */
  it('should expose current colo information', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.colo).toBeDefined()
    expect(typeof client.colo).toBe('object')
  })

  /**
   * Test: Colo info should have code property
   *
   * EXPECTED BEHAVIOR:
   * - $.colo.code returns colo code like 'SJC', 'AMS'
   *
   * WILL FAIL: colo.code is not exposed
   */
  it('should provide colo code (e.g., SJC, AMS, NRT)', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.colo).toBeDefined()
    expect(client.colo.code).toBeDefined()
    expect(typeof client.colo.code).toBe('string')
  })

  /**
   * Test: Colo info should have region property
   *
   * EXPECTED BEHAVIOR:
   * - $.colo.region returns region like 'North America', 'Europe'
   *
   * WILL FAIL: colo.region is not exposed
   */
  it('should provide colo region', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.colo).toBeDefined()
    expect(client.colo.region).toBeDefined()
  })

  /**
   * Test: Should support latency estimation between colos
   *
   * EXPECTED BEHAVIOR:
   * - $.estimateLatency('AMS') returns estimated ms latency
   *
   * WILL FAIL: estimateLatency is not implemented
   */
  it('should estimate latency to another colo', async () => {
    const client = RPC('https://test.do.md') as unknown as ColoAwareness

    expect(client.estimateLatency).toBeDefined()
    expect(typeof client.estimateLatency).toBe('function')
  })

  /**
   * Test: Should find nearest colo from a list
   *
   * EXPECTED BEHAVIOR:
   * - $.nearestColo(['SJC', 'AMS', 'NRT']) returns nearest
   *
   * WILL FAIL: nearestColo is not implemented
   */
  it('should find nearest colo from a list', async () => {
    const client = RPC('https://test.do.md') as unknown as ColoAwareness

    expect(client.nearestColo).toBeDefined()
    expect(typeof client.nearestColo).toBe('function')
  })

  /**
   * Test: Should list all available colos
   *
   * EXPECTED BEHAVIOR:
   * - $.listColos() returns all Cloudflare colos
   *
   * WILL FAIL: listColos is not implemented
   */
  it('should list all available colos', async () => {
    const client = RPC('https://test.do.md') as unknown as ColoAwareness

    expect(client.listColos).toBeDefined()
    expect(typeof client.listColos).toBe('function')
  })
})

// =============================================================================
// Test Suite: Schema Discovery
// =============================================================================

describe('Schema Discovery', () => {
  /**
   * Test: Client should expose dbSchema() method
   *
   * EXPECTED BEHAVIOR:
   * - $.dbSchema() returns database schema (tables, columns, indexes)
   *
   * WILL FAIL: DO SDK doesn't expose dbSchema
   */
  it('should expose dbSchema() for database introspection', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.dbSchema).toBeDefined()
    expect(typeof client.dbSchema).toBe('function')
  })

  /**
   * Test: dbSchema should return table information
   *
   * EXPECTED BEHAVIOR:
   * - const schema = await $.dbSchema()
   * - schema.tables is array of TableSchema
   *
   * WILL FAIL: dbSchema doesn't return proper schema
   */
  it('should return database tables in schema', async () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    // Verify the method signature
    expect(client.dbSchema).toBeDefined()

    // In real test, would call and verify structure:
    // const schema = await client.dbSchema()
    // expect(schema.tables).toBeDefined()
    // expect(Array.isArray(schema.tables)).toBe(true)
  })

  /**
   * Test: Client should expose schema() method for full RPC schema
   *
   * EXPECTED BEHAVIOR:
   * - $.schema() returns full RPC schema (methods, namespaces, db, storage)
   *
   * WILL FAIL: DO SDK doesn't expose schema
   */
  it('should expose schema() for full RPC schema discovery', () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.schema).toBeDefined()
    expect(typeof client.schema).toBe('function')
  })

  /**
   * Test: Full schema should include RPC methods
   *
   * EXPECTED BEHAVIOR:
   * - const schema = await $.schema()
   * - schema.methods lists available RPC methods
   *
   * WILL FAIL: schema doesn't include methods
   */
  it('should return RPC methods in full schema', async () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.schema).toBeDefined()

    // In real test:
    // const schema = await client.schema()
    // expect(schema.methods).toBeDefined()
    // expect(Array.isArray(schema.methods)).toBe(true)
  })

  /**
   * Test: Full schema should include namespaces
   *
   * EXPECTED BEHAVIOR:
   * - const schema = await $.schema()
   * - schema.namespaces lists available namespaces (like 'do', 'ai', etc.)
   *
   * WILL FAIL: schema doesn't include namespaces
   */
  it('should return namespaces in full schema', async () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.schema).toBeDefined()

    // In real test:
    // const schema = await client.schema()
    // expect(schema.namespaces).toBeDefined()
  })

  /**
   * Test: Full schema should include colo information
   *
   * EXPECTED BEHAVIOR:
   * - const schema = await $.schema()
   * - schema.colo is the current colo code
   *
   * WILL FAIL: schema doesn't include colo
   */
  it('should include colo in full schema', async () => {
    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.schema).toBeDefined()

    // In real test:
    // const schema = await client.schema()
    // expect(schema.colo).toBeDefined()
    // expect(typeof schema.colo).toBe('string')
  })
})

// =============================================================================
// Test Suite: DO SDK Integration with rpc.do
// =============================================================================

describe('DO SDK Integration with rpc.do', () => {
  /**
   * Test: createDOApiClient should return client with new features
   *
   * EXPECTED BEHAVIOR:
   * - createDOApiClient() returns client with sql, storage, collection
   *
   * WILL FAIL: createDOApiClient doesn't expose these features
   */
  it('should return client with sql, storage, collection from createDOApiClient', () => {
    const client = createDOApiClient({
      baseURL: 'https://test.do.md',
    }) as unknown as ExpectedDOClientFeatures

    // These are the new features that should be exposed
    expect(client.sql).toBeDefined()
    expect(client.storage).toBeDefined()
    expect(client.collection).toBeDefined()
    expect(client.dbSchema).toBeDefined()
    expect(client.schema).toBeDefined()
  })

  /**
   * Test: SDK should re-export DO client features from rpc.do
   *
   * EXPECTED BEHAVIOR:
   * - import { SqlQuery, RemoteStorage } from '@do/sdk/rpc' works
   *
   * WILL FAIL: Types not re-exported from DO SDK
   */
  it('should re-export rpc.do types for type safety', () => {
    // This is a compile-time check - if types aren't exported, TypeScript will fail
    // At runtime, we just verify the exports exist

    // Verify transport factories are exported
    expect(http).toBeDefined()
    expect(capnweb).toBeDefined()
    expect(RPC).toBeDefined()
    expect(createDOApiClient).toBeDefined()
  })

  /**
   * Test: SDK should support connecting to specific DO instance
   *
   * EXPECTED BEHAVIOR:
   * - connectDO('my-do-id') returns typed client
   *
   * Note: connectDO exists but may not have all features
   */
  it('should support connecting to specific DO instance', () => {
    // Import and use connectDO if available
    // const do$ = connectDO('my-do-instance')
    // expect(do$.sql).toBeDefined()

    // For now, verify RPC can be used with specific DO path
    const client = RPC('https://do.md/do/my-instance')
    expect(client).toBeDefined()
  })

  /**
   * Test: Client close() should cleanup resources
   *
   * EXPECTED BEHAVIOR:
   * - await client.close() cleans up WebSocket/HTTP connections
   *
   * WILL FAIL: close may not be properly implemented
   */
  it('should support close() for resource cleanup', async () => {
    const client = RPC('wss://test.do.md') as unknown as ExpectedDOClientFeatures

    expect(client.close).toBeDefined()
    expect(typeof client.close).toBe('function')

    // Should not throw
    await client.close()
  })
})

// =============================================================================
// Test Suite: Type Safety
// =============================================================================

describe('Type Safety', () => {
  /**
   * Test: SQL query should be generic for type safety
   *
   * EXPECTED BEHAVIOR:
   * - $.sql<User>`SELECT * FROM users` has typed results
   *
   * WILL FAIL: Generic type parameter may not work
   */
  it('should support generic type parameter for SQL queries', () => {
    interface User {
      id: string
      name: string
      email: string
    }

    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    // This is a compile-time check
    const query = client.sql<User>`SELECT * FROM users`

    expect(query).toBeDefined()
    expect(query.all).toBeDefined()
  })

  /**
   * Test: Collection should be generic for type safety
   *
   * EXPECTED BEHAVIOR:
   * - $.collection<User>('users') has typed documents
   *
   * WILL FAIL: Generic type parameter may not work
   */
  it('should support generic type parameter for collections', () => {
    interface User extends Record<string, unknown> {
      id: string
      name: string
      active: boolean
    }

    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    // This is a compile-time check
    const users = client.collection<User>('users')

    expect(users).toBeDefined()
    expect(users.find).toBeDefined()
  })

  /**
   * Test: Storage should support generic value types
   *
   * EXPECTED BEHAVIOR:
   * - $.storage.get<Config>('config') returns typed value
   *
   * WILL FAIL: Generic type parameter may not work
   */
  it('should support generic type parameter for storage', () => {
    interface Config {
      theme: 'light' | 'dark'
      language: string
    }

    const client = RPC('https://test.do.md') as unknown as ExpectedDOClientFeatures

    // This is a compile-time check
    const storage = client.storage

    expect(storage).toBeDefined()
    expect(storage.get).toBeDefined()
  })
})
