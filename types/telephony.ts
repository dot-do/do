/**
 * Telephony Types - Phone Numbers, Calls, SMS
 *
 * Abstraction layer over telephony providers:
 * - Twilio (reference implementation)
 * - Telnyx (cost-effective alternative)
 * - Plivo (good API, competitive pricing)
 * - Vonage (enterprise features)
 * - Bandwidth (US-focused, direct carrier)
 *
 * Capabilities:
 * - Phone number provisioning
 * - Inbound/outbound voice calls
 * - Inbound/outbound SMS
 * - Call recording
 * - IVR/voice menus
 */

import type { DigitalObjectRef } from './identity'

// =============================================================================
// Telephony Providers
// =============================================================================

/**
 * Supported telephony providers
 */
export type TelephonyProvider =
  | 'Twilio'      // Reference implementation, most features
  | 'Telnyx'      // Cost-effective, good API
  | 'Plivo'       // Good balance of features and price
  | 'Vonage'      // Enterprise features
  | 'Bandwidth'   // US-focused, direct carrier access
  | 'Sinch'       // Global reach, competitive

/**
 * Provider configuration
 */
export interface TelephonyProviderConfig {
  provider: TelephonyProvider
  /** Account SID / API Key */
  accountId: string
  /** Auth Token / API Secret */
  authToken: string
  /** Additional provider-specific config */
  config?: Record<string, unknown>
}

// =============================================================================
// Phone Numbers
// =============================================================================

/**
 * Phone number type
 */
export type PhoneNumberType =
  | 'Local'       // Local number
  | 'Mobile'      // Mobile number
  | 'TollFree'    // Toll-free number
  | 'ShortCode'   // Short code for SMS
  | 'National'    // National number

/**
 * Phone number capabilities
 */
export interface PhoneNumberCapabilities {
  voice: boolean
  sms: boolean
  mms: boolean
  fax?: boolean
}

/**
 * Phone number record
 */
export interface PhoneNumber {
  id: string
  /** E.164 format (+1234567890) */
  number: string
  /** Friendly name */
  friendlyName?: string
  /** Number type */
  type: PhoneNumberType
  /** Country code (ISO 3166-1 alpha-2) */
  countryCode: string
  /** Capabilities */
  capabilities: PhoneNumberCapabilities
  /** Provider */
  provider: TelephonyProvider
  /** Provider's ID for this number */
  providerNumberId: string
  /** Owner DO reference */
  ownerRef: DigitalObjectRef
  /** Status */
  status: 'Active' | 'Pending' | 'Suspended' | 'Released'
  /** Monthly cost (in cents) */
  monthlyCost?: number
  /** Voice webhook URL */
  voiceWebhookUrl?: string
  /** SMS webhook URL */
  smsWebhookUrl?: string
  /** Created timestamp */
  createdAt: number
  /** Updated timestamp */
  updatedAt: number
}

/**
 * Phone number search criteria
 */
export interface PhoneNumberSearch {
  /** Country code */
  countryCode: string
  /** Number type */
  type?: PhoneNumberType
  /** Required capabilities */
  capabilities?: Partial<PhoneNumberCapabilities>
  /** Area code / prefix */
  areaCode?: string
  /** Contains pattern */
  contains?: string
  /** Limit results */
  limit?: number
}

/**
 * Available phone number (from search)
 */
export interface AvailablePhoneNumber {
  number: string
  type: PhoneNumberType
  countryCode: string
  locality?: string
  region?: string
  capabilities: PhoneNumberCapabilities
  monthlyPrice: number // in cents
  provider: TelephonyProvider
}

// =============================================================================
// Voice Calls
// =============================================================================

/**
 * Call direction
 */
export type CallDirection = 'Inbound' | 'Outbound'

/**
 * Call status
 */
export type CallStatus =
  | 'Queued'       // Call is queued
  | 'Ringing'      // Phone is ringing
  | 'InProgress'   // Call is connected
  | 'Completed'    // Call ended normally
  | 'Busy'         // Line was busy
  | 'NoAnswer'     // No answer
  | 'Failed'       // Call failed
  | 'Canceled'     // Call was canceled

/**
 * Call record
 */
