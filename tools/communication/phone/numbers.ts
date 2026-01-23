/**
 * Phone Number Management
 *
 * Search, purchase, configure, and release phone numbers across providers.
 *
 * @module tools/communication/phone/numbers
 */

import type { PhoneNumber, PhoneNumberType, PhoneNumberCapabilities, PhoneNumberSearch, AvailablePhoneNumber } from '../../../types/telephony'
import type { DigitalObjectRef } from '../../../types/identity'
import type { PhoneProviderAdapter } from './providers'

// =============================================================================
// Phone Number Manager
// =============================================================================

/**
 * Options for configuring a phone number
 */
export interface PhoneNumberConfigOptions {
  /** Friendly name for identification */
  friendlyName?: string
  /** URL to receive voice webhooks */
  voiceWebhookUrl?: string
  /** URL to receive SMS webhooks */
  smsWebhookUrl?: string
  /** HTTP method for webhooks (GET or POST) */
  webhookMethod?: 'GET' | 'POST'
}

/**
 * Options for listing phone numbers
 */
export interface ListPhoneNumbersOptions {
  /** Filter by number type */
  type?: PhoneNumberType
  /** Filter by capabilities */
  capabilities?: Partial<PhoneNumberCapabilities>
  /** Filter by status */
  status?: PhoneNumber['status']
  /** Maximum numbers to return */
  limit?: number
  /** Offset for pagination */
  offset?: number
}

/**
 * Phone number manager for a Digital Object
 *
 * Handles all phone number operations including search, purchase,
 * configuration, and release across configured providers.
 *
 * @example
 * ```typescript
 * const manager = new PhoneNumberManager(adapter, ownerRef)
 *
 * // Search for available numbers
 * const available = await manager.search({
 *   countryCode: 'US',
 *   areaCode: '415',
 *   capabilities: { voice: true, sms: true },
 * })
 *
 * // Purchase a number
 * const number = await manager.purchase(available[0].number)
 *
 * // Configure webhooks
 * await manager.configure(number.id, {
 *   voiceWebhookUrl: 'https://my-do.example.com/voice',
 *   smsWebhookUrl: 'https://my-do.example.com/sms',
 * })
 * ```
 */
export class PhoneNumberManager {
  constructor(
    private readonly _adapter: PhoneProviderAdapter,
    private readonly _ownerRef: DigitalObjectRef
  ) {}

  /**
   * Search for available phone numbers
   *
   * @param criteria - Search criteria (country, type, area code, etc.)
   * @returns List of available numbers matching criteria
   *
   * @example
   * ```typescript
   * const numbers = await manager.search({
   *   countryCode: 'US',
   *   type: 'local',
   *   areaCode: '415',
   *   capabilities: { voice: true, sms: true },
   *   limit: 10,
   * })
   * ```
   */
  async search(_criteria: PhoneNumberSearch): Promise<AvailablePhoneNumber[]> {
    // TODO: Implement search with provider adapter
    throw new Error('Not implemented')
  }

  /**
   * Purchase a phone number
   *
   * @param number - E.164 formatted number to purchase
   * @param options - Optional configuration to apply immediately
   * @returns The purchased phone number record
   *
   * @example
   * ```typescript
   * const phoneNumber = await manager.purchase('+14155551234', {
   *   friendlyName: 'Main Line',
   *   voiceWebhookUrl: 'https://my-do.example.com/voice',
   * })
   * ```
   */
  async purchase(_number: string, _options?: PhoneNumberConfigOptions): Promise<PhoneNumber> {
    // TODO: Implement purchase with provider adapter
    throw new Error('Not implemented')
  }

  /**
   * Configure a phone number
   *
   * @param numberId - The phone number ID
   * @param options - Configuration options to apply
   * @returns Updated phone number record
   *
   * @example
   * ```typescript
   * await manager.configure(phoneNumber.id, {
   *   friendlyName: 'Support Line',
   *   voiceWebhookUrl: 'https://my-do.example.com/support/voice',
   * })
   * ```
   */
  async configure(_numberId: string, _options: PhoneNumberConfigOptions): Promise<PhoneNumber> {
    // TODO: Implement configuration with provider adapter
    throw new Error('Not implemented')
  }

  /**
   * Get a phone number by ID
   *
   * @param numberId - The phone number ID
   * @returns Phone number record or null if not found
   */
  async get(_numberId: string): Promise<PhoneNumber | null> {
    // TODO: Implement get with provider adapter
    throw new Error('Not implemented')
  }

