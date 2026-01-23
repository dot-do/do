/**
 * Communication Context Implementation
 *
 * Provides Email, Slack, and SMS communication through tagged templates.
 * Abstracts over multiple providers for each communication channel.
 *
 * @example
 * ```typescript
 * // Email
 * await $.email`welcome ${user.name} to ${user.email}`
 * await $.email.to(user.email)`Welcome to ${product}!`
 *
 * // Slack
 * await $.slack`#general New feature: ${feature.name}`
 * await $.slack.channel('C12345')`Deployment complete`
 *
 * // SMS
 * await $.sms`${phone} Your order has shipped!`
 * await $.sms.to('+1234567890')`Reminder: ${appointment}`
 * ```
 *
 * @module context/communication
 */

import type {
  EmailContext,
  SlackContext,
  SMSContext,
  TaggedTemplate,
} from '../types/context'
import type { DOEnvironment } from './index'
import { interpolateTemplate } from './proxy'

/**
 * Internal context state
 */
interface ContextState {
  env: DOEnvironment
}

/**
 * Email send result
 */
interface EmailResult {
  messageId: string
}

/**
 * Slack post result
 */
interface SlackResult {
  ts: string
}

/**
 * SMS send result
 */
interface SMSResult {
  messageId: string
}

// =============================================================================
// Email Context
// =============================================================================

/**
 * Parse an email template to extract recipient and content
 *
 * Supported patterns:
 * - `welcome ${name} to ${email}` - name is the subject hint, email is recipient
 * - `${subject} to ${email}` - explicit subject and recipient
 *
 * @param template - Template string
 * @returns Parsed email components
 */
function parseEmailTemplate(template: string): { to?: string; subject?: string; body: string } {
  // Try to extract email address
  const emailMatch = template.match(/[\w.-]+@[\w.-]+\.\w+/)
  const to = emailMatch?.[0]

  // Remove email from body
  const body = to ? template.replace(to, '').replace(/\s+to\s*$/, '').trim() : template

  // Use first part as subject if body is multi-part
  const parts = body.split(/[.!?]\s+/)
  const subject = parts[0]?.slice(0, 100)

  return { to, subject, body }
}

/**
 * Send an email
 *
 * @param state - Context state
 * @param to - Recipient email
 * @param subject - Email subject
 * @param body - Email body
 * @returns Send result
 */
async function sendEmail(
  state: ContextState,
  to: string,
  subject: string,
  body: string
): Promise<EmailResult> {
  // TODO: Implement actual email sending via SES/Mailchannels
  console.log(`[Email] Sending to ${to}: ${subject}`)
  console.log(`[Email] Body: ${body}`)
  return { messageId: `email-${Date.now()}` }
}

/**
 * Create the Email Context
 *
 * @param state - Internal context state
 * @returns EmailContext implementation
 */
export function createEmailContext(state: ContextState): EmailContext {
  /**
   * Main email tagged template function
   * Usage: $.email`welcome ${name} to ${email}`
   */
  const email = (async (strings: TemplateStringsArray, ...values: unknown[]): Promise<EmailResult> => {
    const template = interpolateTemplate(strings, values)
    const { to, subject, body } = parseEmailTemplate(template)

    if (!to) {
      throw new Error('Email recipient not found in template')
    }

    return sendEmail(state, to, subject || 'Message from DO', body)
  }) as EmailContext

  /**
   * Send to specific recipient
   * Usage: $.email.to(email)`Welcome!`
   */
  email.to = (recipientEmail: string): TaggedTemplate<EmailResult> => {
    return ((strings: TemplateStringsArray, ...values: unknown[]): Promise<EmailResult> => {
      const body = interpolateTemplate(strings, values)
      const subject = body.split(/[.!?]\s+/)[0]?.slice(0, 100) || 'Message from DO'
      return sendEmail(state, recipientEmail, subject, body)
    }) as TaggedTemplate<EmailResult>
  }

  /**
   * Send using template
   * Usage: $.email.template('welcome', user.email, { name: user.name })
   */
  email.template = async (
    templateId: string,
    to: string,
    vars: Record<string, unknown>
  ): Promise<EmailResult> => {
    // TODO: Implement template rendering
    console.log(`[Email] Template ${templateId} to ${to}`, vars)
    return { messageId: `email-template-${Date.now()}` }
  }

  return email
}

// =============================================================================
// Slack Context
// =============================================================================

