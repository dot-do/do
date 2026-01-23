/**
 * Message Templates Module
 *
 * Reusable message templates for consistent multi-channel communication.
 *
 * @module communication/templates
 */

import type {
  SlackMessage,
  SlackBlock,
  DiscordMessage,
  DiscordEmbed,
  OutboundEmail,
} from '../../types/communication'

// =============================================================================
// Types
// =============================================================================

/**
 * Supported template channels
 */
export type TemplateChannel = 'slack' | 'discord' | 'email'

/**
 * Template variable definition
 */
export interface TemplateVariable {
  /** Variable name */
  name: string
  /** Description */
  description?: string
  /** Whether variable is required */
  required?: boolean
  /** Default value */
  defaultValue?: unknown
  /** Type hint */
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object'
}

/**
 * Slack template definition
 */
export interface SlackTemplate {
  /** Fallback text */
  text: string
  /** Block Kit blocks (can include {{variables}}) */
  blocks?: SlackBlock[]
}

/**
 * Discord template definition
 */
export interface DiscordTemplate {
  /** Message content */
  content?: string
  /** Embeds */
  embeds?: DiscordEmbed[]
}

/**
 * Email template definition
 */
export interface EmailTemplate {
  /** Subject line */
  subject: string
  /** Plain text body */
  text?: string
  /** HTML body */
  html?: string
}

/**
 * Message template definition
 */
export interface MessageTemplate {
  /** Unique template ID */
  id: string
  /** Human-readable name */
  name: string
  /** Description */
  description?: string
  /** Supported channels */
  channels: TemplateChannel[]
  /** Variable definitions */
  variables: TemplateVariable[]
  /** Slack template */
  slack?: SlackTemplate
  /** Discord template */
  discord?: DiscordTemplate
  /** Email template */
  email?: EmailTemplate
  /** Created timestamp */
  createdAt?: number
  /** Updated timestamp */
  updatedAt?: number
}

/**
 * Rendered message for a specific channel
 */
export type RenderedMessage<T extends TemplateChannel> = T extends 'slack'
  ? SlackMessage
  : T extends 'discord'
  ? DiscordMessage
  : T extends 'email'
  ? OutboundEmail
  : never

// =============================================================================
// Template Creation
// =============================================================================

/**
 * Create a message template
 *
 * @param template - Template definition
 * @returns Created template
 *
 * @example
 * ```typescript
 * const deployTemplate = createTemplate({
 *   id: 'deployment-notification',
 *   name: 'Deployment Notification',
 *   channels: ['slack', 'discord', 'email'],
 *   variables: [
 *     { name: 'version', required: true },
 *     { name: 'environment', required: true },
 *     { name: 'changes', type: 'number' },
 *     { name: 'author' },
 *   ],
 *   slack: {
 *     text: 'Deployed {{version}} to {{environment}}',
 *     blocks: [
 *       { type: 'header', text: { type: 'plain_text', text: 'Deployment Complete' } },
 *       { type: 'section', text: { type: 'mrkdwn', text: '*Version:* {{version}}\n*Environment:* {{environment}}\n*Changes:* {{changes}}\n*Author:* {{author}}' } },
 *     ],
 *   },
 *   discord: {
 *     embeds: [{
 *       title: 'Deployment Complete',
 *       description: 'Deployed {{version}} to {{environment}}',
 *       color: 0x00FF00,
 *       fields: [
 *         { name: 'Version', value: '{{version}}', inline: true },
 *         { name: 'Environment', value: '{{environment}}', inline: true },
 *         { name: 'Changes', value: '{{changes}}', inline: true },
 *       ],
 *     }],
 *   },
 *   email: {
 *     subject: 'Deployed {{version}} to {{environment}}',
 *     html: '<h1>Deployment Complete</h1><p>Version {{version}} has been deployed to {{environment}}.</p>',
 *   },
 * })
 * ```
 */
