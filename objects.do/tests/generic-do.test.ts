/**
 * Tests for DO - Universal DO Runtime
 *
 * These tests define the expected behavior of the DO class,
 * which is the universal runtime that interprets DO definitions as data.
 *
 * DO enables "every DO is data" - no deployment needed.
 *
 * @module tests/generic-do
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { DurableObjectState, R2Bucket } from '@cloudflare/workers-types'

// Import types from the types module
import { createContext } from '../src/context'
import { DO } from '../src/DO'
import type { DODefinition, DOContext, Env } from '../src/types'

// Helper type for JSON responses
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonResponse = any

// =============================================================================
// Mock Registry & Test Helpers
// =============================================================================

/**
 * Creates a mock registry (R2 bucket) for testing
 */
function createMockRegistry(): R2Bucket {
  const definitions = new Map<string, DODefinition>()

  return {
    get: vi.fn(async (key: string) => {
      const def = definitions.get(key)
      if (!def) return null
      return {
        json: async () => def,
        text: async () => JSON.stringify(def),
        body: null,
        bodyUsed: false,
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
      }
    }),
    put: vi.fn(async (key: string, value: string | ArrayBuffer | ReadableStream) => {
      if (typeof value === 'string') {
        definitions.set(key, JSON.parse(value))
      }
    }),
    delete: vi.fn(async (key: string) => {
      definitions.delete(key)
    }),
    list: vi.fn(async () => ({
      objects: Array.from(definitions.keys()).map((key) => ({ key })),
      truncated: false,
      delimitedPrefixes: [],
    })),
    head: vi.fn(async () => null),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  } as unknown as R2Bucket
}

/**
 * Creates a mock DurableObjectState for testing
 */
function createMockState(idName: string): DurableObjectState {
  const storage = new Map<string, unknown>()

  return {
    id: {
      name: idName,
      toString: () => idName,
      equals: (other: DurableObjectId) => other.toString() === idName,
    },
    storage: {
      get: vi.fn(async (key: string) => storage.get(key)),
      put: vi.fn(async (key: string, value: unknown) => {
        storage.set(key, value)
      }),
      delete: vi.fn(async (key: string) => storage.delete(key)),
      list: vi.fn(async () => storage),
      transaction: vi.fn(async (closure: (txn: unknown) => Promise<void>) => {
        await closure({
          get: async (key: string) => storage.get(key),
          put: async (key: string, value: unknown) => storage.set(key, value),
          delete: async (key: string) => storage.delete(key),
        })
      }),
      deleteAll: vi.fn(async () => storage.clear()),
      getAlarm: vi.fn(async () => null),
      setAlarm: vi.fn(async () => {}),
      deleteAlarm: vi.fn(async () => {}),
      sync: vi.fn(async () => {}),
    },
    waitUntil: vi.fn(),
    blockConcurrencyWhile: vi.fn(async (fn: () => Promise<void>) => fn()),
    acceptWebSocket: vi.fn(),
    getWebSockets: vi.fn(() => []),
    setWebSocketAutoResponse: vi.fn(),
    getWebSocketAutoResponse: vi.fn(() => null),
    getWebSocketAutoResponseTimestamp: vi.fn(() => null),
    setHibernatableWebSocketEventTimeout: vi.fn(),
    getHibernatableWebSocketEventTimeout: vi.fn(() => null),
    getTags: vi.fn(() => []),
  } as unknown as DurableObjectState
}

/**
 * Creates a mock environment with all bindings
 */
function createMockEnv(registry: R2Bucket): Env {
  return {
    REGISTRY: registry,
    ESBUILD: {
      fetch: vi.fn(async () => new Response(JSON.stringify({ result: 'compiled' }))),
    },
    STRIPE: {
      fetch: vi.fn(async () => new Response(JSON.stringify({ result: 'stripe-response' }))),
    },
    AI: {
      fetch: vi.fn(async () => new Response(JSON.stringify({ result: 'ai-response' }))),
    },
  } as unknown as Env
}

/**
 * Creates a test DO definition
 */
function createTestDefinition(overrides: Partial<DODefinition> = {}): DODefinition {
  return {
    $id: 'test.app.do',
    $type: 'SaaS',
    api: {
      ping: 'async () => "pong"',
      echo: 'async (msg) => msg',
      add: 'async (a, b) => a + b',
    },
    ...overrides,
  }
}

/**
 * Creates a request with X-DO-Name header
 *
 * The DO class requires X-DO-Name header to know which definition to load.
 * This header is normally set by the worker that routes requests to the DO.
 */
