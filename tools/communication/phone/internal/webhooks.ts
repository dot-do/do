/**
 * Inbound Webhook Handlers (Internal)
 *
 * Parse and validate webhooks from telephony providers for inbound calls and SMS.
 * This is an internal module - use the phone provider's high-level API instead.
 *
 * @internal
 * @module tools/communication/phone/internal/webhooks
 */

import type { TelephonyProvider, CallStatus, SMSStatus, InboundCallEvent, InboundSMSEvent } from '../../../../types/telephony'

// =============================================================================
// Webhook Event Types
// =============================================================================

/**
 * Call status callback event (sent when call status changes)
 */
export interface CallStatusEvent {
  /** The call ID */
  callId: string
  /** Provider's call SID */
  providerCallId: string
  /** Provider that sent the event */
  provider: TelephonyProvider
  /** Current call status */
  status: CallStatus
  /** Call direction */
  direction: 'inbound' | 'outbound'
  /** From number */
  from: string
  /** To number */
  to: string
  /** Call duration in seconds (if completed) */
  duration?: number
  /** Timestamp of the event */
  timestamp: number
  /** Error code (if failed) */
  errorCode?: string
  /** Error message (if failed) */
  errorMessage?: string
  /** Machine detection result */
  answeredBy?: 'human' | 'machine' | 'unknown'
  /** Recording URL (if recorded) */
  recordingUrl?: string
  /** Transcription (if transcribed) */
  transcription?: string
}

/**
 * SMS status callback event (sent when message status changes)
 */
export interface SMSStatusEvent {
  /** The message ID */
  messageId: string
  /** Provider's message SID */
  providerMessageId: string
  /** Provider that sent the event */
  provider: TelephonyProvider
  /** Current message status */
  status: SMSStatus
  /** From number */
  from: string
  /** To number */
  to: string
  /** Timestamp of the event */
  timestamp: number
  /** Error code (if failed) */
  errorCode?: string
  /** Error message (if failed) */
  errorMessage?: string
}

/**
 * Recording status callback event
 */
export interface RecordingStatusEvent {
  /** The recording ID */
  recordingId: string
  /** Associated call ID */
  callId: string
  /** Provider that sent the event */
  provider: TelephonyProvider
  /** Recording status */
  status: 'in-progress' | 'completed' | 'failed'
  /** Recording URL (when completed) */
  recordingUrl?: string
  /** Recording duration in seconds */
  duration?: number
  /** Transcription text (if transcribed) */
  transcription?: string
  /** Timestamp of the event */
  timestamp: number
}

// =============================================================================
// Webhook Parser
// =============================================================================

/**
 * Options for webhook parsing
 */
export interface WebhookParseOptions {
  /** Provider to parse as (if known) */
  provider?: TelephonyProvider
  /** Whether to validate the signature */
  validateSignature?: boolean
  /** Signature validation credentials */
  credentials?: {
    accountId: string
    authToken: string
  }
}

/**
 * Webhook handler for processing inbound telephony events
 *
 * Parses and validates webhooks from various providers, normalizing
 * them into a consistent format.
 *
 * @example
 * ```typescript
 * const handler = new WebhookHandler('Twilio', credentials)
 *
 * // In your webhook endpoint
 * export async function handleVoiceWebhook(request: Request): Promise<Response> {
 *   const isValid = await handler.validateSignature(request)
 *   if (!isValid) {
 *     return new Response('Invalid signature', { status: 403 })
 *   }
 *
 *   const event = await handler.parseInboundCall(request)
 *   // Process the event...
 *
 *   return handler.respondWithTwiML('<Response><Say>Hello!</Say></Response>')
 * }
 * ```
 */
export class WebhookHandler {
  constructor(
    private readonly _provider: TelephonyProvider,
    private readonly credentials?: { accountId: string; authToken: string }
  ) {}

