/**
 * Human-in-the-Loop (HITL) Module
 *
 * Approval workflows with multi-channel notifications for AI agent oversight.
 *
 * @module communication/hitl
 */

import type {
  ApprovalRequest,
  ApprovalChannel,
  SlackConnection,
  SlackMessage,
  DiscordConnection,
  DiscordMessage,
  HumanInTheLoopOperations,
} from '../../types/communication'

// =============================================================================
// Types
// =============================================================================

/**
 * Storage interface for approval persistence
 */
interface ApprovalStorage {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<boolean>
  list<T>(options?: { prefix?: string }): Promise<Map<string, T>>
  setAlarm(time: number): Promise<void>
  deleteAlarm(): Promise<void>
}

/**
 * Approval request input (without generated fields)
 */
export type ApprovalRequestInput = Omit<ApprovalRequest, 'id' | 'status' | 'createdAt'>

/**
 * Approval response
 */
export interface ApprovalResponse {
  decision: 'approved' | 'rejected'
  respondedBy: string
  comment?: string
}

/**
 * Approval configuration
 */
export interface ApprovalConfig {
  /** Default timeout in milliseconds (default: 24 hours) */
  defaultTimeout?: number
  /** Whether to notify all channels on response (default: true) */
  notifyOnResponse?: boolean
  /** Whether to allow comments with responses (default: true) */
  allowComments?: boolean
  /** Require minimum approvers (default: 1) */
  minApprovers?: number
}

// =============================================================================
// Approval Request Management
// =============================================================================

/**
 * Create an approval request
 *
 * @param storage - Durable Object storage
 * @param request - Approval request input
 * @param config - Optional configuration
 * @returns Created approval request
 *
 * @example
 * ```typescript
 * const approval = await createApprovalRequest(storage, {
 *   title: 'Deploy to Production',
 *   description: 'Release v2.3.1 with new billing features',
 *   context: { version: '2.3.1', changes: 47 },
 *   requestedBy: 'agent-123',
 *   approvers: ['U0123456789', 'U9876543210'],
 *   channels: [
 *     { type: 'slack', channelId: 'C0123456789' },
 *     { type: 'discord', channelId: '123456789012345678' },
 *   ],
 *   expiresAt: Date.now() + 24 * 60 * 60 * 1000,
 * })
 * ```
 */
export async function createApprovalRequest(
  storage: ApprovalStorage,
  request: ApprovalRequestInput,
  config?: ApprovalConfig
): Promise<ApprovalRequest> {
  // TODO: Implement approval creation
  throw new Error('Not implemented')
}

/**
 * Get an approval request by ID
 *
 * @param storage - Durable Object storage
 * @param requestId - Approval request ID
 * @returns Approval request or null
 *
 * @example
 * ```typescript
 * const approval = await getApprovalRequest(storage, 'approval-123')
 * if (approval?.status === 'pending') {
 *   // Still waiting for response
 * }
 * ```
 */
export async function getApprovalRequest(
  storage: ApprovalStorage,
  requestId: string
): Promise<ApprovalRequest | null> {
  // TODO: Implement approval retrieval
  throw new Error('Not implemented')
}

/**
 * List all approval requests
 *
 * @param storage - Durable Object storage
 * @param options - Filter options
 * @returns List of approval requests
 *
 * @example
 * ```typescript
 * const pending = await listApprovalRequests(storage, { status: 'pending' })
 * ```
 */
export async function listApprovalRequests(
  storage: ApprovalStorage,
  options?: {
    status?: ApprovalRequest['status']
    requestedBy?: string
    limit?: number
  }
): Promise<ApprovalRequest[]> {
  // TODO: Implement approval listing
  throw new Error('Not implemented')
}

/**
 * Respond to an approval request
 *
 * @param storage - Durable Object storage
 * @param requestId - Approval request ID
 * @param response - Approval response
 * @returns Updated approval request
 *
 * @example
 * ```typescript
 * const updated = await respondToApproval(storage, 'approval-123', {
 *   decision: 'approved',
 *   respondedBy: 'U0123456789',
 *   comment: 'LGTM, ship it!',
 * })
 * ```
 */
export async function respondToApproval(
  storage: ApprovalStorage,
  requestId: string,
  response: ApprovalResponse
): Promise<ApprovalRequest> {
  // TODO: Implement approval response
  throw new Error('Not implemented')
}

/**
 * Cancel an approval request
 *
 * @param storage - Durable Object storage
 * @param requestId - Approval request ID
 * @returns True if cancelled
 *
 * @example
 * ```typescript
 * await cancelApprovalRequest(storage, 'approval-123')
 * ```
 */
export async function cancelApprovalRequest(
  storage: ApprovalStorage,
  requestId: string
): Promise<boolean> {
  // TODO: Implement approval cancellation
  throw new Error('Not implemented')
}

