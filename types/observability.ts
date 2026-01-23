/**
 * Observability Types
 *
 * Events follow the NS.Object.event naming pattern:
 * - DO.Lifecycle.created, DO.Lifecycle.hibernated
 * - RPC.Request.received, RPC.Response.sent
 * - AI.Generation.started, AI.Generation.completed
 * - Workflow.Step.completed, Workflow.State.changed
 *
 * Every event includes actor, timestamp, request context.
 */

import type { DOType } from './identity'
import type { CDCEvent } from './storage'
import type { ExecutionTier } from './execution'
import type { Actor, ActionRequest } from './collections'

// =============================================================================
// Base Event Type
// =============================================================================

/**
 * Base event structure for all observability events
 * Follows NS.Object.event naming pattern
 */
export interface BaseEvent<T extends string, P = unknown> {
  /** Event type in NS.Object.event format */
  type: T
  /** When the event occurred */
  timestamp: number
  /** Who initiated this (User, Agent, Service, System) */
  actor?: Actor
  /** Request that initiated this event */
  request?: ActionRequest
  /** Event payload */
  payload: P
}

// =============================================================================
// DO Lifecycle Events
// =============================================================================

export interface DOLifecycleCreatedEvent extends BaseEvent<'DO.Lifecycle.created', {
  doType: DOType
  id: string
  name?: string
  context?: string
}> {}

export interface DOLifecycleHibernatedEvent extends BaseEvent<'DO.Lifecycle.hibernated', {
  connectionCount: number
  uptime: number
}> {}

export interface DOLifecycleAwakenedEvent extends BaseEvent<'DO.Lifecycle.awakened', {
  hibernationDuration: number
  trigger: 'request' | 'alarm' | 'websocket'
}> {}

export interface DOLifecycleDeletedEvent extends BaseEvent<'DO.Lifecycle.deleted', {
  reason?: string
}> {}

// =============================================================================
// RPC Events
// =============================================================================

export interface RPCRequestReceivedEvent extends BaseEvent<'RPC.Request.received', {
  id: string
  method: string
  params?: unknown
  traceId?: string
}> {}

export interface RPCResponseSentEvent extends BaseEvent<'RPC.Response.sent', {
  id: string
  method: string
  duration: number
  success: boolean
}> {}

export interface RPCRequestFailedEvent extends BaseEvent<'RPC.Request.failed', {
  id: string
  method: string
  code: number
  message: string
}> {}

// =============================================================================
// CDC Events
// =============================================================================

export interface CDCEventEmittedEvent extends BaseEvent<'CDC.Event.emitted', CDCEvent> {}

export interface CDCBufferFlushedEvent extends BaseEvent<'CDC.Buffer.flushed', {
  count: number
  bytes: number
  destination: 'parent' | 'r2' | 'followers'
}> {}

export interface CDCStreamUpdatedEvent extends BaseEvent<'CDC.Stream.updated', {
  destination: string
  sequence: number
  lag: number
}> {}

// =============================================================================
// AI Events
// =============================================================================

export interface AIGenerationStartedEvent extends BaseEvent<'AI.Generation.started', {
  id: string
  model: string
  provider: string
  prompt?: string
  inputTokens?: number
}> {}

export interface AIGenerationCompletedEvent extends BaseEvent<'AI.Generation.completed', {
  id: string
  model: string
  provider: string
  duration: number
  inputTokens: number
  outputTokens: number
  finishReason: 'stop' | 'length' | 'tool_use' | 'error'
}> {}

export interface AIGenerationFailedEvent extends BaseEvent<'AI.Generation.failed', {
  id: string
  model: string
  provider: string
  error: string
  retryable: boolean
}> {}

export interface AIEmbeddingCreatedEvent extends BaseEvent<'AI.Embedding.created', {
  id: string
  model: string
  provider: string
  dimensions: number
  inputTokens: number
}> {}

// =============================================================================
// Workflow Events
// =============================================================================

export interface WorkflowExecutionStartedEvent extends BaseEvent<'Workflow.Execution.started', {
  id: string
  name: string
  context?: Record<string, unknown>
}> {}

export interface WorkflowExecutionCompletedEvent extends BaseEvent<'Workflow.Execution.completed', {
  id: string
  duration: number
  stepsCompleted: number
}> {}

