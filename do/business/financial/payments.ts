/**
 * Payment Processing
 *
 * Handles payment lifecycle including:
 * - Payment intent creation
 * - Authorization and capture
 * - Refunds (full and partial)
 * - Platform fees and transfers
 *
 * @module financial/payments
 */

import type {
  Payment,
  PaymentStatus,
  PaymentOptions,
  ListPaymentsOptions,
  Transfer,
  Payout,
  ApplicationFee,
  PlatformFeeConfig,
} from '../../../types/financial'
import type { DigitalObjectRef } from '../../../types/identity'

/**
 * Configuration for payment processing
 */
export interface PaymentProcessorConfig {
  /** Stripe secret API key */
  secretKey: string
  /** Default currency (ISO 4217) */
  defaultCurrency?: string
  /** Platform fee configuration */
  platformFee?: PlatformFeeConfig
  /** Statement descriptor prefix */
  statementDescriptorPrefix?: string
}

/**
 * Options for creating a payment intent
 */
export interface CreatePaymentOptions extends PaymentOptions {
  /** Capture method (automatic or manual) */
  captureMethod?: 'automatic' | 'manual'
  /** Confirmation method */
  confirmationMethod?: 'automatic' | 'manual'
  /** Setup future usage */
  setupFutureUsage?: 'on_session' | 'off_session'
  /** Statement descriptor */
  statementDescriptor?: string
  /** Receipt email */
  receiptEmail?: string
}

/**
 * Options for refunding a payment
 */
export interface RefundOptions {
  /** Refund amount (partial refund if less than payment amount) */
  amount?: number
  /** Reason for refund */
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
  /** Refund metadata */
  metadata?: Record<string, string>
  /** Reverse the transfer to connected account */
  reverseTransfer?: boolean
  /** Refund the application fee */
  refundApplicationFee?: boolean
}

/**
 * Options for creating a transfer
 */
export interface CreateTransferOptions {
  /** Description */
  description?: string
  /** Transfer group for linking transfers */
  transferGroup?: string
  /** Source transaction (charge ID) */
  sourceTransaction?: string
  /** Metadata */
  metadata?: Record<string, string>
}

/**
 * Options for creating a payout
 */
export interface CreatePayoutOptions {
  /** Payout method */
  method?: 'standard' | 'instant'
  /** Description */
  description?: string
  /** Statement descriptor */
  statementDescriptor?: string
  /** Metadata */
  metadata?: Record<string, string>
}

/**
 * Payment processor for Digital Objects
 *
 * Manages the full payment lifecycle including creation, capture,
 * refunds, and integration with Stripe Connect for multi-party payments.
 *
 * @example
 * ```typescript
 * const processor = new PaymentProcessor({
 *   secretKey: env.STRIPE_SECRET_KEY,
 *   platformFee: { type: 'percentage', percentage: 10 }
 * })
 *
 * // Create a payment
 * const payment = await processor.createPayment(1000, 'usd', {
 *   customerRef: 'https://example.com/customers/123',
 *   transferDestination: 'acct_xxx'
 * })
 *
 * // Capture after authorization
 * await processor.capturePayment(payment.id)
 * ```
 */
export class PaymentProcessor {
  private readonly config: PaymentProcessorConfig

  /**
   * Create a new PaymentProcessor instance
   *
   * @param config - Payment processor configuration
   */
  constructor(config: PaymentProcessorConfig) {
    this.config = config
  }

  /**
   * Create a new payment intent
   *
   * Creates a Stripe PaymentIntent with optional platform fee and
   * transfer to a connected account.
   *
   * @param amount - Amount in smallest currency unit (e.g., cents)
   * @param currency - ISO 4217 currency code
   * @param options - Additional payment options
   * @returns The created payment
   *
   * @example
   * ```typescript
   * // Simple payment
   * const payment = await processor.createPayment(1000, 'usd')
   *
   * // Payment with platform fee and transfer
   * const payment = await processor.createPayment(1000, 'usd', {
   *   applicationFeeAmount: 100,
   *   transferDestination: 'acct_xxx'
   * })
   * ```
   */
  async createPayment(
    amount: number,
    currency: string,
    options?: CreatePaymentOptions
  ): Promise<Payment> {
    // TODO: Implement Stripe PaymentIntent creation
    throw new Error('Not implemented')
  }

  /**
   * Retrieve a payment by ID
   *
   * @param paymentId - The payment ID
   * @returns The payment or null if not found
   */
  async getPayment(paymentId: string): Promise<Payment | null> {
    // TODO: Implement Stripe API call
    throw new Error('Not implemented')
  }

