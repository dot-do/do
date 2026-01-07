/**
 * @dotdo/do - Workflow Operations Tests (GREEN Phase)
 *
 * Tests for WorkflowContext (the $ object in workflow handlers):
 * - $.send(event, data) - Fire and forget event (durable)
 * - $.do(event, data) - Durable action, waits for result, retries on failure
 * - $.try(event, data) - Non-durable action, waits for result
 * - $.state - Read/write context data
 * - $.getState() - Get full workflow state
 * - $.set(key, value) - Set a value in context
 * - $.get(key) - Get a value from context
 * - $.log(message, data) - Log message
 *
 * Also tests event handler registration:
 * - $.on.Noun.event - Register handler for Noun.event events
 * - $.every.hour - Schedule every hour
 * - $.every.cron(expression) - Schedule with cron expression
 *
 * Uses the @cloudflare/vitest-pool-workers integration with real Miniflare-powered SQLite storage.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'
import type { DurableObjectStub } from '@cloudflare/workers-types'
import { createTestStub, uniqueTestName } from './helpers/do-test-utils'
import type {
  WorkflowContext,
  WorkflowState,
  WorkflowHistoryEntry,
  EventHandler,
  ScheduleHandler,
} from '../src/types'

// Type for DO stub with RPC methods including workflow operations
interface DOStub extends DurableObjectStub {
  // Workflow operations
  createWorkflowContext(workflowId?: string): Promise<WorkflowContext>
  getWorkflowState(workflowId?: string): Promise<WorkflowState>
  saveWorkflowState(state: WorkflowState, workflowId?: string): Promise<void>
  registerWorkflowHandler<T = unknown, R = unknown>(eventPattern: string, handler: EventHandler<T, R>): void
  registerSchedule(interval: { type: string; value?: number; expression?: string }, handler: ScheduleHandler): void
  getWorkflowHandlers(pattern?: string): Promise<EventHandler[]>
  getSchedules(): Promise<Array<{ type: string; value?: number; expression?: string }>>
  // Event operations
  queryEvents(options?: { type?: string }): Promise<Array<Record<string, unknown>>>
  // Action operations
  queryActions(options?: { action?: string }): Promise<Array<Record<string, unknown>>>
  // CRUD operations
  create(collection: string, doc: Record<string, unknown>): Promise<Record<string, unknown>>
  allowedMethods: Set<string>
}

describe('Workflow Operations', () => {
  describe('WorkflowContext Creation', () => {
    let stub: DOStub

    beforeEach(() => {
      const name = uniqueTestName('workflow-ctx')
      stub = createTestStub(name) as DOStub
    })

    it('should have createWorkflowContext method', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).createWorkflowContext).toBeDefined()
        expect(typeof (instance as any).createWorkflowContext).toBe('function')
      })
    })

    it('should create a WorkflowContext with required methods', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()

        expect($.send).toBeDefined()
        expect($.do).toBeDefined()
        expect($.try).toBeDefined()
        expect($.state).toBeDefined()
        expect($.getState).toBeDefined()
        expect($.set).toBeDefined()
        expect($.get).toBeDefined()
        expect($.log).toBeDefined()
      })
    })

    it('should create unique workflow contexts', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $1 = await (instance as any).createWorkflowContext()
        const $2 = await (instance as any).createWorkflowContext('workflow-2')

        // Different contexts should have different state
        $1.set('key', 'value1')
        $2.set('key', 'value2')

        expect($1.get('key')).toBe('value1')
        expect($2.get('key')).toBe('value2')
      })
    })
  })

  describe('$.send() - Fire and Forget', () => {
    let stub: DOStub

    beforeEach(() => {
      const name = uniqueTestName('workflow-send')
      stub = createTestStub(name) as DOStub
    })

    it('should send an event with data', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        await $.send('Customer.created', { customerId: '123', email: 'test@example.com' })

        // Event should be tracked
        const state = $.getState()
        expect(state.history.length).toBeGreaterThan(0)
        expect(state.history[state.history.length - 1].type).toBe('event')
        expect(state.history[state.history.length - 1].name).toBe('Customer.created')
      })
    })

    it('should be fire-and-forget (not wait for result)', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        const startTime = Date.now()
        await $.send('LongRunning.process', { data: 'test' })
        const elapsed = Date.now() - startTime

        // Should return immediately (fire-and-forget)
        expect(elapsed).toBeLessThan(100)
      })
    })

    it('should persist event durably', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        await $.send('Order.placed', { orderId: '456' })

        // Verify event was tracked via the DO's track() method
        const events = await (instance as any).queryEvents({ type: 'Order.placed' })
        expect(events.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('should add entry to workflow history', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        await $.send('Payment.processed', { amount: 100 })

        const state = $.getState()
        const historyEntry = state.history.find(
          (h: WorkflowHistoryEntry) => h.name === 'Payment.processed'
        )
        expect(historyEntry).toBeDefined()
        expect(historyEntry?.type).toBe('event')
        expect(historyEntry?.timestamp).toBeDefined()
      })
    })
  })

  describe('$.do() - Durable Action', () => {
    let stub: DOStub

    beforeEach(() => {
      const name = uniqueTestName('workflow-do')
      stub = createTestStub(name) as DOStub
    })

    it('should execute durable action and return result', async () => {
      await runInDurableObject(stub, async (instance) => {
        // Register a handler for this action
        ;(instance as any).registerWorkflowHandler('Process.data', async (data: any) => {
          return { processed: true, input: data }
        })

        const $ = await (instance as any).createWorkflowContext()
        const result = await $.do('Process.data', { value: 42 })
        expect(result).toEqual({ processed: true, input: { value: 42 } })
      })
    })

    it('should wait for action to complete', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).registerWorkflowHandler('Slow.action', async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return 'done'
        })

        const $ = await (instance as any).createWorkflowContext()
        const result = await $.do('Slow.action', {})
        expect(result).toBe('done')
      })
    })

    it('should add action entry to workflow history', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).registerWorkflowHandler('Task.execute', async () => 'result')

        const $ = await (instance as any).createWorkflowContext()
        await $.do('Task.execute', { taskId: '789' })

        const state = $.getState()
        const actionEntry = state.history.find((h: WorkflowHistoryEntry) => h.name === 'Task.execute')
        expect(actionEntry).toBeDefined()
        expect(actionEntry?.type).toBe('action')
      })
    })

    it('should track action in DO actions table', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).registerWorkflowHandler('Tracked.action', async () => 'ok')

        const $ = await (instance as any).createWorkflowContext()
        await $.do('Tracked.action', { data: 'test' })

        const actions = await (instance as any).queryActions({ action: 'Tracked.action' })
        expect(actions.length).toBeGreaterThanOrEqual(1)
        expect(actions[0].status).toBe('completed')
      })
    })

    it('should retry on failure', async () => {
      await runInDurableObject(stub, async (instance) => {
        let attempts = 0
        ;(instance as any).registerWorkflowHandler('Flaky.action', async () => {
          attempts++
          if (attempts < 3) {
            throw new Error('Temporary failure')
          }
          return 'success after retries'
        })

        const $ = await (instance as any).createWorkflowContext()
        const result = await $.do('Flaky.action', {})
        expect(result).toBe('success after retries')
        expect(attempts).toBe(3)
      })
    })
  })

  describe('$.try() - Non-Durable Action', () => {
    let stub: DOStub

    beforeEach(() => {
      const name = uniqueTestName('workflow-try')
      stub = createTestStub(name) as DOStub
    })

    it('should execute action and return result', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).registerWorkflowHandler('Quick.action', async (data: any) => {
          return { quick: true, data }
        })

        const $ = await (instance as any).createWorkflowContext()
        const result = await $.try('Quick.action', { value: 'test' })
        expect(result).toEqual({ quick: true, data: { value: 'test' } })
      })
    })

    it('should NOT retry on failure', async () => {
      await runInDurableObject(stub, async (instance) => {
        let attempts = 0
        ;(instance as any).registerWorkflowHandler('NonRetry.action', async () => {
          attempts++
          throw new Error('Action failed')
        })

        const $ = await (instance as any).createWorkflowContext()
        await expect($.try('NonRetry.action', {})).rejects.toThrow('Action failed')
        expect(attempts).toBe(1) // Only one attempt, no retries
      })
    })

    it('should NOT persist to actions table', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).registerWorkflowHandler('Ephemeral.action', async () => 'done')

        const $ = await (instance as any).createWorkflowContext()
        await $.try('Ephemeral.action', {})

        // Non-durable actions should not be tracked in actions table
        const actions = await (instance as any).queryActions({ action: 'Ephemeral.action' })
        expect(actions.length).toBe(0)
      })
    })

    it('should still add entry to workflow history for debugging', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).registerWorkflowHandler('Debug.action', async () => 'done')

        const $ = await (instance as any).createWorkflowContext()
        await $.try('Debug.action', { debug: true })

        const state = $.getState()
        // History is tracked for debugging but action is not durable
        expect(state.history.some((h: WorkflowHistoryEntry) => h.name === 'Debug.action')).toBe(true)
      })
    })
  })

  describe('$.state - Read/Write Context', () => {
    let stub: DOStub

    beforeEach(() => {
      const name = uniqueTestName('workflow-state')
      stub = createTestStub(name) as DOStub
    })

    it('should allow reading state values', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        $.set('testKey', 'testValue')
        expect($.state.testKey).toBe('testValue')
      })
    })

    it('should allow writing state values', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        $.state.newKey = 'newValue'
        expect($.get('newKey')).toBe('newValue')
      })
    })

    it('should persist state changes', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        $.set('persistent', 'data')

        // Reload workflow state
        const state = await (instance as any).getWorkflowState()
        expect(state.context.persistent).toBe('data')
      })
    })

    it('should support complex values', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        $.state.complex = { nested: { array: [1, 2, 3] } }
        expect($.state.complex.nested.array[1]).toBe(2)
      })
    })
  })

  describe('$.getState() - Full State Access', () => {
    let stub: DOStub

    beforeEach(() => {
      const name = uniqueTestName('workflow-getstate')
      stub = createTestStub(name) as DOStub
    })

    it('should return WorkflowState object', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        const state = $.getState()
        expect(state).toBeDefined()
        expect(state.context).toBeDefined()
        expect(state.history).toBeDefined()
        expect(Array.isArray(state.history)).toBe(true)
      })
    })

    it('should include current state for state machines', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        // Set current state
        ;($ as any)._setCurrentState('processing')

        const state = $.getState()
        expect(state.current).toBe('processing')
      })
    })

    it('should return context data', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        $.set('key1', 'value1')
        $.set('key2', 'value2')

        const state = $.getState()
        expect(state.context.key1).toBe('value1')
        expect(state.context.key2).toBe('value2')
      })
    })

    it('should return workflow history', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).registerWorkflowHandler('Test.action', async () => 'done')

        const $ = await (instance as any).createWorkflowContext()
        await $.send('Event.one', { data: 1 })
        await $.do('Test.action', { data: 2 })

        const state = $.getState()
        expect(state.history.length).toBeGreaterThanOrEqual(2)
      })
    })
  })

  describe('$.set() and $.get() - Context Operations', () => {
    let stub: DOStub

    beforeEach(() => {
      const name = uniqueTestName('workflow-setget')
      stub = createTestStub(name) as DOStub
    })

    it('should set and get string values', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        $.set('name', 'John')
        expect($.get('name')).toBe('John')
      })
    })

    it('should set and get number values', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        $.set('count', 42)
        expect($.get<number>('count')).toBe(42)
      })
    })

    it('should set and get boolean values', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        $.set('enabled', true)
        expect($.get('enabled')).toBe(true)
      })
    })

    it('should set and get object values', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        $.set('user', { id: 1, name: 'Alice' })
        expect($.get<{ id: number; name: string }>('user')).toEqual({ id: 1, name: 'Alice' })
      })
    })

    it('should set and get array values', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        $.set('items', [1, 2, 3])
        expect($.get<number[]>('items')).toEqual([1, 2, 3])
      })
    })

    it('should return undefined for non-existent keys', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        expect($.get('nonexistent')).toBeUndefined()
      })
    })

    it('should overwrite existing values', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        $.set('key', 'original')
        $.set('key', 'updated')
        expect($.get('key')).toBe('updated')
      })
    })
  })

  describe('$.log() - Logging', () => {
    let stub: DOStub

    beforeEach(() => {
      const name = uniqueTestName('workflow-log')
      stub = createTestStub(name) as DOStub
    })

    it('should log message to history', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        $.log('Processing started')

        const state = $.getState()
        const logEntry = state.history.find((h: WorkflowHistoryEntry) => h.name === 'Processing started')
        expect(logEntry).toBeDefined()
      })
    })

    it('should log message with data', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        $.log('User action', { userId: '123', action: 'click' })

        const state = $.getState()
        const logEntry = state.history.find((h: WorkflowHistoryEntry) => h.name === 'User action')
        expect(logEntry?.data).toEqual({ userId: '123', action: 'click' })
      })
    })

    it('should include timestamp in log entries', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        $.log('Timestamped message')

        const state = $.getState()
        const logEntry = state.history.find(
          (h: WorkflowHistoryEntry) => h.name === 'Timestamped message'
        )
        expect(logEntry?.timestamp).toBeDefined()
        expect(typeof logEntry?.timestamp).toBe('number')
      })
    })
  })

  describe('Workflow State Persistence', () => {
    let stub: DOStub

    beforeEach(() => {
      const name = uniqueTestName('workflow-persist')
      stub = createTestStub(name) as DOStub
    })

    it('should have getWorkflowState method', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).getWorkflowState).toBeDefined()
        expect(typeof (instance as any).getWorkflowState).toBe('function')
      })
    })

    it('should have saveWorkflowState method', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).saveWorkflowState).toBeDefined()
        expect(typeof (instance as any).saveWorkflowState).toBe('function')
      })
    })

    it('should persist workflow state to database', async () => {
      await runInDurableObject(stub, async (instance) => {
        const state: WorkflowState = {
          current: 'active',
          context: { orderId: '123', status: 'pending' },
          history: [{ timestamp: Date.now(), type: 'event', name: 'Order.created' }],
        }

        await (instance as any).saveWorkflowState(state)
        const retrieved = await (instance as any).getWorkflowState()

        expect(retrieved.current).toBe('active')
        expect(retrieved.context.orderId).toBe('123')
      })
    })

    it('should return empty state for new workflows', async () => {
      await runInDurableObject(stub, async (instance) => {
        const state = await (instance as any).getWorkflowState('new-workflow')

        expect(state.context).toEqual({})
        expect(state.history).toEqual([])
      })
    })

    it('should support multiple workflow instances', async () => {
      await runInDurableObject(stub, async (instance) => {
        await (instance as any).saveWorkflowState(
          { context: { name: 'workflow1' }, history: [] },
          'wf-1'
        )
        await (instance as any).saveWorkflowState(
          { context: { name: 'workflow2' }, history: [] },
          'wf-2'
        )

        const state1 = await (instance as any).getWorkflowState('wf-1')
        const state2 = await (instance as any).getWorkflowState('wf-2')

        expect(state1.context.name).toBe('workflow1')
        expect(state2.context.name).toBe('workflow2')
      })
    })
  })

  describe('Event Handler Registration ($.on)', () => {
    let stub: DOStub

    beforeEach(() => {
      const name = uniqueTestName('workflow-handler')
      stub = createTestStub(name) as DOStub
    })

    it('should have registerWorkflowHandler method', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).registerWorkflowHandler).toBeDefined()
      })
    })

    it('should register event handler for Noun.event pattern', async () => {
      await runInDurableObject(stub, async (instance) => {
        const handler: EventHandler = async (data, $) => {
          $.set('received', data)
          return 'handled'
        }

        ;(instance as any).registerWorkflowHandler('Customer.created', handler)

        const handlers = await (instance as any).getWorkflowHandlers('Customer.created')
        expect(handlers.length).toBe(1)
      })
    })

    it('should invoke handler when event is emitted', async () => {
      await runInDurableObject(stub, async (instance) => {
        let handlerCalled = false
        ;(instance as any).registerWorkflowHandler('Order.placed', async (data: any) => {
          handlerCalled = true
          return { orderId: data.id }
        })

        const $ = await (instance as any).createWorkflowContext()
        await $.do('Order.placed', { id: 'order-123' })

        expect(handlerCalled).toBe(true)
      })
    })

    it('should pass data and context to handler', async () => {
      await runInDurableObject(stub, async (instance) => {
        let receivedData: any
        let receivedContext: WorkflowContext | undefined

        ;(instance as any).registerWorkflowHandler('Test.event', async (data: any, $: WorkflowContext) => {
          receivedData = data
          receivedContext = $
          return 'ok'
        })

        const $ = await (instance as any).createWorkflowContext()
        await $.do('Test.event', { key: 'value' })

        expect(receivedData).toEqual({ key: 'value' })
        expect(receivedContext).toBeDefined()
        expect(receivedContext?.set).toBeDefined()
      })
    })
  })

  describe('Schedule Registration ($.every)', () => {
    let stub: DOStub

    beforeEach(() => {
      const name = uniqueTestName('workflow-schedule')
      stub = createTestStub(name) as DOStub
    })

    it('should have registerSchedule method', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).registerSchedule).toBeDefined()
      })
    })

    it('should register hourly schedule', async () => {
      await runInDurableObject(stub, async (instance) => {
        const handler: ScheduleHandler = async ($) => {
          $.log('Hourly task executed')
        }

        ;(instance as any).registerSchedule({ type: 'hour' }, handler)

        const schedules = await (instance as any).getSchedules()
        expect(schedules.some((s: any) => s.type === 'hour')).toBe(true)
      })
    })

    it('should register minutely schedule', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).registerSchedule({ type: 'minute', value: 5 }, async () => {})

        const schedules = await (instance as any).getSchedules()
        expect(schedules.some((s: any) => s.type === 'minute' && s.value === 5)).toBe(true)
      })
    })

    it('should register cron schedule', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).registerSchedule(
          { type: 'cron', expression: '0 0 * * *' },
          async () => {}
        )

        const schedules = await (instance as any).getSchedules()
        expect(schedules.some((s: any) => s.type === 'cron' && s.expression === '0 0 * * *')).toBe(
          true
        )
      })
    })

    it('should register daily schedule', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).registerSchedule({ type: 'day' }, async () => {})

        const schedules = await (instance as any).getSchedules()
        expect(schedules.some((s: any) => s.type === 'day')).toBe(true)
      })
    })

    it('should register weekly schedule', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).registerSchedule({ type: 'week' }, async () => {})

        const schedules = await (instance as any).getSchedules()
        expect(schedules.some((s: any) => s.type === 'week')).toBe(true)
      })
    })
  })

  describe('Workflow History Entries', () => {
    let stub: DOStub

    beforeEach(() => {
      const name = uniqueTestName('workflow-history')
      stub = createTestStub(name) as DOStub
    })

    it('should track event history entries', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        await $.send('Test.event', { data: 'test' })

        const state = $.getState()
        const eventEntry = state.history.find((h: WorkflowHistoryEntry) => h.type === 'event')
        expect(eventEntry).toBeDefined()
        expect(eventEntry?.name).toBe('Test.event')
      })
    })

    it('should track action history entries', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).registerWorkflowHandler('Test.action', async () => 'done')

        const $ = await (instance as any).createWorkflowContext()
        await $.do('Test.action', {})

        const state = $.getState()
        const actionEntry = state.history.find((h: WorkflowHistoryEntry) => h.type === 'action')
        expect(actionEntry).toBeDefined()
        expect(actionEntry?.name).toBe('Test.action')
      })
    })

    it('should track schedule history entries', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        // Simulate schedule execution
        ;($ as any)._addHistoryEntry({
          timestamp: Date.now(),
          type: 'schedule',
          name: 'hourly',
        })

        const state = $.getState()
        const scheduleEntry = state.history.find((h: WorkflowHistoryEntry) => h.type === 'schedule')
        expect(scheduleEntry).toBeDefined()
      })
    })

    it('should track transition history entries', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        // Simulate state machine transition
        ;($ as any)._addHistoryEntry({
          timestamp: Date.now(),
          type: 'transition',
          name: 'pending -> processing',
          data: { from: 'pending', to: 'processing' },
        })

        const state = $.getState()
        const transitionEntry = state.history.find(
          (h: WorkflowHistoryEntry) => h.type === 'transition'
        )
        expect(transitionEntry).toBeDefined()
        expect(transitionEntry?.data).toEqual({ from: 'pending', to: 'processing' })
      })
    })

    it('should include timestamp in all history entries', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()
        await $.send('Timestamped.event', {})
        $.log('Timestamped log')

        const state = $.getState()
        for (const entry of state.history) {
          expect(entry.timestamp).toBeDefined()
          expect(typeof entry.timestamp).toBe('number')
        }
      })
    })

    it('should preserve history order', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).registerWorkflowHandler('Action.one', async () => 'one')
        ;(instance as any).registerWorkflowHandler('Action.two', async () => 'two')

        const $ = await (instance as any).createWorkflowContext()
        await $.send('Event.first', {})
        await $.do('Action.one', {})
        $.log('Middle log')
        await $.do('Action.two', {})
        await $.send('Event.last', {})

        const state = $.getState()
        expect(state.history.length).toBeGreaterThanOrEqual(5)

        // Verify chronological order
        for (let i = 1; i < state.history.length; i++) {
          expect(state.history[i].timestamp).toBeGreaterThanOrEqual(state.history[i - 1].timestamp)
        }
      })
    })
  })

  describe('WorkflowContext Integration', () => {
    let stub: DOStub

    beforeEach(() => {
      const name = uniqueTestName('workflow-integration')
      stub = createTestStub(name) as DOStub
    })

    it('should work with DO database operations via $.db', async () => {
      await runInDurableObject(stub, async (instance) => {
        const $ = await (instance as any).createWorkflowContext()

        // WorkflowContext should have access to db operations
        expect($.db).toBeDefined()
      })
    })

    it('should handle complex workflow scenarios', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).registerWorkflowHandler('Order.validate', async (data: any) => {
          return { valid: data.amount > 0 }
        })

        ;(instance as any).registerWorkflowHandler('Order.process', async (data: any) => {
          return { processed: true, orderId: data.orderId }
        })

        const $ = await (instance as any).createWorkflowContext()

        // Start workflow
        $.set('orderId', 'order-123')
        $.set('amount', 100)

        // Validate order
        const validation = await $.do<{ amount: number }, { valid: boolean }>('Order.validate', {
          amount: $.get('amount')!,
        })
        expect(validation.valid).toBe(true)

        // Process order
        if (validation.valid) {
          const result = await $.do('Order.process', { orderId: $.get('orderId') })
          expect(result.processed).toBe(true)
          $.set('status', 'completed')
        }

        expect($.get('status')).toBe('completed')
      })
    })

    it('should support error handling in workflows', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).registerWorkflowHandler('Risky.action', async () => {
          throw new Error('Action failed')
        })

        const $ = await (instance as any).createWorkflowContext()

        try {
          await $.try('Risky.action', {})
          $.set('status', 'success')
        } catch (error) {
          $.set('status', 'failed')
          $.set('error', (error as Error).message)
        }

        expect($.get('status')).toBe('failed')
        expect($.get('error')).toBe('Action failed')
      })
    })
  })

  describe('allowedMethods includes workflow operations', () => {
    let stub: DOStub

    beforeEach(() => {
      const name = uniqueTestName('workflow-allowed')
      stub = createTestStub(name) as DOStub
    })

    it('should include createWorkflowContext in allowedMethods', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).allowedMethods.has('createWorkflowContext')).toBe(true)
      })
    })

    it('should include getWorkflowState in allowedMethods', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).allowedMethods.has('getWorkflowState')).toBe(true)
      })
    })

    it('should include saveWorkflowState in allowedMethods', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).allowedMethods.has('saveWorkflowState')).toBe(true)
      })
    })

    it('should include registerWorkflowHandler in allowedMethods', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).allowedMethods.has('registerWorkflowHandler')).toBe(true)
      })
    })

    it('should include registerSchedule in allowedMethods', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).allowedMethods.has('registerSchedule')).toBe(true)
      })
    })

    it('should include getWorkflowHandlers in allowedMethods', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).allowedMethods.has('getWorkflowHandlers')).toBe(true)
      })
    })

    it('should include getSchedules in allowedMethods', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).allowedMethods.has('getSchedules')).toBe(true)
      })
    })
  })
})
