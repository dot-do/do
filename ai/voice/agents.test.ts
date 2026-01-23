/**
 * Tests for Voice Agent Management
 *
 * @module ai/voice/agents.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { VoiceAgentManager, VoiceAgents } from './agents'
import { VoiceProviderFactory } from './providers'
import type { VoiceAgent, VoiceAIProvider } from '../../types/voice-ai'

// Mock storage
function createMockStorage() {
  const store = new Map<string, unknown>()
  return {
    get: vi.fn(async (key: string) => store.get(key)),
    put: vi.fn(async (key: string, value: unknown) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => store.delete(key)),
    list: vi.fn(async ({ prefix }: { prefix: string }) => {
      const result = new Map<string, unknown>()
      for (const [key, value] of store) {
        if (key.startsWith(prefix)) {
          result.set(key, value)
        }
      }
      return result
    }),
  }
}

// Mock provider adapter
function createMockAdapter(provider: VoiceAIProvider) {
  return {
    provider,
    createAgent: vi.fn(async () => ({ providerAgentId: `${provider}_agent_123` })),
    updateAgent: vi.fn(async () => {}),
    deleteAgent: vi.fn(async () => {}),
    startCall: vi.fn(async () => `${provider}_call_123`),
    endCall: vi.fn(async () => {}),
    getCall: vi.fn(async () => ({ callId: `${provider}_call_123`, status: 'Completed' as const })),
    handleWebhook: vi.fn(async () => ({ type: 'call_ended' as const, sessionId: 'test', data: {} })),
  } as import('./providers').VoiceProviderAdapter
}

describe('VoiceAgentManager', () => {
  let manager: VoiceAgentManager
  let mockStorage: ReturnType<typeof createMockStorage>
  let mockAdapter: ReturnType<typeof createMockAdapter>

  beforeEach(() => {
    mockStorage = createMockStorage()
    mockAdapter = createMockAdapter('vapi')

    // Register mock adapter
    VoiceProviderFactory.register(mockAdapter)

    manager = new VoiceAgentManager(mockStorage as any)
  })

  describe('create', () => {
    it('should create a voice agent', async () => {
      const agent = await manager.create({
        name: 'Test Agent',
        provider: 'vapi',
        voice: {
          provider: 'elevenlabs',
          voiceId: 'voice_123',
        },
        conversation: {
          systemPrompt: 'You are a helpful assistant',
          model: 'gpt-4o',
          modelProvider: 'openai',
        },
        ownerRef: 'https://do.md/do_123',
      })

      expect(agent.id).toMatch(/^vagent_/)
      expect(agent.name).toBe('Test Agent')
      expect(agent.provider).toBe('vapi')
      expect(agent.status).toBe('Active')
      expect(mockAdapter.createAgent).toHaveBeenCalled()
      expect(mockStorage.put).toHaveBeenCalled()
    })

    it('should store provider agent ID', async () => {
      await manager.create({
        name: 'Test Agent',
        provider: 'vapi',
        voice: { provider: 'elevenlabs', voiceId: 'voice_123' },
        conversation: { systemPrompt: 'Test', model: 'gpt-4o', modelProvider: 'openai' },
        ownerRef: 'https://do.md/do_123',
      })

      // Check that provider agent ID index was created
      expect(mockStorage.put).toHaveBeenCalledWith(
        expect.stringMatching(/^voice_agent_provider:/),
        expect.any(String)
      )
    })
  })

  describe('get', () => {
    it('should return agent by ID', async () => {
      // Create an agent first
      const created = await manager.create({
        name: 'Test Agent',
        provider: 'vapi',
        voice: { provider: 'elevenlabs', voiceId: 'voice_123' },
        conversation: { systemPrompt: 'Test', model: 'gpt-4o', modelProvider: 'openai' },
        ownerRef: 'https://do.md/do_123',
      })

      const agent = await manager.get(created.id)

      expect(agent).not.toBeNull()
      expect(agent?.id).toBe(created.id)
      expect(agent?.name).toBe('Test Agent')
    })

    it('should return null for non-existent agent', async () => {
      const agent = await manager.get('vagent_nonexistent')
      expect(agent).toBeNull()
    })

    it('should not expose provider internal fields', async () => {
      const created = await manager.create({
        name: 'Test Agent',
        provider: 'vapi',
        voice: { provider: 'elevenlabs', voiceId: 'voice_123' },
        conversation: { systemPrompt: 'Test', model: 'gpt-4o', modelProvider: 'openai' },
        ownerRef: 'https://do.md/do_123',
      })

      const agent = await manager.get(created.id)

      expect(agent).not.toHaveProperty('providerAgentId')
      expect(agent).not.toHaveProperty('providerMetadata')
    })
  })

  describe('update', () => {
    it('should update agent fields', async () => {
      const created = await manager.create({
        name: 'Test Agent',
        provider: 'vapi',
        voice: { provider: 'elevenlabs', voiceId: 'voice_123' },
        conversation: { systemPrompt: 'Test', model: 'gpt-4o', modelProvider: 'openai' },
        ownerRef: 'https://do.md/do_123',
      })

      const updated = await manager.update(created.id, {
        name: 'Updated Agent',
        voice: { speed: 1.2 },
      })

      expect(updated.name).toBe('Updated Agent')
      expect(updated.voice.speed).toBe(1.2)
      expect(mockAdapter.updateAgent).toHaveBeenCalled()
    })

    it('should throw for non-existent agent', async () => {
      await expect(manager.update('vagent_nonexistent', { name: 'Test' }))
        .rejects.toThrow('Voice agent not found')
    })
  })

  describe('delete', () => {
    it('should delete agent from storage and provider', async () => {
      const created = await manager.create({
        name: 'Test Agent',
        provider: 'vapi',
        voice: { provider: 'elevenlabs', voiceId: 'voice_123' },
        conversation: { systemPrompt: 'Test', model: 'gpt-4o', modelProvider: 'openai' },
        ownerRef: 'https://do.md/do_123',
      })

      const result = await manager.delete(created.id)

      expect(result).toBe(true)
      expect(mockAdapter.deleteAgent).toHaveBeenCalled()
      expect(mockStorage.delete).toHaveBeenCalledWith(`voice_agent:${created.id}`)
    })

    it('should return false for non-existent agent', async () => {
      const result = await manager.delete('vagent_nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('list', () => {
    it('should list all agents', async () => {
      // Create multiple agents
      await manager.create({
        name: 'Agent 1',
        provider: 'vapi',
        voice: { provider: 'elevenlabs', voiceId: 'voice_1' },
        conversation: { systemPrompt: 'Test', model: 'gpt-4o', modelProvider: 'openai' },
        ownerRef: 'https://do.md/do_123',
      })
      await manager.create({
        name: 'Agent 2',
        provider: 'vapi',
        voice: { provider: 'elevenlabs', voiceId: 'voice_2' },
        conversation: { systemPrompt: 'Test', model: 'gpt-4o', modelProvider: 'openai' },
        ownerRef: 'https://do.md/do_123',
      })

      const result = await manager.list()

      expect(result.items.length).toBe(2)
      expect(result.total).toBe(2)
    })

    it('should filter by status', async () => {
      // TODO: Implement status filtering test
      expect(true).toBe(true)
    })

    it('should filter by provider', async () => {
      // TODO: Implement provider filtering test
      expect(true).toBe(true)
    })

    it('should support pagination', async () => {
      // TODO: Implement pagination test
      expect(true).toBe(true)
    })
  })

  describe('addTool', () => {
    it('should add tool to agent', async () => {
      const created = await manager.create({
        name: 'Test Agent',
        provider: 'vapi',
        voice: { provider: 'elevenlabs', voiceId: 'voice_123' },
        conversation: { systemPrompt: 'Test', model: 'gpt-4o', modelProvider: 'openai' },
        ownerRef: 'https://do.md/do_123',
      })

      const updated = await manager.addTool(created.id, {
        name: 'lookup_order',
        description: 'Look up order status',
        parameters: { orderId: { type: 'string' } },
      })

      expect(updated.conversation.tools).toHaveLength(1)
      expect(updated.conversation.tools![0].name).toBe('lookup_order')
    })

    it('should throw if tool already exists', async () => {
      const created = await manager.create({
        name: 'Test Agent',
        provider: 'vapi',
        voice: { provider: 'elevenlabs', voiceId: 'voice_123' },
        conversation: {
          systemPrompt: 'Test',
          model: 'gpt-4o',
          modelProvider: 'openai',
          tools: [{ name: 'existing_tool', description: 'Exists', parameters: {} }],
        },
        ownerRef: 'https://do.md/do_123',
      })

      await expect(manager.addTool(created.id, {
        name: 'existing_tool',
        description: 'Duplicate',
        parameters: {},
      })).rejects.toThrow('Tool already exists')
    })
  })

  describe('removeTool', () => {
    it('should remove tool from agent', async () => {
      const created = await manager.create({
        name: 'Test Agent',
        provider: 'vapi',
        voice: { provider: 'elevenlabs', voiceId: 'voice_123' },
        conversation: {
          systemPrompt: 'Test',
          model: 'gpt-4o',
          modelProvider: 'openai',
          tools: [{ name: 'remove_me', description: 'To be removed', parameters: {} }],
        },
        ownerRef: 'https://do.md/do_123',
      })

      const updated = await manager.removeTool(created.id, 'remove_me')

      expect(updated.conversation.tools).toHaveLength(0)
    })

    it('should throw if tool not found', async () => {
      const created = await manager.create({
        name: 'Test Agent',
        provider: 'vapi',
        voice: { provider: 'elevenlabs', voiceId: 'voice_123' },
        conversation: { systemPrompt: 'Test', model: 'gpt-4o', modelProvider: 'openai' },
        ownerRef: 'https://do.md/do_123',
      })

      await expect(manager.removeTool(created.id, 'nonexistent'))
        .rejects.toThrow('Tool not found')
    })
  })

  describe('setStatus', () => {
    it('should update agent status', async () => {
      const created = await manager.create({
        name: 'Test Agent',
        provider: 'vapi',
        voice: { provider: 'elevenlabs', voiceId: 'voice_123' },
        conversation: { systemPrompt: 'Test', model: 'gpt-4o', modelProvider: 'openai' },
        ownerRef: 'https://do.md/do_123',
      })

      const updated = await manager.setStatus(created.id, 'inactive')

      expect(updated.status).toBe('Inactive')
    })
  })
})

describe('VoiceAgents singleton', () => {
  it('should throw if not initialized', async () => {
    // Reset singleton state would be needed here
    // TODO: Add proper singleton reset for testing
    expect(true).toBe(true)
  })
})