function createRequest(
  url: string,
  options?: RequestInit & { doName?: string }
): Request {
  const { doName = 'test.app.do', ...init } = options || {}
  const headers = new Headers(init?.headers)
  headers.set('X-DO-Name', doName)
  return new Request(url, { ...init, headers })
}

// =============================================================================
// 1. Definition Loading Tests
// =============================================================================

describe('DO definition loading', () => {
  let registry: R2Bucket
  let state: DurableObjectState
  let env: ReturnType<typeof createMockEnv>

  beforeEach(() => {
    registry = createMockRegistry()
    state = createMockState('test.app.do')
    env = createMockEnv(registry)
  })

  it('should load DO definition from registry by ID', async () => {
    // Setup: Put a definition in the registry
    const definition = createTestDefinition()
    await registry.put('test.app.do', JSON.stringify({ definition }))

    // Verify the helper sets the header correctly
    const request = createRequest('https://test.app.do/__schema')
    expect(request.headers.get('X-DO-Name')).toBe('test.app.do')

    // Create DO and make a request to trigger definition loading
    const genericDO = new DO(state, env)
    const response = await genericDO.fetch(request)

    // Verify definition was loaded
    expect(registry.get).toHaveBeenCalledWith('test.app.do')
    expect(response.status).toBe(200)
  })

  it('should cache definition after first load', async () => {
    // Setup: Put a definition in the registry
    const definition = createTestDefinition()
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)

    // Make multiple requests
    await genericDO.fetch(createRequest('https://test.app.do/__schema'))
    await genericDO.fetch(createRequest('https://test.app.do/__schema'))
    await genericDO.fetch(createRequest('https://test.app.do/__schema'))

    // Registry should only be called once (definition is cached)
    expect(registry.get).toHaveBeenCalledTimes(1)
  })

  it('should handle missing definition gracefully', async () => {
    // No definition in registry
    const genericDO = new DO(state, env)
    const request = createRequest('https://test.app.do/rpc', {
      method: 'POST',
      body: JSON.stringify({ method: 'ping', params: [] }),
    })

    const response = await genericDO.fetch(request)

    expect(response.status).toBe(404)
    const body = await response.json() as JsonResponse
    expect(body.error).toMatch(/definition not found/i)
  })

  it('should validate definition schema', async () => {
    // Put an invalid definition (missing required fields)
    const invalidDefinition = { invalid: true } // Missing $id
    await registry.put('test.app.do', JSON.stringify({ definition: invalidDefinition }))

    const genericDO = new DO(state, env)
    const request = createRequest('https://test.app.do/__schema')
    const response = await genericDO.fetch(request)

    expect(response.status).toBe(400)
    const body = await response.json() as JsonResponse
    expect(body.error).toMatch(/invalid definition/i)
  })

  it('should load definition with $version', async () => {
    const definition = createTestDefinition({ $version: '1.0.0' })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)
    const request = createRequest('https://test.app.do/__schema')
    const response = await genericDO.fetch(request)

    const schema = await response.json() as JsonResponse
    expect(schema.$version).toBe('1.0.0')
  })

  it('should support versioned definition lookup', async () => {
    // Put versioned definitions
    const v1 = createTestDefinition({ $version: '1.0.0' })
    const v2 = createTestDefinition({
      $version: '2.0.0',
      api: { ...createTestDefinition().api, newMethod: 'async () => "v2"' },
    })

    await registry.put('test.app.do@v1.0.0', JSON.stringify({ definition: v1 }))
    await registry.put('test.app.do@v2.0.0', JSON.stringify({ definition: v2 }))

    const stateV1 = createMockState('test.app.do@v1.0.0')
    const genericDO = new DO(stateV1, env)
    const request = createRequest('https://test.app.do/__schema')
    const response = await genericDO.fetch(request)

    const schema = await response.json() as JsonResponse
    expect(schema.$version).toBe('1.0.0')
  })
})

// =============================================================================
// 2. RPC Handling Tests
// =============================================================================