/**
 * Handle approval expiration (called from DO alarm)
 *
 * @param storage - Durable Object storage
 *
 * @example
 * ```typescript
 * // In Durable Object alarm handler
 * async alarm() {
 *   await handleApprovalExpiration(this.state.storage)
 * }
 * ```
 */
export async function handleApprovalExpiration(storage: ApprovalStorage): Promise<void> {
  // TODO: Implement expiration handling
  throw new Error('Not implemented')
}

// =============================================================================
// Multi-Channel Notifications
// =============================================================================

/**
 * Channel notification sender
 */
interface ChannelSender {
  slack?: {
    connection: SlackConnection
    postMessage: (message: SlackMessage) => Promise<{ ts: string }>
    updateMessage: (channel: string, ts: string, message: Partial<SlackMessage>) => Promise<void>
  }
  discord?: {
    connection: DiscordConnection
    sendMessage: (message: DiscordMessage) => Promise<{ id: string }>
    editMessage: (channelId: string, messageId: string, message: Partial<DiscordMessage>) => Promise<void>
  }
  email?: {
    send: (to: string, subject: string, html: string) => Promise<void>
  }
}

/**
 * Send approval notifications to all channels
 *
 * @param request - Approval request
 * @param sender - Channel senders
 * @returns Channel message IDs
 *
 * @example
 * ```typescript
 * const messageIds = await sendApprovalNotifications(request, {
 *   slack: { connection, postMessage },
 *   discord: { connection, sendMessage },
 * })
 * ```
 */
export async function sendApprovalNotifications(
  request: ApprovalRequest,
  sender: ChannelSender
): Promise<ApprovalChannel[]> {
  // TODO: Implement multi-channel notification sending
  throw new Error('Not implemented')
}

/**
 * Update approval notifications after response
 *
 * @param request - Updated approval request
 * @param sender - Channel senders
 *
 * @example
 * ```typescript
 * await updateApprovalNotifications(approvedRequest, {
 *   slack: { connection, updateMessage },
 *   discord: { connection, editMessage },
 * })
 * ```
 */
export async function updateApprovalNotifications(
  request: ApprovalRequest,
  sender: ChannelSender
): Promise<void> {
  // TODO: Implement notification updates
  throw new Error('Not implemented')
}

// =============================================================================
// Approval Action Handlers
// =============================================================================

/**
 * Parse approval action from Slack interaction
 *
 * @param actionId - Slack action ID
 * @returns Parsed action
 *
 * @example
 * ```typescript
 * const action = parseSlackApprovalAction('approve:approval-123')
 * // { decision: 'approved', approvalId: 'approval-123' }
 * ```
 */
export function parseSlackApprovalAction(
  actionId: string
): { decision: 'approved' | 'rejected'; approvalId: string } | null {
  const match = actionId.match(/^(approve|reject):(.+)$/)
  if (!match) return null

  return {
    decision: match[1] === 'approve' ? 'approved' : 'rejected',
    approvalId: match[2],
  }
}

/**
 * Parse approval action from Discord interaction
 *
 * @param customId - Discord custom ID
 * @returns Parsed action
 */
export function parseDiscordApprovalAction(
  customId: string
): { decision: 'approved' | 'rejected'; approvalId: string } | null {
  return parseSlackApprovalAction(customId) // Same format
}

/**
 * Validate that user is authorized to respond
 *
 * @param request - Approval request
 * @param userId - User attempting to respond
 * @returns True if authorized
 *
 * @example
 * ```typescript
 * if (!isAuthorizedApprover(request, userId)) {
 *   return { error: 'You are not authorized to respond to this request' }
 * }
 * ```
 */
export function isAuthorizedApprover(request: ApprovalRequest, userId: string): boolean {
  // Empty approvers list means anyone can approve
  if (request.approvers.length === 0) return true
  return request.approvers.includes(userId)
}

/**
 * Check if approval request can still be responded to
 *
 * @param request - Approval request
 * @returns True if can respond
 */
export function canRespond(request: ApprovalRequest): boolean {
  if (request.status !== 'Pending') return false
  if (Date.now() > request.expiresAt) return false
  return true
}

// =============================================================================
// Approval Flow Helpers
// =============================================================================

/**
 * Wait for approval with timeout
 *
 * @param storage - Durable Object storage
 * @param requestId - Approval request ID
 * @param options - Wait options
 * @returns Approval request when resolved
 *
 * @example
 * ```typescript
 * const result = await waitForApproval(storage, 'approval-123', {
 *   pollInterval: 5000,
 *   timeout: 60000,
 * })
 *
 * if (result.status === 'approved') {
 *   // Proceed
 * } else {
 *   // Handle rejection or timeout
 * }
 * ```
 */
export async function waitForApproval(
  storage: ApprovalStorage,
  requestId: string,
  options?: {
    pollInterval?: number
    timeout?: number
  }
): Promise<ApprovalRequest> {
  // TODO: Implement polling-based wait
  throw new Error('Not implemented')
}

