/**
 * @dotdo/do - Test Helper Utilities
 *
 * Convenient functions for testing Durable Objects with the
 * @cloudflare/vitest-pool-workers integration.
 */

import { env, runInDurableObject } from 'cloudflare:test'
import type { DurableObjectStub, DurableObjectState } from '@cloudflare/workers-types'

// Counter for generating unique names
let nameCounter = 0

/**
 * Configuration options for createTestStub
 */
export interface TestStubConfig {
  /** Whether to isolate this stub (hint only, actual isolation depends on name uniqueness) */
  isolate?: boolean
}

/**
 * Create a named DO stub for testing.
 *
 * @param name - The name to use for the DO instance
 * @param config - Optional configuration
 * @returns A DurableObjectStub that can call RPC methods
 */
export function createTestStub(name: string, _config?: TestStubConfig): DurableObjectStub {
  const id = env.DO.idFromName(name)
  return env.DO.get(id)
}

/**
 * Generate a unique test name to avoid collisions between tests.
 *
 * @param prefix - The prefix to use for the generated name
 * @returns A unique name containing the prefix
 */
export function uniqueTestName(prefix: string): string {
  nameCounter++
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  const safeName = prefix ? `${prefix}-${timestamp}-${nameCounter}-${random}` : `${timestamp}-${nameCounter}-${random}`
  // Ensure URL-safe by replacing any non-alphanumeric chars
  return safeName.replace(/[^a-zA-Z0-9_-]/g, '-')
}

/**
 * Options for withTestDO
 */
export interface WithTestDOOptions {
  /** Whether to cleanup data after the scope ends */
  cleanup?: boolean
}

/**
 * Scoped DO access with automatic unique naming.
 *
 * Each call creates a unique DO instance unless the same prefix
 * is used with cleanup: false.
 *
 * @param prefix - Prefix for the unique DO name
 * @param fn - Function to execute with the stub
 * @param options - Optional cleanup configuration
 * @returns The result of the function
 */
export async function withTestDO<T>(
  prefix: string,
  fn: (stub: DurableObjectStub) => Promise<T>,
  options?: WithTestDOOptions
): Promise<T> {
  const name = options?.cleanup ? prefix : uniqueTestName(prefix)
  const stub = createTestStub(name)
  const result = await fn(stub)

  if (options?.cleanup) {
    // Clean up by deleting all documents - access storage directly
    await runInDurableObject(stub, async (_instance, state) => {
      try {
        // Delete all documents
        state.storage.sql.exec('DELETE FROM documents')
        // Delete all things
        state.storage.sql.exec('DELETE FROM things')
        // Delete all relationships
        state.storage.sql.exec('DELETE FROM relationships')
        // Delete all events
        state.storage.sql.exec('DELETE FROM events')
        // Delete all actions
        state.storage.sql.exec('DELETE FROM actions')
        // Delete all artifacts
        state.storage.sql.exec('DELETE FROM artifacts')
      } catch {
        // Tables may not exist, ignore errors
      }
    })
  }

  return result
}

/**
 * Document data to seed
 */
export interface SeedDocument {
  collection: string
  id: string
  data: Record<string, unknown>
}

/**
 * Thing data to seed
 */
export interface SeedThing {
  ns: string
  type: string
  id: string
  data?: Record<string, unknown>
}

/**
 * Data to seed into the DO
 */
export interface SeedData {
  documents?: SeedDocument[]
  things?: SeedThing[]
}

/**
 * Result of seeding test data
 */
export interface SeedResult {
  documentCount: number
  thingCount: number
}

/**
 * Seed test data via RPC calls.
 *
 * @param stub - The DO stub to seed data into
 * @param data - The documents and things to create
 * @returns Summary of seeded data
 */
export async function seedTestData(stub: DurableObjectStub, data: SeedData): Promise<SeedResult> {
  let documentCount = 0
  let thingCount = 0

  if (data.documents) {
    for (const doc of data.documents) {
      await (stub as unknown as { create: (collection: string, data: Record<string, unknown>) => Promise<unknown> }).create(doc.collection, {
        id: doc.id,
        ...doc.data,
      })
      documentCount++
    }
  }

  if (data.things) {
    for (const thing of data.things) {
      await (stub as unknown as { createThing: (options: { ns: string; type: string; id: string; data: Record<string, unknown> }) => Promise<unknown> }).createThing({
        ns: thing.ns,
        type: thing.type,
        id: thing.id,
        data: thing.data ?? {},
      })
      thingCount++
    }
  }

  return { documentCount, thingCount }
}

