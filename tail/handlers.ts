/**
 * Event Type Handlers
 *
 * Processes DOObservabilityEvents by type, providing:
 * - Console logging for development
 * - Event enrichment and transformation
 * - Routing to appropriate processors
 */

import type {
  DOObservabilityEvent,
  DOLifecycleCreatedEvent,
  DOLifecycleHibernatedEvent,
  DOLifecycleAwakenedEvent,
  DOLifecycleDeletedEvent,
  RPCRequestReceivedEvent,
  RPCResponseSentEvent,
  RPCRequestFailedEvent,
  CDCEventEmittedEvent,
  CDCBufferFlushedEvent,
  CDCStreamUpdatedEvent,
  AIGenerationStartedEvent,
  AIGenerationCompletedEvent,
  AIGenerationFailedEvent,
  AIEmbeddingCreatedEvent,
  WorkflowExecutionStartedEvent,
  WorkflowExecutionCompletedEvent,
  WorkflowExecutionFailedEvent,
  WorkflowStepCompletedEvent,
  WorkflowStepFailedEvent,
  WorkflowStateChangedEvent,
  AgentSessionStartedEvent,
  AgentSessionEndedEvent,
  AgentMessageReceivedEvent,
  AgentToolCalledEvent,
  ExecutionCodeStartedEvent,
  ExecutionCodeCompletedEvent,
  ExecutionCodeFailedEvent,
  StorageSnapshotCreatedEvent,
  StorageSyncCompletedEvent,
  ConnectionWebSocketOpenedEvent,
  ConnectionWebSocketClosedEvent,
  ConnectionWebSocketHibernatedEvent,
  ScheduleAlarmFiredEvent,
  ScheduleTaskExecutedEvent,
  FinancialPaymentCompletedEvent,
  FinancialTransferCompletedEvent,
  CommunicationEmailSentEvent,
  CommunicationSlackPostedEvent,
  CommunicationSMSSentEvent,
  TelephonyCallStartedEvent,
  TelephonyCallEndedEvent,
} from '../types/observability'

// =============================================================================
// Handler Context
// =============================================================================

export interface HandlerContext {
  /** Log level for console output */
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  /** Whether analytics forwarding is enabled */
  analyticsEnabled: boolean
  /** Environment (development, staging, production) */
  environment: string
}

// =============================================================================
// Logging Utilities
// =============================================================================

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }

function shouldLog(level: keyof typeof LOG_LEVELS, ctx: HandlerContext): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[ctx.logLevel]
}

function formatEvent(event: DOObservabilityEvent): string {
  const parts = [`[${event.type}]`]

  // Add relevant payload fields based on event type
  const payload = event.payload as Record<string, unknown>
  if (payload.id) parts.push(`id=${payload.id}`)
  if (payload.duration) parts.push(`duration=${payload.duration}ms`)
  if (payload.success !== undefined) parts.push(`success=${payload.success}`)
  if (payload.error) parts.push(`error="${payload.error}"`)

  return parts.join(' ')
}

function logEvent(event: DOObservabilityEvent, ctx: HandlerContext): void {
  const message = formatEvent(event)

  // Determine log level based on event type
  if (event.type.includes('.failed') || event.type.includes('Exception')) {
    if (shouldLog('error', ctx)) console.error(message)
  } else if (event.type.includes('.completed') || event.type.includes('.ended')) {
    if (shouldLog('info', ctx)) console.info(message)
  } else {
    if (shouldLog('debug', ctx)) console.debug(message)
  }
}

// =============================================================================
// DO Lifecycle Handlers
// =============================================================================

export function handleDOLifecycleCreated(
  event: DOLifecycleCreatedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('info', ctx)) {
    console.info(`  DO created: ${event.payload.doType} id=${event.payload.id}`)
  }
}

export function handleDOLifecycleHibernated(
  event: DOLifecycleHibernatedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('debug', ctx)) {
    console.debug(`  Hibernated after ${event.payload.uptime}ms, ${event.payload.connectionCount} connections`)
  }
}

export function handleDOLifecycleAwakened(
  event: DOLifecycleAwakenedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('debug', ctx)) {
    console.debug(`  Awakened by ${event.payload.trigger}, hibernated for ${event.payload.hibernationDuration}ms`)
  }
}

export function handleDOLifecycleDeleted(
  event: DOLifecycleDeletedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('info', ctx)) {
    console.info(`  DO deleted${event.payload.reason ? `: ${event.payload.reason}` : ''}`)
  }
}

