/**
 * Voice AI Provider Abstraction
 *
 * Unified interface across voice AI platforms:
 * - Vapi - Voice AI agents
 * - LiveKit - Real-time infrastructure
 * - Retell - Voice agents
 * - Bland - Phone AI
 * - Daily - WebRTC platform
 *
 * @module ai/voice/providers
 */

import type {
  VoiceAIProvider,
  VoiceAIProviderConfig,
  VoiceAgent,
  VoiceConfig,
  ConversationConfig,
  VoiceSession,
  VoiceSessionStatus,
  WebRTCConfig,
} from '../../types/voice-ai'

// =============================================================================
// Provider Adapter Interface
// =============================================================================

/**
 * Configuration for creating a voice agent in a provider's system
 */
export interface ProviderAgentConfig {
  /** Voice configuration */
  voice: VoiceConfig
  /** Conversation configuration */
  conversation: ConversationConfig
  /** Phone settings */
  phone?: {
    inboundNumber?: string
    outboundCallerId?: string
  }
  /** Webhook URLs */
  webhooks?: {
    onCallStart?: string
    onCallEnd?: string
    onTranscript?: string
    onToolCall?: string
  }
}

/**
 * Result of creating an agent in a provider's system
 */
export interface ProviderAgentResult {
  /** Provider-specific agent ID */
  providerAgentId: string
  /** Additional provider metadata */
  metadata?: Record<string, unknown>
}

/**
 * Provider call status
 */
export interface ProviderCallStatus {
  /** Provider call ID */
  callId: string
  /** Call status */
  status: VoiceSessionStatus
  /** Duration in seconds */
  duration?: number
  /** Recording URL if available */
  recordingUrl?: string
}

/**
 * Webhook event types
 */
export type WebhookEventType =
  | 'call_started'
  | 'call_ended'
  | 'call_ringing'
  | 'transcript'
  | 'tool_call'
  | 'transfer_requested'
  | 'error'

/**
 * Result of processing a webhook
 */
export interface WebhookResult {
  /** Event type */
  type: WebhookEventType
  /** Session ID */
  sessionId: string
  /** Event-specific data */
  data: Record<string, unknown>
}

/**
 * Voice provider adapter interface
 *
 * Each provider (Vapi, LiveKit, Retell, Bland) implements this interface
 * to provide a unified API for voice operations.
 */
export interface VoiceProviderAdapter {
  /** Provider identifier */
  readonly provider: VoiceAIProvider

  // -------------------------------------------------------------------------
  // Agent Management
  // -------------------------------------------------------------------------

  /**
   * Create a voice agent in the provider's system
   *
   * @param config - Agent configuration
   * @returns Provider-specific agent ID and metadata
   */
  createAgent(config: ProviderAgentConfig): Promise<ProviderAgentResult>

  /**
   * Update an existing agent
   *
   * @param providerAgentId - Provider's agent ID
   * @param config - Partial configuration to update
   */
  updateAgent(providerAgentId: string, config: Partial<ProviderAgentConfig>): Promise<void>

  /**
   * Delete an agent from the provider's system
   *
   * @param providerAgentId - Provider's agent ID
   */
  deleteAgent(providerAgentId: string): Promise<void>

  // -------------------------------------------------------------------------
  // Call Operations
  // -------------------------------------------------------------------------

  /**
   * Start an outbound call
   *
   * @param providerAgentId - Provider's agent ID
   * @param phone - Phone number to call
   * @param context - Optional context for the call
   * @returns Provider call ID
   */
  startCall(
    providerAgentId: string,
    phone: string,
    context?: Record<string, unknown>
  ): Promise<string>

  /**
   * End an active call
   *
   * @param providerCallId - Provider's call ID
   */
  endCall(providerCallId: string): Promise<void>

  /**
   * Get call status
   *
   * @param providerCallId - Provider's call ID
   * @returns Call status
   */
  getCall(providerCallId: string): Promise<ProviderCallStatus>

