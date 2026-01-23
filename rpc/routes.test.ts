/**
 * RPC Routes Tests - RED Phase
 *
 * Tests for CapnWeb RPC REST-like Routes
 * - GET /rpc (root - returns available methods)
 * - GET /rpc/do.identity.get (returns JSON with links)
 * - GET /rpc/do.collections.list
 * - Clickable link format
 * - 404 for unknown methods
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DORPCMethods, DOSchema, MethodSchema } from '../types/rpc'

// These imports will fail until implementation exists
import {
  RPCRouteHandler,
  createRouteHandler,
  STANDARD_COLLECTIONS,
  COLLECTION_OPERATIONS,
  createMethodLink,
} from './routes'
import { MethodRegistry } from './methods'
import type { SchemaResponse, MethodResponse, NamespaceResponse, CollectionsResponse } from './routes'

// =============================================================================
// Test Fixtures
// =============================================================================

const createTestRegistry = () => {
  const registry = new MethodRegistry()

  // Register test methods
  registry.register('do.system.ping', async () => ({ pong: true, timestamp: Date.now() }))
  registry.register('do.identity.get', async () => ({
    $id: 'https://test.example.com',
    $type: 'Business',
    $version: 1,
    $createdAt: Date.now(),
    $updatedAt: Date.now(),
  }))
  registry.register('do.identity.setContext', async () => void 0)
  registry.register('do.identity.getContext', async () => null)
  registry.register('do.nouns.list', async () => ({
    items: [
      { id: 'noun-1', name: 'User', singular: 'user', plural: 'users', slug: 'user' },
      { id: 'noun-2', name: 'Task', singular: 'task', plural: 'tasks', slug: 'task' },
    ],
    hasMore: false,
  }))
  registry.register('do.nouns.get', async (id) => ({
    id,
    name: 'User',
    singular: 'user',
    plural: 'users',
    slug: 'user',
  }))
  registry.register('do.nouns.create', async () => ({ id: 'noun-new' }))
  registry.register('do.nouns.update', async () => ({ id: 'noun-1' }))
  registry.register('do.nouns.delete', async () => void 0)
  registry.register('do.verbs.list', async () => ({
    items: [
      { id: 'verb-1', name: 'Create', action: 'create', act: 'crt', activity: 'creating', event: 'created', reverse: 'createdBy' },
    ],
    hasMore: false,
  }))
  registry.register('do.things.list', async () => ({ items: [], hasMore: false }))
  registry.register('do.things.get', async () => null)
  registry.register('do.things.create', async () => ({ $id: 'thing-1' }))
  registry.register('do.cdc.subscribe', async () => 'subscription-id')

  return registry
}

const baseUrl = 'https://test.example.com'

// =============================================================================
// Request Routing Tests
// =============================================================================

describe('RPC Routes - Request Routing', () => {
  let handler: RPCRouteHandler
  let registry: MethodRegistry

  beforeEach(() => {
    registry = createTestRegistry()
    handler = new RPCRouteHandler(registry, baseUrl)
  })

  it('should route /rpc to schema handler', async () => {
    const request = new Request('https://test.example.com/rpc', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.status).toBe(200)
    const data = await response.json() as SchemaResponse
    expect(data.$type).toBe('RPCSchema')
  })

  it('should route /rpc/do.{namespace} to namespace handler', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.status).toBe(200)
    const data = await response.json() as NamespaceResponse
    expect(data.$type).toBe('RPCNamespace')
    expect(data.namespace).toBe('identity')
  })

  it('should route /rpc/do.{namespace}.{action} to method handler', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity.get', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.status).toBe(200)
    const data = await response.json() as MethodResponse
    expect(data.$type).toBe('RPCMethod')
    expect(data.name).toBe('do.identity.get')
  })

  it('should handle /rpc/do.collections.list specially', async () => {
    const request = new Request('https://test.example.com/rpc/do.collections.list', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.status).toBe(200)
    const data = await response.json() as CollectionsResponse
    expect(data.collections).toBeDefined()
    expect(Array.isArray(data.collections)).toBe(true)
  })

  it('should return 404 for unknown paths', async () => {
    const request = new Request('https://test.example.com/rpc/do.unknown.method', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.status).toBe(404)
  })

  it('should return JSON content type', async () => {
    const request = new Request('https://test.example.com/rpc', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.headers.get('Content-Type')).toContain('application/json')
  })

  it('should handle trailing slash', async () => {
    const request = new Request('https://test.example.com/rpc/', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.status).toBe(200)
  })
})

// =============================================================================
// GET /rpc Root (Schema Response) Tests
// =============================================================================

describe('RPC Routes - GET /rpc (Root)', () => {
  let handler: RPCRouteHandler
  let registry: MethodRegistry

  beforeEach(() => {
    registry = createTestRegistry()
    handler = new RPCRouteHandler(registry, baseUrl)
  })

  it('should return SchemaResponse structure', async () => {
    const request = new Request('https://test.example.com/rpc', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as SchemaResponse

    expect(data.$id).toBeDefined()
    expect(data.$type).toBeDefined()
    expect(data.namespaces).toBeDefined()
    expect(data.links).toBeDefined()
  })

  it('should include $id with base URL', async () => {
    const request = new Request('https://test.example.com/rpc', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as SchemaResponse

    expect(data.$id).toBe('https://test.example.com/rpc')
  })

  it('should include $type as RPCSchema', async () => {
    const request = new Request('https://test.example.com/rpc', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as SchemaResponse

    expect(data.$type).toBe('RPCSchema')
  })

  it('should group methods by namespace', async () => {
    const request = new Request('https://test.example.com/rpc', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as SchemaResponse

    expect(data.namespaces).toHaveProperty('identity')
    expect(data.namespaces).toHaveProperty('nouns')
    expect(data.namespaces).toHaveProperty('verbs')
    expect(data.namespaces).toHaveProperty('things')
  })

  it('should include $ref for each namespace', async () => {
    const request = new Request('https://test.example.com/rpc', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as SchemaResponse

    expect(data.namespaces.identity.$ref).toBe('https://test.example.com/rpc/do.identity')
  })

  it('should list methods in each namespace', async () => {
    const request = new Request('https://test.example.com/rpc', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as SchemaResponse

    expect(data.namespaces.identity.methods).toContain('get')
    expect(data.namespaces.identity.methods).toContain('setContext')
    expect(data.namespaces.identity.methods).toContain('getContext')
  })

  it('should include common links', async () => {
    const request = new Request('https://test.example.com/rpc', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as SchemaResponse

    expect(data.links).toBeDefined()
    expect(Array.isArray(data.links)).toBe(true)
    expect(data.links.length).toBeGreaterThan(0)
  })

  it('should include identity link', async () => {
    const request = new Request('https://test.example.com/rpc', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as SchemaResponse

    const identityLink = data.links.find((l) => l.rel === 'identity')
    expect(identityLink).toBeDefined()
    expect(identityLink?.href).toBe('https://test.example.com/rpc/do.identity.get')
  })

  it('should include collections link', async () => {
    const request = new Request('https://test.example.com/rpc', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as SchemaResponse

    const collectionsLink = data.links.find((l) => l.rel === 'collections')
    expect(collectionsLink).toBeDefined()
    expect(collectionsLink?.href).toBe('https://test.example.com/rpc/do.collections.list')
  })

  it('should include websocket link', async () => {
    const request = new Request('https://test.example.com/rpc', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as SchemaResponse

    const wsLink = data.links.find((l) => l.rel === 'websocket')
    expect(wsLink).toBeDefined()
    expect(wsLink?.href).toBe('wss://test.example.com/rpc')
  })

  it('should include method count', async () => {
    const request = new Request('https://test.example.com/rpc', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as SchemaResponse

    expect(data.methodCount).toBeDefined()
    expect(typeof data.methodCount).toBe('number')
    expect(data.methodCount).toBeGreaterThan(0)
  })
})

// =============================================================================
// GET /rpc/do.{namespace} (Namespace Response) Tests
// =============================================================================

describe('RPC Routes - GET /rpc/do.{namespace}', () => {
  let handler: RPCRouteHandler
  let registry: MethodRegistry

  beforeEach(() => {
    registry = createTestRegistry()
    handler = new RPCRouteHandler(registry, baseUrl)
  })

  it('should return NamespaceResponse structure', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as NamespaceResponse

    expect(data.$id).toBeDefined()
    expect(data.$type).toBeDefined()
    expect(data.namespace).toBeDefined()
    expect(data.methods).toBeDefined()
    expect(data.links).toBeDefined()
  })

  it('should return 404 for unknown namespace', async () => {
    const request = new Request('https://test.example.com/rpc/do.unknown', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.status).toBe(404)
  })

  it('should include $id with namespace path', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as NamespaceResponse

    expect(data.$id).toBe('https://test.example.com/rpc/do.identity')
  })

  it('should include $type as RPCNamespace', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as NamespaceResponse

    expect(data.$type).toBe('RPCNamespace')
  })

  it('should list all methods in namespace', async () => {
    const request = new Request('https://test.example.com/rpc/do.nouns', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as NamespaceResponse

    expect(data.methods).toHaveLength(5) // list, get, create, update, delete
  })

  it('should include method summaries with href', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as NamespaceResponse

    const getMethod = data.methods.find((m) => m.name === 'get')
    expect(getMethod).toBeDefined()
    expect(getMethod?.href).toBe('https://test.example.com/rpc/do.identity.get')
  })

  it('should include navigation links', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as NamespaceResponse

    expect(data.links).toBeDefined()
    expect(data.links.length).toBeGreaterThan(0)
  })

  it('should include link to schema root', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as NamespaceResponse

    const parentLink = data.links.find((l) => l.rel === 'up' || l.rel === 'parent')
    expect(parentLink).toBeDefined()
    expect(parentLink?.href).toBe('https://test.example.com/rpc')
  })

  it('should include self link', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as NamespaceResponse

    const selfLink = data.links.find((l) => l.rel === 'self')
    expect(selfLink).toBeDefined()
    expect(selfLink?.href).toBe('https://test.example.com/rpc/do.identity')
  })
})

// =============================================================================
// GET /rpc/do.{namespace}.{action} (Method Response) Tests
// =============================================================================

describe('RPC Routes - GET /rpc/do.identity.get', () => {
  let handler: RPCRouteHandler
  let registry: MethodRegistry

  beforeEach(() => {
    registry = createTestRegistry()
    handler = new RPCRouteHandler(registry, baseUrl)
  })

  it('should return MethodResponse structure', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity.get', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as MethodResponse

    expect(data.$id).toBeDefined()
    expect(data.$type).toBeDefined()
    expect(data.name).toBeDefined()
    expect(data.links).toBeDefined()
  })

  it('should return 404 for unknown method', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity.unknown', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.status).toBe(404)
  })

  it('should include $id with method path', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity.get', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as MethodResponse

    expect(data.$id).toBe('https://test.example.com/rpc/do.identity.get')
  })

  it('should include $type as RPCMethod', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity.get', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as MethodResponse

    expect(data.$type).toBe('RPCMethod')
  })

  it('should include method name', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity.get', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as MethodResponse

    expect(data.name).toBe('do.identity.get')
  })

  it('should include description when available', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity.get', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as MethodResponse

    expect(data.description).toBeDefined()
  })

  it('should include params documentation', async () => {
    const request = new Request('https://test.example.com/rpc/do.nouns.get', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as MethodResponse

    expect(data.params).toBeDefined()
  })

  it('should include return type', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity.get', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as MethodResponse

    expect(data.returns).toBeDefined()
  })

  it('should include invoke link', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity.get', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as MethodResponse

    const invokeLink = data.links.find((l) => l.rel === 'invoke')
    expect(invokeLink).toBeDefined()
    expect(invokeLink?.method).toBe('POST')
    expect(invokeLink?.href).toBe('https://test.example.com/rpc/do.identity.get')
  })

  it('should include parent namespace link', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity.get', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as MethodResponse

    const parentLink = data.links.find((l) => l.rel === 'up' || l.rel === 'namespace')
    expect(parentLink).toBeDefined()
    expect(parentLink?.href).toBe('https://test.example.com/rpc/do.identity')
  })

  it('should include related method links', async () => {
    const request = new Request('https://test.example.com/rpc/do.nouns.list', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as MethodResponse

    const relatedLinks = data.links.filter((l) => l.rel === 'related')
    expect(relatedLinks.length).toBeGreaterThan(0)
  })

  it('should include example request and response', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity.get', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as MethodResponse

    expect(data.example).toBeDefined()
    expect(data.example?.request).toBeDefined()
    expect(data.example?.response).toBeDefined()
  })
})

// =============================================================================
// GET /rpc/do.collections.list Tests
// =============================================================================

describe('RPC Routes - GET /rpc/do.collections.list', () => {
  let handler: RPCRouteHandler
  let registry: MethodRegistry

  beforeEach(() => {
    registry = createTestRegistry()
    handler = new RPCRouteHandler(registry, baseUrl)
  })

  it('should return CollectionsResponse structure', async () => {
    const request = new Request('https://test.example.com/rpc/do.collections.list', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as CollectionsResponse

    expect(data.$id).toBeDefined()
    expect(data.$type).toBeDefined()
    expect(data.collections).toBeDefined()
  })

  it('should list all standard collections', async () => {
    const request = new Request('https://test.example.com/rpc/do.collections.list', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as CollectionsResponse

    const collectionNames = data.collections.map((c) => c.name)
    expect(collectionNames).toContain('nouns')
    expect(collectionNames).toContain('verbs')
    expect(collectionNames).toContain('things')
    expect(collectionNames).toContain('actions')
    expect(collectionNames).toContain('relationships')
  })

  it('should include href for each collection', async () => {
    const request = new Request('https://test.example.com/rpc/do.collections.list', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as CollectionsResponse

    const nounsCollection = data.collections.find((c) => c.name === 'nouns')
    expect(nounsCollection?.href).toBe('https://test.example.com/rpc/do.nouns')
  })

  it('should include available operations', async () => {
    const request = new Request('https://test.example.com/rpc/do.collections.list', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as CollectionsResponse

    const nounsCollection = data.collections.find((c) => c.name === 'nouns')
    expect(nounsCollection?.operations).toContain('list')
    expect(nounsCollection?.operations).toContain('get')
    expect(nounsCollection?.operations).toContain('create')
    expect(nounsCollection?.operations).toContain('update')
    expect(nounsCollection?.operations).toContain('delete')
  })

  it('should include operation hrefs', async () => {
    const request = new Request('https://test.example.com/rpc/do.collections.list', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as CollectionsResponse

    const nounsCollection = data.collections.find((c) => c.name === 'nouns')
    expect(nounsCollection?.links?.list).toBe('https://test.example.com/rpc/do.nouns.list')
    expect(nounsCollection?.links?.get).toBe('https://test.example.com/rpc/do.nouns.get')
    expect(nounsCollection?.links?.create).toBe('https://test.example.com/rpc/do.nouns.create')
  })
})

// =============================================================================
// Clickable Link Format Tests
// =============================================================================

describe('RPC Routes - Clickable Link Format', () => {
  it('should generate correct method link format', () => {
    const link = createMethodLink('https://test.example.com', 'do.system.ping')

    expect(link).toBe('https://test.example.com/rpc/do.system.ping')
  })

  it('should handle methods with dots correctly', () => {
    const link = createMethodLink('https://test.example.com', 'do.identity.get')

    // Dots should be preserved, not encoded
    expect(link).toBe('https://test.example.com/rpc/do.identity.get')
  })

  it('should handle base URL with trailing slash', () => {
    const link = createMethodLink('https://test.example.com/', 'do.test')

    // Should not have double slashes
    expect(link).toBe('https://test.example.com/rpc/do.test')
  })

  it('should handle base URL with path', () => {
    const link = createMethodLink('https://api.example.com/v1', 'do.test')

    expect(link).toBe('https://api.example.com/v1/rpc/do.test')
  })

  it('should generate namespace link', () => {
    const link = createMethodLink('https://test.example.com', 'do.identity', true)

    expect(link).toBe('https://test.example.com/rpc/do.identity')
  })
})

// =============================================================================
// 404 for Unknown Methods Tests
// =============================================================================

describe('RPC Routes - 404 for Unknown Methods', () => {
  let handler: RPCRouteHandler
  let registry: MethodRegistry

  beforeEach(() => {
    registry = createTestRegistry()
    handler = new RPCRouteHandler(registry, baseUrl)
  })

  it('should return 404 for unknown method', async () => {
    const request = new Request('https://test.example.com/rpc/do.unknown.method', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.status).toBe(404)
  })

  it('should return JSON error response', async () => {
    const request = new Request('https://test.example.com/rpc/do.unknown.method', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as { error?: { code: number; message: string }; suggestions?: string[] }

    expect(data.error).toBeDefined()
    expect(data.error!.code).toBe(-32601) // MethodNotFound
    expect(data.error!.message).toContain('not found')
  })

  it('should include suggestions for similar methods', async () => {
    const request = new Request('https://test.example.com/rpc/do.nouns.lists', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as { suggestions?: string[] }

    expect(data.suggestions).toBeDefined()
    expect(data.suggestions).toContain('do.nouns.list')
  })

  it('should return 404 for valid namespace but invalid method', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity.invalid', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.status).toBe(404)
    const data = await response.json() as { suggestions?: string[] }
    expect(data.suggestions).toContain('do.identity.get')
  })

  it('should return 404 for completely invalid path', async () => {
    const request = new Request('https://test.example.com/rpc/not-a-valid-method', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.status).toBe(404)
  })

  it('should return 404 with link to method list', async () => {
    const request = new Request('https://test.example.com/rpc/do.unknown', { method: 'GET' })
    const response = await handler.handleRequest(request)
    const data = await response.json() as { _links?: { methods: string }; links?: Array<{ rel: string; href: string }> }

    expect(data._links?.methods || data.links?.find((l) => l.rel === 'methods')?.href).toBe('https://test.example.com/rpc')
  })

  it('should handle empty method name', async () => {
    const request = new Request('https://test.example.com/rpc/', { method: 'GET' })
    const response = await handler.handleRequest(request)

    // Should return root endpoint, not 404
    expect(response.status).toBe(200)
  })

  it('should return appropriate error for malformed method path', async () => {
    const request = new Request('https://test.example.com/rpc/../../../etc/passwd', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect([400, 404]).toContain(response.status)
  })
})

// =============================================================================
// Content Negotiation Tests
// =============================================================================

describe('RPC Routes - Content Negotiation', () => {
  let handler: RPCRouteHandler
  let registry: MethodRegistry

  beforeEach(() => {
    registry = createTestRegistry()
    handler = new RPCRouteHandler(registry, baseUrl)
  })

  it('should return JSON by default', async () => {
    const request = new Request('https://test.example.com/rpc', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.headers.get('Content-Type')).toContain('application/json')
  })

  it('should return HTML for text/html Accept header', async () => {
    const request = new Request('https://test.example.com/rpc', {
      method: 'GET',
      headers: { Accept: 'text/html' },
    })
    const response = await handler.handleRequest(request)

    expect(response.headers.get('Content-Type')).toContain('text/html')
  })

  it('should return JSON for application/json Accept header', async () => {
    const request = new Request('https://test.example.com/rpc', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    const response = await handler.handleRequest(request)

    expect(response.headers.get('Content-Type')).toContain('application/json')
  })

  it('should support format query parameter', async () => {
    const request = new Request('https://test.example.com/rpc?format=html', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.headers.get('Content-Type')).toContain('text/html')
  })

  it('should include clickable links in HTML output', async () => {
    const request = new Request('https://test.example.com/rpc', {
      method: 'GET',
      headers: { Accept: 'text/html' },
    })
    const response = await handler.handleRequest(request)
    const html = await response.text()

    expect(html).toContain('<a href=')
    expect(html).toContain('do.identity.get')
  })
})

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('RPC Routes - createRouteHandler', () => {
  it('should create handler with registry and baseUrl', () => {
    const registry = createTestRegistry()
    const handler = createRouteHandler(registry, baseUrl)

    expect(handler).toBeInstanceOf(RPCRouteHandler)
  })

  it('should handle requests correctly', async () => {
    const registry = createTestRegistry()
    const handler = createRouteHandler(registry, baseUrl)

    const request = new Request('https://test.example.com/rpc', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.status).toBe(200)
  })
})

// =============================================================================
// Constants Tests
// =============================================================================

describe('RPC Routes - STANDARD_COLLECTIONS', () => {
  it('should include all collection names', () => {
    expect(STANDARD_COLLECTIONS).toContain('nouns')
    expect(STANDARD_COLLECTIONS).toContain('verbs')
    expect(STANDARD_COLLECTIONS).toContain('things')
    expect(STANDARD_COLLECTIONS).toContain('actions')
    expect(STANDARD_COLLECTIONS).toContain('relationships')
  })

  it('should include function and workflow collections', () => {
    expect(STANDARD_COLLECTIONS).toContain('functions')
    expect(STANDARD_COLLECTIONS).toContain('workflows')
  })

  it('should include identity collections', () => {
    expect(STANDARD_COLLECTIONS).toContain('users')
    expect(STANDARD_COLLECTIONS).toContain('roles')
    expect(STANDARD_COLLECTIONS).toContain('orgs')
  })

  it('should include integration collections', () => {
    expect(STANDARD_COLLECTIONS).toContain('integrations')
    expect(STANDARD_COLLECTIONS).toContain('webhooks')
  })
})

describe('RPC Routes - COLLECTION_OPERATIONS', () => {
  it('should include CRUD operations', () => {
    expect(COLLECTION_OPERATIONS).toContain('list')
    expect(COLLECTION_OPERATIONS).toContain('get')
    expect(COLLECTION_OPERATIONS).toContain('create')
    expect(COLLECTION_OPERATIONS).toContain('update')
    expect(COLLECTION_OPERATIONS).toContain('delete')
  })
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('RPC Routes - Edge Cases', () => {
  let handler: RPCRouteHandler
  let registry: MethodRegistry

  beforeEach(() => {
    registry = createTestRegistry()
    handler = new RPCRouteHandler(registry, baseUrl)
  })

  it('should handle method names with many dots', async () => {
    registry.register('do.deep.nested.namespace.method', async () => ({ ok: true }))

    const request = new Request('https://test.example.com/rpc/do.deep.nested.namespace.method', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.status).toBe(200)
  })

  it('should handle concurrent requests', async () => {
    const requests = Array.from({ length: 10 }, () =>
      handler.handleRequest(new Request('https://test.example.com/rpc', { method: 'GET' }))
    )

    const responses = await Promise.all(requests)

    expect(responses.every((r) => r.status === 200)).toBe(true)
  })

  it('should handle URL encoded method names', async () => {
    const request = new Request('https://test.example.com/rpc/do%2Eidentity%2Eget', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.status).toBe(200)
  })

  it('should set appropriate cache headers', async () => {
    const request = new Request('https://test.example.com/rpc', { method: 'GET' })
    const response = await handler.handleRequest(request)

    expect(response.headers.get('Cache-Control')).toBeDefined()
  })

  it('should include CORS headers', async () => {
    const request = new Request('https://test.example.com/rpc', {
      method: 'GET',
      headers: { Origin: 'https://other.example.com' },
    })
    const response = await handler.handleRequest(request)

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined()
  })

  it('should handle OPTIONS preflight', async () => {
    const request = new Request('https://test.example.com/rpc/do.identity.get', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://other.example.com',
        'Access-Control-Request-Method': 'POST',
      },
    })
    const response = await handler.handleRequest(request)

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })

  it('should handle POST requests for method invocation', async () => {
    const request = new Request('https://test.example.com/rpc/do.system.ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const response = await handler.handleRequest(request)

    expect(response.status).toBe(200)
    const data = await response.json() as { pong?: boolean }
    expect(data.pong).toBe(true)
  })
})
