/**
 * Agent Worker
 *
 * AI agents in the digital-worker pattern. Agents are defined ONCE
 * and can have communication channels (email, phone, slack) just like
 * humans. Voice is a modality - agents can speak.
 *
 * @module workers/agent
 */

import type {
  Agent,
  WorkerChannels,
  WorkerCapabilities,
  VoiceModality,
  AgentGuardrails,
  WorkerStatus,
  WorkerTool,
  ModelSelection,
} from './types'

// =============================================================================
// Agent Creation
// =============================================================================

/**
 * Options for creating an agent
 */
export interface CreateAgentOptions {
  /** Agent name (e.g., "Priya", "Marcus") */
  name: string
  /** Description of the agent's role */
  description?: string
  /** Avatar URL */
  avatar?: string
  /** System prompt defining personality/behavior */
  systemPrompt: string
  /** Model selection characteristics */
  model?: ModelSelection
  /** Communication channels */
  channels?: Partial<WorkerChannels>
  /** Capabilities */
  capabilities?: Partial<WorkerCapabilities>
  /** Tools the agent can use */
  tools?: WorkerTool[]
  /** Voice modality configuration */
  voice?: VoiceModality
  /** Temperature */
  temperature?: number
  /** Max tokens */
  maxTokens?: number
  /** Knowledge base IDs */
  knowledgeBases?: string[]
  /** Tool-specific configurations */
  toolConfigs?: Record<string, unknown>
  /** Guardrails */
  guardrails?: AgentGuardrails
  /** Custom metadata */
  metadata?: Record<string, unknown>
}

/**
 * Create an agent
 *
 * @param options - Agent options
 * @returns Agent instance
 *
 * @example
 * ```typescript
 * // Create a product manager agent
 * const priya = createAgent({
 *   name: 'Priya',
 *   description: 'Product Manager AI - helps with roadmaps, specs, and user research',
 *   systemPrompt: `You are Priya, a senior product manager. You help with:
 *     - Writing product specs and PRDs
 *     - Prioritizing features
 *     - User research synthesis
 *     - Roadmap planning
 *
 *     Be concise, data-driven, and focused on user value.`,
 *   model: 'best',
 *   channels: {
 *     slack: { userId: 'U_PRIYA', teamId: 'T_COMPANY' },
 *   },
 *   tools: ['search', 'browser', 'database'],
 *   voice: {
 *     enabled: true,
 *     provider: 'vapi',
 *     config: {
 *       voiceId: 'sarah',
 *       speed: 1.0,
 *       language: 'en-US',
 *     },
 *     phone: {
 *       inboundNumber: '+14155551234',
 *     },
 *   },
 * })
 * ```
 */
export function createAgent(options: CreateAgentOptions): Agent {
  const now = new Date()
  const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  return {
    id,
    type: 'agent',
    name: options.name,
    description: options.description,
    avatar: options.avatar,
    status: 'active',
    channels: options.channels || {},
    capabilities: {
      tier: 3, // Agentic tier by default
      skills: [],
      ...options.capabilities,
    },
    tools: options.tools || ['search', 'browser', 'computer'],
    systemPrompt: options.systemPrompt,
    model: options.model || 'best',
    voice: options.voice,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    knowledgeBases: options.knowledgeBases,
    toolConfigs: options.toolConfigs,
    guardrails: options.guardrails,
    createdAt: now,
    updatedAt: now,
    metadata: options.metadata,
  }
}

/**
 * Define an agent (alias for createAgent with fluent API)
 *
 * @param name - Agent name
 * @returns Agent builder
 *
 * @example
 * ```typescript
 * const marcus = defineAgent('Marcus')
 *   .description('Sales Development Rep')
 *   .systemPrompt('You are Marcus, an SDR who helps qualify leads...')
 *   .model('fast')
 *   .withVoice({ provider: 'vapi', voiceId: 'marcus' })
 *   .withChannels({ email: 'marcus@company.com', phone: '+14155559876' })
 *   .build()
 * ```
 */
export function defineAgent(name: string): AgentBuilder {
  return new AgentBuilder(name)
}

/**
 * Fluent builder for creating agents
 */
export class AgentBuilder {
  private options: CreateAgentOptions

  constructor(name: string) {
    this.options = {
      name,
      systemPrompt: '',
    }
  }

  description(desc: string): this {
    this.options.description = desc
    return this
  }

  avatar(url: string): this {
    this.options.avatar = url
    return this
  }

  systemPrompt(prompt: string): this {
    this.options.systemPrompt = prompt
    return this
  }

  model(selection: ModelSelection): this {
    this.options.model = selection
    return this
  }

