/**
 * DO (Digital Object) - Main Entry Point
 *
 * This module exports all public APIs for the DO system:
 * - DO: Core state and hibernation management
 * - RPC: Client/server for CapnWeb RPC
 * - CDC: Change Data Capture streaming
 * - Collections: Type-safe collection helpers
 * - AI: Unified generative AI abstraction
 * - Integrations: External service integrations
 * - SDK: Client SDK for consumers
 * - CLI: Command-line interface
 *
 * @example
 * ```typescript
 * import {
 *   createDOState,
 *   HibernationManager,
 *   RPCServer,
 *   createDOClient,
 *   NounCollection,
 * } from '@do/core'
 *
 * // Create state manager
 * const state = createDOState(ctx)
 *
 * // Create hibernation manager
 * const hibernation = new HibernationManager(ctx, { idleTimeout: 10_000 })
 *
 * // Connect via SDK
 * const client = createDOClient({ auth: 'token' })
 * const conn = await client.connect('https://example.do')
 * ```
 */

// =============================================================================
// Core DigitalObject (Epic 1)
// =============================================================================
export {
  createDOState,
  HibernationManager,
  createHibernationManager,
  resolveTypeUrl,
  type DOState,
  type DOStateTransaction,
  type MutationHandler,
  type StateOptions,
  type StateListOptions,
  type StateListResult,
  type HibernationConfig,
  type WebSocketState as DOWebSocketState,
  type AlarmConfig,
} from './do'

// =============================================================================
// RPC (Epic 2)
// =============================================================================
export {
  RPCClientImpl,
  RPCServer,
  createRPCServer,
  createMethodContext,
  MethodRegistry,
  RPCRouteHandler,
  createRouteHandler,
  createLoggingMiddleware,
  createAuthMiddleware,
  createRateLimitMiddleware,
  createTimingMiddleware,
  registerSystemMethods,
  registerIdentityMethods,
  parseRequest,
  parseResponse,
  createError,
  createErrorResponse,
  createSuccessResponse,
  generateRequestId,
  STANDARD_COLLECTIONS,
  COLLECTION_OPERATIONS,
  RpcErrorCodes,
  type RPCClientOptions,
  type RPCServerOptions,
  type CORSOptions,
  type MethodHandler,
  type MethodContext,
  type MethodOptions,
  type Middleware,
  type ConnectionState,
} from './rpc'

// =============================================================================
// Database Layer (CDC, Collections, Storage)
// =============================================================================
export {
  // CDC
  CDCEventEmitter,
  ContextStreamer,
  CDCStorage,
  EventReplayer,
  CheckpointManager,
  computeChangedFields,
  generateEventId,
  createEvent,
  createFanoutStreamer,
  aggregateEvents,
  getPartitionPath,
  createTableMetadata,
  createSubscription,
  mergeEventStreams,
  validateSequence,
  type CDCEmitterOptions,
  type CDCEventHandler,
  type StreamerOptions,
  type EventTransformer,
  type EventFilter,
  type DeliveryAck,
  type CDCStorageOptions,
  type ParquetFileInfo,
  type ColdQueryOptions,
  type Checkpoint,
  type ReplayOptions,
  type ReplayProgress,
  type HotStorageInterface,
  type CheckpointStorage,
  // Collections
  BaseCollection,
  NounCollection,
  VerbCollection,
  ThingCollection,
  ActionCollection,
  RelationshipCollection,
  CollectionError,
  NotFoundError,
  ValidationError,
  CRUD_VERBS,
  WORKFLOW_VERBS,
  DEFAULT_RETRY_POLICY,
  isThingExpanded,
  isThingCompact,
  type DOStorage,
  type CollectionConfig,
  type CreateNounOptions,
  type CreateVerbOptions,
  type CreateThingExpandedOptions,
  type CreateThingCompactOptions,
  type ThingQueryOptions,
  type CreateActionOptions,
  type FailActionOptions,
  type ActionRetryPolicy,
  type CreateRelationshipOptions,
  type RelationshipQueryOptions,
  type TraversalResult,
  // Storage
  HotStorage,
  WarmStorage,
  ColdStorage,
  VortexEncoder,
  VortexDecoder,
  SnapshotManager,
  createStorage,
  StorageError,
  isTierAvailable,
  getTierInfo,
  type StorageConfig,
  type HotStorageConfig,
  type WarmStorageConfig,
  type ColdStorageConfig,
  type SyncConfig,
  type UnifiedStorage,
  type QueryOptions,
  type ArchiveOptions,
  type StorageEventType,
  type StorageEvent,
} from './db'

// =============================================================================
// AI Layer (Epic 6)
// =============================================================================
export {
  AIService,
  createAIService,
  type AIProvider,
  type AIServiceOptions,
} from './ai'

// =============================================================================
// Integrations (Epic 5) - Excluded from 0.0.1 due to type issues, will be fixed in 0.0.2
// =============================================================================
// export * from './integrations'

// =============================================================================
// Client SDK
// =============================================================================
export {
  DOClientLegacy,
  DOConnection,
  createDOClient,
  createClient,
  createClients,
} from './sdk'

export type {
  DOClient,
  DOClientOptions,
  ClientConfig,
  DOSchema as SDKSchema,
} from './sdk'

// =============================================================================
// CLI - Excluded from 0.0.1 due to node type dependencies, will be fixed in 0.0.2
// =============================================================================
// export * from './cli'

