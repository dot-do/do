/**
 * @dotdo/do - Action Operations Tests (RED Phase - Phase 9: Durable Execution)
 *
 * Tests for durable execution actions following the ai-database/ai-workflows patterns:
 * - send() creates pending action (fire-and-forget)
 * - do() creates and starts action (returns in active state)
 * - try() with error handling
 * - Action state transitions (pending -> active -> completed/failed)
 * - Action retry with backoff
 *
 * These tests should FAIL initially (RED), then pass after implementation (GREEN).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DO } from '../src/do'
import type { Action, ActionStatus, CreateActionOptions } from '../src/types'

/**
 * Create an in-memory SQLite mock for testing
 * Extended to support actions table
 */
function createMockSqlStorage() {
  const tables: Map<string, Map<string, Record<string, unknown>>> = new Map()

  return {
    exec(query: string, ...params: unknown[]) {
      const results: unknown[] = []
      const normalizedQuery = query.trim().toUpperCase()

      if (normalizedQuery.startsWith('CREATE TABLE')) {
        const tableMatch = query.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)
        if (tableMatch) {
          const tableName = tableMatch[1]
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
        }
      } else if (normalizedQuery.startsWith('INSERT')) {
        // Handle both documents and actions tables
        const tableMatch = query.match(/INSERT INTO (\w+)/i)
        if (tableMatch) {
          const tableName = tableMatch[1]
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
          const table = tables.get(tableName)!

          if (tableName === 'documents') {
            const [collection, id, data] = params as [string, string, string]
            const key = `${collection}:${id}`
            table.set(key, { collection, id, data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          } else if (tableName === 'actions') {
            // Handle both send() and doAction() parameter structures
            // send: VALUES (?, ?, ?, ?, 'pending', ?, ?, ?) - id, actor, object, action, metadata, created_at, updated_at
            // doAction: VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?) - id, actor, object, action, metadata, created_at, updated_at, started_at
            const [id, actor, object, action, metadata, created_at, updated_at, started_at] = params as [
              string,
              string,
              string,
              string,
              string | null,
              string,
              string,
              string?
            ]
            // Extract status from the query itself ('pending' or 'active')
            const statusMatch = query.match(/'(pending|active)'/)
            const status = statusMatch ? statusMatch[1] : 'pending'
            table.set(id, {
              id,
              actor,
              object,
              action,
              status,
              metadata,
              created_at,
              updated_at,
              started_at: started_at ?? null,
              completed_at: null,
              result: null,
              error: null,
            })
          }
        }
      } else if (normalizedQuery.startsWith('SELECT')) {
        const tableMatch = query.match(/FROM (\w+)/i)
        if (tableMatch) {
          const tableName = tableMatch[1]
          const table = tables.get(tableName)

          if (table) {
            if (tableName === 'actions') {
              // Handle action queries
              if (query.includes('WHERE id = ?')) {
                const [id] = params as [string]
                const row = table.get(id)
                if (row) {
                  results.push(row)
                }
              } else {
                // Handle queryActions with filters
                let filteredRows = Array.from(table.values())

                // Parse WHERE conditions
                const whereMatch = query.match(/WHERE\s+(.+?)\s+ORDER BY/i)
                if (whereMatch) {
                  const whereClause = whereMatch[1]
                  let paramIndex = 0

                  // Check for actor filter
                  if (whereClause.includes('actor = ?')) {
                    const actor = params[paramIndex] as string
                    filteredRows = filteredRows.filter((row: Record<string, unknown>) => row.actor === actor)
                    paramIndex++
                  }

                  // Check for object filter
                  if (whereClause.includes('object = ?')) {
                    const object = params[paramIndex] as string
                    filteredRows = filteredRows.filter((row: Record<string, unknown>) => row.object === object)
                    paramIndex++
                  }

                  // Check for action filter
                  if (whereClause.includes('action = ?')) {
                    const actionFilter = params[paramIndex] as string
                    filteredRows = filteredRows.filter((row: Record<string, unknown>) => row.action === actionFilter)
                    paramIndex++
                  }

                  // Check for status filter (single or IN clause)
                  if (whereClause.includes('status IN')) {
                    const inMatch = whereClause.match(/status IN \(([^)]+)\)/)
                    if (inMatch) {
                      const placeholderCount = (inMatch[1].match(/\?/g) || []).length
                      const statuses = params.slice(paramIndex, paramIndex + placeholderCount) as string[]
                      filteredRows = filteredRows.filter((row: Record<string, unknown>) =>
                        statuses.includes(row.status as string)
                      )
                      paramIndex += placeholderCount
                    }
                  } else if (whereClause.includes('status = ?')) {
                    const status = params[paramIndex] as string
                    filteredRows = filteredRows.filter((row: Record<string, unknown>) => row.status === status)
                    paramIndex++
                  }
                }

                // Sort by created_at ASC
                filteredRows.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
                  (a.created_at as string).localeCompare(b.created_at as string)
                )

                // Handle LIMIT and OFFSET (last two params)
                const limitIndex = params.length - 2
                const offsetIndex = params.length - 1
                const limit = params[limitIndex] as number
                const offset = params[offsetIndex] as number

                filteredRows = filteredRows.slice(offset, offset + limit)
                results.push(...filteredRows)
              }
            } else if (query.includes('WHERE collection = ? AND id = ?')) {
              const [collection, id] = params as [string, string]
              const key = `${collection}:${id}`
              const row = table.get(key)
              if (row) {
                results.push({ data: row.data })
              }
            }
          }
        }
      } else if (normalizedQuery.startsWith('UPDATE')) {
        const tableMatch = query.match(/UPDATE (\w+)/i)
        if (tableMatch) {
          const tableName = tableMatch[1]
          const table = tables.get(tableName)

          if (table && tableName === 'actions') {
            // Get the id (always the last param)
            const id = params[params.length - 1] as string
            const existing = table.get(id)
            if (existing) {
              const updates: Record<string, unknown> = {}

              // Parse the SET clause to extract column assignments
              // startAction: status = ?, started_at = ?, updated_at = ?
              // completeAction: status = ?, result = ?, completed_at = ?, updated_at = ?
              // failAction: status = ?, error = ?, completed_at = ?, updated_at = ?
              // cancelAction: status = ?, completed_at = ?, updated_at = ?
              // retryAction: status = ?, started_at = ?, completed_at = NULL, error = NULL, result = NULL, metadata = ?, updated_at = ?
              // resetAction: status = ?, started_at = NULL, completed_at = NULL, error = NULL, result = NULL, metadata = ?, updated_at = ?

              // Extract SET clause
              const setMatch = query.match(/SET\s+(.+?)\s+WHERE/i)
              if (setMatch) {
                const setClause = setMatch[1]
                const assignments = setClause.split(',').map((s) => s.trim())
                let paramIndex = 0

                for (const assignment of assignments) {
                  const [col, val] = assignment.split('=').map((s) => s.trim())
                  const columnName = col.toLowerCase()

                  if (val === '?') {
                    updates[columnName] = params[paramIndex]
                    paramIndex++
                  } else if (val === 'NULL') {
                    updates[columnName] = null
                  }
                }
              }

              table.set(id, { ...existing, ...updates })
            }
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

/**
 * Create a mock context with SQLite storage
 */
function createMockCtx() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    storage: {
      sql: createMockSqlStorage()
    }
  }
}

// Mock environment
const mockEnv = {
  DO_NAMESPACE: {
    idFromName: vi.fn(() => ({ toString: () => 'mock-id' })),
    get: vi.fn(),
  },
}

describe('Action Operations (Durable Execution)', () => {
  describe('send() - Fire and Forget', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should create an action in pending state', async () => {
      const options: CreateActionOptions = {
        actor: 'user:123',
        object: 'order:456',
        action: 'approve',
      }

      const action = await (doInstance as any).send(options)

      expect(action).toBeDefined()
      expect(action.id).toBeDefined()
      expect(action.status).toBe('pending')
      expect(action.actor).toBe('user:123')
      expect(action.object).toBe('order:456')
      expect(action.action).toBe('approve')
    })

    it('should set createdAt timestamp on creation', async () => {
      const action = await (doInstance as any).send({
        actor: 'user:123',
        object: 'order:456',
        action: 'process',
      })

      expect(action.createdAt).toBeInstanceOf(Date)
    })

    it('should set updatedAt timestamp on creation', async () => {
      const action = await (doInstance as any).send({
        actor: 'user:123',
        object: 'order:456',
        action: 'process',
      })

      expect(action.updatedAt).toBeInstanceOf(Date)
    })

    it('should NOT set startedAt for pending actions', async () => {
      const action = await (doInstance as any).send({
        actor: 'user:123',
        object: 'order:456',
        action: 'process',
      })

      expect(action.startedAt).toBeUndefined()
    })

    it('should support optional metadata', async () => {
      const action = await (doInstance as any).send({
        actor: 'user:123',
        object: 'order:456',
        action: 'approve',
        metadata: { priority: 'high', notes: 'Urgent request' },
      })

      expect(action.metadata).toEqual({ priority: 'high', notes: 'Urgent request' })
    })

    it('should generate unique action IDs', async () => {
      const action1 = await (doInstance as any).send({
        actor: 'user:123',
        object: 'order:456',
        action: 'approve',
      })
      const action2 = await (doInstance as any).send({
        actor: 'user:123',
        object: 'order:789',
        action: 'approve',
      })

      expect(action1.id).not.toBe(action2.id)
    })
  })

  describe('do() - Create and Start', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should create an action in active state', async () => {
      const action = await (doInstance as any).doAction({
        actor: 'system',
        object: 'job:123',
        action: 'execute',
      })

      expect(action).toBeDefined()
      expect(action.status).toBe('active')
    })

    it('should set startedAt timestamp immediately', async () => {
      const beforeTime = new Date()
      const action = await (doInstance as any).doAction({
        actor: 'system',
        object: 'job:123',
        action: 'execute',
      })
      const afterTime = new Date()

      expect(action.startedAt).toBeInstanceOf(Date)
      expect(action.startedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime())
      expect(action.startedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime())
    })

    it('should have both createdAt and startedAt set', async () => {
      const action = await (doInstance as any).doAction({
        actor: 'system',
        object: 'job:123',
        action: 'execute',
      })

      expect(action.createdAt).toBeInstanceOf(Date)
      expect(action.startedAt).toBeInstanceOf(Date)
    })

    it('should support metadata', async () => {
      const action = await (doInstance as any).doAction({
        actor: 'system',
        object: 'job:123',
        action: 'execute',
        metadata: { timeout: 30000 },
      })

      expect(action.metadata).toEqual({ timeout: 30000 })
    })
  })

  describe('try() - With Error Handling', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should execute function and complete action on success', async () => {
      const action = await (doInstance as any).tryAction(
        {
          actor: 'system',
          object: 'task:123',
          action: 'process',
        },
        async () => {
          return { processed: true }
        }
      )

      expect(action.status).toBe('completed')
      expect(action.result).toEqual({ processed: true })
    })

    it('should set completedAt on successful completion', async () => {
      const action = await (doInstance as any).tryAction(
        {
          actor: 'system',
          object: 'task:123',
          action: 'process',
        },
        async () => 'done'
      )

      expect(action.completedAt).toBeInstanceOf(Date)
    })

    it('should catch errors and fail action', async () => {
      const action = await (doInstance as any).tryAction(
        {
          actor: 'system',
          object: 'task:123',
          action: 'process',
        },
        async () => {
          throw new Error('Processing failed')
        }
      )

      expect(action.status).toBe('failed')
      expect(action.error).toBe('Processing failed')
    })

    it('should set completedAt even on failure', async () => {
      const action = await (doInstance as any).tryAction(
        {
          actor: 'system',
          object: 'task:123',
          action: 'process',
        },
        async () => {
          throw new Error('Oops')
        }
      )

      expect(action.completedAt).toBeInstanceOf(Date)
    })

    it('should handle async functions correctly', async () => {
      const action = await (doInstance as any).tryAction(
        {
          actor: 'system',
          object: 'task:123',
          action: 'process',
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return 'async result'
        }
      )

      expect(action.status).toBe('completed')
      expect(action.result).toBe('async result')
    })

    it('should preserve action metadata through execution', async () => {
      const action = await (doInstance as any).tryAction(
        {
          actor: 'system',
          object: 'task:123',
          action: 'process',
          metadata: { source: 'test' },
        },
        async () => 'result'
      )

      expect(action.metadata).toEqual({ source: 'test' })
    })
  })

  describe('Action State Transitions', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    describe('pending -> active', () => {
      it('should transition from pending to active via startAction()', async () => {
        const pending = await (doInstance as any).send({
          actor: 'user:123',
          object: 'order:456',
          action: 'approve',
        })
        expect(pending.status).toBe('pending')

        const active = await (doInstance as any).startAction(pending.id)
        expect(active.status).toBe('active')
        expect(active.startedAt).toBeInstanceOf(Date)
      })

      it('should update updatedAt when transitioning to active', async () => {
        const pending = await (doInstance as any).send({
          actor: 'user:123',
          object: 'order:456',
          action: 'approve',
        })
        const originalUpdatedAt = pending.updatedAt

        await new Promise((resolve) => setTimeout(resolve, 10))

        const active = await (doInstance as any).startAction(pending.id)
        expect(active.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime())
      })
    })

    describe('active -> completed', () => {
      it('should transition from active to completed via completeAction()', async () => {
        const active = await (doInstance as any).doAction({
          actor: 'system',
          object: 'job:123',
          action: 'execute',
        })
        expect(active.status).toBe('active')

        const completed = await (doInstance as any).completeAction(active.id, { output: 'success' })
        expect(completed.status).toBe('completed')
        expect(completed.result).toEqual({ output: 'success' })
        expect(completed.completedAt).toBeInstanceOf(Date)
      })

      it('should allow completing without a result', async () => {
        const active = await (doInstance as any).doAction({
          actor: 'system',
          object: 'job:123',
          action: 'execute',
        })

        const completed = await (doInstance as any).completeAction(active.id)
        expect(completed.status).toBe('completed')
        expect(completed.result).toBeUndefined()
      })
    })

    describe('active -> failed', () => {
      it('should transition from active to failed via failAction()', async () => {
        const active = await (doInstance as any).doAction({
          actor: 'system',
          object: 'job:123',
          action: 'execute',
        })
        expect(active.status).toBe('active')

        const failed = await (doInstance as any).failAction(active.id, 'Execution timeout')
        expect(failed.status).toBe('failed')
        expect(failed.error).toBe('Execution timeout')
        expect(failed.completedAt).toBeInstanceOf(Date)
      })
    })

    describe('pending/active -> cancelled', () => {
      it('should transition from pending to cancelled via cancelAction()', async () => {
        const pending = await (doInstance as any).send({
          actor: 'user:123',
          object: 'order:456',
          action: 'approve',
        })

        const cancelled = await (doInstance as any).cancelAction(pending.id)
        expect(cancelled.status).toBe('cancelled')
        expect(cancelled.completedAt).toBeInstanceOf(Date)
      })

      it('should transition from active to cancelled via cancelAction()', async () => {
        const active = await (doInstance as any).doAction({
          actor: 'system',
          object: 'job:123',
          action: 'execute',
        })

        const cancelled = await (doInstance as any).cancelAction(active.id)
        expect(cancelled.status).toBe('cancelled')
      })

      it('should NOT allow cancelling completed actions', async () => {
        const active = await (doInstance as any).doAction({
          actor: 'system',
          object: 'job:123',
          action: 'execute',
        })
        await (doInstance as any).completeAction(active.id)

        await expect((doInstance as any).cancelAction(active.id)).rejects.toThrow()
      })

      it('should NOT allow cancelling failed actions', async () => {
        const active = await (doInstance as any).doAction({
          actor: 'system',
          object: 'job:123',
          action: 'execute',
        })
        await (doInstance as any).failAction(active.id, 'Error')

        await expect((doInstance as any).cancelAction(active.id)).rejects.toThrow()
      })
    })

    describe('Invalid Transitions', () => {
      it('should NOT allow starting an already active action', async () => {
        const active = await (doInstance as any).doAction({
          actor: 'system',
          object: 'job:123',
          action: 'execute',
        })

        await expect((doInstance as any).startAction(active.id)).rejects.toThrow()
      })

      it('should NOT allow starting a completed action', async () => {
        const active = await (doInstance as any).doAction({
          actor: 'system',
          object: 'job:123',
          action: 'execute',
        })
        await (doInstance as any).completeAction(active.id)

        await expect((doInstance as any).startAction(active.id)).rejects.toThrow()
      })

      it('should NOT allow completing a pending action', async () => {
        const pending = await (doInstance as any).send({
          actor: 'user:123',
          object: 'order:456',
          action: 'approve',
        })

        await expect((doInstance as any).completeAction(pending.id)).rejects.toThrow()
      })

      it('should NOT allow failing a pending action', async () => {
        const pending = await (doInstance as any).send({
          actor: 'user:123',
          object: 'order:456',
          action: 'approve',
        })

        await expect((doInstance as any).failAction(pending.id, 'Error')).rejects.toThrow()
      })
    })
  })

  describe('Action Query Operations', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should retrieve action by ID via getAction()', async () => {
      const created = await (doInstance as any).send({
        actor: 'user:123',
        object: 'order:456',
        action: 'approve',
      })

      const retrieved = await (doInstance as any).getAction(created.id)
      expect(retrieved).toBeDefined()
      expect(retrieved.id).toBe(created.id)
      expect(retrieved.actor).toBe('user:123')
    })

    it('should return null for non-existent action', async () => {
      const result = await (doInstance as any).getAction('non-existent-id')
      expect(result).toBeNull()
    })

    it('should query actions by actor', async () => {
      await (doInstance as any).send({ actor: 'user:123', object: 'order:1', action: 'approve' })
      await (doInstance as any).send({ actor: 'user:456', object: 'order:2', action: 'approve' })
      await (doInstance as any).send({ actor: 'user:123', object: 'order:3', action: 'approve' })

      const actions = await (doInstance as any).queryActions({ actor: 'user:123' })
      expect(actions).toHaveLength(2)
      expect(actions.every((a: Action) => a.actor === 'user:123')).toBe(true)
    })

    it('should query actions by object', async () => {
      await (doInstance as any).send({ actor: 'user:123', object: 'order:456', action: 'approve' })
      await (doInstance as any).send({ actor: 'user:789', object: 'order:456', action: 'review' })

      const actions = await (doInstance as any).queryActions({ object: 'order:456' })
      expect(actions).toHaveLength(2)
      expect(actions.every((a: Action) => a.object === 'order:456')).toBe(true)
    })

    it('should query actions by status', async () => {
      await (doInstance as any).send({ actor: 'user:123', object: 'order:1', action: 'approve' })
      const active = await (doInstance as any).doAction({ actor: 'system', object: 'job:1', action: 'execute' })
      await (doInstance as any).completeAction(active.id)

      const pendingActions = await (doInstance as any).queryActions({ status: 'pending' })
      const completedActions = await (doInstance as any).queryActions({ status: 'completed' })

      expect(pendingActions).toHaveLength(1)
      expect(completedActions).toHaveLength(1)
    })

    it('should query actions by multiple statuses', async () => {
      await (doInstance as any).send({ actor: 'user:123', object: 'order:1', action: 'approve' })
      await (doInstance as any).doAction({ actor: 'system', object: 'job:1', action: 'execute' })

      const actions = await (doInstance as any).queryActions({ status: ['pending', 'active'] })
      expect(actions).toHaveLength(2)
    })

    it('should support pagination with limit and offset', async () => {
      for (let i = 0; i < 10; i++) {
        await (doInstance as any).send({ actor: 'user:123', object: `order:${i}`, action: 'process' })
      }

      const firstPage = await (doInstance as any).queryActions({ limit: 3, offset: 0 })
      const secondPage = await (doInstance as any).queryActions({ limit: 3, offset: 3 })

      expect(firstPage).toHaveLength(3)
      expect(secondPage).toHaveLength(3)
      expect(firstPage[0].id).not.toBe(secondPage[0].id)
    })
  })

  describe('Action Retry with Backoff', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should track retry attempts in action metadata', async () => {
      const action = await (doInstance as any).send({
        actor: 'system',
        object: 'job:123',
        action: 'execute',
        metadata: { maxRetries: 3 },
      })

      // Simulate failure and retry
      await (doInstance as any).startAction(action.id)
      const failed = await (doInstance as any).failAction(action.id, 'Temporary error')

      const retried = await (doInstance as any).retryAction(failed.id)
      expect(retried.metadata.retryCount).toBe(1)
      expect(retried.status).toBe('active')
    })

    it('should support exponential backoff configuration', async () => {
      const action = await (doInstance as any).send({
        actor: 'system',
        object: 'job:123',
        action: 'execute',
        metadata: {
          maxRetries: 5,
          backoff: {
            type: 'exponential',
            initialDelay: 1000,
            maxDelay: 30000,
            multiplier: 2,
          },
        },
      })

      expect(action.metadata.backoff).toBeDefined()
      expect(action.metadata.backoff.type).toBe('exponential')
    })

    it('should calculate next retry delay based on attempt count', async () => {
      const action = await (doInstance as any).send({
        actor: 'system',
        object: 'job:123',
        action: 'execute',
        metadata: {
          maxRetries: 5,
          backoff: {
            type: 'exponential',
            initialDelay: 1000,
            multiplier: 2,
          },
        },
      })

      await (doInstance as any).startAction(action.id)
      const failed = await (doInstance as any).failAction(action.id, 'Error')

      const nextRetryDelay = await (doInstance as any).getNextRetryDelay(failed.id)
      expect(nextRetryDelay).toBe(1000) // First retry: initialDelay * multiplier^0 = 1000

      // After first retry
      await (doInstance as any).retryAction(failed.id)
      await (doInstance as any).failAction(action.id, 'Error again')

      const secondRetryDelay = await (doInstance as any).getNextRetryDelay(action.id)
      expect(secondRetryDelay).toBe(2000) // Second retry: 1000 * 2^1 = 2000
    })

    it('should respect maximum retry limit', async () => {
      const action = await (doInstance as any).send({
        actor: 'system',
        object: 'job:123',
        action: 'execute',
        metadata: { maxRetries: 2 },
      })

      // Exhaust retries
      await (doInstance as any).startAction(action.id)
      await (doInstance as any).failAction(action.id, 'Error 1')
      await (doInstance as any).retryAction(action.id)
      await (doInstance as any).failAction(action.id, 'Error 2')
      await (doInstance as any).retryAction(action.id)
      await (doInstance as any).failAction(action.id, 'Error 3')

      // Should not allow more retries
      await expect((doInstance as any).retryAction(action.id)).rejects.toThrow('Max retries exceeded')
    })

    it('should reset retry state on manual restart', async () => {
      const action = await (doInstance as any).send({
        actor: 'system',
        object: 'job:123',
        action: 'execute',
        metadata: { maxRetries: 3 },
      })

      await (doInstance as any).startAction(action.id)
      await (doInstance as any).failAction(action.id, 'Error')
      await (doInstance as any).retryAction(action.id)
      await (doInstance as any).failAction(action.id, 'Error again')

      // Reset action
      const reset = await (doInstance as any).resetAction(action.id)
      expect(reset.status).toBe('pending')
      expect(reset.metadata.retryCount).toBe(0)
    })

    it('should support fixed delay backoff strategy', async () => {
      const action = await (doInstance as any).send({
        actor: 'system',
        object: 'job:123',
        action: 'execute',
        metadata: {
          maxRetries: 3,
          backoff: {
            type: 'fixed',
            delay: 5000,
          },
        },
      })

      await (doInstance as any).startAction(action.id)
      await (doInstance as any).failAction(action.id, 'Error')

      const delay1 = await (doInstance as any).getNextRetryDelay(action.id)
      await (doInstance as any).retryAction(action.id)
      await (doInstance as any).failAction(action.id, 'Error')

      const delay2 = await (doInstance as any).getNextRetryDelay(action.id)

      expect(delay1).toBe(5000)
      expect(delay2).toBe(5000) // Fixed delay doesn't change
    })

    it('should cap delay at maxDelay for exponential backoff', async () => {
      const action = await (doInstance as any).send({
        actor: 'system',
        object: 'job:123',
        action: 'execute',
        metadata: {
          maxRetries: 10,
          retryCount: 8, // Simulating 8 failed attempts
          backoff: {
            type: 'exponential',
            initialDelay: 1000,
            maxDelay: 30000,
            multiplier: 2,
          },
        },
      })

      // 1000 * 2^8 = 256000, but should be capped at 30000
      const delay = await (doInstance as any).getNextRetryDelay(action.id)
      expect(delay).toBe(30000)
    })
  })

  describe('allowedMethods includes action operations', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should include send in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('send')).toBe(true)
    })

    it('should include doAction in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('doAction')).toBe(true)
    })

    it('should include tryAction in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('tryAction')).toBe(true)
    })

    it('should include getAction in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('getAction')).toBe(true)
    })

    it('should include queryActions in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('queryActions')).toBe(true)
    })

    it('should include startAction in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('startAction')).toBe(true)
    })

    it('should include completeAction in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('completeAction')).toBe(true)
    })

    it('should include failAction in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('failAction')).toBe(true)
    })

    it('should include cancelAction in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('cancelAction')).toBe(true)
    })

    it('should include retryAction in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('retryAction')).toBe(true)
    })
  })
})
