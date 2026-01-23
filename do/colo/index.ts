/**
 * Colo Awareness Layer
 *
 * Geographic intelligence for Digital Objects. Know where your DOs live,
 * move them where you need them.
 *
 * @module colo
 *
 * @example
 * ```typescript
 * import { createColoOperations } from '@do/core/colo'
 *
 * // Create colo operations for a DO instance
 * const colo = createColoOperations(doInstance)
 *
 * // Get current colo info
 * const info = await colo.getInfo()
 * // { colo: 'iad', region: 'enam', city: 'Ashburn', ... }
 *
 * // Fork to another region
 * const replica = await colo.fork('fra', { continuous: true })
 *
 * // Migrate when usage patterns change
 * await colo.migrate('nrt', { strategy: 'graceful' })
 * ```
 */

import type {
  ColoInfo,
  ColoOperations,
  ForkOptions,
  MigrateOptions,
  Region,
} from '../../types/colo'
import type { DigitalObjectRef } from '../../types/identity'

// Re-export individual operations
export { getColoInfo, getColoInfoByColo, listColos } from './info'
export { forkDO } from './fork'
export { migrateDO } from './migrate'
export { addFollower, removeFollower, listFollowers } from './followers'
export { findNearestColo, pingColo } from './routing'

// Re-export types for convenience
export type {
  ColoInfo,
  ColoOperations,
  ForkOptions,
  MigrateOptions,
  Region,
  ReplicationConfig,
  ReplicationStatus,
  ReplicationMode,
  ReplicationPeerStatus,
  LocationHint,
  JurisdictionConfig,
  RegionInfo,
  ConflictResolution,
} from '../../types/colo'

/**
 * Storage key prefixes for colo-related data
 */
export const COLO_STORAGE_KEYS = {
  /** Current colo information */
  COLO_INFO: 'colo:info',
  /** List of follower DO references */
  FOLLOWERS: 'colo:followers',
  /** Replication configuration */
  REPLICATION_CONFIG: 'colo:replication:config',
  /** Current replication status */
  REPLICATION_STATUS: 'colo:replication:status',
} as const

/**
 * Colo-related event names following NS.Object.event pattern
 */
export const COLO_EVENTS = {
  /** Emitted when fork operation starts */
  FORK_STARTED: 'Colo.Fork.started',
  /** Emitted when fork operation completes successfully */
  FORK_COMPLETED: 'Colo.Fork.completed',
  /** Emitted when fork operation fails */
  FORK_FAILED: 'Colo.Fork.failed',
  /** Emitted when migration starts */
  MIGRATION_STARTED: 'Colo.Migration.started',
  /** Emitted when migration completes successfully */
  MIGRATION_COMPLETED: 'Colo.Migration.completed',
  /** Emitted when migration fails */
  MIGRATION_FAILED: 'Colo.Migration.failed',
  /** Emitted when a follower is added */
  FOLLOWER_ADDED: 'Colo.Follower.added',
  /** Emitted when a follower is removed */
  FOLLOWER_REMOVED: 'Colo.Follower.removed',
  /** Emitted when replication lag exceeds threshold */
  REPLICATION_LAG_HIGH: 'Colo.Replication.lagHigh',
} as const

/**
 * Error codes for colo operations
 */
export const COLO_ERRORS = {
  /** Invalid colo code provided */
  INVALID_COLO: 'INVALID_COLO',
  /** Migration operation failed */
  MIGRATION_FAILED: 'MIGRATION_FAILED',
  /** Fork operation failed */
  FORK_FAILED: 'FORK_FAILED',
  /** Follower not found in list */
  FOLLOWER_NOT_FOUND: 'FOLLOWER_NOT_FOUND',
  /** Operation violates jurisdiction constraints */
  JURISDICTION_VIOLATION: 'JURISDICTION_VIOLATION',
  /** Replication error */
  REPLICATION_FAILED: 'REPLICATION_FAILED',
} as const

/**
 * Error class for colo operations
 */
export class ColoError extends Error {
  /**
   * Create a new ColoError
   *
   * @param message - Error message
   * @param code - Error code from COLO_ERRORS
   */
  constructor(
    message: string,
    public readonly code: keyof typeof COLO_ERRORS
  ) {
    super(message)
    this.name = 'ColoError'
  }
}

/**
 * Create colo operations interface for a Digital Object instance
 *
 * Factory function that wraps a DO instance with all colo-related operations.
 * Returns an object implementing the ColoOperations interface.
 *
 * @param state - The DurableObjectState instance
 * @param env - The environment bindings (for accessing other DOs)
 * @returns ColoOperations interface with all colo methods
 *
 * @example
 * ```typescript
 * import { createColoOperations } from '@do/core/colo'
 *
 * class MyDO {
 *   private colo: ColoOperations
 *
 *   constructor(state: DurableObjectState, env: Env) {
 *     this.colo = createColoOperations(state, env)
 *   }
 *
 *   async fetch(request: Request) {
 *     const info = await this.colo.getInfo()
 *     return Response.json(info)
 *   }
 * }
 * ```
 */
export function createColoOperations(
  state: DurableObjectState,
  env: unknown
): ColoOperations {
  // TODO: Implement colo operations factory
  throw new Error('Not implemented')
}

/**
 * Default export for convenience
 */
export default {
  createColoOperations,
  COLO_STORAGE_KEYS,
  COLO_EVENTS,
  COLO_ERRORS,
  ColoError,
}