// =============================================================================
// API Layer (Hono-based)
// =============================================================================
export {
  createApp,
  createMinimalApp,
  createProductionApp,
  createDevelopmentApp,
  createHealthRoutes,
  createDORoutes,
  createAIRoutes,
  createMCPRoutes,
  createRootRoute,
  createRPCRoutes,
  createAllRoutes,
  composeMiddleware,
  createContextMiddleware,
  createErrorMiddleware,
  createSecurityMiddleware,
  createCorsMiddleware as createAPICorsMiddleware,
  createDynamicCorsMiddleware,
  createRateLimitMiddleware as createAPIRateLimitMiddleware,
  createAIRateLimitMiddleware,
  createWriteRateLimitMiddleware,
  createAuthMiddleware as createAPIAuthMiddleware,
  createApiKeyMiddleware,
  getUser,
  requireUser,
  hasRole,
  hasPermission,
  type AppConfig,
  type Env as APIEnv,
  type DOContext as APIDOContext,
  type AuthUser,
  type AuthOptions,
  type APIResponse,
  type APIErrorResponse,
  type PaginatedResponse,
  type PaginationInfo,
  type RateLimitConfig,
  type RateLimitInfo,
  type CORSConfig as APICORSConfig,
  type HealthCheckResponse,
  type MCPServerInfo,
  type MCPTool,
  type MCPContent,
  type MCPRequest,
  type MCPToolCallResponse,
  type MCPListToolsResponse,
} from './api'

// =============================================================================
// Type Re-exports from ../types/
// =============================================================================
export type {
  // Identity
  DOType,
  WellKnownType,
  DigitalObjectRef,
  DigitalObjectIdentity,
  DOMetadata,
  ParsedDOUrl,

  // Collections
  Noun,
  Verb,
  Thing,
  ThingExpanded,
  ThingCompact,
  Action,
  ActionStatus,
  ActionError,
  ActionRequest,
  Actor,
  ActorType,
  Relationship,
  Function,
  FunctionType,
  FunctionDefinition,
  Workflow,
  WorkflowType,
  WorkflowExecutionState,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowTrigger,
  StateMachineDefinition,
  StateNode,
  Transition,
  Event,
  Experiment,
  ExperimentStatus,
  Variant,
  Org,
  Role,
  Permission,
  User,
  Agent,
  AgentStatus,
  AgentModality,
  AgentPersonality,
  AgentVoiceConfig,
  AgentConfig,
  Integration,
  IntegrationStatus,
  IntegrationCredentials,
  Webhook,
  CollectionMethods,
  ListOptions,
  ListResult,
  FilterExpression,
  FilterOp,

  // RPC
  RPCRequest,
  RPCResponse,
  RPCError,
  RPCMeta,
  RPCBatchRequest,
  RPCBatchResponse,
  RPCClient,
  DORPCMethods,
  DOStats,
  DOSchema,
  WebSocketState,
  HibernationOptions,

  // CDC/Storage
  CDCEvent,
  CDCBatch,
  CDCCursor,
  CDCOptions,
  CDCOperation,
  CDCSubscription,
  StorageTier,

  // Observability
  DOObservabilityEvent,
  BaseEvent,
  EventHandler,
  Observability,

  // Colo
  ColoInfo,
  Region,
  RegionInfo,
  ColoOperations,
  ReplicationMode,
  ReplicationConfig,
  ReplicationStatus,
} from './types'

// =============================================================================
// Financial Layer (Business Operations)
// =============================================================================
export {
  // Stripe Connect
  StripeConnect,
  StripeConnectError,
  StripeConnectErrorCodes,
  // Payments
  PaymentProcessor,
  PaymentError,
  PaymentErrorCodes,
  // Subscriptions
  SubscriptionManager,
  SubscriptionError,
  SubscriptionErrorCodes,
  // Accounting
  AccountingJournal,
  AccountingError,
  AccountingErrorCodes,
  // Reports
  FinancialReporter,
  ReportError,
  ReportErrorCodes,
  // Metrics
  MetricsCalculator,
  MetricsError,
  MetricsErrorCodes,
  // Types
  type StripeConnectConfig,
  type CreateAccountOptions as CreateStripeAccountOptions,
  type AccountLinkOptions,
  type StripeConnectErrorCode,
  type PaymentProcessorConfig,
  type CreatePaymentOptions,
  type RefundOptions,
  type CreateTransferOptions,
  type CreatePayoutOptions,
  type PaymentErrorCode,
  type SubscriptionManagerConfig,
  type CreateSubscriptionOptions,
  type UpdateSubscriptionOptions,
  type CancelSubscriptionOptions,
  type ListInvoicesOptions,
  type SubscriptionErrorCode,
  type AccountingJournalConfig,
  type CreateChartAccountOptions,
  type CreateJournalEntryOptions,
  type ListJournalEntriesOptions,
  type TrialBalanceEntry,
  type AccountingErrorCode,
  type FinancialReporterConfig,
  type ReportOptions,
  type ComparativeReport,
  type ReportErrorCode,
  type MetricsCalculatorConfig,
  type MRRMovement,
  type CustomerCohort,
  type RevenueAnalysis,
  type UnitEconomics,
  type CohortAnalysis,
  type MetricsErrorCode,
} from './do/business/financial'
