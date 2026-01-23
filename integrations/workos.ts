/**
 * WorkOS Integration
 *
 * Provides deep integration with WorkOS for:
 * - Single Sign-On (SSO) with multiple providers
 * - Directory Sync (SCIM)
 * - Admin Portal for self-service SSO configuration
 * - Fine-Grained Authorization (FGA)
 * - Audit Logs
 *
 * @module integrations/workos
 */

import type { WorkOSDeepIntegration } from '../types/integrations';
import {
  BaseIntegration,
  BaseIntegrationConfig,
  CredentialStore,
  IntegrationEventEmitter,
  HealthCheckResult,
  HealthCheckOptions,
  WebhookPayload,
  WebhookResult,
  IntegrationError,
} from './base';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for connecting WorkOS
 */
export interface WorkOSConnectConfig {
  /** Organization name */
  organizationName: string;
  /** Domains for the organization */
  domains?: string[];
  /** Features to enable */
  features?: {
    sso?: boolean;
    directorySync?: boolean;
    adminPortal?: boolean;
    auditLogs?: boolean;
  };
  /** Callback URL for SSO */
  callbackUrl: string;
}

/**
 * Configuration for SSO connection
 */
export interface SSOConnectionConfig {
  /** SSO provider type */
  provider: SSOProvider;
  /** Connection name */
  name?: string;
  /** Domain for the connection */
  domain?: string;
  /** SAML configuration (for SAML providers) */
  saml?: {
    idpEntityId: string;
    idpSsoUrl: string;
    idpCertificate: string;
  };
}

/**
 * Supported SSO providers
 */
export type SSOProvider =
  | 'google'
  | 'microsoft'
  | 'okta'
  | 'onelogin'
  | 'azure'
  | 'adfs'
  | 'ping'
  | 'jumpcloud'
  | 'saml';

/**
 * Directory sync configuration
 */
export interface DirectorySyncConfig {
  /** Directory provider */
  provider: DirectoryProvider;
  /** Directory name */
  name?: string;
  /** Domains */
  domains?: string[];
}

/**
 * Supported directory providers
 */
export type DirectoryProvider =
  | 'azure_scim'
  | 'bamboo_hr'
  | 'breathe_hr'
  | 'cezanne_hr'
  | 'cyberark_scim'
  | 'fourth_hr'
  | 'generic_scim'
  | 'google_workspace'
  | 'gsuite'
  | 'hibob'
  | 'jump_cloud_scim'
  | 'okta_scim'
  | 'onelogin_scim'
  | 'people_hr'
  | 'personio'
  | 'pingfederate_scim'
  | 'rippling_scim'
  | 'sftp'
  | 'workday';

// =============================================================================
// Response Types
// =============================================================================

/**
 * SSO authentication URL result
 */
export interface SSOAuthorizationUrl {
  url: string;
  state: string;
}

/**
 * SSO profile from authentication
 */
export interface SSOProfile {
  id: string;
  connectionId: string;
  connectionType: SSOProvider;
  organizationId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  rawAttributes?: Record<string, unknown>;
}

/**
 * Directory user
 */
export interface DirectoryUser {
  id: string;
  directoryId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  state: 'active' | 'inactive';
  groups: DirectoryGroup[];
  customAttributes?: Record<string, unknown>;
}

/**
 * Directory group
 */
export interface DirectoryGroup {
  id: string;
  directoryId: string;
  name: string;
  rawAttributes?: Record<string, unknown>;
}

/**
 * Admin portal link
 */
export interface AdminPortalLink {
  url: string;
  expiresAt: number;
}

/**
 * Audit log event
 */
