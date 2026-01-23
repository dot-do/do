/**
 * Common Mocks for DO (Digital Object) Testing
 *
 * Provides mock implementations for Cloudflare Workers APIs
 * and DO-specific interfaces.
 */

import { vi } from 'vitest'
import type {
  DigitalObjectIdentity,
  DigitalObjectRef,
  DOType,
} from '../../types/identity'
import type { CDCEvent, CDCCursor, CDCBatch } from '../../types/storage'
import type { RPCRequest, RPCResponse } from '../../types/rpc'

// Define BinaryType locally since it's not always available in all environments
type BinaryType = 'blob' | 'arraybuffer'

// =============================================================================
// DurableObjectState Mock
// =============================================================================

/**
 * Mock DurableObjectStorage - simulates DO's SQLite-backed storage
 */
export function createMockDurableObjectStorage(): DurableObjectStorage {
  const data = new Map<string, unknown>()

  return {
    get: vi.fn(async (keyOrKeys: string | string[]) => {
      if (Array.isArray(keyOrKeys)) {
        const result = new Map<string, unknown>()
        for (const key of keyOrKeys) {
          const value = data.get(key)
          if (value !== undefined) {
            result.set(key, value)
          }
        }
        return result
      }
      return data.get(keyOrKeys)
    }),
    put: vi.fn(async (keyOrEntries: string | object, value?: unknown) => {
      if (typeof keyOrEntries === 'object') {
        for (const [k, v] of Object.entries(keyOrEntries)) {
          data.set(k, v)
        }
      } else {
        data.set(keyOrEntries, value)
      }
    }),
    delete: vi.fn(async (keyOrKeys: string | string[]) => {
      if (Array.isArray(keyOrKeys)) {
        let count = 0
        for (const key of keyOrKeys) {
          if (data.delete(key)) count++
        }
        return count
      }
      return data.delete(keyOrKeys)
    }),
    deleteAll: vi.fn(async () => data.clear()),
    list: vi.fn(async (options?: DurableObjectListOptions) => {
      const entries = new Map<string, unknown>()
      const prefix = options?.prefix || ''
      const limit = options?.limit || Infinity

      let count = 0
      for (const [key, value] of data) {
        if (key.startsWith(prefix) && count < limit) {
          entries.set(key, value)
          count++
        }
      }
      return entries
    }),
    // SQL methods
    sql: {
      exec: vi.fn(() => ({ results: [] })),
    } as unknown as SqlStorage,
    getAlarm: vi.fn(async () => null),
    setAlarm: vi.fn(async () => {}),
    deleteAlarm: vi.fn(async () => {}),
    sync: vi.fn(async () => {}),
    transaction: vi.fn(async (closure) => closure()),
    transactionSync: vi.fn((closure) => closure()),
    getCurrentBookmark: vi.fn(() => ''),
    getBookmarkForTime: vi.fn(async () => ''),
    onNextSessionRestoreBookmark: vi.fn(() => {}),
  } as unknown as DurableObjectStorage
}

/**
 * Mock DurableObjectState - the main state object passed to DO constructor
 */
export function createMockDurableObjectState(
  options: {
    id?: string
    storage?: DurableObjectStorage
  } = {}
): DurableObjectState {
  const id = options.id || 'test-do-id'
  const storage = options.storage || createMockDurableObjectStorage()

  return {
    id: {
      toString: () => id,
      name: id,
      equals: vi.fn((other) => other.toString() === id),
    } as unknown as DurableObjectId,
    storage,
    blockConcurrencyWhile: vi.fn(async (callback) => callback()),
    waitUntil: vi.fn(),
    acceptWebSocket: vi.fn(),
    getWebSockets: vi.fn(() => []),
    setWebSocketAutoResponse: vi.fn(),
    getWebSocketAutoResponse: vi.fn(() => null),
    getWebSocketAutoResponseTimestamp: vi.fn(() => null),
    setHibernatableWebSocketEventTimeout: vi.fn(),
    getHibernatableWebSocketEventTimeout: vi.fn(() => null),
    getTags: vi.fn(() => []),
    abort: vi.fn(),
  } as unknown as DurableObjectState
}

// =============================================================================
// WebSocket Mock
// =============================================================================

/**
 * Mock WebSocket for hibernatable WebSocket testing
 */