  /**
   * Validate a webhook signature
   *
   * Each provider has different signature validation mechanisms:
   * - Twilio: X-Twilio-Signature header with HMAC-SHA1
   * - Telnyx: telnyx-signature-ed25519 header
   * - Plivo: X-Plivo-Signature header with HMAC-SHA256
   *
   * @param request - The incoming webhook request
   * @returns True if signature is valid
   */
  async validateSignature(request: Request): Promise<boolean> {
    if (!this.credentials) {
      throw new Error('Credentials required for signature validation')
    }

    switch (this._provider) {
      case 'Twilio':
        return validateTwilioSignature(request, this.credentials.authToken)
      // TODO: Add other providers
      default:
        throw new Error(`Signature validation not implemented for ${this._provider}`)
    }
  }

  /**
   * Parse an inbound call webhook
   *
   * @param request - The incoming webhook request
   * @returns Parsed inbound call event
   */
  async parseInboundCall(_request: Request): Promise<InboundCallEvent> {
    // TODO: Implement provider-specific parsing
    throw new Error('Not implemented')
  }

  /**
   * Parse an inbound SMS webhook
   *
   * @param request - The incoming webhook request
   * @returns Parsed inbound SMS event
   */
  async parseInboundSMS(_request: Request): Promise<InboundSMSEvent> {
    // TODO: Implement provider-specific parsing
    throw new Error('Not implemented')
  }

  /**
   * Parse a call status callback
   *
   * @param request - The incoming webhook request
   * @returns Parsed call status event
   */
  async parseCallStatus(_request: Request): Promise<CallStatusEvent> {
    // TODO: Implement provider-specific parsing
    throw new Error('Not implemented')
  }

  /**
   * Parse an SMS status callback
   *
   * @param request - The incoming webhook request
   * @returns Parsed SMS status event
   */
  async parseSMSStatus(_request: Request): Promise<SMSStatusEvent> {
    // TODO: Implement provider-specific parsing
    throw new Error('Not implemented')
  }

  /**
   * Parse a recording status callback
   *
   * @param request - The incoming webhook request
   * @returns Parsed recording status event
   */
  async parseRecordingStatus(_request: Request): Promise<RecordingStatusEvent> {
    // TODO: Implement provider-specific parsing
    throw new Error('Not implemented')
  }

  /**
   * Create a TwiML response
   *
   * @param twiml - TwiML XML string
   * @returns Response with proper Content-Type header
   */
  respondWithTwiML(twiml: string): Response {
    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
      },
    })
  }

  /**
   * Create an empty response (acknowledgment)
   *
   * @returns Empty 200 response
   */
  acknowledge(): Response {
    return new Response('', { status: 200 })
  }
}

// =============================================================================
// Standalone Parsing Functions
// =============================================================================

/**
 * Parse an inbound call event from a webhook request
 *
 * @param request - The incoming webhook request
 * @param options - Parsing options
 * @returns Parsed inbound call event
 *
 * @example
 * ```typescript
 * const event = await parseInboundCallEvent(request, {
 *   provider: 'Twilio',
 *   validateSignature: true,
 *   credentials: { accountId: '...', authToken: '...' },
 * })
 * ```
 */
export async function parseInboundCallEvent(request: Request, options?: WebhookParseOptions): Promise<InboundCallEvent> {
  const provider = options?.provider ?? detectProvider(request)
  const handler = new WebhookHandler(provider, options?.credentials)

  if (options?.validateSignature) {
    const isValid = await handler.validateSignature(request)
    if (!isValid) {
      throw new Error('Invalid webhook signature')
    }
  }

  return handler.parseInboundCall(request)
}

/**
 * Parse an inbound SMS event from a webhook request
 *
 * @param request - The incoming webhook request
 * @param options - Parsing options
 * @returns Parsed inbound SMS event
 */
export async function parseInboundSMSEvent(request: Request, options?: WebhookParseOptions): Promise<InboundSMSEvent> {
  const provider = options?.provider ?? detectProvider(request)
  const handler = new WebhookHandler(provider, options?.credentials)

  if (options?.validateSignature) {
    const isValid = await handler.validateSignature(request)
    if (!isValid) {
      throw new Error('Invalid webhook signature')
    }
  }

  return handler.parseInboundSMS(request)
}

/**
 * Parse a call status callback from a webhook request
 *
 * @param request - The incoming webhook request
 * @param options - Parsing options
 * @returns Parsed call status event
 */
