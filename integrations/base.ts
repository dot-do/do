/**
 * Base Integration Module
 *
 * Provides the foundational interface and abstract class for all deep integrations.
 * All platform-level integrations (Stripe, WorkOS, GitHub, Cloudflare) extend this base.
 *
 * @module integrations/base
 */

import type {
  DeepIntegration,
  DeepIntegrationType,
  DeepIntegrationStatus,
  IntegrationEvent,
} from '../types/integrations';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Base configuration for all integrations
 */
export interface BaseIntegrationConfig {
  /** DO instance ID this integration belongs to */
  doId: string;
  /** Workspace/team ID */
  workspaceId?: string;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Credential storage interface
 * Implementations should encrypt credentials at rest
 */
export interface CredentialStore {
  /**
   * Store a credential securely
   * @param key - Unique key for the credential
   * @param value - The credential value to store
   * @param metadata - Optional metadata about the credential
   */
  set(key: string, value: string, metadata?: Record<string, unknown>): Promise<void>;

  /**
   * Retrieve a credential
   * @param key - The credential key
   * @returns The credential value or null if not found
   */
  get(key: string): Promise<string | null>;

  /**
   * Delete a credential
   * @param key - The credential key
   */
  delete(key: string): Promise<void>;

  /**
   * Check if a credential exists
   * @param key - The credential key
   */
  has(key: string): Promise<boolean>;
}

/**
 * Event emitter interface for integration events
 */
export interface IntegrationEventEmitter {
  /**
   * Emit an integration event
   * @param event - The event to emit
   */
  emit(event: IntegrationEvent): void;

  /**
   * Subscribe to integration events
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  subscribe(handler: (event: IntegrationEvent) => void): () => void;
}

// =============================================================================
// Health Check Types
// =============================================================================

/**
 * Result of an integration health check
 */
export interface HealthCheckResult {
  /** Whether the integration is healthy */
  healthy: boolean;
  /** Current status */
  status: DeepIntegrationStatus;
  /** Latency in milliseconds */
  latencyMs?: number;
  /** Additional details */
  details?: Record<string, unknown>;
  /** Error message if unhealthy */
  error?: string;
  /** Timestamp of the check */
  checkedAt: number;
}

/**
 * Options for health checks
 */
export interface HealthCheckOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Include detailed diagnostics */
  detailed?: boolean;
}

// =============================================================================
// Webhook Types
// =============================================================================

/**
 * Incoming webhook payload
 */
export interface WebhookPayload {
  /** Raw payload body */
  body: string;
  /** Headers from the request */
  headers: Record<string, string>;
  /** Signature header value (if present) */
  signature?: string;
}

/**
 * Result of webhook processing
 */
export interface WebhookResult {
  /** Whether the webhook was processed successfully */
  success: boolean;
  /** Event type that was processed */
  eventType?: string;
  /** Any response to send back */
  response?: unknown;
  /** Error if processing failed */
  error?: string;
}

// =============================================================================
// Base Integration Interface
// =============================================================================

/**
 * Interface that all deep integrations must implement
 *
 * @typeParam T - The specific deep integration type
 */
export interface IIntegration<T extends DeepIntegration> {
  /** The integration type identifier */
  readonly type: DeepIntegrationType;

  /**
   * Get the current integration state
   * @returns The current integration state or null if not configured
   */
  getState(): Promise<T | null>;

  /**
   * Connect/configure the integration
   * @param config - Integration-specific configuration
   * @returns The configured integration state
   */
  connect(config: unknown): Promise<T>;

  /**
   * Disconnect and clean up the integration
   * @returns True if successfully disconnected
   */
  disconnect(): Promise<boolean>;

  /**
   * Check if the integration is healthy and operational
   * @param options - Health check options
   * @returns Health check result
   */
  healthCheck(options?: HealthCheckOptions): Promise<HealthCheckResult>;

  /**
   * Refresh credentials if needed
   * @returns The updated integration state
   */
  refresh(): Promise<T>;