  temperature(temp: number): this {
    this.options.temperature = temp
    return this
  }

  maxTokens(tokens: number): this {
    this.options.maxTokens = tokens
    return this
  }

  withChannels(channels: Partial<WorkerChannels>): this {
    this.options.channels = { ...this.options.channels, ...channels }
    return this
  }

  withCapabilities(capabilities: Partial<WorkerCapabilities>): this {
    this.options.capabilities = { ...this.options.capabilities, ...capabilities }
    return this
  }

  withTools(tools: WorkerTool[]): this {
    this.options.tools = tools
    return this
  }

  withVoice(voice: VoiceModality | Omit<VoiceModality, 'enabled'>): this {
    this.options.voice = { enabled: true, ...voice }
    return this
  }

  withKnowledgeBases(ids: string[]): this {
    this.options.knowledgeBases = ids
    return this
  }

  withGuardrails(guardrails: AgentGuardrails): this {
    this.options.guardrails = guardrails
    return this
  }

  metadata(meta: Record<string, unknown>): this {
    this.options.metadata = meta
    return this
  }

  build(): Agent {
    if (!this.options.systemPrompt) {
      throw new Error('Agent requires a systemPrompt')
    }
    return createAgent(this.options)
  }
}

// =============================================================================
// Agent Manager
// =============================================================================

/**
 * Agent manager for CRUD operations
 */
export class AgentManager {
  private storage: Map<string, Agent> = new Map()

  /**
   * Create a new agent
   */
  async create(options: CreateAgentOptions): Promise<Agent> {
    const agent = createAgent(options)
    this.storage.set(agent.id, agent)
    return agent
  }

  /**
   * Get an agent by ID
   */
  async get(id: string): Promise<Agent | null> {
    return this.storage.get(id) || null
  }

  /**
   * Get an agent by name
   */
  async getByName(name: string): Promise<Agent | null> {
    for (const agent of this.storage.values()) {
      if (agent.name.toLowerCase() === name.toLowerCase()) {
        return agent
      }
    }
    return null
  }

  /**
   * Update an agent
   */
  async update(id: string, updates: Partial<CreateAgentOptions>): Promise<Agent | null> {
    const agent = this.storage.get(id)
    if (!agent) return null

    const updated: Agent = {
      ...agent,
      ...updates,
      channels: { ...agent.channels, ...updates.channels },
      capabilities: { ...agent.capabilities, ...updates.capabilities },
      voice: updates.voice ? { ...agent.voice, ...updates.voice } : agent.voice,
      guardrails: updates.guardrails ? { ...agent.guardrails, ...updates.guardrails } : agent.guardrails,
      updatedAt: new Date(),
    }

    this.storage.set(id, updated)
    return updated
  }

  /**
   * Delete an agent
   */
  async delete(id: string): Promise<boolean> {
    return this.storage.delete(id)
  }

  /**
   * List agents
   */
  async list(options?: {
    status?: WorkerStatus
    model?: ModelSelection
    hasVoice?: boolean
    limit?: number
    offset?: number
  }): Promise<Agent[]> {
    let agents = Array.from(this.storage.values())

    if (options?.status) {
      agents = agents.filter((a) => a.status === options.status)
    }
    if (options?.model) {
      agents = agents.filter((a) => a.model === options.model)
    }
    if (options?.hasVoice !== undefined) {
      agents = agents.filter((a) => (a.voice?.enabled ?? false) === options.hasVoice)
    }

    const offset = options?.offset || 0
    const limit = options?.limit || 100

    return agents.slice(offset, offset + limit)
  }

  /**
   * Update agent status
   */
  async setStatus(id: string, status: WorkerStatus): Promise<Agent | null> {
    const agent = this.storage.get(id)
    if (!agent) return null

    agent.status = status
    agent.updatedAt = new Date()
    return agent
  }

  /**
   * Check if agent can use a tool
   */
  hasTool(agent: Agent, tool: WorkerTool): boolean {
    return agent.tools.includes(tool)
  }

  /**
   * Check if agent has voice capability
   */
  hasVoice(agent: Agent): boolean {
    return agent.voice?.enabled ?? false
  }

  /**
   * Get agent's phone number (if configured)
   */
  getPhoneNumber(agent: Agent): string | null {
    return agent.voice?.phone?.inboundNumber || agent.channels.phone || null
  }
}

// =============================================================================
// Global Agent Manager
// =============================================================================

let globalAgentManager: AgentManager | null = null

/**
 * Get the global agent manager instance
 */
export function getAgentManager(): AgentManager {
  if (!globalAgentManager) {
    globalAgentManager = new AgentManager()
  }
  return globalAgentManager
}