  // -------------------------------------------------------------------------
  // WebRTC (Optional - not all providers support)
  // -------------------------------------------------------------------------

  /**
   * Create a WebRTC room for browser-based calls
   *
   * @param providerAgentId - Provider's agent ID
   * @param identity - Participant identity
   * @returns Token and room URL
   */
  createRoom?(
    providerAgentId: string,
    identity: string
  ): Promise<{ token: string; roomUrl: string }>

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  /**
   * Parse and validate a webhook payload from this provider
   *
   * @param payload - Raw webhook payload
   * @param headers - Request headers (for signature verification)
   * @returns Parsed webhook result
   */
  handleWebhook(payload: unknown, headers?: Record<string, string>): Promise<WebhookResult>
}

// =============================================================================
// Provider Factory
// =============================================================================

/**
 * Use case hints for automatic provider selection
 */
export type VoiceUseCase =
  | 'outbound-campaign'   // Bulk outbound calling -> Bland
  | 'inbound-support'     // Inbound customer support -> Vapi
  | 'web-call'            // Browser-based calling -> LiveKit
  | 'voice-agent'         // General voice agent -> Retell
  | 'real-time'           // Low-latency real-time -> LiveKit

/**
 * Provider factory for creating voice provider adapters
 */
export class VoiceProviderFactory {
  private static adapters = new Map<VoiceAIProvider, VoiceProviderAdapter>()
  private static configs = new Map<VoiceAIProvider, VoiceAIProviderConfig>()

  /**
   * Register a provider adapter
   *
   * @param adapter - Provider adapter instance
   */
  static register(adapter: VoiceProviderAdapter): void {
    this.adapters.set(adapter.provider, adapter)
  }

  /**
   * Configure a provider with API credentials
   *
   * @param config - Provider configuration
   */
  static configure(config: VoiceAIProviderConfig): void {
    this.configs.set(config.provider, config)
  }

  /**
   * Get a provider adapter by name
   *
   * @param provider - Provider name
   * @returns Provider adapter
   * @throws Error if provider not registered or configured
   */
  static get(provider: VoiceAIProvider): VoiceProviderAdapter {
    const adapter = this.adapters.get(provider)
    if (!adapter) {
      throw new Error(`Voice provider not registered: ${provider}`)
    }
    return adapter
  }

  /**
   * Auto-select a provider based on use case
   *
   * @param useCase - Use case hint
   * @returns Best provider for the use case
   */
  static for(useCase: VoiceUseCase): VoiceProviderAdapter {
    const providerMap: Record<VoiceUseCase, VoiceAIProvider> = {
      'outbound-campaign': 'bland',
      'inbound-support': 'vapi',
      'web-call': 'livekit',
      'voice-agent': 'retell',
      'real-time': 'livekit',
    }

    const provider = providerMap[useCase]
    return this.get(provider)
  }

  /**
   * Create a new provider adapter with configuration
   *
   * @param provider - Provider name
   * @param config - Provider configuration
   * @returns Configured provider adapter
   */
  static create(provider: VoiceAIProvider, config: Omit<VoiceAIProviderConfig, 'provider'>): VoiceProviderAdapter {
    // TODO: Implement provider-specific adapter creation
    throw new Error(`Not implemented: create adapter for ${provider}`)
  }

  /**
   * Check if a provider is available (registered and configured)
   *
   * @param provider - Provider name
   * @returns True if provider is available
   */
  static isAvailable(provider: VoiceAIProvider): boolean {
    return this.adapters.has(provider) && this.configs.has(provider)
  }

  /**
   * List all available providers
   *
   * @returns Array of available provider names
   */
  static listAvailable(): VoiceAIProvider[] {
    return Array.from(this.adapters.keys()).filter((p) => this.configs.has(p))
  }
}

// =============================================================================
// Provider Implementations (Stubs)
// =============================================================================

/**
 * Vapi provider adapter
 *
 * @see https://docs.vapi.ai
 */
export class VapiAdapter implements VoiceProviderAdapter {
  readonly provider: VoiceAIProvider = 'vapi'