export function createTemplate(template: Omit<MessageTemplate, 'createdAt' | 'updatedAt'>): MessageTemplate {
  return {
    ...template,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/**
 * Validate template definition
 *
 * @param template - Template to validate
 * @returns Validation errors (empty if valid)
 *
 * @example
 * ```typescript
 * const errors = validateTemplate(template)
 * if (errors.length > 0) {
 *   console.error('Template errors:', errors)
 * }
 * ```
 */
export function validateTemplate(template: MessageTemplate): string[] {
  const errors: string[] = []

  if (!template.id) {
    errors.push('Template ID is required')
  }

  if (!template.name) {
    errors.push('Template name is required')
  }

  if (!template.channels || template.channels.length === 0) {
    errors.push('At least one channel must be specified')
  }

  for (const channel of template.channels) {
    if (!template[channel]) {
      errors.push(`Template for channel "${channel}" is required`)
    }
  }

  return errors
}

// =============================================================================
// Template Rendering
// =============================================================================

/**
 * Render a template for a specific channel
 *
 * @param template - Message template
 * @param channel - Target channel
 * @param variables - Variable values
 * @returns Rendered message
 *
 * @example
 * ```typescript
 * const slackMessage = renderTemplate(deployTemplate, 'slack', {
 *   version: '2.3.1',
 *   environment: 'production',
 *   changes: 47,
 *   author: 'alice',
 * })
 *
 * await postMessage(connection, {
 *   channel: 'C0123456789',
 *   ...slackMessage,
 * })
 * ```
 */
export function renderTemplate<T extends TemplateChannel>(
  template: MessageTemplate,
  channel: T,
  variables: Record<string, unknown>
): RenderedMessage<T> {
  // TODO: Implement template rendering
  throw new Error('Not implemented')
}

/**
 * Render all channels of a template
 *
 * @param template - Message template
 * @param variables - Variable values
 * @returns Rendered messages for all channels
 *
 * @example
 * ```typescript
 * const messages = renderAllChannels(deployTemplate, {
 *   version: '2.3.1',
 *   environment: 'production',
 * })
 *
 * // messages.slack, messages.discord, messages.email
 * ```
 */
export function renderAllChannels(
  template: MessageTemplate,
  variables: Record<string, unknown>
): Partial<Record<TemplateChannel, unknown>> {
  const result: Partial<Record<TemplateChannel, unknown>> = {}

  for (const channel of template.channels) {
    result[channel] = renderTemplate(template, channel, variables)
  }

  return result
}

// =============================================================================
// Variable Interpolation
// =============================================================================

/**
 * Interpolate variables in a string
 *
 * @param text - Text with {{variable}} placeholders
 * @param variables - Variable values
 * @returns Interpolated string
 *
 * @example
 * ```typescript
 * const result = interpolate('Hello, {{name}}!', { name: 'World' })
 * // 'Hello, World!'
 * ```
 */
export function interpolate(text: string, variables: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = variables[key]
    if (value === undefined || value === null) return ''
    return String(value)
  })
}

/**
 * Deep interpolate variables in an object
 *
 * @param obj - Object with {{variable}} placeholders
 * @param variables - Variable values
 * @returns Interpolated object
 */
export function deepInterpolate<T>(obj: T, variables: Record<string, unknown>): T {
  if (typeof obj === 'string') {
    return interpolate(obj, variables) as T
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepInterpolate(item, variables)) as T
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepInterpolate(value, variables)
    }
    return result as T
  }

  return obj
}

/**
 * Extract variable names from template text
 *
 * @param text - Text with {{variable}} placeholders
 * @returns Array of variable names
 *
 * @example
 * ```typescript
 * const vars = extractVariables('Hello, {{name}}! You have {{count}} messages.')
 * // ['name', 'count']
 * ```
 */
export function extractVariables(text: string): string[] {
  const matches = text.matchAll(/\{\{(\w+)\}\}/g)
  const variables = new Set<string>()

  for (const match of matches) {
    variables.add(match[1])
  }

  return Array.from(variables)
}

/**
 * Validate that all required variables are provided
 *
 * @param template - Message template
 * @param variables - Provided variables
 * @returns Missing required variables
 */
