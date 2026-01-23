/**
 * Voice Agent Management
 *
 * Voice agents are Agents with voice modality enabled.
 * This module provides CRUD operations for voice-specific configuration
 * that links to core Agent entities.
 *
 * @module ai/voice/agents
 */

import type {
  VoiceAgent,
  VoiceConfig,
  ConversationConfig,
  PhoneIntegration,
  VoiceAgentWebhooks,
  VoiceAgentTool,
  VoiceAIProvider,
} from '../../types/voice-ai'
import type { DigitalObjectRef } from '../../types/identity'
import { VoiceProviderFactory, type ProviderAgentConfig } from './providers'

// =============================================================================
// Types
// =============================================================================

/**
 * Options for creating a voice agent
 */
export interface CreateVoiceAgentOptions {
  /** Human-readable name */
  name: string
  /** Voice AI provider */
  provider: VoiceAIProvider
  /** Voice configuration */
  voice: VoiceConfig
  /** Conversation configuration */
  conversation: ConversationConfig
  /** Phone integration settings */
  phone?: PhoneIntegration
  /** Webhook endpoints */
  webhooks?: VoiceAgentWebhooks
  /** Reference to core Agent entity (optional - can create standalone) */
  agentRef?: string
  /** Owner DO reference */
  ownerRef: DigitalObjectRef
}

/**
 * Options for updating a voice agent
 */
export interface UpdateVoiceAgentOptions {
  /** Human-readable name */
  name?: string
  /** Voice configuration */
  voice?: Partial<VoiceConfig>
  /** Conversation configuration */
  conversation?: Partial<ConversationConfig>
  /** Phone integration settings */
  phone?: Partial<PhoneIntegration>
  /** Webhook endpoints */
  webhooks?: Partial<VoiceAgentWebhooks>
  /** Status */
  status?: 'active' | 'inactive'
}

/**
 * Options for listing voice agents
 */
export interface ListVoiceAgentsOptions {
  /** Filter by status */
  status?: 'active' | 'inactive' | 'error'
  /** Filter by provider */
  provider?: VoiceAIProvider
  /** Filter by owner */
  ownerRef?: DigitalObjectRef
  /** Limit results */
  limit?: number
  /** Offset for pagination */
  offset?: number
}

/**
 * Result of listing voice agents
 */
export interface ListVoiceAgentsResult {
  /** Voice agents */
  items: VoiceAgent[]
  /** Total count */
  total: number
  /** Has more results */
  hasMore: boolean
}

// =============================================================================
// Voice Agent Manager
// =============================================================================

/**
 * Voice agent manager
 *
 * Provides CRUD operations for voice agents. Voice agents link to core Agent
 * entities and add voice-specific configuration (voice settings, conversation
 * config, phone integration).
 *
 * @example
 * ```typescript
 * const manager = new VoiceAgentManager(storage)
 *
 * // Create a voice agent
 * const agent = await manager.create({
 *   name: 'Sales Assistant',
 *   provider: 'vapi',
 *   voice: { provider: 'elevenlabs', voiceId: 'voice_rachel' },
 *   conversation: { systemPrompt: '...', model: 'gpt-4o', modelProvider: 'openai' },
 *   ownerRef: { $id: 'do_123', $type: 'Organization' },
 * })
 *
 * // Update voice settings
 * await manager.update(agent.id, { voice: { speed: 1.1 } })
 *
 * // List all agents
 * const agents = await manager.list({ status: 'active' })
 * ```
 */
export class VoiceAgentManager {
  /**
   * Create a new voice agent manager
   *
   * @param storage - DO storage interface
   */
  constructor(private storage: DurableObjectStorage) {}

  /**
   * Create a new voice agent
   *
   * Creates the agent in both the local DO storage and the provider's system.
   *
   * @param options - Agent configuration
   * @returns Created voice agent
   */
  async create(options: CreateVoiceAgentOptions): Promise<VoiceAgent> {
    const id = `vagent_${generateId()}`
    const now = Date.now()

    // Create agent in provider's system
    const adapter = VoiceProviderFactory.get(options.provider)
    const providerConfig: ProviderAgentConfig = {
      voice: options.voice,
      conversation: options.conversation,
      phone: options.phone ? {
        inboundNumber: options.phone.inboundNumber,
        outboundCallerId: options.phone.outboundCallerId,
      } : undefined,
      webhooks: options.webhooks ? {
        onCallStart: options.webhooks.onCallStart,
        onCallEnd: options.webhooks.onCallEnd,
        onTranscript: options.webhooks.onTranscript,
        onToolCall: options.webhooks.onToolCall,
      } : undefined,
    }

    const providerResult = await adapter.createAgent(providerConfig)

    // Create local agent record
    const agent: VoiceAgent = {
      id,
      name: options.name,
      provider: options.provider,
      voice: options.voice,
      conversation: options.conversation,
      phone: options.phone,
      webhooks: options.webhooks,
      ownerRef: options.ownerRef,
      status: 'Active',
      createdAt: now,
      updatedAt: now,
    }

    // Store with provider agent ID
    await this.storage.put(`voice_agent:${id}`, {
      ...agent,
      providerAgentId: providerResult.providerAgentId,
      providerMetadata: providerResult.metadata,
    })

    // Index by provider agent ID for webhook lookup
    await this.storage.put(`voice_agent_provider:${providerResult.providerAgentId}`, id)

    return agent
  }