describe('DO RPC', () => {
  let registry: R2Bucket
  let state: DurableObjectState
  let env: ReturnType<typeof createMockEnv>

  beforeEach(async () => {
    registry = createMockRegistry()
    state = createMockState('test.app.do')
    env = createMockEnv(registry)

    // Pre-load definition for all RPC tests
    const definition = createTestDefinition({
      api: {
        ping: 'async () => "pong"',
        echo: 'async (msg) => msg',
        add: 'async (a, b) => a + b',
        greet: 'async (name) => `Hello, ${name}!`',
        users: {
          list: 'async () => ["alice", "bob"]',
          get: 'async (id) => ({ id, name: `User ${id}` })',
          create: 'async (data) => ({ id: "123", ...data })',
        },
        billing: {
          plans: {
            list: 'async () => ["starter", "pro", "enterprise"]',
            get: 'async (id) => ({ id, price: 99 })',
          },
        },
        throwError: 'async () => { throw new Error("intentional error") }',
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))
  })

  it('should execute simple API methods', async () => {
    const genericDO = new DO(state, env)
    const request = createRequest('https://test.app.do/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'ping', params: [] }),
    })

    const response = await genericDO.fetch(request)

    expect(response.status).toBe(200)
    const body = await response.json() as JsonResponse
    expect(body.result).toBe('pong')
  })

  it('should execute methods with parameters', async () => {
    const genericDO = new DO(state, env)

    // Test echo method
    const echoResponse = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'echo', params: ['hello world'] }),
      })
    )

    expect(echoResponse.status).toBe(200)
    const echoBody = await echoResponse.json() as JsonResponse
    expect(echoBody.result).toBe('hello world')

    // Test add method with multiple parameters
    const addResponse = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'add', params: [5, 3] }),
      })
    )

    expect(addResponse.status).toBe(200)
    const addBody = await addResponse.json() as JsonResponse
    expect(addBody.result).toBe(8)
  })

  it('should handle nested namespaces (api.users.get)', async () => {
    const genericDO = new DO(state, env)

    // Test nested method: users.list
    const listResponse = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'users.list', params: [] }),
      })
    )

    expect(listResponse.status).toBe(200)
    const listBody = await listResponse.json() as JsonResponse
    expect(listBody.result).toEqual(['alice', 'bob'])

    // Test nested method: users.get with parameter
    const getResponse = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'users.get', params: ['user-1'] }),
      })
    )

    expect(getResponse.status).toBe(200)
    const getBody = await getResponse.json() as JsonResponse
    expect(getBody.result).toEqual({ id: 'user-1', name: 'User user-1' })
  })

  it('should handle deeply nested namespaces (api.billing.plans.get)', async () => {
    const genericDO = new DO(state, env)

    const response = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'billing.plans.get', params: ['pro'] }),
      })
    )

    expect(response.status).toBe(200)
    const body = await response.json() as JsonResponse
    expect(body.result).toEqual({ id: 'pro', price: 99 })
  })

  it('should return proper JSON-RPC responses', async () => {
    const genericDO = new DO(state, env)

    const request = createRequest('https://test.app.do/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: [] }),
    })

    const response = await genericDO.fetch(request)
    const body = await response.json() as JsonResponse

    // JSON-RPC 2.0 response format
    expect(body.jsonrpc).toBe('2.0')
    expect(body.id).toBe(1)
    expect(body.result).toBe('pong')
    expect(body.error).toBeUndefined()
  })

  it('should handle method not found', async () => {
    const genericDO = new DO(state, env)

    const response = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'nonExistent', params: [] }),
      })
    )

    expect(response.status).toBe(404)
    const body = await response.json() as JsonResponse
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe(-32601) // JSON-RPC method not found
    expect(body.error.message).toMatch(/method not found/i)
  })

  it('should handle execution errors', async () => {
    const genericDO = new DO(state, env)

    const response = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'throwError', params: [] }),
      })
    )

    // Should still return 200 for JSON-RPC errors
    expect(response.status).toBe(200)
    const body = await response.json() as JsonResponse
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe(-32000) // Server error
    expect(body.error.message).toMatch(/intentional error/i)
    expect(body.result).toBeUndefined()
  })

  it('should handle invalid JSON request', async () => {
    const genericDO = new DO(state, env)

    const response = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json',
      })
    )

    expect(response.status).toBe(400)
    const body = await response.json() as JsonResponse
    expect(body.error.code).toBe(-32700) // Parse error
  })

  it('should handle REST-style API routes', async () => {
    const genericDO = new DO(state, env)

    // GET /api/users should call users.list
    const listResponse = await genericDO.fetch(createRequest('https://test.app.do/api/users', { method: 'GET' }))

    expect(listResponse.status).toBe(200)
    const listBody = await listResponse.json() as JsonResponse
    expect(listBody).toEqual(['alice', 'bob'])

    // GET /api/users/123 should call users.get
    const getResponse = await genericDO.fetch(createRequest('https://test.app.do/api/users/123', { method: 'GET' }))

    expect(getResponse.status).toBe(200)
    const getBody = await getResponse.json() as JsonResponse
    expect(getBody).toEqual({ id: '123', name: 'User 123' })
  })

  it('should support batch RPC requests', async () => {
    const genericDO = new DO(state, env)

    const response = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { jsonrpc: '2.0', id: 1, method: 'ping', params: [] },
          { jsonrpc: '2.0', id: 2, method: 'echo', params: ['test'] },
          { jsonrpc: '2.0', id: 3, method: 'add', params: [1, 2] },
        ]),
      })
    )

    expect(response.status).toBe(200)
    const body = await response.json() as JsonResponse
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(3)
    expect(body[0].result).toBe('pong')
    expect(body[1].result).toBe('test')
    expect(body[2].result).toBe(3)
  })
})

