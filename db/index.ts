/**
 * Database Layer
 *
 * Unified data layer for Digital Objects including:
 * - Collections: Type-safe collection helpers (Nouns, Verbs, Things, Actions, Relationships)
 * - CDC: Change Data Capture streaming via $context hierarchy
 * - Storage: Three-tier storage (Hot/Warm/Cold)
 *
 * @module db
 */

// =============================================================================
// Collections
// =============================================================================
export {
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
  parseRelationOperator,
  parseRelationField,
  isRelationField,
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
} from './collections'

// =============================================================================
// CDC (Change Data Capture)
// =============================================================================
export {
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
} from './cdc'

// =============================================================================
// Storage
// =============================================================================
export {
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
} from './storage'
