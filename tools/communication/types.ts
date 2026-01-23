/**
 * Communication Provider Types
 *
 * Base provider interfaces for communication channels (email, phone, messaging).
 * Follows the provider pattern from primitives.org.ai.
 *
 * @module communication/types
 */

// =============================================================================
// Base Provider Types
// =============================================================================

/**
 * Provider metadata
 */
export interface ProviderInfo {
  /** Unique provider identifier */
  id: string
  /** Human-readable name */
  name: string
  /** Provider description */
  description: string
  /** Provider category */
  category: ProviderCategory
  /** Website URL */
  website?: string
  /** Documentation URL */
  docsUrl?: string
  /** Required configuration keys */
  requiredConfig: string[]
  /** Optional configuration keys */
  optionalConfig?: string[]
}

/**
 * Provider categories for communication
 */
export type ProviderCategory = 'email' | 'phone' | 'messaging' | 'sms'

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /** API key or token */
  apiKey?: string
  /** API secret */
  apiSecret?: string
  /** Account ID / SID */
  accountId?: string
  /** Auth token */
  authToken?: string
  /** OAuth access token */
  accessToken?: string
  /** OAuth refresh token */
  refreshToken?: string
  /** Base URL override */
  baseUrl?: string
  /** Webhook URL for callbacks */
  webhookUrl?: string
  /** Additional provider-specific config */
  [key: string]: unknown
}

/**
 * Provider health status
 */
export interface ProviderHealth {
  healthy: boolean
  latencyMs?: number
  message?: string
  checkedAt: Date
}

/**
 * Base provider interface - all communication providers implement this
 */
export interface BaseProvider {
  /** Provider metadata */
  readonly info: ProviderInfo

  /** Initialize the provider with config */
  initialize(config: ProviderConfig): Promise<void>

  /** Check provider health/connectivity */
  healthCheck(): Promise<ProviderHealth>

  /** Dispose of provider resources */
  dispose(): Promise<void>
}

// =============================================================================
// Pagination Types
// =============================================================================

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit?: number
  offset?: number
  cursor?: string
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[]
  total?: number
  hasMore: boolean
  nextCursor?: string
}

// =============================================================================
// Email Provider
// =============================================================================

/**
 * Email send options
 */
export interface SendEmailOptions {
  to: string[]
  cc?: string[]
  bcc?: string[]
  from?: string
  replyTo?: string
  subject: string
  text?: string
  html?: string
  attachments?: EmailAttachment[]
  headers?: Record<string, string>
  tags?: string[]
  metadata?: Record<string, string>
  /** Schedule send time */
  sendAt?: Date
  /** Track opens */
  trackOpens?: boolean
  /** Track clicks */
  trackClicks?: boolean
}

/**
 * Email attachment
 */
export interface EmailAttachment {
  filename: string
  content: string | ArrayBuffer
  contentType?: string
  contentId?: string
}

/**
 * Email send result
 */
export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: {
    code: string
    message: string
  }
}

/**
 * Email data
 */
export interface EmailData {
  id: string
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text?: string
  html?: string
  status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed'
  sentAt?: Date
  deliveredAt?: Date
  openedAt?: Date
  clickedAt?: Date
}

/**
 * Email list options
 */
export interface EmailListOptions extends PaginationOptions {
  status?: string
  from?: string
  to?: string
  since?: Date
  until?: Date
}

/**
 * Domain verification
 */
export interface DomainVerification {
  domain: string
  verified: boolean
  dnsRecords: Array<{
    type: 'TXT' | 'CNAME' | 'MX'
    name: string
    value: string
    verified: boolean
  }>
}

/**
 * Email provider interface
 */
export interface EmailProvider extends BaseProvider {
  /** Send an email */
  send(options: SendEmailOptions): Promise<SendEmailResult>

  /** Send multiple emails (batch) */
  sendBatch?(emails: SendEmailOptions[]): Promise<SendEmailResult[]>

  /** Get email by ID */
  get?(messageId: string): Promise<EmailData | null>