  /**
   * Update a payment intent
   *
   * Can only update payments that haven't been confirmed.
   *
   * @param paymentId - The payment ID
   * @param updates - Fields to update
   * @returns The updated payment
   */
  async updatePayment(
    paymentId: string,
    updates: Partial<CreatePaymentOptions>
  ): Promise<Payment> {
    // TODO: Implement Stripe API call
    throw new Error('Not implemented')
  }

  /**
   * Confirm a payment intent
   *
   * @param paymentId - The payment ID
   * @param paymentMethodId - Payment method to use
   * @returns The confirmed payment
   */
  async confirmPayment(
    paymentId: string,
    paymentMethodId?: string
  ): Promise<Payment> {
    // TODO: Implement Stripe API call
    throw new Error('Not implemented')
  }

  /**
   * Capture a payment that was authorized
   *
   * For payments created with capture_method: 'manual', this
   * captures the funds after authorization.
   *
   * @param paymentId - The payment ID
   * @param amount - Amount to capture (partial capture if less than authorized)
   * @returns The captured payment
   *
   * @example
   * ```typescript
   * // Full capture
   * await processor.capturePayment(paymentId)
   *
   * // Partial capture
   * await processor.capturePayment(paymentId, 500)
   * ```
   */
  async capturePayment(paymentId: string, amount?: number): Promise<Payment> {
    // TODO: Implement Stripe API call
    throw new Error('Not implemented')
  }

  /**
   * Cancel a payment intent
   *
   * @param paymentId - The payment ID
   * @param cancellationReason - Reason for cancellation
   * @returns The canceled payment
   */
  async cancelPayment(
    paymentId: string,
    cancellationReason?: string
  ): Promise<Payment> {
    // TODO: Implement Stripe API call
    throw new Error('Not implemented')
  }

  /**
   * Refund a payment
   *
   * Supports full and partial refunds, with optional application
   * fee refund and transfer reversal for Connect payments.
   *
   * @param paymentId - The payment ID
   * @param options - Refund options
   * @returns The updated payment with refund amount
   *
   * @example
   * ```typescript
   * // Full refund
   * await processor.refundPayment(paymentId)
   *
   * // Partial refund with reason
   * await processor.refundPayment(paymentId, {
   *   amount: 500,
   *   reason: 'requested_by_customer'
   * })
   * ```
   */
  async refundPayment(paymentId: string, options?: RefundOptions): Promise<Payment> {
    // TODO: Implement Stripe API call
    throw new Error('Not implemented')
  }

  /**
   * List payments with filtering
   *
   * @param options - Filter and pagination options
   * @returns List of payments
   *
   * @example
   * ```typescript
   * // Get recent successful payments
   * const payments = await processor.listPayments({
   *   status: 'succeeded',
   *   limit: 10
   * })
   *
   * // Get payments for a customer
   * const payments = await processor.listPayments({
   *   customerRef: 'https://example.com/customers/123'
   * })
   * ```
   */
  async listPayments(options?: ListPaymentsOptions): Promise<Payment[]> {
    // TODO: Implement Stripe API call
    throw new Error('Not implemented')
  }

  /**
   * Create a transfer to a connected account
   *
   * Transfers funds from the platform balance to a connected account.
   *
   * @param destinationAccountId - Stripe account ID of destination
   * @param amount - Amount in smallest currency unit
   * @param currency - ISO 4217 currency code
   * @param options - Additional transfer options
   * @returns The created transfer
   *
   * @example
   * ```typescript
   * const transfer = await processor.createTransfer(
   *   'acct_xxx',
   *   900,
   *   'usd',
   *   { sourceTransaction: 'ch_xxx' }
   * )
   * ```
   */
  async createTransfer(
    destinationAccountId: string,
    amount: number,
    currency: string,
    options?: CreateTransferOptions
  ): Promise<Transfer> {
    // TODO: Implement Stripe API call
    throw new Error('Not implemented')
  }

  /**
   * Retrieve a transfer
   *
   * @param transferId - The transfer ID
   * @returns The transfer or null if not found
   */
  async getTransfer(transferId: string): Promise<Transfer | null> {
    // TODO: Implement Stripe API call
    throw new Error('Not implemented')
  }

  /**
   * Reverse a transfer
   *
   * @param transferId - The transfer ID
   * @param amount - Amount to reverse (partial if less than transfer amount)
   * @returns The updated transfer
   */
  async reverseTransfer(transferId: string, amount?: number): Promise<Transfer> {
    // TODO: Implement Stripe API call
    throw new Error('Not implemented')
  }

  /**
   * List transfers
   *
   * @param options - Filter and pagination options
   * @returns List of transfers
   */
  async listTransfers(options?: {
    destinationAccountId?: string
    transferGroup?: string
    limit?: number
    startingAfter?: string
  }): Promise<Transfer[]> {
    // TODO: Implement Stripe API call
    throw new Error('Not implemented')
  }