// =============================================================================
// RPC Handlers
// =============================================================================

export function handleRPCRequestReceived(
  event: RPCRequestReceivedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('debug', ctx)) {
    console.debug(`  RPC: ${event.payload.method} id=${event.payload.id}`)
  }
}

export function handleRPCResponseSent(
  event: RPCResponseSentEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('info', ctx)) {
    console.info(`  RPC completed: ${event.payload.method} in ${event.payload.duration}ms`)
  }
}

export function handleRPCRequestFailed(
  event: RPCRequestFailedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  console.error(`  RPC failed: ${event.payload.method} code=${event.payload.code} ${event.payload.message}`)
}

// =============================================================================
// CDC Handlers
// =============================================================================

export function handleCDCEventEmitted(
  event: CDCEventEmittedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
}

export function handleCDCBufferFlushed(
  event: CDCBufferFlushedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('debug', ctx)) {
    console.debug(`  CDC flushed ${event.payload.count} events (${event.payload.bytes} bytes) to ${event.payload.destination}`)
  }
}

export function handleCDCStreamUpdated(
  event: CDCStreamUpdatedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
}

// =============================================================================
// AI Handlers
// =============================================================================

export function handleAIGenerationStarted(
  event: AIGenerationStartedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('debug', ctx)) {
    console.debug(`  AI generation started: ${event.payload.model} (${event.payload.provider})`)
  }
}

export function handleAIGenerationCompleted(
  event: AIGenerationCompletedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('info', ctx)) {
    const { model, duration, inputTokens, outputTokens, finishReason } = event.payload
    console.info(`  AI completed: ${model} ${inputTokens}+${outputTokens} tokens in ${duration}ms (${finishReason})`)
  }
}

export function handleAIGenerationFailed(
  event: AIGenerationFailedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  console.error(`  AI failed: ${event.payload.model} - ${event.payload.error}`)
}

export function handleAIEmbeddingCreated(
  event: AIEmbeddingCreatedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('debug', ctx)) {
    console.debug(`  Embedding created: ${event.payload.dimensions} dimensions`)
  }
}

// =============================================================================
// Workflow Handlers
// =============================================================================

export function handleWorkflowExecutionStarted(
  event: WorkflowExecutionStartedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('info', ctx)) {
    console.info(`  Workflow started: ${event.payload.name} id=${event.payload.id}`)
  }
}

export function handleWorkflowExecutionCompleted(
  event: WorkflowExecutionCompletedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('info', ctx)) {
    console.info(`  Workflow completed: ${event.payload.stepsCompleted} steps in ${event.payload.duration}ms`)
  }
}

export function handleWorkflowExecutionFailed(
  event: WorkflowExecutionFailedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  console.error(`  Workflow failed: ${event.payload.error} at step ${event.payload.failedStep || 'unknown'}`)
}

export function handleWorkflowStepCompleted(
  event: WorkflowStepCompletedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('debug', ctx)) {
    console.debug(`  Step completed: ${event.payload.stepName} in ${event.payload.duration}ms`)
  }
}

export function handleWorkflowStepFailed(
  event: WorkflowStepFailedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  console.error(`  Step failed: ${event.payload.stepName} - ${event.payload.error}`)
}

export function handleWorkflowStateChanged(
  event: WorkflowStateChangedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('debug', ctx)) {
    console.debug(`  State: ${event.payload.previousState} -> ${event.payload.currentState}`)
  }
}

// =============================================================================
// Agent Handlers
// =============================================================================

export function handleAgentSessionStarted(
  event: AgentSessionStartedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('info', ctx)) {
    console.info(`  Agent session: ${event.payload.agentName} (${event.payload.modality})`)
  }
}

export function handleAgentSessionEnded(
  event: AgentSessionEndedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('info', ctx)) {
    console.info(`  Session ended: ${event.payload.duration}ms, ${event.payload.messagesProcessed} messages`)
  }
}

export function handleAgentMessageReceived(
  event: AgentMessageReceivedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
}

export function handleAgentToolCalled(
  event: AgentToolCalledEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('debug', ctx)) {
    console.debug(`  Tool: ${event.payload.toolName} in ${event.payload.duration}ms`)
  }
}

// =============================================================================
// Execution Handlers
// =============================================================================

