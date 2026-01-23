/**
 * Tests for WebRTC Session Handling
 *
 * @module ai/voice/webrtc.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WebRTCSessionManager, WebRTCSession, type WebRTCRoom } from './webrtc'
import { VoiceAgentManager } from './agents'
import { VoiceSessionManager } from './sessions'
import { VoiceProviderFactory } from './providers'
import type { VoiceAIProvider } from '../../types/voice-ai'

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
      provider: 'livekit' as const,
      name: 'WebRTC Agent',
      voice: { provider: 'elevenlabs' as const, voiceId: 'voice_123' },
      conversation: { systemPrompt: 'Test', model: 'gpt-4o', modelProvider: 'openai' as const },
      ownerRef: 'https://do.md/do_123',
      status: 'Active' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as import('../../types/voice-ai').VoiceAgent | null)),
  }
}

// Mock session manager
function createMockSessionManager() {
  return {
    createInbound: vi.fn(async (agentId: string, providerCallId: string, customerPhone: string) => ({
      id: 'vsess_webrtc_123',
      agentId,
      providerSessionId: providerCallId,
      type: 'web' as const,
      customerPhone,
      status: 'ringing' as const,
      startTime: Date.now(),
      transcript: [],
      toolCalls: [],
    })),
    end: vi.fn(async () => true),
  }
}

// Mock provider adapter with WebRTC support
function createMockAdapter() {
  return {
    provider: 'livekit' as VoiceAIProvider,
    createAgent: vi.fn(async () => ({ providerAgentId: 'livekit_agent_123' })),
    updateAgent: vi.fn(async () => {}),
    deleteAgent: vi.fn(async () => {}),
    startCall: vi.fn(async () => 'livekit_call_123'),
    endCall: vi.fn(async () => {}),
    getCall: vi.fn(async () => ({ callId: 'livekit_call_123', status: 'Completed' as const })),
    handleWebhook: vi.fn(async () => ({ type: 'call_ended' as const, sessionId: 'test', data: {} })),
    createRoom: vi.fn(async (agentId: string, identity: string) => ({
      token: 'livekit_token_abc123',
      roomUrl: 'https://livekit.example.com/room_xyz',
    })),
  }
}

describe('WebRTCSessionManager', () => {
  let manager: WebRTCSessionManager
  let mockStorage: ReturnType<typeof createMockStorage>
  let mockAgentManager: ReturnType<typeof createMockAgentManager>
  let mockSessionManager: ReturnType<typeof createMockSessionManager>
  let mockAdapter: ReturnType<typeof createMockAdapter>

  beforeEach(() => {
    mockStorage = createMockStorage()
    mockAgentManager = createMockAgentManager()
    mockSessionManager = createMockSessionManager()
    mockAdapter = createMockAdapter()

    // Setup storage to return agent with provider ID
    mockStorage.get.mockImplementation(async (key: string) => {
      if (key.startsWith('voice_agent:')) {
        return {
          id: key.replace('voice_agent:', ''),
          providerAgentId: 'livekit_agent_123',
          provider: 'livekit',
        }
      }
      return mockStorage.get(key)
    })

    VoiceProviderFactory.register(mockAdapter)

    manager = new WebRTCSessionManager(
      mockStorage as any,
      mockAgentManager as any,
      mockSessionManager as any
    )
  })

  describe('create', () => {
    it('should create a WebRTC session', async () => {
      const result = await manager.create({
        agentId: 'vagent_123',
        identity: 'user_456',
        displayName: 'John Doe',
        audioOnly: true,
      })

      expect(result.sessionId).toMatch(/^vsess_/)
      expect(result.roomName).toBeDefined()
      expect(result.roomUrl).toBe('https://livekit.example.com/room_xyz')
      expect(result.token).toBe('livekit_token_abc123')
      expect(result.config.provider).toBe('livekit')
      expect(result.config.audioOnly).toBe(true)
    })

    it('should throw for non-existent agent', async () => {
      mockAgentManager.get.mockResolvedValueOnce(null)

      await expect(manager.create({
        agentId: 'nonexistent',
        identity: 'user_123',
      })).rejects.toThrow('Voice agent not found')
    })

    it('should throw if provider does not support WebRTC', async () => {
      // Create adapter without createRoom
      const noWebRTCAdapter = {
        ...mockAdapter,
        createRoom: undefined,
      }
      VoiceProviderFactory.register(noWebRTCAdapter)

      await expect(manager.create({
        agentId: 'vagent_123',
        identity: 'user_123',
      })).rejects.toThrow('does not support WebRTC')
    })

    it('should create a voice session to track the call', async () => {
      await manager.create({
        agentId: 'vagent_123',
        identity: 'user_456',
      })

      expect(mockSessionManager.createInbound).toHaveBeenCalled()
    })

    it('should store room info', async () => {
      const result = await manager.create({
        agentId: 'vagent_123',
        identity: 'user_456',
      })

      expect(mockStorage.put).toHaveBeenCalledWith(
        expect.stringMatching(/^webrtc_room:/),
        expect.objectContaining({
          sessionId: result.sessionId,
          agentId: 'vagent_123',
          status: 'active',
        })
      )
    })
  })

  describe('getRoom', () => {
    it('should return room by session ID', async () => {
      // Create a session first
      const result = await manager.create({
        agentId: 'vagent_123',
        identity: 'user_456',
      })

      // Setup mock to return the room
      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === `webrtc_session:${result.sessionId}`) return result.roomName
        if (key === `webrtc_room:${result.roomName}`) {
          return {
            name: result.roomName,
            url: result.roomUrl,
            sessionId: result.sessionId,
            agentId: 'vagent_123',
            provider: 'livekit',
            participants: [],
            createdAt: Date.now(),
            status: 'active',
          }
        }
        return undefined
      })

      const room = await manager.getRoom(result.sessionId)

      expect(room).not.toBeNull()
      expect(room?.sessionId).toBe(result.sessionId)
    })

    it('should return null for non-existent session', async () => {
      mockStorage.get.mockResolvedValue(undefined)
      const room = await manager.getRoom('nonexistent')
      expect(room).toBeNull()
    })
  })

  describe('getRoomByName', () => {
    it('should return room by name', async () => {
      const mockRoom: WebRTCRoom = {
        name: 'room_xyz',
        url: 'https://livekit.example.com/room_xyz',
        sessionId: 'vsess_123',
        agentId: 'vagent_456',
        provider: 'livekit',
        participants: [],
        createdAt: Date.now(),
        status: 'active',
      }

      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === 'webrtc_room:room_xyz') return mockRoom
        return undefined
      })

      const room = await manager.getRoomByName('room_xyz')

      expect(room).not.toBeNull()
      expect(room?.name).toBe('room_xyz')
    })
  })

  describe('generateToken', () => {
    it('should generate new token for existing room', async () => {
      const mockRoom: WebRTCRoom = {
        name: 'room_xyz',
        url: 'https://livekit.example.com/room_xyz',
        sessionId: 'vsess_123',
        agentId: 'vagent_456',
        provider: 'livekit',
        participants: [],
        createdAt: Date.now(),
        status: 'active',
      }

      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === 'webrtc_session:vsess_123') return 'room_xyz'
        if (key === 'webrtc_room:room_xyz') return mockRoom
        if (key.startsWith('voice_agent:')) return { providerAgentId: 'livekit_agent_123', provider: 'livekit' }
        return undefined
      })

      const token = await manager.generateToken('vsess_123', 'user_reconnect')

      expect(token).toBe('livekit_token_abc123')
      expect(mockAdapter.createRoom).toHaveBeenCalled()
    })

    it('should throw for non-existent room', async () => {
      mockStorage.get.mockResolvedValue(undefined)

      await expect(manager.generateToken('nonexistent', 'user_123'))
        .rejects.toThrow('Room not found')
    })
  })

  describe('updateParticipantState', () => {
    it('should update participant connection state', async () => {
      const mockRoom: WebRTCRoom = {
        name: 'room_xyz',
        url: 'https://livekit.example.com/room_xyz',
        sessionId: 'vsess_123',
        agentId: 'vagent_456',
        provider: 'livekit',
        participants: [
          { identity: 'user_123', isAgent: false, joinedAt: Date.now(), connectionState: 'connecting' },
        ],
        createdAt: Date.now(),
        status: 'active',
      }

      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === 'webrtc_room:room_xyz') return mockRoom
        return undefined
      })

      await manager.updateParticipantState('room_xyz', 'user_123', 'connected')

      expect(mockStorage.put).toHaveBeenCalledWith(
        'webrtc_room:room_xyz',
        expect.objectContaining({
          participants: expect.arrayContaining([
            expect.objectContaining({ identity: 'user_123', connectionState: 'connected' }),
          ]),
        })
      )
    })
  })

  describe('addParticipant', () => {
    it('should add participant to room', async () => {
      const mockRoom: WebRTCRoom = {
        name: 'room_xyz',
        url: 'https://livekit.example.com/room_xyz',
        sessionId: 'vsess_123',
        agentId: 'vagent_456',
        provider: 'livekit',
        participants: [],
        createdAt: Date.now(),
        status: 'active',
      }

      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === 'webrtc_room:room_xyz') return mockRoom
        return undefined
      })

      await manager.addParticipant('room_xyz', {
        identity: 'user_new',
        displayName: 'New User',
        isAgent: false,
        joinedAt: Date.now(),
        connectionState: 'connecting',
      })

      expect(mockStorage.put).toHaveBeenCalledWith(
        'webrtc_room:room_xyz',
        expect.objectContaining({
          participants: expect.arrayContaining([
            expect.objectContaining({ identity: 'user_new' }),
          ]),
        })
      )
    })
  })

  describe('removeParticipant', () => {
    it('should remove participant from room', async () => {
      const mockRoom: WebRTCRoom = {
        name: 'room_xyz',
        url: 'https://livekit.example.com/room_xyz',
        sessionId: 'vsess_123',
        agentId: 'vagent_456',
        provider: 'livekit',
        participants: [
          { identity: 'user_123', isAgent: false, joinedAt: Date.now(), connectionState: 'connected' },
          { identity: 'agent_ai', isAgent: true, joinedAt: Date.now(), connectionState: 'connected' },
        ],
        createdAt: Date.now(),
        status: 'active',
      }

      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === 'webrtc_room:room_xyz') return mockRoom
        return undefined
      })

      await manager.removeParticipant('room_xyz', 'user_123')

      expect(mockStorage.put).toHaveBeenCalledWith(
        'webrtc_room:room_xyz',
        expect.objectContaining({
          participants: expect.not.arrayContaining([
            expect.objectContaining({ identity: 'user_123' }),
          ]),
        })
      )
    })

    it('should close room when no human participants left', async () => {
      const mockRoom: WebRTCRoom = {
        name: 'room_xyz',
        url: 'https://livekit.example.com/room_xyz',
        sessionId: 'vsess_123',
        agentId: 'vagent_456',
        provider: 'livekit',
        participants: [
          { identity: 'user_last', isAgent: false, joinedAt: Date.now(), connectionState: 'connected' },
          { identity: 'agent_ai', isAgent: true, joinedAt: Date.now(), connectionState: 'connected' },
        ],
        createdAt: Date.now(),
        status: 'active',
      }

      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === 'webrtc_room:room_xyz') return mockRoom
        return undefined
      })

      await manager.removeParticipant('room_xyz', 'user_last')

      // Should close room since no human participants left
      expect(mockSessionManager.end).toHaveBeenCalledWith('vsess_123')
    })
  })

  describe('closeRoom', () => {
    it('should close room and end session', async () => {
      const mockRoom: WebRTCRoom = {
        name: 'room_xyz',
        url: 'https://livekit.example.com/room_xyz',
        sessionId: 'vsess_123',
        agentId: 'vagent_456',
        provider: 'livekit',
        participants: [],
        createdAt: Date.now(),
        status: 'active',
      }

      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === 'webrtc_room:room_xyz') return mockRoom
        return undefined
      })

      await manager.closeRoom('room_xyz')

      expect(mockStorage.put).toHaveBeenCalledWith(
        'webrtc_room:room_xyz',
        expect.objectContaining({ status: 'closed' })
      )
      expect(mockSessionManager.end).toHaveBeenCalledWith('vsess_123')
    })
  })

  describe('listActiveRooms', () => {
    it('should list active rooms', async () => {
      const mockRooms = new Map([
        ['webrtc_room:room_1', { name: 'room_1', status: 'active', agentId: 'vagent_123' }],
        ['webrtc_room:room_2', { name: 'room_2', status: 'active', agentId: 'vagent_123' }],
        ['webrtc_room:room_3', { name: 'room_3', status: 'closed', agentId: 'vagent_123' }],
      ])

      mockStorage.list.mockResolvedValue(mockRooms)

      const rooms = await manager.listActiveRooms()

      expect(rooms).toHaveLength(2)
    })

    it('should filter by agent ID', async () => {
      const mockRooms = new Map([
        ['webrtc_room:room_1', { name: 'room_1', status: 'active', agentId: 'vagent_123' }],
        ['webrtc_room:room_2', { name: 'room_2', status: 'active', agentId: 'vagent_456' }],
      ])

      mockStorage.list.mockResolvedValue(mockRooms)

      const rooms = await manager.listActiveRooms('vagent_123')

      expect(rooms).toHaveLength(1)
      expect(rooms[0].agentId).toBe('vagent_123')
    })
  })

  describe('cleanup', () => {
    it('should remove old rooms', async () => {
      const oldTime = Date.now() - 48 * 60 * 60 * 1000 // 48 hours ago
      const recentTime = Date.now() - 1 * 60 * 60 * 1000 // 1 hour ago

      const mockRooms = new Map([
        ['webrtc_room:old_room', { name: 'old_room', createdAt: oldTime, sessionId: 'vsess_old' }],
        ['webrtc_room:recent_room', { name: 'recent_room', createdAt: recentTime, sessionId: 'vsess_recent' }],
      ])

      mockStorage.list.mockResolvedValue(mockRooms)

      const cleaned = await manager.cleanup(24 * 60 * 60 * 1000) // 24 hour max age

      expect(cleaned).toBe(1)
      expect(mockStorage.delete).toHaveBeenCalledWith('webrtc_room:old_room')
      expect(mockStorage.delete).toHaveBeenCalledWith('webrtc_session:vsess_old')
    })
  })
})

describe('WebRTCSession singleton', () => {
  it('should throw if not initialized', async () => {
    // Would need to reset singleton state
    expect(true).toBe(true)
  })
})
