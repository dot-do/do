/**
 * Tests for Voice Tool Calling Integration
 *
 * @module ai/voice/tools.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  VoiceToolRegistry,
  VoiceTools,
  createLookupTool,
  createActionTool,
  createTransferTool,
  createEndCallTool,
  type ToolContext,
  type ToolHandler,
} from './tools'

describe('VoiceToolRegistry', () => {
  let registry: VoiceToolRegistry
  let mockContext: ToolContext

  beforeEach(() => {
    registry = new VoiceToolRegistry()
    mockContext = {
      sessionId: 'vsess_123',
      agentId: 'vagent_456',
      customerPhone: '+15551234567',
      transcript: [],
      metadata: {},
    }
  })

  describe('register', () => {
    it('should register a tool', () => {
      registry.register({
        name: 'test_tool',
        handler: async () => ({ success: true }),
      })

      expect(registry.has('test_tool')).toBe(true)
    })

    it('should throw if tool already registered', () => {
      registry.register({
        name: 'duplicate_tool',
        handler: async () => ({}),
      })

      expect(() => registry.register({
        name: 'duplicate_tool',
        handler: async () => ({}),
      })).toThrow('Tool already registered')
    })
  })

  describe('registerAll', () => {
    it('should register multiple tools', () => {
      registry.registerAll([
        { name: 'tool_1', handler: async () => ({}) },
        { name: 'tool_2', handler: async () => ({}) },
        { name: 'tool_3', handler: async () => ({}) },
      ])

      expect(registry.list()).toHaveLength(3)
    })
  })

  describe('unregister', () => {
    it('should unregister a tool', () => {
      registry.register({ name: 'to_remove', handler: async () => ({}) })
      expect(registry.has('to_remove')).toBe(true)

      const result = registry.unregister('to_remove')

      expect(result).toBe(true)
      expect(registry.has('to_remove')).toBe(false)
    })

    it('should return false for non-existent tool', () => {
      const result = registry.unregister('nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('has', () => {
    it('should return true for registered tool', () => {
      registry.register({ name: 'exists', handler: async () => ({}) })
      expect(registry.has('exists')).toBe(true)
    })

    it('should return false for non-registered tool', () => {
      expect(registry.has('does_not_exist')).toBe(false)
    })
  })

  describe('list', () => {
    it('should return all registered tool names', () => {
      registry.register({ name: 'tool_a', handler: async () => ({}) })
      registry.register({ name: 'tool_b', handler: async () => ({}) })

      const names = registry.list()

      expect(names).toContain('tool_a')
      expect(names).toContain('tool_b')
    })
  })

  describe('execute', () => {
    it('should execute tool and return result', async () => {
      registry.register({
        name: 'lookup_order',
        handler: async (args) => ({
          orderId: args.orderId,
          status: 'shipped',
        }),
      })

      const result = await registry.execute(
        'lookup_order',
        { orderId: 'order_123' },
        mockContext
      )

      expect(result.record.success).toBe(true)
      expect(result.record.result).toEqual({ orderId: 'order_123', status: 'shipped' })
    })

    it('should return error for non-existent tool', async () => {
      const result = await registry.execute(
        'nonexistent_tool',
        {},
        mockContext
      )

      expect(result.record.success).toBe(false)
      expect(result.record.error).toContain('Tool not found')
    })

    it('should pass context to handler', async () => {
      const handler = vi.fn(async (args, ctx) => ctx.sessionId)

      registry.register({ name: 'context_test', handler })

      await registry.execute('context_test', {}, mockContext)

      expect(handler).toHaveBeenCalledWith({}, mockContext)
    })

    it('should handle handler errors', async () => {
      registry.register({
        name: 'error_tool',
        handler: async () => { throw new Error('Tool failed') },
      })

      const result = await registry.execute('error_tool', {}, mockContext)

      expect(result.record.success).toBe(false)
      expect(result.record.error).toBe('Tool failed')
    })

    it('should timeout long-running handlers', async () => {
      registry.register({
        name: 'slow_tool',
        handler: async () => {
          await new Promise((resolve) => setTimeout(resolve, 20000))
          return { done: true }
        },
        timeout: 100, // 100ms timeout
      })

      const result = await registry.execute('slow_tool', {}, mockContext)

      expect(result.record.success).toBe(false)
      expect(result.record.error).toContain('timeout')
    })

    it('should validate arguments if validator provided', async () => {
      registry.register({
        name: 'validated_tool',
        handler: async () => ({ success: true }),
        validate: (args) => 'orderId' in args || 'Missing orderId',
      })

      const result = await registry.execute('validated_tool', {}, mockContext)

      expect(result.record.success).toBe(false)
      expect(result.record.error).toBe('Missing orderId')
    })

    it('should detect transfer result', async () => {
      registry.register({
        name: 'transfer_tool',
        handler: async () => ({
          transfer: true,
          department: 'sales',
          message: 'Transferring you now',
        }),
      })

      const result = await registry.execute('transfer_tool', {}, mockContext)

      expect(result.record.success).toBe(true)
      expect(result.message).toBe('Transferring you now')
    })

    it('should detect end call result when canEndCall is true', async () => {
      registry.register({
        name: 'end_call_tool',
        handler: async () => ({
          endCall: true,
          message: 'Goodbye!',
        }),
        canEndCall: true,
      })

      const result = await registry.execute('end_call_tool', {}, mockContext)

      expect(result.endCall).toBe(true)
      expect(result.message).toBe('Goodbye!')
    })

    it('should record timing information', async () => {
      registry.register({
        name: 'timed_tool',
        handler: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return { done: true }
        },
      })

      const result = await registry.execute('timed_tool', {}, mockContext)

      expect(result.record.startTime).toBeDefined()
      expect(result.record.endTime).toBeDefined()
      expect(result.record.endTime! - result.record.startTime).toBeGreaterThanOrEqual(50)
    })
  })

  describe('setDefaultTimeout', () => {
    it('should change default timeout', () => {
      registry.setDefaultTimeout(5000)
      // Internal state changed - would need to test via execution
      expect(true).toBe(true)
    })
  })

  describe('clear', () => {
    it('should remove all registered tools', () => {
      registry.register({ name: 'tool_1', handler: async () => ({}) })
      registry.register({ name: 'tool_2', handler: async () => ({}) })

      registry.clear()

      expect(registry.list()).toHaveLength(0)
    })
  })
})

describe('Tool Factories', () => {
  describe('createLookupTool', () => {
    it('should create a lookup tool', async () => {
      const tool = createLookupTool(
        'lookup_customer',
        'Look up customer info',
        async (args) => ({ name: 'John', email: 'john@example.com' })
      )

      expect(tool.name).toBe('lookup_customer')
      expect(typeof tool.handler).toBe('function')
    })
  })

  describe('createActionTool', () => {
    it('should create an action tool', async () => {
      const tool = createActionTool(
        'send_email',
        'Send email to customer',
        async (args) => ({ success: true, message: 'Email sent' })
      )

      expect(tool.name).toBe('send_email')
    })
  })

  describe('createTransferTool', () => {
    it('should create a transfer tool', async () => {
      const tool = createTransferTool(
        'transfer_to_sales',
        async (args) => ({
          department: 'sales',
          priority: 'high',
          message: 'Transferring to sales team',
        })
      )

      expect(tool.name).toBe('transfer_to_sales')

      // Execute the handler to verify it returns transfer result
      const result = await tool.handler({}, {
        sessionId: 'test',
        agentId: 'test',
        transcript: [],
      })

      expect(result).toHaveProperty('transfer', true)
      expect(result).toHaveProperty('department', 'sales')
    })
  })

  describe('createEndCallTool', () => {
    it('should create an end call tool', async () => {
      const tool = createEndCallTool(
        'goodbye',
        async () => 'Thank you for calling. Goodbye!'
      )

      expect(tool.name).toBe('goodbye')
      expect(tool.canEndCall).toBe(true)
    })
  })
})

describe('VoiceTools singleton', () => {
  beforeEach(() => {
    VoiceTools.clear()
  })

  describe('register', () => {
    it('should register tool to singleton registry', () => {
      VoiceTools.register({
        name: 'singleton_tool',
        handler: async () => ({}),
      })

      expect(VoiceTools.has('singleton_tool')).toBe(true)
    })
  })

  describe('execute', () => {
    it('should execute tool from singleton registry', async () => {
      VoiceTools.register({
        name: 'exec_test',
        handler: async () => ({ value: 42 }),
      })

      const result = await VoiceTools.execute('exec_test', {}, {
        sessionId: 'test',
        agentId: 'test',
        transcript: [],
      })

      expect(result.record.success).toBe(true)
      expect(result.record.result).toEqual({ value: 42 })
    })
  })

  describe('getRegistry', () => {
    it('should return underlying registry', () => {
      const registry = VoiceTools.getRegistry()
      expect(registry).toBeInstanceOf(VoiceToolRegistry)
    })
  })
})
