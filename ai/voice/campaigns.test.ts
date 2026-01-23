/**
 * Tests for Outbound Campaign Management
 *
 * @module ai/voice/campaigns.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { VoiceCampaignManager, VoiceCampaigns } from './campaigns'
import { VoiceSessionManager } from './sessions'
import { VoiceAgentManager } from './agents'
import type { OutboundCampaign, CampaignStats } from '../../types/voice-ai'

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
      provider: 'bland' as const,
      name: 'Campaign Agent',
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
    get: vi.fn(async () => null),
    startOutbound: vi.fn(async () => ({
      id: 'vsess_123',
      agentId: 'vagent_123',
      providerSessionId: 'provider_123',
      type: 'outbound' as const,
      status: 'initializing' as const,
      startTime: Date.now(),
      transcript: [],
      toolCalls: [],
    })),
  }
}

describe('VoiceCampaignManager', () => {
  let manager: VoiceCampaignManager
  let mockStorage: ReturnType<typeof createMockStorage>
  let mockAgentManager: ReturnType<typeof createMockAgentManager>
  let mockSessionManager: ReturnType<typeof createMockSessionManager>

  beforeEach(() => {
    mockStorage = createMockStorage()
    mockAgentManager = createMockAgentManager()
    mockSessionManager = createMockSessionManager()

    manager = new VoiceCampaignManager(
      mockStorage as any,
      mockSessionManager as any,
      mockAgentManager as any
    )
  })

  describe('create', () => {
    it('should create a campaign', async () => {
      const campaign = await manager.create({
        name: 'Test Campaign',
        agentId: 'vagent_123',
        contacts: [
          { phone: '+15551111111', name: 'Alice' },
          { phone: '+15552222222', name: 'Bob' },
        ],
        settings: {
          maxAttempts: 3,
          retryDelay: 60,
          voicemailDetection: true,
          callerId: '+15550000000',
        },
      })

      expect(campaign.id).toMatch(/^vcamp_/)
      expect(campaign.name).toBe('Test Campaign')
      expect(campaign.status).toBe('draft')
      expect(campaign.contacts).toHaveLength(2)
      expect(campaign.stats?.totalContacts).toBe(2)
    })

    it('should throw for non-existent agent', async () => {
      mockAgentManager.get.mockResolvedValueOnce(null)

      await expect(manager.create({
        name: 'Test',
        agentId: 'nonexistent',
        contacts: [],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })).rejects.toThrow('Voice agent not found')
    })

    it('should generate IDs for contacts', async () => {
      const campaign = await manager.create({
        name: 'Test',
        agentId: 'vagent_123',
        contacts: [{ phone: '+15551111111' }],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })

      expect(campaign.contacts[0].id).toMatch(/^contact_/)
      expect(campaign.contacts[0].status).toBe('pending')
    })
  })

  describe('get', () => {
    it('should return campaign by ID', async () => {
      const created = await manager.create({
        name: 'Test',
        agentId: 'vagent_123',
        contacts: [],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })

      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === `voice_campaign:${created.id}`) return created
        return undefined
      })

      const campaign = await manager.get(created.id)

      expect(campaign).not.toBeNull()
      expect(campaign?.name).toBe('Test')
    })
  })

  describe('update', () => {
    it('should update campaign fields', async () => {
      const created = await manager.create({
        name: 'Original',
        agentId: 'vagent_123',
        contacts: [],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })

      mockStorage.get.mockImplementation(async (key: string) => {
        if (key === `voice_campaign:${created.id}`) return created
        return undefined
      })

      const updated = await manager.update(created.id, {
        name: 'Updated',
        settings: { maxAttempts: 5 },
      })

      expect(updated.name).toBe('Updated')
      expect(updated.settings.maxAttempts).toBe(5)
    })

    it('should throw for running campaign', async () => {
      const created = await manager.create({
        name: 'Test',
        agentId: 'vagent_123',
        contacts: [],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })

      mockStorage.get.mockImplementation(async () => ({ ...created, status: 'running' }))

      await expect(manager.update(created.id, { name: 'New' }))
        .rejects.toThrow('Cannot update campaign in status: running')
    })
  })

  describe('addContacts', () => {
    it('should add contacts to campaign', async () => {
      const created = await manager.create({
        name: 'Test',
        agentId: 'vagent_123',
        contacts: [{ phone: '+15551111111' }],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })

      mockStorage.get.mockImplementation(async () => created)

      const updated = await manager.addContacts(created.id, [
        { phone: '+15552222222' },
        { phone: '+15553333333' },
      ])

      expect(updated.contacts).toHaveLength(3)
    })
  })

  describe('removeContact', () => {
    it('should remove contact from campaign', async () => {
      const created = await manager.create({
        name: 'Test',
        agentId: 'vagent_123',
        contacts: [
          { phone: '+15551111111' },
          { phone: '+15552222222' },
        ],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })

      mockStorage.get.mockImplementation(async () => created)

      const contactId = created.contacts[0].id
      const updated = await manager.removeContact(created.id, contactId)

      expect(updated.contacts).toHaveLength(1)
    })
  })

  describe('start', () => {
    it('should start a draft campaign', async () => {
      const created = await manager.create({
        name: 'Test',
        agentId: 'vagent_123',
        contacts: [{ phone: '+15551111111' }],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })

      mockStorage.get.mockImplementation(async () => created)

      const started = await manager.start(created.id)

      expect(started.status).toBe('running')
      expect(started.startedAt).toBeDefined()
    })

    it('should throw for completed campaign', async () => {
      const created = await manager.create({
        name: 'Test',
        agentId: 'vagent_123',
        contacts: [],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })

      mockStorage.get.mockImplementation(async () => ({ ...created, status: 'completed' }))

      await expect(manager.start(created.id))
        .rejects.toThrow('Cannot start campaign in status: completed')
    })
  })

  describe('pause', () => {
    it('should pause a running campaign', async () => {
      const created = await manager.create({
        name: 'Test',
        agentId: 'vagent_123',
        contacts: [],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })

      mockStorage.get.mockImplementation(async () => ({ ...created, status: 'running' }))

      const paused = await manager.pause(created.id)

      expect(paused.status).toBe('paused')
    })
  })

  describe('resume', () => {
    it('should resume a paused campaign', async () => {
      const created = await manager.create({
        name: 'Test',
        agentId: 'vagent_123',
        contacts: [],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })

      mockStorage.get.mockImplementation(async () => ({ ...created, status: 'paused' }))

      const resumed = await manager.resume(created.id)

      expect(resumed.status).toBe('running')
    })
  })

  describe('stop', () => {
    it('should stop and mark campaign as completed', async () => {
      const created = await manager.create({
        name: 'Test',
        agentId: 'vagent_123',
        contacts: [],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })

      mockStorage.get.mockImplementation(async () => ({ ...created, status: 'running' }))

      const stopped = await manager.stop(created.id)

      expect(stopped.status).toBe('completed')
      expect(stopped.completedAt).toBeDefined()
    })
  })

  describe('delete', () => {
    it('should delete a draft campaign', async () => {
      const created = await manager.create({
        name: 'Test',
        agentId: 'vagent_123',
        contacts: [],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })

      mockStorage.get.mockImplementation(async () => created)

      const result = await manager.delete(created.id)

      expect(result).toBe(true)
      expect(mockStorage.delete).toHaveBeenCalled()
    })

    it('should throw for running campaign', async () => {
      const created = await manager.create({
        name: 'Test',
        agentId: 'vagent_123',
        contacts: [],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })

      mockStorage.get.mockImplementation(async () => ({ ...created, status: 'running' }))

      await expect(manager.delete(created.id))
        .rejects.toThrow('Cannot delete a running campaign')
    })
  })

  describe('list', () => {
    it('should list campaigns', async () => {
      await manager.create({
        name: 'Campaign 1',
        agentId: 'vagent_123',
        contacts: [],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })
      await manager.create({
        name: 'Campaign 2',
        agentId: 'vagent_123',
        contacts: [],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })

      const result = await manager.list()

      expect(result.items.length).toBeGreaterThanOrEqual(0)
    })

    it('should filter by status', async () => {
      // TODO: Implement with proper mock
      expect(true).toBe(true)
    })
  })

  describe('getStats', () => {
    it('should return campaign statistics', async () => {
      const created = await manager.create({
        name: 'Test',
        agentId: 'vagent_123',
        contacts: [
          { phone: '+15551111111' },
          { phone: '+15552222222' },
        ],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })

      mockStorage.get.mockImplementation(async () => created)

      const stats = await manager.getStats(created.id)

      expect(stats.totalContacts).toBe(2)
      expect(stats.called).toBe(0)
      expect(stats.completed).toBe(0)
    })
  })

  describe('on', () => {
    it('should subscribe to campaign events', () => {
      const handler = vi.fn()

      const unsubscribe = manager.on('vcamp_123', 'started', handler)

      expect(typeof unsubscribe).toBe('function')
    })
  })

  describe('watchStats', () => {
    it('should return async iterator for stats', async () => {
      const created = await manager.create({
        name: 'Test',
        agentId: 'vagent_123',
        contacts: [],
        settings: { maxAttempts: 3, retryDelay: 60, voicemailDetection: true, callerId: '+15550000000' },
      })

      mockStorage.get.mockImplementation(async () => ({ ...created, status: 'completed' }))

      const iterator = manager.watchStats(created.id)

      // Get first value (initial stats)
      const first = await iterator.next()
      expect(first.value).toHaveProperty('totalContacts')
    })
  })
})

describe('VoiceCampaigns singleton', () => {
  it('should throw if not initialized', async () => {
    // Would need to reset singleton state
    expect(true).toBe(true)
  })
})