export function handleExecutionCodeStarted(
  event: ExecutionCodeStartedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('debug', ctx)) {
    console.debug(`  Code execution started: tier=${event.payload.tier}`)
  }
}

export function handleExecutionCodeCompleted(
  event: ExecutionCodeCompletedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('info', ctx)) {
    console.info(`  Code completed: tier=${event.payload.tier} in ${event.payload.duration}ms`)
  }
}

export function handleExecutionCodeFailed(
  event: ExecutionCodeFailedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  console.error(`  Code failed: ${event.payload.error}`)
}

// =============================================================================
// Storage Handlers
// =============================================================================

export function handleStorageSnapshotCreated(
  event: StorageSnapshotCreatedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('info', ctx)) {
    console.info(`  Snapshot: ${event.payload.tables} tables, ${event.payload.size} bytes`)
  }
}

export function handleStorageSyncCompleted(
  event: StorageSyncCompletedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('debug', ctx)) {
    console.debug(`  Sync to ${event.payload.destination}: ${event.payload.bytes} bytes in ${event.payload.duration}ms`)
  }
}

// =============================================================================
// Connection Handlers
// =============================================================================

export function handleConnectionWebSocketOpened(
  event: ConnectionWebSocketOpenedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('debug', ctx)) {
    console.debug(`  WebSocket opened: ${event.payload.id}`)
  }
}

export function handleConnectionWebSocketClosed(
  event: ConnectionWebSocketClosedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('debug', ctx)) {
    console.debug(`  WebSocket closed: ${event.payload.id} code=${event.payload.code}`)
  }
}

export function handleConnectionWebSocketHibernated(
  event: ConnectionWebSocketHibernatedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
}

// =============================================================================
// Schedule Handlers
// =============================================================================

export function handleScheduleAlarmFired(
  event: ScheduleAlarmFiredEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('debug', ctx)) {
    console.debug(`  Alarm fired: drift=${event.payload.drift}ms`)
  }
}

export function handleScheduleTaskExecuted(
  event: ScheduleTaskExecutedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('debug', ctx)) {
    console.debug(`  Task executed: ${event.payload.callback} (${event.payload.type})`)
  }
}

// =============================================================================
// Financial Handlers
// =============================================================================

export function handleFinancialPaymentCompleted(
  event: FinancialPaymentCompletedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('info', ctx)) {
    console.info(`  Payment: ${event.payload.amount} ${event.payload.currency}`)
  }
}

export function handleFinancialTransferCompleted(
  event: FinancialTransferCompletedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('info', ctx)) {
    console.info(`  Transfer: ${event.payload.amount} to ${event.payload.destination}`)
  }
}

// =============================================================================
// Communication Handlers
// =============================================================================

export function handleCommunicationEmailSent(
  event: CommunicationEmailSentEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('info', ctx)) {
    console.info(`  Email sent: ${event.payload.subject} to ${event.payload.to}`)
  }
}

export function handleCommunicationSlackPosted(
  event: CommunicationSlackPostedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('debug', ctx)) {
    console.debug(`  Slack: ${event.payload.channel}`)
  }
}

export function handleCommunicationSMSSent(
  event: CommunicationSMSSentEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('info', ctx)) {
    console.info(`  SMS sent: ${event.payload.to}`)
  }
}

// =============================================================================
// Telephony Handlers
// =============================================================================

export function handleTelephonyCallStarted(
  event: TelephonyCallStartedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('info', ctx)) {
    console.info(`  Call started: ${event.payload.direction} ${event.payload.from} -> ${event.payload.to}`)
  }
}

export function handleTelephonyCallEnded(
  event: TelephonyCallEndedEvent,
  ctx: HandlerContext
): void {
  logEvent(event, ctx)
  if (shouldLog('info', ctx)) {
    console.info(`  Call ended: ${event.payload.status} duration=${event.payload.duration}ms`)
  }
}

// =============================================================================
// Main Event Router
// =============================================================================

/**
 * Route an event to its appropriate handler
 */
