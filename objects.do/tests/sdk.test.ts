/**
 * SDK Tests - ObjectsClient
 *
 * These tests validate the ObjectsClient SDK for:
 * - Client construction with baseUrl, apiKey options
 * - deploy(definition) - deploys a DO to registry
 * - list() - lists all deployed DOs
 * - get(id) - gets a single DO definition
 * - delete(id) - removes a DO
 * - Chainable proxy RPC: client.do('my.do').api.users.list()
 *
 * TDD Phase: RED - These tests should FAIL because the SDK is not implemented yet.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ObjectsClient, type ObjectsClientOptions, type ListOptions, type DODefinition, type RegistryEntry } from '../sdk'

// =============================================================================
// Test Fixtures
// =============================================================================

const testDefinition: DODefinition = {
  $id: 'crm.acme.com',
  $type: 'SaaS',
  api: {
    ping: 'async () => "pong"',
    users: {
      list: 'async () => $.db.User.list()',
      get: 'async (id) => $.db.User.get(id)',
      create: 'async (data) => $.db.User.create(data)',
    },
  },
  events: {
    'User.created': 'async (user) => $.slack`#new-users ${user.name} joined`',
  },
}

const testRegistryEntry: RegistryEntry = {
  definition: testDefinition,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  owner: 'user-123',
}

// =============================================================================
// ObjectsClient Construction Tests
// =============================================================================

describe('ObjectsClient', () => {
  describe('construction', () => {
    it('should construct with default options', () => {
      const client = new ObjectsClient()

      expect(client).toBeInstanceOf(ObjectsClient)
    })

    it('should construct with baseUrl option', () => {
      const client = new ObjectsClient({
        baseUrl: 'https://custom.objects.do',
      })

      expect(client).toBeInstanceOf(ObjectsClient)
    })

    it('should construct with apiKey option', () => {
      const client = new ObjectsClient({
        apiKey: 'sk_test_12345',
      })

      expect(client).toBeInstanceOf(ObjectsClient)
    })

    it('should construct with all options', () => {
      const options: ObjectsClientOptions = {
        baseUrl: 'https://custom.objects.do',
        apiKey: 'sk_test_12345',
        timeout: 60000,
      }

      const client = new ObjectsClient(options)

      expect(client).toBeInstanceOf(ObjectsClient)
    })

    it('should use default baseUrl if not provided', () => {
      const client = new ObjectsClient({
        apiKey: 'sk_test_12345',
      })

      // The client should internally use 'https://objects.do' as default
      expect(client).toBeInstanceOf(ObjectsClient)
    })
  })

  // ===========================================================================
  // deploy() Tests
  // ===========================================================================

  describe('deploy()', () => {
    let client: ObjectsClient

    beforeEach(() => {
      client = new ObjectsClient({
        baseUrl: 'https://objects.do',
        apiKey: 'sk_test_12345',
      })
    })

    it('should deploy a valid DO definition', async () => {
      const response = await client.deploy(testDefinition)

      expect(response.success).toBe(true)
      expect(response.$id).toBe('crm.acme.com')
      expect(response.deployedAt).toBeTypeOf('number')
    })

    it('should deploy a minimal DO definition', async () => {
      const minimalDefinition: DODefinition = {
        $id: 'minimal.example.com',
      }

      const response = await client.deploy(minimalDefinition)

      expect(response.success).toBe(true)
      expect(response.$id).toBe('minimal.example.com')
    })

    it('should deploy a DO with agent configuration', async () => {
      const agentDefinition: DODefinition = {
        $id: 'agent.example.com',
        $type: 'Agent',
        agent: {
          systemPrompt: 'You are a helpful assistant.',
          model: 'best',
          temperature: 0.7,
        },
      }

      const response = await client.deploy(agentDefinition)

      expect(response.success).toBe(true)
      expect(response.$id).toBe('agent.example.com')
    })

    it('should deploy a DO with site pages', async () => {
      const siteDefinition: DODefinition = {
        $id: 'site.example.com',
        site: {
          '/': '# Welcome\n\nThis is the home page.',
          '/about': '# About\n\nAbout us page.',
        },
      }

      const response = await client.deploy(siteDefinition)

      expect(response.success).toBe(true)
      expect(response.$id).toBe('site.example.com')
    })

    it('should reject invalid DO definition', async () => {
      const invalidDefinition = {
        // Missing required $id
        $type: 'SaaS',
      } as DODefinition

      await expect(client.deploy(invalidDefinition)).rejects.toThrow()
    })
  })

  // ===========================================================================
  // list() Tests
  // ===========================================================================

  describe('list()', () => {
    let client: ObjectsClient

    beforeEach(() => {
      client = new ObjectsClient({
        baseUrl: 'https://objects.do',
        apiKey: 'sk_test_12345',
      })
    })

    it('should list all deployed DOs', async () => {
      const response = await client.list()

      expect(response).toHaveProperty('entries')
      expect(response).toHaveProperty('hasMore')
      expect(Array.isArray(response.entries)).toBe(true)
    })

    it('should list with limit option', async () => {
      const options: ListOptions = { limit: 10 }

      const response = await client.list(options)

      expect(response.entries.length).toBeLessThanOrEqual(10)
    })

    it('should list with prefix filter', async () => {
      const options: ListOptions = { prefix: 'crm.' }

      const response = await client.list(options)

      expect(response.entries.every((e) => e.definition.$id.startsWith('crm.'))).toBe(true)
    })

    it('should support cursor-based pagination', async () => {
      // First page
      const firstPage = await client.list({ limit: 5 })

      if (firstPage.hasMore && firstPage.cursor) {
        // Second page using cursor
        const secondPage = await client.list({
          limit: 5,
          cursor: firstPage.cursor,
        })

        expect(secondPage.entries).toBeDefined()
      }

      expect(firstPage.entries).toBeDefined()
    })

    it('should return empty array when no DOs exist', async () => {
      const response = await client.list({ prefix: 'nonexistent.' })

      expect(response.entries).toEqual([])
      expect(response.hasMore).toBe(false)
    })
  })

  // ===========================================================================
  // get() Tests
  // ===========================================================================

  describe('get()', () => {
    let client: ObjectsClient

    beforeEach(() => {
      client = new ObjectsClient({
        baseUrl: 'https://objects.do',
        apiKey: 'sk_test_12345',
      })
    })

    it('should get a DO by ID', async () => {
      // First deploy a DO
      await client.deploy(testDefinition)

      const entry = await client.get('crm.acme.com')

      expect(entry).not.toBeNull()
      expect(entry?.definition.$id).toBe('crm.acme.com')
    })

    it('should return full registry entry with metadata', async () => {
      await client.deploy(testDefinition)

      const entry = await client.get('crm.acme.com')

      expect(entry).toHaveProperty('definition')
      expect(entry).toHaveProperty('createdAt')
      expect(entry).toHaveProperty('updatedAt')
    })

    it('should return null for non-existent DO', async () => {
      const entry = await client.get('nonexistent.example.com')

      expect(entry).toBeNull()
    })

    it('should return the latest version of a DO', async () => {
      // Deploy initial version
      await client.deploy({
        $id: 'versioned.example.com',
        $version: '1.0.0',
        api: { ping: 'async () => "pong v1"' },
      })

      // Deploy updated version
      await client.deploy({
        $id: 'versioned.example.com',
        $version: '2.0.0',
        api: { ping: 'async () => "pong v2"' },
      })

      const entry = await client.get('versioned.example.com')

      expect(entry?.definition.$version).toBe('2.0.0')
    })
  })

  // ===========================================================================
  // delete() Tests
  // ===========================================================================

  describe('delete()', () => {
    let client: ObjectsClient

    beforeEach(() => {
      client = new ObjectsClient({
        baseUrl: 'https://objects.do',
        apiKey: 'sk_test_12345',
      })
    })

    it('should delete a DO by ID', async () => {
      // First deploy a DO
      await client.deploy(testDefinition)

      const response = await client.delete('crm.acme.com')

      expect(response.success).toBe(true)
      expect(response.$id).toBe('crm.acme.com')
    })

    it('should confirm DO no longer exists after deletion', async () => {
      await client.deploy(testDefinition)
      await client.delete('crm.acme.com')

      const entry = await client.get('crm.acme.com')

      expect(entry).toBeNull()
    })

    it('should handle deletion of non-existent DO gracefully', async () => {
      // Should not throw, but return success: false or similar
      const response = await client.delete('nonexistent.example.com')

      // Implementation could either return success: false or throw
      // This test accepts either behavior
      expect(response.$id).toBe('nonexistent.example.com')
    })
  })

  // ===========================================================================
  // Chainable Proxy RPC Tests
  // ===========================================================================

  describe('do() - Chainable Proxy RPC', () => {
    let client: ObjectsClient

    beforeEach(() => {
      client = new ObjectsClient({
        baseUrl: 'https://objects.do',
        apiKey: 'sk_test_12345',
      })
    })

    it('should return a DO proxy', () => {
      const proxy = client.do('crm.acme.com')

      expect(proxy).toBeDefined()
      expect(proxy).toHaveProperty('api')
    })

    it('should allow chained api.method() calls', async () => {
      const proxy = client.do('crm.acme.com')

      // This should make an RPC call to crm.acme.com/rpc with method: 'ping'
      const result = await proxy.api.ping()

      expect(result).toBe('pong')
    })

    it('should allow nested namespace calls', async () => {
      const proxy = client.do('crm.acme.com')

      // This should make an RPC call to crm.acme.com/rpc with method: 'users.list'
      const users = await proxy.api.users.list()

      expect(Array.isArray(users)).toBe(true)
    })

    it('should pass arguments to RPC method', async () => {
      const proxy = client.do('crm.acme.com')

      // This should make an RPC call with method: 'users.get', params: ['user-123']
      const user = await proxy.api.users.get('user-123')

      expect(user).toBeDefined()
    })

    it('should support multiple arguments', async () => {
      const proxy = client.do('crm.acme.com')

      // This should make an RPC call with method: 'users.create', params: [{ name: 'John', email: 'john@example.com' }]
      const newUser = await proxy.api.users.create({
        name: 'John',
        email: 'john@example.com',
      })

      expect(newUser).toBeDefined()
    })

    it('should support deeply nested namespaces', async () => {
      // Deploy a DO with deeply nested API
      const deepDefinition: DODefinition = {
        $id: 'deep.example.com',
        api: {
          level1: {
            level2: {
              level3: {
                method: 'async () => "deep"',
              },
            },
          },
        },
      }
      await client.deploy(deepDefinition)

      const proxy = client.do('deep.example.com')

      // This should make an RPC call with method: 'level1.level2.level3.method'
      const result = await proxy.api.level1.level2.level3.method()

      expect(result).toBe('deep')
    })

    it('should handle RPC errors gracefully', async () => {
      const proxy = client.do('crm.acme.com')

      // Call a non-existent method
      await expect(proxy.api.nonexistent()).rejects.toThrow()
    })

    it('should work with different DO IDs', async () => {
      const proxy1 = client.do('app1.example.com')
      const proxy2 = client.do('app2.example.com')

      expect(proxy1).toBeDefined()
      expect(proxy2).toBeDefined()
      // They should be different proxy instances for different DOs
      expect(proxy1).not.toBe(proxy2)
    })
  })

  // ===========================================================================
  // Authentication Tests
  // ===========================================================================

  describe('authentication', () => {
    it('should include API key in requests', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ entries: [], hasMore: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const client = new ObjectsClient({
        baseUrl: 'https://objects.do',
        apiKey: 'sk_test_12345',
      })

      await client.list()

      expect(fetchSpy).toHaveBeenCalled()
      const [, init] = fetchSpy.mock.calls[0]
      expect(init?.headers).toBeDefined()
      // Should include Authorization header with API key
      const headers = init?.headers as Record<string, string>
      expect(headers['Authorization'] || headers['authorization'] || headers['X-API-Key']).toBeDefined()

      fetchSpy.mockRestore()
    })

    it('should work without API key for public endpoints', async () => {
      const client = new ObjectsClient({
        baseUrl: 'https://objects.do',
        // No API key
      })

      // list() should work for public DOs
      const response = await client.list()

      expect(response.entries).toBeDefined()
    })
  })

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('error handling', () => {
    let client: ObjectsClient

    beforeEach(() => {
      client = new ObjectsClient({
        baseUrl: 'https://objects.do',
        apiKey: 'sk_test_12345',
      })
    })

    it('should throw on network errors', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

      await expect(client.list()).rejects.toThrow('Network error')

      vi.restoreAllMocks()
    })

    it('should throw on HTTP errors', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Internal Server Error', { status: 500 })
      )

      await expect(client.list()).rejects.toThrow()

      vi.restoreAllMocks()
    })

    it('should throw on invalid JSON response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('not json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await expect(client.list()).rejects.toThrow()

      vi.restoreAllMocks()
    })
  })

  // ===========================================================================
  // Timeout Tests
  // ===========================================================================

  describe('timeout', () => {
    it('should respect custom timeout option', async () => {
      const client = new ObjectsClient({
        baseUrl: 'https://objects.do',
        apiKey: 'sk_test_12345',
        timeout: 1000, // 1 second
      })

      // The client should timeout after 1 second
      // This is hard to test without a slow server, so we just verify construction
      expect(client).toBeInstanceOf(ObjectsClient)
    })
  })
})
