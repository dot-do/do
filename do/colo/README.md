# Colo Awareness Layer

Geographic intelligence for Digital Objects. Know where your DOs live, move them where you need them.

## The Problem

Your users are everywhere. Your Durable Objects are... somewhere.

Cloudflare runs 300+ data centers (colos) globally. When a user in Tokyo hits your app, their requests might route through the `nrt` colo. But if your DO was created by someone in New York, it might live in `iad`.

Every request crosses the Pacific. Every millisecond compounds.

## The Solution

The Colo Awareness Layer gives you full control over DO placement, migration, and replication. Place DOs near your users. Replicate for read performance. Migrate when patterns change.

```typescript
import { colo } from '@do/core/colo'

// Where am I?
const info = await colo.getInfo()
// { colo: 'nrt', region: 'apac', city: 'Tokyo', supportsDurableObjects: true }

// Fork to another region for low-latency reads
const europeReplica = await colo.fork('fra', {
  continuous: true,
  maxLag: 1000,
})

// Migrate the primary when usage patterns change
await colo.migrate('sin', { strategy: 'graceful' })
```

## Concepts

### Colos and Regions

Cloudflare organizes its network into **colos** (individual data centers) and **regions** (geographic groupings).

| Region | Code | Major Colos |
|--------|------|-------------|
| Western North America | `wnam` | SJC, LAX, SEA, DEN |
| Eastern North America | `enam` | IAD, DFW, ATL, ORD, JFK |
| Western Europe | `weur` | LHR, CDG, FRA, AMS |
| Eastern Europe | `eeur` | WAW, BUD, PRG, VIE |
| Asia Pacific | `apac` | NRT, SIN, HKG, BOM |
| Oceania | `oc` | SYD, MEL, AKL |
| South America | `sam` | GRU, EZE, SCL |
| Africa | `afr` | JNB, CPT, NBO |
| Middle East | `me` | DXB, TLV, RUH |

### Replication Modes

Three replication topologies for different use cases:

**Leader-Follower** (default): One primary DO handles writes. Followers receive replicated data for read performance.

```
          writes
  Client --------> Leader (IAD)
                     |
           replication
           /         \
    Follower       Follower
      (FRA)         (NRT)
```

**Multi-Leader**: Multiple DOs accept writes. Requires conflict resolution strategy.

```
  Client A           Client B
      |                  |
      v                  v
   Leader A  <---->  Leader B
    (IAD)    sync     (FRA)
```

**Peer-to-Peer**: All nodes are equal. Best for collaborative editing or CRDT-based systems.

### Jurisdiction and Data Residency

Some data must stay in specific regions (GDPR, data residency requirements).

```typescript
// Configure jurisdiction restrictions
const config: JurisdictionConfig = {
  allowedRegions: ['weur', 'eeur'],
  requiredCountries: ['DE', 'FR'],
  blockedColos: ['lhr'], // Post-Brexit, no UK
}
```

## Operations

### Get Current Colo Info

Know where your DO is running right now.

```typescript
const info = await colo.getInfo()
// {
//   colo: 'iad',
//   region: 'enam',
//   city: 'Ashburn',
//   country: 'US',
//   latitude: 38.9519,
//   longitude: -77.4480,
//   supportsDurableObjects: true
// }
```

### Fork to Another Colo

Create a replica in a different location. Perfect for read-heavy workloads with geographic distribution.

```typescript
// One-time fork with data sync
const replica = await colo.fork('sin', {
  name: 'asia-replica',
  syncData: true,
})

// Continuous replication with lag tolerance
const liveReplica = await colo.fork('fra', {
  continuous: true,
  maxLag: 500, // 500ms max replication lag
})
```

### Migrate Between Colos

Move the primary DO to a different location. Use when user patterns shift or for optimization.

```typescript
// Graceful migration - waits for in-flight requests
await colo.migrate('nrt', {
  strategy: 'graceful',
  timeout: 30000,
  wait: true,
})

// Immediate migration - faster but may drop requests
await colo.migrate('nrt', {
  strategy: 'immediate',
})
```

### Manage Followers

Add and remove followers for manual replication control.

```typescript
// Add a follower
await colo.addFollower('https://my-app.workers.dev/do/replica-1')

// List all followers
const followers = await colo.listFollowers()
// ['https://...', 'https://...']

// Remove a follower
await colo.removeFollower('https://my-app.workers.dev/do/replica-1')
```

### Colo-Aware Routing

Find the best colo for a given location or measure latency.

```typescript
// Find nearest colo to coordinates
const nearest = await colo.findNearest(35.6762, 139.6503) // Tokyo
// { colo: 'nrt', region: 'apac', ... }

// Ping a colo to measure latency
const latency = await colo.ping('fra')
// 145 (ms)

// List all colos in a region
const apacColos = await colo.listColos('apac')
// [{ colo: 'nrt', ... }, { colo: 'sin', ... }, ...]
```

## File Structure

```
do/colo/
  index.ts        # Colo operations factory and exports
  info.ts         # Get colo information
  fork.ts         # Fork DO to another colo
  migrate.ts      # Migrate DO between colos
  followers.ts    # Follower management
  routing.ts      # Colo-aware routing
  info.test.ts
  fork.test.ts
  migrate.test.ts
  followers.test.ts
  routing.test.ts
```

## Usage

```typescript
import {
  createColoOperations,
  getColoInfo,
  forkDO,
  migrateDO,
  addFollower,
  removeFollower,
  listFollowers,
  findNearestColo,
  pingColo,
} from '@do/core/colo'

// Factory pattern for a DO instance
const colo = createColoOperations(doInstance)

// Or use individual functions
const info = await getColoInfo(doInstance)
await forkDO(doInstance, 'fra', { continuous: true })
```

## Replication Example

Full replication setup with leader-follower topology:

```typescript
import { createColoOperations } from '@do/core/colo'
import type { ReplicationConfig } from '@do/types/colo'

// Configure replication
const config: ReplicationConfig = {
  mode: 'leader-follower',
  followers: [],
  maxLag: 1000,
  conflictResolution: {
    strategy: 'last-write-wins',
  },
  collections: ['users', 'orders'], // Only replicate these
}

// Set up the leader
const colo = createColoOperations(primaryDO)

// Fork to multiple regions
const europeReplica = await colo.fork('fra', { continuous: true })
const asiaReplica = await colo.fork('sin', { continuous: true })

// Check replication status
const status = await getReplicationStatus(primaryDO)
// {
//   mode: 'leader-follower',
//   role: 'leader',
//   followers: [
//     { ref: 'https://...', colo: 'fra', lag: 45, healthy: true },
//     { ref: 'https://...', colo: 'sin', lag: 120, healthy: true },
//   ],
//   lastSyncTimestamp: 1706000000000,
//   lag: 0,
//   healthy: true,
// }
```

## Related

- [Types](/types/colo.ts) - Colo type definitions
- [DO](/do/) - Base Digital Object class
- [Observability](/observability/) - Monitoring and metrics
