/**
 * Deep Integrations Module (Epic 5)
 *
 * Integration layer for external services:
 * - Stripe Connect (payments, subscriptions)
 * - Slack/Discord/Teams (communication)
 * - GitHub (code sync)
 * - Twilio (telephony)
 * - And more...
 */

/**
 * Integration credentials (simplified)
 */
export interface IntegrationCredentials {
  [key: string]: string | undefined
}

/**
 * Integration status type
 */
export type IntegrationStatus = 'pending' | 'active' | 'error' | 'inactive'

/**
 * Integration capability
 */
export type IntegrationCapability =
  | 'sync'
  | 'webhook'
  | 'oauth'
  | 'api'
  | 'realtime'

/**
 * Integration record used by IntegrationManager
 */
export interface Integration {
  id: string
  /** Integration type */
  type: string
  /** Integration name */
  name?: string
  /** Configuration */
  config: Record<string, unknown>
  /** Credentials */
  credentials?: IntegrationCredentials
  /** Status */
  status: IntegrationStatus
  /** Error message */
  error?: string
  /** Last sync timestamp */
  lastSyncAt?: number
  /** Created timestamp */
  createdAt: number
  /** Updated timestamp */
  updatedAt: number
}

/**
 * Integration handler interface
 */
export interface IntegrationHandler<TConfig = unknown> {
  /** Integration type */
  type: string
  /** Initialize the integration */
  init(config: TConfig, credentials: IntegrationCredentials): Promise<void>
  /** Test the connection */
  test(): Promise<{ success: boolean; error?: string }>
  /** Sync data */
  sync(): Promise<void>
  /** Handle incoming webhook */
  handleWebhook(payload: unknown): Promise<void>
  /** Get capabilities */
  getCapabilities(): IntegrationCapability[]
}

/**
 * Integration manager options
 */
export interface IntegrationManagerOptions {
  /** Default sync interval in ms */
  syncInterval?: number
}

/**
 * Integration Manager - manages external service integrations
 */
export class IntegrationManager {
  private integrations: Map<string, Integration> = new Map()
  private handlers: Map<string, IntegrationHandler> = new Map()
  private options: IntegrationManagerOptions

  constructor(options: IntegrationManagerOptions = {}) {
    this.options = {
      syncInterval: 60000, // 1 minute
      ...options,
    }
  }

  /**
   * Register an integration handler
   */
  registerHandler(handler: IntegrationHandler): void {
    this.handlers.set(handler.type, handler)
  }

  /**
   * Add a new integration
   */
  async add(integration: Omit<Integration, 'id' | 'createdAt' | 'updatedAt'>): Promise<Integration> {
    const id = generateIntegrationId()
    const now = Date.now()

    const newIntegration: Integration = {
      ...integration,
      id,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }

    // Initialize with handler if available
    const handler = this.handlers.get(integration.type)
    if (handler && integration.credentials) {
      try {
        await handler.init(integration.config, integration.credentials)
        newIntegration.status = 'active'
      } catch (error) {
        newIntegration.status = 'error'
        newIntegration.error = error instanceof Error ? error.message : 'Unknown error'
      }
    }

    this.integrations.set(id, newIntegration)
    return newIntegration
  }

  /**
   * Get an integration by ID
   */
  get(id: string): Integration | undefined {
    return this.integrations.get(id)
  }

  /**
   * List all integrations
   */
  list(type?: string): Integration[] {
    const all = Array.from(this.integrations.values())
    if (type) {
      return all.filter((i) => i.type === type)
    }
    return all
  }

  /**
   * Update an integration
   */
  async update(
    id: string,
    updates: Partial<Omit<Integration, 'id' | 'createdAt'>>
  ): Promise<Integration> {
    const existing = this.integrations.get(id)
    if (!existing) {
      throw new Error(`Integration not found: ${id}`)
    }

    const updated: Integration = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    }

