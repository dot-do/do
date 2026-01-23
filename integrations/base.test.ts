/**
 * Base Integration Tests
 *
 * Tests for the base integration interface and utilities.
 *
 * @module integrations/__tests__/base.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  DeepIntegration,
  DeepIntegrationType,
  DeepIntegrationStatus,
} from '../types/integrations';
import {
  BaseIntegration,
  BaseIntegrationConfig,
  CredentialStore,
  IntegrationEventEmitter,
  HealthCheckResult,
  WebhookPayload,
  WebhookResult,
  IntegrationError,
  withRetry,
} from './base';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Test integration type for testing base class
 */
interface TestDeepIntegration extends DeepIntegration {
  type: 'stripe'; // Use existing type for testing
  testField?: string;
}

/**
 * Concrete test implementation of BaseIntegration
 */
class TestIntegration extends BaseIntegration<TestDeepIntegration> {
  readonly type = 'stripe' as const;

  async connect(config: { testField?: string }): Promise<TestDeepIntegration> {
    this.state = {
      type: 'stripe',
      status: 'Active',
      testField: config.testField,
      connectedAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.emitEvent({
      type: 'integration:connected',
      payload: { integrationType: 'stripe' },
    });

    return this.state!;
  }

  async handleWebhook(payload: WebhookPayload): Promise<WebhookResult> {
    try {
      const event = JSON.parse(payload.body);
      return {
        success: true,
        eventType: event.type,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Invalid payload',
      };
    }
  }

  // Expose protected methods for testing
  public testUpdateState(updates: Partial<TestDeepIntegration>): void {
    this.updateState(updates);
  }

  public testSetStatus(status: DeepIntegrationStatus, error?: string): void {
    this.setStatus(status, error);
  }

  public async testStoreCredential(name: string, value: string): Promise<void> {
    await this.storeCredential(name, value);
  }

  public async testGetCredential(name: string): Promise<string | null> {
    return this.getCredential(name);
  }
}

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
  const handlers: Array<(event: any) => void> = [];

  return {
    emit: vi.fn((event) => {
      handlers.forEach((h) => h(event));
    }),
    subscribe: vi.fn((handler) => {
      handlers.push(handler);
      return () => {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      };
    }),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('BaseIntegration', () => {
  let config: BaseIntegrationConfig;
  let credentials: CredentialStore;
  let events: IntegrationEventEmitter;
  let integration: TestIntegration;

  beforeEach(() => {
    config = {
      doId: 'test-do-id',
      workspaceId: 'test-workspace-id',
      debug: false,
    };
    credentials = createMockCredentialStore();
    events = createMockEventEmitter();
    integration = new TestIntegration(config, credentials, events);
  });

  describe('constructor', () => {
    it('should initialize with null state', async () => {
      const state = await integration.getState();
      expect(state).toBeNull();
    });

    it('should store configuration', () => {
      expect(integration.type).toBe('stripe');
    });
  });

  describe('connect', () => {
    it('should connect and set state', async () => {
      const state = await integration.connect({ testField: 'test-value' });

      expect(state.status).toBe('Active');
      expect(state.testField).toBe('test-value');
      expect(state.connectedAt).toBeDefined();
    });

    it('should emit connected event', async () => {
      await integration.connect({});

      expect(events.emit).toHaveBeenCalledWith({
        type: 'integration:connected',
        payload: { integrationType: 'stripe' },
      });
    });
  });

  describe('disconnect', () => {
    it('should return false when not connected', async () => {
      const result = await integration.disconnect();
      expect(result).toBe(false);
    });

    it('should disconnect and clear state', async () => {
      await integration.connect({});
      const result = await integration.disconnect();

      expect(result).toBe(true);
      expect(await integration.getState()).toBeNull();
    });

    it('should emit disconnected event', async () => {
      await integration.connect({});
      await integration.disconnect();

      expect(events.emit).toHaveBeenCalledWith({
        type: 'integration:disconnected',
        payload: { integrationType: 'stripe' },
      });
    });
  });

  describe('healthCheck', () => {
    it('should return NotConfigured when not connected', async () => {
      const result = await integration.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.status).toBe('NotConfigured');
      expect(result.error).toBe('Integration not configured');
    });

    it('should return healthy when Active', async () => {
      await integration.connect({});
      const result = await integration.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.status).toBe('Active');
      expect(result.latencyMs).toBeDefined();
    });

    it('should return unhealthy when status is not active', async () => {
      await integration.connect({});
      integration.testSetStatus('Error', 'Test error');

      const result = await integration.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.status).toBe('Error');
    });
  });

