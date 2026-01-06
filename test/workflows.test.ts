/**
 * @dotdo/do - Workflow Operations Tests (RED Phase)
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
 * These tests should FAIL initially (RED), then pass after implementation (GREEN).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DO } from '../src/do'
import type {
  WorkflowContext,
  WorkflowState,
  WorkflowHistoryEntry,
  EventHandler,
  ScheduleHandler,
} from '../src/types'

/**
 * Create an in-memory SQLite mock for testing
 * Extended to support workflow_state table
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
            table.set(key, {
              collection,
              id,
              data,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
          } else if (tableName === 'workflow_state') {
            const [id, current, context, history, updated_at] = params as [
              string,
              string | null,
              string,
              string,
              string
            ]
            table.set(id, {
              id,
              current,
              context,
              history,
              updated_at,
            })
          } else if (tableName === 'events') {
            const [id, type, timestamp, source, data, correlation_id, causation_id] = params as [
              string,
              string,
              string,
              string,
              string,
              string | null,
              string | null
            ]
            table.set(id, {
              id,
              type,
              timestamp,
              source,
              data,
              correlation_id,
              causation_id,
            })
          } else if (tableName === 'actions') {
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
          } else if (tableName === 'workflow_handlers') {
            const [id, event_pattern, handler_type, schedule, handler_fn, created_at] = params as [
              string,
              string,
              string,
              string | null,
              string,
              string
            ]
            table.set(id, {
              id,
              event_pattern,
              handler_type,
              schedule,
              handler_fn,
              created_at,
            })
          }
        }
      } else if (normalizedQuery.startsWith('SELECT')) {
        const tableMatch = query.match(/FROM (\w+)/i)
        if (tableMatch) {
          const tableName = tableMatch[1]
          const table = tables.get(tableName)

          if (table) {
            if (tableName === 'workflow_state') {
              if (query.includes('WHERE id = ?')) {
                const [id] = params as [string]
                const row = table.get(id)
                if (row) {
                  results.push(row)
                }
              }
            } else if (tableName === 'events') {
              if (query.includes('WHERE id = ?')) {
                const [id] = params as [string]
                const row = table.get(id)
                if (row) {
                  results.push(row)
                }
              } else {
                // Return all events for queryEvents
                const allEvents = Array.from(table.values())
                results.push(...allEvents)
              }
            } else if (tableName === 'actions') {
              if (query.includes('WHERE id = ?')) {
                const [id] = params as [string]
                const row = table.get(id)
                if (row) {
                  results.push(row)
                }
              } else {
                // Handle queryActions with filters (from actions.test.ts)
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
            } else if (tableName === 'workflow_handlers') {
              if (query.includes('WHERE event_pattern = ?')) {
                const [pattern] = params as [string]
                for (const row of table.values()) {
                  if (row.event_pattern === pattern) {
                    results.push(row)
                  }
                }
              } else {
                results.push(...Array.from(table.values()))
              }
            }
          }
        }
      } else if (normalizedQuery.startsWith('UPDATE')) {
        const tableMatch = query.match(/UPDATE (\w+)/i)
        if (tableMatch) {
          const tableName = tableMatch[1]
          const table = tables.get(tableName)

          if (table) {
            if (tableName === 'workflow_state') {
              // UPDATE workflow_state SET current = ?, context = ?, history = ?, updated_at = ? WHERE id = ?
              const id = params[params.length - 1] as string
              const existing = table.get(id)
              if (existing) {
                const setMatch = query.match(/SET\s+(.+?)\s+WHERE/i)
                if (setMatch) {
                  const setClause = setMatch[1]
                  const assignments = setClause.split(',').map((s) => s.trim())
                  let paramIndex = 0
                  const updates: Record<string, unknown> = {}

                  for (const assignment of assignments) {
                    const [col] = assignment.split('=').map((s) => s.trim())
                    const columnName = col.toLowerCase()
                    updates[columnName] = params[paramIndex]
                    paramIndex++
                  }

                  table.set(id, { ...existing, ...updates })
                }
              }
            } else if (tableName === 'actions') {
              const id = params[params.length - 1] as string
              const existing = table.get(id)
              if (existing) {
                const updates: Record<string, unknown> = {}
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
      } else if (normalizedQuery.startsWith('DELETE')) {
        const tableMatch = query.match(/DELETE FROM (\w+)/i)
        if (tableMatch) {
          const tableName = tableMatch[1]
          const table = tables.get(tableName)
          if (table) {
            if (query.includes('WHERE id = ?')) {
              const [id] = params as [string]
              table.delete(id)
            }
          }
        }
      }

      return {
        toArray() {
          return results
        },
      }
    },
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
      sql: createMockSqlStorage(),
    },
  }
}

// Mock environment
const mockEnv = {
  DO_NAMESPACE: {
    idFromName: vi.fn(() => ({ toString: () => 'mock-id' })),
    get: vi.fn(),
  },
}

describe('Workflow Operations', () => {
  describe('WorkflowContext Creation', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should have createWorkflowContext method', () => {
      expect((doInstance as any).createWorkflowContext).toBeDefined()
      expect(typeof (doInstance as any).createWorkflowContext).toBe('function')
    })

    it('should create a WorkflowContext with required methods', async () => {
      const $ = await (doInstance as any).createWorkflowContext()

      expect($.send).toBeDefined()
      expect($.do).toBeDefined()
      expect($.try).toBeDefined()
      expect($.state).toBeDefined()
      expect($.getState).toBeDefined()
      expect($.set).toBeDefined()
      expect($.get).toBeDefined()
      expect($.log).toBeDefined()
    })

    it('should create unique workflow contexts', async () => {
      const $1 = await (doInstance as any).createWorkflowContext()
      const $2 = await (doInstance as any).createWorkflowContext('workflow-2')

      // Different contexts should have different state
      $1.set('key', 'value1')
      $2.set('key', 'value2')

      expect($1.get('key')).toBe('value1')
      expect($2.get('key')).toBe('value2')
    })
  })

  describe('$.send() - Fire and Forget', () => {
    let doInstance: DO
    let $: WorkflowContext

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
      $ = await (doInstance as any).createWorkflowContext()
    })

    it('should send an event with data', async () => {
      await $.send('Customer.created', { customerId: '123', email: 'test@example.com' })

      // Event should be tracked
      const state = $.getState()
      expect(state.history.length).toBeGreaterThan(0)
      expect(state.history[state.history.length - 1].type).toBe('event')
      expect(state.history[state.history.length - 1].name).toBe('Customer.created')
    })

    it('should be fire-and-forget (not wait for result)', async () => {
      const startTime = Date.now()
      await $.send('LongRunning.process', { data: 'test' })
      const elapsed = Date.now() - startTime

      // Should return immediately (fire-and-forget)
      expect(elapsed).toBeLessThan(100)
    })

    it('should persist event durably', async () => {
      await $.send('Order.placed', { orderId: '456' })

      // Verify event was tracked via the DO's track() method
      const events = await (doInstance as any).queryEvents({ type: 'Order.placed' })
      expect(events.length).toBeGreaterThanOrEqual(1)
    })

    it('should add entry to workflow history', async () => {
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

  describe('$.do() - Durable Action', () => {
    let doInstance: DO
    let $: WorkflowContext

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
      $ = await (doInstance as any).createWorkflowContext()
    })

    it('should execute durable action and return result', async () => {
      // Register a handler for this action
      ;(doInstance as any).registerWorkflowHandler('Process.data', async (data: any) => {
        return { processed: true, input: data }
      })

      const result = await $.do('Process.data', { value: 42 })
      expect(result).toEqual({ processed: true, input: { value: 42 } })
    })

    it('should wait for action to complete', async () => {
      ;(doInstance as any).registerWorkflowHandler('Slow.action', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return 'done'
      })

      const result = await $.do('Slow.action', {})
      expect(result).toBe('done')
    })

    it('should add action entry to workflow history', async () => {
      ;(doInstance as any).registerWorkflowHandler('Task.execute', async () => 'result')

      await $.do('Task.execute', { taskId: '789' })

      const state = $.getState()
      const actionEntry = state.history.find((h: WorkflowHistoryEntry) => h.name === 'Task.execute')
      expect(actionEntry).toBeDefined()
      expect(actionEntry?.type).toBe('action')
    })

    it('should track action in DO actions table', async () => {
      ;(doInstance as any).registerWorkflowHandler('Tracked.action', async () => 'ok')

      await $.do('Tracked.action', { data: 'test' })

      const actions = await (doInstance as any).queryActions({ action: 'Tracked.action' })
      expect(actions.length).toBeGreaterThanOrEqual(1)
      expect(actions[0].status).toBe('completed')
    })

    it('should retry on failure', async () => {
      let attempts = 0
      ;(doInstance as any).registerWorkflowHandler('Flaky.action', async () => {
        attempts++
        if (attempts < 3) {
          throw new Error('Temporary failure')
        }
        return 'success after retries'
      })

      const result = await $.do('Flaky.action', {})
      expect(result).toBe('success after retries')
      expect(attempts).toBe(3)
    })
  })

  describe('$.try() - Non-Durable Action', () => {
    let doInstance: DO
    let $: WorkflowContext

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
      $ = await (doInstance as any).createWorkflowContext()
    })

    it('should execute action and return result', async () => {
      ;(doInstance as any).registerWorkflowHandler('Quick.action', async (data: any) => {
        return { quick: true, data }
      })

      const result = await $.try('Quick.action', { value: 'test' })
      expect(result).toEqual({ quick: true, data: { value: 'test' } })
    })

    it('should NOT retry on failure', async () => {
      let attempts = 0
      ;(doInstance as any).registerWorkflowHandler('NonRetry.action', async () => {
        attempts++
        throw new Error('Action failed')
      })

      await expect($.try('NonRetry.action', {})).rejects.toThrow('Action failed')
      expect(attempts).toBe(1) // Only one attempt, no retries
    })

    it('should NOT persist to actions table', async () => {
      ;(doInstance as any).registerWorkflowHandler('Ephemeral.action', async () => 'done')

      await $.try('Ephemeral.action', {})

      // Non-durable actions should not be tracked in actions table
      const actions = await (doInstance as any).queryActions({ action: 'Ephemeral.action' })
      expect(actions.length).toBe(0)
    })

    it('should still add entry to workflow history for debugging', async () => {
      ;(doInstance as any).registerWorkflowHandler('Debug.action', async () => 'done')

      await $.try('Debug.action', { debug: true })

      const state = $.getState()
      // History is tracked for debugging but action is not durable
      expect(state.history.some((h: WorkflowHistoryEntry) => h.name === 'Debug.action')).toBe(true)
    })
  })

  describe('$.state - Read/Write Context', () => {
    let doInstance: DO
    let $: WorkflowContext

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
      $ = await (doInstance as any).createWorkflowContext()
    })

    it('should allow reading state values', () => {
      $.set('testKey', 'testValue')
      expect($.state.testKey).toBe('testValue')
    })

    it('should allow writing state values', () => {
      $.state.newKey = 'newValue'
      expect($.get('newKey')).toBe('newValue')
    })

    it('should persist state changes', async () => {
      $.set('persistent', 'data')

      // Reload workflow state
      const state = await (doInstance as any).getWorkflowState()
      expect(state.context.persistent).toBe('data')
    })

    it('should support complex values', () => {
      $.state.complex = { nested: { array: [1, 2, 3] } }
      expect($.state.complex.nested.array[1]).toBe(2)
    })
  })

  describe('$.getState() - Full State Access', () => {
    let doInstance: DO
    let $: WorkflowContext

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
      $ = await (doInstance as any).createWorkflowContext()
    })

    it('should return WorkflowState object', () => {
      const state = $.getState()
      expect(state).toBeDefined()
      expect(state.context).toBeDefined()
      expect(state.history).toBeDefined()
      expect(Array.isArray(state.history)).toBe(true)
    })

    it('should include current state for state machines', () => {
      // Set current state
      ;($ as any)._setCurrentState('processing')

      const state = $.getState()
      expect(state.current).toBe('processing')
    })

    it('should return context data', () => {
      $.set('key1', 'value1')
      $.set('key2', 'value2')

      const state = $.getState()
      expect(state.context.key1).toBe('value1')
      expect(state.context.key2).toBe('value2')
    })

    it('should return workflow history', async () => {
      ;(doInstance as any).registerWorkflowHandler('Test.action', async () => 'done')

      await $.send('Event.one', { data: 1 })
      await $.do('Test.action', { data: 2 })

      const state = $.getState()
      expect(state.history.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('$.set() and $.get() - Context Operations', () => {
    let doInstance: DO
    let $: WorkflowContext

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
      $ = await (doInstance as any).createWorkflowContext()
    })

    it('should set and get string values', () => {
      $.set('name', 'John')
      expect($.get('name')).toBe('John')
    })

    it('should set and get number values', () => {
      $.set('count', 42)
      expect($.get<number>('count')).toBe(42)
    })

    it('should set and get boolean values', () => {
      $.set('enabled', true)
      expect($.get('enabled')).toBe(true)
    })

    it('should set and get object values', () => {
      $.set('user', { id: 1, name: 'Alice' })
      expect($.get<{ id: number; name: string }>('user')).toEqual({ id: 1, name: 'Alice' })
    })

    it('should set and get array values', () => {
      $.set('items', [1, 2, 3])
      expect($.get<number[]>('items')).toEqual([1, 2, 3])
    })

    it('should return undefined for non-existent keys', () => {
      expect($.get('nonexistent')).toBeUndefined()
    })

    it('should overwrite existing values', () => {
      $.set('key', 'original')
      $.set('key', 'updated')
      expect($.get('key')).toBe('updated')
    })
  })

  describe('$.log() - Logging', () => {
    let doInstance: DO
    let $: WorkflowContext

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
      $ = await (doInstance as any).createWorkflowContext()
    })

    it('should log message to history', () => {
      $.log('Processing started')

      const state = $.getState()
      const logEntry = state.history.find((h: WorkflowHistoryEntry) => h.name === 'Processing started')
      expect(logEntry).toBeDefined()
    })

    it('should log message with data', () => {
      $.log('User action', { userId: '123', action: 'click' })

      const state = $.getState()
      const logEntry = state.history.find((h: WorkflowHistoryEntry) => h.name === 'User action')
      expect(logEntry?.data).toEqual({ userId: '123', action: 'click' })
    })

    it('should include timestamp in log entries', () => {
      $.log('Timestamped message')

      const state = $.getState()
      const logEntry = state.history.find(
        (h: WorkflowHistoryEntry) => h.name === 'Timestamped message'
      )
      expect(logEntry?.timestamp).toBeDefined()
      expect(typeof logEntry?.timestamp).toBe('number')
    })
  })

  describe('Workflow State Persistence', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should have getWorkflowState method', () => {
      expect((doInstance as any).getWorkflowState).toBeDefined()
      expect(typeof (doInstance as any).getWorkflowState).toBe('function')
    })

    it('should have saveWorkflowState method', () => {
      expect((doInstance as any).saveWorkflowState).toBeDefined()
      expect(typeof (doInstance as any).saveWorkflowState).toBe('function')
    })

    it('should persist workflow state to database', async () => {
      const state: WorkflowState = {
        current: 'active',
        context: { orderId: '123', status: 'pending' },
        history: [{ timestamp: Date.now(), type: 'event', name: 'Order.created' }],
      }

      await (doInstance as any).saveWorkflowState(state)
      const retrieved = await (doInstance as any).getWorkflowState()

      expect(retrieved.current).toBe('active')
      expect(retrieved.context.orderId).toBe('123')
    })

    it('should return empty state for new workflows', async () => {
      const state = await (doInstance as any).getWorkflowState('new-workflow')

      expect(state.context).toEqual({})
      expect(state.history).toEqual([])
    })

    it('should support multiple workflow instances', async () => {
      await (doInstance as any).saveWorkflowState(
        { context: { name: 'workflow1' }, history: [] },
        'wf-1'
      )
      await (doInstance as any).saveWorkflowState(
        { context: { name: 'workflow2' }, history: [] },
        'wf-2'
      )

      const state1 = await (doInstance as any).getWorkflowState('wf-1')
      const state2 = await (doInstance as any).getWorkflowState('wf-2')

      expect(state1.context.name).toBe('workflow1')
      expect(state2.context.name).toBe('workflow2')
    })
  })

  describe('Event Handler Registration ($.on)', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should have registerWorkflowHandler method', () => {
      expect((doInstance as any).registerWorkflowHandler).toBeDefined()
    })

    it('should register event handler for Noun.event pattern', async () => {
      const handler: EventHandler = async (data, $) => {
        $.set('received', data)
        return 'handled'
      }

      ;(doInstance as any).registerWorkflowHandler('Customer.created', handler)

      const handlers = await (doInstance as any).getWorkflowHandlers('Customer.created')
      expect(handlers.length).toBe(1)
    })

    it('should invoke handler when event is emitted', async () => {
      let handlerCalled = false
      ;(doInstance as any).registerWorkflowHandler('Order.placed', async (data: any) => {
        handlerCalled = true
        return { orderId: data.id }
      })

      const $ = await (doInstance as any).createWorkflowContext()
      await $.do('Order.placed', { id: 'order-123' })

      expect(handlerCalled).toBe(true)
    })

    it('should pass data and context to handler', async () => {
      let receivedData: any
      let receivedContext: WorkflowContext | undefined

      ;(doInstance as any).registerWorkflowHandler('Test.event', async (data: any, $: WorkflowContext) => {
        receivedData = data
        receivedContext = $
        return 'ok'
      })

      const $ = await (doInstance as any).createWorkflowContext()
      await $.do('Test.event', { key: 'value' })

      expect(receivedData).toEqual({ key: 'value' })
      expect(receivedContext).toBeDefined()
      expect(receivedContext?.set).toBeDefined()
    })
  })

  describe('Schedule Registration ($.every)', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should have registerSchedule method', () => {
      expect((doInstance as any).registerSchedule).toBeDefined()
    })

    it('should register hourly schedule', async () => {
      const handler: ScheduleHandler = async ($) => {
        $.log('Hourly task executed')
      }

      ;(doInstance as any).registerSchedule({ type: 'hour' }, handler)

      const schedules = await (doInstance as any).getSchedules()
      expect(schedules.some((s: any) => s.type === 'hour')).toBe(true)
    })

    it('should register minutely schedule', async () => {
      ;(doInstance as any).registerSchedule({ type: 'minute', value: 5 }, async () => {})

      const schedules = await (doInstance as any).getSchedules()
      expect(schedules.some((s: any) => s.type === 'minute' && s.value === 5)).toBe(true)
    })

    it('should register cron schedule', async () => {
      ;(doInstance as any).registerSchedule(
        { type: 'cron', expression: '0 0 * * *' },
        async () => {}
      )

      const schedules = await (doInstance as any).getSchedules()
      expect(schedules.some((s: any) => s.type === 'cron' && s.expression === '0 0 * * *')).toBe(
        true
      )
    })

    it('should register daily schedule', async () => {
      ;(doInstance as any).registerSchedule({ type: 'day' }, async () => {})

      const schedules = await (doInstance as any).getSchedules()
      expect(schedules.some((s: any) => s.type === 'day')).toBe(true)
    })

    it('should register weekly schedule', async () => {
      ;(doInstance as any).registerSchedule({ type: 'week' }, async () => {})

      const schedules = await (doInstance as any).getSchedules()
      expect(schedules.some((s: any) => s.type === 'week')).toBe(true)
    })
  })

  describe('Workflow History Entries', () => {
    let doInstance: DO
    let $: WorkflowContext

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
      $ = await (doInstance as any).createWorkflowContext()
    })

    it('should track event history entries', async () => {
      await $.send('Test.event', { data: 'test' })

      const state = $.getState()
      const eventEntry = state.history.find((h: WorkflowHistoryEntry) => h.type === 'event')
      expect(eventEntry).toBeDefined()
      expect(eventEntry?.name).toBe('Test.event')
    })

    it('should track action history entries', async () => {
      ;(doInstance as any).registerWorkflowHandler('Test.action', async () => 'done')

      await $.do('Test.action', {})

      const state = $.getState()
      const actionEntry = state.history.find((h: WorkflowHistoryEntry) => h.type === 'action')
      expect(actionEntry).toBeDefined()
      expect(actionEntry?.name).toBe('Test.action')
    })

    it('should track schedule history entries', async () => {
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

    it('should track transition history entries', async () => {
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

    it('should include timestamp in all history entries', async () => {
      await $.send('Timestamped.event', {})
      $.log('Timestamped log')

      const state = $.getState()
      for (const entry of state.history) {
        expect(entry.timestamp).toBeDefined()
        expect(typeof entry.timestamp).toBe('number')
      }
    })

    it('should preserve history order', async () => {
      ;(doInstance as any).registerWorkflowHandler('Action.one', async () => 'one')
      ;(doInstance as any).registerWorkflowHandler('Action.two', async () => 'two')

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

  describe('WorkflowContext Integration', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should work with DO database operations via $.db', async () => {
      const $ = await (doInstance as any).createWorkflowContext()

      // WorkflowContext should have access to db operations
      expect($.db).toBeDefined()
    })

    it('should handle complex workflow scenarios', async () => {
      ;(doInstance as any).registerWorkflowHandler('Order.validate', async (data: any) => {
        return { valid: data.amount > 0 }
      })

      ;(doInstance as any).registerWorkflowHandler('Order.process', async (data: any) => {
        return { processed: true, orderId: data.orderId }
      })

      const $ = await (doInstance as any).createWorkflowContext()

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

    it('should support error handling in workflows', async () => {
      ;(doInstance as any).registerWorkflowHandler('Risky.action', async () => {
        throw new Error('Action failed')
      })

      const $ = await (doInstance as any).createWorkflowContext()

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

  describe('allowedMethods includes workflow operations', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should include createWorkflowContext in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('createWorkflowContext')).toBe(true)
    })

    it('should include getWorkflowState in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('getWorkflowState')).toBe(true)
    })

    it('should include saveWorkflowState in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('saveWorkflowState')).toBe(true)
    })

    it('should include registerWorkflowHandler in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('registerWorkflowHandler')).toBe(true)
    })

    it('should include registerSchedule in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('registerSchedule')).toBe(true)
    })

    it('should include getWorkflowHandlers in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('getWorkflowHandlers')).toBe(true)
    })

    it('should include getSchedules in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('getSchedules')).toBe(true)
    })
  })
})