export interface WorkflowExecutionFailedEvent extends BaseEvent<'Workflow.Execution.failed', {
  id: string
  error: string
  failedStep?: string
  stepsCompleted: number
}> {}

export interface WorkflowStepCompletedEvent extends BaseEvent<'Workflow.Step.completed', {
  workflowId: string
  stepId: string
  stepName: string
  duration: number
  output?: unknown
}> {}

export interface WorkflowStepFailedEvent extends BaseEvent<'Workflow.Step.failed', {
  workflowId: string
  stepId: string
  stepName: string
  error: string
  retryable: boolean
}> {}

export interface WorkflowStateChangedEvent extends BaseEvent<'Workflow.State.changed', {
  workflowId: string
  previousState: string
  currentState: string
  event: string
}> {}

// =============================================================================
// Agent Events
// =============================================================================

export interface AgentSessionStartedEvent extends BaseEvent<'Agent.Session.started', {
  id: string
  agentName: string
  /** Communication modality */
  modality: 'text' | 'voice' | 'video' | 'multimodal'
  capabilities: string[]
  /** Phone number (for voice modality with telephony) */
  phone?: string
}> {}

export interface AgentSessionEndedEvent extends BaseEvent<'Agent.Session.ended', {
  id: string
  /** Communication modality */
  modality: 'text' | 'voice' | 'video' | 'multimodal'
  duration: number
  messagesProcessed: number
  /** Turns completed (for voice sessions) */
  turnsCompleted?: number
}> {}

export interface AgentMessageReceivedEvent extends BaseEvent<'Agent.Message.received', {
  sessionId: string
  messageId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content?: string
}> {}

export interface AgentToolCalledEvent extends BaseEvent<'Agent.Tool.called', {
  sessionId: string
  toolName: string
  input: unknown
  output?: unknown
  duration: number
}> {}

// =============================================================================
// Execution Events
// =============================================================================

export interface ExecutionCodeStartedEvent extends BaseEvent<'Execution.Code.started', {
  id: string
  tier: ExecutionTier
  command?: string
  code?: string
}> {}

export interface ExecutionCodeCompletedEvent extends BaseEvent<'Execution.Code.completed', {
  id: string
  tier: ExecutionTier
  duration: number
  success: boolean
  output?: unknown
}> {}

export interface ExecutionCodeFailedEvent extends BaseEvent<'Execution.Code.failed', {
  id: string
  tier: ExecutionTier
  error: string
  code?: string
}> {}

// =============================================================================
// Storage Events
// =============================================================================

export interface StorageSnapshotCreatedEvent extends BaseEvent<'Storage.Snapshot.created', {
  id: string
  size: number
  tables: number
}> {}

export interface StorageSyncCompletedEvent extends BaseEvent<'Storage.Sync.completed', {
  destination: 'r2' | 'parent' | 'replica'
  bytes: number
  duration: number
}> {}

// =============================================================================
// Connection Events
// =============================================================================

export interface ConnectionWebSocketOpenedEvent extends BaseEvent<'Connection.WebSocket.opened', {
  id: string
  protocol?: string
}> {}

export interface ConnectionWebSocketClosedEvent extends BaseEvent<'Connection.WebSocket.closed', {
  id: string
  code: number
  reason?: string
  duration: number
}> {}

export interface ConnectionWebSocketHibernatedEvent extends BaseEvent<'Connection.WebSocket.hibernated', {
  id: string
  duration: number
}> {}

// =============================================================================
// Schedule Events
// =============================================================================

export interface ScheduleAlarmFiredEvent extends BaseEvent<'Schedule.Alarm.fired', {
  scheduledTime: number
  actualTime: number
  drift: number
}> {}

export interface ScheduleTaskExecutedEvent extends BaseEvent<'Schedule.Task.executed', {
  id: string
  callback: string
  type: 'scheduled' | 'delayed' | 'cron'
  duration: number
  success: boolean
}> {}

// =============================================================================
// Financial Events
// =============================================================================

export interface FinancialPaymentCompletedEvent extends BaseEvent<'Financial.Payment.completed', {
  id: string
  amount: number
  currency: string
  customerId: string
}> {}