  constructor(private config: VoiceAIProviderConfig) {
    if (config.provider !== 'vapi') {
      throw new Error('Invalid provider config for VapiAdapter')
    }
  }

  async createAgent(config: ProviderAgentConfig): Promise<ProviderAgentResult> {
    // TODO: Implement Vapi agent creation
    throw new Error('Not implemented: VapiAdapter.createAgent')
  }

  async updateAgent(providerAgentId: string, config: Partial<ProviderAgentConfig>): Promise<void> {
    // TODO: Implement Vapi agent update
    throw new Error('Not implemented: VapiAdapter.updateAgent')
  }

  async deleteAgent(providerAgentId: string): Promise<void> {
    // TODO: Implement Vapi agent deletion
    throw new Error('Not implemented: VapiAdapter.deleteAgent')
  }

  async startCall(providerAgentId: string, phone: string, context?: Record<string, unknown>): Promise<string> {
    // TODO: Implement Vapi call start
    throw new Error('Not implemented: VapiAdapter.startCall')
  }

  async endCall(providerCallId: string): Promise<void> {
    // TODO: Implement Vapi call end
    throw new Error('Not implemented: VapiAdapter.endCall')
  }

  async getCall(providerCallId: string): Promise<ProviderCallStatus> {
    // TODO: Implement Vapi call status
    throw new Error('Not implemented: VapiAdapter.getCall')
  }

  async createRoom(providerAgentId: string, identity: string): Promise<{ token: string; roomUrl: string }> {
    // TODO: Implement Vapi WebRTC (if supported)
    throw new Error('Not implemented: VapiAdapter.createRoom')
  }

  async handleWebhook(payload: unknown, headers?: Record<string, string>): Promise<WebhookResult> {
    // TODO: Implement Vapi webhook handling
    throw new Error('Not implemented: VapiAdapter.handleWebhook')
  }
}

/**
 * LiveKit provider adapter
 *
 * @see https://docs.livekit.io
 */
export class LiveKitAdapter implements VoiceProviderAdapter {
  readonly provider: VoiceAIProvider = 'livekit'

  constructor(private config: VoiceAIProviderConfig) {
    if (config.provider !== 'livekit') {
      throw new Error('Invalid provider config for LiveKitAdapter')
    }
  }

  async createAgent(config: ProviderAgentConfig): Promise<ProviderAgentResult> {
    // TODO: Implement LiveKit agent creation
    throw new Error('Not implemented: LiveKitAdapter.createAgent')
  }

  async updateAgent(providerAgentId: string, config: Partial<ProviderAgentConfig>): Promise<void> {
    // TODO: Implement LiveKit agent update
    throw new Error('Not implemented: LiveKitAdapter.updateAgent')
  }

  async deleteAgent(providerAgentId: string): Promise<void> {
    // TODO: Implement LiveKit agent deletion
    throw new Error('Not implemented: LiveKitAdapter.deleteAgent')
  }

  async startCall(providerAgentId: string, phone: string, context?: Record<string, unknown>): Promise<string> {
    // TODO: Implement LiveKit call start (via SIP trunk)
    throw new Error('Not implemented: LiveKitAdapter.startCall')
  }

  async endCall(providerCallId: string): Promise<void> {
    // TODO: Implement LiveKit call end
    throw new Error('Not implemented: LiveKitAdapter.endCall')
  }

  async getCall(providerCallId: string): Promise<ProviderCallStatus> {
    // TODO: Implement LiveKit call status
    throw new Error('Not implemented: LiveKitAdapter.getCall')
  }

  async createRoom(providerAgentId: string, identity: string): Promise<{ token: string; roomUrl: string }> {
    // TODO: Implement LiveKit room creation with access token
    throw new Error('Not implemented: LiveKitAdapter.createRoom')
  }

  async handleWebhook(payload: unknown, headers?: Record<string, string>): Promise<WebhookResult> {
    // TODO: Implement LiveKit webhook handling
    throw new Error('Not implemented: LiveKitAdapter.handleWebhook')
  }
}

