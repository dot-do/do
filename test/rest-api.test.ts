/**
 * @dotdo/do - REST API Tests (RED Phase)
 *
 * Tests for HATEOAS REST API and Monaco Editor routes.
 */

import { vi } from 'vitest'

vi.mock('cloudflare:workers', () => {
  class MockDurableObject<Env = unknown> {
    protected ctx: unknown
    protected env: Env
    constructor(ctx: unknown, env: Env) {
      this.ctx = ctx
      this.env = env
    }
  }
  return { DurableObject: MockDurableObject }
})

import { describe, it, expect, beforeEach } from 'vitest'
import { DO } from '../src/do'

/**
 * Create an in-memory SQLite mock for testing
 * This simulates the Cloudflare Durable Objects SQLite storage API
 */
function createMockSqlStorage() {
  // In-memory storage using a Map
  const tables: Map<string, Map<string, Record<string, unknown>>> = new Map()

  return {
    exec(query: string, ...params: unknown[]) {
      const results: unknown[] = []

      // Parse and execute simple SQL queries
      const normalizedQuery = query.trim().toUpperCase()

      if (normalizedQuery.startsWith('CREATE TABLE')) {
        // CREATE TABLE - just initialize the table if needed
        const tableMatch = query.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)
        if (tableMatch) {
          const tableName = tableMatch[1]
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
        }
      } else if (normalizedQuery.startsWith('INSERT')) {
        if (query.includes('things')) {
          // INSERT INTO things (ns, type, id, url, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          const [ns, type, id, url, data, created_at, updated_at] = params as [string, string, string, string, string, string, string]
          const tableName = 'things'
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
          const table = tables.get(tableName)!
          table.set(url, { ns, type, id, url, data, created_at, updated_at })
        } else {
          // INSERT INTO documents (collection, id, data) VALUES (?, ?, ?)
          const [collection, id, data] = params as [string, string, string]
          const tableName = 'documents'
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
          const table = tables.get(tableName)!
          const key = `${collection}:${id}`
          table.set(key, { collection, id, data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        }
      } else if (normalizedQuery.startsWith('SELECT')) {
        // Handle things table queries
        if (query.includes('things')) {
          const thingsTable = tables.get('things')
          if (thingsTable) {
            if (query.includes('WHERE url = ?')) {
              const [url] = params as [string]
              const row = thingsTable.get(url)
              if (row) {
                results.push(row)
              }
            } else if (query.includes('WHERE type = ? AND id = ?')) {
              // Get by type and id (for Document API compatibility)
              const [type, id] = params as [string, string]
              for (const row of thingsTable.values()) {
                if (row.type === type && row.id === id) {
                  results.push(row)
                  break
                }
              }
            } else if (query.includes('WHERE ns = ? AND type = ? AND id = ?')) {
              const [ns, type, id] = params as [string, string, string]
              for (const row of thingsTable.values()) {
                if (row.ns === ns && row.type === type && row.id === id) {
                  results.push(row)
                  break
                }
              }
            } else if (query.includes('ORDER BY') && query.includes('LIMIT')) {
              // List things query
              const limit = params[params.length - 2] as number
              const offset = params[params.length - 1] as number
              const allRows = Array.from(thingsTable.values())
              const paginated = allRows.slice(offset, offset + limit)
              results.push(...paginated)
            }
          }
        } else {
          // SELECT data FROM documents WHERE collection = ? AND id = ?
          const tableName = 'documents'
          const table = tables.get(tableName)

          if (table) {
            if (query.includes('WHERE collection = ? AND id = ?')) {
              const [collection, id] = params as [string, string]
              const key = `${collection}:${id}`
              const row = table.get(key)
              if (row) {
                results.push({ data: row.data })
              }
            } else if (query.includes('WHERE collection IN')) {
              // Search query with collections filter
              const searchPattern = params[params.length - 2] as string
              const limit = params[params.length - 1] as number
              const collections = params.slice(0, -2) as string[]
              const pattern = searchPattern.replace(/%/g, '').toLowerCase()

              for (const [key, row] of table.entries()) {
                const rowCollection = key.split(':')[0]
                if (collections.includes(rowCollection)) {
                  const dataStr = (row.data as string).toLowerCase()
                  if (dataStr.includes(pattern)) {
                    results.push({ collection: row.collection, id: row.id, data: row.data })
                  }
                }
                if (results.length >= limit) break
              }
            } else if (query.includes('WHERE data LIKE')) {
              // Search all collections
              const searchPattern = params[0] as string
              const limit = params[1] as number
              const pattern = searchPattern.replace(/%/g, '').toLowerCase()

              for (const [, row] of table.entries()) {
                const dataStr = (row.data as string).toLowerCase()
                if (dataStr.includes(pattern)) {
                  results.push({ collection: row.collection, id: row.id, data: row.data })
                }
                if (results.length >= limit) break
              }
            } else if (query.includes('WHERE collection = ?')) {
              // List query with pagination
              const [collection, limit, offset] = params as [string, number, number]
              const matching: Record<string, unknown>[] = []
              for (const [key, row] of table.entries()) {
                if (key.startsWith(`${collection}:`)) {
                  matching.push({ data: row.data })
                }
              }
              // Apply pagination
              const paginated = matching.slice(offset, offset + limit)
              results.push(...paginated)
            }
          }
        }
      } else if (normalizedQuery.startsWith('UPDATE')) {
        if (query.includes('things')) {
          // UPDATE things SET data = ?, updated_at = ? WHERE type = ? AND id = ?
          const [data, updated_at, type, id] = params as [string, string, string, string]
          const thingsTable = tables.get('things')
          if (thingsTable) {
            // Find the thing by type and id
            for (const [url, row] of thingsTable.entries()) {
              if (row.type === type && row.id === id) {
                thingsTable.set(url, { ...row, data, updated_at })
                break
              }
            }
          }
        } else {
          // UPDATE documents SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE collection = ? AND id = ?
          const [data, collection, id] = params as [string, string, string]
          const tableName = 'documents'
          const table = tables.get(tableName)
          if (table) {
            const key = `${collection}:${id}`
            const existing = table.get(key)
            if (existing) {
              table.set(key, { ...existing, data, updated_at: new Date().toISOString() })
            }
          }
        }
      } else if (normalizedQuery.startsWith('DELETE')) {
        if (query.includes('things')) {
          // DELETE FROM things WHERE url = ?
          const [url] = params as [string]
          const thingsTable = tables.get('things')
          if (thingsTable) {
            thingsTable.delete(url)
          }
        } else {
          // DELETE FROM documents WHERE collection = ? AND id = ?
          const [collection, id] = params as [string, string]
          const tableName = 'documents'
          const table = tables.get(tableName)
          if (table) {
            const key = `${collection}:${id}`
            table.delete(key)
          }
        }
      }

      return {
        toArray() {
          return results
        }
      }
    }
  }
}

// Create mock context factory
function createMockCtx() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    storage: {
      sql: createMockSqlStorage(),
    },
    acceptWebSocket: vi.fn(),
    setWebSocketAutoResponse: vi.fn(),
  }
}