export interface FinancialTransferCompletedEvent extends BaseEvent<'Financial.Transfer.completed', {
  id: string
  amount: number
  destination: string
}> {}

// =============================================================================
// Communication Events
// =============================================================================

export interface CommunicationEmailSentEvent extends BaseEvent<'Communication.Email.sent', {
  id: string
  to: string
  subject: string
  templateId?: string
}> {}

export interface CommunicationSlackPostedEvent extends BaseEvent<'Communication.Slack.posted', {
  channel: string
  ts: string
}> {}

export interface CommunicationSMSSentEvent extends BaseEvent<'Communication.SMS.sent', {
  id: string
  to: string
}> {}

// =============================================================================
// Telephony Events
// =============================================================================

export interface TelephonyCallStartedEvent extends BaseEvent<'Telephony.Call.started', {
  id: string
  from: string
  to: string
  direction: 'inbound' | 'outbound'
}> {}

export interface TelephonyCallEndedEvent extends BaseEvent<'Telephony.Call.ended', {
  id: string
  duration: number
  status: 'completed' | 'failed' | 'no-answer' | 'busy'
}> {}

// =============================================================================
// Modality Events (Voice, Video, etc.)
// =============================================================================

// Note: Voice is a MODALITY, not an entity type.
// Agent sessions can have different modalities.
// The Agent.Session events include modality info.
// See AgentSessionStartedEvent which has modality field.

// Telephony events cover phone-specific concerns (Telephony.Call.*)
// Agent events cover conversation concerns (Agent.Session.*, Agent.Message.*)
// The modality (text/voice/video) is a property of the session, not a separate domain

// =============================================================================
// All Events Union
// =============================================================================

export type DOObservabilityEvent =
  // Lifecycle
  | DOLifecycleCreatedEvent
  | DOLifecycleHibernatedEvent
  | DOLifecycleAwakenedEvent
  | DOLifecycleDeletedEvent

  // RPC
  | RPCRequestReceivedEvent
  | RPCResponseSentEvent
  | RPCRequestFailedEvent

  // CDC
  | CDCEventEmittedEvent
  | CDCBufferFlushedEvent
  | CDCStreamUpdatedEvent

  // AI
  | AIGenerationStartedEvent
  | AIGenerationCompletedEvent
  | AIGenerationFailedEvent
  | AIEmbeddingCreatedEvent

  // Workflow
  | WorkflowExecutionStartedEvent
  | WorkflowExecutionCompletedEvent
  | WorkflowExecutionFailedEvent
  | WorkflowStepCompletedEvent
  | WorkflowStepFailedEvent
  | WorkflowStateChangedEvent

  // Agent
  | AgentSessionStartedEvent
  | AgentSessionEndedEvent
  | AgentMessageReceivedEvent
  | AgentToolCalledEvent

  // Execution
  | ExecutionCodeStartedEvent
  | ExecutionCodeCompletedEvent
  | ExecutionCodeFailedEvent

  // Storage
  | StorageSnapshotCreatedEvent
  | StorageSyncCompletedEvent

  // Connection
  | ConnectionWebSocketOpenedEvent
  | ConnectionWebSocketClosedEvent
  | ConnectionWebSocketHibernatedEvent

  // Schedule
  | ScheduleAlarmFiredEvent
  | ScheduleTaskExecutedEvent

  // Financial
  | FinancialPaymentCompletedEvent
  | FinancialTransferCompletedEvent

  // Communication
  | CommunicationEmailSentEvent
  | CommunicationSlackPostedEvent
  | CommunicationSMSSentEvent

  // Telephony
  | TelephonyCallStartedEvent
  | TelephonyCallEndedEvent

  // Note: Voice is a modality of Agent sessions, not a separate event domain
  // Use Agent.Session.started with modality: 'voice' for voice sessions

// =============================================================================
// Event Handler
// =============================================================================

export type EventHandler<T extends DOObservabilityEvent = DOObservabilityEvent> = (
  event: T,
  context: DurableObjectState
) => void | Promise<void>

// =============================================================================
// Observability Interface
// =============================================================================

export interface Observability {
  emit(event: DOObservabilityEvent): void
  on<T extends DOObservabilityEvent['type']>(
    type: T,
    handler: EventHandler<Extract<DOObservabilityEvent, { type: T }>>
  ): () => void
}