/**
 * Retell AI provider adapter
 *
 * @see https://docs.retellai.com
 */
export class RetellAdapter implements VoiceProviderAdapter {
  readonly provider: VoiceAIProvider = 'retell'

  constructor(private config: VoiceAIProviderConfig) {
    if (config.provider !== 'retell') {
      throw new Error('Invalid provider config for RetellAdapter')
    }
  }

  async createAgent(config: ProviderAgentConfig): Promise<ProviderAgentResult> {
    // TODO: Implement Retell agent creation
    throw new Error('Not implemented: RetellAdapter.createAgent')
  }

  async updateAgent(providerAgentId: string, config: Partial<ProviderAgentConfig>): Promise<void> {
    // TODO: Implement Retell agent update
    throw new Error('Not implemented: RetellAdapter.updateAgent')
  }

  async deleteAgent(providerAgentId: string): Promise<void> {
    // TODO: Implement Retell agent deletion
    throw new Error('Not implemented: RetellAdapter.deleteAgent')
  }

  async startCall(providerAgentId: string, phone: string, context?: Record<string, unknown>): Promise<string> {
    // TODO: Implement Retell call start
    throw new Error('Not implemented: RetellAdapter.startCall')
  }

  async endCall(providerCallId: string): Promise<void> {
    // TODO: Implement Retell call end
    throw new Error('Not implemented: RetellAdapter.endCall')
  }

  async getCall(providerCallId: string): Promise<ProviderCallStatus> {
    // TODO: Implement Retell call status
    throw new Error('Not implemented: RetellAdapter.getCall')
  }

  async createRoom(providerAgentId: string, identity: string): Promise<{ token: string; roomUrl: string }> {
    // TODO: Implement Retell WebRTC
    throw new Error('Not implemented: RetellAdapter.createRoom')
  }

  async handleWebhook(payload: unknown, headers?: Record<string, string>): Promise<WebhookResult> {
    // TODO: Implement Retell webhook handling
    throw new Error('Not implemented: RetellAdapter.handleWebhook')
  }
}

/**
 * Bland AI provider adapter
 *
 * @see https://docs.bland.ai
 */
export class BlandAdapter implements VoiceProviderAdapter {
  readonly provider: VoiceAIProvider = 'bland'

  constructor(private config: VoiceAIProviderConfig) {
    if (config.provider !== 'bland') {
      throw new Error('Invalid provider config for BlandAdapter')
    }
  }

  async createAgent(config: ProviderAgentConfig): Promise<ProviderAgentResult> {
    // TODO: Implement Bland agent creation
    throw new Error('Not implemented: BlandAdapter.createAgent')
  }

  async updateAgent(providerAgentId: string, config: Partial<ProviderAgentConfig>): Promise<void> {
    // TODO: Implement Bland agent update
    throw new Error('Not implemented: BlandAdapter.updateAgent')
  }

  async deleteAgent(providerAgentId: string): Promise<void> {
    // TODO: Implement Bland agent deletion
    throw new Error('Not implemented: BlandAdapter.deleteAgent')
  }

  async startCall(providerAgentId: string, phone: string, context?: Record<string, unknown>): Promise<string> {
    // TODO: Implement Bland call start
    throw new Error('Not implemented: BlandAdapter.startCall')
  }

  async endCall(providerCallId: string): Promise<void> {
    // TODO: Implement Bland call end
    throw new Error('Not implemented: BlandAdapter.endCall')
  }

  async getCall(providerCallId: string): Promise<ProviderCallStatus> {
    // TODO: Implement Bland call status
    throw new Error('Not implemented: BlandAdapter.getCall')
  }

  async handleWebhook(payload: unknown, headers?: Record<string, string>): Promise<WebhookResult> {
    // TODO: Implement Bland webhook handling
    throw new Error('Not implemented: BlandAdapter.handleWebhook')
  }
}

// =============================================================================
// Exports
// =============================================================================

export { VoiceProviderFactory as VoiceProvider }
