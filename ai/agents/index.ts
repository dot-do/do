/**
 * Agents Module
 *
 * Agent definitions and registry. Agents are defined ONCE and can have
 * multiple modalities (voice, text, etc.) and communication channels.
 *
 * This module bridges:
 * - workers/agent.ts - Core Agent interface (digital worker pattern)
 * - voice/ - Voice modality infrastructure
 *
 * @module ai/agents
 *
 * @example
 * ```typescript
 * import { defineAgent, AgentRegistry } from 'do/ai/agents'
 *
 * // Define an agent
 * const priya = defineAgent('Priya')
 *   .description('Product Manager AI')
 *   .systemPrompt('You are Priya, a senior product manager...')
 *   .model('best')
 *   .withVoice({
 *     provider: 'vapi',
 *     voiceId: 'sarah',
 *   })
 *   .withChannels({
 *     slack: { userId: 'U_PRIYA', teamId: 'T_COMPANY' },
 *     phone: '+14155551234',
 *   })
 *   .build()
 *
 * // Register and use
 * AgentRegistry.register(priya)
 * const agent = await AgentRegistry.get('Priya')
 * ```
 */

// =============================================================================
// Re-export Core Agent Types from Workers
// =============================================================================

export type {
  // Core agent interface
  Agent,
  ModelSelection,
  VoiceModality,
  AgentGuardrails,

  // Worker types (agents are workers)
  WorkerChannels,
  SlackAccount,
  DiscordAccount,
  TeamsAccount,
  GitHubAccount,
  WorkerCapabilities,
  CapabilityTier,
  WorkerTool,
  WorkerStatus,
} from '../../workers'

export {
  // Agent creation
  createAgent,
  defineAgent,
  AgentBuilder,

  // Agent management
  AgentManager,
  getAgentManager,

  // Types
  type CreateAgentOptions,
} from '../../workers'

// =============================================================================
// Agent Registry
// =============================================================================

import type { Agent } from '../../workers'
import { getAgentManager } from '../../workers'

/**
 * Global agent registry
 *
 * Provides named access to agents and integrates with voice modality.
 */
export class AgentRegistry {
  private static agents = new Map<string, Agent>()

  /**
   * Register an agent
   */
  static register(agent: Agent): void {
    this.agents.set(agent.name.toLowerCase(), agent)
    // Also register with AgentManager for ID-based lookup
    getAgentManager().create({
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      channels: agent.channels,
      capabilities: agent.capabilities,
      tools: agent.tools,
      voice: agent.voice,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      guardrails: agent.guardrails,
      metadata: agent.metadata,
    })
  }

  /**
   * Get an agent by name
   */
  static get(name: string): Agent | undefined {
    return this.agents.get(name.toLowerCase())
  }

  /**
   * List all registered agents
   */
  static list(): Agent[] {
    return Array.from(this.agents.values())
  }

  /**
   * Check if an agent exists
   */
  static has(name: string): boolean {
    return this.agents.has(name.toLowerCase())
  }

  /**
   * Remove an agent
   */
  static remove(name: string): boolean {
    return this.agents.delete(name.toLowerCase())
  }

  /**
   * Clear all agents
   */
  static clear(): void {
    this.agents.clear()
  }
}

// =============================================================================
// Voice Modality Bridge
// =============================================================================

/**
 * Enable voice for an agent
 *
 * Links the core agent definition with voice AI provider configuration.
 *
 * @param agent - Agent to enable voice for
 * @param voiceProvider - Voice AI provider ('vapi', 'livekit', 'retell', 'bland')
 * @param voiceConfig - Voice-specific configuration
 * @returns Agent with voice enabled
 *
 * @example
 * ```typescript
 * const priyaWithVoice = enableVoice(priya, 'vapi', {
 *   voiceId: 'sarah',
 *   voiceProvider: 'elevenlabs',
 *   phone: {
 *     inboundNumber: '+14155551234',
 *   },
 * })
 * ```
 */
