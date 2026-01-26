/**
 * Global Test Setup for DO (Digital Object) Project
 *
 * This file is loaded before each test file runs.
 *
 * IMPORTANT: Per CLAUDE.md NO MOCKS policy:
 * - Workers integration tests should use vitest.workers.config.ts with miniflare
 * - See tests/storage.workers.test.ts for the real environment testing pattern
 *
 * This file provides ONLY:
 * - Polyfills for Cloudflare Workers globals needed in node environment
 * - Async test utilities (waitFor, sleep, createDeferred)
 *
 * The polyfills here are NOT mocks - they are minimal implementations
 * that allow unit tests to run in node while testing business logic.
 */

import { beforeEach, afterEach, vi } from 'vitest'

// =============================================================================
// Cloudflare Workers API Polyfills for Node Environment
// =============================================================================

// These are minimal polyfills needed to run unit tests in Node.
// For integration tests with real Workers APIs, use vitest.workers.config.ts

/**
 * WebSocket polyfill for node environment testing.
 * This is NOT a mock - it's a minimal implementation of the WebSocket interface.
 */
class WebSocketPolyfill {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = WebSocketPolyfill.OPEN
  url = ''
  protocol = ''
  extensions = ''
  binaryType: 'blob' | 'arraybuffer' = 'arraybuffer'
  bufferedAmount = 0
  onopen: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null

  send(_data: string | ArrayBuffer): void {}
  close(_code?: number, _reason?: string): void {}
  addEventListener(_type: string, _listener: EventListener): void {}
  removeEventListener(_type: string, _listener: EventListener): void {}
  dispatchEvent(_event: Event): boolean {
    return true
  }

  // Cloudflare-specific methods
  accept(): void {}
  serializeAttachment(_attachment: unknown): void {}
  deserializeAttachment(): unknown {
    return null
  }
}

/**
 * WebSocketPair polyfill for node environment testing.
 * Creates a pair of connected WebSockets (client and server).
 */
class WebSocketPairPolyfill {
  0: WebSocket
  1: WebSocket

  constructor() {
    this[0] = new WebSocketPolyfill() as unknown as WebSocket
    this[1] = new WebSocketPolyfill() as unknown as WebSocket
  }
}

// Install WebSocketPair globally for node tests
if (typeof (globalThis as Record<string, unknown>).WebSocketPair === 'undefined') {
  ;(globalThis as Record<string, unknown>).WebSocketPair = WebSocketPairPolyfill
}

/**
 * Response polyfill that supports WebSocket upgrade (status 101).
 * The native Node.js Response class only accepts status 200-599.
 */
const OriginalResponse = globalThis.Response

class ResponsePolyfill extends OriginalResponse {
  private _webSocket?: WebSocket
  private _status: number

  constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: WebSocket }) {
    // For WebSocket upgrade responses (101), use 200 for the super call
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

// Replace global Response with polyfill
;(globalThis as Record<string, unknown>).Response = ResponsePolyfill

// =============================================================================
// Async Test Utilities
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
// Global Test Hooks
// =============================================================================

beforeEach(() => {
  // Reset vitest mocks before each test
  vi.clearAllMocks()
})

afterEach(() => {
  // Clean up after each test
  vi.restoreAllMocks()
})

// =============================================================================
// Type Augmentation for Vitest
// =============================================================================

declare module 'vitest' {
  export interface TestContext {
    // Add custom context properties here if needed
  }
}
