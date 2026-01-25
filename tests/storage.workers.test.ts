/**
 * Real Environment Workers Tests - NO MOCKS
 *
 * This test file demonstrates the proper pattern for testing Cloudflare Workers
 * using REAL miniflare environments instead of mocks.
 *
 * IMPORTANT: This is the TDD-RED phase - these tests are designed to FAIL
 * because the current codebase relies on mocks from tests/utils/mocks.ts.
 *
 * The tests/utils/mocks.ts file (466 lines) violates the NO MOCKS policy
 * from CLAUDE.md which states:
 * > **NO MOCKS**. Tests use real environments
 *
 * To pass these tests, the project needs:
 * 1. Proper @cloudflare/vitest-pool-workers configuration
 * 2. Durable Object bindings in test environment
 * 3. KV, R2, and AI bindings in miniflare
 *
 * @see vitest.workers.config.ts for Workers runtime configuration
 * @see proxy/wrangler.jsonc for binding definitions
 *
 * @module tests/storage.workers.test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'

// =============================================================================
// Types - These should match proxy/wrangler.jsonc bindings
// =============================================================================

interface Env {
  DO: DurableObjectNamespace
  KV: KVNamespace
  R2: R2Bucket
  AI: Ai
}

// =============================================================================
// DurableObject Storage Tests (Real Miniflare)
// =============================================================================

describe('DurableObject Storage (Real Miniflare)', () => {
  /**
   * Test that env bindings are available from miniflare
   *
   * This test will FAIL if:
   * - vitest.workers.config.ts is not properly configured
   * - Bindings are not defined in wrangler.jsonc
   * - Miniflare is not providing real DO storage
   */
  it('should have DO namespace binding available', () => {
    // env should be provided by @cloudflare/vitest-pool-workers
    expect(env).toBeDefined()
    expect((env as Env).DO).toBeDefined()
  })

  it('should create DO instance with real storage', async () => {
    const doEnv = env as Env
    expect(doEnv.DO).toBeDefined()

    // Get a DO stub using real miniflare
    const id = doEnv.DO.idFromName('test-storage-do')
    expect(id).toBeDefined()
    expect(id.toString()).toBeTruthy()

    const stub = doEnv.DO.get(id)
    expect(stub).toBeDefined()
  })

  it('should fetch from DO and get identity', async () => {
    const doEnv = env as Env
    const id = doEnv.DO.idFromName('test-fetch-do')
    const stub = doEnv.DO.get(id)

    // Simple fetch to root - this should work with real DO
    const response = await stub.fetch(new Request('https://internal/'))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty('$id')
    expect(body).toHaveProperty('$type')
  })

  it('should support health check endpoint', async () => {
    const doEnv = env as Env
    const id = doEnv.DO.idFromName('test-health-do')
    const stub = doEnv.DO.get(id)

    const response = await stub.fetch(new Request('https://internal/_health'))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty('status', 'ok')
  })

  it('should return identity on /_identity endpoint', async () => {
    const doEnv = env as Env
    const id = doEnv.DO.idFromName('test-identity-do')
    const stub = doEnv.DO.get(id)

    const response = await stub.fetch(new Request('https://internal/_identity'))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty('$id')
    expect(body).toHaveProperty('$type')
    expect(body).toHaveProperty('$version')
  })
})

// =============================================================================
// KV Namespace Tests (Real Miniflare)
// =============================================================================

describe('KV Namespace (Real Miniflare)', () => {
  /**
   * These tests use REAL miniflare KV, not createMockKVNamespace()
   */

  it('should have KV binding available', () => {
    expect((env as Env).KV).toBeDefined()
  })

  it('should put and get values with real KV storage', async () => {
    const kv = (env as Env).KV

    // Put a value
    await kv.put('test-key', 'test-value')

    // Get it back - real KV, not mock
    const value = await kv.get('test-key')
    expect(value).toBe('test-value')
  })

  it('should handle JSON values with real KV', async () => {
    const kv = (env as Env).KV

    const data = { name: 'test', nested: { count: 42 } }
    await kv.put('json-key', JSON.stringify(data))

    const retrieved = await kv.get('json-key', 'json')
    expect(retrieved).toEqual(data)
  })

  it('should list keys with real KV', async () => {
    const kv = (env as Env).KV

    // Put some values with prefix
    await kv.put('list-test:a', 'value-a')
    await kv.put('list-test:b', 'value-b')
    await kv.put('list-test:c', 'value-c')

    // List with prefix - real KV operation
    const list = await kv.list({ prefix: 'list-test:' })

    expect(list.keys.length).toBeGreaterThanOrEqual(3)
    expect(list.keys.map((k) => k.name)).toContain('list-test:a')
    expect(list.keys.map((k) => k.name)).toContain('list-test:b')
    expect(list.keys.map((k) => k.name)).toContain('list-test:c')
  })

  it('should delete keys with real KV', async () => {
    const kv = (env as Env).KV

    await kv.put('delete-me', 'temporary')
    expect(await kv.get('delete-me')).toBe('temporary')

    await kv.delete('delete-me')
    expect(await kv.get('delete-me')).toBeNull()
  })

  it('should handle metadata with real KV', async () => {
    const kv = (env as Env).KV

    await kv.put('meta-key', 'value', {
      metadata: { createdAt: Date.now(), author: 'test' },
    })

    const { value, metadata } = await kv.getWithMetadata('meta-key')
    expect(value).toBe('value')
    expect(metadata).toBeDefined()
    expect((metadata as { author: string }).author).toBe('test')
  })
})

