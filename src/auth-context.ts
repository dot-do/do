/**
 * @dotdo/do - Auth Context Propagation
 *
 * This module provides auth context methods for the DO class.
 * These methods are mixed into the DO class to provide authentication
 * context propagation across all transports (HTTP, WebSocket, RPC).
 *
 * NOTE: This file should be merged into do.ts when the concurrent
 * editing situation is resolved.
 */

import type { AuthContext } from './types'

/**
 * Auth context mixin methods for the DO class.
 * These should be added to the DO class body.
 */
export const authContextMethods = {
  /**
   * Get the current auth context
   * Returns null if no auth context is set
   */
  getAuthContext(this: { _authContext?: AuthContext }): AuthContext | null {
    return this._authContext ?? null
  },

  /**
   * Set the auth context for the current request
   * @param authContext - The auth context to set, or null to clear
   */
  setAuthContext(this: { _authContext?: AuthContext }, authContext: AuthContext | null): void {
    this._authContext = authContext ?? undefined
  },

  /**
   * Check if the current user has a specific permission
   * @param permission - The permission to check
   * @returns true if the user has the permission, false otherwise
   */
  checkPermission(this: { getAuthContext(): AuthContext | null }, permission: string): boolean {
    const auth = this.getAuthContext()
    if (!auth) {
      return false
    }
    if (!auth.permissions || auth.permissions.length === 0) {
      return false
    }
    return auth.permissions.includes(permission)
  },

  /**
   * Require a specific permission, throwing an error if not present
   * @param permission - The permission required
   * @throws Error if the user doesn't have the permission
   */
  requirePermission(
    this: { getAuthContext(): AuthContext | null; checkPermission(p: string): boolean },
    permission: string
  ): void {
    const auth = this.getAuthContext()
    if (!auth) {
      throw new Error('Authentication required')
    }
    if (!this.checkPermission(permission)) {
      throw new Error('Permission denied')
    }
  },

  /**
   * Get a value from the auth context metadata
   * @param key - The metadata key to retrieve
   * @returns The value from metadata, or undefined if not found
   */
  getAuthMetadata<T = unknown>(
    this: { getAuthContext(): AuthContext | null },
    key: string
  ): T | undefined {
    const auth = this.getAuthContext()
    if (!auth || !auth.metadata) {
      return undefined
    }
    return auth.metadata[key] as T | undefined
  },
}

/**
 * Create a scoped instance with a fixed auth context
 * Operations on the returned proxy will use the provided auth context
 * @param target - The DO instance
 * @param authContext - The auth context to use for all operations
 * @returns A proxy that uses the fixed auth context
 */
export function withAuth<T extends { _authContext?: AuthContext }>(
  target: T,
  authContext: AuthContext
): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver)

      // For getAuthContext, return the fixed auth context
      if (prop === 'getAuthContext') {
        return () => authContext
      }

      // For functions, wrap them to set auth context
      if (typeof value === 'function') {
        return function (this: unknown, ...args: unknown[]) {
          // Set auth context before calling
          obj._authContext = authContext
          try {
            const result = value.apply(obj, args)
            // Handle async functions
            if (result instanceof Promise) {
              return result.finally(() => {
                // Don't clear here - let the proxy maintain the context
              })
            }
            return result
          } catch (error) {
            throw error
          }
        }
      }

      return value
    },
  }) as T
}

/**
 * Updated invoke method that accepts auth context as third parameter
 * This should replace the existing invoke method in DO class
 */
export async function invokeWithAuth(
  this: {
    allowedMethods: Set<string>
    _authContext?: AuthContext
    [key: string]: unknown
  },
  method: string,
  params: unknown[],
  authContext?: AuthContext
): Promise<unknown> {
  if (!this.allowedMethods.has(method)) {
    throw new Error(`Method not allowed: ${method}`)
  }

  const fn = this[method]
  if (typeof fn !== 'function') {
    throw new Error(`Method not found: ${method}`)
  }

  // Save current auth context to restore after execution (isolation)
  const previousAuthContext = this._authContext

  try {
    // Set auth context for this invocation if provided
    if (authContext !== undefined) {
      this._authContext = authContext
    }

    return await (fn as (...args: unknown[]) => Promise<unknown>).apply(this, params)
  } finally {
    // Restore previous auth context (or clear if none was set before)
    this._authContext = previousAuthContext
  }
}

/**
 * Code to add to the DO class:
 *
 * 1. Add to imports:
 *    AuthContext,
 *
 * 2. Add as class property:
 *    private _authContext: AuthContext | undefined = undefined
 *
 * 3. Add these methods to the class:
 *    - getAuthContext(): AuthContext | null
 *    - setAuthContext(authContext: AuthContext | null): void
 *    - checkPermission(permission: string): boolean
 *    - requirePermission(permission: string): void
 *    - getAuthMetadata<T>(key: string): T | undefined
 *    - withAuth(authContext: AuthContext): this
 *
 * 4. Update invoke method signature:
 *    async invoke(method: string, params: unknown[], authContext?: AuthContext): Promise<unknown>
 *
 * 5. Update invoke method body to set/restore _authContext
 */
