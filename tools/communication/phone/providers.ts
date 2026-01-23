/**
 * Phone Provider Abstraction
 *
 * Unified interface across multiple telephony providers with automatic failover.
 *
 * @module communication/phone/providers
 */

import type { ProviderConfig, ProviderHealth, PhoneProvider as BasePhoneProvider, SmsProvider, CallOptions, CallResult, CallData, SendSmsOptions, SendSmsResult, SmsData } from '../types'
import type { TelephonyProvider, TelephonyProviderConfig, PhoneNumber, PhoneNumberSearch, AvailablePhoneNumber, CallRecord, OutboundCallOptions, SMSRecord, OutboundSMSOptions, InboundCallEvent, InboundSMSEvent, CallInstructions } from '../../../types/telephony'

// =============================================================================
// Phone Provider Adapter Interface
// =============================================================================

/**
 * Interface that all telephony provider adapters must implement.
 * This enables a unified API across Twilio, Telnyx, Plivo, etc.
 */
export interface PhoneProviderAdapter {
  readonly provider: TelephonyProvider

  // Phone Numbers
  searchNumbers(criteria: PhoneNumberSearch): Promise<AvailablePhoneNumber[]>
  purchaseNumber(number: string): Promise<PhoneNumber>
  configureNumber(numberId: string, config: Partial<PhoneNumber>): Promise<PhoneNumber>
  releaseNumber(numberId: string): Promise<boolean>
  listNumbers(): Promise<PhoneNumber[]>

  // Voice Calls
  makeCall(options: OutboundCallOptions): Promise<CallRecord>
  getCall(callId: string): Promise<CallRecord | null>
  updateCall(callId: string, instructions: CallInstructions): Promise<CallRecord>
  endCall(callId: string): Promise<boolean>

  // SMS
  sendSMS(options: OutboundSMSOptions): Promise<SMSRecord>
  getSMS(messageId: string): Promise<SMSRecord | null>

  // Webhooks
  parseInboundCall(request: Request): Promise<InboundCallEvent>
  parseInboundSMS(request: Request): Promise<InboundSMSEvent>
  validateWebhook(request: Request): Promise<boolean>
}

// =============================================================================
// Failover Configuration
// =============================================================================

/** Conditions that trigger automatic failover */
export type FailoverCondition = 'timeout' | 'rate_limit' | 'service_unavailable' | 'authentication_error' | 'insufficient_funds'

/** Configuration for multi-provider setup with failover */
export interface PhoneClientConfig {
  primary: TelephonyProviderConfig
  fallback?: TelephonyProviderConfig[]
  failoverOn?: FailoverCondition[]
  timeout?: number
  maxRetries?: number
}

// =============================================================================
// Error Types
// =============================================================================

/** Base phone error class */
export class PhoneError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider: TelephonyProvider,
    public readonly retryable: boolean = false
  ) {
    super(message)
    this.name = 'PhoneError'
  }
}

/** Error when provider is unavailable */
export class ProviderUnavailableError extends PhoneError {
  constructor(provider: TelephonyProvider, message?: string) {
    super(message ?? `Provider ${provider} is unavailable`, 'PROVIDER_UNAVAILABLE', provider, true)
    this.name = 'ProviderUnavailableError'
  }
}

/** Error when rate limited by provider */
export class RateLimitError extends PhoneError {
  constructor(
    provider: TelephonyProvider,
    public readonly retryAfter?: number
  ) {
    super(`Rate limited by ${provider}`, 'RATE_LIMITED', provider, true)
    this.name = 'RateLimitError'
  }
}

/** Error when phone number is invalid */
export class InvalidNumberError extends PhoneError {
  constructor(provider: TelephonyProvider, number: string) {
    super(`Invalid phone number: ${number}`, 'INVALID_NUMBER', provider, false)
    this.name = 'InvalidNumberError'
  }
}

/** Error when account has insufficient funds */
export class InsufficientFundsError extends PhoneError {
  constructor(provider: TelephonyProvider) {
    super(`Insufficient funds in ${provider} account`, 'INSUFFICIENT_FUNDS', provider, false)
    this.name = 'InsufficientFundsError'
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Normalize a phone number to E.164 format
 *
 * @example
 * ```typescript
 * normalizePhoneNumber('(415) 555-1234')     // '+14155551234'
 * normalizePhoneNumber('+44 20 7946 0958')   // '+442079460958'
 * ```
 */
export function normalizePhoneNumber(input: string, defaultCountryCode = '1'): string {
  const cleaned = input.replace(/[^\d+]/g, '')

  if (cleaned.startsWith('+')) {
    return cleaned
  }

  return `+${defaultCountryCode}${cleaned}`
}

/** Validate that a string is a valid E.164 phone number */
export function isValidE164(number: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(number)
}

/** Check if an error should trigger failover */
export function shouldFailover(error: unknown, conditions: FailoverCondition[]): boolean {
  if (!(error instanceof PhoneError)) {
    return false
  }

  const conditionMap: Record<string, FailoverCondition> = {
    PROVIDER_UNAVAILABLE: 'service_unavailable',
    RATE_LIMITED: 'rate_limit',
    TIMEOUT: 'timeout',
    AUTH_ERROR: 'authentication_error',
    INSUFFICIENT_FUNDS: 'insufficient_funds',
  }

  const condition = conditionMap[error.code]
  return condition ? conditions.includes(condition) : false
}

/** Execute an operation with automatic failover across providers */
export async function executeWithFailover<T>(
  operation: (adapter: PhoneProviderAdapter) => Promise<T>,
  adapters: PhoneProviderAdapter[],
  failoverConditions: FailoverCondition[]
): Promise<T> {
  let lastError: Error | undefined

  for (const adapter of adapters) {
    try {
      return await operation(adapter)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (shouldFailover(error, failoverConditions)) {
        continue
      }

      throw error
    }
  }

  throw lastError ?? new Error('All providers failed')
}

// =============================================================================
// Provider Factory
// =============================================================================

/** Create a phone provider adapter for a specific provider */
export function createProviderAdapter(_config: TelephonyProviderConfig): PhoneProviderAdapter {
  // TODO: Implement provider-specific adapters
  throw new Error(`Provider adapter for ${_config.provider} not yet implemented`)
}

/** Create a phone client with optional failover support */
export function createPhoneClient(_config: PhoneClientConfig): PhoneProviderAdapter {
  // TODO: Implement client with failover logic
  throw new Error('Phone client not yet implemented')
}