// =============================================================================
// R2 Bucket Tests (Real Miniflare)
// =============================================================================

describe('R2 Bucket (Real Miniflare)', () => {
  /**
   * These tests use REAL miniflare R2, not createMockR2Bucket()
   */

  it('should have R2 binding available', () => {
    expect((env as Env).R2).toBeDefined()
  })

  it('should put and get objects with real R2', async () => {
    const r2 = (env as Env).R2

    // Put an object
    await r2.put('test-object', 'Hello, R2!')

    // Get it back - real R2, not mock
    const object = await r2.get('test-object')
    expect(object).not.toBeNull()

    const text = await object!.text()
    expect(text).toBe('Hello, R2!')
  })

  it('should handle binary data with real R2', async () => {
    const r2 = (env as Env).R2

    const binaryData = new Uint8Array([1, 2, 3, 4, 5])
    await r2.put('binary-object', binaryData)

    const object = await r2.get('binary-object')
    expect(object).not.toBeNull()

    const buffer = await object!.arrayBuffer()
    expect(new Uint8Array(buffer)).toEqual(binaryData)
  })

  it('should check object existence with head()', async () => {
    const r2 = (env as Env).R2

    await r2.put('exists-object', 'content')

    const head = await r2.head('exists-object')
    expect(head).not.toBeNull()
    expect(head!.key).toBe('exists-object')

    const notExists = await r2.head('not-exists')
    expect(notExists).toBeNull()
  })

  it('should list objects with real R2', async () => {
    const r2 = (env as Env).R2

    // Put some objects with prefix
    await r2.put('r2-list/a.txt', 'content-a')
    await r2.put('r2-list/b.txt', 'content-b')
    await r2.put('r2-list/c.txt', 'content-c')

    const list = await r2.list({ prefix: 'r2-list/' })

    expect(list.objects.length).toBeGreaterThanOrEqual(3)
    expect(list.objects.map((o) => o.key)).toContain('r2-list/a.txt')
  })

  it('should delete objects with real R2', async () => {
    const r2 = (env as Env).R2

    await r2.put('delete-object', 'temporary')
    expect(await r2.get('delete-object')).not.toBeNull()

    await r2.delete('delete-object')
    expect(await r2.get('delete-object')).toBeNull()
  })

  it('should support custom metadata with real R2', async () => {
    const r2 = (env as Env).R2

    await r2.put('meta-object', 'content', {
      customMetadata: { version: '1.0', author: 'test' },
    })

    const object = await r2.get('meta-object')
    expect(object).not.toBeNull()
    expect(object!.customMetadata).toBeDefined()
    expect(object!.customMetadata.version).toBe('1.0')
  })
})

// =============================================================================
// WebSocket Tests (Real Workers Runtime)
// =============================================================================

describe('WebSocket (Real Workers Runtime)', () => {
  /**
   * These tests use REAL WebSocket, not createMockWebSocket()
   *
   * In miniflare, WebSocket connections work through the Workers runtime,
   * supporting hibernatable WebSockets.
   */

  it('should upgrade to WebSocket with real DO', async () => {
    const doEnv = env as Env
    const id = doEnv.DO.idFromName('test-websocket-do')
    const stub = doEnv.DO.get(id)

    // Request WebSocket upgrade
    const response = await stub.fetch(new Request('https://internal/ws', {
      headers: { Upgrade: 'websocket' },
    }))

    // Should return 101 Switching Protocols with real WebSocket
    expect(response.status).toBe(101)
    expect(response.webSocket).toBeDefined()

    // Clean up
    if (response.webSocket) {
      response.webSocket.close()
    }
  })

  it('should handle WebSocket upgrade request', async () => {
    const doEnv = env as Env
    const id = doEnv.DO.idFromName('test-ws-upgrade-do')
    const stub = doEnv.DO.get(id)

    const response = await stub.fetch(new Request('https://internal/ws', {
      headers: { Upgrade: 'websocket' },
    }))

    expect(response.status).toBe(101)

    // Clean up
    if (response.webSocket) {
      response.webSocket.close()
    }
  })

  it('should reject non-WebSocket requests to /ws', async () => {
    const doEnv = env as Env
    const id = doEnv.DO.idFromName('test-ws-reject-do')
    const stub = doEnv.DO.get(id)

    // Request without WebSocket upgrade header
    const response = await stub.fetch(new Request('https://internal/ws'))

    // Should return 426 Upgrade Required
    expect(response.status).toBe(426)
  })
})

