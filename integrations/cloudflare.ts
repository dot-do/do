/**
 * Cloudflare Integration
 *
 * Provides deep integration with Cloudflare for:
 * - Zone and DNS management
 * - SSL certificate provisioning
 * - Workers deployment
 * - KV namespace management
 * - R2 bucket management
 * - D1 database management
 * - Durable Objects
 *
 * @module integrations/cloudflare
 */

import type { CloudflareDeepIntegration } from '../types/integrations';
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
 * Configuration for connecting Cloudflare
 */
export interface CloudflareConnectConfig {
  /** Cloudflare account ID */
  accountId: string;
  /** API token with appropriate permissions */
  apiToken: string;
  /** Optional zone IDs to manage */
  zoneIds?: string[];
}

/**
 * Zone configuration
 */
export interface ZoneConfig {
  /** Domain name */
  name: string;
  /** Zone type */
  type?: 'full' | 'partial';
  /** Jump start (import existing DNS records) */
  jumpStart?: boolean;
}

/**
 * DNS record configuration
 */
export interface DNSRecordConfig {
  /** Record type */
  type: DNSRecordType;
  /** Record name (subdomain or @ for root) */
  name: string;
  /** Record content/value */
  content: string;
  /** TTL in seconds (1 = auto) */
  ttl?: number;
  /** Proxied through Cloudflare */
  proxied?: boolean;
  /** Priority (for MX, SRV) */
  priority?: number;
}

/**
 * Supported DNS record types
 */
export type DNSRecordType =
  | 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS' | 'SRV' | 'CAA'
  | 'CERT' | 'DNSKEY' | 'DS' | 'HTTPS' | 'LOC' | 'NAPTR' | 'PTR'
  | 'SMIMEA' | 'SSHFP' | 'SVCB' | 'TLSA' | 'URI';

/**
 * Worker script configuration
 */
export interface WorkerConfig {
  /** Worker name */
  name: string;
  /** Worker script content */
  script: string;
  /** Bindings */
  bindings?: WorkerBinding[];
  /** Routes */
  routes?: string[];
  /** Cron triggers */
  crons?: string[];
  /** Compatibility date */
  compatibilityDate?: string;
  /** Compatibility flags */
  compatibilityFlags?: string[];
}

/**
 * Worker binding types
 */
export type WorkerBinding =
  | { type: 'kv_namespace'; name: string; namespaceId: string }
  | { type: 'r2_bucket'; name: string; bucketName: string }
  | { type: 'd1_database'; name: string; databaseId: string }
  | { type: 'durable_object'; name: string; className: string; scriptName?: string }
  | { type: 'service'; name: string; service: string; environment?: string }
  | { type: 'secret'; name: string; value: string }
  | { type: 'plain_text'; name: string; value: string };

/**
 * KV namespace configuration
 */
export interface KVNamespaceConfig {
  /** Namespace title */
  title: string;
}

/**
 * R2 bucket configuration
 */
export interface R2BucketConfig {
  /** Bucket name */
  name: string;
  /** Location hint */
  locationHint?: string;
}

/**
 * D1 database configuration
 */
export interface D1DatabaseConfig {
  /** Database name */
  name: string;
}

// =============================================================================
// Response Types
// =============================================================================

/**
 * Zone information
 */
export interface Zone {
  id: string;
  name: string;
  status: 'active' | 'pending' | 'initializing' | 'moved' | 'deleted' | 'deactivated';
  paused: boolean;
  type: 'full' | 'partial';
  nameServers: string[];
  createdOn: string;
  modifiedOn: string;
}

/**
 * DNS record information
 */
export interface DNSRecord {
  id: string;
  zoneId: string;
  zoneName: string;
  name: string;
  type: DNSRecordType;
  content: string;
  proxied: boolean;
  proxiable: boolean;
  ttl: number;
  priority?: number;
  createdOn: string;
  modifiedOn: string;
}

/**
 * Worker information
 */
export interface Worker {
  id: string;
  name: string;
  createdOn: string;
  modifiedOn: string;
  etag?: string;
  routes?: WorkerRoute[];
}

/**
 * Worker route
 */
export interface WorkerRoute {
  id: string;
  pattern: string;
  script: string;
}

/**
 * KV namespace information
 */
export interface KVNamespace {
  id: string;
  title: string;
  supportsUrlEncoding: boolean;
}

