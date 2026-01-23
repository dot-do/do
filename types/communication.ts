/**
 * Communication Types - Email, Messaging, Human-in-the-Loop
 *
 * Email:
 * - Inbound: Cloudflare Email Routing
 * - Outbound: Abstraction over SES and Mailchannels
 *
 * Messaging (Human-in-the-Loop):
 * - Slack
 * - Discord
 * - Microsoft Teams
 *
 * These are "deep integrations" - more tightly coupled than generic integrations
 */

import type { DigitalObjectRef } from './identity'

// =============================================================================
// Email - Inbound (Cloudflare Email Routing)
// =============================================================================

/**
 * Inbound email message (from Cloudflare Email Routing)
 */
export interface InboundEmail {
  id: string
  /** Message ID from headers */
  messageId: string
  /** Envelope from */
  from: string
  /** Envelope to */
  to: string
  /** Subject */
  subject: string
  /** Plain text body */
  text?: string
  /** HTML body */
  html?: string
  /** Headers */
  headers: EmailHeaders
  /** Attachments */
  attachments: EmailAttachment[]
  /** Raw email size in bytes */
  rawSize: number
  /** SPF result */
  spf?: EmailAuthResult
  /** DKIM result */
  dkim?: EmailAuthResult
  /** DMARC result */
  dmarc?: EmailAuthResult
  /** Spam score (0-10) */
  spamScore?: number
  /** Received timestamp */
  receivedAt: number
  /** DO that received this email */
  receiverRef: DigitalObjectRef
}

export interface EmailHeaders {
  from: string
  to: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string
  subject: string
  date?: string
  messageId?: string
  inReplyTo?: string
  references?: string[]
  contentType?: string
  [key: string]: string | string[] | undefined
}

export interface EmailAttachment {
  id: string
  filename: string
  contentType: string
  size: number
  /** Content as base64 (for small attachments) */
  content?: string
  /** R2 key (for large attachments) */
  r2Key?: string
  /** Content ID for inline attachments */
  contentId?: string
  /** Whether this is inline */
  inline: boolean
}

export type EmailAuthResult = 'Pass' | 'Fail' | 'Softfail' | 'Neutral' | 'None' | 'Temperror' | 'Permerror'

/**
 * Email routing action
 */
export type EmailRoutingAction =
  | { type: 'forward'; to: string }
  | { type: 'drop' }
  | { type: 'reject'; message?: string }
  | { type: 'worker'; script: string }
  | { type: 'do'; ref: DigitalObjectRef }

/**
 * Email routing rule
 */
export interface EmailRoutingRule {
  id: string
  /** Priority (lower = higher priority) */
  priority: number
  /** Match conditions */
  match: EmailMatchCondition
  /** Action to take */
  action: EmailRoutingAction
  /** Whether rule is enabled */
  enabled: boolean
  /** Created timestamp */
  createdAt: number
}

export interface EmailMatchCondition {
  /** Match specific address */
  address?: string
  /** Match address pattern (glob) */
  pattern?: string
  /** Match by header */
  header?: { name: string; value: string }
  /** Match all (catch-all) */
  all?: boolean
}

// =============================================================================
// Email - Outbound (SES / Mailchannels Abstraction)
// =============================================================================

/**
 * Outbound email provider
 */
export type EmailProvider = 'SES' | 'Mailchannels' | 'SMTP'

/**
 * Email provider configuration
 */
export interface EmailProviderConfig {
  provider: EmailProvider
  /** SES configuration */
  ses?: {
    region: string
    accessKeyId: string
    secretAccessKey: string
    configurationSet?: string
  }
  /** Mailchannels configuration */
  mailchannels?: {
    apiKey: string
    dkimDomain?: string
    dkimSelector?: string
    dkimPrivateKey?: string
  }
  /** SMTP configuration */
  smtp?: {
    host: string
    port: number
    secure: boolean
    username: string
    password: string
  }
}

/**
 * Outbound email message
 */