export function createMockWebSocket(): WebSocket {
  const eventHandlers: Record<string, EventListener[]> = {}

  // Use a separate variable to track readyState since WebSocket.readyState is read-only
  let currentReadyState = WebSocket.OPEN

  const ws = {
    get readyState() {
      return currentReadyState
    },
    url: 'wss://test.example.com',
    protocol: '',
    extensions: '',
    binaryType: 'arraybuffer' as BinaryType,
    bufferedAmount: 0,
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    send: vi.fn(),
    close: vi.fn((code?: number, reason?: string) => {
      currentReadyState = WebSocket.CLOSED
      const closeEvent = new CloseEvent('close', { code, reason })
      eventHandlers['close']?.forEach((h) => h(closeEvent))
    }),
    addEventListener: vi.fn((type: string, handler: EventListener) => {
      if (!eventHandlers[type]) eventHandlers[type] = []
      eventHandlers[type].push(handler)
    }),
    removeEventListener: vi.fn((type: string, handler: EventListener) => {
      if (eventHandlers[type]) {
        eventHandlers[type] = eventHandlers[type].filter((h) => h !== handler)
      }
    }),
    dispatchEvent: vi.fn((event: Event) => {
      eventHandlers[event.type]?.forEach((h) => h(event))
      return true
    }),
    // Cloudflare-specific
    accept: vi.fn(),
    serializeAttachment: vi.fn(),
    deserializeAttachment: vi.fn(() => null),
  } as unknown as WebSocket

  return ws
}

// =============================================================================
// DO Identity Mocks
// =============================================================================

/**
 * Create a mock DigitalObjectIdentity
 */
export function createMockDOIdentity(
  overrides: Partial<DigitalObjectIdentity> = {}
): DigitalObjectIdentity {
  return {
    $id: 'https://test.example.com',
    $type: 'Test',
    $version: 1,
    $createdAt: Date.now(),
    $updatedAt: Date.now(),
    ...overrides,
  }
}

// =============================================================================
// CDC Mocks
// =============================================================================

/**
 * Create a mock CDC event
 */
export function createMockCDCEvent<T = unknown>(
  overrides: Partial<CDCEvent<T>> = {}
): CDCEvent<T> {
  return {
    id: `event-${Date.now()}`,
    operation: 'INSERT',
    collection: 'test',
    documentId: 'doc-1',
    timestamp: Date.now(),
    sequence: 1,
    ...overrides,
  }
}

/**
 * Create a mock CDC cursor
 */
export function createMockCDCCursor(
  overrides: Partial<CDCCursor> = {}
): CDCCursor {
  return {
    sequence: 0,
    timestamp: Date.now(),
    ...overrides,
  }
}

/**
 * Create a mock CDC batch
 */
export function createMockCDCBatch(
  overrides: Partial<CDCBatch> = {}
): CDCBatch {
  return {
    events: [],
    cursor: createMockCDCCursor(),
    hasMore: false,
    ...overrides,
  }
}

// =============================================================================
// RPC Mocks
// =============================================================================

/**
 * Create a mock RPC request
 */
export function createMockRPCRequest<T = unknown>(
  overrides: Partial<RPCRequest<T>> = {}
): RPCRequest<T> {
  return {
    id: `req-${Date.now()}`,
    method: 'do.system.ping',
    ...overrides,
  }
}

/**
 * Create a mock RPC response
 */
export function createMockRPCResponse<T = unknown>(
  overrides: Partial<RPCResponse<T>> = {}
): RPCResponse<T> {
  return {
    id: `req-${Date.now()}`,
    ...overrides,
  }
}

// =============================================================================
// Cloudflare Bindings Mock
// =============================================================================

/**
 * Mock environment bindings for Workers
 */
export interface MockEnv {
  DO: DurableObjectNamespace
  KV: KVNamespace
  R2: R2Bucket
  AI: unknown
}

/**
 * Create mock Cloudflare environment bindings
 */
export function createMockEnv(): MockEnv {
  return {
    DO: createMockDurableObjectNamespace(),
    KV: createMockKVNamespace(),
    R2: createMockR2Bucket(),
    AI: createMockAI(),
  }
}

/**
 * Mock DurableObjectNamespace
 */