  /**
   * Handle an incoming webhook
   * @param payload - The webhook payload
   * @returns Webhook processing result
   */
  handleWebhook(payload: WebhookPayload): Promise<WebhookResult>;
}

// =============================================================================
// Abstract Base Class
// =============================================================================

/**
 * Abstract base class for deep integrations
 *
 * Provides common functionality for all platform-level integrations including:
 * - State management
 * - Event emission
 * - Credential storage
 * - Error handling patterns
 *
 * @typeParam T - The specific deep integration type
 *
 * @example
 * ```typescript
 * class StripeIntegration extends BaseIntegration<StripeDeepIntegration> {
 *   readonly type = 'stripe' as const;
 *
 *   async connect(config: StripeConnectConfig): Promise<StripeDeepIntegration> {
 *     // Implementation
 *   }
 * }
 * ```
 */
export abstract class BaseIntegration<T extends DeepIntegration>
  implements IIntegration<T>
{
  /** The integration type identifier */
  abstract readonly type: DeepIntegrationType;

  /** Current integration state */
  protected state: T | null = null;

  /** Configuration */
  protected readonly config: BaseIntegrationConfig;

  /** Credential storage */
  protected readonly credentials: CredentialStore;

  /** Event emitter */
  protected readonly events: IntegrationEventEmitter;

  /**
   * Create a new integration instance
   *
   * @param config - Base configuration
   * @param credentials - Credential storage implementation
   * @param events - Event emitter implementation
   */
  constructor(
    config: BaseIntegrationConfig,
    credentials: CredentialStore,
    events: IntegrationEventEmitter
  ) {
    this.config = config;
    this.credentials = credentials;
    this.events = events;
  }

  /**
   * Get the current integration state
   */
  async getState(): Promise<T | null> {
    return this.state;
  }

  /**
   * Connect/configure the integration
   * Must be implemented by subclasses
   */
  abstract connect(config: unknown): Promise<T>;

  /**
   * Disconnect and clean up the integration
   */
  async disconnect(): Promise<boolean> {
    if (!this.state) {
      return false;
    }

    try {
      // Clean up credentials
      await this.cleanupCredentials();

      // Emit disconnection event
      this.emitEvent({
        type: 'integration:disconnected',
        payload: { integrationType: this.type },
      });

      // Clear state
      this.state = null;

      return true;
    } catch (error) {
      this.emitError(error instanceof Error ? error.message : 'Disconnect failed');
      return false;
    }
  }

  /**
   * Check integration health
   * Can be overridden by subclasses for integration-specific checks
   */
  async healthCheck(options?: HealthCheckOptions): Promise<HealthCheckResult> {
    const startTime = Date.now();

    if (!this.state) {
      return {
        healthy: false,
        status: 'NotConfigured',
        checkedAt: startTime,
        error: 'Integration not configured',
      };
    }

    // Default implementation returns current state
    // Subclasses should override for actual health checks
    return {
      healthy: this.state.status === 'Active',
      status: this.state.status,
      latencyMs: Date.now() - startTime,
      checkedAt: startTime,
    };
  }

  /**
   * Refresh credentials if needed
   * Can be overridden by subclasses
   */
  async refresh(): Promise<T> {
    if (!this.state) {
      throw new IntegrationError(
        this.type,
        'NOT_CONFIGURED',
        'Cannot refresh: integration not configured'
      );
    }

    // Update last activity timestamp
    this.state = {
      ...this.state,
      lastActivityAt: Date.now(),
    };

    return this.state;
  }

  /**
   * Handle incoming webhook
   * Must be implemented by subclasses
   */
  abstract handleWebhook(payload: WebhookPayload): Promise<WebhookResult>;

  // ===========================================================================
  // Protected Helper Methods
  // ===========================================================================

  /**
   * Update the integration state
   */
  protected updateState(updates: Partial<T>): void {
    if (this.state) {
      this.state = { ...this.state, ...updates };
    }
  }

  /**
   * Set the integration status
   */
  protected setStatus(status: DeepIntegrationStatus, error?: string): void {
    if (this.state) {
      this.state = {
        ...this.state,
        status,
        error,
        lastActivityAt: Date.now(),
      };
    }
  }

  /**
   * Emit an integration event
   */
  protected emitEvent(event: IntegrationEvent): void {
    this.events.emit(event);
  }

  /**
   * Emit an error event
   */
  protected emitError(error: string): void {
    this.emitEvent({
      type: 'integration:error',
      payload: { integrationType: this.type, error },
    });
  }

  /**
   * Store a credential securely
   */
  protected async storeCredential(
    name: string,
    value: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const key = this.credentialKey(name);
    await this.credentials.set(key, value, metadata);
  }

  /**
   * Retrieve a credential
   */
  protected async getCredential(name: string): Promise<string | null> {
    const key = this.credentialKey(name);
    return this.credentials.get(key);
  }

  /**
   * Delete a credential
   */
  protected async deleteCredential(name: string): Promise<void> {
    const key = this.credentialKey(name);
    await this.credentials.delete(key);
  }

  /**
   * Generate a credential key with namespace
   */
  private credentialKey(name: string): string {
    return `${this.config.doId}:${this.type}:${name}`;
  }

  /**
   * Clean up all credentials for this integration
   * Should be overridden by subclasses to clean up specific credentials
   */
  protected async cleanupCredentials(): Promise<void> {
    // Subclasses should override to clean up their specific credentials
  }

  /**
   * Log a debug message
   */
  protected debug(message: string, data?: unknown): void {
    if (this.config.debug) {
      console.log(`[${this.type}] ${message}`, data ?? '');
    }
  }
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error thrown by integrations
 */
export class IntegrationError extends Error {
  /**
   * Create an integration error
   *
   * @param integrationType - The type of integration that failed
   * @param code - Error code for programmatic handling
   * @param message - Human-readable error message
   * @param cause - The underlying error if any
   */
  constructor(
    public readonly integrationType: DeepIntegrationType,
    public readonly code: string,
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Verify a webhook signature using HMAC
 *
 * @param payload - The raw payload string
 * @param signature - The signature to verify
 * @param secret - The shared secret
 * @param algorithm - The hash algorithm (default: sha256)
 * @returns True if signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: 'sha256' | 'sha512' = 'sha256'
): boolean {
  // TODO: Implement HMAC verification
  // This would use crypto.createHmac in Node.js
  throw new Error('Not implemented');
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn - The function to retry
 * @param options - Retry options
 * @returns The result of the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        break;
      }

      const delay = Math.min(
        baseDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// =============================================================================
// Exports
// =============================================================================

export type {
  DeepIntegration,
  DeepIntegrationType,
  DeepIntegrationStatus,
  IntegrationEvent,
};