  /** List emails */
  list?(options?: EmailListOptions): Promise<PaginatedResult<EmailData>>

  /** Search emails */
  search?(query: string, options?: EmailListOptions): Promise<PaginatedResult<EmailData>>

  /** Verify domain */
  verifyDomain?(domain: string): Promise<DomainVerification>

  /** List verified domains */
  listDomains?(): Promise<Array<{ domain: string; verified: boolean; createdAt: Date }>>
}

// =============================================================================
// Phone Provider
// =============================================================================

/**
 * Call options
 */
export interface CallOptions {
  /** TwiML or webhook URL for call handling */
  url?: string
  /** Inline TwiML/XML */
  twiml?: string
  /** Status callback URL */
  statusCallback?: string
  /** Timeout in seconds */
  timeout?: number
  /** Record the call */
  record?: boolean
  /** Machine detection */
  machineDetection?: 'Enable' | 'DetectMessageEnd'
  /** Custom metadata */
  metadata?: Record<string, unknown>
}

/**
 * Call result
 */
export interface CallResult {
  success: boolean
  callId?: string
  status?: string
  error?: {
    code: string
    message: string
  }
}

/**
 * Call data
 */
export interface CallData {
  id: string
  to: string
  from: string
  status: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer' | 'canceled'
  direction: 'inbound' | 'outbound'
  duration?: number
  startedAt?: Date
  answeredAt?: Date
  endedAt?: Date
  recordingUrl?: string
}

/**
 * Call list options
 */
export interface CallListOptions extends PaginationOptions {
  status?: string
  to?: string
  from?: string
  since?: Date
  until?: Date
}

/**
 * Recording data
 */
export interface RecordingData {
  id: string
  callId: string
  duration: number
  url: string
  status: 'processing' | 'completed' | 'failed'
  createdAt: Date
}

/**
 * Transcription data
 */
export interface TranscriptionData {
  id: string
  recordingId: string
  text: string
  confidence?: number
  status: 'processing' | 'completed' | 'failed'
}

/**
 * Phone provider interface
 */
export interface PhoneProvider extends BaseProvider {
  /** Make outbound call */
  call(to: string, from: string, options?: CallOptions): Promise<CallResult>

  /** Get call status */
  getCall(callId: string): Promise<CallData | null>

  /** List calls */
  listCalls?(options?: CallListOptions): Promise<PaginatedResult<CallData>>

  /** Hangup call */
  hangup?(callId: string): Promise<boolean>

  /** Transfer call */
  transfer?(callId: string, to: string): Promise<boolean>

  /** Play audio */
  playAudio?(callId: string, audioUrl: string): Promise<boolean>

  /** Send DTMF tones */
  sendDtmf?(callId: string, digits: string): Promise<boolean>

  /** Start recording */
  startRecording?(callId: string): Promise<RecordingData>

  /** Stop recording */
  stopRecording?(callId: string, recordingId: string): Promise<boolean>

  /** Get recording */
  getRecording?(recordingId: string): Promise<RecordingData | null>

  /** Transcribe recording */
  transcribe?(recordingId: string): Promise<TranscriptionData>
}

// =============================================================================
// SMS Provider
// =============================================================================

/**
 * Send SMS options
 */
export interface SendSmsOptions {
  to: string
  from?: string
  body: string
  mediaUrls?: string[]
  statusCallback?: string
  metadata?: Record<string, unknown>
}

/**
 * SMS result
 */
export interface SendSmsResult {
  success: boolean
  messageId?: string
  status?: string
  segments?: number
  error?: {
    code: string
    message: string
  }
}

/**
 * SMS data
 */
export interface SmsData {
  id: string
  to: string
  from: string
  body: string
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'undelivered'
  direction: 'inbound' | 'outbound'
  segments?: number
  sentAt?: Date
  deliveredAt?: Date
}

/**
 * SMS list options
 */
export interface SmsListOptions extends PaginationOptions {
  to?: string
  from?: string
  since?: Date
  until?: Date
}

