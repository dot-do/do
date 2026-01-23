/**
 * Global Test Setup for DO (Digital Object) Project
 *
 * This file is loaded before each test file runs.
 * Use it to configure global test utilities and mocks.
 */

import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'

// =============================================================================
// Cloudflare Workers API Mocks
// =============================================================================

// Define BinaryType locally since it's not always available in all environments
type BinaryType = 'blob' | 'arraybuffer'

/**
 * Mock WebSocket for testing
 */
class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = MockWebSocket.OPEN
  url = ''
  protocol = ''
  extensions = ''
  binaryType: BinaryType = 'arraybuffer'
  bufferedAmount = 0
  onopen: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null

  send = vi.fn()
  close = vi.fn()
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  dispatchEvent = vi.fn(() => true)

  // Cloudflare-specific
  accept = vi.fn()
  serializeAttachment = vi.fn()
  deserializeAttachment = vi.fn(() => null)
}

/**
 * Mock WebSocketPair for Cloudflare Workers compatibility
 * Creates a pair of connected WebSockets (client and server)
 */
class MockWebSocketPair {
  0: WebSocket
  1: WebSocket

  constructor() {
    this[0] = new MockWebSocket() as unknown as WebSocket
    this[1] = new MockWebSocket() as unknown as WebSocket
  }
}

// Install WebSocketPair globally for tests
;(globalThis as any).WebSocketPair = MockWebSocketPair

/**
 * Mock Response class that supports WebSocket upgrade (status 101)
 * The native Node.js Response class only accepts status 200-599
 */
const OriginalResponse = globalThis.Response

class MockResponse extends OriginalResponse {
  private _webSocket?: WebSocket
  private _status: number

  constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: WebSocket }) {
    // For WebSocket upgrade responses (101), use 200 for the super call
    // but track the actual status separately
    const actualStatus = init?.status ?? 200
    const superInit = { ...init, status: actualStatus === 101 ? 200 : actualStatus }

    super(body, superInit)
    this._status = actualStatus
    this._webSocket = init?.webSocket
  }

  get status(): number {
    return this._status
  }

  get webSocket(): WebSocket | null {
    return this._webSocket ?? null
  }
}

// Replace global Response with our mock
;(globalThis as any).Response = MockResponse

// =============================================================================
// Global Test Hooks
// =============================================================================

beforeAll(() => {
  // Set up global test environment
  // console.log('Starting test suite')
})

afterAll(() => {
  // Clean up global resources
  // console.log('Test suite complete')
})

beforeEach(() => {
  // Reset mocks before each test
  vi.clearAllMocks()
})

afterEach(() => {
  // Clean up after each test
  vi.restoreAllMocks()
})

// =============================================================================
// Global Test Utilities
// =============================================================================

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50 } = options
  const start = Date.now()

  while (!(await condition())) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor timed out after ${timeout}ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}

/**
 * Create a deferred promise for async testing
 */
export function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

/**
 * Sleep for a given duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// =============================================================================
// Type Augmentation for Vitest
// =============================================================================

declare module 'vitest' {
  export interface TestContext {
    // Add custom context properties here if needed
  }
}