// =============================================================================
// CDC Streaming Tests (Real WebSocket)
// =============================================================================

describe('CDC Streaming (Real WebSocket)', () => {
  it('should upgrade to WebSocket for CDC endpoint', async () => {
    const doEnv = env as Env
    const id = doEnv.DO.idFromName('test-cdc-stream-do')
    const stub = doEnv.DO.get(id)

    // Connect to CDC WebSocket endpoint
    const response = await stub.fetch(new Request('https://internal/cdc', {
      headers: { Upgrade: 'websocket' },
    }))

    expect(response.status).toBe(101)

    // Clean up
    if (response.webSocket) {
      response.webSocket.close()
    }
  })

  it('should return SSE stream for non-WebSocket CDC requests', async () => {
    const doEnv = env as Env
    const id = doEnv.DO.idFromName('test-cdc-sse-do')
    const stub = doEnv.DO.get(id)

    // Request CDC without WebSocket upgrade
    const response = await stub.fetch(new Request('https://internal/cdc'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
  })
})

// =============================================================================
// Integration Tests - Full DO Lifecycle
// =============================================================================

describe('DO Lifecycle Integration (Real Environment)', () => {
  it('should create DO and fetch identity', async () => {
    const doEnv = env as Env
    const doName = `lifecycle-test-${Date.now()}`
    const id = doEnv.DO.idFromName(doName)
    const stub = doEnv.DO.get(id)

    // Initialize - first request creates the DO
    const initResponse = await stub.fetch(new Request('https://internal/'))
    expect(initResponse.status).toBe(200)
    const identity = await initResponse.json()
    expect(identity).toHaveProperty('$id')
    expect(identity).toHaveProperty('$type')
  })

  it('should return consistent identity across requests', async () => {
    const doEnv = env as Env
    const id = doEnv.DO.idFromName('consistent-do')
    const stub = doEnv.DO.get(id)

    // First request
    const response1 = await stub.fetch(new Request('https://internal/_identity'))
    expect(response1.status).toBe(200)
    const identity1 = await response1.json()

    // Second request - should return same identity
    const response2 = await stub.fetch(new Request('https://internal/_identity'))
    expect(response2.status).toBe(200)
    const identity2 = await response2.json()

    expect(identity1.$id).toBe(identity2.$id)
    expect(identity1.$type).toBe(identity2.$type)
  })

  it('should handle RPC POST requests', async () => {
    const doEnv = env as Env
    const id = doEnv.DO.idFromName('rpc-test-do')
    const stub = doEnv.DO.get(id)

    // Send RPC request to get system ping
    const response = await stub.fetch(new Request('https://internal/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: '1',
        method: 'system.ping',
      }),
    }))

    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result).toHaveProperty('result')
    expect(result.result).toHaveProperty('pong')
  })
})

// =============================================================================
// Test Summary
// =============================================================================

/**
 * EXPECTED FAILURES (TDD-RED Phase):
 *
 * 1. env.DO may be undefined - binding not available in test environment
 * 2. env.KV may be undefined - binding not available in test environment
 * 3. env.R2 may be undefined - binding not available in test environment
 * 4. WebSocket operations may fail without real Workers runtime
 * 5. DO RPC methods may not be implemented yet
 *
 * TO PASS THESE TESTS (TDD-GREEN Phase):
 *
 * 1. Configure vitest.workers.config.ts with proper miniflare bindings
 * 2. Export DigitalObject class from proxy/do.ts
 * 3. Register DO class in miniflare configuration
 * 4. Remove dependency on tests/utils/mocks.ts
 * 5. Implement missing RPC methods (do.state.set, do.state.get)
 *
 * REFACTOR Phase:
 *
 * 1. Move reusable test helpers to tests/utils/workers.ts (NOT mocks)
 * 2. Create proper fixtures for real environment testing
 * 3. Add test isolation (cleanup between tests)
 * 4. Document the real-environment testing pattern
 */
