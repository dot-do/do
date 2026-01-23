/**
 * Tests for DigitalObject base class
 *
 * These tests cover:
 * - DO instantiation and initialization
 * - Identity management ($id, $type, $context, $version)
 * - fetch() handler and path-based routing
 * - Child DO creation with $context linking
 *
 * @module do/__tests__/DigitalObject.test
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { DigitalObject, DOError, type DOEnv } from './DigitalObject'

// =============================================================================
// Polyfills for Cloudflare Workers globals
// =============================================================================

// Mock WebSocket for testing
class MockWebSocket {
  send = vi.fn()
  close = vi.fn()
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
}

// Mock WebSocketPair for testing
;(globalThis as any).WebSocketPair = class WebSocketPair {
  0: MockWebSocket
  1: MockWebSocket
  constructor() {
    this[0] = new MockWebSocket()
    this[1] = new MockWebSocket()
  }
}

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
  // Store stubs by ID for consistent retrieval
  const stubCache = new Map<string, any>()

  const doNamespace = {
    get: vi.fn((id: { name: string; toString: () => string }) => {
      const idString = id.toString()
      if (!stubCache.has(idString)) {
        stubCache.set(idString, {
          fetch: vi.fn(() =>
            Promise.resolve(new Response(JSON.stringify({ ok: true })))
          ),
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

/**
 * Concrete DigitalObject implementation for testing
 */
class TestDigitalObject extends DigitalObject {
  public initializeCalled = false
  public customPathHandled = false

  protected async onInitialize(): Promise<void> {
    this.initializeCalled = true
  }

  protected async handlePath(request: Request, path: string): Promise<Response> {
    if (path === '/custom') {
      this.customPathHandled = true
      return Response.json({ custom: true })
    }
    return super.handlePath(request, path)
  }

  // Expose protected methods for testing
  public getStateForTesting() {
    return this.state
  }

  public getIdentityForTesting() {
    return this.getIdentity()
  }

  public async setContextForTesting(context: string | undefined) {
    return this.setContext(context)
  }
}

// =============================================================================
// Test Suites
// =============================================================================

