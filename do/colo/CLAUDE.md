# CLAUDE.md - Colo Awareness Layer

## Purpose

Implement geographic awareness and control for Digital Objects. Enable DO placement, migration, and replication across Cloudflare's global network.

## Implementation Guidelines

### Core Pattern

The colo layer wraps Cloudflare's Durable Object location APIs with a higher-level abstraction:

```typescript
// Every function takes a DO instance as first parameter
async function getColoInfo(do: DurableObjectState): Promise<ColoInfo>
async function forkDO(do: DurableObjectState, targetColo: string, options?: ForkOptions): Promise<DigitalObjectRef>
```

### CF API Integration

Cloudflare provides colo information via request headers and the DO runtime:

```typescript
// Get current colo from request
const colo = request.cf?.colo // 'IAD', 'FRA', etc.

// Location hints for DO creation
const locationHint = { locationHint: 'enam' }
const id = env.MY_DO.newUniqueId(locationHint)
```

### File Responsibilities

| File | Responsibility |
|------|----------------|
| `index.ts` | Factory function, re-exports, convenience methods |
| `info.ts` | Colo/region lookup, metadata, `getInfo()`, `getColoInfo()` |
| `fork.ts` | Create replicas, `fork()` with data sync |
| `migrate.ts` | Move DO primary, `migrate()` with graceful/immediate |
| `followers.ts` | Manage follower list, `addFollower()`, `removeFollower()` |
| `routing.ts` | Find nearest, ping, `findNearest()`, `ping()` |

### Type Imports

Import types from the shared types package:

```typescript
import type {
  ColoInfo,
  ColoOperations,
  ForkOptions,
  MigrateOptions,
  Region,
  ReplicationConfig,
  ReplicationStatus,
  LocationHint,
  JurisdictionConfig,
  REGIONS,
} from '../../types/colo'

import type { DigitalObjectRef } from '../../types/identity'
```

### Storage Keys

Use consistent storage key prefixes:

```typescript
const STORAGE_KEYS = {
  COLO_INFO: 'colo:info',
  FOLLOWERS: 'colo:followers',
  REPLICATION_CONFIG: 'colo:replication:config',
  REPLICATION_STATUS: 'colo:replication:status',
} as const
```

### Error Handling

Create specific error types:

```typescript
class ColoError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'ColoError'
  }
}

// Error codes
const COLO_ERRORS = {
  INVALID_COLO: 'INVALID_COLO',
  MIGRATION_FAILED: 'MIGRATION_FAILED',
  FORK_FAILED: 'FORK_FAILED',
  FOLLOWER_NOT_FOUND: 'FOLLOWER_NOT_FOUND',
  JURISDICTION_VIOLATION: 'JURISDICTION_VIOLATION',
} as const
```

### Validation

Validate colo codes against known colos:

```typescript
function isValidColo(colo: string): boolean {
  const allColos = Object.values(REGIONS).flatMap(r => r.colos)
  return allColos.includes(colo.toLowerCase())
}

function getRegionForColo(colo: string): Region | null {
  for (const [region, info] of Object.entries(REGIONS)) {
    if (info.colos.includes(colo.toLowerCase())) {
      return region as Region
    }
  }
  return null
}
```

### Distance Calculation

Use Haversine formula for `findNearest()`:

```typescript
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371 // Earth radius in km
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}
```

### Replication Implementation

For leader-follower replication:

1. Leader maintains list of followers in storage
2. On write, leader fans out to followers (async by default)
3. Followers store replication cursor/timestamp
4. Lag = leader timestamp - follower cursor

```typescript
async function replicateToFollowers(
  state: DurableObjectState,
  change: CDCEvent
): Promise<void> {
  const followers = await state.storage.get<DigitalObjectRef[]>(STORAGE_KEYS.FOLLOWERS) ?? []

  await Promise.allSettled(
    followers.map(follower =>
      fetch(follower, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
      })
    )
  )
}
```

### Migration Strategy

**Graceful migration**:
1. Stop accepting new writes
2. Wait for in-flight requests to complete
3. Transfer state to new location
4. Update DNS/routing
5. Resume in new colo

**Immediate migration**:
1. Transfer state snapshot
2. Switch routing immediately
3. In-flight requests may fail

### Testing Strategy

Each file should have corresponding tests:

```typescript
// info.test.ts
describe('getColoInfo', () => {
  it('should return current colo information', async () => {})
  it('should return null for unknown colo', async () => {})
})

// fork.test.ts
describe('forkDO', () => {
  it('should create replica in target colo', async () => {})
  it('should sync data when syncData option is true', async () => {})
  it('should set up continuous replication', async () => {})
})

// migrate.test.ts
describe('migrateDO', () => {
  it('should migrate with graceful strategy', async () => {})
  it('should migrate with immediate strategy', async () => {})
  it('should respect timeout option', async () => {})
})
```

### JSDoc Requirements

All exported functions must have complete JSDoc:

```typescript
/**
 * Get information about the current colo where this DO is running
 *
 * @param state - The DurableObjectState instance
 * @returns ColoInfo with colo code, region, and metadata
 *
 * @example
 * ```typescript
 * const info = await getColoInfo(this.state)
 * console.log(info.colo) // 'iad'
 * console.log(info.region) // 'enam'
 * ```
 */
export async function getColoInfo(state: DurableObjectState): Promise<ColoInfo>
```

## Dependencies

- `types/colo.ts` - Type definitions
- `types/identity.ts` - DigitalObjectRef
- No external runtime dependencies

## Naming Conventions

Follow project conventions:

- Functions: camelCase (`getColoInfo`, `forkDO`)
- Types/Interfaces: PascalCase (`ColoInfo`, `ForkOptions`)
- Constants: UPPER_SNAKE_CASE (`STORAGE_KEYS`, `COLO_ERRORS`)
- Events: NS.Object.event (`Colo.Migration.started`, `Colo.Fork.completed`)

## Event Emission

Emit events for observability:

```typescript
const COLO_EVENTS = {
  FORK_STARTED: 'Colo.Fork.started',
  FORK_COMPLETED: 'Colo.Fork.completed',
  FORK_FAILED: 'Colo.Fork.failed',
  MIGRATION_STARTED: 'Colo.Migration.started',
  MIGRATION_COMPLETED: 'Colo.Migration.completed',
  MIGRATION_FAILED: 'Colo.Migration.failed',
  FOLLOWER_ADDED: 'Colo.Follower.added',
  FOLLOWER_REMOVED: 'Colo.Follower.removed',
  REPLICATION_LAG_HIGH: 'Colo.Replication.lagHigh',
} as const
```
