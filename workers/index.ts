/**
 * Workers Module
 *
 * Digital-worker interface that unifies humans and AI agents.
 * Both can have communication channels and be assigned tasks.
 *
 * @module workers
 *
 * @example
 * ```typescript
 * import { createHuman, createAgent, defineAgent, getWorkerManager } from 'do/workers'
 *
 * // Create a human worker
 * const priya = createHuman({
 *   name: 'Priya Sharma',
 *   title: 'Product Manager',
 *   channels: {
 *     email: 'priya@example.com',
 *     slack: { userId: 'U123', teamId: 'T456' },
 *   },
 * })
 *
 * // Create an AI agent (fluent API)
 * const marcus = defineAgent('Marcus')
 *   .description('Sales Development Rep')
 *   .systemPrompt('You are Marcus, an SDR...')
 *   .model('fast')
 *   .withVoice({ provider: 'vapi', voiceId: 'marcus' })
 *   .withChannels({ phone: '+14155559876' })
 *   .build()
 *
 * // Both can be messaged the same way
 * const workers = getWorkerManager()
 * await workers.message(priya.id, 'Need your review on the spec')
 * await workers.message(marcus.id, 'Qualify this lead: acme.com')
 * ```
 */

// =============================================================================
// Export Types
// =============================================================================

export type {
  // Core types
  WorkerType,
  WorkerStatus,
  DigitalWorker,

  // Channel types
  WorkerChannels,
  SlackAccount,
  DiscordAccount,
  TeamsAccount,
  GitHubAccount,

  // Capability types
  WorkerCapabilities,
  CapabilityTier,
  WorkerTool,

  // Human types
  Human,
  WorkSchedule,

  // Agent types
  Agent,
  ModelSelection,
  VoiceModality,
  AgentGuardrails,

  // Operations types
  WorkerAssignment,
  WorkerMessage,
  WorkerQueryOptions,
} from './types'

// =============================================================================
// Human Workers
// =============================================================================

export {
  createHuman,
  HumanManager,
  getHumanManager,
  type CreateHumanOptions,
} from './human'

// =============================================================================
// Agent Workers
// =============================================================================

export {
  createAgent,
  defineAgent,
  AgentBuilder,
  AgentManager,
  getAgentManager,
  type CreateAgentOptions,
} from './agent'

// =============================================================================
// Unified Worker Management
// =============================================================================

import type { DigitalWorker, WorkerQueryOptions, WorkerStatus, WorkerType } from './types'
import { createHuman, HumanManager, getHumanManager } from './human'
import { createAgent, AgentManager, getAgentManager } from './agent'

/**
 * Unified worker manager
 *
 * Provides a single interface for managing both humans and agents.
 */
export class WorkerManager {
  private humans: HumanManager
  private agents: AgentManager

  constructor() {
    this.humans = getHumanManager()
    this.agents = getAgentManager()
  }

  /**
   * Get a worker by ID (human or agent)
   */
  async get(id: string): Promise<DigitalWorker | null> {
    if (id.startsWith('human_')) {
      return this.humans.get(id)
    }
    if (id.startsWith('agent_')) {
      return this.agents.get(id)
    }
    // Try both
    const human = await this.humans.get(id)
    if (human) return human
    return this.agents.get(id)
  }

  /**
   * List workers with filters
   */
  async list(options?: WorkerQueryOptions): Promise<DigitalWorker[]> {
    const results: DigitalWorker[] = []

    // Get humans (unless filtering for agents only)
    if (!options?.type || options.type === 'human') {
      const humans = await this.humans.list({
        status: options?.status,
        limit: options?.limit,
        offset: options?.offset,
      })
      results.push(...humans)
    }

    // Get agents (unless filtering for humans only)
    if (!options?.type || options.type === 'agent') {
      const agents = await this.agents.list({
        status: options?.status,
        limit: options?.limit,
        offset: options?.offset,
      })
      results.push(...agents)
    }

    // Apply additional filters
    let filtered = results

    if (options?.tier) {
      filtered = filtered.filter((w) => w.capabilities.tier === options.tier)
    }

    if (options?.skills?.length) {
      filtered = filtered.filter((w) =>
        options.skills!.some((skill) => w.capabilities.skills.includes(skill))
      )
    }

    if (options?.channel) {
      filtered = filtered.filter((w) => w.channels[options.channel!] !== undefined)
    }

    return filtered
  }

  /**
   * Update worker status
   */
  async setStatus(id: string, status: WorkerStatus): Promise<DigitalWorker | null> {
    if (id.startsWith('human_')) {
      return this.humans.setStatus(id, status)
    }
    if (id.startsWith('agent_')) {
      return this.agents.setStatus(id, status)
    }
    return null
  }

  /**
   * Find workers by channel
   */
  async findByChannel(
    channelType: keyof import('./types').WorkerChannels,
    channelValue: string
  ): Promise<DigitalWorker[]> {
    const all = await this.list()
    return all.filter((w) => {
      const channel = w.channels[channelType]
      if (!channel) return false

      // Handle different channel types
      if (typeof channel === 'string') {
        return channel === channelValue
      }
      if ('userId' in channel) {
        return channel.userId === channelValue
      }
      if ('username' in channel) {
        return channel.username === channelValue
      }
      return false
    })
  }

  /**
   * Find workers available for a task
   */
  async findAvailable(options?: {
    type?: WorkerType
    skills?: string[]
    tier?: number
  }): Promise<DigitalWorker[]> {
    const workers = await this.list({
      type: options?.type,
      status: 'active',
      skills: options?.skills,
      tier: options?.tier as any,
    })

    // For humans, also check availability schedule
    const available: DigitalWorker[] = []
    for (const worker of workers) {
      if (worker.type === 'human') {
        const isAvailable = await this.humans.isAvailable(worker.id)
        if (isAvailable) {
          available.push(worker)
        }
      } else {
        // Agents are always available if active
        available.push(worker)
      }
    }

    return available
  }

  /**
   * Check if a worker can be reached via a specific channel
   */
  hasChannel(worker: DigitalWorker, channel: keyof import('./types').WorkerChannels): boolean {
    return worker.channels[channel] !== undefined
  }

  /**
   * Get the best way to reach a worker
   */
  getBestChannel(worker: DigitalWorker): keyof import('./types').WorkerChannels | null {
    // Priority: slack > teams > discord > email > phone
    if (worker.channels.slack) return 'slack'
    if (worker.channels.teams) return 'teams'
    if (worker.channels.discord) return 'discord'
    if (worker.channels.email) return 'email'
    if (worker.channels.phone) return 'phone'
    return null
  }
}

// =============================================================================
// Global Worker Manager
// =============================================================================

let globalWorkerManager: WorkerManager | null = null

/**
 * Get the global worker manager instance
 */
export function getWorkerManager(): WorkerManager {
  if (!globalWorkerManager) {
    globalWorkerManager = new WorkerManager()
  }
  return globalWorkerManager
}

/**
 * Create a worker (convenience function)
 *
 * @param options - Worker options
 * @returns Created worker
 */
export function createWorker(
  options: import('./human').CreateHumanOptions | import('./agent').CreateAgentOptions
): DigitalWorker {
  if ('systemPrompt' in options) {
    // Agent
    return createAgent(options)
  }
  // Human
  return createHuman(options)
}