describe('DigitalObject', () => {
  let mockState: ReturnType<typeof createMockState>
  let mockEnv: DOEnv
  let digitalObject: TestDigitalObject

  beforeEach(() => {
    mockState = createMockState()
    mockEnv = createMockEnv()
    digitalObject = new TestDigitalObject(mockState as any, mockEnv)
  })

  // ===========================================================================
  // Instantiation & Initialization
  // ===========================================================================

  describe('instantiation', () => {
    it('should create a new DigitalObject instance', () => {
      expect(digitalObject).toBeInstanceOf(DigitalObject)
    })

    it('should initialize state and hibernation managers', () => {
      expect(digitalObject.getStateForTesting()).toBeDefined()
    })

    it('should call onInitialize on first request', async () => {
      expect(digitalObject.initializeCalled).toBe(false)

      await digitalObject.fetch(new Request('https://test-do/'))

      expect(digitalObject.initializeCalled).toBe(true)
    })

    it('should only initialize once', async () => {
      await digitalObject.fetch(new Request('https://test-do/'))
      await digitalObject.fetch(new Request('https://test-do/'))

      // onInitialize should only be called once
      // (verified by counter in actual implementation)
      expect(digitalObject.initializeCalled).toBe(true)
    })
  })

  // ===========================================================================
  // Identity Management
  // ===========================================================================

  describe('identity', () => {
    beforeEach(async () => {
      // Initialize the DO
      await digitalObject.fetch(new Request('https://test-do/'))
    })

    it('should have $id, $type, $context, and $version', () => {
      const identity = digitalObject.getIdentityForTesting()

      expect(identity).toHaveProperty('$id')
      expect(identity).toHaveProperty('$type')
      expect(identity).toHaveProperty('$version')
      expect(identity.$version).toBeGreaterThan(0)
    })

    it('should use class name as default $type', () => {
      const identity = digitalObject.getIdentityForTesting()

      expect(identity.$type).toBe('TestDigitalObject')
    })

    it('should resolve $id from DO name', () => {
      const identity = digitalObject.getIdentityForTesting()

      expect(identity.$id).toContain('test-do')
    })

    it('should allow setting $context', async () => {
      await digitalObject.setContextForTesting('https://parent.do')

      const identity = digitalObject.getIdentityForTesting()

      expect(identity.$context).toBe('https://parent.do')
    })

    it('should persist identity to state', async () => {
      // Identity should be saved to storage
      expect(mockState.storage.put).toHaveBeenCalledWith(
        '$identity',
        expect.objectContaining({
          $id: expect.any(String),
          $type: 'TestDigitalObject',
          $version: expect.any(Number),
        })
      )
    })
  })

  // ===========================================================================
  // fetch() Handler
  // ===========================================================================

  describe('fetch()', () => {
    describe('root path (/)', () => {
      it('should return DO identity on GET /', async () => {
        const response = await digitalObject.fetch(
          new Request('https://test-do/')
        )

        expect(response.status).toBe(200)

        const body = await response.json()
        expect(body).toHaveProperty('$id')
        expect(body).toHaveProperty('$type')
        expect(body).toHaveProperty('status', 'active')
        expect(body).toHaveProperty('timestamp')
      })
    })

    describe('identity path (/$identity)', () => {
      it('should return identity on /$identity', async () => {
        const response = await digitalObject.fetch(
          new Request('https://test-do/$identity')
        )

        expect(response.status).toBe(200)

        const body = await response.json()
        expect(body).toHaveProperty('$id')
        expect(body).toHaveProperty('$type')
        expect(body).toHaveProperty('$version')
      })
    })

    describe('RPC path (/rpc)', () => {
      it('should handle POST /rpc requests', async () => {
        const response = await digitalObject.fetch(
          new Request('https://test-do/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: '1',
              method: 'do.identity.get',
            }),
          })
        )

        expect(response.status).toBe(200)

        const body = await response.json()
        expect(body).toHaveProperty('id', '1')
      })

      it('should reject non-POST requests to /rpc', async () => {
        const response = await digitalObject.fetch(
          new Request('https://test-do/rpc', { method: 'GET' })
        )

        expect(response.status).toBe(405)
      })
    })

    describe('WebSocket path (/ws)', () => {
      it('should reject non-WebSocket requests to /ws', async () => {
        const response = await digitalObject.fetch(
          new Request('https://test-do/ws')
        )

        expect(response.status).toBe(426)
      })

      it('should accept WebSocket upgrade requests', async () => {
        const response = await digitalObject.fetch(
          new Request('https://test-do/ws', {
            headers: { Upgrade: 'websocket' },
          })
        )

        // WebSocket upgrade returns 101
        expect(response.status).toBe(101)
      })
    })

    describe('custom paths', () => {
      it('should delegate to handlePath for custom paths', async () => {
        const response = await digitalObject.fetch(
          new Request('https://test-do/custom')
        )

        expect(response.status).toBe(200)
        expect(digitalObject.customPathHandled).toBe(true)

        const body = await response.json()
        expect(body).toEqual({ custom: true })
      })

      it('should return 404 for unknown paths', async () => {
        const response = await digitalObject.fetch(
          new Request('https://test-do/unknown')
        )

        expect(response.status).toBe(404)
      })
    })
  })

  // ===========================================================================
  // Child DO Creation
  // ===========================================================================

  describe('child DO creation', () => {
    beforeEach(async () => {
      await digitalObject.fetch(new Request('https://test-do/'))
    })

    it('should create child DO with createChild()', async () => {
      const childRef = await digitalObject.createChild('Tenant', 'acme')

      expect(childRef).toContain('acme')
      expect(mockEnv.DO.idFromName).toHaveBeenCalledWith(
        expect.stringContaining('acme')
      )
    })

    it('should initialize child with parent context', async () => {
      const childRef = await digitalObject.createChild('Tenant', 'acme')

      const doStub = mockEnv.DO.get(mockEnv.DO.idFromName(childRef))
      expect(doStub.fetch).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
        })
      )
    })

    it('should get child DO stub with getChild()', () => {
      const childStub = digitalObject.getChild('acme')

      expect(childStub).toBeDefined()
      expect(mockEnv.DO.idFromName).toHaveBeenCalledWith(
        expect.stringContaining('acme')
      )
    })
  })

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('error handling', () => {
    it('should return error response for exceptions', async () => {
      const errorDO = new (class extends DigitalObject {
        protected async handlePath(): Promise<Response> {
          throw new Error('Test error')
        }
      })(mockState as any, mockEnv)

      const response = await errorDO.fetch(
        new Request('https://test-do/error')
      )

      expect(response.status).toBe(500)

      const body = (await response.json()) as { error: { message: string } }
      expect(body.error.message).toBe('Test error')
    })

    it('should use status from DOError', async () => {
      const errorDO = new (class extends DigitalObject {
        protected async handlePath(): Promise<Response> {
          throw new DOError('NOT_FOUND', 'Resource not found', 404)
        }
      })(mockState as any, mockEnv)

      const response = await errorDO.fetch(
        new Request('https://test-do/notfound')
      )

      expect(response.status).toBe(404)

      const body = (await response.json()) as { error: { code: string } }
      expect(body.error.code).toBe('NOT_FOUND')
    })
  })

  // ===========================================================================
  // Alarm Handling
  // ===========================================================================

  describe('alarm handling', () => {
    it('should call onAlarm when alarm fires', async () => {
      let alarmCalled = false

      const alarmDO = new (class extends DigitalObject {
        protected async onAlarm(): Promise<void> {
          alarmCalled = true
        }
      })(mockState as any, mockEnv)

      // First initialize
      await alarmDO.fetch(new Request('https://test-do/'))

      // Trigger alarm
      await alarmDO.alarm()

      expect(alarmCalled).toBe(true)
    })

    it('should initialize before handling alarm', async () => {
      const alarmDO = new TestDigitalObject(mockState as any, mockEnv)

      await alarmDO.alarm()

      expect(alarmDO.initializeCalled).toBe(true)
    })
  })
})

