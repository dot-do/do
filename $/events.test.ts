/**
 * Tests for Event Context
 *
 * @module context/__tests__/events
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createOnContext, EventRegistry } from './events'
import type { OnContext, DOContext } from '../types/context'

describe('EventRegistry', () => {
  let registry: EventRegistry

  beforeEach(() => {
    registry = new EventRegistry()
  })

  describe('register', () => {
    it('should register a handler', () => {
      const handler = vi.fn()
      registry.register('Customer.created', handler)

      const handlers = registry.getHandlers('Customer.created')
      expect(handlers.length).toBe(1)
    })

    it('should register multiple handlers for same event', () => {
      registry.register('Customer.created', vi.fn())
      registry.register('Customer.created', vi.fn())

      const handlers = registry.getHandlers('Customer.created')
      expect(handlers.length).toBe(2)
    })
  })

  describe('emit', () => {
    it('should call registered handlers', async () => {
      const handler = vi.fn()
      registry.register('Customer.created', handler)

      const mockContext = { $id: 'test' } as DOContext
      await registry.emit('Customer.created', { id: '123' }, mockContext)

      expect(handler).toHaveBeenCalledWith({ id: '123' }, mockContext)
    })

    it('should call multiple handlers', async () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      registry.register('Customer.created', handler1)
      registry.register('Customer.created', handler2)

      const mockContext = { $id: 'test' } as DOContext
      await registry.emit('Customer.created', { id: '123' }, mockContext)

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })

    it('should not throw if no handlers registered', async () => {
      const mockContext = { $id: 'test' } as DOContext
      await expect(
        registry.emit('Unknown.event', {}, mockContext)
      ).resolves.not.toThrow()
    })

    it('should handle handler errors gracefully', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Handler error'))
      const successHandler = vi.fn()

      registry.register('Customer.created', errorHandler)
      registry.register('Customer.created', successHandler)

      const mockContext = { $id: 'test' } as DOContext
      await expect(
        registry.emit('Customer.created', { id: '123' }, mockContext)
      ).resolves.not.toThrow()

      expect(successHandler).toHaveBeenCalled()
    })
  })

  describe('getEvents', () => {
    it('should return all registered event names', () => {
      registry.register('Customer.created', vi.fn())
      registry.register('Order.placed', vi.fn())

      const events = registry.getEvents()
      expect(events).toContain('Customer.created')
      expect(events).toContain('Order.placed')
    })
  })

  describe('unregister', () => {
    it('should remove all handlers for an event', () => {
      registry.register('Customer.created', vi.fn())
      registry.register('Customer.created', vi.fn())

      registry.unregister('Customer.created')

      const handlers = registry.getHandlers('Customer.created')
      expect(handlers.length).toBe(0)
    })
  })

  describe('clear', () => {
    it('should remove all handlers', () => {
      registry.register('Customer.created', vi.fn())
      registry.register('Order.placed', vi.fn())

      registry.clear()

      expect(registry.getEvents().length).toBe(0)
    })
  })
})

describe('OnContext', () => {
  let on: OnContext
  let registry: EventRegistry

  beforeEach(() => {
    registry = new EventRegistry()
    on = createOnContext(registry)
  })

  describe('Noun.verb access pattern', () => {
    it('should allow noun property access', () => {
      expect(on.Customer).toBeDefined()
    })

    it('should allow verb property access', () => {
      expect(on.Customer.created).toBeDefined()
    })

    it('should return a function for registration', () => {
      expect(typeof on.Customer.created).toBe('function')
    })
  })

  describe('Handler registration', () => {
    it('should register a handler via $.on.Noun.verb()', () => {
      const handler = vi.fn()
      on.Customer.created(handler)

      const handlers = registry.getHandlers('Customer.created')
      expect(handlers.length).toBe(1)
    })

    it('should support various event types', () => {
      on.Customer.created(vi.fn())
      on.Order.placed(vi.fn())
      on.Payment.received(vi.fn())
      on.Subscription.canceled(vi.fn())

      expect(registry.getEvents()).toContain('Customer.created')
      expect(registry.getEvents()).toContain('Order.placed')
      expect(registry.getEvents()).toContain('Payment.received')
      expect(registry.getEvents()).toContain('Subscription.canceled')
    })
  })

  describe('Integration with registry', () => {
    it('should emit events to registered handlers', async () => {
      const handler = vi.fn()
      on.Customer.created(handler)

      const mockContext = { $id: 'test' } as DOContext
      await registry.emit('Customer.created', { name: 'Acme' }, mockContext)

      expect(handler).toHaveBeenCalledWith({ name: 'Acme' }, mockContext)
    })
  })
})