/**
 * SMS provider interface
 */
export interface SmsProvider extends BaseProvider {
  /** Send SMS */
  send(options: SendSmsOptions): Promise<SendSmsResult>

  /** Send MMS with media */
  sendMms?(options: SendSmsOptions & { mediaUrls: string[] }): Promise<SendSmsResult>

  /** Get message status */
  getStatus?(messageId: string): Promise<SmsData | null>

  /** List messages */
  list?(options?: SmsListOptions): Promise<PaginatedResult<SmsData>>
}

// =============================================================================
// Messaging Provider (Slack/Discord/Teams)
// =============================================================================

/**
 * Send message options
 */
export interface SendMessageOptions {
  /** Channel ID or name */
  channel?: string
  /** User ID for DM */
  userId?: string
  /** Thread ID for replies */
  threadId?: string
  /** Message text */
  text: string
  /** Rich blocks/attachments */
  blocks?: unknown[]
  /** Embeds (Discord) */
  embeds?: unknown[]
  /** Components (buttons, etc.) */
  components?: unknown[]
  /** Attachments */
  attachments?: Array<{
    filename: string
    content: string | ArrayBuffer
    contentType?: string
  }>
  /** Metadata */
  metadata?: Record<string, unknown>
}

/**
 * Send message result
 */
export interface SendMessageResult {
  success: boolean
  messageId?: string
  timestamp?: string
  channel?: string
  error?: {
    code: string
    message: string
  }
}

/**
 * Message data
 */
export interface MessageData {
  id: string
  channel: string
  userId: string
  text: string
  timestamp: string
  threadId?: string
  replyCount?: number
  reactions?: Array<{ emoji: string; count: number; users: string[] }>
  edited?: boolean
  editedAt?: Date
}

/**
 * Message list options
 */
export interface MessageListOptions extends PaginationOptions {
  since?: Date
  until?: Date
  inclusive?: boolean
}

/**
 * Channel data
 */
export interface ChannelData {
  id: string
  name: string
  topic?: string
  description?: string
  isPrivate: boolean
  isArchived: boolean
  memberCount: number
  createdAt: Date
}

/**
 * Member data
 */
export interface MemberData {
  id: string
  username: string
  displayName: string
  email?: string
  avatar?: string
  isAdmin: boolean
  isBot: boolean
  timezone?: string
}

/**
 * Messaging provider interface
 */
export interface MessagingProvider extends BaseProvider {
  /** Send a message */
  send(options: SendMessageOptions): Promise<SendMessageResult>

  /** Edit a message */
  edit?(messageId: string, channel: string, text: string, blocks?: unknown[]): Promise<SendMessageResult>

  /** Delete a message */
  delete?(messageId: string, channel: string): Promise<boolean>

  /** React to a message */
  react?(messageId: string, channel: string, emoji: string): Promise<boolean>

  /** Remove reaction */
  unreact?(messageId: string, channel: string, emoji: string): Promise<boolean>

  /** Get message */
  getMessage?(messageId: string, channel: string): Promise<MessageData | null>

  /** List messages in channel */
  listMessages?(channel: string, options?: MessageListOptions): Promise<PaginatedResult<MessageData>>

  /** List channels */
  listChannels?(options?: PaginationOptions): Promise<PaginatedResult<ChannelData>>

  /** Get channel */
  getChannel?(channelId: string): Promise<ChannelData | null>

  /** List members */
  listMembers?(options?: PaginationOptions): Promise<PaginatedResult<MemberData>>

  /** Get member */
  getMember?(userId: string): Promise<MemberData | null>
}

// =============================================================================
// Provider Factory Types
// =============================================================================

/**
 * Provider factory function
 */
export type ProviderFactory<T extends BaseProvider> = (config: ProviderConfig) => Promise<T>

/**
 * Registered provider entry
 */
export interface RegisteredProvider<T extends BaseProvider = BaseProvider> {
  info: ProviderInfo
  factory: ProviderFactory<T>
}
