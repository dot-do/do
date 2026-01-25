/**
 * Tests for RPC Reflection in DigitalObject
 *
 * RED PHASE: These tests define the desired behavior for automatic RPC method exposure
 * using TypeScript reflection, similar to rpc.do's DurableRPC pattern.
 *
 * The current DigitalObject uses MANUAL registration via registerRPCMethods().
 * These tests should FAIL until we implement automatic reflection.
 *
 * Key behaviors to implement:
 * 1. Public methods on DO subclasses are automatically accessible via RPC
 * 2. Namespace objects (objects with function properties) are automatically exposed
 * 3. Private methods (starting with _) are NOT exposed via RPC
 * 4. System methods (fetch, alarm, webSocket*) are NOT exposed via RPC
 * 5. Collections defined as class properties are automatically accessible
 * 6. The /__schema endpoint returns method/namespace info
 * 7. RPC calls can be made via HTTP POST
 *
 * Reference: /Users/nathanclevenger/projects/rpc.do/core/src/index.ts (DurableRPC, RpcInterface)
 *
 * @module do/__tests__/rpc-reflection.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DigitalObject, type DOEnv } from '../DigitalObject'

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Mock DurableObjectState for testing
 */
function createMockState() {
  const storage = new Map<string, unknown>()
  let alarm: number | null = null

  return {
    id: {
      name: 'test-do',
      toString: () => 'test-do-id',
    },
    storage: {
      get: vi.fn((key: string) => Promise.resolve(storage.get(key))),
      put: vi.fn((key: string, value: unknown) => {
        storage.set(key, value)
        return Promise.resolve()
      }),
      delete: vi.fn((key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key]
        let deleted = false
        for (const k of keys) {
          if (storage.has(k)) {
            storage.delete(k)
            deleted = true
          }
        }
        return Promise.resolve(deleted)
      }),
      list: vi.fn(() => Promise.resolve(new Map(storage))),
      setAlarm: vi.fn((time: number) => {
        alarm = time
        return Promise.resolve()
      }),
      getAlarm: vi.fn(() => Promise.resolve(alarm)),
      deleteAlarm: vi.fn(() => {
        alarm = null
        return Promise.resolve()
      }),
    },
    blockConcurrencyWhile: vi.fn(<T>(fn: () => Promise<T>) => fn()),
    acceptWebSocket: vi.fn(),
    waitUntil: vi.fn(),
  }
}

/**
 * Mock DOEnv for testing
 */
function createMockEnv(): DOEnv {
  const stubCache = new Map<string, any>()

  const doNamespace = {
    get: vi.fn((id: { name: string; toString: () => string }) => {
      const idString = id.toString()
      if (!stubCache.has(idString)) {
        stubCache.set(idString, {
          fetch: vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true })))),
        })
      }
      return stubCache.get(idString)
    }),
    idFromName: vi.fn((name: string) => ({ name, toString: () => name })),
    idFromString: vi.fn((id: string) => ({ name: id, toString: () => id })),
    newUniqueId: vi.fn(() => ({
      name: `unique-${Date.now()}`,
      toString: () => `unique-${Date.now()}`,
    })),
  }

  return {
    DO: doNamespace as unknown as DurableObjectNamespace,
  }
}

// =============================================================================
// Test DO with Public Methods (should be auto-exposed)
// =============================================================================

/**
 * Test DigitalObject that uses the NEW automatic reflection pattern.
 *
 * Methods defined directly on the class should be automatically exposed via RPC
 * WITHOUT needing to call registerRPCMethods() or use MethodRegistry.
 */
class TestReflectionDO extends DigitalObject {
  /**
   * A public async method that should be auto-exposed via RPC
   * Expected RPC call: { method: 'publicMethod', params: { arg: 'world' } }
   */
  async publicMethod(arg: string): Promise<string> {
    return `Hello ${arg}`
  }

  /**
   * Another public method with multiple parameters
   */
  async addNumbers(a: number, b: number): Promise<number> {
    return a + b
  }

