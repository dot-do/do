/**
 * @dotdo/do - Auth Context Access Tests (RED Phase)
 *
 * Tests for methods accessing auth context.
 * Verifies that RPC methods can access authentication information
 * including userId, organizationId, permissions, token, and metadata.
 *
 * These tests use the Cloudflare test utilities for proper DO instantiation.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'
import type { DurableObjectStub } from '@cloudflare/workers-types'
import type { AuthContext } from '../src/types'
import { createTestStub, uniqueTestName, withTestDO } from './helpers/do-test-utils'

// Type for DO stub with RPC methods
interface DOStub extends DurableObjectStub {
  get(collection: string, id: string): Promise<unknown>
  list(collection: string, options?: unknown): Promise<unknown[]>
  create(collection: string, doc: Record<string, unknown>): Promise<Record<string, unknown>>
  update(collection: string, id: string, updates: Record<string, unknown>): Promise<unknown>
  delete(collection: string, id: string): Promise<boolean>
  invoke(method: string, params: unknown[], authContext?: AuthContext): Promise<unknown>
  search(query: string, options?: unknown): Promise<unknown[]>
}

describe('Auth Context Access', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('auth-context')
    stub = createTestStub(name) as DOStub
  })

  describe('AuthContext Type', () => {
    it('should export AuthContext type with required properties', async () => {
      // This test verifies the type structure at compile time
      // The AuthContext interface should have these properties
      const authContext: AuthContext = {
        userId: 'user-123',
        organizationId: 'org-456',
        permissions: ['read', 'write'],
        token: 'jwt-token',
        metadata: { role: 'admin' },
      }

      expect(authContext.userId).toBe('user-123')
      expect(authContext.organizationId).toBe('org-456')
      expect(authContext.permissions).toEqual(['read', 'write'])
      expect(authContext.token).toBe('jwt-token')
      expect(authContext.metadata).toEqual({ role: 'admin' })
    })

    it('should allow partial AuthContext (all fields optional)', () => {
      // AuthContext fields should all be optional
      const minimalAuth: AuthContext = {}
      expect(minimalAuth).toBeDefined()

      const withOnlyUser: AuthContext = { userId: 'user-123' }
      expect(withOnlyUser.userId).toBe('user-123')
    })
  })

  describe('getAuthContext() method', () => {
    it('should have getAuthContext method', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).getAuthContext).toBeDefined()
        expect(typeof (instance as any).getAuthContext).toBe('function')
      })
    })

    it('should return null when no auth context is set', async () => {
      await runInDurableObject(stub, async (instance) => {
        const auth = (instance as any).getAuthContext()
        expect(auth).toBeNull()
      })
    })

    it('should return auth context when set', async () => {
      await runInDurableObject(stub, async (instance) => {
        const authContext: AuthContext = {
          userId: 'user-123',
          organizationId: 'org-456',
          permissions: ['read'],
        }
        ;(instance as any).setAuthContext(authContext)

        const auth = (instance as any).getAuthContext()
        expect(auth).toEqual(authContext)
      })
    })
  })

  describe('setAuthContext() method', () => {
    it('should have setAuthContext method', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).setAuthContext).toBeDefined()
        expect(typeof (instance as any).setAuthContext).toBe('function')
      })
    })

    it('should set auth context for the current request', async () => {
      await runInDurableObject(stub, async (instance) => {
        const authContext: AuthContext = {
          userId: 'user-123',
          organizationId: 'org-456',
        }

        ;(instance as any).setAuthContext(authContext)
        const auth = (instance as any).getAuthContext()

        expect(auth?.userId).toBe('user-123')
        expect(auth?.organizationId).toBe('org-456')
      })
    })

    it('should allow clearing auth context by setting null', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).setAuthContext({ userId: 'user-123' })
        ;(instance as any).setAuthContext(null)

        const auth = (instance as any).getAuthContext()
        expect(auth).toBeNull()
      })
    })
  })

  describe('invoke() with auth context', () => {
    it('should pass auth context as third parameter to invoke()', async () => {
      await runInDurableObject(stub, async (instance) => {
        const authContext: AuthContext = {
          userId: 'user-123',
          permissions: ['read'],
        }

        // invoke should accept optional auth context
        const result = await (instance as any).invoke('get', ['users', '123'], authContext)
        expect(result).toBeNull() // No data yet, but should not throw
      })
    })

    it('should make auth context available during method execution', async () => {
      await runInDurableObject(stub, async (instance) => {
        // Add whoami to allowed methods
        ;(instance as any).allowedMethods.add('whoami')
        // Define whoami method
        ;(instance as any).whoami = function () {
          return this.getAuthContext()
        }

        const authContext: AuthContext = {
          userId: 'test-user-456',
          organizationId: 'test-org-789',
        }

        const result = await (instance as any).invoke('whoami', [], authContext)
        expect(result).toEqual(authContext)
      })
    })

    it('should isolate auth context between invocations', async () => {
      await runInDurableObject(stub, async (instance) => {
        // Add whoami to allowed methods
        ;(instance as any).allowedMethods.add('whoami')
        // Define whoami method
        ;(instance as any).whoami = function () {
          return this.getAuthContext()
        }

        // First invocation with auth
        const auth1: AuthContext = { userId: 'user-1' }
        const result1 = await (instance as any).invoke('whoami', [], auth1)
        expect(result1).toEqual(auth1)

        // Second invocation with different auth
        const auth2: AuthContext = { userId: 'user-2' }
        const result2 = await (instance as any).invoke('whoami', [], auth2)
        expect(result2).toEqual(auth2)

        // Third invocation without auth
        const result3 = await (instance as any).invoke('whoami', [])
        expect(result3).toBeNull()
      })
    })
  })

  describe('RPC with auth context', () => {
    it('should extract auth from Authorization header in RPC requests', async () => {
      await runInDurableObject(stub, async (instance) => {
        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-jwt-token',
          },
          body: JSON.stringify({
            id: '1',
            method: 'get',
            params: ['users', '123'],
          }),
        })

        const response = await (instance as any).handleRequest(request)
        expect(response).toBeInstanceOf(Response)
        // Auth should have been extracted from header
      })
    })

    it('should support custom X-Auth-Context header for full auth context', async () => {
      await runInDurableObject(stub, async (instance) => {
        const authContext: AuthContext = {
          userId: 'user-123',
          organizationId: 'org-456',
          permissions: ['read', 'write'],
          metadata: { tenantId: 'tenant-1' },
        }

        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Context': JSON.stringify(authContext),
          },
          body: JSON.stringify({
            id: '1',
            method: 'get',
            params: ['users', '123'],
          }),
        })

        const response = await (instance as any).handleRequest(request)
        expect(response).toBeInstanceOf(Response)
      })
    })
  })

  describe('Permission checks', () => {
    it('should have checkPermission method', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).checkPermission).toBeDefined()
        expect(typeof (instance as any).checkPermission).toBe('function')
      })
    })

    it('should return true when user has required permission', async () => {
      await runInDurableObject(stub, async (instance) => {
        const authContext: AuthContext = {
          userId: 'user-123',
          permissions: ['read', 'write', 'admin'],
        }
        ;(instance as any).setAuthContext(authContext)

        expect((instance as any).checkPermission('read')).toBe(true)
        expect((instance as any).checkPermission('write')).toBe(true)
        expect((instance as any).checkPermission('admin')).toBe(true)
      })
    })

    it('should return false when user lacks required permission', async () => {
      await runInDurableObject(stub, async (instance) => {
        const authContext: AuthContext = {
          userId: 'user-123',
          permissions: ['read'],
        }
        ;(instance as any).setAuthContext(authContext)

        expect((instance as any).checkPermission('write')).toBe(false)
        expect((instance as any).checkPermission('admin')).toBe(false)
        expect((instance as any).checkPermission('delete')).toBe(false)
      })
    })

    it('should return false when no auth context is set', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).checkPermission('read')).toBe(false)
      })
    })

    it('should return false when permissions array is empty', async () => {
      await runInDurableObject(stub, async (instance) => {
        const authContext: AuthContext = {
          userId: 'user-123',
          permissions: [],
        }
        ;(instance as any).setAuthContext(authContext)

        expect((instance as any).checkPermission('read')).toBe(false)
      })
    })

    it('should return false when permissions is undefined', async () => {
      await runInDurableObject(stub, async (instance) => {
        const authContext: AuthContext = {
          userId: 'user-123',
        }
        ;(instance as any).setAuthContext(authContext)

        expect((instance as any).checkPermission('read')).toBe(false)
      })
    })
  })

  describe('requirePermission helper', () => {
    it('should have requirePermission method', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).requirePermission).toBeDefined()
        expect(typeof (instance as any).requirePermission).toBe('function')
      })
    })

    it('should not throw when user has required permission', async () => {
      await runInDurableObject(stub, async (instance) => {
        const authContext: AuthContext = {
          userId: 'user-123',
          permissions: ['admin'],
        }
        ;(instance as any).setAuthContext(authContext)

        expect(() => (instance as any).requirePermission('admin')).not.toThrow()
      })
    })

    it('should throw when user lacks required permission', async () => {
      await runInDurableObject(stub, async (instance) => {
        const authContext: AuthContext = {
          userId: 'user-123',
          permissions: ['read'],
        }
        ;(instance as any).setAuthContext(authContext)

        expect(() => (instance as any).requirePermission('admin')).toThrow('Permission denied')
      })
    })

    it('should throw when no auth context is set', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect(() => (instance as any).requirePermission('read')).toThrow('Authentication required')
      })
    })
  })

  describe('Auth metadata access', () => {
    it('should allow accessing custom metadata fields', async () => {
      await runInDurableObject(stub, async (instance) => {
        const authContext: AuthContext = {
          userId: 'user-123',
          metadata: {
            tenantId: 'tenant-456',
            roles: ['admin', 'user'],
            subscription: 'premium',
          },
        }
        ;(instance as any).setAuthContext(authContext)

        const auth = (instance as any).getAuthContext()
        expect(auth?.metadata?.tenantId).toBe('tenant-456')
        expect(auth?.metadata?.roles).toEqual(['admin', 'user'])
        expect(auth?.metadata?.subscription).toBe('premium')
      })
    })

    it('should have getAuthMetadata helper for easy metadata access', async () => {
      await runInDurableObject(stub, async (instance) => {
        const authContext: AuthContext = {
          userId: 'user-123',
          metadata: {
            tenantId: 'tenant-456',
          },
        }
        ;(instance as any).setAuthContext(authContext)

        const tenantId = (instance as any).getAuthMetadata('tenantId')
        expect(tenantId).toBe('tenant-456')
      })
    })

    it('should return undefined for missing metadata fields', async () => {
      await runInDurableObject(stub, async (instance) => {
        const authContext: AuthContext = {
          userId: 'user-123',
          metadata: {},
        }
        ;(instance as any).setAuthContext(authContext)

        const missing = (instance as any).getAuthMetadata('nonexistent')
        expect(missing).toBeUndefined()
      })
    })

    it('should return undefined when metadata is not set', async () => {
      await runInDurableObject(stub, async (instance) => {
        const authContext: AuthContext = {
          userId: 'user-123',
        }
        ;(instance as any).setAuthContext(authContext)

        const result = (instance as any).getAuthMetadata('anything')
        expect(result).toBeUndefined()
      })
    })
  })

  describe('Auth context inheritance', () => {
    it('should have withAuth method for creating scoped instances', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).withAuth).toBeDefined()
        expect(typeof (instance as any).withAuth).toBe('function')
      })
    })

    it('should create a scoped proxy with fixed auth context', async () => {
      await runInDurableObject(stub, async (instance) => {
        const authContext: AuthContext = {
          userId: 'scoped-user',
          permissions: ['read', 'write'],
        }

        const scopedDO = (instance as any).withAuth(authContext)

        // The scoped proxy should have getAuthContext method
        expect(scopedDO.getAuthContext()).toEqual(authContext)
      })
    })

    it('should not affect the original instance', async () => {
      await runInDurableObject(stub, async (instance) => {
        const authContext: AuthContext = {
          userId: 'scoped-user',
        }

        const scopedDO = (instance as any).withAuth(authContext)

        // Original instance should still have no auth
        expect((instance as any).getAuthContext()).toBeNull()

        // Scoped instance should have auth
        expect(scopedDO.getAuthContext()).toEqual(authContext)
      })
    })
  })

  describe('Integration: HTTP handler auth extraction', () => {
    it('should extract userId from Bearer token', async () => {
      await runInDurableObject(stub, async (instance) => {
        // This requires JWT decoding - for now just verify the header is processed
        const request = new Request('http://localhost/api/users', {
          method: 'GET',
          headers: {
            Authorization:
              'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyJ9.xxx',
          },
        })

        const response = await (instance as any).handleRequest(request)
        expect(response).toBeInstanceOf(Response)
      })
    })

    it('should handle missing Authorization header gracefully', async () => {
      await runInDurableObject(stub, async (instance) => {
        const request = new Request('http://localhost/api/users', {
          method: 'GET',
        })

        const response = await (instance as any).handleRequest(request)
        // Should still work for public endpoints
        expect(response).toBeInstanceOf(Response)
      })
    })

    it('should handle malformed Authorization header', async () => {
      await runInDurableObject(stub, async (instance) => {
        const request = new Request('http://localhost/api/users', {
          method: 'GET',
          headers: {
            Authorization: 'InvalidFormat token-value',
          },
        })

        const response = await (instance as any).handleRequest(request)
        // Should handle gracefully, treating as unauthenticated
        expect(response).toBeInstanceOf(Response)
      })
    })
  })
})

describe('Auth Context Propagation Through All Transports', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('auth-propagation')
    stub = createTestStub(name) as DOStub
  })

  describe('HTTP REST Transport Propagation', () => {
    describe('GET requests', () => {
      it('should propagate auth to GET /api/:resource handler', async () => {
        await runInDurableObject(stub, async (instance) => {
          const request = new Request('http://localhost/api/users', {
            headers: {
              Authorization: 'Bearer http-get-token',
              'X-User-ID': 'http-get-user',
            },
          })

          // Capture auth in list method
          let capturedAuth: AuthContext | undefined
          const originalList = (instance as any).list.bind(instance)
          ;(instance as any).list = async function (
            this: any,
            collection: string,
            options?: any
          ) {
            capturedAuth = this.getAuthContext?.()
            return originalList(collection, options)
          }

          await (instance as any).handleRequest(request)

          expect(capturedAuth).toBeDefined()
          expect(capturedAuth?.userId).toBe('http-get-user')
          expect(capturedAuth?.token).toBe('http-get-token')
        })
      })

      it('should propagate auth to GET /api/:resource/:id handler', async () => {
        await runInDurableObject(stub, async (instance) => {
          // Create a document first
          await (instance as any).create('users', { id: 'test-user-1', name: 'Test' })

          const request = new Request('http://localhost/api/users/test-user-1', {
            headers: {
              Authorization: 'Bearer http-get-single-token',
              'X-User-ID': 'http-get-single-user',
            },
          })

          let capturedAuth: AuthContext | undefined
          const originalGet = (instance as any).get.bind(instance)
          ;(instance as any).get = async function (this: any, collection: string, id: string) {
            capturedAuth = this.getAuthContext?.()
            return originalGet(collection, id)
          }

          await (instance as any).handleRequest(request)

          expect(capturedAuth).toBeDefined()
          expect(capturedAuth?.userId).toBe('http-get-single-user')
        })
      })
    })

    describe('POST requests', () => {
      it('should propagate auth to POST /api/:resource handler', async () => {
        await runInDurableObject(stub, async (instance) => {
          const request = new Request('http://localhost/api/users', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer http-post-token',
              'X-User-ID': 'http-post-user',
              'X-Organization-ID': 'http-post-org',
            },
            body: JSON.stringify({ name: 'New User' }),
          })

          let capturedAuth: AuthContext | undefined
          const originalCreate = (instance as any).create.bind(instance)
          ;(instance as any).create = async function (this: any, collection: string, doc: any) {
            capturedAuth = this.getAuthContext?.()
            return originalCreate(collection, doc)
          }

          await (instance as any).handleRequest(request)

          expect(capturedAuth).toBeDefined()
          expect(capturedAuth?.userId).toBe('http-post-user')
          expect(capturedAuth?.organizationId).toBe('http-post-org')
          expect(capturedAuth?.token).toBe('http-post-token')
        })
      })
    })

    describe('PUT requests', () => {
      it('should propagate auth to PUT /api/:resource/:id handler', async () => {
        await runInDurableObject(stub, async (instance) => {
          await (instance as any).create('users', { id: 'update-user', name: 'Original' })

          const request = new Request('http://localhost/api/users/update-user', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer http-put-token',
              'X-User-ID': 'http-put-user',
            },
            body: JSON.stringify({ name: 'Updated' }),
          })

          let capturedAuth: AuthContext | undefined
          const originalUpdate = (instance as any).update.bind(instance)
          ;(instance as any).update = async function (
            this: any,
            collection: string,
            id: string,
            updates: any
          ) {
            capturedAuth = this.getAuthContext?.()
            return originalUpdate(collection, id, updates)
          }

          await (instance as any).handleRequest(request)

          expect(capturedAuth).toBeDefined()
          expect(capturedAuth?.userId).toBe('http-put-user')
        })
      })
    })

    describe('DELETE requests', () => {
      it('should propagate auth to DELETE /api/:resource/:id handler', async () => {
        await runInDurableObject(stub, async (instance) => {
          await (instance as any).create('users', { id: 'delete-user', name: 'To Delete' })

          const request = new Request('http://localhost/api/users/delete-user', {
            method: 'DELETE',
            headers: {
              Authorization: 'Bearer http-delete-token',
              'X-User-ID': 'http-delete-user',
            },
          })

          let capturedAuth: AuthContext | undefined
          const originalDelete = (instance as any).delete.bind(instance)
          ;(instance as any).delete = async function (
            this: any,
            collection: string,
            id: string
          ) {
            capturedAuth = this.getAuthContext?.()
            return originalDelete(collection, id)
          }

          await (instance as any).handleRequest(request)

          expect(capturedAuth).toBeDefined()
          expect(capturedAuth?.userId).toBe('http-delete-user')
        })
      })
    })
  })

  describe('RPC Transport Propagation', () => {
    describe('Single RPC requests', () => {
      it('should propagate auth to RPC method invocation', async () => {
        await runInDurableObject(stub, async (instance) => {
          const request = new Request('http://localhost/rpc', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer rpc-single-token',
              'X-User-ID': 'rpc-single-user',
            },
            body: JSON.stringify({
              id: '1',
              method: 'list',
              params: ['users', {}],
            }),
          })

          let capturedAuth: AuthContext | undefined
          const originalInvoke = (instance as any).invoke.bind(instance)
          ;(instance as any).invoke = async function (
            this: any,
            method: string,
            params: unknown[],
            auth?: AuthContext
          ) {
            capturedAuth = this.getAuthContext?.()
            return originalInvoke.call(this, method, params, auth)
          }

          await (instance as any).handleRequest(request)

          expect(capturedAuth).toBeDefined()
          expect(capturedAuth?.userId).toBe('rpc-single-user')
          expect(capturedAuth?.token).toBe('rpc-single-token')
        })
      })

      it('should propagate auth from X-Auth-Context header', async () => {
        await runInDurableObject(stub, async (instance) => {
          const authContext: AuthContext = {
            userId: 'rpc-context-user',
            organizationId: 'rpc-context-org',
            permissions: ['read', 'write', 'delete'],
            metadata: { role: 'admin' },
          }

          const request = new Request('http://localhost/rpc', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Auth-Context': JSON.stringify(authContext),
            },
            body: JSON.stringify({
              id: '1',
              method: 'list',
              params: ['users', {}],
            }),
          })

          let capturedAuth: AuthContext | undefined
          const originalInvoke = (instance as any).invoke.bind(instance)
          ;(instance as any).invoke = async function (
            this: any,
            method: string,
            params: unknown[],
            auth?: AuthContext
          ) {
            capturedAuth = this.getAuthContext?.()
            return originalInvoke.call(this, method, params, auth)
          }

          await (instance as any).handleRequest(request)

          expect(capturedAuth).toBeDefined()
          expect(capturedAuth?.userId).toBe('rpc-context-user')
          expect(capturedAuth?.organizationId).toBe('rpc-context-org')
          expect(capturedAuth?.permissions).toEqual(['read', 'write', 'delete'])
          expect(capturedAuth?.metadata?.role).toBe('admin')
        })
      })
    })
  })

  describe('Auth Context Lifecycle', () => {
    it('should clear auth context after request completes', async () => {
      await runInDurableObject(stub, async (instance) => {
        const request = new Request('http://localhost/api/users', {
          headers: {
            Authorization: 'Bearer lifecycle-token',
            'X-User-ID': 'lifecycle-user',
          },
        })

        await (instance as any).handleRequest(request)

        // After request, auth should be cleared
        const authAfterRequest = (instance as any).getAuthContext?.()
        expect(authAfterRequest).toBeNull()
      })
    })

    it('should not leak auth between sequential requests', async () => {
      await runInDurableObject(stub, async (instance) => {
        // First request with auth
        const request1 = new Request('http://localhost/api/users', {
          headers: {
            Authorization: 'Bearer first-token',
            'X-User-ID': 'first-user',
          },
        })
        await (instance as any).handleRequest(request1)

        // Second request without auth
        const request2 = new Request('http://localhost/api/users')

        let secondRequestAuth: AuthContext | undefined
        const originalList = (instance as any).list.bind(instance)
        ;(instance as any).list = async function (
          this: any,
          collection: string,
          options?: any
        ) {
          secondRequestAuth = this.getAuthContext?.()
          return originalList(collection, options)
        }

        await (instance as any).handleRequest(request2)

        // Second request should NOT have first request's auth
        expect(secondRequestAuth?.userId).toBeUndefined()
        expect(secondRequestAuth?.token).toBeUndefined()
      })
    })

    it('should maintain auth throughout async operations within a request', async () => {
      await runInDurableObject(stub, async (instance) => {
        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer async-token',
            'X-User-ID': 'async-user',
          },
          body: JSON.stringify({
            id: '1',
            method: 'list',
            params: ['users', {}],
          }),
        })

        const authChecks: (AuthContext | null | undefined)[] = []

        const originalInvoke = (instance as any).invoke.bind(instance)
        ;(instance as any).invoke = async function (
          this: any,
          method: string,
          params: unknown[],
          auth?: AuthContext
        ) {
          // Check before async work
          authChecks.push(this.getAuthContext?.())

          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, 10))

          // Check after async work
          authChecks.push(this.getAuthContext?.())

          return originalInvoke.call(this, method, params, auth)
        }

        await (instance as any).handleRequest(request)

        // Auth should be consistent throughout
        expect(authChecks.length).toBe(2)
        expect(authChecks[0]?.userId).toBe('async-user')
        expect(authChecks[1]?.userId).toBe('async-user')
      })
    })
  })
})
