/**
 * Integration Types - Deep vs Generic Integrations
 *
 * DO has two tiers of integrations:
 *
 * DEEP INTEGRATIONS (Platform-level, tightly coupled):
 * - Stripe Connect - Payments, transfers, accounting, financial reporting
 * - WorkOS - Authentication, SSO, directory sync, RBAC/FGA
 * - GitHub - Git sync, code storage, PRs, issues, actions
 * - Cloudflare - Domains, DNS, SSL, email routing, workers
 * - Communication - Slack, Discord, Teams (human-in-the-loop)
 *
 * GENERIC INTEGRATIONS (Webhook/API-level, loosely coupled):
 * - OAuth connections to any service
 * - Webhook subscriptions
 * - API credentials
 */

// =============================================================================
// Deep Integration Registry
// =============================================================================

/**
 * Deep integration types (platform-level)
 */
export type DeepIntegrationType =
  | 'stripe'        // Stripe Connect - payments, accounting
  | 'workos'        // WorkOS - auth, SSO, directory, RBAC
  | 'github'        // GitHub - git sync, repos, PRs
  | 'cloudflare'    // Cloudflare - domains, DNS, workers
  | 'slack'         // Slack - human-in-the-loop
  | 'discord'       // Discord - human-in-the-loop
  | 'teams'         // Microsoft Teams - human-in-the-loop
  | 'ses'           // AWS SES - outbound email
  | 'mailchannels'  // Mailchannels - outbound email

/**
 * Deep integration status
 */
export type DeepIntegrationStatus =
  | 'NotConfigured'
  | 'PendingAuth'
  | 'Active'
  | 'Error'
  | 'Suspended'

/**
 * Deep integration base interface
 */
export interface DeepIntegration {
  type: DeepIntegrationType
  status: DeepIntegrationStatus
  connectedAt?: number
  lastActivityAt?: number
  error?: string
}

// =============================================================================
// Stripe Deep Integration
// =============================================================================

export interface StripeDeepIntegration extends DeepIntegration {
  type: 'stripe'
  /** Stripe Connect account ID */
  accountId?: string
  /** Account type */
  accountType?: 'standard' | 'express' | 'custom'
  /** Charges enabled */
  chargesEnabled?: boolean
  /** Payouts enabled */
  payoutsEnabled?: boolean
  /** Onboarding URL (for incomplete accounts) */
  onboardingUrl?: string
  /** Platform fee percentage */
  platformFeePercent?: number
}

// =============================================================================
// WorkOS Deep Integration
// =============================================================================

export interface WorkOSDeepIntegration extends DeepIntegration {
  type: 'workos'
  /** Organization ID in WorkOS */
  organizationId?: string
  /** SSO connection ID */
  ssoConnectionId?: string
  /** Directory sync connection ID */
  directoryConnectionId?: string
  /** Enabled features */
  features?: {
    sso?: boolean
    directorySync?: boolean
    adminPortal?: boolean
    auditLogs?: boolean
  }
  /** SSO providers configured */
  ssoProviders?: ('google' | 'microsoft' | 'okta' | 'onelogin' | 'azure' | 'adfs' | 'ping' | 'jumpcloud' | 'saml')[]
}

// =============================================================================
// GitHub Deep Integration
// =============================================================================

export interface GitHubDeepIntegration extends DeepIntegration {
  type: 'github'
  /** GitHub App installation ID */
  installationId?: string
  /** Repository (owner/repo) */
  repository?: string
  /** Branch */
  branch?: string
  /** Base path in repo */
  basePath?: string
  /** Permissions granted */
  permissions?: {
    contents?: 'read' | 'write'
    pullRequests?: 'read' | 'write'
    issues?: 'read' | 'write'
    actions?: 'read' | 'write'
    webhooks?: 'read' | 'write'
  }
  /** Webhook secret */
  webhookSecret?: string
  /** Last sync commit SHA */
  lastSyncSha?: string
}

// =============================================================================
// Cloudflare Deep Integration
// =============================================================================