  /**
   * A sync method (should still be auto-exposed)
   */
  syncMethod(): string {
    return 'sync result'
  }

  /**
   * A method that uses state
   */
  async getConfig(): Promise<unknown> {
    return this.state.get('config')
  }

  /**
   * A namespace object with methods - should be auto-exposed
   * Expected RPC call: { method: 'users.get', params: { id: '123' } }
   */
  users = {
    get: async (id: string): Promise<{ id: string; name: string }> => {
      return { id, name: 'Test User' }
    },
    create: async (data: { name: string; email: string }): Promise<{ id: string; name: string; email: string }> => {
      return { id: 'new-id', ...data }
    },
    list: async (): Promise<Array<{ id: string; name: string }>> => {
      return [
        { id: '1', name: 'User 1' },
        { id: '2', name: 'User 2' },
      ]
    },
  }

  /**
   * Another namespace for orders
   */
  orders = {
    create: async (data: { items: string[] }): Promise<{ orderId: string; items: string[] }> => {
      return { orderId: 'order-123', items: data.items }
    },
    getStatus: async (orderId: string): Promise<{ orderId: string; status: string }> => {
      return { orderId, status: 'pending' }
    },
  }

  /**
   * Private method starting with _ - should NOT be exposed
   */
  private async _privateHelper(): Promise<string> {
    return 'private helper'
  }

  /**
   * Internal method starting with _ (not using private keyword) - should NOT be exposed
   */
  async _internalMethod(): Promise<string> {
    return 'internal'
  }

  /**
   * Method starting with __ (double underscore) - should NOT be exposed
   */
  async __superInternal(): Promise<string> {
    return 'super internal'
  }
}

// =============================================================================
// Test Suites
// =============================================================================

