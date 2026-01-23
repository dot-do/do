/**
 * Voice Provider Factory
 *
 * Factory for creating and managing voice provider adapters.
 * Users access providers through this factory, not by importing adapters directly.
 *
 * @module ai/agents/voice/providers/factory
 */

import type { VoiceAIProvider, VoiceAIProviderConfig } from '../../../../types/voice-ai'
import type { VoiceProviderAdapter, VoiceUseCase } from './types'
import { VapiAdapter } from './vapi'
import { LiveKitAdapter } from './livekit'
import { RetellAdapter } from './retell'
import { BlandAdapter } from './bland'

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
   * This is the primary way to create provider adapters.
   *
   * @param provider - Provider name
   * @param config - Provider configuration
   * @returns Configured provider adapter
   *
   * @example
   * ```typescript
   * const vapi = VoiceProviderFactory.create('vapi', {
   *   apiKey: process.env.VAPI_API_KEY!,
   * })
   * ```
   */
  static create(provider: VoiceAIProvider, config: Omit<VoiceAIProviderConfig, 'provider'>): VoiceProviderAdapter {
    const fullConfig: VoiceAIProviderConfig = { ...config, provider } as VoiceAIProviderConfig

    let adapter: VoiceProviderAdapter

    switch (provider) {
      case 'vapi':
        adapter = new VapiAdapter(fullConfig)
        break
      case 'livekit':
        adapter = new LiveKitAdapter(fullConfig)
        break
      case 'retell':
        adapter = new RetellAdapter(fullConfig)
        break
      case 'bland':
        adapter = new BlandAdapter(fullConfig)
        break
      default:
        throw new Error(`Unsupported voice provider: ${provider}`)
    }

    this.adapters.set(provider, adapter)
    this.configs.set(provider, fullConfig)

    return adapter
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

  /**
   * Clear all registered providers
   *
   * Useful for testing or reconfiguration.
   */
  static clear(): void {
    this.adapters.clear()
    this.configs.clear()
  }
}