export function createMockDurableObjectNamespace(): DurableObjectNamespace {
  const stubs = new Map<string, DurableObjectStub>()

  return {
    idFromName: vi.fn((name: string) => ({
      toString: () => name,
      name,
      equals: vi.fn((other) => other.toString() === name),
    })) as unknown as DurableObjectNamespace['idFromName'],
    idFromString: vi.fn((id: string) => ({
      toString: () => id,
      name: id,
      equals: vi.fn((other) => other.toString() === id),
    })) as unknown as DurableObjectNamespace['idFromString'],
    newUniqueId: vi.fn(() => {
      const id = `unique-${Date.now()}-${Math.random().toString(36).slice(2)}`
      return {
        toString: () => id,
        name: id,
        equals: vi.fn((other) => other.toString() === id),
      }
    }) as unknown as DurableObjectNamespace['newUniqueId'],
    get: vi.fn((id) => {
      const key = id.toString()
      if (!stubs.has(key)) {
        stubs.set(key, createMockDurableObjectStub())
      }
      return stubs.get(key)!
    }),
    jurisdiction: vi.fn(),
  } as unknown as DurableObjectNamespace
}

/**
 * Mock DurableObjectStub
 */
export function createMockDurableObjectStub(): DurableObjectStub {
  return {
    id: {
      toString: () => 'stub-id',
      name: 'stub-id',
      equals: vi.fn(),
    } as unknown as DurableObjectId,
    name: 'test-stub',
    fetch: vi.fn(async () => new Response('OK')),
  } as unknown as DurableObjectStub
}

/**
 * Mock KVNamespace
 */
export function createMockKVNamespace(): KVNamespace {
  const store = new Map<string, string>()

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    getWithMetadata: vi.fn(async (key: string) => ({
      value: store.get(key) ?? null,
      metadata: null,
    })),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key)
    }),
    list: vi.fn(async () => ({
      keys: Array.from(store.keys()).map((name) => ({ name })),
      list_complete: true,
      cacheStatus: null,
    })),
  } as unknown as KVNamespace
}

/**
 * Mock R2Bucket
 */
export function createMockR2Bucket(): R2Bucket {
  const objects = new Map<string, { body: ArrayBuffer; metadata: Record<string, string> }>()

  return {
    head: vi.fn(async (key: string) => {
      const obj = objects.get(key)
      if (!obj) return null
      return {
        key,
        size: obj.body.byteLength,
        etag: 'mock-etag',
        uploaded: new Date(),
        customMetadata: obj.metadata,
      }
    }),
    get: vi.fn(async (key: string) => {
      const obj = objects.get(key)
      if (!obj) return null
      return {
        key,
        size: obj.body.byteLength,
        etag: 'mock-etag',
        uploaded: new Date(),
        customMetadata: obj.metadata,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(obj.body))
            controller.close()
          },
        }),
        bodyUsed: false,
        arrayBuffer: async () => obj.body,
        text: async () => new TextDecoder().decode(obj.body),
        json: async () => JSON.parse(new TextDecoder().decode(obj.body)),
      }
    }),
    put: vi.fn(async (key: string, value: ArrayBuffer | string) => {
      const body = typeof value === 'string' ? new TextEncoder().encode(value).buffer : value
      objects.set(key, { body: body as ArrayBuffer, metadata: {} })
      return {
        key,
        size: body.byteLength,
        etag: 'mock-etag',
        uploaded: new Date(),
      }
    }),
    delete: vi.fn(async (keys: string | string[]) => {
      const keyList = Array.isArray(keys) ? keys : [keys]
      keyList.forEach((k) => objects.delete(k))
    }),
    list: vi.fn(async () => ({
      objects: Array.from(objects.keys()).map((key) => ({
        key,
        size: objects.get(key)!.body.byteLength,
        etag: 'mock-etag',
        uploaded: new Date(),
      })),
      truncated: false,
      delimitedPrefixes: [],
    })),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  } as unknown as R2Bucket
}

/**
 * Mock AI binding
 */
export function createMockAI() {
  return {
    run: vi.fn(async (model: string, inputs: unknown) => {
      // Return mock responses based on model type
      if (model.includes('text-generation')) {
        return { response: 'Mock AI response' }
      }
      if (model.includes('embedding')) {
        return { data: [[0.1, 0.2, 0.3]] }
      }
      return { result: 'mock' }
    }),
  }
}
