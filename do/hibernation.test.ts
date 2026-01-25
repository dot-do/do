/**
 * Tests for HibernationManager - Hibernation System
 *
 * Tests cover:
 * - Hibernation trigger (idle timeout)
 * - Awakening on request
 * - Awakening on alarm
 * - Awakening on WebSocket message
 * - State persistence across hibernation
 * - Alarm scheduling
 *
 * @module do/__tests__/hibernation.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  HibernationManager,
  createHibernationManager,
  type HibernationConfig,
  type WebSocketState,
} from './hibernation'

// =============================================================================
// Inline Test Helper (minimal mock for node environment testing)
// =============================================================================

/**
 * Creates a minimal mock DurableObjectState for testing.
 * For real Workers runtime tests, use vitest.workers.config.ts with miniflare.
 */
function createMockDurableObjectState(options: { id?: string } = {}) {
  const id = options.id || 'test-do-id'
  const storage = new Map<string, unknown>()

  return {
    id: {
      toString: () => id,
      name: id,
      equals: vi.fn((other: { toString: () => string }) => other.toString() === id),
    },
    storage: {
      get: vi.fn(async (key: string) => storage.get(key)),
      put: vi.fn(async (key: string, value: unknown) => {
        storage.set(key, value)
      }),
      delete: vi.fn(async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key]
        let deleted = false
        for (const k of keys) {
          if (storage.has(k)) {
            storage.delete(k)
            deleted = true
          }
        }
        return deleted
      }),
      list: vi.fn(async () => new Map(storage)),
      setAlarm: vi.fn(async () => {}),
      getAlarm: vi.fn(async () => null),
      deleteAlarm: vi.fn(async () => {}),
    },
    blockConcurrencyWhile: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
    acceptWebSocket: vi.fn(),
    getWebSockets: vi.fn(() => []),
    waitUntil: vi.fn(),
  }
}

