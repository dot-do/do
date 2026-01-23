/**
 * Migration Operations
 *
 * Move Digital Objects between colos. Use when usage patterns change
 * or for optimization.
 *
 * @module colo/migrate
 */

import type { MigrateOptions } from '../../types/colo'
import type { DigitalObjectRef } from '../../types/identity'
import { ColoError, COLO_ERRORS, COLO_EVENTS } from './index'
import { isValidColo } from './info'

/**
 * Migration strategy
 *
 * - `graceful`: Wait for in-flight requests, then migrate (slower but safer)
 * - `immediate`: Migrate immediately, in-flight requests may fail (faster but riskier)
 */
export type MigrationStrategy = 'graceful' | 'immediate'

/**
 * Migration state during the migration process
 */
export type MigrationState =
  | 'idle'
  | 'preparing'
  | 'draining'
  | 'transferring'
  | 'switching'
  | 'completed'
  | 'failed'

/**
 * Migration status information
 */
export interface MigrationStatus {
  /** Current state of the migration */
  state: MigrationState
  /** Source colo */
  sourceColo: string
  /** Target colo */
  targetColo: string
  /** When migration started */
  startedAt: number
  /** Progress percentage (0-100) */
  progress: number
  /** Number of entries transferred */
  entriesTransferred: number
  /** Total entries to transfer */
  totalEntries: number
  /** Error message if failed */
  error?: string
}

/**
 * Migrate options with defaults applied
 */
export interface ResolvedMigrateOptions {
  /** Whether to wait for migration to complete (default: true) */
  wait: boolean
  /** Timeout for migration in ms (default: 60000) */
  timeout: number
  /** Strategy for handling in-flight requests (default: 'graceful') */
  strategy: MigrationStrategy
}

/**
 * Migrate this DO to another colo
 *
 * Moves the primary DO to a different geographic location. This is useful when:
 * - User patterns shift (e.g., most users now in Asia instead of US)
 * - Optimizing for latency based on analytics
 * - Meeting new jurisdiction requirements
 *
 * **Graceful Strategy** (default):
 * 1. Stop accepting new writes
 * 2. Wait for in-flight requests to complete
 * 3. Transfer all state to new location
 * 4. Update routing to point to new location
 * 5. Resume normal operation
 *
 * **Immediate Strategy**:
 * 1. Snapshot current state
 * 2. Create new DO in target colo with snapshot
 * 3. Immediately switch routing
 * 4. In-flight requests to old location may fail
 *
 * @param state - The DurableObjectState instance
 * @param env - Environment bindings
 * @param targetColo - IATA code of target colo (e.g., 'fra', 'nrt')
 * @param options - Migration configuration options
 * @throws ColoError if target colo is invalid or migration fails
 *
 * @example
 * ```typescript
 * // Graceful migration (recommended)
 * await migrateDO(state, env, 'nrt', {
 *   strategy: 'graceful',
 *   timeout: 30000,
 * })
 *
 * // Immediate migration (faster but riskier)
 * await migrateDO(state, env, 'nrt', {
 *   strategy: 'immediate',
 * })
 *
 * // Fire and forget (don't wait for completion)
 * await migrateDO(state, env, 'fra', {
 *   wait: false,
 * })
 * ```
 */
export async function migrateDO(
  state: DurableObjectState,
  env: unknown,
  targetColo: string,
  options?: MigrateOptions
): Promise<void> {
  // TODO: Implement migrateDO
  //
  // 1. Validate target colo
  //    - Use isValidColo() to check
  //    - Throw INVALID_COLO error if invalid
  //
  // 2. Resolve options with defaults
  //
  // 3. Emit MIGRATION_STARTED event
  //
  // 4. Based on strategy:
  //    Graceful:
  //      a. Set state to 'preparing'
  //      b. Set state to 'draining', reject new writes
  //      c. Wait for in-flight requests (with timeout)
  //      d. Set state to 'transferring', export all storage
  //      e. Create new DO in target colo
  //      f. Transfer state to new DO
  //      g. Set state to 'switching', update routing
  //      h. Set state to 'completed'
  //
  //    Immediate:
  //      a. Snapshot current state
  //      b. Create new DO in target colo
  //      c. Transfer snapshot
  //      d. Switch routing immediately
  //
  // 5. Emit MIGRATION_COMPLETED or MIGRATION_FAILED event
  //
  throw new Error('Not implemented')
}

/**
 * Apply default values to migrate options
 *
 * @param options - Partial options from caller
 * @returns Fully resolved options with defaults
 */
export function resolveMigrateOptions(options?: MigrateOptions): ResolvedMigrateOptions {
  return {
    wait: options?.wait ?? true,
    timeout: options?.timeout ?? 60000,
    strategy: options?.strategy ?? 'graceful',
  }
}

/**
 * Get the current migration status
 *
 * @param state - The DurableObjectState instance
 * @returns Current migration status or null if no migration in progress
 *
 * @example
 * ```typescript
 * const status = await getMigrationStatus(state)
 * if (status) {
 *   console.log(`Migration ${status.progress}% complete`)
 *   console.log(`${status.entriesTransferred}/${status.totalEntries} entries`)
 * }
 * ```
 */
export async function getMigrationStatus(
  state: DurableObjectState
): Promise<MigrationStatus | null> {
  // TODO: Implement getMigrationStatus
  //
  // 1. Get migration status from storage
  // 2. Return null if no migration in progress
  // 3. Return status object
  //
  throw new Error('Not implemented')
}

/**
 * Cancel an in-progress migration
 *
 * Can only cancel migrations that haven't reached the 'switching' state.
 * Graceful migrations in 'draining' or 'transferring' state can be cancelled.
 *
 * @param state - The DurableObjectState instance
 * @throws ColoError if no migration in progress or migration cannot be cancelled
 *
 * @example
 * ```typescript
 * await cancelMigration(state)
 * // Migration cancelled, DO remains in original colo
 * ```
 */
export async function cancelMigration(state: DurableObjectState): Promise<void> {
  // TODO: Implement cancelMigration
  //
  // 1. Get current migration status
  // 2. Validate migration can be cancelled (not in 'switching' or 'completed')
  // 3. Clean up any partially transferred state
  // 4. Reset migration status
  // 5. Resume normal operation
  //
  throw new Error('Not implemented')
}

/**
 * Drain in-flight requests during graceful migration
 *
 * Waits for active requests to complete before proceeding with state transfer.
 *
 * @param state - The DurableObjectState instance
 * @param timeout - Maximum time to wait in ms
 * @returns True if all requests drained, false if timeout
 */
export async function drainRequests(
  state: DurableObjectState,
  timeout: number
): Promise<boolean> {
  // TODO: Implement drainRequests
  //
  // 1. Track active request count
  // 2. Reject new requests with appropriate status
  // 3. Wait for active count to reach 0
  // 4. Return true if drained, false if timeout
  //
  throw new Error('Not implemented')
}

/**
 * Transfer state to a new DO location
 *
 * Exports all storage entries and sends them to the target DO.
 *
 * @param state - Source DO state
 * @param targetRef - Reference to target DO
 * @param onProgress - Optional callback for progress updates
 * @returns Number of entries transferred
 */
export async function transferState(
  state: DurableObjectState,
  targetRef: DigitalObjectRef,
  onProgress?: (transferred: number, total: number) => void
): Promise<number> {
  // TODO: Implement transferState
  //
  // 1. List all storage entries
  // 2. Batch entries for efficient transfer
  // 3. Send batches to target DO
  // 4. Call onProgress callback after each batch
  // 5. Return total count
  //
  throw new Error('Not implemented')
}