/**
 * Create approval request and wait for response
 *
 * @param storage - Durable Object storage
 * @param request - Approval request input
 * @param sender - Channel senders
 * @param options - Wait options
 * @returns Final approval request
 *
 * @example
 * ```typescript
 * const result = await requestAndWaitForApproval(
 *   storage,
 *   {
 *     title: 'Delete User Data',
 *     description: 'GDPR deletion request',
 *     approvers: ['admin-1'],
 *     channels: [{ type: 'slack', channelId: 'C-compliance' }],
 *     expiresAt: Date.now() + 72 * 60 * 60 * 1000,
 *   },
 *   { slack: { connection, postMessage } },
 *   { pollInterval: 10000 }
 * )
 * ```
 */
export async function requestAndWaitForApproval(
  storage: ApprovalStorage,
  request: ApprovalRequestInput,
  sender: ChannelSender,
  options?: {
    pollInterval?: number
  }
): Promise<ApprovalRequest> {
  // TODO: Implement combined request and wait
  throw new Error('Not implemented')
}

// =============================================================================
// Audit Trail
// =============================================================================

/**
 * Approval audit log entry
 */
export interface ApprovalAuditEntry {
  id: string
  approvalId: string
  action: 'created' | 'notified' | 'responded' | 'expired' | 'cancelled'
  timestamp: number
  actor?: string
  channel?: ApprovalChannel
  details?: Record<string, unknown>
}

/**
 * Log an audit entry for approval action
 *
 * @param storage - Durable Object storage
 * @param entry - Audit entry
 *
 * @example
 * ```typescript
 * await logApprovalAudit(storage, {
 *   id: generateId(),
 *   approvalId: 'approval-123',
 *   action: 'responded',
 *   timestamp: Date.now(),
 *   actor: 'U0123456789',
 *   details: { decision: 'approved', comment: 'LGTM' },
 * })
 * ```
 */
export async function logApprovalAudit(
  storage: ApprovalStorage,
  entry: Omit<ApprovalAuditEntry, 'id'>
): Promise<void> {
  // TODO: Implement audit logging
  throw new Error('Not implemented')
}

/**
 * Get audit trail for an approval request
 *
 * @param storage - Durable Object storage
 * @param approvalId - Approval request ID
 * @returns Audit entries
 *
 * @example
 * ```typescript
 * const trail = await getApprovalAuditTrail(storage, 'approval-123')
 * // Shows full history: created -> notified -> responded
 * ```
 */
export async function getApprovalAuditTrail(
  storage: ApprovalStorage,
  approvalId: string
): Promise<ApprovalAuditEntry[]> {
  // TODO: Implement audit trail retrieval
  throw new Error('Not implemented')
}

// =============================================================================
// HITL Operations Factory
// =============================================================================

/**
 * Create HITL operations instance for a Digital Object
 *
 * @param storage - Durable Object storage
 * @param sender - Channel senders
 * @param config - Optional configuration
 * @returns HITL operations interface
 *
 * @example
 * ```typescript
 * const hitl = createHITLOperations(
 *   this.state.storage,
 *   {
 *     slack: { connection: slackConn, postMessage, updateMessage },
 *     discord: { connection: discordConn, sendMessage, editMessage },
 *   },
 *   { defaultTimeout: 24 * 60 * 60 * 1000 }
 * )
 *
 * const approval = await hitl.requestApproval({
 *   title: 'Deploy to Production',
 *   description: 'v2.3.1',
 *   approvers: ['admin-1'],
 *   channels: [{ type: 'slack', channelId: 'C-deploys' }],
 *   expiresAt: Date.now() + 3600000,
 * })
 * ```
 */
export function createHITLOperations(
  storage: ApprovalStorage,
  sender: ChannelSender,
  config?: ApprovalConfig
): HumanInTheLoopOperations {
  // TODO: Implement HITL operations
  throw new Error('Not implemented')
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Generate a unique approval ID
 *
 * @returns Unique ID
 */
export function generateApprovalId(): string {
  return `approval-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Format approval status for display
 *
 * @param status - Approval status
 * @returns Formatted status string
 */
export function formatApprovalStatus(status: ApprovalRequest['status']): string {
  const statusMap: Record<ApprovalRequest['status'], string> = {
    Pending: 'Pending',
    Approved: 'Approved',
    Rejected: 'Rejected',
    Expired: 'Expired',
  }
  return statusMap[status]
}

/**
 * Calculate time remaining for approval
 *
 * @param expiresAt - Expiration timestamp
 * @returns Human-readable time remaining
 */
export function formatTimeRemaining(expiresAt: number): string {
  const remaining = expiresAt - Date.now()
  if (remaining <= 0) return 'Expired'

  const hours = Math.floor(remaining / 3600000)
  const minutes = Math.floor((remaining % 3600000) / 60000)

  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return `${days} day${days > 1 ? 's' : ''}`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`
}
