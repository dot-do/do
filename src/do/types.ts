/**
 * Internal types for DO modules
 */

import type {
  Document,
  ListOptions,
  SearchOptions,
  SearchResult,
  FetchOptions,
  FetchResult,
  DoOptions,
  DoResult,
  Thing,
  CreateOptions,
  UpdateOptions,
  Action,
  ActionStatus,
  CreateActionOptions,
  ActionQueryOptions,
  Relationship,
  RelateOptions,
  Event,
  CreateEventOptions,
  EventQueryOptions,
  Artifact,
  ArtifactType,
  StoreArtifactOptions,
  WorkflowContext,
  WorkflowState,
  WorkflowHistoryEntry,
  ScheduleInterval,
  EventHandler,
  ScheduleHandler,
  AuthContext,
  TransportContext,
} from '../types'

import type { SqlExecResult } from '../sqlite'

// Re-export commonly used types
export type {
  Document,
  ListOptions,
  SearchOptions,
  SearchResult,
  FetchOptions,
  FetchResult,
  DoOptions,
  DoResult,
  Thing,
  CreateOptions,
  UpdateOptions,
  Action,
  ActionStatus,
  CreateActionOptions,
  ActionQueryOptions,
  Relationship,
  RelateOptions,
  Event,
  CreateEventOptions,
  EventQueryOptions,
  Artifact,
  ArtifactType,
  StoreArtifactOptions,
  WorkflowContext,
  WorkflowState,
  WorkflowHistoryEntry,
  ScheduleInterval,
  EventHandler,
  ScheduleHandler,
  AuthContext,
  TransportContext,
}

/**
 * Type for DurableObjectState - matches Cloudflare's DurableObject context
 */
export type DurableObjectState = {
  storage: {
    sql: {
      exec(query: string, ...params: unknown[]): SqlExecResult
    }
  }
  acceptWebSocket?(ws: WebSocket): void
  setWebSocketAutoResponse?(pair: unknown): void
}

/**
 * Connection metadata stored for each WebSocket
 */
export interface ConnectionInfo {
  id: string
  subscriptions: Set<string>
  metadata: Record<string, unknown>
}

/**
 * Event data emitted on connection close
 */
export interface ConnectionCloseEvent {
  ws: WebSocket
  code: number
  reason: string
  wasClean: boolean
  metadata: Record<string, unknown>
}

/**
 * Event handler type for connection events
 */
export type ConnectionEventHandler = (event: ConnectionCloseEvent) => void

/**
 * Interface for the core DO instance context
 * Used by modules to access DO state and methods
 */
export interface DOContext<Env = unknown> {
  ctx: DurableObjectState
  env: Env

  // Schema initialization
  initSchema(): void

  // ID generation
  generateId(): string

  // Auth context
  currentAuthContext: AuthContext | null
  wsAuthContexts: Map<WebSocket, AuthContext>

  // Connection tracking
  connections: Map<WebSocket, ConnectionInfo>
  subscribers: Map<string, Set<WebSocket>>

  // Event handlers
  eventHandlers: Map<string, Set<ConnectionEventHandler>>

  // Workflow state
  workflowHandlers: Map<string, EventHandler>
  workflowSchedules: Array<{ interval: ScheduleInterval; handler: ScheduleHandler }>

  // Allowed methods
  allowedMethods: Set<string>

  // Transport context (optional - set during request handling)
  getCurrentTransportContext?(): TransportContext | null
  setTransportContext?(ctx: TransportContext | null): void

  // WebSocket attachment (optional - for hibernation persistence)
  getWebSocketAttachment?(ws?: WebSocket): { auth?: AuthContext; metadata?: Record<string, unknown> } | undefined
  setWebSocketAttachment?(ws: WebSocket, attachment: { auth?: AuthContext; metadata?: Record<string, unknown> }): void
}
