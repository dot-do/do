/**
 * SMS/MMS Messaging
 *
 * Outbound messaging, bulk sending, and delivery tracking.
 *
 * @module tools/communication/phone/sms
 */

import type { SMSRecord, SMSStatus, SMSDirection, OutboundSMSOptions, BulkSMSOptions } from '../../../types/telephony'
import type { PhoneProviderAdapter } from './providers'

// =============================================================================
// SMS Manager
// =============================================================================

/**
 * Options for listing SMS messages
 */
export interface ListSMSOptions {
  /** Filter by message status */
  status?: SMSStatus
  /** Filter by direction */
  direction?: SMSDirection
  /** Filter by from number */
  from?: string
  /** Filter by to number */
  to?: string
  /** Filter messages after this timestamp */
  sentAfter?: number
  /** Filter messages before this timestamp */
  sentBefore?: number
  /** Maximum messages to return */
  limit?: number
  /** Offset for pagination */
  offset?: number
}

/**
 * Extended SMS options with additional features
 */
export interface ExtendedSMSOptions extends OutboundSMSOptions {
  /** Schedule message for future delivery */
  scheduledAt?: number
  /** Message priority (if supported by provider) */
  priority?: 'normal' | 'high'
  /** Sender ID (alphanumeric, if supported) */
  senderId?: string
  /** Messaging service/profile ID */
  messagingServiceId?: string
  /** Track clicks in URLs */
  trackClicks?: boolean
  /** Shorten URLs */
  shortenUrls?: boolean
}

/**
 * Bulk send result with individual message statuses
 */
export interface BulkSMSResult {
  /** Total messages attempted */
  total: number
  /** Successfully queued messages */
  successful: number
  /** Failed messages */
  failed: number
  /** Individual message results */
  messages: SMSRecord[]
  /** Errors for failed messages */
  errors?: Array<{ to: string; error: string }>
}

/**
 * SMS message manager for a Digital Object
 *
 * Handles all SMS/MMS operations including sending single messages,
 * bulk messaging, and delivery tracking.
 *
 * @example
 * ```typescript
 * const manager = new SMSManager(adapter)
 *
 * // Send a single message
 * const message = await manager.send({
 *   from: '+14155551234',
 *   to: '+14155559876',
 *   body: 'Your order has shipped!',
 * })
 *
 * // Send MMS with media
 * const mms = await manager.send({
 *   from: '+14155551234',
 *   to: '+14155559876',
 *   body: 'Check out this image!',
 *   mediaUrls: ['https://example.com/image.jpg'],
 * })
 *
 * // Bulk send
 * const result = await manager.sendBulk({
 *   from: '+14155551234',
 *   body: 'Flash sale! 50% off.',
 *   recipients: [
 *     { to: '+14155559876' },
 *     { to: '+14155559877' },
 *   ],
 * })
 * ```
 */
export class SMSManager {
  constructor(private readonly adapter: PhoneProviderAdapter) {}

  /**
   * Send a single SMS/MMS message
   *
   * @param options - Message options
   * @returns The sent message record
   *
   * @example
   * ```typescript
   * const message = await manager.send({
   *   from: '+14155551234',
   *   to: '+14155559876',
   *   body: 'Hello! Your verification code is 123456.',
   *   statusCallback: 'https://my-do.example.com/webhooks/sms-status',
   * })
   * ```
   */
  async send(_options: ExtendedSMSOptions): Promise<SMSRecord> {
    // TODO: Implement with provider adapter
    throw new Error('Not implemented')
  }

  /**
   * Send MMS message with media
   *
   * @param options - MMS options with mediaUrls
   * @returns The sent message record
   *
   * @example
   * ```typescript
   * const mms = await manager.sendMMS({
   *   from: '+14155551234',
   *   to: '+14155559876',
   *   body: 'Check out our new product!',
   *   mediaUrls: [
   *     'https://example.com/product.jpg',
   *     'https://example.com/brochure.pdf',
   *   ],
   * })
   * ```
   */
  async sendMMS(options: ExtendedSMSOptions & { mediaUrls: string[] }): Promise<SMSRecord> {
    return this.send(options)
  }

