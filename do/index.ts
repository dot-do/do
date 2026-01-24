/**
 * Base DigitalObject Module (Epic 1)
 *
 * The core DigitalObject class that implements:
 * - Identity ($id, $type, $context)
 * - State management (SQLite-backed)
 * - Hibernation (WebSocket connection lifecycle)
 * - Collections (nouns, verbs, things, actions)
 *
 * @module do
 */

// Base DigitalObject class
export {
  DigitalObject,
  DOError,
  type DOEnv,
  type DigitalObjectOptions,
  type FetchResult,
} from './DigitalObject'

// State management
export {
  createDOState,
  type DOState,
  type DOStateTransaction,
  type MutationHandler,
  type StateOptions,
  type ListOptions as StateListOptions,
  type ListResult as StateListResult,
} from './state'

// Hibernation support
export {
  HibernationManager,
  createHibernationManager,
  type HibernationConfig,
  type WebSocketState,
  type AlarmConfig,
} from './hibernation'

// Re-export identity types from types/
export type {
  DigitalObjectIdentity,
  DigitalObjectRef,
  DOType,
  WellKnownType,
  DOMetadata,
  ParsedDOUrl,
} from '../types/identity'

export { resolveTypeUrl } from '../types/identity'

// Domain management
export * from './domains'

// Colo awareness (geo-distribution, replication)
export * from './colo'

// OAuth storage (implements @dotdo/oauth OAuthStorage interface)
export { DOAuthStorage } from './oauth'
