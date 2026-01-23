/**
 * Voice Provider Types
 *
 * Core interfaces for voice AI provider adapters.
 * These are used internally by the voice modality system.
 *
 * @internal
 * @module ai/agents/voice/providers/types
 */

import type { VoiceAIProvider, VoiceConfig, ConversationConfig, VoiceSessionStatus } from '../../../../types/voice-ai'

// =============================================================================
// Provider Agent Configuration
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

// =============================================================================
// Webhook Types
// =============================================================================

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

// =============================================================================
// Provider Adapter Interface
// =============================================================================

/**
 * Voice provider adapter interface
 *
 * Each provider (Vapi, LiveKit, Retell, Bland) implements this interface
 * to provide a unified API for voice operations.
 */
export interface VoiceProviderAdapter {
  /** Provider identifier */
  readonly provider: VoiceAIProvider

  // Agent Management
  createAgent(config: ProviderAgentConfig): Promise<ProviderAgentResult>
  updateAgent(providerAgentId: string, config: Partial<ProviderAgentConfig>): Promise<void>
  deleteAgent(providerAgentId: string): Promise<void>

  // Call Operations
  startCall(providerAgentId: string, phone: string, context?: Record<string, unknown>): Promise<string>
  endCall(providerCallId: string): Promise<void>
  getCall(providerCallId: string): Promise<ProviderCallStatus>

  // WebRTC (Optional)
  createRoom?(providerAgentId: string, identity: string): Promise<{ token: string; roomUrl: string }>

  // Webhooks
  handleWebhook(payload: unknown, headers?: Record<string, string>): Promise<WebhookResult>
}

// =============================================================================
// Use Case Selection
// =============================================================================

/**
 * Use case hints for automatic provider selection
 */
export type VoiceUseCase =
  | 'outbound-campaign' // Bulk outbound calling -> Bland
  | 'inbound-support' // Inbound customer support -> Vapi
  | 'web-call' // Browser-based calling -> LiveKit
  | 'voice-agent' // General voice agent -> Retell
  | 'real-time' // Low-latency real-time -> LiveKit
