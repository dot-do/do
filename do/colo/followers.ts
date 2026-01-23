/**
 * Follower Management
 *
 * Manage follower DOs for leader-follower replication topology.
 * Followers receive replicated data from the leader for read performance.
 *
 * @module colo/followers
 */

import type {
  ReplicationConfig,
  ReplicationStatus,
  ReplicationPeerStatus,
  ReplicationMode,
} from '../../types/colo'
import type { DigitalObjectRef } from '../../types/identity'
import { ColoError, COLO_ERRORS, COLO_EVENTS, COLO_STORAGE_KEYS } from './index'

/**
 * Follower health check result
 */
export interface FollowerHealthCheck {
  /** Reference to the follower */
  ref: DigitalObjectRef
  /** Whether follower is reachable */
  reachable: boolean
  /** Current replication lag in ms */
  lag: number
  /** Last successful heartbeat timestamp */
  lastHeartbeat: number
  /** Error message if unhealthy */
  error?: string
}

/**
 * Add a follower DO for replication
 *
 * Adds a DO as a follower in leader-follower replication topology.
 * The follower will receive replicated data from this DO (the leader).
 *
 * @param state - The DurableObjectState instance (leader)
 * @param ref - Reference to the follower DO
 * @throws ColoError if follower already exists or cannot be reached
 *
 * @example
 * ```typescript
 * // Add a follower in Europe
 * await addFollower(state, 'https://my-app.workers.dev/do/europe-replica')
 *
 * // Add multiple followers
 * await addFollower(state, 'https://my-app.workers.dev/do/asia-replica')
 * await addFollower(state, 'https://my-app.workers.dev/do/latam-replica')
 * ```
 */
export async function addFollower(
  state: DurableObjectState,
  ref: DigitalObjectRef
): Promise<void> {
  // TODO: Implement addFollower
  //
  // 1. Get current followers list from storage
  // 2. Check if follower already exists
  // 3. Validate follower is reachable (health check)
  // 4. Add to followers list
  // 5. Store updated list
  // 6. Send initial sync to follower
  // 7. Emit FOLLOWER_ADDED event
  //
  throw new Error('Not implemented')
}

/**
 * Remove a follower DO
 *
 * Removes a DO from the followers list. The follower will stop receiving
 * replicated data but will retain its current state.
 *
 * @param state - The DurableObjectState instance (leader)
 * @param ref - Reference to the follower DO to remove
 * @throws ColoError if follower not found
 *
 * @example
 * ```typescript
 * await removeFollower(state, 'https://my-app.workers.dev/do/europe-replica')
 * ```
 */
export async function removeFollower(
  state: DurableObjectState,
  ref: DigitalObjectRef
): Promise<void> {
  // TODO: Implement removeFollower
  //
  // 1. Get current followers list from storage
  // 2. Find follower in list
  // 3. Throw FOLLOWER_NOT_FOUND if not found
  // 4. Remove from list
  // 5. Store updated list
  // 6. Notify follower of removal (optional)
  // 7. Emit FOLLOWER_REMOVED event
  //
  throw new Error('Not implemented')
}

/**
 * List all followers
 *
 * Returns the list of all follower DO references.
 *
 * @param state - The DurableObjectState instance (leader)
 * @returns Array of follower references
 *
 * @example
 * ```typescript
 * const followers = await listFollowers(state)
 * // ['https://...', 'https://...']
 *
 * console.log(`${followers.length} followers configured`)
 * ```
 */
export async function listFollowers(
  state: DurableObjectState
): Promise<DigitalObjectRef[]> {
  // TODO: Implement listFollowers
  //
  // 1. Get followers list from storage
  // 2. Return empty array if not set
  //
  throw new Error('Not implemented')
}

/**
 * Get replication status for all followers
 *
 * Returns detailed status information about the replication topology,
 * including lag and health for each follower.
 *
 * @param state - The DurableObjectState instance
 * @returns Full replication status
 *
 * @example
 * ```typescript
 * const status = await getReplicationStatus(state)
 * // {
 * //   mode: 'leader-follower',
 * //   role: 'leader',
 * //   followers: [
 * //     { ref: '...', colo: 'fra', lag: 45, healthy: true },
 * //     { ref: '...', colo: 'sin', lag: 120, healthy: true },
 * //   ],
 * //   lastSyncTimestamp: 1706000000000,
 * //   lag: 0,
 * //   healthy: true,
 * // }
 * ```
 */