export interface AuditLogEvent {
  id: string;
  action: string;
  occurredAt: number;
  actor?: {
    id: string;
    name?: string;
    type: string;
  };
  targets?: Array<{
    id: string;
    name?: string;
    type: string;
  }>;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// WorkOS Integration Class
// =============================================================================

/**
 * WorkOS Integration
 *
 * Manages WorkOS integration for enterprise authentication and
 * identity management features.
 *
 * @example
 * ```typescript
 * const workos = new WorkOSIntegration(config, credentials, events);
 *
 * // Connect WorkOS
 * await workos.connect({
 *   organizationName: 'Acme Corp',
 *   features: { sso: true, directorySync: true },
 *   callbackUrl: 'https://example.com/sso/callback',
 * });
 *
 * // Get SSO authorization URL
 * const { url } = await workos.getAuthorizationUrl('connection_id');
 * ```
 */
class WorkOSIntegration extends BaseIntegration<WorkOSDeepIntegration> {
  readonly type = 'workos' as const;

  /** WorkOS client (injected) */
  private workosClient: WorkOSClient | null = null;

  /**
   * Create a new WorkOS integration instance
   */
  constructor(
    config: BaseIntegrationConfig,
    credentials: CredentialStore,
    events: IntegrationEventEmitter,
    workosClient?: WorkOSClient
  ) {
    super(config, credentials, events);
    this.workosClient = workosClient ?? null;
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Connect WorkOS and create an organization
   *
   * @param config - WorkOS connection configuration
   * @returns The integration state
   */
  async connect(config: WorkOSConnectConfig): Promise<WorkOSDeepIntegration> {
    this.debug('Connecting WorkOS', { organizationName: config.organizationName });

    const client = this.getClient();

    try {
      // Create organization in WorkOS
      const organization = await client.organizations.create({
        name: config.organizationName,
        domains: config.domains,
        allow_profiles_outside_organization: false,
      });

      // Store organization ID
      await this.storeCredential('organization_id', organization.id);

      // Initialize state
      this.state = {
        type: 'workos',
        status: 'Active',
        organizationId: organization.id,
        features: config.features ?? {
          sso: true,
          directorySync: false,
          adminPortal: true,
          auditLogs: false,
        },
        ssoProviders: [],
        connectedAt: Date.now(),
        lastActivityAt: Date.now(),
      };

      this.emitEvent({
        type: 'integration:connected',
        payload: { integrationType: 'workos' },
      });

      return this.state;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect WorkOS';
      this.emitError(message);
      throw new IntegrationError('workos', 'CONNECT_FAILED', message, error as Error);
    }
  }

  /**
   * Disconnect WorkOS
   */
  async disconnect(): Promise<boolean> {
    if (!this.state?.organizationId) {
      return false;
    }

    this.debug('Disconnecting WorkOS', { organizationId: this.state.organizationId });

    // Clean up credentials
    await this.deleteCredential('organization_id');
    await this.deleteCredential('webhook_secret');

    return super.disconnect();
  }

  /**
   * Check WorkOS integration health
   */
  async healthCheck(options?: HealthCheckOptions): Promise<HealthCheckResult> {
    const startTime = Date.now();

    if (!this.state?.organizationId) {
      return {
        healthy: false,
        status: 'NotConfigured',
        checkedAt: startTime,
        error: 'WorkOS organization not configured',
      };
    }

    try {
      const client = this.getClient();

      // Retrieve organization to verify access
      const organization = await client.organizations.get(this.state.organizationId);

      return {
        healthy: true,
        status: 'Active',
        latencyMs: Date.now() - startTime,
        checkedAt: startTime,
        details: options?.detailed ? {
          organizationId: organization.id,
          organizationName: organization.name,
          domains: organization.domains,
        } : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Health check failed';
      return {
        healthy: false,
        status: 'Error',
        latencyMs: Date.now() - startTime,
        checkedAt: startTime,
        error: message,
      };
    }
  }

  /**
   * Refresh WorkOS integration
   */
  async refresh(): Promise<WorkOSDeepIntegration> {
    if (!this.state?.organizationId) {
      throw new IntegrationError('workos', 'NOT_CONFIGURED', 'WorkOS not connected');
    }

    const client = this.getClient();

    // Get current SSO connections
    const connections = await client.sso.listConnections({
      organizationId: this.state.organizationId,
    });

    // Update SSO providers list
    const ssoProviders = connections.data.map(
      (c: { connection_type: string }) => c.connection_type as SSOProvider
    );

    this.updateState({
      ssoProviders,
      lastActivityAt: Date.now(),
    });

    return this.state;
  }

  // ===========================================================================
  // Webhook Handling
  // ===========================================================================

  /**
   * Handle WorkOS webhook events
   *
   * @param payload - The webhook payload
   * @returns Webhook processing result
   */
  async handleWebhook(payload: WebhookPayload): Promise<WebhookResult> {
    this.debug('Handling WorkOS webhook');

    const webhookSecret = await this.getCredential('webhook_secret');

    if (!webhookSecret) {
      return {
        success: false,
        error: 'Webhook secret not configured',
      };
    }

    // Verify signature
    const signature = payload.headers['workos-signature'];
    if (!signature) {
      return {
        success: false,
        error: 'Missing WorkOS signature',
      };
    }

    try {
      const event = JSON.parse(payload.body);

      // Handle specific event types
      switch (event.event) {
        case 'dsync.user.created':
        case 'dsync.user.updated':
        case 'dsync.user.deleted':
          await this.handleDirectoryUserEvent(event);
          break;

        case 'dsync.group.created':
        case 'dsync.group.updated':
        case 'dsync.group.deleted':
          await this.handleDirectoryGroupEvent(event);
          break;

        case 'dsync.group.user_added':
        case 'dsync.group.user_removed':
          await this.handleGroupMembershipEvent(event);
          break;

        case 'connection.activated':
        case 'connection.deactivated':
          await this.handleConnectionEvent(event);
          break;

        default:
          this.debug('Unhandled event type', { type: event.event });
      }

      return {
        success: true,
        eventType: event.event,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook processing failed';
      return {
        success: false,
        error: message,
      };
    }
  }

  // ===========================================================================
  // SSO Operations
  // ===========================================================================

  /**
   * Create an SSO connection
   *
   * @param config - SSO connection configuration
   * @returns The connection ID
   */
  async createSSOConnection(config: SSOConnectionConfig): Promise<string> {
    this.ensureConnected();

    const client = this.getClient();

    const connection = await client.sso.createConnection({
      organizationId: this.state!.organizationId!,
      provider: config.provider,
      name: config.name,
      domains: config.domain ? [config.domain] : undefined,
    });

    // Update providers list
    const providers = new Set(this.state!.ssoProviders ?? []);
    providers.add(config.provider);
    this.updateState({
      ssoConnectionId: connection.id,
      ssoProviders: Array.from(providers),
      lastActivityAt: Date.now(),
    });

    return connection.id;
  }

  /**
   * Get SSO authorization URL
   *
   * @param connectionId - The SSO connection ID
   * @param redirectUri - Redirect URI after authentication
   * @param state - Optional state parameter
   * @returns Authorization URL and state
   */
  async getAuthorizationUrl(
    connectionId: string,
    redirectUri: string,
    state?: string
  ): Promise<SSOAuthorizationUrl> {
    this.ensureConnected();

    const client = this.getClient();

    const generatedState = state ?? this.generateState();

    const url = await client.sso.getAuthorizationUrl({
      connection: connectionId,
      redirectUri,
      state: generatedState,
    });

    return { url, state: generatedState };
  }

  /**
   * Exchange authorization code for profile
   *
   * @param code - The authorization code
   * @returns The SSO profile
   */
  async getProfile(code: string): Promise<SSOProfile> {
    this.ensureConnected();

    const client = this.getClient();

    const profile = await client.sso.getProfileAndToken({ code });

    this.updateState({ lastActivityAt: Date.now() });

    return {
      id: profile.profile.id,
      connectionId: profile.profile.connection_id,
      connectionType: profile.profile.connection_type as SSOProvider,
      organizationId: profile.profile.organization_id,
      email: profile.profile.email,
      firstName: profile.profile.first_name,
      lastName: profile.profile.last_name,
      rawAttributes: profile.profile.raw_attributes,
    };
  }

  // ===========================================================================
  // Directory Sync Operations
  // ===========================================================================

  /**
   * Create a directory sync connection
   *
   * @param config - Directory sync configuration
   * @returns The directory ID
   */
  async createDirectoryConnection(config: DirectorySyncConfig): Promise<string> {
    this.ensureConnected();

    const client = this.getClient();

    const directory = await client.directorySync.createDirectory({
      organizationId: this.state!.organizationId!,
      type: config.provider,
      name: config.name,
      domains: config.domains,
    });

    this.updateState({
      directoryConnectionId: directory.id,
      features: {
        ...this.state!.features,
        directorySync: true,
      },
      lastActivityAt: Date.now(),
    });

    return directory.id;
  }

  /**
   * List directory users
   *
   * @param directoryId - The directory ID
   * @param options - List options
   * @returns Array of directory users
   */
  async listDirectoryUsers(
    directoryId: string,
    options?: { limit?: number; after?: string }
  ): Promise<{ users: DirectoryUser[]; nextCursor?: string }> {
    this.ensureConnected();

    const client = this.getClient();

    const result = await client.directorySync.listUsers({
      directoryId,
      limit: options?.limit,
      after: options?.after,
    });

    return {
      users: result.data.map(this.mapDirectoryUser),
      nextCursor: result.list_metadata?.after ?? undefined,
    };
  }

  /**
   * List directory groups
   *
   * @param directoryId - The directory ID
   * @param options - List options
   * @returns Array of directory groups
   */
  async listDirectoryGroups(
    directoryId: string,
    options?: { limit?: number; after?: string }
  ): Promise<{ groups: DirectoryGroup[]; nextCursor?: string }> {
    this.ensureConnected();

    const client = this.getClient();

    const result = await client.directorySync.listGroups({
      directoryId,
      limit: options?.limit,
      after: options?.after,
    });

    return {
      groups: result.data.map(this.mapDirectoryGroup),
      nextCursor: result.list_metadata?.after ?? undefined,
    };
  }

  // ===========================================================================
  // Admin Portal Operations
  // ===========================================================================

  /**
   * Generate an Admin Portal link
   *
   * Allows organization admins to self-service configure SSO connections.
   *
   * @param intent - Portal intent ('sso' or 'dsync')
   * @param returnUrl - URL to return to after portal
   * @returns Admin Portal link
   */
  async generateAdminPortalLink(
    intent: 'sso' | 'dsync' = 'sso',
    returnUrl?: string
  ): Promise<AdminPortalLink> {
    this.ensureConnected();

    if (!this.state!.features?.adminPortal) {
      throw new IntegrationError(
        'workos',
        'FEATURE_DISABLED',
        'Admin Portal feature is not enabled'
      );
    }

    const client = this.getClient();

    const link = await client.portal.generateLink({
      organizationId: this.state!.organizationId!,
      intent,
      returnUrl,
    });

    return {
      url: link.link,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    };
  }

  // ===========================================================================
  // Audit Log Operations
  // ===========================================================================

  /**
   * Create an audit log event
   *
   * @param event - The audit log event
   */
  async createAuditLogEvent(event: Omit<AuditLogEvent, 'id' | 'occurredAt'>): Promise<void> {
    this.ensureConnected();

    if (!this.state!.features?.auditLogs) {
      throw new IntegrationError(
        'workos',
        'FEATURE_DISABLED',
        'Audit Logs feature is not enabled'
      );
    }

    const client = this.getClient();

    await client.auditLogs.createEvent({
      organizationId: this.state!.organizationId!,
      event: {
        action: event.action,
        actor: event.actor,
        targets: event.targets,
        metadata: event.metadata,
      },
    });
  }

  /**
   * List audit log events
   *
   * @param options - List options
   * @returns Array of audit log events
   */
  async listAuditLogEvents(
    options?: { limit?: number; after?: string; actions?: string[] }
  ): Promise<{ events: AuditLogEvent[]; nextCursor?: string }> {
    this.ensureConnected();

    if (!this.state!.features?.auditLogs) {
      throw new IntegrationError(
        'workos',
        'FEATURE_DISABLED',
        'Audit Logs feature is not enabled'
      );
    }

    const client = this.getClient();

    const result = await client.auditLogs.listEvents({
      organizationId: this.state!.organizationId!,
      limit: options?.limit,
      after: options?.after,
      actions: options?.actions,
    });

    return {
      events: result.data.map((e: { id: string; action: string; occurred_at: string; actor?: any; targets?: any[]; metadata?: Record<string, unknown> }) => ({
        id: e.id,
        action: e.action,
        occurredAt: new Date(e.occurred_at).getTime(),
        actor: e.actor,
        targets: e.targets,
        metadata: e.metadata,
      })),
      nextCursor: result.list_metadata?.after ?? undefined,
    };
  }

  // ===========================================================================
  // Protected Methods
  // ===========================================================================

  protected async cleanupCredentials(): Promise<void> {
    await this.deleteCredential('organization_id');
    await this.deleteCredential('webhook_secret');
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Get the WorkOS client
   */
  private getClient(): WorkOSClient {
    if (!this.workosClient) {
      throw new IntegrationError(
        'workos',
        'CLIENT_NOT_CONFIGURED',
        'WorkOS client not configured'
      );
    }
    return this.workosClient;
  }

  /**
   * Ensure the integration is connected
   */
  private ensureConnected(): void {
    if (!this.state?.organizationId) {
      throw new IntegrationError('workos', 'NOT_CONNECTED', 'WorkOS not connected');
    }

    if (this.state.status !== 'Active') {
      throw new IntegrationError(
        'workos',
        'NOT_ACTIVE',
        `WorkOS integration is ${this.state.status}`
      );
    }
  }

  /**
   * Generate a random state parameter
   */
  private generateState(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Map API user to DirectoryUser
   */
  private mapDirectoryUser(user: any): DirectoryUser {
    return {
      id: user.id,
      directoryId: user.directory_id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      state: user.state,
      groups: user.groups?.map(this.mapDirectoryGroup) ?? [],
      customAttributes: user.custom_attributes,
    };
  }

  /**
   * Map API group to DirectoryGroup
   */
  private mapDirectoryGroup(group: any): DirectoryGroup {
    return {
      id: group.id,
      directoryId: group.directory_id,
      name: group.name,
      rawAttributes: group.raw_attributes,
    };
  }

  /**
   * Handle directory user events
   */
  private async handleDirectoryUserEvent(event: any): Promise<void> {
    this.debug('Directory user event', { type: event.event, userId: event.data?.id });
    // Emit event or trigger sync
  }

  /**
   * Handle directory group events
   */
  private async handleDirectoryGroupEvent(event: any): Promise<void> {
    this.debug('Directory group event', { type: event.event, groupId: event.data?.id });
    // Emit event or trigger sync
  }

  /**
   * Handle group membership events
   */
  private async handleGroupMembershipEvent(event: any): Promise<void> {
    this.debug('Group membership event', { type: event.event });
    // Emit event or trigger sync
  }

  /**
   * Handle connection events
   */
  private async handleConnectionEvent(event: any): Promise<void> {
    this.debug('Connection event', { type: event.event, connectionId: event.data?.id });
    // Update state based on connection status
  }
}

// =============================================================================
// Type Definitions for WorkOS Client (Simplified)
// =============================================================================

/**
 * Simplified WorkOS client interface
 * In production, use the official WorkOS SDK
 */
interface WorkOSClient {
  organizations: {
    create(params: any): Promise<any>;
    get(id: string): Promise<any>;
  };
  sso: {
    createConnection(params: any): Promise<any>;
    listConnections(params: any): Promise<any>;
    getAuthorizationUrl(params: any): Promise<string>;
    getProfileAndToken(params: any): Promise<any>;
  };
  directorySync: {
    createDirectory(params: any): Promise<any>;
    listUsers(params: any): Promise<any>;
    listGroups(params: any): Promise<any>;
  };
  portal: {
    generateLink(params: any): Promise<any>;
  };
  auditLogs: {
    createEvent(params: any): Promise<void>;
    listEvents(params: any): Promise<any>;
  };
}

// =============================================================================
// Exports
// =============================================================================

export { WorkOSIntegration };
