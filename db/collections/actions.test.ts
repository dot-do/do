/**
 * Actions Collection Tests - RED Phase
 *
 * @description
 * Tests for ActionCollection covering:
 * - Action lifecycle (pending -> running -> completed/failed)
 * - Actor attribution (User, Agent, Service, System)
 * - Timeout handling
 * - Retry with exponential backoff
 * - Cancellation
 *
 * These tests should FAIL initially (Red phase) until implementation is complete.
 *
 * @see /src/collections/actions.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type {
  Action,
  ActionStatus,
  ActionError,
  ActionRequest,
  Actor,
  ActorType,
} from '../../types/collections'
import {
  ActionCollection,
  CreateActionOptions,
  FailActionOptions,
  ActionRetryPolicy,
  DEFAULT_RETRY_POLICY,
} from './actions'
import { DOStorage } from './base'
import { VerbCollection } from './verbs'

/**
 * Mock storage implementation
 */
class MockStorage implements DOStorage {
  private data: Map<string, unknown> = new Map()

  async sql<T>(_query: string, ..._params: unknown[]): Promise<T[]> {
    return []
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value)
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key)
  }

  async list<T>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>> {
    const result = new Map<string, T>()
    for (const [key, value] of this.data) {
      if (!options?.prefix || key.startsWith(options.prefix)) {
        result.set(key, value as T)
        if (options?.limit && result.size >= options.limit) break
      }
    }
    return result
  }

  clear() {
    this.data.clear()
  }
}

/**
 * Mock verb collection
 */
class MockVerbCollection {
  async get(_id: string) {
    return { id: 'mock', name: 'mock', action: 'mock', act: 'm', activity: 'mocking', event: 'mocked', reverse: 'mockedBy' }
  }
}

