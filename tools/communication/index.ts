/**
 * Communication Module
 *
 * Communication channels and transports for Digital Objects.
 * Unified abstraction over email, phone, SMS, and messaging platforms.
 *
 * @module communication
 *
 * @example
 * ```typescript
 * import {
 *   createEmailProvider,
 *   createPhoneProvider,
 *   createMessagingProvider,
 *   sendEmail,
 *   blocks,
 *   embeds,
 * } from 'do/communication'
 *
 * // Create providers
 * const email = await createEmailProvider('ses', { ... })
 * const phone = await createPhoneProvider('telnyx', { ... })
 * const slack = await createMessagingProvider('slack', { ... })
 *
 * // Send email
 * await email.send({
 *   to: ['user@example.com'],
 *   subject: 'Hello',
 *   text: 'World',
 * })
 *
 * // Make a call
 * await phone.call('+14155551234', '+14155559876', {
 *   twiml: '<Response><Say>Hello!</Say></Response>',
 * })
 *
 * // Send Slack message with blocks
 * await slack.send({
 *   channel: '#general',
 *   text: 'Hello!',
 *   blocks: [blocks.section('*Hello*, world!')],
 * })
 * ```
 */

// =============================================================================
// Provider Types
// =============================================================================

export type {
  // Base types
  ProviderInfo,
  ProviderCategory,
  ProviderConfig,
  ProviderHealth,
  BaseProvider,
  PaginationOptions,
  PaginatedResult,

  // Email types
  SendEmailOptions,
  SendEmailResult,
  EmailData,
  EmailListOptions,
  EmailAttachment,
  DomainVerification,
  EmailProvider,

  // Phone types
  CallOptions,
  CallResult,
  CallData,
  CallListOptions,
  RecordingData,
  TranscriptionData,
  PhoneProvider,

  // SMS types
  SendSmsOptions,
  SendSmsResult,
  SmsData,
  SmsListOptions,
  SmsProvider,

  // Messaging types
  SendMessageOptions,
  SendMessageResult,
  MessageData,
  MessageListOptions,
  ChannelData,
  MemberData,
  MessagingProvider,

  // Registry types
  ProviderFactory,
  RegisteredProvider,
} from './types'

// =============================================================================
// Provider Registry
// =============================================================================

export {
  // Global registry functions
  registerProvider,
  getProvider,
  listProviders,
  hasProvider,
  createProvider,

  // Typed provider creation
  createEmailProvider,
  createPhoneProvider,
  createSmsProvider,
  createMessagingProvider,

  // Class-based registry
  ProviderRegistry,

  // Failover support
  createWithFailover,
} from './registry'

// =============================================================================
// Email
// =============================================================================

export {
  // Sender creation
  createSESSender,
  createMailchannelsSender,
  createSMTPSender,
  createEmailSender,

  // Inbound handling
  parseInboundEmail,
  routeInboundEmail,
  matchesCondition,
  validateEmailAuth,

  // Outbound
  sendEmail,
  sendEmailBatch,
  scheduleEmail,
  cancelScheduledEmail,

  // Tracking
  createTrackingRecord,
  getTrackingRecord,
  updateTrackingStatus,
  listSentEmails,

  // Validation
  isValidEmail,
  normalizeEmail,
  extractDomain,

  // Operations factory
  createEmailOperations,

  // Webhooks
  handleSESWebhook,
  handleMailchannelsWebhook,

  // Domain verification
  generateDNSRecords,
  verifyDomain,
} from './email'

// =============================================================================
// Slack
// =============================================================================

export {
  // Connection
  createSlackConnection,
  verifyConnection as verifySlackConnection,
  revokeConnection as revokeSlackConnection,

  // Messaging
  postMessage as postSlackMessage,
  updateMessage as updateSlackMessage,
  deleteMessage as deleteSlackMessage,
  replyInThread,
  postEphemeral,

  // Block Kit builders
  blocks,

  // Approval builders
  createApprovalBlocks,
  createApprovalResponseBlocks,

  // Interactions
  verifySlackRequest,
  parseInteraction as parseSlackInteraction,
  respondToInteraction as respondToSlackInteraction,
  createInteractionHandler as createSlackInteractionHandler,

  // Channel management
  listChannels as listSlackChannels,
  getChannel as getSlackChannel,
  joinChannel as joinSlackChannel,

  // User management
  getUser as getSlackUser,
  getUserByEmail as getSlackUserByEmail,

  // Notifications
  sendNotification as sendSlackNotification,

  // Client factory
  createSlackClient,
} from './slack'

// =============================================================================
// Discord
// =============================================================================

export {
  // Connection
  createDiscordConnection,
  verifyConnection as verifyDiscordConnection,
  getBotInfo,

  // Messaging
  sendMessage as sendDiscordMessage,
  editMessage as editDiscordMessage,
  deleteMessage as deleteDiscordMessage,
  replyToMessage,
  addReaction,

  // Embed builders
  embeds,

  // Component builders
  components,

  // Approval builders
  createApprovalMessage,
  createApprovalResponseEmbed,

  // Interactions
  verifyDiscordRequest,
  parseInteraction as parseDiscordInteraction,
  respondToInteraction as respondToDiscordInteraction,
  deferResponse,
  editOriginalResponse,
  createInteractionHandler as createDiscordInteractionHandler,

  // Channel management
  listChannels as listDiscordChannels,
  getChannel as getDiscordChannel,
  createChannel as createDiscordChannel,
  createThread,

  // Notifications
  sendNotification as sendDiscordNotification,

  // Client factory
  createDiscordClient,
} from './discord'

// =============================================================================
// Human-in-the-Loop
// =============================================================================

export {
  createApprovalRequest,
  getApproval,
  respondToApproval,
  cancelApproval,
  listApprovals,
  createMultiChannelNotifier,
  notifyChannels,
  type ApprovalRequestOptions,
  type ApprovalResponse,
  type MultiChannelNotifier,
  type NotificationChannel,
} from './hitl'

// =============================================================================
// Templates
// =============================================================================

export {
  createTemplate,
  renderTemplate,
  compileTemplate,
  validateTemplate,
  type TemplateDefinition,
  type CompiledTemplate,
  type TemplateVariables,
} from './templates'

// =============================================================================
// Re-export Types from types/communication.ts
// =============================================================================

export type {
  // Email types
  InboundEmail,
  OutboundEmail,
  EmailSendResult as LegacyEmailSendResult,
  EmailTrackingRecord,
  EmailSendStatus,
  EmailProviderConfig,
  EmailRoutingAction,
  EmailRoutingRule,
  EmailMatchCondition,
  EmailHeaders,
  EmailAttachment as LegacyEmailAttachment,
  EmailAuthResult,
  OutboundAttachment,
  EmailOperations,

  // Slack types
  SlackConnection,
  SlackChannel,
  SlackMessage,
  SlackBlock,
  SlackAttachment,
  SlackInteraction,
  SlackNotificationType,

  // Discord types
  DiscordConnection,
  DiscordChannel,
  DiscordMessage,
  DiscordEmbed,
  DiscordComponent,
  DiscordNotificationType,

  // Approval types
  ApprovalRequest,
  ApprovalStatus,
  ApprovalChannel,
  ApprovalRecord,
  NotificationPreferences,

  // Template types
  MessageTemplate,
  TemplateChannel,
  TemplateType,
} from '../../types/communication'