  /**
   * Create a payout to a bank account
   *
   * Initiates a payout from a Stripe balance to an external bank account.
   *
   * @param stripeAccountId - Stripe account ID (for connected accounts)
   * @param bankAccountId - Destination bank account ID
   * @param amount - Amount in smallest currency unit
   * @param currency - ISO 4217 currency code
   * @param options - Additional payout options
   * @returns The created payout
   *
   * @example
   * ```typescript
   * // Standard payout (2-3 days)
   * const payout = await processor.createPayout(
   *   'acct_xxx',
   *   'ba_xxx',
   *   10000,
   *   'usd'
   * )
   *
   * // Instant payout
   * const payout = await processor.createPayout(
   *   'acct_xxx',
   *   'ba_xxx',
   *   10000,
   *   'usd',
   *   { method: 'instant' }
   * )
   * ```
   */
  async createPayout(
    stripeAccountId: string,
    bankAccountId: string,
    amount: number,
    currency: string,
    options?: CreatePayoutOptions
  ): Promise<Payout> {
    // TODO: Implement Stripe API call
    throw new Error('Not implemented')
  }

  /**
   * Retrieve a payout
   *
   * @param payoutId - The payout ID
   * @param stripeAccountId - Stripe account ID (for connected accounts)
   * @returns The payout or null if not found
   */
  async getPayout(payoutId: string, stripeAccountId?: string): Promise<Payout | null> {
    // TODO: Implement Stripe API call
    throw new Error('Not implemented')
  }

  /**
   * Cancel a pending payout
   *
   * @param payoutId - The payout ID
   * @param stripeAccountId - Stripe account ID (for connected accounts)
   * @returns The canceled payout
   */
  async cancelPayout(payoutId: string, stripeAccountId?: string): Promise<Payout> {
    // TODO: Implement Stripe API call
    throw new Error('Not implemented')
  }

  /**
   * List payouts
   *
   * @param stripeAccountId - Stripe account ID (for connected accounts)
   * @param options - Filter and pagination options
   * @returns List of payouts
   */
  async listPayouts(
    stripeAccountId?: string,
    options?: {
      status?: Payout['status']
      limit?: number
      startingAfter?: string
    }
  ): Promise<Payout[]> {
    // TODO: Implement Stripe API call
    throw new Error('Not implemented')
  }

  /**
   * Get application fees collected
   *
   * @param options - Filter options
   * @returns List of application fees
   */
  async listApplicationFees(options?: {
    connectedAccountId?: string
    chargeId?: string
    limit?: number
    startingAfter?: string
  }): Promise<ApplicationFee[]> {
    // TODO: Implement Stripe API call
    throw new Error('Not implemented')
  }

  /**
   * Calculate platform fee for an amount
   *
   * @param amount - Base amount
   * @returns The calculated fee amount
   */
  calculatePlatformFee(amount: number): number {
    const fee = this.config.platformFee
    if (!fee) return 0

    let feeAmount = 0

    if (fee.type === 'Percentage' && fee.percentage) {
      feeAmount = Math.round(amount * (fee.percentage / 100))
    } else if (fee.type === 'Fixed' && fee.fixedAmount) {
      feeAmount = fee.fixedAmount
    } else if (fee.type === 'PercentagePlusFixed') {
      const percentageFee = fee.percentage
        ? Math.round(amount * (fee.percentage / 100))
        : 0
      feeAmount = percentageFee + (fee.fixedAmount || 0)
    }

    // Apply min/max constraints
    if (fee.minimumFee && feeAmount < fee.minimumFee) {
      feeAmount = fee.minimumFee
    }
    if (fee.maximumFee && feeAmount > fee.maximumFee) {
      feeAmount = fee.maximumFee
    }

    return feeAmount
  }

  /**
   * Handle a Stripe webhook event for payments
   *
   * @param payload - Raw webhook payload
   * @param signature - Stripe-Signature header value
   * @returns Processed event data
   */
  async handleWebhook(
    payload: string | ArrayBuffer,
    signature: string
  ): Promise<{ type: string; data: unknown }> {
    // TODO: Implement webhook verification and handling
    throw new Error('Not implemented')
  }
}

/**
 * Payment error codes
 */
export const PaymentErrorCodes = {
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  CAPTURE_FAILED: 'CAPTURE_FAILED',
  REFUND_FAILED: 'REFUND_FAILED',
  TRANSFER_FAILED: 'TRANSFER_FAILED',
  PAYOUT_FAILED: 'PAYOUT_FAILED',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
} as const

export type PaymentErrorCode = typeof PaymentErrorCodes[keyof typeof PaymentErrorCodes]

/**
 * Payment processing error
 */
export class PaymentError extends Error {
  constructor(
    public readonly code: PaymentErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'PaymentError'
  }
}
