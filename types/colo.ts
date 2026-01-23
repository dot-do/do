/**
 * Colo (Colocation) Awareness Types
 *
 * From colo.do + where-durableobjects-live
 * Enables geo-aware operations like fork, migrate, and replication
 */

import type { DigitalObjectRef } from './identity'

// =============================================================================
// Regions and Colos
// =============================================================================

/**
 * Cloudflare regions
 */
export type Region =
  | 'wnam' // Western North America
  | 'enam' // Eastern North America
  | 'sam' // South America
  | 'weur' // Western Europe
  | 'eeur' // Eastern Europe
  | 'apac' // Asia Pacific
  | 'oc' // Oceania
  | 'afr' // Africa
  | 'me' // Middle East

/**
 * Colo information
 */
export interface ColoInfo {
  /** IATA airport code (e.g., 'iad', 'lhr', 'nrt') */
  colo: string
  /** Region this colo belongs to */
  region: Region
  /** City name */
  city?: string
  /** Country code */
  country?: string
  /** Latitude */
  latitude?: number
  /** Longitude */
  longitude?: number
  /** Whether this colo supports Durable Objects */
  supportsDurableObjects: boolean
  /** Estimated latency to this colo in ms */
  estimatedLatency?: number
}

/**
 * Region metadata
 */
export interface RegionInfo {
  region: Region
  name: string
  description: string
  colos: string[]
}

export const REGIONS: Record<Region, RegionInfo> = {
  wnam: {
    region: 'wnam',
    name: 'Western North America',
    description: 'US West Coast, Western Canada',
    colos: ['sjc', 'lax', 'sea', 'den', 'phx', 'pdx', 'yvr'],
  },
  enam: {
    region: 'enam',
    name: 'Eastern North America',
    description: 'US East Coast, Eastern Canada',
    colos: ['iad', 'dfw', 'atl', 'ord', 'mia', 'yyz', 'bos', 'jfk'],
  },
  sam: {
    region: 'sam',
    name: 'South America',
    description: 'Brazil, Argentina, Chile, Colombia',
    colos: ['gru', 'eze', 'scl', 'bog'],
  },
  weur: {
    region: 'weur',
    name: 'Western Europe',
    description: 'UK, France, Germany, Netherlands',
    colos: ['lhr', 'cdg', 'fra', 'ams', 'dub', 'mad', 'lis'],
  },
  eeur: {
    region: 'eeur',
    name: 'Eastern Europe',
    description: 'Poland, Romania, Czech Republic',
    colos: ['waw', 'bud', 'prg', 'vie'],
  },
  apac: {
    region: 'apac',
    name: 'Asia Pacific',
    description: 'Japan, Singapore, Hong Kong, India',
    colos: ['nrt', 'sin', 'hkg', 'bom', 'del', 'icn', 'kix'],
  },
  oc: {
    region: 'oc',
    name: 'Oceania',
    description: 'Australia, New Zealand',
    colos: ['syd', 'mel', 'akl', 'per'],
  },
  afr: {
    region: 'afr',
    name: 'Africa',
    description: 'South Africa, Kenya',
    colos: ['jnb', 'cpt', 'nbo'],
  },
  me: {
    region: 'me',
    name: 'Middle East',
    description: 'UAE, Israel, Saudi Arabia',
    colos: ['dxb', 'tlv', 'ruh'],
  },
}

// =============================================================================
// Colo Operations
// =============================================================================

/**
 * Operations for colo-aware DOs
 */
export interface ColoOperations {
  /** Get information about the current colo */
  getInfo(): Promise<ColoInfo>

  /** Get information about a specific colo */
  getColoInfo(colo: string): Promise<ColoInfo | null>

  /** List all available colos */
  listColos(region?: Region): Promise<ColoInfo[]>

  /** Fork this DO to another colo (create a replica) */
  fork(targetColo: string, options?: ForkOptions): Promise<DigitalObjectRef>

  /** Migrate this DO to another colo */
  migrate(targetColo: string, options?: MigrateOptions): Promise<void>

  /** Add a follower DO for replication */
  addFollower(ref: DigitalObjectRef): Promise<void>

  /** Remove a follower DO */
  removeFollower(ref: DigitalObjectRef): Promise<void>

  /** List all followers */
  listFollowers(): Promise<DigitalObjectRef[]>

  /** Get latency to a target colo */
  ping(targetColo: string): Promise<number>

  /** Find the nearest colo to a given location */
  findNearest(latitude: number, longitude: number): Promise<ColoInfo>
}

/**
 * Fork options
 */
export interface ForkOptions {
  /** Name for the forked DO */
  name?: string
  /** Whether to sync data immediately */
  syncData?: boolean
  /** Whether to set up continuous replication */
  continuous?: boolean
  /** Replication lag tolerance in ms */
  maxLag?: number
}

/**
 * Migrate options
 */
export interface MigrateOptions {
  /** Whether to wait for migration to complete */
  wait?: boolean
  /** Timeout for migration in ms */
  timeout?: number
  /** Strategy for handling in-flight requests */
  strategy?: 'graceful' | 'immediate'
}

// =============================================================================
// Replication
// =============================================================================

/**
 * Replication mode
 */
export type ReplicationMode =
  | 'leader-follower' // Single leader, multiple followers
  | 'multi-leader' // Multiple leaders (conflict resolution needed)
  | 'peer-to-peer' // All nodes are equal

/**
 * Replication configuration
 */
export interface ReplicationConfig {
  mode: ReplicationMode
  /** Leader DO (for leader-follower mode) */
  leader?: DigitalObjectRef
  /** Follower DOs */
  followers: DigitalObjectRef[]
  /** Maximum replication lag in ms */
  maxLag?: number
  /** Conflict resolution strategy */
  conflictResolution?: ConflictResolution
  /** Collections to replicate (empty = all) */
  collections?: string[]
}

/**
 * Conflict resolution strategy
 */
export interface ConflictResolution {
  strategy: 'last-write-wins' | 'first-write-wins' | 'merge' | 'custom'
  /** Custom conflict resolver function name */
  resolver?: string
}

/**
 * Replication status
 */
export interface ReplicationStatus {
  mode: ReplicationMode
  role: 'leader' | 'follower' | 'peer'
  leader?: DigitalObjectRef
  followers: ReplicationPeerStatus[]
  lastSyncTimestamp: number
  lag: number
  healthy: boolean
}

export interface ReplicationPeerStatus {
  ref: DigitalObjectRef
  colo: string
  lag: number
  lastHeartbeat: number
  healthy: boolean
  error?: string
}

// =============================================================================
// Location Hints
// =============================================================================

/**
 * Location hint for DO placement
 */
export interface LocationHint {
  /** Preferred colo */
  colo?: string
  /** Preferred region */
  region?: Region
  /** Client IP for auto-detection */
  clientIp?: string
  /** Latitude/longitude for nearest colo */
  coordinates?: {
    latitude: number
    longitude: number
  }
}

/**
 * DO jurisdiction restrictions
 */
export interface JurisdictionConfig {
  /** Allowed regions */
  allowedRegions?: Region[]
  /** Blocked regions */
  blockedRegions?: Region[]
  /** Allowed colos */
  allowedColos?: string[]
  /** Blocked colos */
  blockedColos?: string[]
  /** Required country codes (for data residency) */
  requiredCountries?: string[]
}