describe('RPC Reflection', () => {
  let mockState: ReturnType<typeof createMockState>
  let mockEnv: DOEnv
  let digitalObject: TestReflectionDO

  beforeEach(() => {
    mockState = createMockState()
    mockEnv = createMockEnv()
    digitalObject = new TestReflectionDO(mockState as any, mockEnv)
  })

  // ===========================================================================
  // Auto-expose Public Methods
  // ===========================================================================

  describe('auto-expose public methods', () => {
    it('should auto-expose publicMethod without manual registration', async () => {
      // Initialize the DO
      await digitalObject.fetch(new Request('https://test-do/'))

      // Call publicMethod via RPC without having registered it manually
      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '1',
            method: 'publicMethod',
            params: { arg: 'world' },
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; result: string }
      expect(body.id).toBe('1')
      expect(body.result).toBe('Hello world')
    })

    it('should auto-expose addNumbers method', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '2',
            method: 'addNumbers',
            params: { a: 5, b: 3 },
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; result: number }
      expect(body.result).toBe(8)
    })

    it('should auto-expose sync methods', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '3',
            method: 'syncMethod',
            params: {},
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; result: string }
      expect(body.result).toBe('sync result')
    })

    it('should auto-expose methods that access state', async () => {
      // Initialize first (this consumes any prior mocks via storage.get('$identity'))
      await digitalObject.fetch(new Request('https://test-do/'))

      // NOW set up the mock for the config key
      // DOState expects values wrapped in StoredValue format
      mockState.storage.get.mockResolvedValueOnce({
        value: { setting: 'value' },
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '4',
            method: 'getConfig',
            params: {},
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; result: unknown }
      expect(body.result).toEqual({ setting: 'value' })
    })
  })

  // ===========================================================================
  // Auto-expose Namespaces
  // ===========================================================================

  describe('auto-expose namespaces', () => {
    it('should auto-expose users.get namespace method', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '10',
            method: 'users.get',
            params: { id: 'user-123' },
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; result: { id: string; name: string } }
      expect(body.result).toEqual({ id: 'user-123', name: 'Test User' })
    })

    it('should auto-expose users.create namespace method', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '11',
            method: 'users.create',
            params: { name: 'New User', email: 'new@example.com' },
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; result: unknown }
      expect(body.result).toEqual({ id: 'new-id', name: 'New User', email: 'new@example.com' })
    })

    it('should auto-expose users.list namespace method', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '12',
            method: 'users.list',
            params: {},
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; result: unknown[] }
      expect(body.result).toHaveLength(2)
    })

    it('should auto-expose orders.create namespace method', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '13',
            method: 'orders.create',
            params: { items: ['item-1', 'item-2'] },
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; result: { orderId: string; items: string[] } }
      expect(body.result.orderId).toBe('order-123')
      expect(body.result.items).toEqual(['item-1', 'item-2'])
    })

    it('should auto-expose orders.getStatus namespace method', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '14',
            method: 'orders.getStatus',
            params: { orderId: 'order-456' },
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; result: { orderId: string; status: string } }
      expect(body.result).toEqual({ orderId: 'order-456', status: 'pending' })
    })
  })

  // ===========================================================================
  // NOT Expose Private/Internal Methods
  // ===========================================================================

  describe('NOT expose private methods', () => {
    it('should NOT expose methods starting with _ (underscore)', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '20',
            method: '_internalMethod',
            params: {},
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; error: { code: number; message: string } }
      expect(body.error).toBeDefined()
      expect(body.error.code).toBe(-32601) // Method not found
      expect(body.error.message).toContain('not found')
    })

    it('should NOT expose methods starting with __ (double underscore)', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '21',
            method: '__superInternal',
            params: {},
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; error: { code: number; message: string } }
      expect(body.error).toBeDefined()
      expect(body.error.code).toBe(-32601) // Method not found
    })

    it('should NOT expose _privateHelper (TypeScript private method)', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '22',
            method: '_privateHelper',
            params: {},
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; error: { code: number; message: string } }
      expect(body.error).toBeDefined()
      expect(body.error.code).toBe(-32601) // Method not found
    })
  })

  // ===========================================================================
  // NOT Expose System Methods
  // ===========================================================================

  describe('NOT expose system methods', () => {
    it('should NOT expose fetch method', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '30',
            method: 'fetch',
            params: {},
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; error: { code: number; message: string } }
      expect(body.error).toBeDefined()
      expect(body.error.code).toBe(-32601) // Method not found
    })

    it('should NOT expose alarm method', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '31',
            method: 'alarm',
            params: {},
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; error: { code: number; message: string } }
      expect(body.error).toBeDefined()
      expect(body.error.code).toBe(-32601) // Method not found
    })

    it('should NOT expose webSocketMessage method', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '32',
            method: 'webSocketMessage',
            params: {},
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; error: { code: number; message: string } }
      expect(body.error).toBeDefined()
      expect(body.error.code).toBe(-32601) // Method not found
    })

    it('should NOT expose webSocketClose method', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '33',
            method: 'webSocketClose',
            params: {},
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; error: { code: number; message: string } }
      expect(body.error).toBeDefined()
      expect(body.error.code).toBe(-32601) // Method not found
    })

    it('should NOT expose webSocketError method', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '34',
            method: 'webSocketError',
            params: {},
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; error: { code: number; message: string } }
      expect(body.error).toBeDefined()
      expect(body.error.code).toBe(-32601) // Method not found
    })

    it('should NOT expose constructor', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: '35',
            method: 'constructor',
            params: {},
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { id: string; error: { code: number; message: string } }
      expect(body.error).toBeDefined()
      expect(body.error.code).toBe(-32601) // Method not found
    })
  })

  // ===========================================================================
  // Schema Endpoint
  // ===========================================================================

  describe('/__schema endpoint', () => {
    it('should return schema with auto-discovered methods', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(new Request('https://test-do/__schema'))

      expect(response.status).toBe(200)
      const schema = (await response.json()) as {
        version: number
        methods: Array<{ name: string; path: string; params: number }>
        namespaces: Array<{ name: string; methods: Array<{ name: string; path: string }> }>
      }

      // Should have version
      expect(schema.version).toBe(1)

      // Should have methods array with auto-discovered methods
      expect(schema.methods).toBeDefined()
      expect(Array.isArray(schema.methods)).toBe(true)

      // Should include publicMethod
      const publicMethod = schema.methods.find((m) => m.name === 'publicMethod')
      expect(publicMethod).toBeDefined()

      // Should include addNumbers
      const addNumbers = schema.methods.find((m) => m.name === 'addNumbers')
      expect(addNumbers).toBeDefined()

      // Should include syncMethod
      const syncMethod = schema.methods.find((m) => m.name === 'syncMethod')
      expect(syncMethod).toBeDefined()

      // Should NOT include _internalMethod
      const internalMethod = schema.methods.find((m) => m.name === '_internalMethod')
      expect(internalMethod).toBeUndefined()

      // Should NOT include system methods
      const fetchMethod = schema.methods.find((m) => m.name === 'fetch')
      expect(fetchMethod).toBeUndefined()
    })

    it('should return schema with auto-discovered namespaces', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(new Request('https://test-do/__schema'))

      expect(response.status).toBe(200)
      const schema = (await response.json()) as {
        namespaces: Array<{ name: string; methods: Array<{ name: string; path: string }> }>
      }

      // Should have namespaces array
      expect(schema.namespaces).toBeDefined()
      expect(Array.isArray(schema.namespaces)).toBe(true)

      // Should include users namespace
      const usersNamespace = schema.namespaces.find((ns) => ns.name === 'users')
      expect(usersNamespace).toBeDefined()
      expect(usersNamespace!.methods).toContainEqual(expect.objectContaining({ name: 'get', path: 'users.get' }))
      expect(usersNamespace!.methods).toContainEqual(expect.objectContaining({ name: 'create', path: 'users.create' }))
      expect(usersNamespace!.methods).toContainEqual(expect.objectContaining({ name: 'list', path: 'users.list' }))

      // Should include orders namespace
      const ordersNamespace = schema.namespaces.find((ns) => ns.name === 'orders')
      expect(ordersNamespace).toBeDefined()
      expect(ordersNamespace!.methods).toContainEqual(expect.objectContaining({ name: 'create', path: 'orders.create' }))
      expect(ordersNamespace!.methods).toContainEqual(expect.objectContaining({ name: 'getStatus', path: 'orders.getStatus' }))
    })

    it('should also respond to GET / with schema (like rpc.do)', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      const response = await digitalObject.fetch(new Request('https://test-do/__schema', { method: 'GET' }))

      expect(response.status).toBe(200)
      const schema = (await response.json()) as { version: number }
      expect(schema.version).toBe(1)
    })
  })

  // ===========================================================================
  // HTTP Batch RPC
  // ===========================================================================

  describe('HTTP batch RPC', () => {
    it('should handle batch RPC requests', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))

      // Send batch request (array of RPC calls)
      const response = await digitalObject.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([
            { id: '1', method: 'publicMethod', params: { arg: 'first' } },
            { id: '2', method: 'addNumbers', params: { a: 1, b: 2 } },
            { id: '3', method: 'users.get', params: { id: 'batch-user' } },
          ]),
        })
      )

      expect(response.status).toBe(200)
      const results = (await response.json()) as Array<{ id: string; result: unknown }>

      expect(Array.isArray(results)).toBe(true)
      expect(results).toHaveLength(3)

      expect(results[0].id).toBe('1')
      expect(results[0].result).toBe('Hello first')

      expect(results[1].id).toBe('2')
      expect(results[1].result).toBe(3)

      expect(results[2].id).toBe('3')
      expect((results[2].result as { id: string }).id).toBe('batch-user')
    })
  })

  // ===========================================================================
  // Method Binding Context
  // ===========================================================================

  describe('method binding context', () => {
    it('should bind methods to the correct this context', async () => {
      // Create a DO that accesses this.state in methods
      class StatefulDO extends DigitalObject {
        private counter = 0

        async increment(): Promise<number> {
          this.counter++
          return this.counter
        }

        async getCounter(): Promise<number> {
          return this.counter
        }
      }

      const statefulDO = new StatefulDO(mockState as any, mockEnv)
      await statefulDO.fetch(new Request('https://test-do/'))

      // Call increment
      const incResponse = await statefulDO.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: '1', method: 'increment', params: {} }),
        })
      )
      const incBody = (await incResponse.json()) as { result: number }
      expect(incBody.result).toBe(1)

      // Call getCounter - should see the incremented value
      const getResponse = await statefulDO.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: '2', method: 'getCounter', params: {} }),
        })
      )
      const getBody = (await getResponse.json()) as { result: number }
      expect(getBody.result).toBe(1)
    })

    it('should bind namespace methods to their namespace object', async () => {
      // Create a DO where namespace methods reference each other
      class NamespacedDO extends DigitalObject {
        items: string[] = []

        cart = {
          add: async (item: string): Promise<void> => {
            this.items.push(item)
          },
          list: async (): Promise<string[]> => {
            return this.items
          },
          count: async (): Promise<number> => {
            return this.items.length
          },
        }
      }

      const namespacedDO = new NamespacedDO(mockState as any, mockEnv)
      await namespacedDO.fetch(new Request('https://test-do/'))

      // Add item
      await namespacedDO.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: '1', method: 'cart.add', params: { item: 'apple' } }),
        })
      )

      // Add another item
      await namespacedDO.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: '2', method: 'cart.add', params: { item: 'banana' } }),
        })
      )

      // List items
      const listResponse = await namespacedDO.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: '3', method: 'cart.list', params: {} }),
        })
      )
      const listBody = (await listResponse.json()) as { result: string[] }
      expect(listBody.result).toEqual(['apple', 'banana'])

      // Count items
      const countResponse = await namespacedDO.fetch(
        new Request('https://test-do/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: '4', method: 'cart.count', params: {} }),
        })
      )
      const countBody = (await countResponse.json()) as { result: number }
      expect(countBody.result).toBe(2)
    })
  })
})