/**
 * Document assertion
 */
export interface DocumentAssertion {
  collection: string
  id: string
  exists: boolean
  data?: Record<string, unknown>
  matchPartial?: boolean
}

/**
 * Thing assertion
 */
export interface ThingAssertion {
  ns: string
  type: string
  id: string
  exists: boolean
  data?: Record<string, unknown>
}

/**
 * Collection assertion
 */
export interface CollectionAssertion {
  name: string
  count: number
}

/**
 * State assertions to verify
 */
export interface StateAssertions {
  documents?: DocumentAssertion[]
  things?: ThingAssertion[]
  collections?: CollectionAssertion[]
}

/**
 * Assert DO state matches expectations.
 *
 * Throws an error if any assertion fails.
 *
 * @param stub - The DO stub to check
 * @param assertions - The state assertions to verify
 */
export async function assertDOState(stub: DurableObjectStub, assertions: StateAssertions): Promise<void> {
  const errors: string[] = []

  // Type-cast stub for RPC access
  const rpc = stub as unknown as {
    get: (collection: string, id: string) => Promise<Record<string, unknown> | null>
    list: (collection: string, options?: { limit?: number }) => Promise<Record<string, unknown>[]>
    getThingById: (ns: string, type: string, id: string) => Promise<{ data: Record<string, unknown> } | null>
  }

  // Check document assertions
  if (assertions.documents) {
    for (const assertion of assertions.documents) {
      const doc = await rpc.get(assertion.collection, assertion.id)

      if (assertion.exists && !doc) {
        errors.push(`Document ${assertion.collection}/${assertion.id} should exist but does not`)
        continue
      }

      if (!assertion.exists && doc) {
        errors.push(`Document ${assertion.collection}/${assertion.id} should not exist but does`)
        continue
      }

      if (assertion.exists && assertion.data && doc) {
        if (assertion.matchPartial) {
          // Check only specified fields
          for (const [key, value] of Object.entries(assertion.data)) {
            if (JSON.stringify(doc[key]) !== JSON.stringify(value)) {
              errors.push(
                `Document ${assertion.collection}/${assertion.id} field "${key}" mismatch: expected ${JSON.stringify(value)}, got ${JSON.stringify(doc[key])}`
              )
            }
          }
        } else {
          // Check all specified fields exactly
          for (const [key, value] of Object.entries(assertion.data)) {
            if (JSON.stringify(doc[key]) !== JSON.stringify(value)) {
              errors.push(
                `Document ${assertion.collection}/${assertion.id} field "${key}" mismatch: expected ${JSON.stringify(value)}, got ${JSON.stringify(doc[key])}`
              )
            }
          }
        }
      }
    }
  }

  // Check thing assertions
  if (assertions.things) {
    for (const assertion of assertions.things) {
      const thing = await rpc.getThingById(assertion.ns, assertion.type, assertion.id)

      if (assertion.exists && !thing) {
        errors.push(`Thing ${assertion.ns}:${assertion.type}:${assertion.id} should exist but does not`)
        continue
      }

      if (!assertion.exists && thing) {
        errors.push(`Thing ${assertion.ns}:${assertion.type}:${assertion.id} should not exist but does`)
        continue
      }

      if (assertion.exists && assertion.data && thing) {
        for (const [key, value] of Object.entries(assertion.data)) {
          if (JSON.stringify(thing.data[key]) !== JSON.stringify(value)) {
            errors.push(
              `Thing ${assertion.ns}:${assertion.type}:${assertion.id} data field "${key}" mismatch: expected ${JSON.stringify(value)}, got ${JSON.stringify(thing.data[key])}`
            )
          }
        }
      }
    }
  }

  // Check collection count assertions
  if (assertions.collections) {
    for (const assertion of assertions.collections) {
      const list = await rpc.list(assertion.name, { limit: 10000 })
      if (list.length !== assertion.count) {
        errors.push(`Collection "${assertion.name}" count mismatch: expected ${assertion.count}, got ${list.length}`)
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`State assertion failed:\n${errors.join('\n')}`)
  }
}