export function handleEvent(event: DOObservabilityEvent, ctx: HandlerContext): void {
  switch (event.type) {
    // DO Lifecycle
    case 'DO.Lifecycle.created':
      handleDOLifecycleCreated(event, ctx)
      break
    case 'DO.Lifecycle.hibernated':
      handleDOLifecycleHibernated(event, ctx)
      break
    case 'DO.Lifecycle.awakened':
      handleDOLifecycleAwakened(event, ctx)
      break
    case 'DO.Lifecycle.deleted':
      handleDOLifecycleDeleted(event, ctx)
      break

    // RPC
    case 'RPC.Request.received':
      handleRPCRequestReceived(event, ctx)
      break
    case 'RPC.Response.sent':
      handleRPCResponseSent(event, ctx)
      break
    case 'RPC.Request.failed':
      handleRPCRequestFailed(event, ctx)
      break

    // CDC
    case 'CDC.Event.emitted':
      handleCDCEventEmitted(event, ctx)
      break
    case 'CDC.Buffer.flushed':
      handleCDCBufferFlushed(event, ctx)
      break
    case 'CDC.Stream.updated':
      handleCDCStreamUpdated(event, ctx)
      break

    // AI
    case 'AI.Generation.started':
      handleAIGenerationStarted(event, ctx)
      break
    case 'AI.Generation.completed':
      handleAIGenerationCompleted(event, ctx)
      break
    case 'AI.Generation.failed':
      handleAIGenerationFailed(event, ctx)
      break
    case 'AI.Embedding.created':
      handleAIEmbeddingCreated(event, ctx)
      break

    // Workflow
    case 'Workflow.Execution.started':
      handleWorkflowExecutionStarted(event, ctx)
      break
    case 'Workflow.Execution.completed':
      handleWorkflowExecutionCompleted(event, ctx)
      break
    case 'Workflow.Execution.failed':
      handleWorkflowExecutionFailed(event, ctx)
      break
    case 'Workflow.Step.completed':
      handleWorkflowStepCompleted(event, ctx)
      break
    case 'Workflow.Step.failed':
      handleWorkflowStepFailed(event, ctx)
      break
    case 'Workflow.State.changed':
      handleWorkflowStateChanged(event, ctx)
      break

    // Agent
    case 'Agent.Session.started':
      handleAgentSessionStarted(event, ctx)
      break
    case 'Agent.Session.ended':
      handleAgentSessionEnded(event, ctx)
      break
    case 'Agent.Message.received':
      handleAgentMessageReceived(event, ctx)
      break
    case 'Agent.Tool.called':
      handleAgentToolCalled(event, ctx)
      break

    // Execution
    case 'Execution.Code.started':
      handleExecutionCodeStarted(event, ctx)
      break
    case 'Execution.Code.completed':
      handleExecutionCodeCompleted(event, ctx)
      break
    case 'Execution.Code.failed':
      handleExecutionCodeFailed(event, ctx)
      break

    // Storage
    case 'Storage.Snapshot.created':
      handleStorageSnapshotCreated(event, ctx)
      break
    case 'Storage.Sync.completed':
      handleStorageSyncCompleted(event, ctx)
      break

    // Connection
    case 'Connection.WebSocket.opened':
      handleConnectionWebSocketOpened(event, ctx)
      break
    case 'Connection.WebSocket.closed':
      handleConnectionWebSocketClosed(event, ctx)
      break
    case 'Connection.WebSocket.hibernated':
      handleConnectionWebSocketHibernated(event, ctx)
      break

    // Schedule
    case 'Schedule.Alarm.fired':
      handleScheduleAlarmFired(event, ctx)
      break
    case 'Schedule.Task.executed':
      handleScheduleTaskExecuted(event, ctx)
      break

    // Financial
    case 'Financial.Payment.completed':
      handleFinancialPaymentCompleted(event, ctx)
      break
    case 'Financial.Transfer.completed':
      handleFinancialTransferCompleted(event, ctx)
      break

    // Communication
    case 'Communication.Email.sent':
      handleCommunicationEmailSent(event, ctx)
      break
    case 'Communication.Slack.posted':
      handleCommunicationSlackPosted(event, ctx)
      break
    case 'Communication.SMS.sent':
      handleCommunicationSMSSent(event, ctx)
      break

    // Telephony
    case 'Telephony.Call.started':
      handleTelephonyCallStarted(event, ctx)
      break
    case 'Telephony.Call.ended':
      handleTelephonyCallEnded(event, ctx)
      break

    default:
      // Unknown event type - log for debugging
      console.warn(`Unknown event type: ${(event as DOObservabilityEvent).type}`)
  }
}

/**
 * Process multiple events
 */
export function handleEvents(events: DOObservabilityEvent[], ctx: HandlerContext): void {
  for (const event of events) {
    handleEvent(event, ctx)
  }
}