/**
 * R2 bucket information
 */
export interface R2Bucket {
  name: string;
  creationDate: string;
  location?: string;
}

/**
 * D1 database information
 */
export interface D1Database {
  uuid: string;
  name: string;
  version: string;
  numTables: number;
  fileSize: number;
  createdAt: string;
}

/**
 * SSL certificate information
 */
export interface SSLCertificate {
  id: string;
  type: string;
  hosts: string[];
  status: 'active' | 'pending_validation' | 'pending_issuance' | 'pending_deployment';
  issuer: string;
  expiresOn: string;
}

// =============================================================================
// Cloudflare Integration Class
// =============================================================================

/**
 * Cloudflare Integration
 *
 * Manages Cloudflare integration for DNS, Workers, and edge infrastructure.
 *
 * @example
 * ```typescript
 * const cloudflare = new CloudflareIntegration(config, credentials, events);
 *
 * // Connect Cloudflare
 * await cloudflare.connect({
 *   accountId: 'abc123',
 *   apiToken: 'token',
 * });
 *
 * // Create a zone
 * const zone = await cloudflare.createZone({ name: 'example.com' });
 *
 * // Add DNS record
 * await cloudflare.createDNSRecord(zone.id, {
 *   type: 'A',
 *   name: 'www',
 *   content: '192.0.2.1',
 * });
 * ```
 */
class CloudflareIntegration extends BaseIntegration<CloudflareDeepIntegration> {
  readonly type = 'cloudflare' as const;

  /** Cloudflare client (injected) */
  private cloudflareClient: CloudflareClient | null = null;