export async function parseCallStatusEvent(request: Request, options?: WebhookParseOptions): Promise<CallStatusEvent> {
  const provider = options?.provider ?? detectProvider(request)
  const handler = new WebhookHandler(provider, options?.credentials)

  if (options?.validateSignature) {
    const isValid = await handler.validateSignature(request)
    if (!isValid) {
      throw new Error('Invalid webhook signature')
    }
  }

  return handler.parseCallStatus(request)
}

/**
 * Parse an SMS status callback from a webhook request
 *
 * @param request - The incoming webhook request
 * @param options - Parsing options
 * @returns Parsed SMS status event
 */
export async function parseSMSStatusEvent(request: Request, options?: WebhookParseOptions): Promise<SMSStatusEvent> {
  const provider = options?.provider ?? detectProvider(request)
  const handler = new WebhookHandler(provider, options?.credentials)

  if (options?.validateSignature) {
    const isValid = await handler.validateSignature(request)
    if (!isValid) {
      throw new Error('Invalid webhook signature')
    }
  }

  return handler.parseSMSStatus(request)
}

// =============================================================================
// Provider Detection
// =============================================================================

/**
 * Detect the telephony provider from a webhook request
 *
 * Uses headers and request characteristics to identify the provider.
 *
 * @param request - The incoming webhook request
 * @returns Detected provider
 */
export function detectProvider(request: Request): TelephonyProvider {
  const headers = request.headers

  // Twilio uses X-Twilio-Signature
  if (headers.has('X-Twilio-Signature') || headers.has('x-twilio-signature')) {
    return 'Twilio'
  }

  // Telnyx uses telnyx-signature-ed25519
  if (headers.has('telnyx-signature-ed25519') || headers.has('telnyx-timestamp')) {
    return 'Telnyx'
  }

  // Plivo uses X-Plivo-Signature
  if (headers.has('X-Plivo-Signature') || headers.has('x-plivo-signature')) {
    return 'Plivo'
  }

  // Vonage/Nexmo
  if (headers.has('Authorization') && headers.get('User-Agent')?.includes('Vonage')) {
    return 'Vonage'
  }

  // Bandwidth
  if (headers.has('X-Bandwidth-Signature')) {
    return 'Bandwidth'
  }

  // Sinch
  if (headers.has('X-Sinch-Signature')) {
    return 'Sinch'
  }

  // Default to Twilio as reference implementation
  return 'Twilio'
}

// =============================================================================
// Signature Validation Utilities
// =============================================================================

/**
 * Compute HMAC-SHA1 signature (for Twilio)
 *
 * @param data - Data to sign
 * @param key - Secret key
 * @returns Base64-encoded signature
 */
export async function hmacSha1(data: string, key: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(key)
  const dataToSign = encoder.encode(data)

  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataToSign)
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

/**
 * Compute HMAC-SHA256 signature (for Plivo, etc.)
 *
 * @param data - Data to sign
 * @param key - Secret key
 * @returns Base64-encoded signature
 */
export async function hmacSha256(data: string, key: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(key)
  const dataToSign = encoder.encode(data)

  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataToSign)
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

/**
 * Build Twilio signature validation string from request
 *
 * @param url - Full request URL
 * @param params - Form parameters sorted by key
 * @returns String to sign
 */
export function buildTwilioSignatureString(url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort()
  let signatureString = url

  for (const key of sortedKeys) {
    signatureString += key + params[key]
  }

  return signatureString
}

/**
 * Validate Twilio webhook signature
 *
 * @param request - The incoming webhook request
 * @param authToken - Twilio auth token
 * @returns True if signature is valid
 */
export async function validateTwilioSignature(request: Request, authToken: string): Promise<boolean> {
  const signature = request.headers.get('X-Twilio-Signature')
  if (!signature) {
    return false
  }

  const formData = await request.clone().formData()
  const params: Record<string, string> = {}
  formData.forEach((value, key) => {
    params[key] = value.toString()
  })

  const signatureString = buildTwilioSignatureString(request.url, params)
  const expectedSignature = await hmacSha1(signatureString, authToken)

  return signature === expectedSignature
}