    this.integrations.set(id, updated)
    return updated
  }

  /**
   * Remove an integration
   */
  async remove(id: string): Promise<void> {
    if (!this.integrations.has(id)) {
      throw new Error(`Integration not found: ${id}`)
    }
    this.integrations.delete(id)
  }

  /**
   * Test an integration connection
   */
  async test(id: string): Promise<{ success: boolean; error?: string }> {
    const integration = this.integrations.get(id)
    if (!integration) {
      return { success: false, error: `Integration not found: ${id}` }
    }

    const handler = this.handlers.get(integration.type)
    if (!handler) {
      return { success: false, error: `No handler for type: ${integration.type}` }
    }

    return handler.test()
  }

  /**
   * Sync an integration
   */
  async sync(id: string): Promise<void> {
    const integration = this.integrations.get(id)
    if (!integration) {
      throw new Error(`Integration not found: ${id}`)
    }

    const handler = this.handlers.get(integration.type)
    if (!handler) {
      throw new Error(`No handler for type: ${integration.type}`)
    }

    try {
      await handler.sync()
      await this.update(id, { lastSyncAt: Date.now(), status: 'active' })
    } catch (error) {
      await this.update(id, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Sync failed',
      })
      throw error
    }
  }

  /**
   * Handle an incoming webhook
   */
  async handleWebhook(type: string, payload: unknown): Promise<void> {
    const handler = this.handlers.get(type)
    if (!handler) {
      throw new Error(`No handler for type: ${type}`)
    }

    await handler.handleWebhook(payload)
  }
}

/**
 * Generate a unique integration ID
 */
function generateIntegrationId(): string {
  return `int_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Create an integration manager
 */
export function createIntegrationManager(
  options?: IntegrationManagerOptions
): IntegrationManager {
  return new IntegrationManager(options)
}

/**
 * Well-known integration types
 */
export const IntegrationTypes = {
  // Payments
  STRIPE: 'stripe',
  STRIPE_CONNECT: 'stripe-connect',

  // Communication
  SLACK: 'slack',
  DISCORD: 'discord',
  TEAMS: 'teams',
  EMAIL: 'email',

  // Code & Version Control
  GITHUB: 'github',
  GITLAB: 'gitlab',

  // Telephony
  TWILIO: 'twilio',
  VONAGE: 'vonage',

  // Cloud Storage
  S3: 's3',
  GCS: 'gcs',
  R2: 'r2',

  // Analytics
  POSTHOG: 'posthog',
  MIXPANEL: 'mixpanel',
  AMPLITUDE: 'amplitude',

  // CRM
  SALESFORCE: 'salesforce',
  HUBSPOT: 'hubspot',

  // Generic
  WEBHOOK: 'webhook',
  REST: 'rest',
  GRAPHQL: 'graphql',
} as const

// Types are already exported above via interface/type declarations

// =============================================================================
// Deep Integrations (Platform-Level)
// =============================================================================

// Base integration infrastructure
export {
  BaseIntegration,
  IntegrationError,
  verifyWebhookSignature,
  withRetry,
} from './base'
export type {
  BaseIntegrationConfig,
  CredentialStore,
  IntegrationEventEmitter,
  HealthCheckResult,
  HealthCheckOptions,
  WebhookPayload,
  WebhookResult,
  IIntegration,
} from './base'

// Stripe Connect integration
export { StripeIntegration } from './stripe'
export type {
  StripeConnectConfig,
  CreatePaymentIntentConfig,
  CreateSubscriptionConfig,
  CreatePayoutConfig,
  PaymentIntent,
  Subscription,
  Payout,
  OnboardingResult,
} from './stripe'

// WorkOS integration
export { WorkOSIntegration } from './workos'
export type {
  WorkOSConnectConfig,
  SSOConnectionConfig,
  SSOProvider,
  DirectorySyncConfig,
  DirectoryProvider,
  SSOAuthorizationUrl,
  SSOProfile,
  DirectoryUser,
  DirectoryGroup,
  AdminPortalLink,
  AuditLogEvent,
} from './workos'

// GitHub integration
export { GitHubIntegration } from './github'
export type {
  GitHubConnectConfig,
  RepositoryPermissions,
  FileContent,
  CommitConfig,
  PullRequestConfig,
  Repository,
  FileMetadata,
  Commit,
  PullRequest,
  Issue,
  WorkflowRun,
  SyncResult,
} from './github'

// Cloudflare integration
export { CloudflareIntegration } from './cloudflare'
export type {
  CloudflareConnectConfig,
  ZoneConfig,
  DNSRecordConfig,
  DNSRecordType,
  WorkerConfig,
  WorkerBinding,
  KVNamespaceConfig,
  R2BucketConfig,
  D1DatabaseConfig,
  Zone,
  DNSRecord,
  Worker,
  WorkerRoute,
  KVNamespace,
  R2Bucket,
  D1Database,
  SSLCertificate,
} from './cloudflare'
