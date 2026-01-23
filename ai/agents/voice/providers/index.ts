/**
 * Voice Providers
 *
 * Factory-based access to voice AI provider adapters.
 * Individual adapter implementations are internal.
 *
 * @module ai/agents/voice/providers
 *
 * @example
 * ```typescript
 * import { VoiceProviderFactory } from 'do/ai/agents'
 *
 * // Create a provider adapter
 * const vapi = VoiceProviderFactory.create('vapi', {
 *   apiKey: process.env.VAPI_API_KEY!,
 * })
 *
 * // Or auto-select based on use case
 * const provider = VoiceProviderFactory.for('inbound-support')
 * ```
 */

// Export factory (main public interface)
export { VoiceProviderFactory } from './factory'

// Export types (needed for type annotations)
export type { VoiceProviderAdapter, ProviderAgentConfig, ProviderAgentResult, ProviderCallStatus, WebhookEventType, WebhookResult, VoiceUseCase } from './types'

// Note: Individual adapters (VapiAdapter, LiveKitAdapter, etc.) are NOT exported
// Users access providers through the factory only
