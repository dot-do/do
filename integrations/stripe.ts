/**
 * Stripe Connect Integration
 *
 * Provides deep integration with Stripe Connect for:
 * - Payment processing
 * - Subscription management
 * - Platform fee collection
 * - Payouts and transfers
 * - Financial reporting
 *
 * @module integrations/stripe
 */

import type { StripeDeepIntegration } from '../types/integrations';
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
  verifyWebhookSignature,
} from './base';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for connecting a Stripe account
 */
export interface StripeConnectConfig {
  /** Account type to create */
  accountType: 'standard' | 'express' | 'custom';
  /** Business profile */
  businessProfile?: {
    /** Business name */
    name?: string;
    /** Business URL */
    url?: string;
    /** Support email */
    supportEmail?: string;
    /** Support phone */
    supportPhone?: string;
  };
  /** Country code (ISO 3166-1 alpha-2) */
  country?: string;
  /** Email for the account */
  email?: string;
  /** Capabilities to request */
  capabilities?: {
    cardPayments?: boolean;
    transfers?: boolean;
    bankTransfers?: boolean;
  };
  /** Platform fee percentage (0-100) */
  platformFeePercent?: number;
  /** Refresh URL for onboarding */
  refreshUrl: string;
  /** Return URL after onboarding */
  returnUrl: string;
}

/**
 * Configuration for creating a payment intent
 */
export interface CreatePaymentIntentConfig {
  /** Amount in smallest currency unit (e.g., cents) */
  amount: number;
  /** Currency code (ISO 4217) */
  currency: string;
  /** Description for the payment */
  description?: string;
  /** Metadata to attach */
  metadata?: Record<string, string>;
  /** Customer ID if known */
  customerId?: string;
  /** Override platform fee for this payment */
  platformFeePercent?: number;
  /** Transfer data for connected account */
  transferData?: {
    destination: string;
    amount?: number;
  };
}

/**
 * Configuration for creating a subscription
 */
export interface CreateSubscriptionConfig {
  /** Customer ID */
  customerId: string;
  /** Price ID */
  priceId: string;
  /** Quantity */
  quantity?: number;
  /** Trial period in days */
  trialDays?: number;
  /** Metadata */
  metadata?: Record<string, string>;
  /** Application fee percentage */
  applicationFeePercent?: number;
}

/**
 * Configuration for creating a payout
 */
export interface CreatePayoutConfig {
  /** Amount in smallest currency unit */
  amount: number;
  /** Currency code */
  currency: string;
  /** Description */
  description?: string;
  /** Destination (bank account or card) */
  destination?: string;
  /** Metadata */
  metadata?: Record<string, string>;
}

// =============================================================================
// Response Types
// =============================================================================

/**
 * Payment intent result
 */
export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' |
          'processing' | 'requires_capture' | 'canceled' | 'succeeded';
  clientSecret: string;
  metadata?: Record<string, string>;
}

/**
 * Subscription result
 */
export interface Subscription {
  id: string;
  customerId: string;
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' |
          'past_due' | 'canceled' | 'unpaid' | 'paused';
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  metadata?: Record<string, string>;
}

/**
 * Payout result
 */
export interface Payout {
  id: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'in_transit' | 'canceled' | 'failed';
  arrivalDate: number;
  metadata?: Record<string, string>;
}

/**
 * Account onboarding result
 */
export interface OnboardingResult {
  accountId: string;
  onboardingUrl: string;
  expiresAt: number;
}

// =============================================================================
// Stripe Integration Class
// =============================================================================

/**
 * Stripe Connect Integration
 *
 * Manages Stripe Connect accounts for payment processing, subscriptions,
 * and payouts. Supports Standard, Express, and Custom account types.
 *
 * @example
 * ```typescript
 * const stripe = new StripeIntegration(config, credentials, events);
 *
 * // Connect a new Stripe account
 * const result = await stripe.connect({
 *   accountType: 'express',
 *   refreshUrl: 'https://example.com/stripe/refresh',
 *   returnUrl: 'https://example.com/stripe/return',
 * });
 *
 * // Create a payment intent
 * const payment = await stripe.createPaymentIntent({
 *   amount: 1000,
 *   currency: 'usd',
 * });
 * ```
 */
class StripeIntegration extends BaseIntegration<StripeDeepIntegration> {
  readonly type = 'stripe' as const;

  /** Stripe API client (injected) */
  private stripeClient: StripeClient | null = null;