export function getMissingVariables(
  template: MessageTemplate,
  variables: Record<string, unknown>
): string[] {
  return template.variables
    .filter((v) => v.required && !(v.name in variables))
    .map((v) => v.name)
}

// =============================================================================
// Built-in Templates
// =============================================================================

/**
 * Built-in approval request template
 */
export const approvalRequestTemplate = createTemplate({
  id: 'builtin:approval-request',
  name: 'Approval Request',
  description: 'Request human approval for an action',
  channels: ['slack', 'discord', 'email'],
  variables: [
    { name: 'title', required: true, description: 'Approval title' },
    { name: 'description', required: true, description: 'Detailed description' },
    { name: 'approvalId', required: true, description: 'Unique approval ID' },
    { name: 'requestedBy', description: 'Who requested the approval' },
    { name: 'expiresIn', description: 'Time until expiration' },
  ],
  slack: {
    text: 'Approval requested: {{title}}',
    blocks: [
      { type: 'Header', text: { type: 'PlainText', text: '{{title}}' } },
      { type: 'Section', text: { type: 'Mrkdwn', text: '{{description}}' } },
      { type: 'Context', elements: [{ type: 'mrkdwn', text: 'Requested by {{requestedBy}} | Expires in {{expiresIn}}' }] },
      { type: 'Divider' },
      { type: 'Actions', elements: [] }, // Buttons added dynamically
    ],
  },
  discord: {
    embeds: [{
      title: '{{title}}',
      description: '{{description}}',
      color: 0xFFFF00,
      fields: [
        { name: 'Requested By', value: '{{requestedBy}}', inline: true },
        { name: 'Expires In', value: '{{expiresIn}}', inline: true },
      ],
    }],
  },
  email: {
    subject: 'Approval Required: {{title}}',
    html: `
      <h1>{{title}}</h1>
      <p>{{description}}</p>
      <p><strong>Requested by:</strong> {{requestedBy}}</p>
      <p><strong>Expires in:</strong> {{expiresIn}}</p>
      <p>Please respond to this approval request.</p>
    `,
  },
})

/**
 * Built-in workflow completed template
 */
export const workflowCompletedTemplate = createTemplate({
  id: 'builtin:workflow-completed',
  name: 'Workflow Completed',
  description: 'Notification when a workflow completes successfully',
  channels: ['slack', 'discord', 'email'],
  variables: [
    { name: 'workflowName', required: true, description: 'Name of the workflow' },
    { name: 'duration', description: 'How long the workflow took' },
    { name: 'result', description: 'Workflow result summary' },
  ],
  slack: {
    text: 'Workflow "{{workflowName}}" completed',
    blocks: [
      { type: 'Header', text: { type: 'PlainText', text: 'Workflow Completed' } },
      { type: 'Section', text: { type: 'Mrkdwn', text: '*{{workflowName}}* finished successfully.\n\n*Duration:* {{duration}}\n*Result:* {{result}}' } },
    ],
  },
  discord: {
    embeds: [{
      title: 'Workflow Completed',
      description: '**{{workflowName}}** finished successfully.',
      color: 0x00FF00,
      fields: [
        { name: 'Duration', value: '{{duration}}', inline: true },
        { name: 'Result', value: '{{result}}', inline: true },
      ],
    }],
  },
  email: {
    subject: 'Workflow Completed: {{workflowName}}',
    html: `
      <h1>Workflow Completed</h1>
      <p><strong>{{workflowName}}</strong> finished successfully.</p>
      <p><strong>Duration:</strong> {{duration}}</p>
      <p><strong>Result:</strong> {{result}}</p>
    `,
  },
})

/**
 * Built-in error notification template
 */