// Mock environment
const mockEnv = {
  DO_NAMESPACE: {
    idFromName: vi.fn(() => ({ toString: () => 'mock-id' })),
    get: vi.fn(),
  },
}

describe('HATEOAS REST API', () => {
  let doInstance: DO
  let mockCtx: ReturnType<typeof createMockCtx>

  beforeEach(() => {
    mockCtx = createMockCtx()
    doInstance = new DO(mockCtx as any, mockEnv)
  })

  describe('Root Discovery (/)', () => {
    it('should return HATEOAS discovery response', async () => {
      const request = new Request('https://database.do/')
      const response = await doInstance.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('application/json')

      const body = await response.json() as {
        api: { name: string; version: string }
        links: { self: string; api: string; rpc: string }
        discover: { collections: unknown[]; methods: unknown[]; tools: unknown[] }
      }

      expect(body.api).toBeDefined()
      expect(body.api.name).toBeDefined()
      expect(body.links).toBeDefined()
      expect(body.links.self).toBe('https://database.do')
      expect(body.links.api).toBe('https://database.do/api')
      expect(body.links.rpc).toBe('https://database.do/rpc')
      expect(body.discover).toBeDefined()
      expect(body.discover.collections).toBeDefined()
      expect(body.discover.methods).toBeDefined()
      expect(body.discover.tools).toBeDefined()
    })

    it('should include request metadata', async () => {
      const request = new Request('https://database.do/', {
        headers: {
          'CF-Connecting-IP': '1.2.3.4',
          'CF-IPCountry': 'US',
          'User-Agent': 'TestClient/1.0',
        },
      })
      const response = await doInstance.handleRequest(request)
      const body = await response.json() as { request: { origin: string; country: string } }

      expect(body.request.origin).toBe('1.2.3.4')
      expect(body.request.country).toBe('US')
    })
  })

  describe('API Routes (/api)', () => {
    describe('GET /api', () => {
      it('should list all collections', async () => {
        const request = new Request('https://database.do/api')
        const response = await doInstance.handleRequest(request)

        expect(response.status).toBe(200)
        const body = await response.json() as { collections: Array<{ name: string; href: string }> }
        expect(body.collections).toBeDefined()
        expect(Array.isArray(body.collections)).toBe(true)
      })
    })

    describe('GET /api/:resource', () => {
      it('should list documents in collection', async () => {
        const request = new Request('https://database.do/api/users')
        const response = await doInstance.handleRequest(request)

        expect(response.status).toBe(200)
        const body = await response.json() as { data: unknown[]; links: object }
        expect(body.data).toBeDefined()
        expect(Array.isArray(body.data)).toBe(true)
        expect(body.links).toBeDefined()
      })

      it('should support query parameters for pagination', async () => {
        const request = new Request('https://database.do/api/users?limit=10&offset=5')
        const response = await doInstance.handleRequest(request)

        expect(response.status).toBe(200)
      })

      it('should support orderBy query parameter', async () => {
        const request = new Request('https://database.do/api/users?orderBy=createdAt&order=desc')
        const response = await doInstance.handleRequest(request)

        expect(response.status).toBe(200)
      })
    })

    describe('GET /api/:resource/:id', () => {
      it('should return document with HATEOAS links', async () => {
        // First create a document
        const createRequest = new Request('https://database.do/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Test User' }),
        })
        const createResponse = await doInstance.handleRequest(createRequest)
        const created = await createResponse.json() as { data: { id: string } }

        // Then fetch it
        const request = new Request(`https://database.do/api/users/${created.data.id}`)
        const response = await doInstance.handleRequest(request)

        expect(response.status).toBe(200)
        const body = await response.json() as {
          data: { id: string; name: string }
          links: { self: string; edit: string; collection: string }
        }

        expect(body.data.name).toBe('Test User')
        expect(body.links.self).toContain(`/api/users/${created.data.id}`)
        expect(body.links.edit).toContain(`/~/users/${created.data.id}`)
        expect(body.links.collection).toContain('/api/users')
      })

      it('should return 404 for non-existent document', async () => {
        const request = new Request('https://database.do/api/users/nonexistent')
        const response = await doInstance.handleRequest(request)

        expect(response.status).toBe(404)
        const body = await response.json() as { error: string }
        expect(body.error).toBe('Not found')
      })
    })

    describe('POST /api/:resource', () => {
      it('should create document and return with links', async () => {
        const request = new Request('https://database.do/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'New User', email: 'new@example.com' }),
        })
        const response = await doInstance.handleRequest(request)

        expect(response.status).toBe(201)
        const body = await response.json() as {
          data: { id: string; name: string }
          links: { self: string; edit: string }
        }

        expect(body.data.id).toBeDefined()
        expect(body.data.name).toBe('New User')
        expect(body.links.self).toContain('/api/users/')
        expect(body.links.edit).toContain('/~/users/')
      })
    })

    describe('PUT /api/:resource/:id', () => {
      it('should update document and return with links', async () => {
        // Create first
        const createRequest = new Request('https://database.do/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Original' }),
        })
        const createResponse = await doInstance.handleRequest(createRequest)
        const created = await createResponse.json() as { data: { id: string } }

        // Update
        const request = new Request(`https://database.do/api/users/${created.data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Updated' }),
        })
        const response = await doInstance.handleRequest(request)

        expect(response.status).toBe(200)
        const body = await response.json() as { data: { name: string } }
        expect(body.data.name).toBe('Updated')
      })

      it('should return 404 for non-existent document', async () => {
        const request = new Request('https://database.do/api/users/nonexistent', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Test' }),
        })
        const response = await doInstance.handleRequest(request)

        expect(response.status).toBe(404)
      })

      it('should return 400 without ID', async () => {
        const request = new Request('https://database.do/api/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Test' }),
        })
        const response = await doInstance.handleRequest(request)

        // PUT without ID should not match the route
        expect(response.status).toBe(405) // Method not allowed for this route
      })
    })

    describe('DELETE /api/:resource/:id', () => {
      it('should delete document', async () => {
        // Create first
        const createRequest = new Request('https://database.do/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'To Delete' }),
        })
        const createResponse = await doInstance.handleRequest(createRequest)
        const created = await createResponse.json() as { data: { id: string } }

        // Delete
        const request = new Request(`https://database.do/api/users/${created.data.id}`, {
          method: 'DELETE',
        })
        const response = await doInstance.handleRequest(request)

        expect(response.status).toBe(200)
        const body = await response.json() as { success: boolean }
        expect(body.success).toBe(true)

        // Verify deleted
        const getRequest = new Request(`https://database.do/api/users/${created.data.id}`)
        const getResponse = await doInstance.handleRequest(getRequest)
        expect(getResponse.status).toBe(404)
      })

      it('should return 404 for non-existent document', async () => {
        const request = new Request('https://database.do/api/users/nonexistent', {
          method: 'DELETE',
        })
        const response = await doInstance.handleRequest(request)

        expect(response.status).toBe(404)
      })
    })

    describe('Schema Routes', () => {
      it('should return all method schemas', async () => {
        const request = new Request('https://database.do/api/.schema')
        const response = await doInstance.handleRequest(request)

        expect(response.status).toBe(200)
        const body = await response.json() as Record<string, object>
        expect(body.get).toBeDefined()
        expect(body.list).toBeDefined()
        expect(body.create).toBeDefined()
        expect(body.update).toBeDefined()
        expect(body.delete).toBeDefined()
      })

      it('should return specific method schema', async () => {
        const request = new Request('https://database.do/api/.schema/get')
        const response = await doInstance.handleRequest(request)

        expect(response.status).toBe(200)
        const body = await response.json() as { params: string[]; returns: string }
        expect(body.params).toBeDefined()
        expect(body.returns).toBeDefined()
      })
    })
  })

  describe('Health Check', () => {
    it('should return health status', async () => {
      const request = new Request('https://database.do/health')
      const response = await doInstance.handleRequest(request)

      expect(response.status).toBe(200)
      const body = await response.json() as { status: string }
      expect(body.status).toBe('ok')
    })
  })
})

