/**
 * Phone Channel
 *
 * Voice calls, SMS, and phone number management for Digital Objects.
 * Unified abstraction over multiple telephony providers with automatic failover.
 *
 * @module tools/communication/phone
 *
 * @example
 * ```typescript
 * import {
 *   createPhoneClient,
 *   CallManager,
 *   SMSManager,
 *   PhoneNumberManager,
 *   normalizePhoneNumber,
 *   isValidE164,
 * } from 'do/tools/communication/phone'
 *
 * // Create a client with failover
 * const phone = createPhoneClient({
 *   primary: {
 *     provider: 'Telnyx',
 *     accountId: process.env.TELNYX_API_KEY,
 *     authToken: process.env.TELNYX_API_SECRET,
 *   },
 *   fallback: [{
 *     provider: 'Twilio',
 *     accountId: process.env.TWILIO_ACCOUNT_SID,
 *     authToken: process.env.TWILIO_AUTH_TOKEN,
 *   }],
 * })
 *
 * // Make a call
 * await phone.makeCall({
 *   from: '+14155551234',
 *   to: '+14155559876',
 *   url: 'https://example.com/voice/handler',
 * })
 *
 * // Send SMS
 * await phone.sendSMS({
 *   from: '+14155551234',
 *   to: '+14155559876',
 *   body: 'Hello from DO!',
 * })
 * ```
 */

// =============================================================================
// Provider Abstraction
// =============================================================================

export {
  // Types
  type PhoneProviderAdapter,
  type PhoneClientConfig,
  type FailoverCondition,

  // Error types
  PhoneError,
  ProviderUnavailableError,
  RateLimitError,
  InvalidNumberError,
  InsufficientFundsError,

  // Factory functions
  createProviderAdapter,
  createPhoneClient,

  // Utilities
  normalizePhoneNumber,
  isValidE164,
  shouldFailover,
  executeWithFailover,
} from './providers'

// =============================================================================
// Phone Number Management
// =============================================================================

export {
  // Manager
  PhoneNumberManager,

  // Types
  type PhoneNumberConfigOptions,
  type ListPhoneNumbersOptions,

  // Utilities
  parsePhoneNumber,
  formatPhoneNumber,
  detectNumberType,
  calculateMonthlyCost,
} from './numbers'

// =============================================================================
// Voice Calls
// =============================================================================

export {
  // Manager
  CallManager,

  // Types
  type ListCallsOptions,
  type ExtendedCallOptions,
  type CallControlOptions,

  // Action helpers
  say,
  play,
  gather,
  dial,
  conference,
  record,
  pause,
  hangup,
  redirect,
  reject,

  // Utilities
  isCallTerminal,
  isCallActive,
  calculateCallDuration,
} from './calls'

// =============================================================================
// SMS/MMS Messaging
// =============================================================================

export {
  // Manager
  SMSManager,

  // Types
  type ListSMSOptions,
  type ExtendedSMSOptions,
  type BulkSMSResult,

  // Constants
  SMS_SEGMENT_LENGTH_GSM7,
  SMS_SEGMENT_LENGTH_UCS2,
  SMS_CONCAT_LENGTH_GSM7,
  SMS_CONCAT_LENGTH_UCS2,

  // Utilities
  requiresUCS2,
  calculateSegments,
  splitIntoSegments,
  estimateCost,
  isSMSTerminal,
  isSMSDelivered,
  truncateMessage,
  validateRecipients,
} from './sms'

// =============================================================================
// Internal Exports (for advanced usage)
// =============================================================================

export {
  // TwiML Builder
  TwiMLBuilder,
  escapeXml,
  buildTwiML,
  sayResponse,
  messageResponse,
  menuResponse,
  forwardResponse,
  voicemailResponse,
  type SayOptions,
  type PlayOptions,
  type GatherOptions,
  type DialOptions,
  type RecordOptions,
  type ConferenceOptions,
  type PauseOptions,
  type RejectOptions,
  type MessageOptions,
  type RedirectOptions,

  // Webhook handlers
  WebhookHandler,
  detectProvider,
  hmacSha1,
  hmacSha256,
  buildTwilioSignatureString,
  validateTwilioSignature,
  parseInboundCallEvent,
  parseInboundSMSEvent,
  parseCallStatusEvent,
  parseSMSStatusEvent,
  type CallStatusEvent,
  type SMSStatusEvent,
  type RecordingStatusEvent,
  type WebhookParseOptions,
} from './internal'

// =============================================================================
// Re-export Types from types/telephony.ts
// =============================================================================

export type {
  // Providers
  TelephonyProvider,
  TelephonyProviderConfig,

  // Phone Numbers
  PhoneNumberType,
  PhoneNumberCapabilities,
  PhoneNumber,
  PhoneNumberSearch,
  AvailablePhoneNumber,

  // Voice Calls
  CallDirection,
  CallStatus,
  CallRecord,
  OutboundCallOptions,
  CallAction,
  CallInstructions,

  // SMS/MMS
  SMSDirection,
  SMSStatus,
  SMSRecord,
  OutboundSMSOptions,
  BulkSMSOptions,

  // Inbound Events
  InboundCallEvent,
  InboundSMSEvent,

  // Operations Interface
  TelephonyOperations,

  // Observability Events
  TelephonyEvent,
} from '../../../types/telephony'