/**
 * Parse a Slack template to extract channel and message
 *
 * Supported patterns:
 * - `#channel message` - Channel by name
 * - `message` - Default channel
 *
 * @param template - Template string
 * @returns Parsed Slack components
 */
function parseSlackTemplate(template: string): { channel?: string; message: string } {
  // Try to extract channel name (starts with #)
  const channelMatch = template.match(/^#(\w+)\s+/)

  if (channelMatch) {
    const channel = channelMatch[1]
    const message = template.slice(channelMatch[0].length)
    return { channel, message }
  }

  return { message: template }
}

/**
 * Post a Slack message
 *
 * @param state - Context state
 * @param channel - Channel ID or name
 * @param message - Message text
 * @returns Post result
 */
async function postSlackMessage(
  state: ContextState,
  channel: string,
  message: string
): Promise<SlackResult> {
  // TODO: Implement actual Slack posting
  console.log(`[Slack] Posting to ${channel}: ${message}`)
  return { ts: `${Date.now()}.000000` }
}

/**
 * Create the Slack Context
 *
 * @param state - Internal context state
 * @returns SlackContext implementation
 */
export function createSlackContext(state: ContextState): SlackContext {
  /**
   * Main Slack tagged template function
   * Usage: $.slack`#general New feature launched!`
   */
  const slack = (async (strings: TemplateStringsArray, ...values: unknown[]): Promise<SlackResult> => {
    const template = interpolateTemplate(strings, values)
    const { channel, message } = parseSlackTemplate(template)

    if (!channel) {
      throw new Error('Slack channel not found in template (use #channel prefix)')
    }

    return postSlackMessage(state, channel, message)
  }) as SlackContext

  /**
   * Post to specific channel
   * Usage: $.slack.channel('C12345')`Deployment complete`
   */
  slack.channel = (channelId: string): TaggedTemplate<SlackResult> => {
    return ((strings: TemplateStringsArray, ...values: unknown[]): Promise<SlackResult> => {
      const message = interpolateTemplate(strings, values)
      return postSlackMessage(state, channelId, message)
    }) as TaggedTemplate<SlackResult>
  }

  return slack
}

// =============================================================================
// SMS Context
// =============================================================================

/**
 * Parse an SMS template to extract phone number and message
 *
 * Supported patterns:
 * - `+1234567890 message` - Phone number first
 * - `message ${phone}` - Phone number in template
 *
 * @param template - Template string
 * @returns Parsed SMS components
 */
function parseSMSTemplate(template: string): { phone?: string; message: string } {
  // Try to extract phone number (E.164 format)
  const phoneMatch = template.match(/\+?\d{10,15}/)

  if (phoneMatch) {
    const phone = phoneMatch[0]
    const message = template.replace(phone, '').trim()
    return { phone, message }
  }

  return { message: template }
}

/**
 * Send an SMS message
 *
 * @param state - Context state
 * @param to - Phone number (E.164)
 * @param message - Message text
 * @returns Send result
 */
async function sendSMS(
  state: ContextState,
  to: string,
  message: string
): Promise<SMSResult> {
  // TODO: Implement actual SMS sending via Twilio/Telnyx
  console.log(`[SMS] Sending to ${to}: ${message}`)
  return { messageId: `sms-${Date.now()}` }
}

/**
 * Create the SMS Context
 *
 * @param state - Internal context state
 * @returns SMSContext implementation
 */
export function createSMSContext(state: ContextState): SMSContext {
  /**
   * Main SMS tagged template function
   * Usage: $.sms`+1234567890 Your order shipped!`
   */
  const sms = (async (strings: TemplateStringsArray, ...values: unknown[]): Promise<SMSResult> => {
    const template = interpolateTemplate(strings, values)
    const { phone, message } = parseSMSTemplate(template)

    if (!phone) {
      throw new Error('Phone number not found in template')
    }

    return sendSMS(state, phone, message)
  }) as SMSContext

  /**
   * Send to specific phone number
   * Usage: $.sms.to('+1234567890')`Your order shipped!`
   */
  sms.to = (phone: string): TaggedTemplate<SMSResult> => {
    return ((strings: TemplateStringsArray, ...values: unknown[]): Promise<SMSResult> => {
      const message = interpolateTemplate(strings, values)
      return sendSMS(state, phone, message)
    }) as TaggedTemplate<SMSResult>
  }

  return sms
}
