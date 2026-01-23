/**
 * Communication Provider Registry
 *
 * Central registry for discovering and instantiating communication providers.
 * Follows the provider pattern from primitives.org.ai.
 *
 * @module communication/registry
 */

import type {
  BaseProvider,
  ProviderCategory,
  ProviderConfig,
  ProviderFactory,
  ProviderInfo,
  RegisteredProvider,
  EmailProvider,
  PhoneProvider,
  SmsProvider,
  MessagingProvider,
} from './types'

// =============================================================================
// Provider Registry
// =============================================================================

/**
 * Global provider registry
 */
const registry = new Map<string, RegisteredProvider>()

/**
 * Register a provider
 *
 * @param info - Provider metadata
 * @param factory - Factory function to create provider instances
 *
 * @example
 * ```typescript
 * registerProvider(
 *   { id: 'ses', name: 'Amazon SES', category: 'email', ... },
 *   async (config) => new SESProvider(config)
 * )
 * ```
 */
export function registerProvider<T extends BaseProvider>(
  info: ProviderInfo,
  factory: ProviderFactory<T>
): void {
  registry.set(info.id, { info, factory })
}

/**
 * Get a registered provider by ID
 *
 * @param providerId - Provider identifier
 * @returns Registered provider or undefined
 *
 * @example
 * ```typescript
 * const provider = getProvider('ses')
 * if (provider) {
 *   console.log(provider.info.name) // "Amazon SES"
 * }
 * ```
 */
export function getProvider<T extends BaseProvider>(
  providerId: string
): RegisteredProvider<T> | undefined {
  return registry.get(providerId) as RegisteredProvider<T> | undefined
}

/**
 * List all registered providers, optionally filtered by category
 *
 * @param category - Optional category filter
 * @returns List of registered providers
 *
 * @example
 * ```typescript
 * const emailProviders = listProviders('email')
 * emailProviders.forEach(p => console.log(p.info.name))
 * ```
 */
export function listProviders(category?: ProviderCategory): RegisteredProvider[] {
  const all = Array.from(registry.values())
  if (category) {
    return all.filter((p) => p.info.category === category)
  }
  return all
}

/**
 * Check if a provider is registered
 *
 * @param providerId - Provider identifier
 * @returns True if provider exists
 */
export function hasProvider(providerId: string): boolean {
  return registry.has(providerId)
}

/**
 * Create a provider instance
 *
 * @param providerId - Provider identifier
 * @param config - Provider configuration
 * @returns Initialized provider instance
 *
 * @example
 * ```typescript
 * const ses = await createProvider<EmailProvider>('ses', {
 *   accessKeyId: '...',
 *   secretAccessKey: '...',
 * })
 *
 * await ses.send({ to: ['user@example.com'], subject: 'Hello', text: 'World' })
 * ```
 */
export async function createProvider<T extends BaseProvider>(
  providerId: string,
  config: ProviderConfig
): Promise<T> {
  const registered = registry.get(providerId)
  if (!registered) {
    throw new Error(`Provider not found: ${providerId}`)
  }

  // Validate required config
  for (const key of registered.info.requiredConfig) {
    if (config[key] === undefined) {
      throw new Error(`Missing required config: ${key} for provider ${providerId}`)
    }
  }

  const provider = (await registered.factory(config)) as T
  await provider.initialize(config)
  return provider
}

// =============================================================================
// Typed Provider Creation Helpers
// =============================================================================

/**
 * Create an email provider instance
 *
 * @param providerId - Email provider ID (e.g., 'ses', 'mailchannels', 'resend')
 * @param config - Provider configuration
 * @returns Initialized email provider
 *
 * @example
 * ```typescript
 * const email = await createEmailProvider('ses', {
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
 *   region: 'us-east-1',
 * })
 * ```
 */
export async function createEmailProvider(
  providerId: string,
  config: ProviderConfig
): Promise<EmailProvider> {
  return createProvider<EmailProvider>(providerId, config)
}

/**
 * Create a phone provider instance
 *
 * @param providerId - Phone provider ID (e.g., 'twilio', 'telnyx', 'plivo')
 * @param config - Provider configuration
 * @returns Initialized phone provider
 *
 * @example
 * ```typescript
 * const phone = await createPhoneProvider('telnyx', {
 *   apiKey: process.env.TELNYX_API_KEY,
 * })
 * ```
 */
export async function createPhoneProvider(
  providerId: string,
  config: ProviderConfig
): Promise<PhoneProvider> {
  return createProvider<PhoneProvider>(providerId, config)
}

/**
 * Create an SMS provider instance
 *
 * @param providerId - SMS provider ID (e.g., 'twilio', 'telnyx', 'plivo')
 * @param config - Provider configuration
 * @returns Initialized SMS provider
 *
 * @example
 * ```typescript
 * const sms = await createSmsProvider('twilio', {
 *   accountId: process.env.TWILIO_ACCOUNT_SID,
 *   authToken: process.env.TWILIO_AUTH_TOKEN,
 * })
 * ```
 */