  /**
   * Get a voice agent by ID
   *
   * @param id - Voice agent ID
   * @returns Voice agent or null if not found
   */
  async get(id: string): Promise<VoiceAgent | null> {
    const data = await this.storage.get<VoiceAgent & { providerAgentId: string }>(`voice_agent:${id}`)
    if (!data) return null

    // Remove internal fields
    const { providerAgentId, providerMetadata, ...agent } = data as any
    return agent
  }

  /**
   * Get a voice agent by provider agent ID
   *
   * Useful for webhook processing where only the provider's ID is known.
   *
   * @param providerAgentId - Provider's agent ID
   * @returns Voice agent or null if not found
   */
  async getByProviderAgentId(providerAgentId: string): Promise<VoiceAgent | null> {
    const id = await this.storage.get<string>(`voice_agent_provider:${providerAgentId}`)
    if (!id) return null
    return this.get(id)
  }

  /**
   * Update a voice agent
   *
   * Updates both local storage and provider's system.
   *
   * @param id - Voice agent ID
   * @param options - Fields to update
   * @returns Updated voice agent
   * @throws Error if agent not found
   */
  async update(id: string, options: UpdateVoiceAgentOptions): Promise<VoiceAgent> {
    const existing = await this.storage.get<VoiceAgent & { providerAgentId: string }>(`voice_agent:${id}`)
    if (!existing) {
      throw new Error(`Voice agent not found: ${id}`)
    }

    // Update provider if voice/conversation config changed
    if (options.voice || options.conversation || options.phone || options.webhooks) {
      const adapter = VoiceProviderFactory.get(existing.provider)
      const providerConfig: Partial<ProviderAgentConfig> = {}

      if (options.voice) {
        providerConfig.voice = { ...existing.voice, ...options.voice }
      }
      if (options.conversation) {
        providerConfig.conversation = { ...existing.conversation, ...options.conversation }
      }
      if (options.phone) {
        providerConfig.phone = {
          inboundNumber: options.phone.inboundNumber ?? existing.phone?.inboundNumber,
          outboundCallerId: options.phone.outboundCallerId ?? existing.phone?.outboundCallerId,
        }
      }
      if (options.webhooks) {
        providerConfig.webhooks = {
          onCallStart: options.webhooks.onCallStart ?? existing.webhooks?.onCallStart,
          onCallEnd: options.webhooks.onCallEnd ?? existing.webhooks?.onCallEnd,
          onTranscript: options.webhooks.onTranscript ?? existing.webhooks?.onTranscript,
          onToolCall: options.webhooks.onToolCall ?? existing.webhooks?.onToolCall,
        }
      }

      await adapter.updateAgent(existing.providerAgentId, providerConfig)
    }

    // Update local storage
    const updated: VoiceAgent & { providerAgentId: string } = {
      ...existing,
      name: options.name ?? existing.name,
      voice: options.voice ? { ...existing.voice, ...options.voice } : existing.voice,
      conversation: options.conversation ? { ...existing.conversation, ...options.conversation } : existing.conversation,
      phone: options.phone ? { enabled: existing.phone?.enabled ?? false, ...existing.phone, ...options.phone } as PhoneIntegration : existing.phone,
      webhooks: options.webhooks ? { ...existing.webhooks, ...options.webhooks } : existing.webhooks,
      status: options.status ? (options.status === 'active' ? 'Active' : 'Inactive') : existing.status,
      updatedAt: Date.now(),
    }

    await this.storage.put(`voice_agent:${id}`, updated)

    const { providerAgentId, providerMetadata, ...agent } = updated as any
    return agent
  }