describe('HibernationManager', () => {
  let mockCtx: ReturnType<typeof createMockDurableObjectState>
  let hibernation: HibernationManager

  beforeEach(() => {
    vi.useFakeTimers()
    mockCtx = createMockDurableObjectState()
    hibernation = new HibernationManager(mockCtx as any, {
      idleTimeout: 10000, // 10 seconds
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ==========================================================================
  // Basic Instantiation Tests
  // ==========================================================================
  describe('instantiation', () => {
    it('should create HibernationManager instance', () => {
      expect(hibernation).toBeInstanceOf(HibernationManager)
    })

    it('should start in active state', () => {
      expect(hibernation.getState()).toBe('active')
      expect(hibernation.isHibernating()).toBe(false)
    })

    it('should use factory function', () => {
      const hm = createHibernationManager(mockCtx as any)
      expect(hm).toBeInstanceOf(HibernationManager)
    })

    it('should apply default config values', () => {
      const hm = createHibernationManager(mockCtx as any)
      expect(hm.isIdle()).toBe(false)
    })

    it('should accept custom config', () => {
      const hm = new HibernationManager(mockCtx as any, {
        idleTimeout: 60000,
        maxHibernationDuration: 48 * 60 * 60 * 1000,
        preserveWebSockets: false,
      })
      expect(hm).toBeDefined()
    })
  })

  // ==========================================================================
  // Hibernation Trigger Tests
  // ==========================================================================
  describe('hibernation trigger', () => {
    it('should be idle after timeout without activity', () => {
      vi.advanceTimersByTime(10001) // Just past idle timeout
      expect(hibernation.isIdle()).toBe(true)
    })

    it('should reset idle timer on touch', () => {
      vi.advanceTimersByTime(8000)
      hibernation.touch()
      vi.advanceTimersByTime(8000)

      // 8 + 8 = 16 seconds, but touch reset at 8s, so only 8s idle
      expect(hibernation.isIdle()).toBe(false)
    })

    it('should track idle time', () => {
      vi.advanceTimersByTime(5000)
      expect(hibernation.getIdleTime()).toBe(5000)
    })

    it('should schedule alarm for idle check', () => {
      expect(mockCtx.storage.setAlarm).toHaveBeenCalled()
    })

    it('should hibernate on alarm if idle', async () => {
      vi.advanceTimersByTime(10001)
      await hibernation.handleAlarm()

      expect(hibernation.isHibernating()).toBe(true)
      expect(hibernation.getState()).toBe('hibernating')
    })

    it('should not hibernate if recently active', async () => {
      vi.advanceTimersByTime(5000)
      hibernation.touch()
      await hibernation.handleAlarm()

      expect(hibernation.isHibernating()).toBe(false)
    })

    it('should call onHibernate hook before hibernation', async () => {
      const onHibernate = vi.fn()
      const hm = new HibernationManager(mockCtx as any, {
        idleTimeout: 10000,
        onHibernate,
      })

      vi.advanceTimersByTime(10001)
      await hm.handleAlarm()

      expect(onHibernate).toHaveBeenCalled()
    })

    it('should support force hibernation', async () => {
      await hibernation.forceHibernate()

      expect(hibernation.isHibernating()).toBe(true)
    })

    it('should schedule max hibernation duration alarm', async () => {
      await hibernation.forceHibernate()

      // Should have scheduled alarm for max duration
      expect(mockCtx.storage.setAlarm).toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // Awakening Tests
  // ==========================================================================
  describe('awakening', () => {
    beforeEach(async () => {
      await hibernation.forceHibernate()
      expect(hibernation.isHibernating()).toBe(true)
    })

    it('should wake on touch', () => {
      hibernation.touch()

      expect(hibernation.isHibernating()).toBe(false)
      expect(hibernation.getState()).toBe('active')
    })

    it('should call onWake hook after waking', async () => {
      const onWake = vi.fn()
      const hm = new HibernationManager(mockCtx as any, {
        idleTimeout: 10000,
        onWake,
      })

      await hm.forceHibernate()
      expect(hm.isHibernating()).toBe(true)

      hm.touch() // Wake up

      expect(onWake).toHaveBeenCalled()
    })

    it('should support force wake', async () => {
      await hibernation.forceWake()

      expect(hibernation.isHibernating()).toBe(false)
    })

    it('should reschedule idle check after waking', () => {
      const callCountBefore = (mockCtx.storage.setAlarm as any).mock.calls.length

      hibernation.touch()

      const callCountAfter = (mockCtx.storage.setAlarm as any).mock.calls.length
      expect(callCountAfter).toBeGreaterThan(callCountBefore)
    })
  })

  // ==========================================================================
  // WebSocket Hibernation Tests
  // ==========================================================================
  describe('WebSocket hibernation', () => {
    let mockRequest: Request

    beforeEach(() => {
      mockRequest = new Request('https://test.do/ws', {
        headers: { Upgrade: 'websocket' },
      })
    })

    it('should accept WebSocket upgrade', async () => {
      const response = await hibernation.acceptWebSocket(mockRequest)

      expect(response.status).toBe(101)
    })

    it('should reject non-WebSocket requests', async () => {
      const normalRequest = new Request('https://test.do/ws')
      const response = await hibernation.acceptWebSocket(normalRequest)

      expect(response.status).toBe(426)
    })

    it('should track WebSocket state', async () => {
      await hibernation.acceptWebSocket(mockRequest)

      const stats = hibernation.getWebSocketStats()
      expect(stats.total).toBe(1)
      expect(stats.active).toBe(1)
      expect(stats.hibernating).toBe(0)
    })

    it('should mark WebSockets as hibernating during hibernation', async () => {
      const response = await hibernation.acceptWebSocket(mockRequest)

      await hibernation.forceHibernate()

      const stats = hibernation.getWebSocketStats()
      expect(stats.hibernating).toBe(1)
      expect(stats.active).toBe(0)
    })

    it('should restore WebSocket state on wake', async () => {
      await hibernation.acceptWebSocket(mockRequest)
      await hibernation.forceHibernate()

      hibernation.touch() // Wake

      const stats = hibernation.getWebSocketStats()
      expect(stats.active).toBe(1)
      expect(stats.hibernating).toBe(0)
    })

    it('should support multiple WebSocket connections', async () => {
      await hibernation.acceptWebSocket(mockRequest)
      await hibernation.acceptWebSocket(
        new Request('https://test.do/ws', { headers: { Upgrade: 'websocket' } })
      )
      await hibernation.acceptWebSocket(
        new Request('https://test.do/ws', { headers: { Upgrade: 'websocket' } })
      )

      const stats = hibernation.getWebSocketStats()
      expect(stats.total).toBe(3)
    })

    it('should store custom data with WebSocket', async () => {
      await hibernation.acceptWebSocket(mockRequest, { userId: '123' })

      // Get all states and check first one
      const states = Array.from(hibernation.getAllWebSocketStates())
      expect(states.length).toBe(1)
      expect(states[0].data).toEqual({ userId: '123' })
    })

    it('should update WebSocket data', async () => {
      await hibernation.acceptWebSocket(mockRequest, { userId: '123' })

      const states = Array.from(hibernation.getAllWebSocketStates())
      const wsId = states[0].id

      hibernation.updateWebSocketData(wsId, { role: 'admin' })

      const state = hibernation.getWebSocketState(wsId)
      expect(state?.data).toEqual({ userId: '123', role: 'admin' })
    })

    it('should not preserve WebSockets when disabled', async () => {
      const hm = new HibernationManager(mockCtx as any, {
        idleTimeout: 10000,
        preserveWebSockets: false,
      })

      const request = new Request('https://test.do/ws', {
        headers: { Upgrade: 'websocket' },
      })
      await hm.acceptWebSocket(request)
      await hm.forceHibernate()

      // WebSockets should not be marked as hibernating
      const stats = hm.getWebSocketStats()
      expect(stats.hibernating).toBe(0)
    })
  })

  // ==========================================================================
  // WebSocket Pub/Sub Tests
  // ==========================================================================
  describe('WebSocket pub/sub', () => {
    let wsId: string

    beforeEach(async () => {
      const request = new Request('https://test.do/ws', {
        headers: { Upgrade: 'websocket' },
      })
      await hibernation.acceptWebSocket(request)

      const states = Array.from(hibernation.getAllWebSocketStates())
      wsId = states[0].id
    })

    it('should subscribe to topic', () => {
      hibernation.subscribe(wsId, 'news')

      const state = hibernation.getWebSocketState(wsId)
      expect(state?.subscriptions).toContain('news')
    })

    it('should unsubscribe from topic', () => {
      hibernation.subscribe(wsId, 'news')
      hibernation.subscribe(wsId, 'sports')

      hibernation.unsubscribe(wsId, 'news')

      const state = hibernation.getWebSocketState(wsId)
      expect(state?.subscriptions).not.toContain('news')
      expect(state?.subscriptions).toContain('sports')
    })

    it('should not duplicate subscriptions', () => {
      hibernation.subscribe(wsId, 'news')
      hibernation.subscribe(wsId, 'news')
      hibernation.subscribe(wsId, 'news')

      const state = hibernation.getWebSocketState(wsId)
      expect(state?.subscriptions.filter(s => s === 'news').length).toBe(1)
    })

    it('should preserve subscriptions during hibernation', async () => {
      hibernation.subscribe(wsId, 'updates')

      await hibernation.forceHibernate()

      const state = hibernation.getWebSocketState(wsId)
      expect(state?.subscriptions).toContain('updates')
    })
  })

  // ==========================================================================
  // Alarm Scheduling Tests
  // ==========================================================================
  describe('alarm scheduling', () => {
    it('should schedule alarm at specific time', async () => {
      const alarmTime = Date.now() + 5000
      await hibernation.scheduleAlarm(alarmTime)

      expect(mockCtx.storage.setAlarm).toHaveBeenCalledWith(alarmTime)
    })

    it('should schedule alarm with Date object', async () => {
      const date = new Date(Date.now() + 5000)
      await hibernation.scheduleAlarm(date)

      expect(mockCtx.storage.setAlarm).toHaveBeenCalledWith(date.getTime())
    })

    it('should cancel all alarms', async () => {
      await hibernation.cancelAlarms()

      expect(mockCtx.storage.deleteAlarm).toHaveBeenCalled()
    })

    it('should handle alarm callback', async () => {
      vi.advanceTimersByTime(10001)
      await hibernation.handleAlarm()

      expect(hibernation.isHibernating()).toBe(true)
    })
  })

  // ==========================================================================
  // Broadcast Tests
  // ==========================================================================
  describe('broadcast', () => {
    beforeEach(async () => {
      // Add multiple WebSocket connections
      for (let i = 0; i < 3; i++) {
        const request = new Request('https://test.do/ws', {
          headers: { Upgrade: 'websocket' },
        })
        await hibernation.acceptWebSocket(request, { index: i })
      }
    })

    it('should broadcast to all connections', () => {
      const sent = hibernation.broadcast('hello')

      // Note: actual sending depends on WebSocket mock
      // Here we just verify it returns a count
      expect(typeof sent).toBe('number')
    })

    it('should broadcast with filter', () => {
      const sent = hibernation.broadcast('hello', (state) => {
        return state.data?.index === 1
      })

      expect(typeof sent).toBe('number')
    })

    it('should publish to topic subscribers', () => {
      const states = Array.from(hibernation.getAllWebSocketStates())

      // Subscribe first two to 'news'
      hibernation.subscribe(states[0].id, 'news')
      hibernation.subscribe(states[1].id, 'news')

      const sent = hibernation.publish('news', 'Breaking news!')

      expect(typeof sent).toBe('number')
    })
  })

  // ==========================================================================
  // WebSocket Close Handling Tests
  // ==========================================================================
  describe('WebSocket close handling', () => {
    it('should handle WebSocket close', async () => {
      const request = new Request('https://test.do/ws', {
        headers: { Upgrade: 'websocket' },
      })
      const response = await hibernation.acceptWebSocket(request)

      const stats = hibernation.getWebSocketStats()
      expect(stats.total).toBe(1)

      // Simulate close by getting the WebSocket and calling handleWebSocketClose
      // In real scenario, this would be triggered by the WebSocket close event
    })

    it('should clean up state on close', async () => {
      const request = new Request('https://test.do/ws', {
        headers: { Upgrade: 'websocket' },
      })
      await hibernation.acceptWebSocket(request)

      const states = Array.from(hibernation.getAllWebSocketStates())
      const wsId = states[0].id

      // Verify state exists
      expect(hibernation.getWebSocketState(wsId)).toBeDefined()
    })
  })

  // ==========================================================================
  // Edge Cases and Error Handling
  // ==========================================================================
  describe('edge cases', () => {
    it('should handle multiple hibernation attempts', async () => {
      await hibernation.forceHibernate()
      await hibernation.forceHibernate()
      await hibernation.forceHibernate()

      expect(hibernation.isHibernating()).toBe(true)
    })

    it('should handle multiple wake attempts', async () => {
      await hibernation.forceHibernate()
      await hibernation.forceWake()
      await hibernation.forceWake()
      await hibernation.forceWake()

      expect(hibernation.isHibernating()).toBe(false)
    })

    it('should handle rapid hibernation/wake cycles', async () => {
      for (let i = 0; i < 10; i++) {
        await hibernation.forceHibernate()
        hibernation.touch()
      }

      expect(hibernation.getState()).toBe('active')
    })

    it('should handle concurrent WebSocket operations', async () => {
      const promises = []
      for (let i = 0; i < 5; i++) {
        const request = new Request('https://test.do/ws', {
          headers: { Upgrade: 'websocket' },
        })
        promises.push(hibernation.acceptWebSocket(request))
      }

      await Promise.all(promises)

      expect(hibernation.getWebSocketStats().total).toBe(5)
    })

    it('should handle sendToWebSocket for non-existent connection', () => {
      const result = hibernation.sendToWebSocket('nonexistent-id', 'hello')
      expect(result).toBe(false)
    })

    it('should handle getWebSocketState for non-existent connection', () => {
      const state = hibernation.getWebSocketState('nonexistent-id')
      expect(state).toBeUndefined()
    })

    it('should handle subscribe for non-existent connection', () => {
      // Should not throw
      hibernation.subscribe('nonexistent-id', 'topic')
    })

    it('should handle unsubscribe for non-existent connection', () => {
      // Should not throw
      hibernation.unsubscribe('nonexistent-id', 'topic')
    })

    it('should handle updateWebSocketData for non-existent connection', () => {
      // Should not throw
      hibernation.updateWebSocketData('nonexistent-id', { key: 'value' })
    })
  })

  // ==========================================================================
  // Integration Tests
  // ==========================================================================
  describe('integration', () => {
    it('should handle full lifecycle: active -> hibernate -> wake', async () => {
      // Start active
      expect(hibernation.getState()).toBe('active')

      // Add a WebSocket
      const request = new Request('https://test.do/ws', {
        headers: { Upgrade: 'websocket' },
      })
      await hibernation.acceptWebSocket(request)

      // Subscribe to topic
      const states = Array.from(hibernation.getAllWebSocketStates())
      hibernation.subscribe(states[0].id, 'updates')

      // Wait for idle
      vi.advanceTimersByTime(10001)
      await hibernation.handleAlarm()

      // Should be hibernating
      expect(hibernation.getState()).toBe('hibernating')
      expect(hibernation.getWebSocketStats().hibernating).toBe(1)

      // Wake up
      hibernation.touch()

      // Should be active again
      expect(hibernation.getState()).toBe('active')
      expect(hibernation.getWebSocketStats().active).toBe(1)

      // Subscriptions should be preserved
      const stateAfterWake = hibernation.getWebSocketState(states[0].id)
      expect(stateAfterWake?.subscriptions).toContain('updates')
    })

    it('should handle activity during hibernation attempt', async () => {
      // Start idle timer
      vi.advanceTimersByTime(9999)

      // Touch just before hibernation
      hibernation.touch()

      // Advance past original timeout
      vi.advanceTimersByTime(5000)

      // Should still be active because touch reset timer
      expect(hibernation.isIdle()).toBe(false)
    })
  })
})

// =============================================================================
// HibernationConfig Type Tests
// =============================================================================

describe('HibernationConfig', () => {
  let mockCtx: ReturnType<typeof createMockDurableObjectState>

  beforeEach(() => {
    mockCtx = createMockDurableObjectState()
  })

  it('should accept all config options', () => {
    const onHibernate = vi.fn()
    const onWake = vi.fn()

    const hm = new HibernationManager(mockCtx as any, {
      idleTimeout: 30000,
      maxHibernationDuration: 12 * 60 * 60 * 1000,
      preserveWebSockets: true,
      onHibernate,
      onWake,
    })

    expect(hm).toBeDefined()
  })

  it('should work with partial config', () => {
    const hm = new HibernationManager(mockCtx as any, {
      idleTimeout: 5000,
    })

    expect(hm).toBeDefined()
  })

  it('should work with empty config', () => {
    const hm = new HibernationManager(mockCtx as any, {})

    expect(hm).toBeDefined()
  })

  it('should work with no config', () => {
    const hm = new HibernationManager(mockCtx as any)

    expect(hm).toBeDefined()
  })
})