  describe('refresh', () => {
    it('should throw when not configured', async () => {
      await expect(integration.refresh()).rejects.toThrow(IntegrationError);
    });

    it('should update lastActivityAt', async () => {
      await integration.connect({});
      const beforeRefresh = await integration.getState();

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await integration.refresh();
      const afterRefresh = await integration.getState();

      expect(afterRefresh!.lastActivityAt).toBeGreaterThanOrEqual(
        beforeRefresh!.lastActivityAt!
      );
    });
  });

  describe('handleWebhook', () => {
    it('should process valid webhook payload', async () => {
      await integration.connect({});

      const payload: WebhookPayload = {
        body: JSON.stringify({ type: 'test.event' }),
        headers: { 'content-type': 'application/json' },
      };

      const result = await integration.handleWebhook(payload);

      expect(result.success).toBe(true);
      expect(result.eventType).toBe('test.event');
    });

    it('should handle invalid webhook payload', async () => {
      await integration.connect({});

      const payload: WebhookPayload = {
        body: 'invalid json',
        headers: {},
      };

      const result = await integration.handleWebhook(payload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid payload');
    });
  });

  describe('updateState', () => {
    it('should update state fields', async () => {
      await integration.connect({});
      integration.testUpdateState({ testField: 'updated-value' });

      const state = await integration.getState();
      expect(state!.testField).toBe('updated-value');
    });

    it('should not throw when state is null', () => {
      expect(() => {
        integration.testUpdateState({ testField: 'value' });
      }).not.toThrow();
    });
  });

  describe('setStatus', () => {
    it('should set status and error', async () => {
      await integration.connect({});
      integration.testSetStatus('Error', 'Test error message');

      const state = await integration.getState();
      expect(state!.status).toBe('Error');
      expect(state!.error).toBe('Test error message');
    });

    it('should update lastActivityAt', async () => {
      await integration.connect({});
      const before = await integration.getState();

      await new Promise((resolve) => setTimeout(resolve, 10));
      integration.testSetStatus('Suspended');

      const after = await integration.getState();
      expect(after!.lastActivityAt).toBeGreaterThanOrEqual(before!.lastActivityAt!);
    });
  });

  describe('credential management', () => {
    it('should store and retrieve credentials', async () => {
      await integration.testStoreCredential('test-key', 'test-value');
      const value = await integration.testGetCredential('test-key');

      expect(value).toBe('test-value');
    });

    it('should use namespaced keys', async () => {
      await integration.testStoreCredential('key', 'value');

      expect(credentials.set).toHaveBeenCalledWith(
        'test-do-id:stripe:key',
        'value',
        undefined
      );
    });

    it('should return null for non-existent credentials', async () => {
      const value = await integration.testGetCredential('non-existent');
      expect(value).toBeNull();
    });
  });
});

describe('IntegrationError', () => {
  it('should create error with all properties', () => {
    const cause = new Error('Original error');
    const error = new IntegrationError(
      'stripe',
      'TEST_CODE',
      'Test message',
      cause
    );

    expect(error.name).toBe('IntegrationError');
    expect(error.message).toBe('Test message');
    expect(error.integrationType).toBe('stripe');
    expect(error.code).toBe('TEST_CODE');
    expect(error.cause).toBe(cause);
  });
});

describe('withRetry', () => {
  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Always fails'));

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 })
    ).rejects.toThrow('Always fails');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect maxDelayMs', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail'))
      .mockResolvedValue('success');

    const start = Date.now();
    await withRetry(fn, {
      maxAttempts: 2,
      baseDelayMs: 100,
      maxDelayMs: 50,
    });
    const elapsed = Date.now() - start;

    // Should not wait longer than maxDelayMs
    expect(elapsed).toBeLessThan(100);
  });
});