  /**
   * Send bulk SMS messages
   *
   * @param options - Bulk message options with recipients
   * @returns Bulk send result with individual statuses
   *
   * @example
   * ```typescript
   * const result = await manager.sendBulk({
   *   from: '+14155551234',
   *   body: 'Flash sale! 50% off everything today.',
   *   recipients: [
   *     { to: '+14155559876' },
   *     { to: '+14155559877', body: 'VIP: 60% off for you!' },
   *     { to: '+14155559878' },
   *   ],
   *   statusCallback: 'https://my-do.example.com/webhooks/sms-status',
   * })
   *
   * console.log(`Sent ${result.successful}/${result.total} messages`)
   * ```
   */
  async sendBulk(_options: BulkSMSOptions): Promise<BulkSMSResult> {
    // TODO: Implement bulk sending with provider adapter
    throw new Error('Not implemented')
  }

  /**
   * Schedule a message for future delivery
   *
   * @param options - Message options with scheduledAt timestamp
   * @returns The scheduled message record
   *
   * @example
   * ```typescript
   * const scheduled = await manager.schedule({
   *   from: '+14155551234',
   *   to: '+14155559876',
   *   body: 'Reminder: Your appointment is tomorrow at 10am.',
   *   scheduledAt: Date.now() + 86400000, // 24 hours from now
   * })
   * ```
   */
  async schedule(_options: ExtendedSMSOptions & { scheduledAt: number }): Promise<SMSRecord> {
    // TODO: Implement scheduled sending
    throw new Error('Not implemented')
  }

  /**
   * Cancel a scheduled message
   *
   * @param messageId - The message ID to cancel
   * @returns True if successfully canceled
   */
  async cancelScheduled(_messageId: string): Promise<boolean> {
    // TODO: Implement cancellation
    throw new Error('Not implemented')
  }

  /**
   * Get a message record by ID
   *
   * @param messageId - The message ID
   * @returns Message record or null if not found
   */
  async get(messageId: string): Promise<SMSRecord | null> {
    return this.adapter.getSMS(messageId)
  }

  /**
   * List messages with optional filtering
   *
   * @param options - Filter and pagination options
   * @returns List of message records
   *
   * @example
   * ```typescript
   * // Get recent delivered messages
   * const messages = await manager.list({
   *   status: 'delivered',
   *   sentAfter: Date.now() - 86400000, // Last 24 hours
   *   limit: 50,
   * })
   * ```
   */
  async list(_options?: ListSMSOptions): Promise<SMSRecord[]> {
    // TODO: Implement with provider adapter
    throw new Error('Not implemented')
  }

  /**
   * Get message delivery statistics
   *
   * @param options - Time range and filter options
   * @returns Message statistics
   */
  async getStats(_options?: {
    startDate?: number
    endDate?: number
    direction?: SMSDirection
  }): Promise<{
    totalMessages: number
    delivered: number
    failed: number
    pending: number
    totalSegments: number
    totalCost: number
  }> {
    // TODO: Implement statistics aggregation
    throw new Error('Not implemented')
  }

  /**
   * Redact a message (remove body content)
   *
   * @param messageId - The message ID to redact
   * @returns Updated message record with redacted body
   */
  async redact(_messageId: string): Promise<SMSRecord> {
    // TODO: Implement message redaction
    throw new Error('Not implemented')
  }
}

// =============================================================================
// SMS Utility Functions
// =============================================================================

/**
 * Maximum length of a single SMS segment
 */
export const SMS_SEGMENT_LENGTH_GSM7 = 160
export const SMS_SEGMENT_LENGTH_UCS2 = 70
export const SMS_CONCAT_LENGTH_GSM7 = 153
export const SMS_CONCAT_LENGTH_UCS2 = 67

/**
 * Check if a message requires UCS-2 encoding (non-GSM-7 characters)
 *
 * @param text - Message text to check
 * @returns True if UCS-2 encoding is required
 */