// =============================================================================
// Backward Compatibility Tests
// =============================================================================

describe('backward compatibility', () => {
  let mockState: ReturnType<typeof createMockState>
  let mockEnv: DOEnv

  beforeEach(() => {
    mockState = createMockState()
    mockEnv = createMockEnv()
  })

  it('should still support manually registered methods via registerRPCMethods', async () => {
    // A DO that uses the OLD pattern (manual registration)
    class LegacyDO extends DigitalObject {
      protected registerRPCMethods(): void {
        this.rpcRegistry.register('legacy.method', async (params) => {
          const { value } = params as { value: string }
          return `legacy: ${value}`
        })
      }
    }

    const legacyDO = new LegacyDO(mockState as any, mockEnv)
    await legacyDO.fetch(new Request('https://test-do/'))

    const response = await legacyDO.fetch(
      new Request('https://test-do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: '1',
          method: 'legacy.method',
          params: { value: 'test' },
        }),
      })
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { id: string; result: string }
    expect(body.result).toBe('legacy: test')
  })

  it('should merge manually registered methods with auto-discovered methods', async () => {
    class HybridDO extends DigitalObject {
      // Auto-discovered method
      async autoMethod(): Promise<string> {
        return 'auto'
      }

      // Manually registered method
      protected registerRPCMethods(): void {
        this.rpcRegistry.register('manual.method', async () => {
          return 'manual'
        })
      }
    }

    const hybridDO = new HybridDO(mockState as any, mockEnv)
    await hybridDO.fetch(new Request('https://test-do/'))

    // Call auto method
    const autoResponse = await hybridDO.fetch(
      new Request('https://test-do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '1', method: 'autoMethod', params: {} }),
      })
    )
    const autoBody = (await autoResponse.json()) as { result: string }
    expect(autoBody.result).toBe('auto')

    // Call manual method
    const manualResponse = await hybridDO.fetch(
      new Request('https://test-do/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '2', method: 'manual.method', params: {} }),
      })
    )
    const manualBody = (await manualResponse.json()) as { result: string }
    expect(manualBody.result).toBe('manual')
  })
})