export interface CallRecord {
  id: string
  /** Provider call SID */
  providerCallId: string
  /** Provider */
  provider: TelephonyProvider
  /** Direction */
  direction: CallDirection
  /** From number (E.164) */
  from: string
  /** To number (E.164) */
  to: string
  /** Status */
  status: CallStatus
  /** Duration in seconds */
  duration?: number
  /** Start time */
  startTime?: number
  /** End time */
  endTime?: number
  /** Answer time */
  answerTime?: number
  /** Price in cents */
  price?: number
  /** Recording URL */
  recordingUrl?: string
  /** Transcription */
  transcription?: string
  /** Custom data */
  metadata?: Record<string, unknown>
  /** Created timestamp */
  createdAt: number
}

/**
 * Outbound call options
 */
export interface OutboundCallOptions {
  /** From number (must be owned) */
  from: string
  /** To number (E.164) */
  to: string
  /** TwiML/XML instructions URL */
  url?: string
  /** TwiML/XML instructions (inline) */
  twiml?: string
  /** Callback URL for status updates */
  statusCallback?: string
  /** Record the call */
  record?: boolean
  /** Timeout in seconds */
  timeout?: number
  /** Machine detection */
  machineDetection?: 'Enable' | 'DetectMessageEnd'
  /** Async AMD (returns immediately) */
  asyncAmd?: boolean
  /** Custom data */
  metadata?: Record<string, unknown>
}

/**
 * Call response action
 */
export type CallAction =
  | { type: 'say'; text: string; voice?: string; language?: string }
  | { type: 'play'; url: string; loop?: number }
  | { type: 'gather'; input: ('DTMF' | 'Speech')[]; timeout?: number; numDigits?: number; action?: string }
  | { type: 'dial'; number: string; callerId?: string; timeout?: number; record?: boolean }
  | { type: 'conference'; name: string; startOnEnter?: boolean; endOnExit?: boolean }
  | { type: 'record'; maxLength?: number; transcribe?: boolean; action?: string }
  | { type: 'pause'; length?: number }
  | { type: 'hangup' }
  | { type: 'redirect'; url: string }
  | { type: 'reject'; reason?: 'Busy' | 'Rejected' }

/**
 * Call instructions (TwiML-like)
 */
export interface CallInstructions {
  actions: CallAction[]
}

// =============================================================================
// SMS / MMS
// =============================================================================

/**
 * SMS direction
 */
export type SMSDirection = 'Inbound' | 'Outbound'

/**
 * SMS status
 */
export type SMSStatus =
  | 'Queued'
  | 'Sending'
  | 'Sent'
  | 'Delivered'
  | 'Undelivered'
  | 'Failed'
  | 'Received'

/**
 * SMS record
 */
export interface SMSRecord {
  id: string
  /** Provider message SID */
  providerMessageId: string
  /** Provider */
  provider: TelephonyProvider
  /** Direction */
  direction: SMSDirection
  /** From number (E.164) */
  from: string
  /** To number (E.164) */
  to: string
  /** Message body */
  body: string
  /** Media URLs (for MMS) */
  mediaUrls?: string[]
  /** Status */
  status: SMSStatus
  /** Number of segments */
  numSegments?: number
  /** Price in cents */
  price?: number
  /** Error code */
  errorCode?: string
  /** Error message */
  errorMessage?: string
  /** Sent timestamp */
  sentAt?: number
  /** Delivered timestamp */
  deliveredAt?: number
  /** Custom data */
  metadata?: Record<string, unknown>
  /** Created timestamp */
  createdAt: number
}

/**
 * Outbound SMS options
 */
export interface OutboundSMSOptions {
  /** From number (must be owned) */
  from: string
  /** To number (E.164) */
  to: string
  /** Message body */
  body: string
  /** Media URLs (for MMS) */
  mediaUrls?: string[]
  /** Status callback URL */
  statusCallback?: string
  /** Validity period in seconds */
  validityPeriod?: number
  /** Smart encoding */
  smartEncoded?: boolean
  /** Custom data */
  metadata?: Record<string, unknown>
}

/**
 * Bulk SMS options
 */
