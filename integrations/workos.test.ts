/**
 * WorkOS Integration Tests
 *
 * Tests for the WorkOS integration.
 *
 * @module integrations/__tests__/workos.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { WorkOSDeepIntegration } from '../types/integrations';
import {
  WorkOSIntegration,
  WorkOSConnectConfig,
  SSOConnectionConfig,
  SSOProfile,
  DirectoryUser,
} from './workos';
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
 * Create mock WorkOS client
 */
function createMockWorkOSClient() {
  return {
    organizations: {
      create: vi.fn().mockResolvedValue({
        id: 'org_test123',
        name: 'Test Organization',
        domains: ['example.com'],
      }),
      get: vi.fn().mockResolvedValue({
        id: 'org_test123',
        name: 'Test Organization',
        domains: ['example.com'],
      }),
    },
    sso: {
      createConnection: vi.fn().mockResolvedValue({
        id: 'conn_test123',
        connection_type: 'google',
        name: 'Google SSO',
      }),
      listConnections: vi.fn().mockResolvedValue({
        data: [
          { id: 'conn_test123', connection_type: 'google' },
          { id: 'conn_test456', connection_type: 'okta' },
        ],
      }),
      getAuthorizationUrl: vi.fn().mockResolvedValue(
        'https://auth.workos.com/sso/authorize?connection=conn_test123'
      ),
      getProfileAndToken: vi.fn().mockResolvedValue({
        profile: {
          id: 'profile_test123',
          connection_id: 'conn_test123',
          connection_type: 'google',
          organization_id: 'org_test123',
          email: 'user@example.com',
          first_name: 'Test',
          last_name: 'User',
          raw_attributes: {},
        },
        access_token: 'token_test123',
      }),
    },
    directorySync: {
      createDirectory: vi.fn().mockResolvedValue({
        id: 'dir_test123',
        name: 'Test Directory',
        type: 'okta_scim',
      }),
      listUsers: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'user_test123',
            directory_id: 'dir_test123',
            email: 'user@example.com',
            first_name: 'Test',
            last_name: 'User',
            username: 'testuser',
            state: 'active',
            groups: [],
          },
        ],
        list_metadata: { after: null },
      }),
      listGroups: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'group_test123',
            directory_id: 'dir_test123',
            name: 'Engineering',
          },
        ],
        list_metadata: { after: null },
      }),
    },
    portal: {
      generateLink: vi.fn().mockResolvedValue({
        link: 'https://admin.workos.com/portal/org_test123',
      }),
    },
    auditLogs: {
      createEvent: vi.fn().mockResolvedValue(undefined),
      listEvents: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'event_test123',
            action: 'user.signed_in',
            occurred_at: new Date().toISOString(),
            actor: { id: 'user_123', type: 'user' },
            targets: [],
            metadata: {},
          },
        ],
        list_metadata: { after: null },
      }),
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('WorkOSIntegration', () => {
  let config: BaseIntegrationConfig;
  let credentials: CredentialStore;
  let events: IntegrationEventEmitter;
  let workosClient: ReturnType<typeof createMockWorkOSClient>;
  let integration: WorkOSIntegration;

  beforeEach(() => {
    config = {
      doId: 'test-do-id',
      workspaceId: 'test-workspace-id',
      debug: false,
    };
    credentials = createMockCredentialStore();
    events = createMockEventEmitter();
    workosClient = createMockWorkOSClient();
    integration = new WorkOSIntegration(config, credentials, events, workosClient as any);
  });

  describe('connect', () => {
    it('should create WorkOS organization', async () => {
      const connectConfig: WorkOSConnectConfig = {
        organizationName: 'Test Organization',
        domains: ['example.com'],
        callbackUrl: 'https://example.com/sso/callback',
      };

      const state = await integration.connect(connectConfig);

      expect(state.type).toBe('workos');
      expect(state.status).toBe('Active');
      expect(state.organizationId).toBe('org_test123');
    });

    it('should enable specified features', async () => {
      const state = await integration.connect({
        organizationName: 'Test Org',
        features: {
          sso: true,
          directorySync: true,
          adminPortal: false,
          auditLogs: true,
        },
        callbackUrl: 'https://example.com/callback',
      });

      expect(state.features).toEqual({
        sso: true,
        directorySync: true,
        adminPortal: false,
        auditLogs: true,
      });
    });

    it('should emit connected event', async () => {
      await integration.connect({
        organizationName: 'Test Org',
        callbackUrl: 'https://example.com/callback',
      });

      expect(events.emit).toHaveBeenCalledWith({
        type: 'integration:connected',
        payload: { integrationType: 'workos' },
      });
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      await integration.connect({
        organizationName: 'Test Org',
        callbackUrl: 'https://example.com/callback',
      });
    });

    it('should disconnect and clear state', async () => {
      const result = await integration.disconnect();

      expect(result).toBe(true);
      expect(await integration.getState()).toBeNull();
    });
  });

  describe('healthCheck', () => {
    it('should return not_configured when not connected', async () => {
      const result = await integration.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.status).toBe('NotConfigured');
    });

    it('should verify organization access', async () => {
      await integration.connect({
        organizationName: 'Test Org',
        callbackUrl: 'https://example.com/callback',
      });

      const result = await integration.healthCheck({ detailed: true });

      expect(result.healthy).toBe(true);
      expect(result.details).toEqual({
        organizationId: 'org_test123',
        organizationName: 'Test Organization',
        domains: ['example.com'],
      });
    });
  });

  describe('refresh', () => {
    beforeEach(async () => {
      await integration.connect({
        organizationName: 'Test Org',
        callbackUrl: 'https://example.com/callback',
      });
    });

    it('should update SSO providers list', async () => {
      const state = await integration.refresh();

      expect(state.ssoProviders).toEqual(['google', 'okta']);
    });
  });

  describe('createSSOConnection', () => {
    beforeEach(async () => {
      await integration.connect({
        organizationName: 'Test Org',
        callbackUrl: 'https://example.com/callback',
      });
    });

    it('should create SSO connection', async () => {
      const connectionConfig: SSOConnectionConfig = {
        provider: 'google',
        name: 'Google SSO',
      };

      const connectionId = await integration.createSSOConnection(connectionConfig);

      expect(connectionId).toBe('conn_test123');
    });

    it('should update ssoProviders in state', async () => {
      await integration.createSSOConnection({
        provider: 'google',
        name: 'Google SSO',
      });

      const state = await integration.getState();
      expect(state!.ssoProviders).toContain('google');
    });
  });

  describe('getAuthorizationUrl', () => {
    beforeEach(async () => {
      await integration.connect({
        organizationName: 'Test Org',
        callbackUrl: 'https://example.com/callback',
      });
    });

    it('should return authorization URL', async () => {
      const result = await integration.getAuthorizationUrl(
        'conn_test123',
        'https://example.com/callback'
      );

      expect(result.url).toContain('auth.workos.com');
      expect(result.state).toBeDefined();
    });
  });

  describe('getProfile', () => {
    beforeEach(async () => {
      await integration.connect({
        organizationName: 'Test Org',
        callbackUrl: 'https://example.com/callback',
      });
    });

    it('should exchange code for profile', async () => {
      const profile = await integration.getProfile('auth_code_test');

      expect(profile.id).toBe('profile_test123');
      expect(profile.email).toBe('user@example.com');
      expect(profile.connectionType).toBe('google');
    });
  });

  describe('Directory Sync', () => {
    beforeEach(async () => {
      await integration.connect({
        organizationName: 'Test Org',
        features: { directorySync: true },
        callbackUrl: 'https://example.com/callback',
      });
    });

    describe('createDirectoryConnection', () => {
      it('should create directory connection', async () => {
        const directoryId = await integration.createDirectoryConnection({
          provider: 'okta_scim',
          name: 'Okta Directory',
        });

        expect(directoryId).toBe('dir_test123');
      });
    });

    describe('listDirectoryUsers', () => {
      it('should list directory users', async () => {
        const { users } = await integration.listDirectoryUsers('dir_test123');

        expect(users).toHaveLength(1);
        expect(users[0].email).toBe('user@example.com');
        // Note: WorkOS API returns lowercase 'active', we pass it through unchanged
        expect(users[0].state).toBe('active');
      });
    });

    describe('listDirectoryGroups', () => {
      it('should list directory groups', async () => {
        const { groups } = await integration.listDirectoryGroups('dir_test123');

        expect(groups).toHaveLength(1);
        expect(groups[0].name).toBe('Engineering');
      });
    });
  });

  describe('Admin Portal', () => {
    beforeEach(async () => {
      await integration.connect({
        organizationName: 'Test Org',
        features: { adminPortal: true },
        callbackUrl: 'https://example.com/callback',
      });
    });

    it('should generate admin portal link', async () => {
      const link = await integration.generateAdminPortalLink('sso');

      expect(link.url).toContain('admin.workos.com');
      expect(link.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should throw when admin portal is disabled', async () => {
      const state = await integration.getState();
      (state as any).features.adminPortal = false;

      await expect(integration.generateAdminPortalLink()).rejects.toThrow(
        'Admin Portal feature is not enabled'
      );
    });
  });

  describe('Audit Logs', () => {
    beforeEach(async () => {
      await integration.connect({
        organizationName: 'Test Org',
        features: { auditLogs: true },
        callbackUrl: 'https://example.com/callback',
      });
    });

    describe('createAuditLogEvent', () => {
      it('should create audit log event', async () => {
        await integration.createAuditLogEvent({
          action: 'user.signed_in',
          actor: { id: 'user_123', type: 'user' },
        });

        expect(workosClient.auditLogs.createEvent).toHaveBeenCalled();
      });
    });

    describe('listAuditLogEvents', () => {
      it('should list audit log events', async () => {
        const { events: auditEvents } = await integration.listAuditLogEvents();

        expect(auditEvents).toHaveLength(1);
        expect(auditEvents[0].action).toBe('user.signed_in');
      });
    });

    it('should throw when audit logs are disabled', async () => {
      const state = await integration.getState();
      (state as any).features.auditLogs = false;

      await expect(
        integration.createAuditLogEvent({ action: 'test' })
      ).rejects.toThrow('Audit Logs feature is not enabled');
    });
  });

  describe('handleWebhook', () => {
    beforeEach(async () => {
      await integration.connect({
        organizationName: 'Test Org',
        callbackUrl: 'https://example.com/callback',
      });
      await credentials.set('test-do-id:workos:webhook_secret', 'whsec_test', undefined);
    });

    it('should handle dsync.user.created event', async () => {
      const payload = {
        body: JSON.stringify({
          event: 'dsync.user.created',
          data: { id: 'user_test123' },
        }),
        headers: {
          'workos-signature': 'test-signature',
        },
      };

      const result = await integration.handleWebhook(payload);

      expect(result.success).toBe(true);
      expect(result.eventType).toBe('dsync.user.created');
    });

    it('should reject webhooks without signature', async () => {
      const payload = {
        body: JSON.stringify({ event: 'test' }),
        headers: {},
      };

      const result = await integration.handleWebhook(payload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing WorkOS signature');
    });
  });
});
