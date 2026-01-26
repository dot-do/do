/**
 * Tests for objects.do Registry API Endpoints
 *
 * These tests define the expected behavior of the registry API endpoints:
 * - PUT /registry/:id - create/update a DO definition
 * - GET /registry - list all DO definitions
 * - GET /registry/:id - get a single DO definition
 * - DELETE /registry/:id - delete a DO definition
 * - GET /registry/:id/schema - get DO schema
 * - Authentication via Authorization header
 *
 * These tests should FAIL initially because the registry endpoints
 * don't exist yet (only the generic DO routing exists).
 *
 * @module tests/api
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { R2Bucket, R2Object } from '@cloudflare/workers-types'
import type { DODefinition, RegistryEntry } from '../src/types'

// =============================================================================
// Mock Registry & Test Helpers
// =============================================================================

/**
 * Creates a mock registry (R2 bucket) for testing
 */
function createMockRegistry(): R2Bucket {
  const entries = new Map<string, RegistryEntry>()

  return {
    get: vi.fn(async (key: string) => {
      const entry = entries.get(key)
      if (!entry) return null
      return {
        key,
        json: async () => entry,
        text: async () => JSON.stringify(entry),
        body: null,
        bodyUsed: false,
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob(),
        size: JSON.stringify(entry).length,
        etag: 'mock-etag',
        uploaded: new Date(),
      } as unknown as R2Object
    }),
    put: vi.fn(async (key: string, value: string | ArrayBuffer | ReadableStream) => {
      if (typeof value === 'string') {
        entries.set(key, JSON.parse(value))
      }
      return {
        key,
        size: typeof value === 'string' ? value.length : 0,
        etag: 'mock-etag',
        uploaded: new Date(),
      } as unknown as R2Object
    }),
    delete: vi.fn(async (key: string) => {
      entries.delete(key)
    }),
    list: vi.fn(async (options?: { prefix?: string; limit?: number; cursor?: string }) => ({
      objects: Array.from(entries.keys())
        .filter((key) => !options?.prefix || key.startsWith(options.prefix))
        .map((key) => ({
          key,
          size: JSON.stringify(entries.get(key)).length,
          etag: 'mock-etag',
          uploaded: new Date(),
        })),
      truncated: false,
      delimitedPrefixes: [],
    })),
    head: vi.fn(async () => null),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  } as unknown as R2Bucket
}

/**
 * Creates a mock environment for the worker
 */
interface MockEnv {
  REGISTRY: R2Bucket
  AUTH: { fetch: ReturnType<typeof vi.fn> }
  OAUTH: { fetch: ReturnType<typeof vi.fn> }
  MCP: { fetch: ReturnType<typeof vi.fn> }
  ESBUILD: { fetch: ReturnType<typeof vi.fn> }
  STRIPE: { fetch: ReturnType<typeof vi.fn> }
  GITHUB: { fetch: ReturnType<typeof vi.fn> }
  AI: { fetch: ReturnType<typeof vi.fn> }
  MDX: { fetch: ReturnType<typeof vi.fn> }
  DO: {
    idFromName: ReturnType<typeof vi.fn>
    get: ReturnType<typeof vi.fn>
  }
}

function createMockEnv(registry: R2Bucket): MockEnv {
  return {
    REGISTRY: registry,
    AUTH: { fetch: vi.fn(async () => new Response(JSON.stringify({ result: 'auth' }))) },
    OAUTH: { fetch: vi.fn(async () => new Response(JSON.stringify({ result: 'oauth' }))) },
    MCP: { fetch: vi.fn(async () => new Response(JSON.stringify({ result: 'mcp' }))) },
    ESBUILD: { fetch: vi.fn(async () => new Response(JSON.stringify({ result: 'esbuild' }))) },
    STRIPE: { fetch: vi.fn(async () => new Response(JSON.stringify({ result: 'stripe' }))) },
    GITHUB: { fetch: vi.fn(async () => new Response(JSON.stringify({ result: 'github' }))) },
    AI: { fetch: vi.fn(async () => new Response(JSON.stringify({ result: 'ai' }))) },
    MDX: { fetch: vi.fn(async () => new Response(JSON.stringify({ result: 'mdx' }))) },
    DO: {
      idFromName: vi.fn((name: string) => ({ toString: () => name, name })),
      get: vi.fn(() => ({
        fetch: vi.fn(async () => new Response(JSON.stringify({ stub: true }))),
      })),
    },
  }
}