export interface OutboundEmail {
  /** From address */
  from: string
  /** From name */
  fromName?: string
  /** To addresses */
  to: string | string[]
  /** CC addresses */
  cc?: string | string[]
  /** BCC addresses */
  bcc?: string | string[]
  /** Reply-to address */
  replyTo?: string
  /** Subject */
  subject: string
  /** Plain text body */
  text?: string
  /** HTML body */
  html?: string
  /** Attachments */
  attachments?: OutboundAttachment[]
  /** Custom headers */
  headers?: Record<string, string>
  /** Tags for tracking */
  tags?: Record<string, string>
  /** Send at (for scheduled sending) */
  sendAt?: number
}

export interface OutboundAttachment {
  filename: string
  content: string | Uint8Array
  contentType?: string
  contentId?: string
}

/**
 * Email send result
 */
export interface EmailSendResult {
  success: boolean
  /** Provider message ID */
  messageId?: string
  /** Error message */
  error?: string
  /** Provider response */
  providerResponse?: unknown
}

/**
 * Email send status (for tracking)
 */
export type EmailSendStatus =
  | 'Queued'
  | 'Sent'
  | 'Delivered'
  | 'Bounced'
  | 'Complained'
  | 'Failed'

/**
 * Email tracking record
 */
export interface EmailTrackingRecord {
  id: string
  /** Provider message ID */
  messageId: string
  /** Recipient */
  to: string
  /** Subject */
  subject: string
  /** Status */
  status: EmailSendStatus
  /** Sent timestamp */
  sentAt: number
  /** Delivered timestamp */
  deliveredAt?: number
  /** Opened timestamp */
  openedAt?: number
  /** Clicked timestamp (any link) */
  clickedAt?: number
  /** Bounce info */
  bounce?: {
    type: 'Hard' | 'Soft'
    reason: string
    timestamp: number
  }
  /** Complaint info */
  complaint?: {
    type: string
    timestamp: number
  }
}

// =============================================================================
// Email Operations Interface
// =============================================================================

/**
 * Email operations for a DO
 */
export interface EmailOperations {
  // Outbound
  send(email: OutboundEmail): Promise<EmailSendResult>
  sendBatch(emails: OutboundEmail[]): Promise<EmailSendResult[]>
  scheduleEmail(email: OutboundEmail, sendAt: number): Promise<string>
  cancelScheduled(scheduleId: string): Promise<boolean>

  // Templates
  sendTemplate(templateId: string, to: string, variables: Record<string, unknown>): Promise<EmailSendResult>

  // Tracking
  getTrackingRecord(messageId: string): Promise<EmailTrackingRecord | null>
  listSentEmails(options?: { limit?: number; offset?: number; status?: EmailSendStatus }): Promise<EmailTrackingRecord[]>

  // Inbound handling
  onInboundEmail(handler: (email: InboundEmail) => Promise<EmailRoutingAction>): void

  // Configuration
  setProvider(config: EmailProviderConfig): Promise<void>
  verifyDomain(domain: string): Promise<{ dkim: string; spf: string; dmarc: string }>
}

// =============================================================================
// Slack Integration (Human-in-the-Loop)
// =============================================================================

/**
 * Slack workspace connection
 */
export interface SlackConnection {
  id: string
  /** Workspace ID */
  teamId: string
  /** Workspace name */
  teamName: string
  /** Bot token (encrypted) */
  botToken: string
  /** Bot user ID */
  botUserId: string
  /** Scopes granted */
  scopes: string[]
  /** Connected timestamp */
  connectedAt: number
  /** Last activity */
  lastActivityAt?: number
}

/**
 * Slack channel for notifications
 */
export interface SlackChannel {
  id: string
  /** Channel ID */
  channelId: string
  /** Channel name */
  name: string
  /** Is private channel */
  isPrivate: boolean
  /** Notification types enabled */
  notifications: SlackNotificationType[]
}