export const errorNotificationTemplate = createTemplate({
  id: 'builtin:error-notification',
  name: 'Error Notification',
  description: 'Notification when an error occurs',
  channels: ['slack', 'discord', 'email'],
  variables: [
    { name: 'errorType', required: true, description: 'Type of error' },
    { name: 'message', required: true, description: 'Error message' },
    { name: 'source', description: 'Where the error occurred' },
    { name: 'timestamp', description: 'When the error occurred' },
  ],
  slack: {
    text: 'Error: {{errorType}}',
    blocks: [
      { type: 'Header', text: { type: 'PlainText', text: 'Error: {{errorType}}' } },
      { type: 'Section', text: { type: 'Mrkdwn', text: '```{{message}}```' } },
      { type: 'Context', elements: [{ type: 'mrkdwn', text: 'Source: {{source}} | Time: {{timestamp}}' }] },
    ],
  },
  discord: {
    embeds: [{
      title: 'Error: {{errorType}}',
      description: '```{{message}}```',
      color: 0xFF0000,
      fields: [
        { name: 'Source', value: '{{source}}', inline: true },
        { name: 'Time', value: '{{timestamp}}', inline: true },
      ],
    }],
  },
  email: {
    subject: 'Error Alert: {{errorType}}',
    html: `
      <h1 style="color: red;">Error: {{errorType}}</h1>
      <pre style="background: #f5f5f5; padding: 10px;">{{message}}</pre>
      <p><strong>Source:</strong> {{source}}</p>
      <p><strong>Time:</strong> {{timestamp}}</p>
    `,
  },
})

// =============================================================================
// Template Storage
// =============================================================================

/**
 * Template storage interface
 */
interface TemplateStorage {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<boolean>
  list<T>(options?: { prefix?: string }): Promise<Map<string, T>>
}

/**
 * Save a template to storage
 *
 * @param storage - Storage interface
 * @param template - Template to save
 */
export async function saveTemplate(
  storage: TemplateStorage,
  template: MessageTemplate
): Promise<void> {
  await storage.put(`template:${template.id}`, {
    ...template,
    updatedAt: Date.now(),
  })
}

/**
 * Load a template from storage
 *
 * @param storage - Storage interface
 * @param templateId - Template ID
 * @returns Template or null
 */
export async function loadTemplate(
  storage: TemplateStorage,
  templateId: string
): Promise<MessageTemplate | null> {
  const template = await storage.get<MessageTemplate>(`template:${templateId}`)
  return template || null
}

/**
 * List all templates
 *
 * @param storage - Storage interface
 * @returns Array of templates
 */
export async function listTemplates(storage: TemplateStorage): Promise<MessageTemplate[]> {
  const entries = await storage.list<MessageTemplate>({ prefix: 'template:' })
  return Array.from(entries.values())
}

/**
 * Delete a template
 *
 * @param storage - Storage interface
 * @param templateId - Template ID
 * @returns True if deleted
 */
export async function deleteTemplate(
  storage: TemplateStorage,
  templateId: string
): Promise<boolean> {
  return storage.delete(`template:${templateId}`)
}

// =============================================================================
// Template Registry
// =============================================================================

/**
 * Template registry for managing templates in memory
 */
export class TemplateRegistry {
  private templates = new Map<string, MessageTemplate>()

  constructor() {
    // Register built-in templates
    this.register(approvalRequestTemplate)
    this.register(workflowCompletedTemplate)
    this.register(errorNotificationTemplate)
  }

  /**
   * Register a template
   */
  register(template: MessageTemplate): void {
    this.templates.set(template.id, template)
  }

  /**
   * Get a template by ID
   */
  get(templateId: string): MessageTemplate | undefined {
    return this.templates.get(templateId)
  }

  /**
   * List all registered templates
   */
  list(): MessageTemplate[] {
    return Array.from(this.templates.values())
  }

  /**
   * Render a template
   */
  render<T extends TemplateChannel>(
    templateId: string,
    channel: T,
    variables: Record<string, unknown>
  ): RenderedMessage<T> {
    const template = this.get(templateId)
    if (!template) {
      throw new Error(`Template not found: ${templateId}`)
    }
    return renderTemplate(template, channel, variables)
  }
}

/**
 * Default template registry instance
 */
export const templateRegistry = new TemplateRegistry()