describe('Monaco Editor Routes (/~)', () => {
  let doInstance: DO
  let editorMockCtx: ReturnType<typeof createMockCtx>

  beforeEach(() => {
    editorMockCtx = createMockCtx()
    doInstance = new DO(editorMockCtx as any, mockEnv)
  })

  describe('GET /~', () => {
    it('should return collection picker HTML', async () => {
      const request = new Request('https://database.do/~')
      const response = await doInstance.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('text/html')

      const html = await response.text()
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('Collections')
    })
  })

  describe('GET /~/:resource', () => {
    it('should return document list HTML', async () => {
      const request = new Request('https://database.do/~/users')
      const response = await doInstance.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('text/html')

      const html = await response.text()
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('users')
    })
  })

  describe('GET /~/:resource/:id', () => {
    it('should return Monaco editor HTML', async () => {
      // Create a document first
      await doInstance.create('users', { id: 'test-user', name: 'Test' })

      const request = new Request('https://database.do/~/users/test-user')
      const response = await doInstance.handleRequest(request)

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('text/html')

      const html = await response.text()
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('monaco-editor')
      expect(html).toContain('Save')
      expect(html).toContain('users/')
      expect(html).toContain('test-user')
    })

    it('should include save button that PUTs to /api', async () => {
      const request = new Request('https://database.do/~/users/test-id')
      const response = await doInstance.handleRequest(request)
      const html = await response.text()

      // Check that the save action targets the REST API
      expect(html).toContain('/api/users/test-id')
      expect(html).toContain('PUT')
    })

    it('should support Ctrl+S keyboard shortcut', async () => {
      const request = new Request('https://database.do/~/users/test-id')
      const response = await doInstance.handleRequest(request)
      const html = await response.text()

      expect(html).toContain('CtrlCmd')
      expect(html).toContain('KeyS')
    })

    it('should show empty JSON for non-existent document', async () => {
      const request = new Request('https://database.do/~/users/nonexistent')
      const response = await doInstance.handleRequest(request)
      const html = await response.text()

      // Should still render editor with empty object
      expect(html).toContain('{}')
    })
  })
})