export interface CloudflareDeepIntegration extends DeepIntegration {
  type: 'cloudflare'
  /** Account ID */
  accountId?: string
  /** Zone IDs managed */
  zoneIds?: string[]
  /** Workers namespace */
  workersNamespace?: string
  /** KV namespaces */
  kvNamespaces?: string[]
  /** R2 buckets */
  r2Buckets?: string[]
  /** D1 databases */
  d1Databases?: string[]
  /** Durable Object namespaces */
  durableObjectNamespaces?: string[]
}

// =============================================================================
// Communication Deep Integrations
// =============================================================================

export interface SlackDeepIntegration extends DeepIntegration {
  type: 'slack'
  /** Workspace ID */
  teamId?: string
  /** Workspace name */
  teamName?: string
  /** Bot user ID */
  botUserId?: string
  /** Scopes */
  scopes?: string[]
  /** Default channel for notifications */
  defaultChannelId?: string
}

export interface DiscordDeepIntegration extends DeepIntegration {
  type: 'discord'
  /** Guild ID */
  guildId?: string
  /** Guild name */
  guildName?: string
  /** Bot user ID */
  botUserId?: string
  /** Permissions */
  permissions?: string
  /** Default channel for notifications */
  defaultChannelId?: string
}

export interface TeamsDeepIntegration extends DeepIntegration {
  type: 'teams'
  /** Tenant ID */
  tenantId?: string
  /** Team ID */
  teamId?: string
  /** Team name */
  teamName?: string
  /** Default channel for notifications */
  defaultChannelId?: string
}

// =============================================================================
// Email Deep Integrations
// =============================================================================

export interface SESDeepIntegration extends DeepIntegration {
  type: 'ses'
  /** AWS Region */
  region?: string
  /** Verified identities (domains/emails) */
  verifiedIdentities?: string[]
  /** Configuration set */
  configurationSet?: string
  /** Sending quota */
  sendingQuota?: {
    max24HourSend: number
    maxSendRate: number
    sentLast24Hours: number
  }
}

export interface MailchannelsDeepIntegration extends DeepIntegration {
  type: 'mailchannels'
  /** Verified domains */
  verifiedDomains?: string[]
  /** DKIM configured */
  dkimConfigured?: boolean
}

// =============================================================================
// Generic Integrations
// =============================================================================

/**
 * Generic integration (loosely coupled)
 */
export interface GenericIntegration {
  id: string
  /** Integration name */
  name: string
  /** Provider/service name */
  provider: string
  /** Integration type */
  type: GenericIntegrationType
  /** Configuration */
  config: Record<string, unknown>
  /** Status */
  status: 'Active' | 'Inactive' | 'Error'
  /** Credentials reference */
  credentialId?: string
  /** Last used timestamp */
  lastUsedAt?: number
  /** Created timestamp */
  createdAt: number
  /** Updated timestamp */
  updatedAt: number
}

export type GenericIntegrationType =
  | 'oauth2'      // OAuth 2.0 connection
  | 'api_key'     // API key authentication
  | 'webhook'     // Inbound webhook
  | 'outbound'    // Outbound API calls
  | 'database'    // External database
  | 'storage'     // External storage (S3, GCS, etc.)

// =============================================================================
// OAuth 2.0 Connection
// =============================================================================

/**
 * OAuth 2.0 connection
 */
export interface OAuthConnection {
  id: string
  /** Provider name */
  provider: string
  /** OAuth client ID */
  clientId: string
  /** Scopes granted */
  scopes: string[]
  /** Access token (encrypted) */
  accessToken: string
  /** Refresh token (encrypted) */
  refreshToken?: string
  /** Token expiry timestamp */
  expiresAt?: number
  /** User info from provider */
  userInfo?: {
    id: string
    email?: string
    name?: string
    avatar?: string
  }
  /** Connected timestamp */
  connectedAt: number
  /** Last refreshed timestamp */
  lastRefreshedAt?: number
}