  /**
   * Delete a voice agent
   *
   * Removes from both local storage and provider's system.
   *
   * @param id - Voice agent ID
   * @returns True if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.storage.get<VoiceAgent & { providerAgentId: string }>(`voice_agent:${id}`)
    if (!existing) {
      return false
    }

    // Delete from provider
    const adapter = VoiceProviderFactory.get(existing.provider)
    await adapter.deleteAgent(existing.providerAgentId)

    // Delete from local storage
    await this.storage.delete(`voice_agent:${id}`)
    await this.storage.delete(`voice_agent_provider:${existing.providerAgentId}`)

    return true
  }

  /**
   * List voice agents
   *
   * @param options - Filter and pagination options
   * @returns List of voice agents
   */
  async list(options: ListVoiceAgentsOptions = {}): Promise<ListVoiceAgentsResult> {
    const { status, provider, ownerRef, limit = 50, offset = 0 } = options

    // Get all agents (in production, use SQL with proper filtering)
    const allAgents = await this.storage.list<VoiceAgent>({ prefix: 'voice_agent:' })

    let items: VoiceAgent[] = []
    for (const [, agent] of allAgents) {
      // Apply filters
      const statusMatch = status ? (status === 'active' ? 'Active' : status === 'inactive' ? 'Inactive' : 'Error') : null
      if (statusMatch && agent.status !== statusMatch) continue
      if (provider && agent.provider !== provider) continue
      if (ownerRef && agent.ownerRef !== ownerRef) continue

      // Remove internal fields
      const { providerAgentId, providerMetadata, ...cleanAgent } = agent as any
      items.push(cleanAgent)
    }

    // Sort by createdAt descending
    items.sort((a, b) => b.createdAt - a.createdAt)

    const total = items.length
    items = items.slice(offset, offset + limit)

    return {
      items,
      total,
      hasMore: offset + items.length < total,
    }
  }

  /**
   * Add a tool to a voice agent
   *
   * @param id - Voice agent ID
   * @param tool - Tool to add
   * @returns Updated voice agent
   */
  async addTool(id: string, tool: VoiceAgentTool): Promise<VoiceAgent> {
    const existing = await this.storage.get<VoiceAgent>(`voice_agent:${id}`)
    if (!existing) {
      throw new Error(`Voice agent not found: ${id}`)
    }

    const tools = existing.conversation.tools || []
    if (tools.some((t) => t.name === tool.name)) {
      throw new Error(`Tool already exists: ${tool.name}`)
    }

    return this.update(id, {
      conversation: {
        tools: [...tools, tool],
      },
    })
  }

  /**
   * Remove a tool from a voice agent
   *
   * @param id - Voice agent ID
   * @param toolName - Name of tool to remove
   * @returns Updated voice agent
   */
  async removeTool(id: string, toolName: string): Promise<VoiceAgent> {
    const existing = await this.storage.get<VoiceAgent>(`voice_agent:${id}`)
    if (!existing) {
      throw new Error(`Voice agent not found: ${id}`)
    }

    const tools = existing.conversation.tools || []
    const filtered = tools.filter((t) => t.name !== toolName)

    if (filtered.length === tools.length) {
      throw new Error(`Tool not found: ${toolName}`)
    }

    return this.update(id, {
      conversation: {
        tools: filtered,
      },
    })
  }

  /**
   * Set agent status
   *
   * @param id - Voice agent ID
   * @param status - New status
   * @returns Updated voice agent
   */
  async setStatus(id: string, status: 'active' | 'inactive'): Promise<VoiceAgent> {
    return this.update(id, { status })
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a random ID
 * @returns Random ID string
 */
function generateId(): string {
  // TODO: Use nanoid
  return Math.random().toString(36).substring(2, 15)
}

// =============================================================================
// Singleton Access (for convenience)
// =============================================================================

let defaultManager: VoiceAgentManager | null = null

/**
 * Voice agents singleton access
 *
 * @example
 * ```typescript
 * import { VoiceAgents } from 'do/ai/voice'
 *
 * const agent = await VoiceAgents.create({ ... })
 * ```
 */
export const VoiceAgents = {
  /**
   * Initialize with storage
   */
  init(storage: DurableObjectStorage): void {
    defaultManager = new VoiceAgentManager(storage)
  },

  /**
   * Create a voice agent
   */
  async create(options: CreateVoiceAgentOptions): Promise<VoiceAgent> {
    if (!defaultManager) throw new Error('VoiceAgents not initialized')
    return defaultManager.create(options)
  },

  /**
   * Get a voice agent
   */
  async get(id: string): Promise<VoiceAgent | null> {
    if (!defaultManager) throw new Error('VoiceAgents not initialized')
    return defaultManager.get(id)
  },

  /**
   * Update a voice agent
   */
  async update(id: string, options: UpdateVoiceAgentOptions): Promise<VoiceAgent> {
    if (!defaultManager) throw new Error('VoiceAgents not initialized')
    return defaultManager.update(id, options)
  },

  /**
   * Delete a voice agent
   */
  async delete(id: string): Promise<boolean> {
    if (!defaultManager) throw new Error('VoiceAgents not initialized')
    return defaultManager.delete(id)
  },

  /**
   * List voice agents
   */
  async list(options?: ListVoiceAgentsOptions): Promise<ListVoiceAgentsResult> {
    if (!defaultManager) throw new Error('VoiceAgents not initialized')
    return defaultManager.list(options)
  },
}

// =============================================================================
// Type Exports
// =============================================================================

// Note: DurableObjectStorage is a Cloudflare Workers type, imported at runtime
