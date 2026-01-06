/**
 * @dotdo/do - Database Indexes Tests (RED Phase)
 *
 * These tests verify that proper database indexes exist on:
 * - events table (timestamp, type)
 * - actions table (status, scheduled_for)
 * - documents table (ns, type)
 *
 * They should FAIL initially (RED), then pass after implementation (GREEN).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DO } from '../src/do'

/**
 * Create a mock SQL storage that tracks all executed queries
 */
function createMockSqlStorageWithQueryTracking() {
  const executedQueries: string[] = []

  return {
    executedQueries,
    sql: {
      exec(query: string, ...params: unknown[]) {
        executedQueries.push(query.trim())
        return {
          toArray() {
            return []
          },
        }
      },
    },
  }
}

/**
 * Create a mock context with query-tracking SQL storage
 */
function createMockCtxWithQueryTracking() {
  const storage = createMockSqlStorageWithQueryTracking()
  return {
    ctx: {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      storage: {
        sql: storage.sql,
      },
    },
    executedQueries: storage.executedQueries,
  }
}

// Mock environment
const mockEnv = {
  DO_NAMESPACE: {
    idFromName: vi.fn(() => ({ toString: () => 'mock-id' })),
    get: vi.fn(),
  },
}

describe('Database Indexes', () => {
  describe('Events Table Indexes', () => {
    it('should create index on events.timestamp column', async () => {
      const { ctx, executedQueries } = createMockCtxWithQueryTracking()
      const doInstance = new DO(ctx as any, mockEnv)

      // Trigger schema initialization by calling any method that uses the database
      await doInstance.get('test', 'test')

      // Check for index on timestamp
      const hasTimestampIndex = executedQueries.some(
        (q) =>
          q.includes('CREATE INDEX') &&
          q.includes('events') &&
          q.includes('timestamp')
      )

      expect(hasTimestampIndex).toBe(true)
    })

    it('should create index on events.type column', async () => {
      const { ctx, executedQueries } = createMockCtxWithQueryTracking()
      const doInstance = new DO(ctx as any, mockEnv)

      // Trigger schema initialization
      await doInstance.get('test', 'test')

      // Check for index on type
      const hasTypeIndex = executedQueries.some(
        (q) =>
          q.includes('CREATE INDEX') &&
          q.includes('events') &&
          q.includes('type')
      )

      expect(hasTypeIndex).toBe(true)
    })
  })

  describe('Actions Table Indexes', () => {
    it('should create index on actions.status column', async () => {
      const { ctx, executedQueries } = createMockCtxWithQueryTracking()
      const doInstance = new DO(ctx as any, mockEnv)

      // Trigger schema initialization
      await doInstance.get('test', 'test')

      // Check for index on status
      const hasStatusIndex = executedQueries.some(
        (q) =>
          q.includes('CREATE INDEX') &&
          q.includes('actions') &&
          q.includes('status')
      )

      expect(hasStatusIndex).toBe(true)
    })

    it('should create index on actions.scheduled_for column', async () => {
      const { ctx, executedQueries } = createMockCtxWithQueryTracking()
      const doInstance = new DO(ctx as any, mockEnv)

      // Trigger schema initialization
      await doInstance.get('test', 'test')

      // Check for index on scheduled_for
      const hasScheduledForIndex = executedQueries.some(
        (q) =>
          q.includes('CREATE INDEX') &&
          q.includes('actions') &&
          q.includes('scheduled_for')
      )

      expect(hasScheduledForIndex).toBe(true)
    })
  })

  describe('Documents Table Indexes', () => {
    it('should create index on documents for namespace lookups', async () => {
      const { ctx, executedQueries } = createMockCtxWithQueryTracking()
      const doInstance = new DO(ctx as any, mockEnv)

      // Trigger schema initialization
      await doInstance.get('test', 'test')

      // Check for index on collection (which serves as namespace for documents)
      // The documents table uses 'collection' as the namespace field
      const hasNsIndex = executedQueries.some(
        (q) =>
          q.includes('CREATE INDEX') &&
          q.includes('documents') &&
          q.includes('collection')
      )

      expect(hasNsIndex).toBe(true)
    })
  })

  describe('Things Table Indexes', () => {
    it('should create index on things.ns column', async () => {
      const { ctx, executedQueries } = createMockCtxWithQueryTracking()
      const doInstance = new DO(ctx as any, mockEnv)

      // Trigger schema initialization
      await doInstance.get('test', 'test')

      // Check for index on ns (namespace)
      const hasNsIndex = executedQueries.some(
        (q) =>
          q.includes('CREATE INDEX') &&
          q.includes('things') &&
          q.includes('ns')
      )

      expect(hasNsIndex).toBe(true)
    })

    it('should create index on things.type column', async () => {
      const { ctx, executedQueries } = createMockCtxWithQueryTracking()
      const doInstance = new DO(ctx as any, mockEnv)

      // Trigger schema initialization
      await doInstance.get('test', 'test')

      // Check for index on type
      const hasTypeIndex = executedQueries.some(
        (q) =>
          q.includes('CREATE INDEX') &&
          q.includes('things') &&
          q.includes('type')
      )

      expect(hasTypeIndex).toBe(true)
    })
  })
})