  /**
   * Get a phone number by E.164 number
   *
   * @param number - The E.164 formatted phone number
   * @returns Phone number record or null if not found
   */
  async getByNumber(_number: string): Promise<PhoneNumber | null> {
    // TODO: Implement lookup by number
    throw new Error('Not implemented')
  }

  /**
   * List all owned phone numbers
   *
   * @param options - Filter and pagination options
   * @returns List of phone numbers
   *
   * @example
   * ```typescript
   * // Get all SMS-capable numbers
   * const smsNumbers = await manager.list({
   *   capabilities: { sms: true },
   * })
   * ```
   */
  async list(_options?: ListPhoneNumbersOptions): Promise<PhoneNumber[]> {
    // TODO: Implement list with provider adapter
    throw new Error('Not implemented')
  }

  /**
   * Release/delete a phone number
   *
   * @param numberId - The phone number ID to release
   * @returns True if successfully released
   *
   * @example
   * ```typescript
   * await manager.release(phoneNumber.id)
   * ```
   */
  async release(_numberId: string): Promise<boolean> {
    // TODO: Implement release with provider adapter
    throw new Error('Not implemented')
  }

  /**
   * Get the count of owned phone numbers
   *
   * @param options - Optional filter options
   * @returns Count of matching phone numbers
   */
  async count(options?: ListPhoneNumbersOptions): Promise<number> {
    const numbers = await this.list(options)
    return numbers.length
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Parse a phone number into its components
 *
 * @param number - E.164 formatted phone number
 * @returns Parsed components (country code, area code, subscriber number)
 */
export function parsePhoneNumber(number: string): {
  countryCode: string
  areaCode?: string
  subscriberNumber: string
} {
  // Remove leading +
  const digits = number.replace(/^\+/, '')

  // Simple parsing for common formats
  // More sophisticated parsing would use libphonenumber
  if (digits.startsWith('1') && digits.length === 11) {
    // North American format: +1 (NPA) NXX-XXXX
    return {
      countryCode: '1',
      areaCode: digits.substring(1, 4),
      subscriberNumber: digits.substring(4),
    }
  }

  if (digits.startsWith('44') && digits.length >= 11) {
    // UK format
    return {
      countryCode: '44',
      areaCode: digits.substring(2, 5),
      subscriberNumber: digits.substring(5),
    }
  }

  // Generic fallback: assume first 1-3 digits are country code
  return {
    countryCode: digits.substring(0, 2),
    subscriberNumber: digits.substring(2),
  }
}

/**
 * Format a phone number for display
 *
 * @param number - E.164 formatted phone number
 * @param format - Display format ('national', 'international', 'e164')
 * @returns Formatted phone number string
 *
 * @example
 * ```typescript
 * formatPhoneNumber('+14155551234', 'national')      // '(415) 555-1234'
 * formatPhoneNumber('+14155551234', 'international') // '+1 415-555-1234'
 * ```
 */
export function formatPhoneNumber(number: string, format: 'national' | 'international' | 'e164' = 'international'): string {
  const parsed = parsePhoneNumber(number)

  if (format === 'e164') {
    return number
  }

  // North American format
  if (parsed.countryCode === '1' && parsed.areaCode) {
    if (format === 'national') {
      return `(${parsed.areaCode}) ${parsed.subscriberNumber.substring(0, 3)}-${parsed.subscriberNumber.substring(3)}`
    }
    return `+1 ${parsed.areaCode}-${parsed.subscriberNumber.substring(0, 3)}-${parsed.subscriberNumber.substring(3)}`
  }

  // Generic international format
  return format === 'national'
    ? `${parsed.areaCode ?? ''} ${parsed.subscriberNumber}`.trim()
    : `+${parsed.countryCode} ${parsed.areaCode ?? ''} ${parsed.subscriberNumber}`.trim()
}

/**
 * Determine the type of a phone number based on its format
 *
 * @param number - E.164 formatted phone number
 * @returns Detected phone number type
 */
export function detectNumberType(number: string): PhoneNumberType {
  const digits = number.replace(/^\+/, '')

  // US toll-free prefixes
  if (digits.startsWith('1') && ['800', '888', '877', '866', '855', '844', '833'].some((prefix) => digits.substring(1, 4) === prefix)) {
    return 'TollFree'
  }

  // Short codes (typically 5-6 digits)
  if (digits.length <= 6) {
    return 'ShortCode'
  }

  // Default to local
  return 'Local'
}

/**
 * Calculate the monthly cost estimate for a set of numbers
 *
 * @param numbers - List of phone numbers
 * @returns Total monthly cost in cents
 */
export function calculateMonthlyCost(numbers: PhoneNumber[]): number {
  return numbers.reduce((total, num) => total + (num.monthlyCost ?? 0), 0)
}