// =============================================================================
// Webhook Configuration
// =============================================================================

/**
 * Inbound webhook
 */
export interface InboundWebhook {
  id: string
  /** Webhook name */
  name: string
  /** Webhook path */
  path: string
  /** Expected source */
  source?: string
  /** Verification method */
  verification?: WebhookVerification
  /** Handler function ID */
  handlerId?: string
  /** Enabled */
  enabled: boolean
  /** Last received timestamp */
  lastReceivedAt?: number
  /** Total requests received */
  totalRequests: number
  /** Created timestamp */
  createdAt: number
}

export interface WebhookVerification {
  method: 'hmac' | 'signature' | 'bearer' | 'basic' | 'none'
  secret?: string
  header?: string
  algorithm?: 'sha256' | 'sha512'
}

/**
 * Outbound webhook
 */
export interface OutboundWebhook {
  id: string
  /** Webhook name */
  name: string
  /** Destination URL */
  url: string
  /** Events to trigger on */
  events: string[]
  /** HTTP method */
  method: 'POST' | 'PUT' | 'PATCH'
  /** Custom headers */
  headers?: Record<string, string>
  /** Signing secret */
  signingSecret?: string
  /** Retry policy */
  retryPolicy?: WebhookRetryPolicy
  /** Enabled */
  enabled: boolean
  /** Last triggered timestamp */
  lastTriggeredAt?: number
  /** Failure count */
  failureCount: number
  /** Created timestamp */
  createdAt: number
}

export interface WebhookRetryPolicy {
  maxAttempts: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

// =============================================================================
// Integration Operations
// =============================================================================

/**
 * Integration operations for a DO
 */
export interface IntegrationOperations {
  // Deep integrations
  getDeepIntegration<T extends DeepIntegration>(type: DeepIntegrationType): Promise<T | null>
  configureDeepIntegration<T extends DeepIntegration>(config: Partial<T>): Promise<T>
  disconnectDeepIntegration(type: DeepIntegrationType): Promise<boolean>

  // Generic integrations
  addIntegration(integration: Omit<GenericIntegration, 'id' | 'createdAt' | 'updatedAt'>): Promise<GenericIntegration>
  updateIntegration(id: string, updates: Partial<GenericIntegration>): Promise<GenericIntegration>
  removeIntegration(id: string): Promise<boolean>
  listIntegrations(type?: GenericIntegrationType): Promise<GenericIntegration[]>

  // OAuth
  connectOAuth(provider: string, authCode: string): Promise<OAuthConnection>
  refreshOAuth(connectionId: string): Promise<OAuthConnection>
  disconnectOAuth(connectionId: string): Promise<boolean>
  listOAuthConnections(): Promise<OAuthConnection[]>

  // Webhooks
  createInboundWebhook(webhook: Omit<InboundWebhook, 'id' | 'createdAt' | 'totalRequests'>): Promise<InboundWebhook>
  createOutboundWebhook(webhook: Omit<OutboundWebhook, 'id' | 'createdAt' | 'failureCount'>): Promise<OutboundWebhook>
  triggerOutboundWebhook(webhookId: string, payload: unknown): Promise<{ success: boolean; statusCode?: number }>
  listWebhooks(): Promise<{ inbound: InboundWebhook[]; outbound: OutboundWebhook[] }>
}

// =============================================================================
// Integration Events
// =============================================================================

/**
 * Integration event (for observability)
 */
export type IntegrationEvent =
  | { type: 'integration:connected'; payload: { integrationType: string } }
  | { type: 'integration:disconnected'; payload: { integrationType: string } }
  | { type: 'integration:error'; payload: { integrationType: string; error: string } }
  | { type: 'webhook:received'; payload: { webhookId: string; source?: string } }
  | { type: 'webhook:sent'; payload: { webhookId: string; success: boolean } }
  | { type: 'oauth:refreshed'; payload: { provider: string; connectionId: string } }
  | { type: 'oauth:expired'; payload: { provider: string; connectionId: string } }
