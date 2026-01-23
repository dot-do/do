/**
 * Stripe Integration Tests
 *
 * Tests for the Stripe Connect integration.
 *
 * @module integrations/__tests__/stripe.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StripeDeepIntegration } from '../types/integrations';
import {
  StripeIntegration,
  StripeConnectConfig,
  CreatePaymentIntentConfig,
  CreateSubscriptionConfig,
  PaymentIntent,
  Subscription,
} from './stripe';
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
 * Create mock Stripe client
 */
function createMockStripeClient() {
  return {
    accounts: {
      create: vi.fn().mockResolvedValue({
        id: 'acct_test123',
        type: 'express',
        charges_enabled: false,
        payouts_enabled: false,
      }),
      retrieve: vi.fn().mockResolvedValue({
        id: 'acct_test123',
        type: 'express',
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      }),
    },
    accountLinks: {
      create: vi.fn().mockResolvedValue({
        url: 'https://connect.stripe.com/setup/test',
        expires_at: Date.now() + 3600000,
      }),
    },
    paymentIntents: {
      create: vi.fn().mockResolvedValue({
        id: 'pi_test123',
        amount: 1000,
        currency: 'usd',
        status: 'requires_payment_method',
        client_secret: 'pi_test123_secret',
        metadata: {},
      }),
      retrieve: vi.fn().mockResolvedValue({
        id: 'pi_test123',
        amount: 1000,
        currency: 'usd',
        status: 'succeeded',
        client_secret: 'pi_test123_secret',
        metadata: {},
      }),
    },
    subscriptions: {
      create: vi.fn().mockResolvedValue({
        id: 'sub_test123',
        customer: 'cus_test123',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
        cancel_at_period_end: false,
        metadata: {},
      }),
      update: vi.fn().mockResolvedValue({
        id: 'sub_test123',
        customer: 'cus_test123',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
        cancel_at_period_end: true,
        metadata: {},
      }),
      cancel: vi.fn().mockResolvedValue({
        id: 'sub_test123',
        customer: 'cus_test123',
        status: 'canceled',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
        cancel_at_period_end: false,
        metadata: {},
      }),
    },
    payouts: {
      create: vi.fn().mockResolvedValue({
        id: 'po_test123',
        amount: 5000,
        currency: 'usd',
        status: 'pending',
        arrival_date: Math.floor(Date.now() / 1000) + 2 * 24 * 3600,
        metadata: {},
      }),
    },
    balance: {
      retrieve: vi.fn().mockResolvedValue({
        available: [{ amount: 10000, currency: 'usd' }],
        pending: [{ amount: 5000, currency: 'usd' }],
      }),
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('StripeIntegration', () => {
  let config: BaseIntegrationConfig;
  let credentials: CredentialStore;
  let events: IntegrationEventEmitter;
  let stripeClient: ReturnType<typeof createMockStripeClient>;
  let integration: StripeIntegration;

  beforeEach(() => {
    config = {
      doId: 'test-do-id',
      workspaceId: 'test-workspace-id',
      debug: false,
    };
    credentials = createMockCredentialStore();
    events = createMockEventEmitter();
    stripeClient = createMockStripeClient();
    integration = new StripeIntegration(config, credentials, events, stripeClient as any);
  });

  describe('connect', () => {
    it('should create Stripe Connect account', async () => {
      const connectConfig: StripeConnectConfig = {
        accountType: 'express',
        refreshUrl: 'https://example.com/refresh',
        returnUrl: 'https://example.com/return',
      };

      const state = await integration.connect(connectConfig);

      expect(state.type).toBe('stripe');
      expect(state.status).toBe('pending_auth');
      expect(state.accountId).toBe('acct_test123');
      expect(state.accountType).toBe('express');
      expect(state.onboardingUrl).toBe('https://connect.stripe.com/setup/test');
    });

    it('should store account ID in credentials', async () => {
      await integration.connect({
        accountType: 'express',
        refreshUrl: 'https://example.com/refresh',
        returnUrl: 'https://example.com/return',
      });

      expect(credentials.set).toHaveBeenCalledWith(
        'test-do-id:stripe:account_id',
        'acct_test123',
        undefined
      );
    });

    it('should emit connected event', async () => {
      await integration.connect({
        accountType: 'express',
        refreshUrl: 'https://example.com/refresh',
        returnUrl: 'https://example.com/return',
      });

      expect(events.emit).toHaveBeenCalledWith({
        type: 'integration:connected',
        payload: { integrationType: 'stripe' },
      });
    });

    it('should handle connection errors', async () => {
      stripeClient.accounts.create.mockRejectedValue(new Error('API Error'));

      await expect(
        integration.connect({
          accountType: 'express',
          refreshUrl: 'https://example.com/refresh',
          returnUrl: 'https://example.com/return',
        })
      ).rejects.toThrow(IntegrationError);

      expect(events.emit).toHaveBeenCalledWith({
        type: 'integration:error',
        payload: { integrationType: 'stripe', error: 'API Error' },
      });
    });
  });

  describe('disconnect', () => {
    beforeEach(async () => {
      await integration.connect({
        accountType: 'express',
        refreshUrl: 'https://example.com/refresh',
        returnUrl: 'https://example.com/return',
      });
    });

    it('should disconnect and clear state', async () => {
      const result = await integration.disconnect();

      expect(result).toBe(true);
      expect(await integration.getState()).toBeNull();
    });

    it('should delete stored credentials', async () => {
      await integration.disconnect();

      expect(credentials.delete).toHaveBeenCalledWith('test-do-id:stripe:account_id');
      expect(credentials.delete).toHaveBeenCalledWith('test-do-id:stripe:webhook_secret');
    });
  });

  describe('healthCheck', () => {
    it('should return not_configured when not connected', async () => {
      const result = await integration.healthCheck();

      expect(result.healthy).toBe(false);
      expect(result.status).toBe('not_configured');
    });

    it('should check account status', async () => {
      await integration.connect({
        accountType: 'express',
        refreshUrl: 'https://example.com/refresh',
        returnUrl: 'https://example.com/return',
      });

      const result = await integration.healthCheck({ detailed: true });

      expect(result.healthy).toBe(true);
      expect(result.status).toBe('active');
      expect(result.details).toEqual({
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      });
    });
  });

  describe('handleWebhook', () => {
    beforeEach(async () => {
      await integration.connect({
        accountType: 'express',
        refreshUrl: 'https://example.com/refresh',
        returnUrl: 'https://example.com/return',
      });
      // Simulate webhook secret being stored
      await credentials.set('test-do-id:stripe:webhook_secret', 'whsec_test', undefined);
    });

    it('should handle account.updated webhook', async () => {
      const payload = {
        body: JSON.stringify({
          type: 'account.updated',
          data: {
            object: {
              id: 'acct_test123',
              charges_enabled: true,
              payouts_enabled: true,
            },
          },
        }),
        headers: {
          'stripe-signature': 'test-signature',
        },
      };

      const result = await integration.handleWebhook(payload);

      expect(result.success).toBe(true);
      expect(result.eventType).toBe('account.updated');
    });

    it('should reject webhooks without signature', async () => {
      const payload = {
        body: JSON.stringify({ type: 'test' }),
        headers: {},
      };

      const result = await integration.handleWebhook(payload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing Stripe signature');
    });
  });

  describe('createPaymentIntent', () => {
    beforeEach(async () => {
      await integration.connect({
        accountType: 'express',
        refreshUrl: 'https://example.com/refresh',
        returnUrl: 'https://example.com/return',
        platformFeePercent: 10,
      });
      // Set to active status
      const state = await integration.getState();
      (state as any).status = 'active';
    });

    it('should create payment intent', async () => {
      const paymentConfig: CreatePaymentIntentConfig = {
        amount: 1000,
        currency: 'usd',
        description: 'Test payment',
      };

      const result = await integration.createPaymentIntent(paymentConfig);

      expect(result.id).toBe('pi_test123');
      expect(result.amount).toBe(1000);
      expect(result.currency).toBe('usd');
      expect(result.clientSecret).toBe('pi_test123_secret');
    });

    it('should calculate platform fee', async () => {
      await integration.createPaymentIntent({
        amount: 1000,
        currency: 'usd',
      });

      expect(stripeClient.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1000,
          application_fee_amount: 100, // 10% of 1000
        })
      );
    });

    it('should throw when not connected', async () => {
      const newIntegration = new StripeIntegration(
        config,
        credentials,
        events,
        stripeClient as any
      );

      await expect(
        newIntegration.createPaymentIntent({ amount: 1000, currency: 'usd' })
      ).rejects.toThrow(IntegrationError);
    });
  });

  describe('createSubscription', () => {
    beforeEach(async () => {
      await integration.connect({
        accountType: 'express',
        refreshUrl: 'https://example.com/refresh',
        returnUrl: 'https://example.com/return',
      });
      const state = await integration.getState();
      (state as any).status = 'active';
    });

    it('should create subscription', async () => {
      const subscriptionConfig: CreateSubscriptionConfig = {
        customerId: 'cus_test123',
        priceId: 'price_test123',
      };

      const result = await integration.createSubscription(subscriptionConfig);

      expect(result.id).toBe('sub_test123');
      expect(result.customerId).toBe('cus_test123');
      expect(result.status).toBe('active');
    });
  });

  describe('cancelSubscription', () => {
    beforeEach(async () => {
      await integration.connect({
        accountType: 'express',
        refreshUrl: 'https://example.com/refresh',
        returnUrl: 'https://example.com/return',
      });
      const state = await integration.getState();
      (state as any).status = 'active';
    });

    it('should cancel at period end by default', async () => {
      const result = await integration.cancelSubscription('sub_test123');

      expect(result.cancelAtPeriodEnd).toBe(true);
      expect(stripeClient.subscriptions.update).toHaveBeenCalledWith(
        'sub_test123',
        { cancel_at_period_end: true }
      );
    });

    it('should cancel immediately when specified', async () => {
      await integration.cancelSubscription('sub_test123', true);

      expect(stripeClient.subscriptions.cancel).toHaveBeenCalledWith('sub_test123');
    });
  });

  describe('getBalance', () => {
    beforeEach(async () => {
      await integration.connect({
        accountType: 'express',
        refreshUrl: 'https://example.com/refresh',
        returnUrl: 'https://example.com/return',
      });
      const state = await integration.getState();
      (state as any).status = 'active';
    });

    it('should retrieve balance', async () => {
      const balances = await integration.getBalance();

      expect(balances).toHaveLength(1);
      expect(balances[0]).toEqual({
        available: 10000,
        pending: 5000,
        currency: 'usd',
      });
    });
  });
});