export async function getReplicationStatus(
  state: DurableObjectState
): Promise<ReplicationStatus> {
  // TODO: Implement getReplicationStatus
  //
  // 1. Get replication config from storage
  // 2. Get followers list
  // 3. Check health of each follower
  // 4. Calculate overall health
  // 5. Return status object
  //
  throw new Error('Not implemented')
}

/**
 * Check health of a specific follower
 *
 * Performs a health check on a follower to verify reachability and measure lag.
 *
 * @param state - The DurableObjectState instance (leader)
 * @param ref - Reference to the follower to check
 * @returns Health check result
 *
 * @example
 * ```typescript
 * const health = await checkFollowerHealth(state, followerRef)
 * if (!health.reachable) {
 *   console.warn(`Follower unreachable: ${health.error}`)
 * } else if (health.lag > 1000) {
 *   console.warn(`Follower lag high: ${health.lag}ms`)
 * }
 * ```
 */
export async function checkFollowerHealth(
  state: DurableObjectState,
  ref: DigitalObjectRef
): Promise<FollowerHealthCheck> {
  // TODO: Implement checkFollowerHealth
  //
  // 1. Send ping/heartbeat to follower
  // 2. Measure round-trip time
  // 3. Get follower's replication cursor
  // 4. Calculate lag from leader timestamp
  // 5. Return health check result
  //
  throw new Error('Not implemented')
}

/**
 * Replicate a change to all followers
 *
 * Sends a change to all followers. Used internally when writes occur on the leader.
 *
 * @param state - The DurableObjectState instance (leader)
 * @param change - The change to replicate
 * @returns Results for each follower
 */
export async function replicateToFollowers(
  state: DurableObjectState,
  change: ReplicationChange
): Promise<Map<DigitalObjectRef, ReplicationResult>> {
  // TODO: Implement replicateToFollowers
  //
  // 1. Get followers list
  // 2. Send change to each follower in parallel
  // 3. Track success/failure for each
  // 4. Update follower status based on results
  // 5. Emit REPLICATION_LAG_HIGH if any followers are behind
  // 6. Return results map
  //
  throw new Error('Not implemented')
}

/**
 * A change to be replicated
 */
export interface ReplicationChange {
  /** Sequence number for ordering */
  sequence: number
  /** Timestamp of the change */
  timestamp: number
  /** Type of change */
  type: 'put' | 'delete' | 'transaction'
  /** Storage key affected */
  key?: string
  /** New value (for put) */
  value?: unknown
  /** Multiple operations (for transaction) */
  operations?: Array<{ type: 'put' | 'delete'; key: string; value?: unknown }>
}

/**
 * Result of replicating to a single follower
 */
export interface ReplicationResult {
  /** Whether replication succeeded */
  success: boolean
  /** Replication latency in ms */
  latency: number
  /** Error message if failed */
  error?: string
}

/**
 * Configure replication settings
 *
 * Sets the replication configuration for this DO.
 *
 * @param state - The DurableObjectState instance
 * @param config - Replication configuration
 *
 * @example
 * ```typescript
 * await configureReplication(state, {
 *   mode: 'leader-follower',
 *   maxLag: 1000,
 *   conflictResolution: { strategy: 'last-write-wins' },
 *   collections: ['users', 'orders'],
 * })
 * ```
 */
export async function configureReplication(
  state: DurableObjectState,
  config: Partial<ReplicationConfig>
): Promise<void> {
  // TODO: Implement configureReplication
  //
  // 1. Get existing config
  // 2. Merge with new config
  // 3. Validate config (e.g., valid mode, collections exist)
  // 4. Store updated config
  // 5. Apply new settings (e.g., update lag monitoring)
  //
  throw new Error('Not implemented')
}

/**
 * Get the current replication configuration
 *
 * @param state - The DurableObjectState instance
 * @returns Current replication config
 */
export async function getReplicationConfig(
  state: DurableObjectState
): Promise<ReplicationConfig> {
  // TODO: Implement getReplicationConfig
  //
  // 1. Get config from storage
  // 2. Return default config if not set
  //
  throw new Error('Not implemented')
}