// =============================================================================
// 3. Function Execution Tests
// =============================================================================

describe('DO function execution', () => {
  let registry: R2Bucket
  let state: DurableObjectState
  let env: ReturnType<typeof createMockEnv>

  beforeEach(async () => {
    registry = createMockRegistry()
    state = createMockState('test.app.do')
    env = createMockEnv(registry)
  })

  it('should execute stringified async functions', async () => {
    const definition = createTestDefinition({
      api: {
        asyncTest: `async () => {
          await new Promise(r => setTimeout(r, 10))
          return 'completed'
        }`,
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)
    const response = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'asyncTest', params: [] }),
      })
    )

    const body = await response.json() as JsonResponse
    expect(body.result).toBe('completed')
  })

  it('should inject $ context into functions', async () => {
    const definition = createTestDefinition({
      api: {
        getId: 'async () => $.$id',
        getType: 'async () => $.$type',
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)

    const idResponse = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'getId', params: [] }),
      })
    )

    const idBody = await idResponse.json() as JsonResponse
    expect(idBody.result).toBe('test.app.do')

    const typeResponse = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'getType', params: [] }),
      })
    )

    const typeBody = await typeResponse.json() as JsonResponse
    expect(typeBody.result).toBe('SaaS')
  })

  it('should allow $.db access', async () => {
    const definition = createTestDefinition({
      api: {
        saveData: 'async (key, value) => { await $.db.put(key, value); return "saved" }',
        getData: 'async (key) => $.db.get(key)',
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)

    // Save data
    const saveResponse = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'saveData', params: ['myKey', { foo: 'bar' }] }),
      })
    )

    expect((await saveResponse.json() as JsonResponse).result).toBe('saved')

    // Get data
    const getResponse = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'getData', params: ['myKey'] }),
      })
    )

    const getBody = await getResponse.json() as JsonResponse
    expect(getBody.result).toEqual({ foo: 'bar' })
  })

  it('should allow $.ai access', async () => {
    const definition = createTestDefinition({
      api: {
        generate: 'async (prompt) => $.ai.generate(prompt)',
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)

    const response = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'generate', params: ['Hello AI'] }),
      })
    )

    const body = await response.json() as JsonResponse
    // The mock AI service returns { result: 'ai-response' }
    expect(body.result).toBeDefined()
  })

  it('should prevent access to dangerous globals', async () => {
    const definition = createTestDefinition({
      api: {
        // Try to access process
        accessProcess: 'async () => process.env',
        // Try to access require
        accessRequire: 'async () => require("fs")',
        // Try to access globalThis
        accessGlobalThis: 'async () => globalThis.fetch',
        // Try to access eval
        accessEval: 'async () => eval("1+1")',
        // Try to access Function constructor
        accessFunction: 'async () => new Function("return 1")()',
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)

    // All these should fail with security errors
    const dangerousMethods = ['accessProcess', 'accessRequire', 'accessGlobalThis', 'accessEval', 'accessFunction']

    for (const method of dangerousMethods) {
      const response = await genericDO.fetch(
        createRequest('https://test.app.do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, params: [] }),
        })
      )

      const body = await response.json() as JsonResponse
      expect(body.error).toBeDefined()
      expect(body.error.message).toMatch(/not allowed|not defined|security|forbidden/i)
    }
  })

  it('should provide $.fsx for file system operations', async () => {
    const definition = createTestDefinition({
      api: {
        writeFile: 'async (path, content) => { await $.fsx.write(path, content); return "written" }',
        readFile: 'async (path) => $.fsx.read(path)',
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)

    // Write file
    const writeResponse = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'writeFile', params: ['/data/test.txt', 'hello world'] }),
      })
    )

    expect((await writeResponse.json() as JsonResponse).result).toBe('written')

    // Read file
    const readResponse = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'readFile', params: ['/data/test.txt'] }),
      })
    )

    const readBody = await readResponse.json() as JsonResponse
    expect(readBody.result).toBe('hello world')
  })

  it('should provide $.emit for event emission', async () => {
    const definition = createTestDefinition({
      api: {
        createUser: `async (data) => {
          await $.emit('User.created', data)
          return { id: '123', ...data }
        }`,
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)

    const response = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'createUser', params: [{ name: 'Alice' }] }),
      })
    )

    const body = await response.json() as JsonResponse
    expect(body.result).toEqual({ id: '123', name: 'Alice' })
    // Event emission should be tracked (implementation detail)
  })

  it('should provide $.config access', async () => {
    const definition = createTestDefinition({
      config: {
        apiKey: 'test-key',
        maxItems: 100,
      },
      api: {
        getConfig: 'async () => $.config',
        getApiKey: 'async () => $.config.apiKey',
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)

    const response = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'getApiKey', params: [] }),
      })
    )

    const body = await response.json() as JsonResponse
    expect(body.result).toBe('test-key')
  })
})