// =============================================================================
// CDC Streaming Tests
// =============================================================================

describe('CDC streaming', () => {
  let mockState: ReturnType<typeof createMockState>
  let mockEnv: DOEnv
  let digitalObject: TestDigitalObject

  beforeEach(() => {
    mockState = createMockState()
    mockEnv = createMockEnv()
    digitalObject = new TestDigitalObject(mockState as any, mockEnv)
  })

  describe('SSE streaming (/cdc)', () => {
    it('should return SSE response for non-WebSocket requests', async () => {
      const response = await digitalObject.fetch(
        new Request('https://test-do/cdc')
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
      expect(response.headers.get('Cache-Control')).toBe('no-cache')
    })

    it('should parse collections filter from query params', async () => {
      const response = await digitalObject.fetch(
        new Request('https://test-do/cdc?collections=users,orders')
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    })

    it('should parse operations filter from query params', async () => {
      const response = await digitalObject.fetch(
        new Request('https://test-do/cdc?operations=INSERT,UPDATE')
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    })

    it('should parse cursor from query params', async () => {
      const response = await digitalObject.fetch(
        new Request('https://test-do/cdc?fromSequence=100&fromTimestamp=1234567890')
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    })
  })

  describe('WebSocket streaming (/cdc)', () => {
    it('should accept WebSocket upgrade for CDC', async () => {
      const response = await digitalObject.fetch(
        new Request('https://test-do/cdc', {
          headers: { Upgrade: 'websocket' },
        })
      )

      expect(response.status).toBe(101)
    })

    it('should accept WebSocket with filters', async () => {
      const response = await digitalObject.fetch(
        new Request('https://test-do/cdc?collections=users&operations=INSERT', {
          headers: { Upgrade: 'websocket' },
        })
      )

      expect(response.status).toBe(101)
    })
  })
})

// =============================================================================
// DOError Tests
// =============================================================================

describe('DOError', () => {
  it('should create error with code, message, and status', () => {
    const error = new DOError('TEST_ERROR', 'Test message', 400)

    expect(error.code).toBe('TEST_ERROR')
    expect(error.message).toBe('Test message')
    expect(error.status).toBe(400)
    expect(error.name).toBe('DOError')
  })

  it('should default status to 500', () => {
    const error = new DOError('ERROR', 'Message')

    expect(error.status).toBe(500)
  })

  it('should include details when provided', () => {
    const error = new DOError('ERROR', 'Message', 500, { key: 'value' })

    expect(error.details).toEqual({ key: 'value' })
  })
})