describe('ActionCollection', () => {
  let storage: MockStorage
  let verbs: VerbCollection
  let actions: ActionCollection

  beforeEach(() => {
    storage = new MockStorage()
    verbs = new MockVerbCollection() as unknown as VerbCollection
    actions = new ActionCollection(storage, verbs)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ===========================================================================
  // ACTION LIFECYCLE: pending -> running -> completed
  // ===========================================================================

  describe('Action Lifecycle', () => {
    describe('pending -> running -> completed', () => {
      it('should create action in pending status', async () => {
        const action = await actions.create({
          verb: 'process',
          input: { data: 'test' },
          actor: { type: 'User', id: 'user-1' },
        })

        expect(action.$id).toBeDefined()
        expect(action.status).toBe('pending')
        expect(action.createdAt).toBeDefined()
        expect(action.startedAt).toBeUndefined()
        expect(action.completedAt).toBeUndefined()
      })

      it('should transition to running when started', async () => {
        const action = await actions.create({
          verb: 'process',
          input: { data: 'test' },
          actor: { type: 'User', id: 'user-1' },
        })

        const running = await actions.start(action.$id)

        expect(running.status).toBe('running')
        expect(running.startedAt).toBeDefined()
        expect(running.completedAt).toBeUndefined()
      })

      it('should transition to completed when done', async () => {
        const action = await actions.create({
          verb: 'process',
          input: { data: 'test' },
          actor: { type: 'User', id: 'user-1' },
        })

        await actions.start(action.$id)
        const completed = await actions.complete(action.$id, {
          result: 'success',
        })

        expect(completed.status).toBe('completed')
        expect(completed.completedAt).toBeDefined()
        expect(completed.output).toEqual({ result: 'success' })
      })

      it('should track all timestamps through lifecycle', async () => {
        const action = await actions.create({
          verb: 'lifecycle',
          actor: { type: 'System', id: 'system' },
        })

        const createdTime = action.createdAt

        vi.advanceTimersByTime(1000)
        const running = await actions.start(action.$id)
        const startedTime = running.startedAt

        vi.advanceTimersByTime(2000)
        const completed = await actions.complete(action.$id, {})
        const completedTime = completed.completedAt

        expect(startedTime).toBeGreaterThan(createdTime)
        expect(completedTime).toBeGreaterThan(startedTime!)
      })

      it('should calculate duration on completion', async () => {
        const action = await actions.create({
          verb: 'timed',
          actor: { type: 'User', id: 'user-1' },
        })

        await actions.start(action.$id)
        vi.advanceTimersByTime(5000)
        const completed = await actions.complete(action.$id, {})

        const duration = completed.completedAt! - completed.startedAt!
        expect(duration).toBe(5000)
      })
    })

    describe('pending -> running -> failed', () => {
      it('should transition to failed on error', async () => {
        const action = await actions.create({
          verb: 'fail',
          actor: { type: 'User', id: 'user-1' },
        })

        await actions.start(action.$id)
        const failed = await actions.fail(action.$id, {
          code: 'PROCESS_ERROR',
          message: 'Something went wrong',
        })

        expect(failed.status).toBe('failed')
        expect(failed.error).toBeDefined()
        expect(failed.error?.code).toBe('PROCESS_ERROR')
        expect(failed.error?.message).toBe('Something went wrong')
      })

      it('should include stack trace in error', async () => {
        const action = await actions.create({
          verb: 'fail-with-stack',
          actor: { type: 'Service', id: 'service-1' },
        })

        await actions.start(action.$id)
        const failed = await actions.fail(action.$id, {
          code: 'STACK_ERROR',
          message: 'Error with stack',
          stack: 'Error: Stack trace\n    at test.ts:123',
        })

        expect(failed.error?.stack).toContain('Error: Stack trace')
      })
    })

    describe('Invalid state transitions', () => {
      it('should reject starting already running action', async () => {
        const action = await actions.create({
          verb: 'test',
          actor: { type: 'User', id: 'user-1' },
        })

        await actions.start(action.$id)

        await expect(actions.start(action.$id)).rejects.toThrow()
      })

      it('should reject starting completed action', async () => {
        const action = await actions.create({
          verb: 'test',
          actor: { type: 'User', id: 'user-1' },
        })

        await actions.start(action.$id)
        await actions.complete(action.$id, {})

        await expect(actions.start(action.$id)).rejects.toThrow()
      })

      it('should reject completing pending action', async () => {
        const action = await actions.create({
          verb: 'test',
          actor: { type: 'User', id: 'user-1' },
        })

        await expect(actions.complete(action.$id, {})).rejects.toThrow()
      })

      it('should reject completing already completed action', async () => {
        const action = await actions.create({
          verb: 'test',
          actor: { type: 'User', id: 'user-1' },
        })

        await actions.start(action.$id)
        await actions.complete(action.$id, {})

        await expect(actions.complete(action.$id, {})).rejects.toThrow()
      })
    })
  })

  // ===========================================================================
  // ACTION WITH ACTOR
  // ===========================================================================

  describe('Action with Actor', () => {
    it('should require actor on creation', async () => {
      await expect(
        actions.create({
          verb: 'process',
          // @ts-expect-error - actor is required
          actor: undefined,
        })
      ).rejects.toThrow()
    })

    it('should support User actor type', async () => {
      const action = await actions.create({
        verb: 'user-action',
        actor: {
          type: 'User',
          id: 'user-123',
          name: 'John Doe',
        },
      })

      expect(action.actor.type).toBe('User')
      expect(action.actor.id).toBe('user-123')
      expect(action.actor.name).toBe('John Doe')
    })

    it('should support Agent actor type', async () => {
      const action = await actions.create({
        verb: 'agent-action',
        actor: {
          type: 'Agent',
          id: 'agent-456',
          name: 'AI Assistant',
        },
      })

      expect(action.actor.type).toBe('Agent')
      expect(action.actor.id).toBe('agent-456')
    })

    it('should support Service actor type', async () => {
      const action = await actions.create({
        verb: 'service-action',
        actor: {
          type: 'Service',
          id: 'payment-service',
        },
      })

      expect(action.actor.type).toBe('Service')
      expect(action.actor.id).toBe('payment-service')
    })

    it('should support System actor type', async () => {
      const action = await actions.create({
        verb: 'system-action',
        actor: {
          type: 'System',
          id: 'scheduler',
        },
      })

      expect(action.actor.type).toBe('System')
    })

    it('should find actions by actor', async () => {
      await actions.create({
        verb: 'action-1',
        actor: { type: 'User', id: 'user-1' },
      })
      await actions.create({
        verb: 'action-2',
        actor: { type: 'User', id: 'user-1' },
      })
      await actions.create({
        verb: 'action-3',
        actor: { type: 'User', id: 'user-2' },
      })

      const userActions = await actions.findByActor('User', 'user-1')

      expect(userActions.length).toBe(2)
      expect(userActions.every(a => a.actor.id === 'user-1')).toBe(true)
    })
  })

  // ===========================================================================
  // ACTION TIMEOUT
  // ===========================================================================

  describe('Action Timeout', () => {
    it('should support timeout in config', async () => {
      const action = await actions.create({
        verb: 'timed-operation',
        actor: { type: 'User', id: 'user-1' },
        config: { timeout: 30000 },
      })

      expect(action.config?.timeout).toBe(30000)
    })

    it('should track execution time', async () => {
      const action = await actions.create({
        verb: 'tracked',
        actor: { type: 'User', id: 'user-1' },
      })

      await actions.start(action.$id)
      vi.advanceTimersByTime(2500)
      const completed = await actions.complete(action.$id, {})

      expect(completed.completedAt! - completed.startedAt!).toBe(2500)
    })
  })

  // ===========================================================================
  // ACTION RETRY
  // ===========================================================================

  describe('Action Retry', () => {
    it('should have default retry policy', () => {
      expect(DEFAULT_RETRY_POLICY.maxAttempts).toBe(3)
      expect(DEFAULT_RETRY_POLICY.initialDelay).toBe(1000)
      expect(DEFAULT_RETRY_POLICY.maxDelay).toBe(30000)
      expect(DEFAULT_RETRY_POLICY.backoffMultiplier).toBe(2)
    })

    it('should support custom retry configuration', async () => {
      const customRetryPolicy: ActionRetryPolicy = {
        maxAttempts: 5,
        initialDelay: 500,
        maxDelay: 10000,
        backoffMultiplier: 1.5,
      }

      const customActions = new ActionCollection(storage, verbs, customRetryPolicy)
      expect(customActions).toBeDefined()
    })

    it('should transition to retrying status on retriable failure', async () => {
      const action = await actions.create({
        verb: 'will-retry',
        actor: { type: 'User', id: 'user-1' },
      })

      await actions.start(action.$id)
      const retrying = await actions.fail(action.$id, {
        code: 'TRANSIENT_ERROR',
        message: 'Temporary failure',
        retryable: true,
      })

      expect(retrying.status).toBe('retrying')
      expect(retrying.error?.retryCount).toBe(1)
    })

    it('should increment retry count on each retry', async () => {
      const action = await actions.create({
        verb: 'multi-retry',
        actor: { type: 'User', id: 'user-1' },
      })

      // First attempt
      await actions.start(action.$id)
      await actions.fail(action.$id, {
        code: 'ERROR',
        message: 'Fail 1',
        retryable: true,
      })

      let current = await actions.get(action.$id)
      expect(current?.error?.retryCount).toBe(1)

      // Second attempt
      await actions.start(action.$id)
      await actions.fail(action.$id, {
        code: 'ERROR',
        message: 'Fail 2',
        retryable: true,
      })

      current = await actions.get(action.$id)
      expect(current?.error?.retryCount).toBe(2)
    })

    it('should fail permanently after max retries', async () => {
      const action = await actions.create({
        verb: 'max-retries',
        actor: { type: 'User', id: 'user-1' },
      })

      // Exhaust retries (default is 3)
      for (let i = 0; i < 3; i++) {
        await actions.start(action.$id)
        await actions.fail(action.$id, {
          code: 'ERROR',
          message: `Fail ${i + 1}`,
          retryable: true,
        })
      }

      // Fourth failure should be permanent
      await actions.start(action.$id)
      const final = await actions.fail(action.$id, {
        code: 'ERROR',
        message: 'Final fail',
        retryable: true,
      })

      expect(final.status).toBe('failed')
    })

    it('should calculate retry delay with exponential backoff', () => {
      // Test the calculateRetryDelay method
      expect(actions.calculateRetryDelay(0)).toBe(1000) // 1000 * 2^0
      expect(actions.calculateRetryDelay(1)).toBe(2000) // 1000 * 2^1
      expect(actions.calculateRetryDelay(2)).toBe(4000) // 1000 * 2^2
      expect(actions.calculateRetryDelay(3)).toBe(8000) // 1000 * 2^3
    })

    it('should cap delay at maxDelay', () => {
      // 1000 * 2^10 = 1024000, but should be capped at 30000
      expect(actions.calculateRetryDelay(10)).toBe(30000)
    })

    it('should check if action can be retried', async () => {
      const action = await actions.create({
        verb: 'retryable',
        actor: { type: 'User', id: 'user-1' },
      })

      await actions.start(action.$id)
      const failed = await actions.fail(action.$id, {
        code: 'ERROR',
        message: 'Can retry',
        retryable: true,
      })

      expect(actions.canRetry(failed)).toBe(true)
    })

    it('should not retry non-retryable errors', async () => {
      const action = await actions.create({
        verb: 'non-retryable',
        actor: { type: 'User', id: 'user-1' },
      })

      await actions.start(action.$id)
      const failed = await actions.fail(action.$id, {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        retryable: false,
      })

      expect(failed.status).toBe('failed')
      expect(actions.canRetry(failed)).toBe(false)
    })
  })

  // ===========================================================================
  // ACTION CANCELLATION
  // ===========================================================================

  describe('Action Cancellation', () => {
    it('should cancel pending action', async () => {
      const action = await actions.create({
        verb: 'cancellable',
        actor: { type: 'User', id: 'user-1' },
      })

      const cancelled = await actions.cancel(action.$id)

      expect(cancelled.status).toBe('cancelled')
    })

    it('should cancel running action', async () => {
      const action = await actions.create({
        verb: 'running-cancel',
        actor: { type: 'User', id: 'user-1' },
      })

      await actions.start(action.$id)
      const cancelled = await actions.cancel(action.$id)

      expect(cancelled.status).toBe('cancelled')
    })

    it('should not cancel completed action', async () => {
      const action = await actions.create({
        verb: 'completed-no-cancel',
        actor: { type: 'User', id: 'user-1' },
      })

      await actions.start(action.$id)
      await actions.complete(action.$id, {})

      await expect(actions.cancel(action.$id)).rejects.toThrow()
    })

    it('should not cancel failed action', async () => {
      const action = await actions.create({
        verb: 'failed-no-cancel',
        actor: { type: 'User', id: 'user-1' },
      })

      await actions.start(action.$id)
      await actions.fail(action.$id, { code: 'ERROR', message: 'Failed', retryable: false })

      await expect(actions.cancel(action.$id)).rejects.toThrow()
    })

    it('should support cancellation reason', async () => {
      const action = await actions.create({
        verb: 'cancel-reason',
        actor: { type: 'User', id: 'user-1' },
      })

      const cancelled = await actions.cancel(action.$id, 'User requested cancellation')

      expect(cancelled.status).toBe('cancelled')
    })
  })

  // ===========================================================================
  // BLOCKED STATUS
  // ===========================================================================

  describe('Blocked Status', () => {
    it('should support blocked status', async () => {
      const action = await actions.create({
        verb: 'dependent',
        actor: { type: 'User', id: 'user-1' },
      })

      const blocked = await actions.block(action.$id, 'action-dependency-123')

      expect(blocked.status).toBe('blocked')
    })

    it('should unblock and transition to pending', async () => {
      const action = await actions.create({
        verb: 'blocked-then-unblocked',
        actor: { type: 'User', id: 'user-1' },
      })

      await actions.block(action.$id, 'dependency')

      const unblocked = await actions.unblock(action.$id)

      expect(unblocked.status).toBe('pending')
    })
  })

  // ===========================================================================
  // ACTION METADATA & REQUEST
  // ===========================================================================

  describe('Action Metadata & Request', () => {
    it('should track original request', async () => {
      const request: ActionRequest = {
        id: 'req-123',
        method: 'POST',
        path: '/api/process',
        timestamp: Date.now(),
        traceId: 'trace-abc',
      }

      const action = await actions.create({
        verb: 'with-request',
        actor: { type: 'User', id: 'user-1' },
        request,
      })

      expect(action.request).toEqual(request)
    })

    it('should support custom metadata', async () => {
      const action = await actions.create({
        verb: 'with-metadata',
        actor: { type: 'User', id: 'user-1' },
        metadata: {
          source: 'mobile-app',
          version: '2.0.0',
          custom: { nested: 'data' },
        },
      })

      expect(action.metadata?.source).toBe('mobile-app')
      expect(action.metadata?.version).toBe('2.0.0')
    })

    it('should support subject and object references', async () => {
      const action = await actions.create({
        verb: 'assign',
        actor: { type: 'User', id: 'manager-1' },
        subject: 'task-123',
        object: 'user-456',
      })

      expect(action.subject).toBe('task-123')
      expect(action.object).toBe('user-456')
    })
  })

  // ===========================================================================
  // QUERYING ACTIONS
  // ===========================================================================

  describe('Querying Actions', () => {
    beforeEach(async () => {
      // Create varied actions
      const a1 = await actions.create({
        verb: 'process',
        actor: { type: 'User', id: 'user-1' },
      })
      await actions.start(a1.$id)
      await actions.complete(a1.$id, {})

      const a2 = await actions.create({
        verb: 'upload',
        actor: { type: 'User', id: 'user-1' },
      })
      await actions.start(a2.$id)

      await actions.create({
        verb: 'download',
        actor: { type: 'Agent', id: 'agent-1' },
      })

      const a4 = await actions.create({
        verb: 'sync',
        actor: { type: 'Service', id: 'sync-service' },
      })
      await actions.start(a4.$id)
      await actions.fail(a4.$id, { code: 'ERROR', message: 'Sync failed', retryable: false })
    })

    it('should find by status', async () => {
      const pending = await actions.findByStatus('Pending')
      const running = await actions.findByStatus('Running')
      const completed = await actions.findByStatus('Completed')
      const failed = await actions.findByStatus('Failed')

      expect(pending.length).toBe(1)
      expect(running.length).toBe(1)
      expect(completed.length).toBe(1)
      expect(failed.length).toBe(1)
    })

    it('should find by verb', async () => {
      const processActions = await actions.findByVerb('process')

      expect(processActions.length).toBe(1)
      expect(processActions[0].verb).toBe('process')
    })

    it('should find by object', async () => {
      await actions.create({
        verb: 'update',
        actor: { type: 'User', id: 'user-1' },
        object: 'order-123',
      })
      await actions.create({
        verb: 'delete',
        actor: { type: 'User', id: 'user-1' },
        object: 'order-123',
      })

      const orderActions = await actions.findByObject('order-123')

      expect(orderActions.length).toBe(2)
    })

    it('should get pending count', async () => {
      const count = await actions.getPendingCount()
      expect(count).toBe(1)
    })

    it('should get running count', async () => {
      const count = await actions.getRunningCount()
      expect(count).toBe(1)
    })

    it('should get stats by status', async () => {
      const stats = await actions.getStats()

      expect(stats.Pending).toBe(1)
      expect(stats.Running).toBe(1)
      expect(stats.Completed).toBe(1)
      expect(stats.Failed).toBe(1)
    })
  })

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  describe('Cleanup', () => {
    it('should clean up old completed actions', async () => {
      const action = await actions.create({
        verb: 'old-action',
        actor: { type: 'User', id: 'user-1' },
      })

      await actions.start(action.$id)
      await actions.complete(action.$id, {})

      // Advance time past cleanup threshold
      vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000) // 31 days

      const deleted = await actions.cleanup(Date.now() - 30 * 24 * 60 * 60 * 1000)

      expect(deleted).toBeGreaterThan(0)
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle action with typed input/output', async () => {
      interface ProcessInput {
        items: string[]
        options: { parallel: boolean }
      }
      interface ProcessOutput {
        processed: number
        errors: string[]
      }

      const action = await actions.create<ProcessInput>({
        verb: 'process-items',
        actor: { type: 'Service', id: 'processor' },
        input: {
          items: ['a', 'b', 'c'],
          options: { parallel: true },
        },
      })

      await actions.start(action.$id)
      const completed = await actions.complete<ProcessOutput>(action.$id, {
        processed: 3,
        errors: [],
      })

      const input = completed.input as ProcessInput | undefined
      const output = completed.output as ProcessOutput | undefined
      expect(input?.items).toEqual(['a', 'b', 'c'])
      expect(output?.processed).toBe(3)
    })

    it('should handle action with large input/output', async () => {
      const largeInput = { data: 'x'.repeat(100000) }
      const largeOutput = { result: 'y'.repeat(100000) }

      const action = await actions.create({
        verb: 'large-data',
        actor: { type: 'User', id: 'user-1' },
        input: largeInput,
      })

      await actions.start(action.$id)
      const completed = await actions.complete(action.$id, largeOutput)

      expect(completed.input).toEqual(largeInput)
      expect(completed.output).toEqual(largeOutput)
    })

    it('should validate verb is non-empty', async () => {
      await expect(
        actions.create({
          verb: '',
          actor: { type: 'User', id: 'user-1' },
        })
      ).rejects.toThrow()
    })

    it('should handle get for non-existent action', async () => {
      const result = await actions.get('non-existent-id')
      expect(result).toBeNull()
    })

    it('should generate unique action IDs', async () => {
      const actionIds = await Promise.all(
        Array.from({ length: 10 }, () =>
          actions.create({
            verb: 'unique',
            actor: { type: 'User', id: 'user-1' },
          })
        )
      )

      const ids = actionIds.map(a => a.$id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(10)
    })

    it('should use action_ prefix for IDs', async () => {
      const action = await actions.create({
        verb: 'prefixed',
        actor: { type: 'User', id: 'user-1' },
      })

      expect(action.$id.startsWith('action_')).toBe(true)
    })
  })
})