/**
 * Creates a test DO definition
 */
function createTestDefinition(id: string, overrides: Partial<DODefinition> = {}): DODefinition {
  return {
    $id: id,
    $type: 'SaaS',
    api: {
      ping: 'async () => "pong"',
      echo: 'async (msg) => msg',
    },
    ...overrides,
  }
}

/**
 * Import the worker default export
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
import worker from '../src/index'

// Helper type for JSON responses
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

// =============================================================================
// 1. PUT /registry/:id - Create/Update DO Definition
// =============================================================================

describe('PUT /registry/:id - Create/Update DO Definition', () => {
  let registry: R2Bucket
  let env: MockEnv

  beforeEach(() => {
    registry = createMockRegistry()
    env = createMockEnv(registry)
  })

  it('should create a new DO definition', async () => {
    const definition = createTestDefinition('my-app.do')

    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify(definition),
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { id: string; definition: DODefinition; createdAt: number }

    expect(response.status).toBe(201)
    expect(body.id).toBe('my-app.do')
    expect(body.definition.$id).toBe('my-app.do')
    expect(body.createdAt).toBeDefined()
  })

  it('should update an existing DO definition', async () => {
    // First, create the definition
    const initialDef = createTestDefinition('my-app.do')
    await registry.put(
      'my-app.do',
      JSON.stringify({
        definition: initialDef,
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
      })
    )

    // Update with new API method
    const updatedDef = createTestDefinition('my-app.do', {
      api: {
        ping: 'async () => "pong"',
        echo: 'async (msg) => msg',
        greet: 'async (name) => `Hello, ${name}!`',
      },
    })

    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify(updatedDef),
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { id: string; definition: DODefinition; updatedAt: number }

    expect(response.status).toBe(200)
    expect(body.definition.api).toHaveProperty('greet')
    expect(body.updatedAt).toBeDefined()
  })

  it('should reject invalid DO definition', async () => {
    const invalidDef = { invalid: 'data' } // Missing required $id

    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify(invalidDef),
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { error: { code: string; message: string } }

    expect(response.status).toBe(400)
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe('INVALID_DEFINITION')
  })

  it('should require authentication', async () => {
    const definition = createTestDefinition('my-app.do')

    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        // No Authorization header
      },
      body: JSON.stringify(definition),
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { error: { code: string; message: string } }

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('should validate $id matches URL parameter', async () => {
    const definition = createTestDefinition('different-id.do')

    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify(definition),
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { error: { code: string; message: string } }

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('ID_MISMATCH')
  })
})

// =============================================================================
// 2. GET /registry - List All DO Definitions
// =============================================================================

describe('GET /registry - List All DO Definitions', () => {
  let registry: R2Bucket
  let env: MockEnv

  beforeEach(async () => {
    registry = createMockRegistry()
    env = createMockEnv(registry)

    // Seed some definitions
    const definitions = [createTestDefinition('app1.do'), createTestDefinition('app2.do'), createTestDefinition('app3.do')]

    for (const def of definitions) {
      await registry.put(
        def.$id,
        JSON.stringify({
          definition: def,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      )
    }
  })

  it('should list all DO definitions', async () => {
    const request = new Request('https://objects.do/registry', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
      },
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { items: Array<{ id: string; $type?: string }> }

    expect(response.status).toBe(200)
    expect(body.items).toHaveLength(3)
    expect(body.items.map((item) => item.id)).toContain('app1.do')
    expect(body.items.map((item) => item.id)).toContain('app2.do')
    expect(body.items.map((item) => item.id)).toContain('app3.do')
  })

  it('should support pagination with limit and cursor', async () => {
    const request = new Request('https://objects.do/registry?limit=2', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
      },
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as {
      items: Array<{ id: string }>
      cursor?: string
      hasMore: boolean
    }

    expect(response.status).toBe(200)
    expect(body.items.length).toBeLessThanOrEqual(2)
    // If there are more items, cursor should be provided
    if (body.hasMore) {
      expect(body.cursor).toBeDefined()
    }
  })

  it('should support filtering by type', async () => {
    // Add a definition with different type
    const agentDef = createTestDefinition('agent1.do', { $type: 'Agent' })
    await registry.put(
      'agent1.do',
      JSON.stringify({
        definition: agentDef,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    )

    const request = new Request('https://objects.do/registry?type=Agent', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
      },
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { items: Array<{ id: string; $type?: string }> }

    expect(response.status).toBe(200)
    expect(body.items.every((item) => item.$type === 'Agent')).toBe(true)
  })

  it('should return empty array when no definitions exist', async () => {
    // Create fresh registry with no entries
    const emptyRegistry = createMockRegistry()
    const emptyEnv = createMockEnv(emptyRegistry)

    const request = new Request('https://objects.do/registry', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
      },
    })

    const response = await worker.fetch(request, emptyEnv)
    const body = (await response.json()) as { items: JsonValue[] }

    expect(response.status).toBe(200)
    expect(body.items).toEqual([])
  })
})

// =============================================================================
// 3. GET /registry/:id - Get Single DO Definition
// =============================================================================

describe('GET /registry/:id - Get Single DO Definition', () => {
  let registry: R2Bucket
  let env: MockEnv

  beforeEach(async () => {
    registry = createMockRegistry()
    env = createMockEnv(registry)

    const definition = createTestDefinition('my-app.do')
    await registry.put(
      'my-app.do',
      JSON.stringify({
        definition,
        createdAt: Date.now() - 10000,
        updatedAt: Date.now(),
        owner: 'user-123',
      })
    )
  })

  it('should return a single DO definition', async () => {
    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
      },
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as RegistryEntry

    expect(response.status).toBe(200)
    expect(body.definition.$id).toBe('my-app.do')
    expect(body.definition.$type).toBe('SaaS')
    expect(body.createdAt).toBeDefined()
    expect(body.updatedAt).toBeDefined()
  })

  it('should return 404 for non-existent definition', async () => {
    const request = new Request('https://objects.do/registry/nonexistent.do', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
      },
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { error: { code: string; message: string } }

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('should include metadata like owner and timestamps', async () => {
    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
      },
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as RegistryEntry

    expect(response.status).toBe(200)
    expect(body.owner).toBe('user-123')
    expect(typeof body.createdAt).toBe('number')
    expect(typeof body.updatedAt).toBe('number')
  })
})

// =============================================================================
// 4. DELETE /registry/:id - Delete DO Definition
// =============================================================================

describe('DELETE /registry/:id - Delete DO Definition', () => {
  let registry: R2Bucket
  let env: MockEnv

  beforeEach(async () => {
    registry = createMockRegistry()
    env = createMockEnv(registry)

    const definition = createTestDefinition('my-app.do')
    await registry.put(
      'my-app.do',
      JSON.stringify({
        definition,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        owner: 'user-123',
      })
    )
  })

  it('should delete a DO definition', async () => {
    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer test-token',
      },
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { success: boolean; id: string }

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.id).toBe('my-app.do')

    // Verify it's actually deleted
    const getResult = await registry.get('my-app.do')
    expect(getResult).toBeNull()
  })

  it('should return 404 when deleting non-existent definition', async () => {
    const request = new Request('https://objects.do/registry/nonexistent.do', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer test-token',
      },
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { error: { code: string; message: string } }

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('should require authentication for delete', async () => {
    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'DELETE',
      // No Authorization header
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { error: { code: string; message: string } }

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('should require owner permission to delete', async () => {
    // Simulate a different user trying to delete
    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer different-user-token',
      },
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { error: { code: string; message: string } }

    expect(response.status).toBe(403)
    expect(body.error.code).toBe('FORBIDDEN')
  })
})

// =============================================================================
// 5. GET /registry/:id/schema - Get DO Schema
// =============================================================================

describe('GET /registry/:id/schema - Get DO Schema', () => {
  let registry: R2Bucket
  let env: MockEnv

  beforeEach(async () => {
    registry = createMockRegistry()
    env = createMockEnv(registry)

    const definition = createTestDefinition('my-app.do', {
      api: {
        ping: 'async () => "pong"',
        users: {
          list: 'async () => $.db.User.list()',
          get: {
            code: 'async (id) => $.db.User.get(id)',
            params: ['id'],
            returns: 'User | null',
            description: 'Get a user by ID',
          },
          create: {
            code: 'async (data) => $.db.User.create(data)',
            params: ['data'],
            returns: 'User',
            description: 'Create a new user',
            auth: true,
          },
        },
      },
    })

    await registry.put(
      'my-app.do',
      JSON.stringify({
        definition,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    )
  })

  it('should return the DO schema with API methods', async () => {
    const request = new Request('https://objects.do/registry/my-app.do/schema', {
      method: 'GET',
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as {
      $id: string
      $type: string
      methods: Array<{ name: string; path: string; params?: string[]; returns?: string; description?: string }>
    }

    expect(response.status).toBe(200)
    expect(body.$id).toBe('my-app.do')
    expect(body.$type).toBe('SaaS')
    expect(body.methods).toBeDefined()
    expect(Array.isArray(body.methods)).toBe(true)
  })

  it('should include method details (params, returns, description)', async () => {
    const request = new Request('https://objects.do/registry/my-app.do/schema', {
      method: 'GET',
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as {
      methods: Array<{ name: string; path: string; params?: string[]; returns?: string; description?: string }>
    }

    expect(response.status).toBe(200)

    const getUserMethod = body.methods.find((m) => m.path === 'users.get')
    expect(getUserMethod).toBeDefined()
    expect(getUserMethod?.params).toContain('id')
    expect(getUserMethod?.returns).toBe('User | null')
    expect(getUserMethod?.description).toBe('Get a user by ID')
  })

  it('should return nested namespaces', async () => {
    const request = new Request('https://objects.do/registry/my-app.do/schema', {
      method: 'GET',
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as {
      namespaces: Array<{ name: string; methods: Array<{ name: string }> }>
    }

    expect(response.status).toBe(200)
    expect(body.namespaces).toBeDefined()

    const usersNamespace = body.namespaces.find((ns) => ns.name === 'users')
    expect(usersNamespace).toBeDefined()
    expect(usersNamespace?.methods.length).toBeGreaterThan(0)
  })

  it('should return 404 for non-existent definition', async () => {
    const request = new Request('https://objects.do/registry/nonexistent.do/schema', {
      method: 'GET',
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { error: { code: string; message: string } }

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('should not require authentication for schema (public API documentation)', async () => {
    const request = new Request('https://objects.do/registry/my-app.do/schema', {
      method: 'GET',
      // No Authorization header
    })

    const response = await worker.fetch(request, env)

    expect(response.status).toBe(200)
  })
})

// =============================================================================
// 6. Authentication Tests
// =============================================================================

describe('Authentication via Authorization Header', () => {
  let registry: R2Bucket
  let env: MockEnv

  beforeEach(() => {
    registry = createMockRegistry()
    env = createMockEnv(registry)
  })

  it('should accept Bearer token authentication', async () => {
    const definition = createTestDefinition('my-app.do')

    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token-123',
      },
      body: JSON.stringify(definition),
    })

    const response = await worker.fetch(request, env)

    // Should not fail authentication (may fail for other reasons, but not 401)
    expect(response.status).not.toBe(401)
  })

  it('should reject invalid Bearer token', async () => {
    const definition = createTestDefinition('my-app.do')

    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid-token',
      },
      body: JSON.stringify(definition),
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { error: { code: string; message: string } }

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('INVALID_TOKEN')
  })

  it('should reject malformed Authorization header', async () => {
    const definition = createTestDefinition('my-app.do')

    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic dXNlcjpwYXNz', // Basic auth instead of Bearer
      },
      body: JSON.stringify(definition),
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { error: { code: string; message: string } }

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('INVALID_AUTH_SCHEME')
  })

  it('should accept API key authentication', async () => {
    const definition = createTestDefinition('my-app.do')

    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'valid-api-key-123',
      },
      body: JSON.stringify(definition),
    })

    const response = await worker.fetch(request, env)

    // Should not fail authentication
    expect(response.status).not.toBe(401)
  })

  it('should return user info from verified token', async () => {
    const definition = createTestDefinition('my-app.do')

    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token-with-user-info',
      },
      body: JSON.stringify(definition),
    })

    const response = await worker.fetch(request, env)

    if (response.status === 201 || response.status === 200) {
      const body = (await response.json()) as { owner?: string }
      // The owner should be set from the authenticated user
      expect(body.owner).toBeDefined()
    }
  })
})

// =============================================================================
// 7. Error Handling Tests
// =============================================================================

describe('Registry API Error Handling', () => {
  let registry: R2Bucket
  let env: MockEnv

  beforeEach(() => {
    registry = createMockRegistry()
    env = createMockEnv(registry)
  })

  it('should return proper error format for all errors', async () => {
    const request = new Request('https://objects.do/registry/nonexistent.do', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
      },
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { error: { code: string; message: string } }

    expect(body.error).toBeDefined()
    expect(body.error.code).toBeDefined()
    expect(body.error.message).toBeDefined()
    expect(typeof body.error.code).toBe('string')
    expect(typeof body.error.message).toBe('string')
  })

  it('should handle malformed JSON body gracefully', async () => {
    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: 'not valid json {{{',
    })

    const response = await worker.fetch(request, env)
    const body = (await response.json()) as { error: { code: string; message: string } }

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('INVALID_JSON')
  })

  it('should handle registry storage errors gracefully', async () => {
    // Mock registry to throw an error
    const errorRegistry = {
      ...registry,
      get: vi.fn(async () => {
        throw new Error('R2 storage error')
      }),
    } as unknown as R2Bucket

    const errorEnv = createMockEnv(errorRegistry)

    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
      },
    })

    const response = await worker.fetch(request, errorEnv)
    const body = (await response.json()) as { error: { code: string; message: string } }

    expect(response.status).toBe(500)
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })
})

// =============================================================================
// 8. CORS and Headers Tests
// =============================================================================

describe('Registry API CORS and Headers', () => {
  let registry: R2Bucket
  let env: MockEnv

  beforeEach(() => {
    registry = createMockRegistry()
    env = createMockEnv(registry)
  })

  it('should handle OPTIONS preflight request', async () => {
    const request = new Request('https://objects.do/registry/my-app.do', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'Content-Type, Authorization',
      },
    })

    const response = await worker.fetch(request, env)

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined()
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PUT')
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
  })

  it('should include CORS headers in responses', async () => {
    const request = new Request('https://objects.do/registry', {
      method: 'GET',
      headers: {
        Origin: 'https://example.com',
        Authorization: 'Bearer test-token',
      },
    })

    const response = await worker.fetch(request, env)

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined()
  })

  it('should set correct Content-Type header', async () => {
    const request = new Request('https://objects.do/registry', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
      },
    })

    const response = await worker.fetch(request, env)

    expect(response.headers.get('Content-Type')).toContain('application/json')
  })
})