export async function createSmsProvider(
  providerId: string,
  config: ProviderConfig
): Promise<SmsProvider> {
  return createProvider<SmsProvider>(providerId, config)
}

/**
 * Create a messaging provider instance
 *
 * @param providerId - Messaging provider ID (e.g., 'slack', 'discord', 'teams')
 * @param config - Provider configuration
 * @returns Initialized messaging provider
 *
 * @example
 * ```typescript
 * const slack = await createMessagingProvider('slack', {
 *   accessToken: process.env.SLACK_BOT_TOKEN,
 * })
 * ```
 */
export async function createMessagingProvider(
  providerId: string,
  config: ProviderConfig
): Promise<MessagingProvider> {
  return createProvider<MessagingProvider>(providerId, config)
}

// =============================================================================
// Provider Registry Class (Alternative API)
// =============================================================================

/**
 * Provider registry class for object-oriented usage
 *
 * @example
 * ```typescript
 * const registry = new ProviderRegistry()
 *
 * registry.register(sesInfo, sesFactory)
 * registry.register(twilioInfo, twilioFactory)
 *
 * const ses = await registry.create<EmailProvider>('ses', config)
 * ```
 */
export class ProviderRegistry {
  private providers = new Map<string, RegisteredProvider>()

  /**
   * Register a provider
   */
  register<T extends BaseProvider>(info: ProviderInfo, factory: ProviderFactory<T>): void {
    this.providers.set(info.id, { info, factory })
  }

  /**
   * Get provider by ID
   */
  get<T extends BaseProvider>(providerId: string): RegisteredProvider<T> | undefined {
    return this.providers.get(providerId) as RegisteredProvider<T> | undefined
  }

  /**
   * List providers by category
   */
  list(category?: ProviderCategory): RegisteredProvider[] {
    const all = Array.from(this.providers.values())
    if (category) {
      return all.filter((p) => p.info.category === category)
    }
    return all
  }

  /**
   * Check if provider exists
   */
  has(providerId: string): boolean {
    return this.providers.has(providerId)
  }

  /**
   * Create provider instance
   */
  async create<T extends BaseProvider>(providerId: string, config: ProviderConfig): Promise<T> {
    const registered = this.providers.get(providerId)
    if (!registered) {
      throw new Error(`Provider not found: ${providerId}`)
    }

    for (const key of registered.info.requiredConfig) {
      if (config[key] === undefined) {
        throw new Error(`Missing required config: ${key} for provider ${providerId}`)
      }
    }

    const provider = (await registered.factory(config)) as T
    await provider.initialize(config)
    return provider
  }
}

// =============================================================================
// Failover Support
// =============================================================================

/**
 * Create a provider with failover support
 *
 * @param primaryId - Primary provider ID
 * @param fallbackIds - Fallback provider IDs in order of preference
 * @param config - Configuration (can include provider-specific nested configs)
 * @returns Provider that automatically fails over
 *
 * @example
 * ```typescript
 * const phone = await createWithFailover<PhoneProvider>(
 *   'telnyx',
 *   ['twilio', 'plivo'],
 *   {
 *     telnyx: { apiKey: '...' },
 *     twilio: { accountId: '...', authToken: '...' },
 *     plivo: { authId: '...', authToken: '...' },
 *   }
 * )
 * ```
 */
export async function createWithFailover<T extends BaseProvider>(
  primaryId: string,
  fallbackIds: string[],
  config: Record<string, ProviderConfig>
): Promise<T & { failover: (error: Error) => Promise<T> }> {
  let currentIndex = 0
  const providerIds = [primaryId, ...fallbackIds]
  let currentProvider: T | null = null

  async function getProvider(): Promise<T> {
    if (currentProvider) return currentProvider

    const providerId = providerIds[currentIndex]
    if (!providerId) {
      throw new Error('All providers exhausted')
    }

    const providerConfig = config[providerId]
    if (!providerConfig) {
      throw new Error(`No config provided for provider: ${providerId}`)
    }

    currentProvider = await createProvider<T>(providerId, providerConfig)
    return currentProvider
  }

  async function failover(error: Error): Promise<T> {
    console.warn(`Provider ${providerIds[currentIndex]} failed: ${error.message}. Failing over...`)

    if (currentProvider) {
      await currentProvider.dispose().catch(() => {})
    }
    currentProvider = null
    currentIndex++

    if (currentIndex >= providerIds.length) {
      throw new Error(`All providers failed. Last error: ${error.message}`)
    }

    return getProvider()
  }

  const primary = await getProvider()

  return Object.assign(primary, { failover })
}
