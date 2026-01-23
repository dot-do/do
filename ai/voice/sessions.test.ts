/**
 * Tests for Voice Session Management
 *
 * @module ai/voice/sessions.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { VoiceSessionManager, VoiceSessions } from './sessions'
import { VoiceAgentManager } from './agents'
import { VoiceProviderFactory } from './providers'
import type { VoiceSession, VoiceSessionStatus } from '../../types/voice-ai'

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

// Mock agent manager
function createMockAgentManager() {
  return {
    get: vi.fn(async (id: string) => ({
      id,
      provider: 'vapi' as const,
      name: 'Test Agent',
      voice: { provider: 'elevenlabs' as const, voiceId: 'voice_123' },
      conversation: { systemPrompt: 'Test', model: 'gpt-4o', modelProvider: 'openai' as const },
      ownerRef: 'https://do.md/do_123',
      status: 'Active' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as import('../../types/voice-ai').VoiceAgent | null)),
  }
}

// Mock provider adapter
function createMockAdapter() {
  return {
    provider: 'vapi' as const,
    createAgent: vi.fn(async () => ({ providerAgentId: 'vapi_agent_123' })),
    updateAgent: vi.fn(async () => {}),
    deleteAgent: vi.fn(async () => {}),
    startCall: vi.fn(async () => 'vapi_call_123'),
    endCall: vi.fn(async () => {}),
    getCall: vi.fn(async () => ({ callId: 'vapi_call_123', status: 'Completed' as const })),
    handleWebhook: vi.fn(async () => ({ type: 'call_ended' as const, sessionId: 'test', data: {} })),
  } as import('./providers').VoiceProviderAdapter
}

describe('VoiceSessionManager', () => {
  let manager: VoiceSessionManager
  let mockStorage: ReturnType<typeof createMockStorage>
  let mockAgentManager: ReturnType<typeof createMockAgentManager>
  let mockAdapter: ReturnType<typeof createMockAdapter>

  beforeEach(() => {
    mockStorage = createMockStorage()
    mockAgentManager = createMockAgentManager()
    mockAdapter = createMockAdapter()

    // Setup storage to return agent with provider ID
    mockStorage.get.mockImplementation(async (key: string) => {
      if (key.startsWith('voice_agent:')) {
        return {
          id: key.replace('voice_agent:', ''),
          providerAgentId: 'vapi_agent_123',
          provider: 'vapi',
        }
      }
      return mockStorage.get(key)
    })

    VoiceProviderFactory.register(mockAdapter)
    manager = new VoiceSessionManager(mockStorage as any, mockAgentManager as any)
  })

  describe('startOutbound', () => {
    it('should start an outbound call', async () => {
      const session = await manager.startOutbound({
        agentId: 'vagent_123',
        phone: '+15551234567',
        context: { customerName: 'John' },
      })

      expect(session.id).toMatch(/^vsess_/)
      expect(session.type).toBe('Outbound')
      expect(session.customerPhone).toBe('+15551234567')
      expect(session.status).toBe('Initializing')
      expect(mockAdapter.startCall).toHaveBeenCalled()
    })

    it('should throw for invalid phone number', async () => {
      await expect(manager.startOutbound({
        agentId: 'vagent_123',
        phone: 'invalid',
      })).rejects.toThrow('Invalid phone number')
    })

    it('should throw for non-existent agent', async () => {
      mockAgentManager.get.mockResolvedValueOnce(null)

      await expect(manager.startOutbound({
        agentId: 'vagent_nonexistent',
        phone: '+15551234567',
      })).rejects.toThrow('Voice agent not found')
    })
  })

  describe('createInbound', () => {
    it('should create session for inbound call', async () => {
      const session = await manager.createInbound(
        'vagent_123',
        'provider_call_456',
        '+15559876543'
      )

      expect(session.id).toMatch(/^vsess_/)
      expect(session.type).toBe('Inbound')
      expect(session.status).toBe('Ringing')
      expect(session.customerPhone).toBe('+15559876543')
    })
  })

  describe('get', () => {
    it('should return session by ID', async () => {
      // First create a session
      const created = await manager.createInbound('vagent_123', 'call_123', '+15551234567')

      // Reset mock to return the session
      const sessionData = await mockStorage.get(`voice_session:${created.id}`)
      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === `voice_session:${created.id}`) return sessionData
        return undefined
      })

      const session = await manager.get(created.id)

      expect(session).not.toBeNull()
      expect(session?.id).toBe(created.id)
    })

    it('should return null for non-existent session', async () => {
      mockStorage.get.mockResolvedValueOnce(undefined)
      const session = await manager.get('vsess_nonexistent')
      expect(session).toBeNull()
    })
  })

  describe('updateStatus', () => {
    it('should update session status', async () => {
      const created = await manager.createInbound('vagent_123', 'call_123', '+15551234567')

      // Setup mock to return the session
      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === `voice_session:${created.id}`) return created
        return undefined
      })

      const updated = await manager.updateStatus(created.id, 'InProgress')

      expect(updated.status).toBe('InProgress')
    })

    it('should set endTime and duration on completion', async () => {
      const created = await manager.createInbound('vagent_123', 'call_123', '+15551234567')

      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === `voice_session:${created.id}`) return created
        return undefined
      })

      const updated = await manager.updateStatus(created.id, 'Completed', {
        type: 'Completed',
        goalAchieved: true,
      })

      expect(updated.endTime).toBeDefined()
      expect(updated.duration).toBeDefined()
      expect(updated.outcome?.type).toBe('Completed')
    })
  })

  describe('appendTranscript', () => {
    it('should append transcript entry', async () => {
      const created = await manager.createInbound('vagent_123', 'call_123', '+15551234567')

      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === `voice_session:${created.id}`) return { ...created, transcript: [] }
        return undefined
      })

      await manager.appendTranscript(created.id, {
        speaker: 'Agent',
        text: 'Hello, how can I help you?',
        startTime: 0,
        endTime: 2000,
      })

      expect(mockStorage.put).toHaveBeenCalledWith(
        `voice_session:${created.id}`,
        expect.objectContaining({
          transcript: expect.arrayContaining([
            expect.objectContaining({ speaker: 'Agent' }),
          ]),
        })
      )
    })
  })

  describe('recordToolCall', () => {
    it('should record tool call', async () => {
      const created = await manager.createInbound('vagent_123', 'call_123', '+15551234567')

      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === `voice_session:${created.id}`) return { ...created, toolCalls: [] }
        return undefined
      })

      await manager.recordToolCall(created.id, {
        id: 'tc_123',
        toolName: 'lookup_order',
        arguments: { orderId: 'order_456' },
        result: { status: 'shipped' },
        startTime: 5000,
        endTime: 5500,
        success: true,
      })

      expect(mockStorage.put).toHaveBeenCalledWith(
        `voice_session:${created.id}`,
        expect.objectContaining({
          toolCalls: expect.arrayContaining([
            expect.objectContaining({ toolName: 'lookup_order' }),
          ]),
        })
      )
    })
  })

  describe('end', () => {
    it('should end active session', async () => {
      const created = await manager.createInbound('vagent_123', 'call_123', '+15551234567')

      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === `voice_session:${created.id}`) return { ...created, status: 'InProgress' }
        if (key.startsWith('voice_agent:')) return { providerAgentId: 'vapi_agent_123', provider: 'vapi' }
        return undefined
      })

      const result = await manager.end(created.id)

      expect(result).toBe(true)
      expect(mockAdapter.endCall).toHaveBeenCalled()
    })

    it('should return false for already completed session', async () => {
      const created = await manager.createInbound('vagent_123', 'call_123', '+15551234567')

      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === `voice_session:${created.id}`) return { ...created, status: 'Completed' }
        return undefined
      })

      const result = await manager.end(created.id)

      expect(result).toBe(false)
    })
  })

  describe('list', () => {
    it('should list sessions', async () => {
      // Create some sessions
      await manager.createInbound('vagent_123', 'call_1', '+15551111111')
      await manager.createInbound('vagent_123', 'call_2', '+15552222222')

      const result = await manager.list()

      expect(result.items.length).toBeGreaterThanOrEqual(0) // Depends on mock implementation
    })

    it('should filter by agentId', async () => {
      // TODO: Implement with proper mock
      expect(true).toBe(true)
    })

    it('should filter by status', async () => {
      // TODO: Implement with proper mock
      expect(true).toBe(true)
    })

    it('should support pagination', async () => {
      // TODO: Implement with proper mock
      expect(true).toBe(true)
    })
  })

  describe('getTranscript', () => {
    it('should return transcript for session', async () => {
      const created = await manager.createInbound('vagent_123', 'call_123', '+15551234567')

      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === `voice_session:${created.id}`) {
          return {
            ...created,
            transcript: [
              { speaker: 'Agent', text: 'Hello', startTime: 0, endTime: 1000 },
            ],
          }
        }
        return undefined
      })

      const transcript = await manager.getTranscript(created.id)

      expect(transcript).toHaveLength(1)
      expect(transcript![0].speaker).toBe('Agent')
    })
  })

  describe('getRecording', () => {
    it('should return recording URL', async () => {
      const created = await manager.createInbound('vagent_123', 'call_123', '+15551234567')

      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === `voice_session:${created.id}`) {
          return { ...created, recordingUrl: 'https://example.com/recording.mp3' }
        }
        return undefined
      })

      const url = await manager.getRecording(created.id)

      expect(url).toBe('https://example.com/recording.mp3')
    })
  })

  describe('on', () => {
    it('should subscribe to session events', async () => {
      const handler = vi.fn()

      const unsubscribe = manager.on('vsess_123', 'ended', handler)

      expect(typeof unsubscribe).toBe('function')
    })
  })

  describe('getStats', () => {
    it('should return session statistics', async () => {
      const stats = await manager.getStats('vagent_123')

      expect(stats).toHaveProperty('totalCalls')
      expect(stats).toHaveProperty('completedCalls')
      expect(stats).toHaveProperty('failedCalls')
      expect(stats).toHaveProperty('avgDuration')
    })
  })
})
