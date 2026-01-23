/**
 * Voice Modality
 *
 * Voice capabilities for agents. Provides factory-based access to
 * voice AI providers (Vapi, LiveKit, Retell, Bland).
 *
 * Voice is a MODALITY - agents have personalities, voice is how they speak.
 * This module provides the infrastructure for voice communication.
 *
 * @module ai/agents/voice
 *
 * @example
 * ```typescript
 * import { VoiceProviderFactory, defineAgent, enableVoice } from 'do/ai/agents'
 *
 * // Configure voice provider
 * VoiceProviderFactory.create('vapi', {
 *   apiKey: process.env.VAPI_API_KEY!,
 * })
 *
 * // Define an agent with voice
 * const agent = defineAgent('Sarah')
 *   .description('Customer Support Agent')
 *   .systemPrompt('You are Sarah, a helpful support agent...')
 *   .model('fast')
 *   .withVoice({
 *     provider: 'vapi',
 *     voiceId: 'sarah',
 *   })
 *   .build()
 *
 * // Or enable voice on existing agent
 * const voiceAgent = enableVoice(agent, 'vapi', {
 *   voiceId: 'sarah',
 *   voiceProvider: 'elevenlabs',
 * })
 * ```
 */

// Re-export voice providers
export {
  VoiceProviderFactory,
  type VoiceProviderAdapter,
  type ProviderAgentConfig,
  type ProviderAgentResult,
  type ProviderCallStatus,
  type WebhookEventType,
  type WebhookResult,
  type VoiceUseCase,
} from './providers'