// =============================================================================
// 4. Site/App Serving Tests
// =============================================================================

describe('DO site serving', () => {
  let registry: R2Bucket
  let state: DurableObjectState
  let env: ReturnType<typeof createMockEnv>

  beforeEach(async () => {
    registry = createMockRegistry()
    state = createMockState('test.app.do')
    env = createMockEnv(registry)

    const definition = createTestDefinition({
      site: {
        '/': '# Welcome\n\nThis is the home page.\n\n<Hero />',
        '/about': '# About Us\n\nWe are awesome.',
        '/pricing': '# Pricing\n\n<PricingTable />',
        '/docs/getting-started': '# Getting Started\n\nInstall with npm.',
      },
      app: {
        '/dashboard': '<Dashboard stats={$.db.Stats.current()} />',
        '/customers': '<CustomerList />',
        '/settings': '<Settings config={$.config} />',
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))
  })

  it('should serve site content for /', async () => {
    const genericDO = new DO(state, env)
    const response = await genericDO.fetch(createRequest('https://test.app.do/'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/text\/html|text\/plain/)

    const body = await response.text()
    expect(body).toContain('Welcome')
    expect(body).toContain('home page')
  })

  it('should serve site pages for /about, /pricing', async () => {
    const genericDO = new DO(state, env)

    // Test /about
    const aboutResponse = await genericDO.fetch(createRequest('https://test.app.do/about'))
    expect(aboutResponse.status).toBe(200)
    const aboutBody = await aboutResponse.text()
    expect(aboutBody).toContain('About Us')

    // Test /pricing
    const pricingResponse = await genericDO.fetch(createRequest('https://test.app.do/pricing'))
    expect(pricingResponse.status).toBe(200)
    const pricingBody = await pricingResponse.text()
    expect(pricingBody).toContain('Pricing')
  })

  it('should serve nested site pages', async () => {
    const genericDO = new DO(state, env)

    const response = await genericDO.fetch(createRequest('https://test.app.do/docs/getting-started'))

    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('Getting Started')
  })

  it('should serve app pages for /app/dashboard', async () => {
    const genericDO = new DO(state, env)

    const response = await genericDO.fetch(createRequest('https://test.app.do/app/dashboard'))

    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('Dashboard')
  })

  it('should serve other app pages', async () => {
    const genericDO = new DO(state, env)

    // Test /app/customers
    const customersResponse = await genericDO.fetch(createRequest('https://test.app.do/app/customers'))
    expect(customersResponse.status).toBe(200)
    const customersBody = await customersResponse.text()
    expect(customersBody).toContain('CustomerList')

    // Test /app/settings
    const settingsResponse = await genericDO.fetch(createRequest('https://test.app.do/app/settings'))
    expect(settingsResponse.status).toBe(200)
    const settingsBody = await settingsResponse.text()
    expect(settingsBody).toContain('Settings')
  })

  it('should return 404 for missing pages', async () => {
    const genericDO = new DO(state, env)

    const response = await genericDO.fetch(createRequest('https://test.app.do/nonexistent'))

    expect(response.status).toBe(404)
    const body = await response.json() as JsonResponse
    expect(body.error).toMatch(/not found/i)
  })

  it('should return 404 for missing app pages', async () => {
    const genericDO = new DO(state, env)

    const response = await genericDO.fetch(createRequest('https://test.app.do/app/nonexistent'))

    expect(response.status).toBe(404)
  })

  it('should serve site when site is a string (root content only)', async () => {
    // Definition with site as a simple string
    const definition = createTestDefinition({
      site: '# Simple Site\n\nJust one page.',
    })
    await registry.put('simple.app.do', JSON.stringify({ definition }))

    const simpleState = createMockState('simple.app.do')
    const genericDO = new DO(simpleState, env)

    const response = await genericDO.fetch(new Request('https://simple.app.do/'))

    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('Simple Site')
  })

  it('should handle requests to /app when no app is defined', async () => {
    // Definition without app
    const definition = createTestDefinition({
      site: { '/': '# Home' },
    })
    delete (definition as unknown as Record<string, unknown>).app
    await registry.put('no-app.do', JSON.stringify({ definition }))

    const noAppState = createMockState('no-app.do')
    const genericDO = new DO(noAppState, env)

    const response = await genericDO.fetch(new Request('https://no-app.do/app/anything'))

    expect(response.status).toBe(404)
  })
})

// =============================================================================
// 5. Schema Generation Tests
// =============================================================================

describe('DO schema', () => {
  let registry: R2Bucket
  let state: DurableObjectState
  let env: ReturnType<typeof createMockEnv>

  beforeEach(async () => {
    registry = createMockRegistry()
    state = createMockState('test.app.do')
    env = createMockEnv(registry)
  })

  it('should generate __schema from definition', async () => {
    const definition = createTestDefinition({
      api: {
        ping: 'async () => "pong"',
        echo: 'async (msg) => msg',
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)
    const response = await genericDO.fetch(createRequest('https://test.app.do/__schema'))

    expect(response.status).toBe(200)
    const schema = await response.json() as JsonResponse

    expect(schema.$id).toBe('test.app.do')
    expect(schema.$type).toBe('SaaS')
    expect(schema.methods).toBeDefined()
  })

  it('should include all API methods', async () => {
    const definition = createTestDefinition({
      api: {
        ping: 'async () => "pong"',
        echo: 'async (msg) => msg',
        add: 'async (a, b) => a + b',
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)
    const response = await genericDO.fetch(createRequest('https://test.app.do/__schema'))

    const schema = await response.json() as JsonResponse

    expect(schema.methods).toContain('ping')
    expect(schema.methods).toContain('echo')
    expect(schema.methods).toContain('add')
  })

  it('should include nested namespaces', async () => {
    const definition = createTestDefinition({
      api: {
        ping: 'async () => "pong"',
        users: {
          list: 'async () => []',
          get: 'async (id) => ({ id })',
          create: 'async (data) => ({ ...data })',
        },
        billing: {
          plans: {
            list: 'async () => []',
            get: 'async (id) => ({ id })',
          },
        },
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)
    const response = await genericDO.fetch(createRequest('https://test.app.do/__schema'))

    const schema = await response.json() as JsonResponse

    // Should include flattened method names
    expect(schema.methods).toContain('ping')
    expect(schema.methods).toContain('users.list')
    expect(schema.methods).toContain('users.get')
    expect(schema.methods).toContain('users.create')
    expect(schema.methods).toContain('billing.plans.list')
    expect(schema.methods).toContain('billing.plans.get')
  })

  it('should include method metadata when provided', async () => {
    const definition = createTestDefinition({
      api: {
        getUser: {
          code: 'async (id) => ({ id })',
          params: ['id'],
          returns: 'User',
        },
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)
    const response = await genericDO.fetch(createRequest('https://test.app.do/__schema'))

    const schema = await response.json() as JsonResponse

    expect(schema.methodDetails).toBeDefined()
    expect(schema.methodDetails.getUser).toBeDefined()
    expect(schema.methodDetails.getUser.params).toEqual(['id'])
    expect(schema.methodDetails.getUser.returns).toBe('User')
  })

  it('should include site and app routes in schema', async () => {
    const definition = createTestDefinition({
      site: {
        '/': '# Home',
        '/about': '# About',
      },
      app: {
        '/dashboard': '<Dashboard />',
        '/settings': '<Settings />',
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)
    const response = await genericDO.fetch(createRequest('https://test.app.do/__schema'))

    const schema = await response.json() as JsonResponse

    expect(schema.site).toBeDefined()
    expect(schema.site).toContain('/')
    expect(schema.site).toContain('/about')

    expect(schema.app).toBeDefined()
    expect(schema.app).toContain('/dashboard')
    expect(schema.app).toContain('/settings')
  })

  it('should include events and schedules in schema', async () => {
    const definition = createTestDefinition({
      events: {
        'User.created': 'async (user) => {}',
        'Order.completed': 'async (order) => {}',
      },
      schedules: {
        'every.hour': 'async () => {}',
        'every.day.at9am': 'async () => {}',
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)
    const response = await genericDO.fetch(createRequest('https://test.app.do/__schema'))

    const schema = await response.json() as JsonResponse

    expect(schema.events).toBeDefined()
    expect(schema.events).toContain('User.created')
    expect(schema.events).toContain('Order.completed')

    expect(schema.schedules).toBeDefined()
    expect(schema.schedules).toContain('every.hour')
    expect(schema.schedules).toContain('every.day.at9am')
  })

  it('should return schema with proper content-type', async () => {
    const definition = createTestDefinition()
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)
    const response = await genericDO.fetch(createRequest('https://test.app.do/__schema'))

    expect(response.headers.get('content-type')).toMatch(/application\/json/)
  })
})

// =============================================================================
// 6. Event Handling Tests
// =============================================================================

describe('DO event handling', () => {
  let registry: R2Bucket
  let state: DurableObjectState
  let env: ReturnType<typeof createMockEnv>

  beforeEach(async () => {
    registry = createMockRegistry()
    state = createMockState('test.app.do')
    env = createMockEnv(registry)
  })

  it('should handle incoming events', async () => {
    const definition = createTestDefinition({
      events: {
        'User.created': `async (user) => {
          await $.db.put('lastUser', user)
          return 'handled'
        }`,
      },
      api: {
        getLastUser: 'async () => $.db.get("lastUser")',
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)

    // Send an event
    const eventResponse = await genericDO.fetch(
      createRequest('https://test.app.do/__event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'User.created',
          data: { id: '123', name: 'Alice' },
        }),
      })
    )

    expect(eventResponse.status).toBe(200)

    // Verify the event was handled
    const getResponse = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'getLastUser', params: [] }),
      })
    )

    const body = await getResponse.json() as JsonResponse
    expect(body.result).toEqual({ id: '123', name: 'Alice' })
  })

  it('should ignore unhandled events gracefully', async () => {
    const definition = createTestDefinition({
      events: {
        'User.created': 'async (user) => {}',
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))

    const genericDO = new DO(state, env)

    // Send an unhandled event
    const response = await genericDO.fetch(
      createRequest('https://test.app.do/__event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'Order.created', // Not defined in events
          data: { id: '456' },
        }),
      })
    )

    // Should return 200 (no error, just ignored)
    expect(response.status).toBe(200)
    const body = await response.json() as JsonResponse
    expect(body.handled).toBe(false)
  })
})

// =============================================================================
// 7. MCP (Model Context Protocol) Tests
// =============================================================================

describe('DO MCP', () => {
  let registry: R2Bucket
  let state: DurableObjectState
  let env: ReturnType<typeof createMockEnv>

  beforeEach(async () => {
    registry = createMockRegistry()
    state = createMockState('test.app.do')
    env = createMockEnv(registry)

    const definition = createTestDefinition({
      api: {
        ping: 'async () => "pong"',
        users: {
          list: 'async () => []',
          get: 'async (id) => ({ id })',
        },
      },
    })
    await registry.put('test.app.do', JSON.stringify({ definition }))
  })

  it('should expose /mcp endpoint', async () => {
    const genericDO = new DO(state, env)
    const response = await genericDO.fetch(createRequest('https://test.app.do/mcp'))

    expect(response.status).toBe(200)
  })

  it('should return MCP-compatible tool definitions', async () => {
    const genericDO = new DO(state, env)
    const response = await genericDO.fetch(
      createRequest('https://test.app.do/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'tools/list', params: {} }),
      })
    )

    const body = await response.json() as JsonResponse

    expect(body.tools).toBeDefined()
    expect(Array.isArray(body.tools)).toBe(true)

    // Each tool should have name, description, inputSchema
    const pingTool = body.tools.find((t: { name: string }) => t.name === 'ping')
    expect(pingTool).toBeDefined()
    expect(pingTool.inputSchema).toBeDefined()
  })

  it('should handle MCP tool calls', async () => {
    const genericDO = new DO(state, env)
    const response = await genericDO.fetch(
      createRequest('https://test.app.do/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'tools/call',
          params: {
            name: 'ping',
            arguments: {},
          },
        }),
      })
    )

    const body = await response.json() as JsonResponse
    expect(body.content).toBeDefined()
    expect(body.content[0].text).toBe('pong')
  })
})

// =============================================================================
// 8. Context Factory Tests
// =============================================================================

describe('createContext', () => {
  it('should create DOContext with $id from state', () => {
    const state = createMockState('my-do.app')
    const env = createMockEnv(createMockRegistry())

    const ctx = createContext(state, env, { $id: 'my-do.app', $type: 'SaaS' })

    expect(ctx.$id).toBe('my-do.app')
    expect(ctx.$type).toBe('SaaS')
  })

  it('should provide db interface', () => {
    const state = createMockState('my-do.app')
    const env = createMockEnv(createMockRegistry())

    const ctx = createContext(state, env, { $id: 'my-do.app' })

    expect(ctx.db).toBeDefined()
    expect(typeof ctx.db.get).toBe('function')
    expect(typeof ctx.db.put).toBe('function')
    expect(typeof ctx.db.delete).toBe('function')
  })

  it('should provide ai interface', () => {
    const state = createMockState('my-do.app')
    const env = createMockEnv(createMockRegistry())

    const ctx = createContext(state, env, { $id: 'my-do.app' })

    expect(ctx.ai).toBeDefined()
    expect(typeof ctx.ai.generate).toBe('function')
  })

  it('should provide fsx interface', () => {
    const state = createMockState('my-do.app')
    const env = createMockEnv(createMockRegistry())

    const ctx = createContext(state, env, { $id: 'my-do.app' })

    expect(ctx.fsx).toBeDefined()
    expect(typeof ctx.fsx.read).toBe('function')
    expect(typeof ctx.fsx.write).toBe('function')
    expect(typeof ctx.fsx.list).toBe('function')
    expect(typeof ctx.fsx.delete).toBe('function')
  })

  it('should provide emit function', () => {
    const state = createMockState('my-do.app')
    const env = createMockEnv(createMockRegistry())

    const ctx = createContext(state, env, { $id: 'my-do.app' })

    expect(typeof ctx.emit).toBe('function')
  })

  it('should provide config from definition', () => {
    const state = createMockState('my-do.app')
    const env = createMockEnv(createMockRegistry())

    const ctx = createContext(state, env, {
      $id: 'my-do.app',
      config: { apiKey: 'test', maxItems: 50 },
    })

    expect(ctx.config).toEqual({ apiKey: 'test', maxItems: 50 })
  })
})

// =============================================================================
// 9. Definition Update Tests
// =============================================================================

describe('DO definition updates', () => {
  let registry: R2Bucket
  let state: DurableObjectState
  let env: ReturnType<typeof createMockEnv>

  beforeEach(async () => {
    registry = createMockRegistry()
    state = createMockState('test.app.do')
    env = createMockEnv(registry)
  })

  it('should allow PUT to create/update definition', async () => {
    const genericDO = new DO(state, env)

    const definition = {
      $id: 'test.app.do',
      api: {
        hello: 'async (name) => `Hello ${name}!`',
      },
    }

    const response = await genericDO.fetch(
      createRequest('https://test.app.do/', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify(definition),
      })
    )

    expect(response.status).toBe(200)

    // Verify the definition was stored
    const storedDef = await registry.get('test.app.do')
    expect(storedDef).toBeDefined()
  })

  it('should require authentication for PUT', async () => {
    const genericDO = new DO(state, env)

    const response = await genericDO.fetch(
      createRequest('https://test.app.do/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $id: 'test.app.do', api: {} }),
      })
    )

    expect(response.status).toBe(401)
  })

  it('should invalidate cache on definition update', async () => {
    // Setup initial definition
    const initialDef = createTestDefinition({
      api: { version: 'async () => "v1"' },
    })
    await registry.put('test.app.do', JSON.stringify({ definition: initialDef }))

    const genericDO = new DO(state, env)

    // First call loads and caches v1
    const v1Response = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'version', params: [] }),
      })
    )
    expect((await v1Response.json() as JsonResponse).result).toBe('v1')

    // Update definition to v2
    const updatedDef = createTestDefinition({
      api: { version: 'async () => "v2"' },
    })

    await genericDO.fetch(
      createRequest('https://test.app.do/', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify(updatedDef),
      })
    )

    // Subsequent call should use v2
    const v2Response = await genericDO.fetch(
      createRequest('https://test.app.do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'version', params: [] }),
      })
    )
    expect((await v2Response.json() as JsonResponse).result).toBe('v2')
  })
})
