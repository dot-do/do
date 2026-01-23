/**
 * CDC Streaming Module
 *
 * Change Data Capture for Digital Objects with hierarchical streaming via $context.
 *
 * @module cdc
 */

// Event generation
export {
  CDCEventEmitter,
  type CDCEmitterOptions,
  type CDCEventHandler,
  computeChangedFields,
  generateEventId,
  createEvent,
} from './events'

// $context chain streaming
export {
  ContextStreamer,
  type StreamerOptions,
  type EventTransformer,
  type EventFilter,
  type DeliveryAck,
  createFanoutStreamer,
  aggregateEvents,
} from './streaming'

// R2/Iceberg cold storage
export {
  CDCStorage,
  type CDCStorageOptions,
  type ParquetFileInfo,
  type ColdQueryOptions,
  eventsToParquet,
  parquetToEvents,
  getPartitionPath,
  createTableMetadata,
} from './storage'

// Event replay and recovery
export {
  EventReplayer,
  CheckpointManager,
  type Checkpoint,
  type ReplayOptions,
  type ReplayProgress,
  type HotStorageInterface,
  type CheckpointStorage,
  createSubscription,
  mergeEventStreams,
  validateSequence,
} from './replay'

// Re-export types from storage.ts for convenience
export type {
  CDCEvent,
  CDCOperation,
  CDCCursor,
  CDCOptions,
  CDCBatch,
  CDCSubscription,
} from '../../types/storage'