export type SlackNotificationType =
  | 'WorkflowCompleted'
  | 'WorkflowFailed'
  | 'ApprovalRequired'
  | 'Mention'
  | 'Error'
  | 'Custom'

/**
 * Slack message
 */
export interface SlackMessage {
  /** Channel ID */
  channel: string
  /** Message text */
  text: string
  /** Block kit blocks */
  blocks?: SlackBlock[]
  /** Attachments (legacy) */
  attachments?: SlackAttachment[]
  /** Thread timestamp (for replies) */
  threadTs?: string
  /** Unfurl links */
  unfurlLinks?: boolean
  /** Unfurl media */
  unfurlMedia?: boolean
}

export interface SlackBlock {
  type: 'Section' | 'Divider' | 'Header' | 'Context' | 'Actions' | 'Input'
  text?: { type: 'PlainText' | 'Mrkdwn'; text: string }
  elements?: unknown[]
  accessory?: unknown
  [key: string]: unknown
}

export interface SlackAttachment {
  color?: string
  fallback?: string
  pretext?: string
  title?: string
  titleLink?: string
  text?: string
  fields?: Array<{ title: string; value: string; short?: boolean }>
  footer?: string
  ts?: number
}

/**
 * Slack interactive response (from buttons, etc.)
 */
export interface SlackInteraction {
  type: 'BlockActions' | 'MessageActions' | 'ViewSubmission' | 'Shortcut'
  user: { id: string; name: string }
  channel?: { id: string; name: string }
  message?: { ts: string; text: string }
  actions?: Array<{ action_id: string; value: string; type: string }>
  triggerId?: string
  responseUrl?: string
}

// =============================================================================
// Discord Integration (Human-in-the-Loop)
// =============================================================================

/**
 * Discord server connection
 */
export interface DiscordConnection {
  id: string
  /** Guild ID */
  guildId: string
  /** Guild name */
  guildName: string
  /** Bot token (encrypted) */
  botToken: string
  /** Bot user ID */
  botUserId: string
  /** Permissions granted */
  permissions: string
  /** Connected timestamp */
  connectedAt: number
}

/**
 * Discord channel for notifications
 */
export interface DiscordChannel {
  id: string
  /** Channel ID */
  channelId: string
  /** Channel name */
  name: string
  /** Channel type */
  type: 'Text' | 'Voice' | 'Thread' | 'Forum'
  /** Notification types enabled */
  notifications: DiscordNotificationType[]
}

export type DiscordNotificationType =
  | 'WorkflowCompleted'
  | 'WorkflowFailed'
  | 'ApprovalRequired'
  | 'Mention'
  | 'Error'
  | 'Custom'

/**
 * Discord message
 */
export interface DiscordMessage {
  /** Channel ID */
  channelId: string
  /** Message content */
  content?: string
  /** Embeds */
  embeds?: DiscordEmbed[]
  /** Components (buttons, etc.) */
  components?: DiscordComponent[]
  /** Reply to message ID */
  replyTo?: string
}

export interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  color?: number
  fields?: Array<{ name: string; value: string; inline?: boolean }>
  author?: { name: string; url?: string; iconUrl?: string }
  footer?: { text: string; iconUrl?: string }
  thumbnail?: { url: string }
  image?: { url: string }
  timestamp?: string
}

export interface DiscordComponent {
  type: 1 | 2 | 3 | 4 // ActionRow, Button, SelectMenu, TextInput
  components?: DiscordComponent[]
  customId?: string
  label?: string
  style?: number
  url?: string
  disabled?: boolean
  options?: Array<{ label: string; value: string; description?: string }>
}

// =============================================================================
// Microsoft Teams Integration (Human-in-the-Loop)
// =============================================================================

/**
 * Teams connection
 */
export interface TeamsConnection {
  id: string
  /** Tenant ID */
  tenantId: string
  /** Team ID */
  teamId: string
  /** Team name */
  teamName: string
  /** Access token (encrypted) */
  accessToken: string
  /** Refresh token (encrypted) */
  refreshToken: string
  /** Token expiry */
  tokenExpiresAt: number
  /** Connected timestamp */
  connectedAt: number
}