  /**
   * Create a new Stripe integration instance
   */
  constructor(
    config: BaseIntegrationConfig,
    credentials: CredentialStore,
    events: IntegrationEventEmitter,
    stripeClient?: StripeClient
  ) {
    super(config, credentials, events);
    this.stripeClient = stripeClient ?? null;
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Connect a Stripe account
   *
   * Creates a new Stripe Connect account and returns an onboarding URL.
   * The account will be in 'pending_auth' status until onboarding completes.
   *
   * @param config - Stripe Connect configuration
   * @returns The integration state with onboarding URL
   */
  async connect(config: StripeConnectConfig): Promise<StripeDeepIntegration> {
    this.debug('Connecting Stripe account', { accountType: config.accountType });

    const client = this.getClient();

    try {
      // Create the Connect account
      const account = await client.accounts.create({
        type: config.accountType,
        country: config.country,
        email: config.email,
        business_profile: config.businessProfile,
        capabilities: this.mapCapabilities(config.capabilities as StripeCapabilities | undefined),
      });

      // Create account link for onboarding
      const accountLink = await client.accountLinks.create({
        account: account.id,
        refresh_url: config.refreshUrl,
        return_url: config.returnUrl,
        type: 'account_onboarding',
      });

      // Store the API key for this account
      await this.storeCredential('account_id', account.id);

      // Initialize state
      this.state = {
        type: 'stripe',
        status: 'PendingAuth',
        accountId: account.id,
        accountType: config.accountType,
        chargesEnabled: false,
        payoutsEnabled: false,
        onboardingUrl: accountLink.url,
        platformFeePercent: config.platformFeePercent ?? 0,
        connectedAt: Date.now(),
        lastActivityAt: Date.now(),
      };

      this.emitEvent({
        type: 'integration:connected',
        payload: { integrationType: 'stripe' },
      });

      return this.state;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect Stripe';
      this.emitError(message);
      throw new IntegrationError('stripe', 'CONNECT_FAILED', message, error as Error);
    }
  }

  /**
   * Disconnect the Stripe account
   *
   * Note: This does not delete the Stripe account, only removes
   * the connection from the DO platform.
   */
  async disconnect(): Promise<boolean> {
    if (!this.state?.accountId) {
      return false;
    }

    this.debug('Disconnecting Stripe account', { accountId: this.state.accountId });

    // Clean up stored credentials
    await this.deleteCredential('account_id');
    await this.deleteCredential('webhook_secret');

    return super.disconnect();
  }

  /**
   * Check Stripe integration health
   */
  async healthCheck(options?: HealthCheckOptions): Promise<HealthCheckResult> {
    const startTime = Date.now();

    if (!this.state?.accountId) {
      return {
        healthy: false,
        status: 'NotConfigured',
        checkedAt: startTime,
        error: 'Stripe account not connected',
      };
    }

    try {
      const client = this.getClient();

      // Retrieve account to check status
      const account = await client.accounts.retrieve(this.state.accountId);

      const healthy = account.charges_enabled && account.payouts_enabled;

      // Update state with current account status
      this.updateState({
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        status: healthy ? 'Active' : 'PendingAuth',
      });

      return {
        healthy,
        status: this.state.status,
        latencyMs: Date.now() - startTime,
        checkedAt: startTime,
        details: options?.detailed ? {
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
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
   * Refresh account onboarding link if needed
   */
  async refresh(): Promise<StripeDeepIntegration> {
    if (!this.state?.accountId) {
      throw new IntegrationError('stripe', 'NOT_CONFIGURED', 'Stripe not connected');
    }

    // If still pending, refresh the onboarding link
    if (this.state.status === 'PendingAuth') {
      const client = this.getClient();

      const accountLink = await client.accountLinks.create({
        account: this.state.accountId,
        refresh_url: '', // Would need to be stored or provided
        return_url: '',
        type: 'account_onboarding',
      });

      this.updateState({
        onboardingUrl: accountLink.url,
        lastActivityAt: Date.now(),
      });
    }

    return this.state;
  }

  // ===========================================================================
  // Webhook Handling
  // ===========================================================================

  /**
   * Handle Stripe webhook events
   *
   * Processes incoming webhook events from Stripe and updates
   * integration state accordingly.
   *
   * @param payload - The webhook payload
   * @returns Webhook processing result
   */
  async handleWebhook(payload: WebhookPayload): Promise<WebhookResult> {
    this.debug('Handling Stripe webhook');

    // Get webhook secret
    const webhookSecret = await this.getCredential('webhook_secret');

    if (!webhookSecret) {
      return {
        success: false,
        error: 'Webhook secret not configured',
      };
    }

    // Verify signature
    const signature = payload.headers['stripe-signature'];
    if (!signature) {
      return {
        success: false,
        error: 'Missing Stripe signature',
      };
    }

    try {
      // Parse and verify the event
      const event = await this.verifyAndParseEvent(payload.body, signature, webhookSecret);

      // Handle specific event types
      switch (event.type) {
        case 'account.updated':
          await this.handleAccountUpdated(event.data);
          break;

        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(event.data);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(event.data);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await this.handleSubscriptionEvent(event.type, event.data);
          break;

        case 'payout.paid':
        case 'payout.failed':
          await this.handlePayoutEvent(event.type, event.data);
          break;

        default:
          this.debug('Unhandled event type', { type: event.type });
      }

      return {
        success: true,
        eventType: event.type,
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
  // Payment Operations
  // ===========================================================================

  /**
   * Create a payment intent
   *
   * @param config - Payment intent configuration
   * @returns The created payment intent
   */
  async createPaymentIntent(config: CreatePaymentIntentConfig): Promise<PaymentIntent> {
    this.ensureConnected();

    const client = this.getClient();

    const platformFee = config.platformFeePercent ?? this.state!.platformFeePercent ?? 0;
    const applicationFeeAmount = platformFee > 0
      ? Math.round(config.amount * (platformFee / 100))
      : undefined;

    const paymentIntent = await client.paymentIntents.create({
      amount: config.amount,
      currency: config.currency,
      description: config.description,
      metadata: config.metadata,
      customer: config.customerId,
      application_fee_amount: applicationFeeAmount,
      transfer_data: config.transferData,
    });

    this.updateState({ lastActivityAt: Date.now() });

    return {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status as PaymentIntent['status'],
      clientSecret: paymentIntent.client_secret!,
      metadata: paymentIntent.metadata,
    };
  }

  /**
   * Retrieve a payment intent
   *
   * @param paymentIntentId - The payment intent ID
   * @returns The payment intent
   */
  async getPaymentIntent(paymentIntentId: string): Promise<PaymentIntent> {
    this.ensureConnected();

    const client = this.getClient();
    const paymentIntent = await client.paymentIntents.retrieve(paymentIntentId);

    return {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status as PaymentIntent['status'],
      clientSecret: paymentIntent.client_secret!,
      metadata: paymentIntent.metadata,
    };
  }

  // ===========================================================================
  // Subscription Operations
  // ===========================================================================

  /**
   * Create a subscription
   *
   * @param config - Subscription configuration
   * @returns The created subscription
   */
  async createSubscription(config: CreateSubscriptionConfig): Promise<Subscription> {
    this.ensureConnected();

    const client = this.getClient();

    const subscription = await client.subscriptions.create({
      customer: config.customerId,
      items: [{ price: config.priceId, quantity: config.quantity }],
      trial_period_days: config.trialDays,
      metadata: config.metadata,
      application_fee_percent: config.applicationFeePercent,
    });

    this.updateState({ lastActivityAt: Date.now() });

    return this.mapSubscription(subscription);
  }

  /**
   * Cancel a subscription
   *
   * @param subscriptionId - The subscription ID
   * @param cancelImmediately - Whether to cancel immediately or at period end
   * @returns The updated subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    cancelImmediately = false
  ): Promise<Subscription> {
    this.ensureConnected();

    const client = this.getClient();

    let subscription;
    if (cancelImmediately) {
      subscription = await client.subscriptions.cancel(subscriptionId);
    } else {
      subscription = await client.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }

    return this.mapSubscription(subscription);
  }

  // ===========================================================================
  // Payout Operations
  // ===========================================================================

  /**
   * Create a payout to the connected account
   *
   * @param config - Payout configuration
   * @returns The created payout
   */
  async createPayout(config: CreatePayoutConfig): Promise<Payout> {
    this.ensureConnected();

    const client = this.getClient();

    const payout = await client.payouts.create({
      amount: config.amount,
      currency: config.currency,
      description: config.description,
      destination: config.destination,
      metadata: config.metadata,
    }, {
      stripeAccount: this.state!.accountId,
    });

    this.updateState({ lastActivityAt: Date.now() });

    return {
      id: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      status: payout.status as Payout['status'],
      arrivalDate: payout.arrival_date,
      metadata: payout.metadata,
    };
  }

  /**
   * Get balance for the connected account
   *
   * @returns The account balance
   */
  async getBalance(): Promise<{ available: number; pending: number; currency: string }[]> {
    this.ensureConnected();

    const client = this.getClient();

    const balance = await client.balance.retrieve({
      stripeAccount: this.state!.accountId,
    });

    return balance.available.map((b: { amount: number; currency: string }, i: number) => ({
      available: b.amount,
      pending: balance.pending[i]?.amount ?? 0,
      currency: b.currency,
    }));
  }

  // ===========================================================================
  // Protected Methods
  // ===========================================================================

  protected async cleanupCredentials(): Promise<void> {
    await this.deleteCredential('account_id');
    await this.deleteCredential('webhook_secret');
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Get the Stripe client, throwing if not available
   */
  private getClient(): StripeClient {
    if (!this.stripeClient) {
      throw new IntegrationError(
        'stripe',
        'CLIENT_NOT_CONFIGURED',
        'Stripe client not configured'
      );
    }
    return this.stripeClient;
  }

  /**
   * Ensure the integration is connected
   */
  private ensureConnected(): void {
    if (!this.state?.accountId) {
      throw new IntegrationError('stripe', 'NOT_CONNECTED', 'Stripe account not connected');
    }

    if (this.state.status !== 'Active') {
      throw new IntegrationError(
        'stripe',
        'NOT_ACTIVE',
        `Stripe integration is ${this.state.status}`
      );
    }
  }

  /**
   * Map capabilities config to Stripe format
   */
  private mapCapabilities(capabilities?: StripeCapabilities) {
    if (!capabilities) {
      return {
        card_payments: { requested: true },
        transfers: { requested: true },
      };
    }

    return {
      card_payments: { requested: capabilities.cardPayments !== false },
      transfers: { requested: capabilities.transfers !== false },
      bank_transfer_payments: { requested: capabilities.bankTransfers === true },
    };
  }

  /**
   * Verify and parse a Stripe webhook event
   */
  private async verifyAndParseEvent(
    payload: string,
    signature: string,
    secret: string
  ): Promise<StripeWebhookEvent> {
    // In production, use Stripe's constructEvent method
    // This is a placeholder implementation
    const event = JSON.parse(payload) as StripeWebhookEvent
    return event
  }

  /**
   * Handle account.updated webhook
   */
  private async handleAccountUpdated(data: StripeWebhookEventData): Promise<void> {
    const account = data.object as unknown as StripeAccountObject

    this.updateState({
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      status: account.charges_enabled && account.payouts_enabled ? 'Active' : 'PendingAuth',
      lastActivityAt: Date.now(),
    })
  }

  /**
   * Handle payment_intent.succeeded webhook
   */
  private async handlePaymentSucceeded(data: StripeWebhookEventData): Promise<void> {
    this.debug('Payment succeeded', { paymentIntentId: data.object.id })
    // Emit event or trigger workflow
  }

  /**
   * Handle payment_intent.payment_failed webhook
   */
  private async handlePaymentFailed(data: StripeWebhookEventData): Promise<void> {
    this.debug('Payment failed', { paymentIntentId: data.object.id })
    // Emit event or trigger workflow
  }

  /**
   * Handle subscription webhooks
   */
  private async handleSubscriptionEvent(type: string, data: StripeWebhookEventData): Promise<void> {
    this.debug('Subscription event', { type, subscriptionId: data.object.id })
    // Emit event or trigger workflow
  }

  /**
   * Handle payout webhooks
   */
  private async handlePayoutEvent(type: string, data: StripeWebhookEventData): Promise<void> {
    this.debug('Payout event', { type, payoutId: data.object.id })
    // Emit event or trigger workflow
  }

  /**
   * Map Stripe subscription to our format
   */
  private mapSubscription(subscription: StripeSubscriptionResponse): Subscription {
    return {
      id: subscription.id,
      customerId: subscription.customer,
      status: subscription.status,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      metadata: subscription.metadata,
    }
  }
}

// =============================================================================
// Type Definitions for Stripe Client
// =============================================================================

/**
 * Stripe account creation parameters
 */
interface StripeAccountCreateParams {
  type: 'standard' | 'express' | 'custom'
  country?: string
  email?: string
  business_profile?: {
    name?: string
    url?: string
    supportEmail?: string
    supportPhone?: string
  }
  capabilities?: {
    card_payments?: { requested: boolean }
    transfers?: { requested: boolean }
    bank_transfer_payments?: { requested: boolean }
  }
}

/**
 * Stripe account response
 */
interface StripeAccountResponse {
  id: string
  type: 'standard' | 'express' | 'custom'
  charges_enabled: boolean
  payouts_enabled: boolean
  details_submitted: boolean
}

/**
 * Stripe account object (from webhook)
 */
interface StripeAccountObject {
  id: string
  charges_enabled: boolean
  payouts_enabled: boolean
  details_submitted?: boolean
}

/**
 * Stripe account link creation parameters
 */
interface StripeAccountLinkCreateParams {
  account: string
  refresh_url: string
  return_url: string
  type: 'account_onboarding' | 'account_update'
}

/**
 * Stripe account link response
 */
interface StripeAccountLinkResponse {
  url: string
  expires_at: number
}

/**
 * Stripe payment intent creation parameters
 */
interface StripePaymentIntentCreateParams {
  amount: number
  currency: string
  description?: string
  metadata?: Record<string, string>
  customer?: string
  application_fee_amount?: number
  transfer_data?: {
    destination: string
    amount?: number
  }
}

/**
 * Stripe payment intent response
 */
interface StripePaymentIntentResponse {
  id: string
  amount: number
  currency: string
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' |
          'processing' | 'requires_capture' | 'canceled' | 'succeeded'
  client_secret: string
  metadata?: Record<string, string>
}

/**
 * Stripe subscription creation parameters
 */
interface StripeSubscriptionCreateParams {
  customer: string
  items: Array<{ price: string; quantity?: number }>
  trial_period_days?: number
  metadata?: Record<string, string>
  application_fee_percent?: number
}

/**
 * Stripe subscription update parameters
 */
interface StripeSubscriptionUpdateParams {
  cancel_at_period_end?: boolean
  metadata?: Record<string, string>
}

/**
 * Stripe subscription response
 */
interface StripeSubscriptionResponse {
  id: string
  customer: string
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' |
          'past_due' | 'canceled' | 'unpaid' | 'paused'
  current_period_start: number
  current_period_end: number
  cancel_at_period_end: boolean
  metadata?: Record<string, string>
}

/**
 * Stripe payout creation parameters
 */
interface StripePayoutCreateParams {
  amount: number
  currency: string
  description?: string
  destination?: string
  metadata?: Record<string, string>
}

/**
 * Stripe payout options
 */
interface StripePayoutOptions {
  stripeAccount?: string
}

/**
 * Stripe payout response
 */
interface StripePayoutResponse {
  id: string
  amount: number
  currency: string
  status: 'paid' | 'pending' | 'in_transit' | 'canceled' | 'failed'
  arrival_date: number
  metadata?: Record<string, string>
}

/**
 * Stripe balance retrieve options
 */
interface StripeBalanceRetrieveOptions {
  stripeAccount?: string
}

/**
 * Stripe balance response
 */
interface StripeBalanceResponse {
  available: Array<{ amount: number; currency: string }>
  pending: Array<{ amount: number; currency: string }>
}

/**
 * Stripe webhook event data
 */
interface StripeWebhookEventData {
  object: {
    id: string
    [key: string]: unknown
  }
}

/**
 * Stripe webhook event
 */
interface StripeWebhookEvent {
  type: string
  data: StripeWebhookEventData
}

/**
 * Stripe client interface
 * Matches the official Stripe SDK structure
 */
interface StripeClient {
  accounts: {
    create(params: StripeAccountCreateParams): Promise<StripeAccountResponse>
    retrieve(id: string): Promise<StripeAccountResponse>
  }
  accountLinks: {
    create(params: StripeAccountLinkCreateParams): Promise<StripeAccountLinkResponse>
  }
  paymentIntents: {
    create(params: StripePaymentIntentCreateParams): Promise<StripePaymentIntentResponse>
    retrieve(id: string): Promise<StripePaymentIntentResponse>
  }
  subscriptions: {
    create(params: StripeSubscriptionCreateParams): Promise<StripeSubscriptionResponse>
    update(id: string, params: StripeSubscriptionUpdateParams): Promise<StripeSubscriptionResponse>
    cancel(id: string): Promise<StripeSubscriptionResponse>
  }
  payouts: {
    create(params: StripePayoutCreateParams, options?: StripePayoutOptions): Promise<StripePayoutResponse>
  }
  balance: {
    retrieve(options?: StripeBalanceRetrieveOptions): Promise<StripeBalanceResponse>
  }
}

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Stripe capabilities config
 */
interface StripeCapabilities {
  cardPayments?: boolean;
  transfers?: boolean;
  bankTransfers?: boolean;
}

// =============================================================================
// Exports
// =============================================================================

export { StripeIntegration };