export function enableVoice(
  agent: Agent,
  voiceProvider: 'vapi' | 'livekit' | 'retell' | 'bland',
  voiceConfig: {
    voiceId?: string
    voiceProvider?: string
    speed?: number
    language?: string
    phone?: {
      inboundNumber?: string
      outboundCallerId?: string
      maxDuration?: number
      recordCalls?: boolean
    }
  }
): Agent {
  return {
    ...agent,
    voice: {
      enabled: true,
      provider: voiceProvider,
      config: {
        voiceId: voiceConfig.voiceId,
        voiceProvider: voiceConfig.voiceProvider,
        speed: voiceConfig.speed,
        language: voiceConfig.language,
      },
      phone: voiceConfig.phone,
    },
    updatedAt: new Date(),
  }
}

/**
 * Check if an agent has voice enabled
 */
export function hasVoice(agent: Agent): boolean {
  return agent.voice?.enabled ?? false
}

/**
 * Get agent's voice provider
 */
export function getVoiceProvider(agent: Agent): 'vapi' | 'livekit' | 'retell' | 'bland' | null {
  if (!agent.voice?.enabled) return null
  return agent.voice.provider ?? null
}

/**
 * Get agent's phone number
 */
export function getAgentPhone(agent: Agent): string | null {
  return agent.voice?.phone?.inboundNumber || agent.channels.phone || null
}

// =============================================================================
// Voice Modality
// =============================================================================

export {
  VoiceProviderFactory,
  type VoiceProviderAdapter,
  type ProviderAgentConfig,
  type ProviderAgentResult,
  type ProviderCallStatus,
  type WebhookEventType,
  type WebhookResult,
  type VoiceUseCase,
} from './voice'

// =============================================================================
// Predefined Agent Templates
// =============================================================================

import { defineAgent } from '../../workers'

/**
 * Create a customer support agent
 */
export function createSupportAgent(
  name: string,
  options?: {
    company?: string
    products?: string[]
    tone?: 'friendly' | 'professional' | 'casual'
  }
): ReturnType<typeof defineAgent> {
  const tone = options?.tone || 'friendly'
  const company = options?.company || 'our company'
  const products = options?.products?.join(', ') || 'our products and services'

  const prompt = `You are ${name}, a ${tone} customer support representative at ${company}.
You help customers with questions about ${products}.
You are patient, empathetic, and solution-oriented.
Always try to resolve issues on the first contact.
If you can't help, offer to escalate to a human agent.`

  return defineAgent(name)
    .description(`Customer Support Agent for ${company}`)
    .systemPrompt(prompt)
    .model('fast')
    .withCapabilities({ tier: 3, skills: ['customer-support', 'troubleshooting'] })
}

/**
 * Create a sales agent
 */
export function createSalesAgent(
  name: string,
  options?: {
    company?: string
    product?: string
    style?: 'consultative' | 'direct' | 'educational'
  }
): ReturnType<typeof defineAgent> {
  const style = options?.style || 'consultative'
  const company = options?.company || 'our company'
  const product = options?.product || 'our solution'

  const prompt = `You are ${name}, a ${style} sales representative at ${company}.
You help prospects understand how ${product} can solve their problems.
You focus on understanding needs before proposing solutions.
You're transparent about pricing and never pushy.
Your goal is to help prospects make the best decision for them.`

  return defineAgent(name)
    .description(`Sales Agent for ${company}`)
    .systemPrompt(prompt)
    .model('best')
    .withCapabilities({ tier: 3, skills: ['sales', 'discovery', 'negotiation'] })
}

/**
 * Create a scheduling agent
 */
export function createSchedulingAgent(
  name: string,
  options?: {
    company?: string
    calendarSystem?: string
  }
): ReturnType<typeof defineAgent> {
  const company = options?.company || 'the company'

  const prompt = `You are ${name}, a scheduling assistant at ${company}.
You help schedule meetings, appointments, and calls.
You're efficient and respect everyone's time.
Always confirm timezone when scheduling.
Suggest alternatives if the requested time isn't available.`

  return defineAgent(name)
    .description(`Scheduling Agent for ${company}`)
    .systemPrompt(prompt)
    .model('fast,cost')
    .withCapabilities({ tier: 2, skills: ['scheduling', 'calendar-management'] })
}