/**
 * Teams channel for notifications
 */
export interface TeamsChannel {
  id: string
  /** Channel ID */
  channelId: string
  /** Channel name */
  name: string
  /** Notification types enabled */
  notifications: TeamsNotificationType[]
}

export type TeamsNotificationType =
  | 'WorkflowCompleted'
  | 'WorkflowFailed'
  | 'ApprovalRequired'
  | 'Mention'
  | 'Error'
  | 'Custom'

/**
 * Teams message (Adaptive Card)
 */
export interface TeamsMessage {
  /** Channel ID */
  channelId: string
  /** Message text (fallback) */
  text?: string
  /** Adaptive Card */
  card?: TeamsAdaptiveCard
  /** Reply to message ID */
  replyTo?: string
}

export interface TeamsAdaptiveCard {
  type: 'AdaptiveCard'
  version: '1.4' | '1.5' | '1.6'
  body: TeamsCardElement[]
  actions?: TeamsCardAction[]
}

export interface TeamsCardElement {
  type: 'TextBlock' | 'Image' | 'Container' | 'ColumnSet' | 'FactSet' | 'ActionSet'
  text?: string
  size?: 'small' | 'default' | 'medium' | 'large' | 'extraLarge'
  weight?: 'lighter' | 'default' | 'bolder'
  color?: 'default' | 'dark' | 'light' | 'accent' | 'good' | 'warning' | 'attention'
  wrap?: boolean
  items?: TeamsCardElement[]
  columns?: Array<{ width: string; items: TeamsCardElement[] }>
  facts?: Array<{ title: string; value: string }>
  [key: string]: unknown
}

export interface TeamsCardAction {
  type: 'Action.Submit' | 'Action.OpenUrl' | 'Action.ShowCard' | 'Action.Execute'
  title: string
  url?: string
  data?: unknown
  card?: TeamsAdaptiveCard
}

// =============================================================================
// Human-in-the-Loop Operations
// =============================================================================

/**
 * Approval request
 */
export interface ApprovalRequest {
  id: string
  /** What needs approval */
  title: string
  /** Detailed description */
  description: string
  /** Context data */
  context: Record<string, unknown>
  /** Requested by (user/agent) */
  requestedBy: string
  /** Approvers (user IDs) */
  approvers: string[]
  /** Channels to notify */
  channels: ApprovalChannel[]
  /** Status */
  status: 'Pending' | 'Approved' | 'Rejected' | 'Expired'
  /** Response */
  response?: {
    decision: 'Approved' | 'Rejected'
    respondedBy: string
    respondedAt: number
    comment?: string
  }
  /** Timeout (when it expires) */
  expiresAt: number
  /** Created timestamp */
  createdAt: number
}

export interface ApprovalChannel {
  type: 'Slack' | 'Discord' | 'Teams' | 'Email'
  channelId: string
  messageId?: string
}

/**
 * Human-in-the-loop operations
 */
export interface HumanInTheLoopOperations {
  // Approval workflow
  requestApproval(request: Omit<ApprovalRequest, 'id' | 'status' | 'createdAt'>): Promise<ApprovalRequest>
  checkApproval(requestId: string): Promise<ApprovalRequest>
  cancelApproval(requestId: string): Promise<boolean>

  // Notifications
  notifySlack(connection: SlackConnection, message: SlackMessage): Promise<{ ts: string }>
  notifyDiscord(connection: DiscordConnection, message: DiscordMessage): Promise<{ id: string }>
  notifyTeams(connection: TeamsConnection, message: TeamsMessage): Promise<{ id: string }>

  // Interactive handling
  onSlackInteraction(handler: (interaction: SlackInteraction) => Promise<unknown>): void
  onDiscordInteraction(handler: (interaction: unknown) => Promise<unknown>): void
  onTeamsInteraction(handler: (interaction: unknown) => Promise<unknown>): void
}