export interface BulkSMSOptions {
  /** From number */
  from: string
  /** Recipients */
  recipients: Array<{
    to: string
    body?: string // Override default body
    metadata?: Record<string, unknown>
  }>
  /** Default message body */
  body: string
  /** Status callback URL */
  statusCallback?: string
}

// =============================================================================
// Inbound Handling
// =============================================================================

/**
 * Inbound call event
 */
export interface InboundCallEvent {
  id: string
  /** Provider call SID */
  providerCallId: string
  /** From number */
  from: string
  /** To number (your number) */
  to: string
  /** Caller name (CNAM) */
  callerName?: string
  /** Geographic info */
  fromCity?: string
  fromState?: string
  fromCountry?: string
  /** Call status */
  status: CallStatus
  /** Direction */
  direction: 'Inbound'
  /** Timestamp */
  timestamp: number
}

/**
 * Inbound SMS event
 */
export interface InboundSMSEvent {
  id: string
  /** Provider message SID */
  providerMessageId: string
  /** From number */
  from: string
  /** To number (your number) */
  to: string
  /** Message body */
  body: string
  /** Media URLs (for MMS) */
  mediaUrls?: string[]
  /** Number of media items */
  numMedia?: number
  /** Geographic info */
  fromCity?: string
  fromState?: string
  fromCountry?: string
  /** Timestamp */
  timestamp: number
}

// =============================================================================
// Telephony Operations Interface
// =============================================================================

/**
 * Telephony operations for a DO
 */
export interface TelephonyOperations {
  // Provider configuration
  setProvider(config: TelephonyProviderConfig): Promise<void>
  getProvider(): Promise<TelephonyProvider | null>

  // Phone number management
  searchPhoneNumbers(criteria: PhoneNumberSearch): Promise<AvailablePhoneNumber[]>
  purchasePhoneNumber(number: string): Promise<PhoneNumber>
  configurePhoneNumber(numberId: string, config: Partial<PhoneNumber>): Promise<PhoneNumber>
  releasePhoneNumber(numberId: string): Promise<boolean>
  listPhoneNumbers(): Promise<PhoneNumber[]>

  // Voice calls
  makeCall(options: OutboundCallOptions): Promise<CallRecord>
  getCall(callId: string): Promise<CallRecord | null>
  updateCall(callId: string, instructions: CallInstructions): Promise<CallRecord>
  endCall(callId: string): Promise<boolean>
  listCalls(options?: { limit?: number; status?: CallStatus; direction?: CallDirection }): Promise<CallRecord[]>

  // SMS
  sendSMS(options: OutboundSMSOptions): Promise<SMSRecord>
  sendBulkSMS(options: BulkSMSOptions): Promise<SMSRecord[]>
  getSMS(messageId: string): Promise<SMSRecord | null>
  listSMS(options?: { limit?: number; status?: SMSStatus; direction?: SMSDirection }): Promise<SMSRecord[]>

  // Event handlers
  onInboundCall(handler: (event: InboundCallEvent) => Promise<CallInstructions>): void
  onInboundSMS(handler: (event: InboundSMSEvent) => Promise<string | void>): void
  onCallStatusChange(handler: (call: CallRecord) => Promise<void>): void
  onSMSStatusChange(handler: (sms: SMSRecord) => Promise<void>): void
}

// =============================================================================
// Telephony Events (Observability)
// =============================================================================

/**
 * Telephony events for observability
 */
export type TelephonyEvent =
  | { type: 'phone:purchased'; payload: { number: string; type: PhoneNumberType } }
  | { type: 'phone:released'; payload: { number: string } }
  | { type: 'call:started'; payload: { callId: string; direction: CallDirection; from: string; to: string } }
  | { type: 'call:ended'; payload: { callId: string; duration: number; status: CallStatus } }
  | { type: 'call:recorded'; payload: { callId: string; recordingUrl: string } }
  | { type: 'sms:sent'; payload: { messageId: string; to: string; segments: number } }
  | { type: 'sms:delivered'; payload: { messageId: string } }
  | { type: 'sms:received'; payload: { messageId: string; from: string } }
  | { type: 'sms:failed'; payload: { messageId: string; error: string } }
