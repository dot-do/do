/**
 * Cloudflare Integration Tests
 *
 * Tests for the Cloudflare API integration.
 *
 * @module integrations/__tests__/cloudflare.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CloudflareDeepIntegration } from '../types/integrations';
import {
  CloudflareIntegration,
  CloudflareConnectConfig,
  ZoneConfig,
  DNSRecordConfig,
  WorkerConfig,
  Zone,
  DNSRecord,
  Worker,
} from './cloudflare';
import {
  BaseIntegrationConfig,
  CredentialStore,
  IntegrationEventEmitter,
  IntegrationError,
} from './base';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create mock credential store
 */
function createMockCredentialStore(): CredentialStore {
  const store = new Map<string, string>();

  return {
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    has: vi.fn(async (key: string) => store.has(key)),
  };
}

/**
 * Create mock event emitter
 */
function createMockEventEmitter(): IntegrationEventEmitter {
  return {
    emit: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  };
}

/**
 * Create mock Cloudflare client
 */
function createMockCloudflareClient() {
  return {
    user: {
      tokens: {
        verify: vi.fn().mockResolvedValue({
          status: 'active',
          expires_on: new Date(Date.now() + 86400000).toISOString(),
        }),
      },
    },
    zones: {
      create: vi.fn().mockResolvedValue({
        id: 'zone_test123',
        name: 'example.com',
        status: 'pending',
        paused: false,
        type: 'full',
        name_servers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
        created_on: new Date().toISOString(),
        modified_on: new Date().toISOString(),
      }),
      get: vi.fn().mockResolvedValue({
        id: 'zone_test123',
        name: 'example.com',
        status: 'active',
        paused: false,
        type: 'full',
        name_servers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
        created_on: new Date().toISOString(),
        modified_on: new Date().toISOString(),
      }),
      list: vi.fn().mockResolvedValue({
        result: [
          {
            id: 'zone_test123',
            name: 'example.com',
            status: 'active',
            paused: false,
            type: 'full',
            name_servers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
            created_on: new Date().toISOString(),
            modified_on: new Date().toISOString(),
          },
        ],
      }),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    dns: {
      records: {
        create: vi.fn().mockResolvedValue({
          id: 'record_test123',
          zone_id: 'zone_test123',
          zone_name: 'example.com',
          name: 'www.example.com',
          type: 'A',
          content: '192.0.2.1',
          proxied: true,
          proxiable: true,
          ttl: 1,
          created_on: new Date().toISOString(),
          modified_on: new Date().toISOString(),
        }),
        list: vi.fn().mockResolvedValue({
          result: [
            {
              id: 'record_test123',
              zone_id: 'zone_test123',
              zone_name: 'example.com',
              name: 'www.example.com',
              type: 'A',
              content: '192.0.2.1',
              proxied: true,
              proxiable: true,
              ttl: 1,
              created_on: new Date().toISOString(),
              modified_on: new Date().toISOString(),
            },
          ],
        }),
        update: vi.fn().mockResolvedValue({
          id: 'record_test123',
          zone_id: 'zone_test123',
          zone_name: 'example.com',
          name: 'www.example.com',
          type: 'A',
          content: '192.0.2.2',
          proxied: true,
          proxiable: true,
          ttl: 1,
          created_on: new Date().toISOString(),
          modified_on: new Date().toISOString(),
        }),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    },
    workers: {
      scripts: {
        get: vi.fn().mockResolvedValue({
          id: 'worker_test123',
          created_on: new Date().toISOString(),
          modified_on: new Date().toISOString(),
          etag: 'etag123',
        }),
        update: vi.fn().mockResolvedValue({
          id: 'worker_test123',
          created_on: new Date().toISOString(),
          modified_on: new Date().toISOString(),
          etag: 'etag456',
        }),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      routes: {
        create: vi.fn().mockResolvedValue({
          id: 'route_test123',
          pattern: '*.example.com/*',
          script: 'my-worker',
        }),
      },
      crons: {
        update: vi.fn().mockResolvedValue(undefined),
      },
    },
    kv: {
      namespaces: {
        create: vi.fn().mockResolvedValue({
          id: 'kv_test123',
          title: 'My KV Namespace',
          supports_url_encoding: true,
        }),
        list: vi.fn().mockResolvedValue({
          result: [
            { id: 'kv_test123', title: 'My KV Namespace' },
          ],
        }),
        values: {
          put: vi.fn().mockResolvedValue(undefined),
          get: vi.fn().mockResolvedValue('test-value'),
          delete: vi.fn().mockResolvedValue(undefined),
        },
      },
    },
    r2: {
      buckets: {
        create: vi.fn().mockResolvedValue({
          name: 'my-bucket',
          creation_date: new Date().toISOString(),
          location: 'wnam',
        }),
        list: vi.fn().mockResolvedValue({
          result: [
            { name: 'my-bucket', creation_date: new Date().toISOString() },
          ],
        }),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    },
    d1: {
      databases: {
        create: vi.fn().mockResolvedValue({
          uuid: 'd1_test123',
          name: 'my-database',
          version: 'production',
          num_tables: 0,
          file_size: 0,
          created_at: new Date().toISOString(),
        }),
        list: vi.fn().mockResolvedValue({
          result: [
            {
              uuid: 'd1_test123',
              name: 'my-database',
              version: 'production',
              num_tables: 5,
              file_size: 1024,
              created_at: new Date().toISOString(),
            },
          ],
        }),
        query: vi.fn().mockResolvedValue({
          results: [{ id: 1, name: 'test' }],
          meta: { changes: 0, last_row_id: 0 },
        }),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    },
    ssl: {
      certificates: {
        get: vi.fn().mockResolvedValue({
          id: 'cert_test123',
          type: 'universal',
          hosts: ['example.com', '*.example.com'],
          status: 'active',
          issuer: 'DigiCert',
          expires_on: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        }),
      },
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('CloudflareIntegration', () => {
  let config: BaseIntegrationConfig;
  let credentials: CredentialStore;
  let events: IntegrationEventEmitter;
  let cloudflareClient: ReturnType<typeof createMockCloudflareClient>;
  let integration: CloudflareIntegration;

  beforeEach(() => {
    config = {
      doId: 'test-do-id',
      workspaceId: 'test-workspace-id',
      debug: false,
    };
    credentials = createMockCredentialStore();
    events = createMockEventEmitter();
    cloudflareClient = createMockCloudflareClient();
    integration = new CloudflareIntegration(config, credentials, events, cloudflareClient as any);
  });

  describe('connect', () => {
    it('should connect Cloudflare account', async () => {
      const connectConfig: CloudflareConnectConfig = {
        accountId: 'acct_test123',
        apiToken: 'token_test123',
      };

      const state = await integration.connect(connectConfig);

      expect(state.type).toBe('cloudflare');
      expect(state.status).toBe('active');
      expect(state.accountId).toBe('acct_test123');
    });

    it('should verify API token', async () => {
      await integration.connect({
        accountId: 'acct_test123',
        apiToken: 'token_test123',
      });

      expect(cloudflareClient.user.tokens.verify).toHaveBeenCalled();
    });

    it('should store credentials', async () => {
      await integration.connect({
        accountId: 'acct_test123',
        apiToken: 'token_test123',
      });

      expect(credentials.set).toHaveBeenCalledWith(
        'test-do-id:cloudflare:api_token',
        'token_test123',
        undefined
      );
      expect(credentials.set).toHaveBeenCalledWith(
        'test-do-id:cloudflare:account_id',
        'acct_test123',
        undefined
      );
    });

    it('should emit connected event', async () => {
      await integration.connect({
        accountId: 'acct_test123',
        apiToken: 'token_test123',
      });

      expect(events.emit).toHaveBeenCalledWith({
        type: 'integration:connected',
        payload: { integrationType: 'cloudflare' },
      });
    });

    it('should handle inactive token', async () => {
      cloudflareClient.user.tokens.verify.mockResolvedValue({ status: 'inactive' });

      await expect(
        integration.connect({
          accountId: 'acct_test123',
          apiToken: 'invalid_token',
        })
      ).rejects.toThrow(IntegrationError);
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      await integration.connect({
        accountId: 'acct_test123',
        apiToken: 'token_test123',
      });
    });

    it('should disconnect and clear state', async () => {
      const result = await integration.disconnect();

      expect(result).toBe(true);
      expect(await integration.getState()).toBeNull();
    });

    it('should delete stored credentials', async () => {
      await integration.disconnect();

      expect(credentials.delete).toHaveBeenCalledWith('test-do-id:cloudflare:api_token');
      expect(credentials.delete).toHaveBeenCalledWith('test-do-id:cloudflare:account_id');
    });
  });

  describe('healthCheck', () => {
    it('should return not_configured when not connected', async () => {
      const result = await integration.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.status).toBe('not_configured');
    });

    it('should verify token is active', async () => {
      await integration.connect({
        accountId: 'acct_test123',
        apiToken: 'token_test123',
      });

      const result = await integration.healthCheck({ detailed: true });

      expect(result.healthy).toBe(true);
      expect(result.status).toBe('active');
    });
  });

  describe('Zone Operations', () => {
    beforeEach(async () => {
      await integration.connect({
        accountId: 'acct_test123',
        apiToken: 'token_test123',
      });
    });

    describe('createZone', () => {
      it('should create zone', async () => {
        const zoneConfig: ZoneConfig = {
          name: 'example.com',
          type: 'full',
        };

        const zone = await integration.createZone(zoneConfig);

        expect(zone.id).toBe('zone_test123');
        expect(zone.name).toBe('example.com');
        expect(zone.nameServers).toContain('ns1.cloudflare.com');
      });

      it('should update tracked zones', async () => {
        await integration.createZone({ name: 'example.com' });

        const state = await integration.getState();
        expect(state!.zoneIds).toContain('zone_test123');
      });
    });

    describe('getZone', () => {
      it('should retrieve zone', async () => {
        const zone = await integration.getZone('zone_test123');

        expect(zone.name).toBe('example.com');
        expect(zone.status).toBe('active');
      });
    });

    describe('listZones', () => {
      it('should list zones', async () => {
        const zones = await integration.listZones();

        expect(zones).toHaveLength(1);
        expect(zones[0].name).toBe('example.com');
      });
    });

    describe('deleteZone', () => {
      it('should delete zone', async () => {
        // First create a zone to populate zoneIds
        await integration.createZone({ name: 'example.com' });

        await integration.deleteZone('zone_test123');

        expect(cloudflareClient.zones.delete).toHaveBeenCalledWith('zone_test123');

        const state = await integration.getState();
        expect(state!.zoneIds).not.toContain('zone_test123');
      });
    });
  });

  describe('DNS Operations', () => {
    beforeEach(async () => {
      await integration.connect({
        accountId: 'acct_test123',
        apiToken: 'token_test123',
      });
    });

    describe('createDNSRecord', () => {
      it('should create DNS record', async () => {
        const recordConfig: DNSRecordConfig = {
          type: 'A',
          name: 'www',
          content: '192.0.2.1',
          proxied: true,
        };

        const record = await integration.createDNSRecord('zone_test123', recordConfig);

        expect(record.id).toBe('record_test123');
        expect(record.type).toBe('A');
        expect(record.content).toBe('192.0.2.1');
        expect(record.proxied).toBe(true);
      });
    });

    describe('listDNSRecords', () => {
      it('should list DNS records', async () => {
        const records = await integration.listDNSRecords('zone_test123');

        expect(records).toHaveLength(1);
        expect(records[0].type).toBe('A');
      });

      it('should filter by type', async () => {
        await integration.listDNSRecords('zone_test123', { type: 'CNAME' });

        expect(cloudflareClient.dns.records.list).toHaveBeenCalledWith(
          'zone_test123',
          expect.objectContaining({ type: 'CNAME' })
        );
      });
    });

    describe('updateDNSRecord', () => {
      it('should update DNS record', async () => {
        const record = await integration.updateDNSRecord(
          'zone_test123',
          'record_test123',
          { content: '192.0.2.2' }
        );

        expect(record.content).toBe('192.0.2.2');
      });
    });

    describe('deleteDNSRecord', () => {
      it('should delete DNS record', async () => {
        await integration.deleteDNSRecord('zone_test123', 'record_test123');

        expect(cloudflareClient.dns.records.delete).toHaveBeenCalledWith(
          'zone_test123',
          'record_test123'
        );
      });
    });
  });

  describe('Workers Operations', () => {
    beforeEach(async () => {
      await integration.connect({
        accountId: 'acct_test123',
        apiToken: 'token_test123',
      });
    });

    describe('deployWorker', () => {
      it('should deploy worker', async () => {
        const workerConfig: WorkerConfig = {
          name: 'my-worker',
          script: 'export default { fetch() { return new Response("Hello") } }',
        };

        const worker = await integration.deployWorker(workerConfig);

        expect(worker.id).toBe('worker_test123');
        expect(worker.name).toBe('my-worker');
      });

      it('should set up routes', async () => {
        await integration.deployWorker({
          name: 'my-worker',
          script: 'export default {}',
          routes: ['*.example.com/*'],
        });

        expect(cloudflareClient.workers.routes.create).toHaveBeenCalled();
      });

      it('should set up cron triggers', async () => {
        await integration.deployWorker({
          name: 'my-worker',
          script: 'export default {}',
          crons: ['0 * * * *'],
        });

        expect(cloudflareClient.workers.crons.update).toHaveBeenCalled();
      });
    });

    describe('getWorker', () => {
      it('should retrieve worker', async () => {
        const worker = await integration.getWorker('my-worker');

        expect(worker.id).toBe('worker_test123');
      });
    });

    describe('deleteWorker', () => {
      it('should delete worker', async () => {
        await integration.deleteWorker('my-worker');

        expect(cloudflareClient.workers.scripts.delete).toHaveBeenCalledWith(
          'acct_test123',
          'my-worker'
        );
      });
    });
  });

  describe('KV Operations', () => {
    beforeEach(async () => {
      await integration.connect({
        accountId: 'acct_test123',
        apiToken: 'token_test123',
      });
    });

    describe('createKVNamespace', () => {
      it('should create KV namespace', async () => {
        const namespace = await integration.createKVNamespace({ title: 'My KV Namespace' });

        expect(namespace.id).toBe('kv_test123');
        expect(namespace.title).toBe('My KV Namespace');
      });

      it('should update tracked namespaces', async () => {
        await integration.createKVNamespace({ title: 'My KV Namespace' });

        const state = await integration.getState();
        expect(state!.kvNamespaces).toContain('kv_test123');
      });
    });

    describe('kvPut', () => {
      it('should write value to KV', async () => {
        await integration.kvPut('kv_test123', 'key', 'value');

        expect(cloudflareClient.kv.namespaces.values.put).toHaveBeenCalledWith(
          'acct_test123',
          'kv_test123',
          'key',
          'value',
          undefined
        );
      });

      it('should support TTL', async () => {
        await integration.kvPut('kv_test123', 'key', 'value', { expirationTtl: 3600 });

        expect(cloudflareClient.kv.namespaces.values.put).toHaveBeenCalledWith(
          'acct_test123',
          'kv_test123',
          'key',
          'value',
          { expirationTtl: 3600 }
        );
      });
    });

    describe('kvGet', () => {
      it('should read value from KV', async () => {
        const value = await integration.kvGet('kv_test123', 'key');

        expect(value).toBe('test-value');
      });
    });

    describe('kvDelete', () => {
      it('should delete value from KV', async () => {
        await integration.kvDelete('kv_test123', 'key');

        expect(cloudflareClient.kv.namespaces.values.delete).toHaveBeenCalledWith(
          'acct_test123',
          'kv_test123',
          'key'
        );
      });
    });
  });

  describe('R2 Operations', () => {
    beforeEach(async () => {
      await integration.connect({
        accountId: 'acct_test123',
        apiToken: 'token_test123',
      });
    });

    describe('createR2Bucket', () => {
      it('should create R2 bucket', async () => {
        const bucket = await integration.createR2Bucket({ name: 'my-bucket' });

        expect(bucket.name).toBe('my-bucket');
      });

      it('should update tracked buckets', async () => {
        await integration.createR2Bucket({ name: 'my-bucket' });

        const state = await integration.getState();
        expect(state!.r2Buckets).toContain('my-bucket');
      });
    });

    describe('deleteR2Bucket', () => {
      it('should delete R2 bucket', async () => {
        await integration.createR2Bucket({ name: 'my-bucket' });
        await integration.deleteR2Bucket('my-bucket');

        expect(cloudflareClient.r2.buckets.delete).toHaveBeenCalledWith(
          'acct_test123',
          'my-bucket'
        );

        const state = await integration.getState();
        expect(state!.r2Buckets).not.toContain('my-bucket');
      });
    });
  });

  describe('D1 Operations', () => {
    beforeEach(async () => {
      await integration.connect({
        accountId: 'acct_test123',
        apiToken: 'token_test123',
      });
    });

    describe('createD1Database', () => {
      it('should create D1 database', async () => {
        const database = await integration.createD1Database({ name: 'my-database' });

        expect(database.uuid).toBe('d1_test123');
        expect(database.name).toBe('my-database');
      });

      it('should update tracked databases', async () => {
        await integration.createD1Database({ name: 'my-database' });

        const state = await integration.getState();
        expect(state!.d1Databases).toContain('d1_test123');
      });
    });

    describe('d1Query', () => {
      it('should execute SQL query', async () => {
        const result = await integration.d1Query(
          'd1_test123',
          'SELECT * FROM users WHERE id = ?',
          [1]
        );

        expect(result.results).toHaveLength(1);
        expect(result.results[0]).toEqual({ id: 1, name: 'test' });
      });
    });

    describe('deleteD1Database', () => {
      it('should delete D1 database', async () => {
        await integration.createD1Database({ name: 'my-database' });
        await integration.deleteD1Database('d1_test123');

        expect(cloudflareClient.d1.databases.delete).toHaveBeenCalledWith(
          'acct_test123',
          'd1_test123'
        );

        const state = await integration.getState();
        expect(state!.d1Databases).not.toContain('d1_test123');
      });
    });
  });

  describe('SSL Operations', () => {
    beforeEach(async () => {
      await integration.connect({
        accountId: 'acct_test123',
        apiToken: 'token_test123',
      });
    });

    describe('getSSLCertificate', () => {
      it('should retrieve SSL certificate', async () => {
        const cert = await integration.getSSLCertificate('zone_test123');

        expect(cert).not.toBeNull();
        expect(cert!.status).toBe('active');
        expect(cert!.hosts).toContain('example.com');
      });

      it('should return null when no certificate', async () => {
        cloudflareClient.ssl.certificates.get.mockRejectedValue(new Error('Not found'));

        const cert = await integration.getSSLCertificate('zone_test123');

        expect(cert).toBeNull();
      });
    });
  });

  describe('handleWebhook', () => {
    beforeEach(async () => {
      await integration.connect({
        accountId: 'acct_test123',
        apiToken: 'token_test123',
      });
    });

    it('should handle webhook payload', async () => {
      const payload = {
        body: JSON.stringify({
          type: 'logpush',
          data: {},
        }),
        headers: {},
      };

      const result = await integration.handleWebhook(payload);

      expect(result.success).toBe(true);
      expect(result.eventType).toBe('logpush');
    });

    it('should handle invalid payload', async () => {
      const payload = {
        body: 'invalid json',
        headers: {},
      };

      const result = await integration.handleWebhook(payload);

      expect(result.success).toBe(false);
    });
  });

  describe('refresh', () => {
    beforeEach(async () => {
      await integration.connect({
        accountId: 'acct_test123',
        apiToken: 'token_test123',
      });
    });

    it('should refresh resource lists', async () => {
      const state = await integration.refresh();

      expect(state.zoneIds).toHaveLength(1);
      expect(state.kvNamespaces).toHaveLength(1);
      expect(state.r2Buckets).toHaveLength(1);
      expect(state.d1Databases).toHaveLength(1);
    });
  });
});