  /**
   * Create a new Cloudflare integration instance
   */
  constructor(
    config: BaseIntegrationConfig,
    credentials: CredentialStore,
    events: IntegrationEventEmitter,
    cloudflareClient?: CloudflareClient
  ) {
    super(config, credentials, events);
    this.cloudflareClient = cloudflareClient ?? null;
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Connect Cloudflare account
   *
   * @param config - Cloudflare connection configuration
   * @returns The integration state
   */
  async connect(config: CloudflareConnectConfig): Promise<CloudflareDeepIntegration> {
    this.debug('Connecting Cloudflare', { accountId: config.accountId });

    const client = this.getClient();

    try {
      // Verify the API token
      const tokenVerification = await client.user.tokens.verify();

      if (tokenVerification.status !== 'active') {
        throw new Error('API token is not active');
      }

      // Store the API token
      await this.storeCredential('api_token', config.apiToken);
      await this.storeCredential('account_id', config.accountId);

      // Initialize state
      this.state = {
        type: 'cloudflare',
        status: 'Active',
        accountId: config.accountId,
        zoneIds: config.zoneIds ?? [],
        kvNamespaces: [],
        r2Buckets: [],
        d1Databases: [],
        durableObjectNamespaces: [],
        connectedAt: Date.now(),
        lastActivityAt: Date.now(),
      };

      this.emitEvent({
        type: 'integration:connected',
        payload: { integrationType: 'cloudflare' },
      });

      return this.state;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect Cloudflare';
      this.emitError(message);
      throw new IntegrationError('cloudflare', 'CONNECT_FAILED', message, error as Error);
    }
  }

  /**
   * Disconnect Cloudflare
   */
  async disconnect(): Promise<boolean> {
    if (!this.state?.accountId) {
      return false;
    }

    this.debug('Disconnecting Cloudflare', { accountId: this.state.accountId });

    // Clean up credentials
    await this.deleteCredential('api_token');
    await this.deleteCredential('account_id');

    return super.disconnect();
  }

  /**
   * Check Cloudflare integration health
   */
  async healthCheck(options?: HealthCheckOptions): Promise<HealthCheckResult> {
    const startTime = Date.now();

    if (!this.state?.accountId) {
      return {
        healthy: false,
        status: 'NotConfigured',
        checkedAt: startTime,
        error: 'Cloudflare not connected',
      };
    }

    try {
      const client = this.getClient();

      // Verify token is still valid
      const tokenVerification = await client.user.tokens.verify();

      return {
        healthy: tokenVerification.status === 'active',
        status: 'Active',
        latencyMs: Date.now() - startTime,
        checkedAt: startTime,
        details: options?.detailed ? {
          accountId: this.state.accountId,
          zonesManaged: this.state.zoneIds?.length ?? 0,
          kvNamespaces: this.state.kvNamespaces?.length ?? 0,
          r2Buckets: this.state.r2Buckets?.length ?? 0,
          d1Databases: this.state.d1Databases?.length ?? 0,
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
   * Refresh Cloudflare integration
   */
  async refresh(): Promise<CloudflareDeepIntegration> {
    if (!this.state?.accountId) {
      throw new IntegrationError('cloudflare', 'NOT_CONFIGURED', 'Cloudflare not connected');
    }

    // Refresh lists of resources
    const client = this.getClient();

    const [zones, kvNamespaces, r2Buckets, d1Databases] = await Promise.all([
      client.zones.list({ account: { id: this.state.accountId } }),
      client.kv.namespaces.list(this.state.accountId),
      client.r2.buckets.list(this.state.accountId),
      client.d1.databases.list(this.state.accountId),
    ]);

    this.updateState({
      zoneIds: zones.result.map((z: { id: string }) => z.id),
      kvNamespaces: kvNamespaces.result.map((ns: { id: string }) => ns.id),
      r2Buckets: r2Buckets.result.map((b: { name: string }) => b.name),
      d1Databases: d1Databases.result.map((db: { uuid: string }) => db.uuid),
      lastActivityAt: Date.now(),
    });

    return this.state;
  }

  // ===========================================================================
  // Webhook Handling
  // ===========================================================================

  /**
   * Handle Cloudflare webhook events
   *
   * Note: Cloudflare doesn't have a traditional webhook system.
   * This is primarily for Logpush or custom webhook integrations.
   *
   * @param payload - The webhook payload
   * @returns Webhook processing result
   */
  async handleWebhook(payload: WebhookPayload): Promise<WebhookResult> {
    this.debug('Handling Cloudflare webhook');

    try {
      const event = JSON.parse(payload.body);

      // Handle based on event type
      // Cloudflare Logpush, custom notifications, etc.

      return {
        success: true,
        eventType: event.type ?? 'unknown',
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
  // Zone Operations
  // ===========================================================================

  /**
   * Create a new zone
   *
   * @param config - Zone configuration
   * @returns The created zone
   */
  async createZone(config: ZoneConfig): Promise<Zone> {
    this.ensureConnected();

    const client = this.getClient();

    const zone = await client.zones.create({
      name: config.name,
      account: { id: this.state!.accountId! },
      type: config.type ?? 'full',
      jump_start: config.jumpStart ?? false,
    });

    // Update tracked zones
    const zoneIds = [...(this.state!.zoneIds ?? []), zone.id];
    this.updateState({ zoneIds, lastActivityAt: Date.now() });

    return this.mapZone(zone);
  }

  /**
   * Get zone information
   *
   * @param zoneId - Zone ID
   * @returns Zone information
   */
  async getZone(zoneId: string): Promise<Zone> {
    this.ensureConnected();

    const client = this.getClient();
    const zone = await client.zones.get(zoneId);

    return this.mapZone(zone);
  }

  /**
   * List zones
   *
   * @returns Array of zones
   */
  async listZones(): Promise<Zone[]> {
    this.ensureConnected();

    const client = this.getClient();
    const zones = await client.zones.list({
      account: { id: this.state!.accountId! },
    });

    return zones.result.map(this.mapZone);
  }

  /**
   * Delete a zone
   *
   * @param zoneId - Zone ID
   */
  async deleteZone(zoneId: string): Promise<void> {
    this.ensureConnected();

    const client = this.getClient();
    await client.zones.delete(zoneId);

    // Update tracked zones
    const zoneIds = (this.state!.zoneIds ?? []).filter((id) => id !== zoneId);
    this.updateState({ zoneIds, lastActivityAt: Date.now() });
  }

  // ===========================================================================
  // DNS Operations
  // ===========================================================================

  /**
   * Create a DNS record
   *
   * @param zoneId - Zone ID
   * @param config - DNS record configuration
   * @returns The created DNS record
   */
  async createDNSRecord(zoneId: string, config: DNSRecordConfig): Promise<DNSRecord> {
    this.ensureConnected();

    const client = this.getClient();

    const record = await client.dns.records.create(zoneId, {
      type: config.type,
      name: config.name,
      content: config.content,
      ttl: config.ttl ?? 1,
      proxied: config.proxied ?? false,
      priority: config.priority,
    });

    this.updateState({ lastActivityAt: Date.now() });

    return this.mapDNSRecord(record);
  }

  /**
   * List DNS records for a zone
   *
   * @param zoneId - Zone ID
   * @param options - List options
   * @returns Array of DNS records
   */
  async listDNSRecords(
    zoneId: string,
    options?: { type?: DNSRecordType; name?: string }
  ): Promise<DNSRecord[]> {
    this.ensureConnected();

    const client = this.getClient();
    const records = await client.dns.records.list(zoneId, {
      type: options?.type,
      name: options?.name,
    });

    return records.result.map(this.mapDNSRecord);
  }

  /**
   * Update a DNS record
   *
   * @param zoneId - Zone ID
   * @param recordId - Record ID
   * @param config - Updated record configuration
   * @returns The updated DNS record
   */
  async updateDNSRecord(
    zoneId: string,
    recordId: string,
    config: Partial<DNSRecordConfig>
  ): Promise<DNSRecord> {
    this.ensureConnected();

    const client = this.getClient();

    const record = await client.dns.records.update(zoneId, recordId, config);

    return this.mapDNSRecord(record);
  }

  /**
   * Delete a DNS record
   *
   * @param zoneId - Zone ID
   * @param recordId - Record ID
   */
  async deleteDNSRecord(zoneId: string, recordId: string): Promise<void> {
    this.ensureConnected();

    const client = this.getClient();
    await client.dns.records.delete(zoneId, recordId);

    this.updateState({ lastActivityAt: Date.now() });
  }

  // ===========================================================================
  // Workers Operations
  // ===========================================================================

  /**
   * Deploy a Worker script
   *
   * @param config - Worker configuration
   * @returns The deployed worker
   */
  async deployWorker(config: WorkerConfig): Promise<Worker> {
    this.ensureConnected();

    const client = this.getClient();

    // Create/update the worker script
    const worker = await client.workers.scripts.update(
      this.state!.accountId!,
      config.name,
      {
        script: config.script,
        bindings: config.bindings?.map(this.mapBindingToApi),
        compatibility_date: config.compatibilityDate,
        compatibility_flags: config.compatibilityFlags,
      }
    );

    // Set up routes if provided
    if (config.routes && config.routes.length > 0) {
      await Promise.all(config.routes.map((pattern) =>
        client.workers.routes.create(this.state!.accountId!, {
          pattern,
          script: config.name,
        })
      ));
    }

    // Set up cron triggers if provided
    if (config.crons && config.crons.length > 0) {
      await client.workers.crons.update(this.state!.accountId!, config.name, {
        crons: config.crons.map((expression) => ({ cron: expression })),
      });
    }

    this.updateState({
      workersNamespace: this.state!.workersNamespace ?? config.name,
      lastActivityAt: Date.now(),
    });

    return {
      id: worker.id,
      name: config.name,
      createdOn: worker.created_on,
      modifiedOn: worker.modified_on,
      etag: worker.etag,
    };
  }

  /**
   * Get a Worker script
   *
   * @param scriptName - Script name
   * @returns Worker information
   */
  async getWorker(scriptName: string): Promise<Worker> {
    this.ensureConnected();

    const client = this.getClient();
    const worker = await client.workers.scripts.get(this.state!.accountId!, scriptName);

    return {
      id: worker.id,
      name: scriptName,
      createdOn: worker.created_on,
      modifiedOn: worker.modified_on,
      etag: worker.etag,
    };
  }

  /**
   * Delete a Worker script
   *
   * @param scriptName - Script name
   */
  async deleteWorker(scriptName: string): Promise<void> {
    this.ensureConnected();

    const client = this.getClient();
    await client.workers.scripts.delete(this.state!.accountId!, scriptName);

    this.updateState({ lastActivityAt: Date.now() });
  }

  // ===========================================================================
  // KV Namespace Operations
  // ===========================================================================

  /**
   * Create a KV namespace
   *
   * @param config - KV namespace configuration
   * @returns The created namespace
   */
  async createKVNamespace(config: KVNamespaceConfig): Promise<KVNamespace> {
    this.ensureConnected();

    const client = this.getClient();

    const namespace = await client.kv.namespaces.create(this.state!.accountId!, {
      title: config.title,
    });

    // Update tracked namespaces
    const kvNamespaces = [...(this.state!.kvNamespaces ?? []), namespace.id];
    this.updateState({ kvNamespaces, lastActivityAt: Date.now() });

    return {
      id: namespace.id,
      title: namespace.title,
      supportsUrlEncoding: namespace.supports_url_encoding,
    };
  }

  /**
   * Write a value to KV
   *
   * @param namespaceId - Namespace ID
   * @param key - Key
   * @param value - Value
   * @param options - Write options
   */
  async kvPut(
    namespaceId: string,
    key: string,
    value: string | ArrayBuffer,
    options?: { expiration?: number; expirationTtl?: number; metadata?: Record<string, unknown> }
  ): Promise<void> {
    this.ensureConnected();

    const client = this.getClient();
    await client.kv.namespaces.values.put(
      this.state!.accountId!,
      namespaceId,
      key,
      value,
      options
    );

    this.updateState({ lastActivityAt: Date.now() });
  }

  /**
   * Read a value from KV
   *
   * @param namespaceId - Namespace ID
   * @param key - Key
   * @returns The value or null if not found
   */
  async kvGet(namespaceId: string, key: string): Promise<string | null> {
    this.ensureConnected();

    const client = this.getClient();
    return client.kv.namespaces.values.get(this.state!.accountId!, namespaceId, key);
  }

  /**
   * Delete a value from KV
   *
   * @param namespaceId - Namespace ID
   * @param key - Key
   */
  async kvDelete(namespaceId: string, key: string): Promise<void> {
    this.ensureConnected();

    const client = this.getClient();
    await client.kv.namespaces.values.delete(this.state!.accountId!, namespaceId, key);

    this.updateState({ lastActivityAt: Date.now() });
  }

  // ===========================================================================
  // R2 Bucket Operations
  // ===========================================================================

  /**
   * Create an R2 bucket
   *
   * @param config - Bucket configuration
   * @returns The created bucket
   */
  async createR2Bucket(config: R2BucketConfig): Promise<R2Bucket> {
    this.ensureConnected();

    const client = this.getClient();

    const bucket = await client.r2.buckets.create(this.state!.accountId!, {
      name: config.name,
      locationHint: config.locationHint,
    });

    // Update tracked buckets
    const r2Buckets = [...(this.state!.r2Buckets ?? []), bucket.name];
    this.updateState({ r2Buckets, lastActivityAt: Date.now() });

    return {
      name: bucket.name,
      creationDate: bucket.creation_date,
      location: bucket.location,
    };
  }

  /**
   * Delete an R2 bucket
   *
   * @param bucketName - Bucket name
   */
  async deleteR2Bucket(bucketName: string): Promise<void> {
    this.ensureConnected();

    const client = this.getClient();
    await client.r2.buckets.delete(this.state!.accountId!, bucketName);

    // Update tracked buckets
    const r2Buckets = (this.state!.r2Buckets ?? []).filter((b) => b !== bucketName);
    this.updateState({ r2Buckets, lastActivityAt: Date.now() });
  }

  // ===========================================================================
  // D1 Database Operations
  // ===========================================================================

  /**
   * Create a D1 database
   *
   * @param config - Database configuration
   * @returns The created database
   */
  async createD1Database(config: D1DatabaseConfig): Promise<D1Database> {
    this.ensureConnected();

    const client = this.getClient();

    const database = await client.d1.databases.create(this.state!.accountId!, {
      name: config.name,
    });

    // Update tracked databases
    const d1Databases = [...(this.state!.d1Databases ?? []), database.uuid];
    this.updateState({ d1Databases, lastActivityAt: Date.now() });

    return {
      uuid: database.uuid,
      name: database.name,
      version: database.version,
      numTables: database.num_tables,
      fileSize: database.file_size,
      createdAt: database.created_at,
    };
  }

  /**
   * Execute SQL on a D1 database
   *
   * @param databaseId - Database ID
   * @param sql - SQL statement
   * @param params - Query parameters
   * @returns Query results
   */
  async d1Query(
    databaseId: string,
    sql: string,
    params?: unknown[]
  ): Promise<{ results: Record<string, unknown>[]; meta: { changes: number; lastRowId: number } }> {
    this.ensureConnected();

    const client = this.getClient();

    const result = await client.d1.databases.query(this.state!.accountId!, databaseId, {
      sql,
      params,
    });

    this.updateState({ lastActivityAt: Date.now() });

    return {
      results: result.results,
      meta: {
        changes: result.meta.changes,
        lastRowId: result.meta.last_row_id,
      },
    };
  }

  /**
   * Delete a D1 database
   *
   * @param databaseId - Database ID
   */
  async deleteD1Database(databaseId: string): Promise<void> {
    this.ensureConnected();

    const client = this.getClient();
    await client.d1.databases.delete(this.state!.accountId!, databaseId);

    // Update tracked databases
    const d1Databases = (this.state!.d1Databases ?? []).filter((db) => db !== databaseId);
    this.updateState({ d1Databases, lastActivityAt: Date.now() });
  }

  // ===========================================================================
  // SSL Operations
  // ===========================================================================

  /**
   * Get SSL certificate for a zone
   *
   * @param zoneId - Zone ID
   * @returns SSL certificate information
   */
  async getSSLCertificate(zoneId: string): Promise<SSLCertificate | null> {
    this.ensureConnected();

    const client = this.getClient();

    try {
      const cert = await client.ssl.certificates.get(zoneId);
      return {
        id: cert.id,
        type: cert.type,
        hosts: cert.hosts,
        status: cert.status,
        issuer: cert.issuer,
        expiresOn: cert.expires_on,
      };
    } catch (error) {
      return null;
    }
  }

  // ===========================================================================
  // Protected Methods
  // ===========================================================================

  protected async cleanupCredentials(): Promise<void> {
    await this.deleteCredential('api_token');
    await this.deleteCredential('account_id');
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Get the Cloudflare client
   */
  private getClient(): CloudflareClient {
    if (!this.cloudflareClient) {
      throw new IntegrationError(
        'cloudflare',
        'CLIENT_NOT_CONFIGURED',
        'Cloudflare client not configured'
      );
    }
    return this.cloudflareClient;
  }

  /**
   * Ensure the integration is connected
   */
  private ensureConnected(): void {
    if (!this.state?.accountId) {
      throw new IntegrationError('cloudflare', 'NOT_CONNECTED', 'Cloudflare not connected');
    }

    if (this.state.status !== 'Active') {
      throw new IntegrationError(
        'cloudflare',
        'NOT_ACTIVE',
        `Cloudflare integration is ${this.state.status}`
      );
    }
  }

  /**
   * Map zone API response to our format
   */
  private mapZone(zone: CloudflareZoneResponse): Zone {
    return {
      id: zone.id,
      name: zone.name,
      status: zone.status,
      paused: zone.paused,
      type: zone.type,
      nameServers: zone.name_servers,
      createdOn: zone.created_on,
      modifiedOn: zone.modified_on,
    }
  }

  /**
   * Map DNS record API response to our format
   */
  private mapDNSRecord(record: CloudflareDNSRecordResponse): DNSRecord {
    return {
      id: record.id,
      zoneId: record.zone_id,
      zoneName: record.zone_name,
      name: record.name,
      type: record.type,
      content: record.content,
      proxied: record.proxied,
      proxiable: record.proxiable,
      ttl: record.ttl,
      priority: record.priority,
      createdOn: record.created_on,
      modifiedOn: record.modified_on,
    }
  }

  /**
   * Map binding to API format
   */
  private mapBindingToApi(binding: WorkerBinding): CloudflareWorkerBindingApi {
    switch (binding.type) {
      case 'kv_namespace':
        return { type: 'kv_namespace', name: binding.name, namespace_id: binding.namespaceId }
      case 'r2_bucket':
        return { type: 'r2_bucket', name: binding.name, bucket_name: binding.bucketName }
      case 'd1_database':
        return { type: 'd1', name: binding.name, id: binding.databaseId }
      case 'durable_object':
        return {
          type: 'durable_object_namespace',
          name: binding.name,
          class_name: binding.className,
          script_name: binding.scriptName,
        }
      case 'service':
        return {
          type: 'service',
          name: binding.name,
          service: binding.service,
          environment: binding.environment,
        }
      case 'secret':
        return { type: 'secret_text', name: binding.name, text: binding.value }
      case 'plain_text':
        return { type: 'plain_text', name: binding.name, text: binding.value }
    }
  }
}

// =============================================================================
// Type Definitions for Cloudflare Client
// =============================================================================

/**
 * Cloudflare token verification response
 */
interface CloudflareTokenVerifyResponse {
  status: 'active' | 'disabled' | 'expired'
}

/**
 * Cloudflare zone creation parameters
 */
interface CloudflareZoneCreateParams {
  name: string
  account: { id: string }
  type?: 'full' | 'partial'
  jump_start?: boolean
}

/**
 * Cloudflare zone response
 */
interface CloudflareZoneResponse {
  id: string
  name: string
  status: 'active' | 'pending' | 'initializing' | 'moved' | 'deleted' | 'deactivated'
  paused: boolean
  type: 'full' | 'partial'
  name_servers: string[]
  created_on: string
  modified_on: string
}

/**
 * Cloudflare zone list parameters
 */
interface CloudflareZoneListParams {
  account: { id: string }
}

/**
 * Cloudflare zone list response
 */
interface CloudflareZoneListResponse {
  result: CloudflareZoneResponse[]
}

/**
 * Cloudflare DNS record creation parameters
 */
interface CloudflareDNSRecordCreateParams {
  type: DNSRecordType
  name: string
  content: string
  ttl?: number
  proxied?: boolean
  priority?: number
}

/**
 * Cloudflare DNS record response
 */
interface CloudflareDNSRecordResponse {
  id: string
  zone_id: string
  zone_name: string
  name: string
  type: DNSRecordType
  content: string
  proxied: boolean
  proxiable: boolean
  ttl: number
  priority?: number
  created_on: string
  modified_on: string
}

/**
 * Cloudflare DNS record list parameters
 */
interface CloudflareDNSRecordListParams {
  type?: DNSRecordType
  name?: string
}

/**
 * Cloudflare DNS record list response
 */
interface CloudflareDNSRecordListResponse {
  result: CloudflareDNSRecordResponse[]
}

/**
 * Cloudflare worker script update parameters
 */
interface CloudflareWorkerScriptUpdateParams {
  script: string
  bindings?: CloudflareWorkerBindingApi[]
  compatibility_date?: string
  compatibility_flags?: string[]
}

/**
 * Cloudflare worker binding API format
 */
type CloudflareWorkerBindingApi =
  | { type: 'kv_namespace'; name: string; namespace_id: string }
  | { type: 'r2_bucket'; name: string; bucket_name: string }
  | { type: 'd1'; name: string; id: string }
  | { type: 'durable_object_namespace'; name: string; class_name: string; script_name?: string }
  | { type: 'service'; name: string; service: string; environment?: string }
  | { type: 'secret_text'; name: string; text: string }
  | { type: 'plain_text'; name: string; text: string }

/**
 * Cloudflare worker script response
 */
interface CloudflareWorkerScriptResponse {
  id: string
  etag?: string
  created_on: string
  modified_on: string
}

/**
 * Cloudflare worker route creation parameters
 */
interface CloudflareWorkerRouteCreateParams {
  pattern: string
  script: string
}

/**
 * Cloudflare worker route response
 */
interface CloudflareWorkerRouteResponse {
  id: string
  pattern: string
  script: string
}

/**
 * Cloudflare worker cron update parameters
 */
interface CloudflareWorkerCronUpdateParams {
  crons: Array<{ cron: string }>
}

/**
 * Cloudflare KV namespace creation parameters
 */
interface CloudflareKVNamespaceCreateParams {
  title: string
}

/**
 * Cloudflare KV namespace response
 */
interface CloudflareKVNamespaceResponse {
  id: string
  title: string
  supports_url_encoding: boolean
}

/**
 * Cloudflare KV namespace list response
 */
interface CloudflareKVNamespaceListResponse {
  result: CloudflareKVNamespaceResponse[]
}

/**
 * Cloudflare KV put options
 */
interface CloudflareKVPutOptions {
  expiration?: number
  expirationTtl?: number
  metadata?: Record<string, unknown>
}

/**
 * Cloudflare R2 bucket creation parameters
 */
interface CloudflareR2BucketCreateParams {
  name: string
  locationHint?: string
}

/**
 * Cloudflare R2 bucket response
 */
interface CloudflareR2BucketResponse {
  name: string
  creation_date: string
  location?: string
}

/**
 * Cloudflare R2 bucket list response
 */
interface CloudflareR2BucketListResponse {
  result: CloudflareR2BucketResponse[]
}

/**
 * Cloudflare D1 database creation parameters
 */
interface CloudflareD1DatabaseCreateParams {
  name: string
}

/**
 * Cloudflare D1 database response
 */
interface CloudflareD1DatabaseResponse {
  uuid: string
  name: string
  version: string
  num_tables: number
  file_size: number
  created_at: string
}

/**
 * Cloudflare D1 database list response
 */
interface CloudflareD1DatabaseListResponse {
  result: CloudflareD1DatabaseResponse[]
}

/**
 * Cloudflare D1 query parameters
 */
interface CloudflareD1QueryParams {
  sql: string
  params?: unknown[]
}

/**
 * Cloudflare D1 query response
 */
interface CloudflareD1QueryResponse {
  results: Record<string, unknown>[]
  meta: {
    changes: number
    last_row_id: number
  }
}

/**
 * Cloudflare SSL certificate response
 */
interface CloudflareSSLCertificateResponse {
  id: string
  type: string
  hosts: string[]
  status: 'active' | 'pending_validation' | 'pending_issuance' | 'pending_deployment'
  issuer: string
  expires_on: string
}

/**
 * Cloudflare client interface
 * Matches the official Cloudflare SDK structure
 */
interface CloudflareClient {
  user: {
    tokens: {
      verify(): Promise<CloudflareTokenVerifyResponse>
    }
  }
  zones: {
    create(params: CloudflareZoneCreateParams): Promise<CloudflareZoneResponse>
    get(zoneId: string): Promise<CloudflareZoneResponse>
    list(params: CloudflareZoneListParams): Promise<CloudflareZoneListResponse>
    delete(zoneId: string): Promise<void>
  }
  dns: {
    records: {
      create(zoneId: string, params: CloudflareDNSRecordCreateParams): Promise<CloudflareDNSRecordResponse>
      list(zoneId: string, params?: CloudflareDNSRecordListParams): Promise<CloudflareDNSRecordListResponse>
      update(zoneId: string, recordId: string, params: Partial<CloudflareDNSRecordCreateParams>): Promise<CloudflareDNSRecordResponse>
      delete(zoneId: string, recordId: string): Promise<void>
    }
  }
  workers: {
    scripts: {
      get(accountId: string, scriptName: string): Promise<CloudflareWorkerScriptResponse>
      update(accountId: string, scriptName: string, params: CloudflareWorkerScriptUpdateParams): Promise<CloudflareWorkerScriptResponse>
      delete(accountId: string, scriptName: string): Promise<void>
    }
    routes: {
      create(accountId: string, params: CloudflareWorkerRouteCreateParams): Promise<CloudflareWorkerRouteResponse>
    }
    crons: {
      update(accountId: string, scriptName: string, params: CloudflareWorkerCronUpdateParams): Promise<void>
    }
  }
  kv: {
    namespaces: {
      create(accountId: string, params: CloudflareKVNamespaceCreateParams): Promise<CloudflareKVNamespaceResponse>
      list(accountId: string): Promise<CloudflareKVNamespaceListResponse>
      values: {
        put(accountId: string, namespaceId: string, key: string, value: string | ArrayBuffer, options?: CloudflareKVPutOptions): Promise<void>
        get(accountId: string, namespaceId: string, key: string): Promise<string | null>
        delete(accountId: string, namespaceId: string, key: string): Promise<void>
      }
    }
  }
  r2: {
    buckets: {
      create(accountId: string, params: CloudflareR2BucketCreateParams): Promise<CloudflareR2BucketResponse>
      list(accountId: string): Promise<CloudflareR2BucketListResponse>
      delete(accountId: string, bucketName: string): Promise<void>
    }
  }
  d1: {
    databases: {
      create(accountId: string, params: CloudflareD1DatabaseCreateParams): Promise<CloudflareD1DatabaseResponse>
      list(accountId: string): Promise<CloudflareD1DatabaseListResponse>
      query(accountId: string, databaseId: string, params: CloudflareD1QueryParams): Promise<CloudflareD1QueryResponse>
      delete(accountId: string, databaseId: string): Promise<void>
    }
  }
  ssl: {
    certificates: {
      get(zoneId: string): Promise<CloudflareSSLCertificateResponse>
    }
  }
}

// =============================================================================
// Exports
// =============================================================================

export { CloudflareIntegration };