export function requiresUCS2(text: string): boolean {
  // GSM-7 basic character set (simplified check)
  // Full GSM-7 check would include extended characters
  const gsm7Regex = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1b\x20-\x5B\x5D-\x7F]*$/
  return !gsm7Regex.test(text)
}

/**
 * Calculate the number of segments a message will be split into
 *
 * @param text - Message text
 * @returns Number of SMS segments
 *
 * @example
 * ```typescript
 * calculateSegments('Hello!') // 1
 * calculateSegments('A'.repeat(161)) // 2
 * ```
 */
export function calculateSegments(text: string): number {
  const isUCS2 = requiresUCS2(text)
  const singleLimit = isUCS2 ? SMS_SEGMENT_LENGTH_UCS2 : SMS_SEGMENT_LENGTH_GSM7
  const concatLimit = isUCS2 ? SMS_CONCAT_LENGTH_UCS2 : SMS_CONCAT_LENGTH_GSM7

  if (text.length <= singleLimit) {
    return 1
  }

  return Math.ceil(text.length / concatLimit)
}

/**
 * Split a message into segments (for display/preview purposes)
 *
 * @param text - Message text
 * @returns Array of message segments
 */
export function splitIntoSegments(text: string): string[] {
  const isUCS2 = requiresUCS2(text)
  const singleLimit = isUCS2 ? SMS_SEGMENT_LENGTH_UCS2 : SMS_SEGMENT_LENGTH_GSM7
  const concatLimit = isUCS2 ? SMS_CONCAT_LENGTH_UCS2 : SMS_CONCAT_LENGTH_GSM7

  if (text.length <= singleLimit) {
    return [text]
  }

  const segments: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    segments.push(remaining.slice(0, concatLimit))
    remaining = remaining.slice(concatLimit)
  }

  return segments
}

/**
 * Estimate the cost of sending a message
 *
 * @param text - Message text
 * @param pricePerSegment - Price per segment in cents
 * @returns Estimated cost in cents
 */
export function estimateCost(text: string, pricePerSegment: number): number {
  return calculateSegments(text) * pricePerSegment
}

/**
 * Check if an SMS status is terminal
 *
 * @param status - SMS status to check
 * @returns True if message is in final state
 */
export function isSMSTerminal(status: SMSStatus): boolean {
  return ['Delivered', 'Undelivered', 'Failed', 'Received'].includes(status)
}

/**
 * Check if an SMS was successfully delivered
 *
 * @param status - SMS status to check
 * @returns True if message was delivered
 */
export function isSMSDelivered(status: SMSStatus): boolean {
  return status === 'Delivered'
}

/**
 * Truncate a message to fit within segment limit with suffix
 *
 * @param text - Message text
 * @param maxSegments - Maximum segments allowed
 * @param suffix - Suffix to add if truncated (e.g., '...')
 * @returns Truncated message
 */
export function truncateMessage(text: string, maxSegments: number = 1, suffix: string = '...'): string {
  const isUCS2 = requiresUCS2(text)
  const singleLimit = isUCS2 ? SMS_SEGMENT_LENGTH_UCS2 : SMS_SEGMENT_LENGTH_GSM7
  const concatLimit = isUCS2 ? SMS_CONCAT_LENGTH_UCS2 : SMS_CONCAT_LENGTH_GSM7

  const maxLength = maxSegments === 1 ? singleLimit : concatLimit * maxSegments

  if (text.length <= maxLength) {
    return text
  }

  return text.slice(0, maxLength - suffix.length) + suffix
}

/**
 * Validate phone numbers for SMS (basic E.164 check)
 *
 * @param numbers - List of phone numbers to validate
 * @returns Validation result with valid and invalid numbers
 */
export function validateRecipients(numbers: string[]): {
  valid: string[]
  invalid: string[]
} {
  const e164Regex = /^\+[1-9]\d{1,14}$/

  return numbers.reduce(
    (result, number) => {
      if (e164Regex.test(number)) {
        result.valid.push(number)
      } else {
        result.invalid.push(number)
      }
      return result
    },
    { valid: [] as string[], invalid: [] as string[] }
  )
}
