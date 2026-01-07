/**
 * @dotdo/types - Type Definitions
 *
 * This module consolidates all type definitions from @dotdo/do,
 * organized by domain for clarity and potential extraction to a
 * standalone @dotdo/types package.
 *
 * Categories:
 * - Core: RPC, Entity, and document types
 * - CRUD: List, create, update options
 * - DOClient: Graph database operations
 * - Events/Actions/Artifacts: Durable execution primitives
 * - Workflows: State machine and handler types
 * - CDC: Change data capture pipeline types
 * - MCP: Tool types for search, fetch, execute
 * - Transport: Multi-transport support types
 * - Auth: Authentication context
 * - WebSocket: Hibernation handler types
 * - Schema: Validation and type builder exports (from schema/types.ts)
 * - Sandbox: Code execution types (from sandbox/types.ts)
 * - WAL: Write-ahead log types (from wal/types.ts)
 *
 * @example
 * ```typescript
 * import type {
 *   // Core types
 *   EntityId,
 *   Thing,
 *   Relationship,
 *
 *   // CRUD options
 *   ListOptions,
 *   CreateOptions,
 *
 *   // Client interfaces
 *   DOClient,
 *   DOClientExtended,
 *
 *   // Schema types
 *   ValidationResult,
 *   BaseType,
 *   SchemaType,
 * } from '@dotdo/do'
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Re-export from main types.ts (Core DO types)
// =============================================================================

export type {
  // RPC Types (re-exported via ../types from ../rpc/types)
  AllowedMethods,
  RpcRequest,
  RpcResponse,
  RpcBatchResponse,

  // Entity Types
  EntityId,
  Thing,
  Relationship,

  // CRUD Types
  ListOptions,
  CreateOptions,
  UpdateOptions,
  RelateOptions,
  Document,

  // EntityOperations Interface
  EntityOperations,

  // DOClient Interfaces
  DOClient,
  DOClientExtended,
  ThingSearchOptions,

  // Events, Actions, Artifacts
  ActionStatus,
  Event,
  Action,
  ArtifactType,
  Artifact,
  CreateEventOptions,
  CreateActionOptions,
  StoreArtifactOptions,
  EventQueryOptions,
  ActionQueryOptions,

  // Workflow Types
  WorkflowContext,
  WorkflowState,
  WorkflowHistoryEntry,
  ScheduleInterval,
  EventHandler,
  ScheduleHandler,

  // MCP Tool Types
  SearchOptions,
  SearchResult,
  FetchOptions,
  FetchResult,
  DoOptions,
  DoResult,

  // Transport Types
  TransportType,
  TransportContext,

  // Auth Types
  AuthContext,

  // WebSocket Types
  WebSocketMessageHandler,
  WebSocketCloseHandler,
  WebSocketErrorHandler,

  // CDC Pipeline Types
  CDCBatchStatus,
  CDCBatch,
  CreateCDCBatchOptions,
  CDCBatchQueryOptions,
  R2OutputResult,
  CDCPipelineResult,
} from '../types'

// =============================================================================
// Re-export from schema/types.ts (Validation types)
// =============================================================================

export type {
  // Schema Management Types
  SchemaVersion,
  ColumnDefinition,
  IndexDefinition,
  TableDefinition,
  Migration,
  MigrationResult,
  MigrationHistoryEntry,

  // JSON Schema Types
  JSONSchema,

  // AI Metadata Types
  AIMetadata,

  // Validation Types
  ValidationError as SchemaValidationError,
  ValidationResult,

  // Reference Types
  ReferenceMode,
  ReferenceDirection,
  RefOperator,
  RefObject,
} from '../schema/types'

// Re-export classes (these are both types AND values)
export {
  // Base Type Class
  BaseType,

  // Primitive Type Classes
  StringType,
  NumberType,
  BooleanType,
  DateType,

  // Modifier Type Classes
  RequiredType,
  OptionalType,
  DefaultType,
  TransformType,

  // Composite Type Classes
  ArrayType,
  ObjectType,
  SchemaType,

  // Reference Type Class
  RefType,
} from '../schema/types'

// =============================================================================
// Re-export from sandbox/types.ts (Execution types)
// =============================================================================

export type {
  ExecutionContext,
  ExecutionResult,
  CodeExecutor,
} from '../sandbox/types'

// =============================================================================
// Re-export from wal/types.ts (WAL types)
// =============================================================================

export type {
  WALEntryType,
  WALEntry,
  WALRecoverOptions,
  WALManagerOptions,
} from '../wal/types'
