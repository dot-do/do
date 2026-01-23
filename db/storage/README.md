# Storage Layer

Three-tier storage architecture with CDC (Change Data Capture) for Digital Objects.

## Purpose

The Storage Layer provides tiered data persistence optimized for different access patterns:

- **Hot Storage**: DO SQLite + Vortex columnar format (~4ms latency)
- **Warm Storage**: Cloudflare Edge Cache API (~10ms latency, free)
- **Cold Storage**: R2 + Apache Iceberg/Parquet (~69ms latency, $0.015/GB/mo)

## Three-Tier Architecture

```
                    ┌─────────────────┐
                    │   Application   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              v              v              v
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │   Hot    │  │   Warm   │  │   Cold   │
        │  SQLite  │  │  Cache   │  │  R2/Ice  │
        │  ~4ms    │  │  ~10ms   │  │  ~69ms   │
        └──────────┘  └──────────┘  └──────────┘
              │              │              │
              └──────────────┴──────────────┘
                             │
                             v
                    ┌─────────────────┐
                    │   CDC Events    │
                    │   (streaming)   │
                    └─────────────────┘
```

### Hot Storage (DO SQLite + Vortex)

Primary storage tier for active data within Durable Objects.

| Feature | Description |
|---------|-------------|
| **Technology** | SQLite in Durable Object |
| **Latency** | ~4ms |
| **Capacity** | 10GB per DO |
| **Format** | Row-based + Vortex columnar |
| **Use Case** | Active data, real-time queries |

```typescript
// Hot storage for active collections
const hot = new HotStorage(sqliteStorage)

// Standard CRUD operations
await hot.insert('users', { id: '1', name: 'Alice' })
await hot.query('users', { where: { name: 'Alice' } })
await hot.update('users', '1', { name: 'Alice Smith' })
await hot.delete('users', '1')

// CDC events automatically emitted
```

### Warm Storage (Edge Cache)

Caching tier using Cloudflare's Cache API for frequently accessed data.

| Feature | Description |
|---------|-------------|
| **Technology** | Cloudflare Cache API |
| **Latency** | ~10ms |
| **Cost** | Free (included in Workers) |
| **TTL** | Configurable (1min - 1year) |
| **Use Case** | Read-heavy workloads, query results |

```typescript
// Warm storage for caching
const warm = new WarmStorage(caches)

// Cache query results
await warm.set('users:recent', recentUsers, { ttl: 60 })
const cached = await warm.get('users:recent')

// Automatic invalidation on mutations
warm.invalidate('users:*')
```

### Cold Storage (R2 + Iceberg)

Long-term archival storage using R2 with Apache Iceberg table format.

| Feature | Description |
|---------|-------------|
| **Technology** | R2 + Apache Iceberg |
| **Latency** | ~69ms |
| **Cost** | $0.015/GB/month |
| **Format** | Parquet columnar files |
| **Use Case** | Historical data, analytics, compliance |

```typescript
// Cold storage for archival
const cold = new ColdStorage(r2Bucket)

// Archive old snapshots
await cold.archive(snapshot)

// Query historical data
const history = await cold.query('users', {
  timeRange: { start: lastMonth, end: today },
  partitions: { year: 2024, month: 1 }
})

// Time travel queries via Iceberg
const asOf = await cold.queryAsOf('users', timestamp)
```

## Vortex Blob Format

Vortex is a columnar blob format optimized for storage in DO SQLite blobs.

### Why Vortex?

| Feature | Row-Based | Vortex Columnar |
|---------|-----------|-----------------|
| Single row read | Fast | Medium |
| Column aggregation | Slow (full scan) | Fast (column-only) |
| Compression ratio | ~2x | ~10x |
| Append performance | Fast | Medium |
| Analytics queries | Poor | Excellent |

### Vortex Structure

```
┌─────────────────────────────────────┐
│           Vortex Blob               │
├─────────────────────────────────────┤
│ Header (magic, version, metadata)   │
├─────────────────────────────────────┤
│ Column 1: id        [compressed]    │
│ Column 2: name      [compressed]    │
│ Column 3: email     [compressed]    │
│ Column 4: created   [compressed]    │
├─────────────────────────────────────┤
│ Column Index (offsets, types)       │
├─────────────────────────────────────┤
│ Footer (checksum, row count)        │
└─────────────────────────────────────┘
```

### Encoding Types

| Type | Encoding | Description |
|------|----------|-------------|
| `string` | Dictionary + RLE | Dictionary encoding with run-length |
| `number` | Delta + BitPack | Delta encoding with bit packing |
| `boolean` | BitVector | Packed bits (8 per byte) |
| `date` | Delta | Delta from epoch in ms |
| `json` | CBOR | Compact binary object representation |
| `null` | Bitmap | Null bitmap for nullable columns |

### Usage

```typescript
import { VortexEncoder, VortexDecoder } from './vortex'

// Encode rows to Vortex blob
const encoder = new VortexEncoder(schema)
encoder.addRows(rows)
const blob = encoder.finish()

// Store in SQLite blob column
await db.exec('INSERT INTO vortex_data (blob) VALUES (?)', [blob])

// Decode Vortex blob
const decoder = new VortexDecoder(blob)

// Read specific columns only (no full scan)
const names = decoder.readColumn('name')
const emails = decoder.readColumn('email')

// Or read all rows
const allRows = decoder.readAll()
```

## Snapshot Management

Snapshots capture the complete state of a DO for persistence and recovery.

### Snapshot Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Full** | Complete state dump | Initial backup, periodic full backup |
| **Incremental** | Changes since parent | Frequent backups, point-in-time |

### Snapshot Flow

```
DO State
    │
    v
┌──────────────────┐
│  Take Snapshot   │
│  (serialize)     │
└────────┬─────────┘
         │
         v
┌──────────────────┐     ┌──────────────────┐
│  Vortex Encode   │────>│  Store in Hot    │
│  (compress)      │     │  (SQLite blob)   │
└────────┬─────────┘     └──────────────────┘
         │
         v (async)
┌──────────────────┐     ┌──────────────────┐
│  Tier Promotion  │────>│  Archive to Cold │
│  (age-based)     │     │  (R2/Iceberg)    │
└──────────────────┘     └──────────────────┘
```

### Snapshot Lifecycle

```typescript
import { SnapshotManager } from './snapshots'

const snapshots = new SnapshotManager({
  hot: hotStorage,
  cold: coldStorage,
})

// Take a full snapshot
const snapshot = await snapshots.create('full', {
  doId: 'do_123',
  doType: 'UserStore',
  tables: { users: [...], orders: [...] }
})

// Take incremental snapshot
const incremental = await snapshots.create('incremental', {
  parentId: snapshot.id,
  changes: cdcEvents
})

// Restore from snapshot
await snapshots.restore(snapshot.id)

// List snapshots
const history = await snapshots.list({
  doId: 'do_123',
  limit: 10
})

// Promote old snapshots to cold storage
await snapshots.promote({
  olderThan: days(30),
  targetTier: 'cold'
})
```

### Retention Policy

```typescript
// Configure retention
snapshots.setRetention({
  hot: { maxAge: days(7), maxCount: 100 },
  cold: { maxAge: years(7), maxCount: null },
  incrementalChain: { maxLength: 100 },
})

// Cleanup expired snapshots
await snapshots.cleanup()
```

## CDC (Change Data Capture)

Every mutation in hot storage generates CDC events for downstream consumers.

### CDC Event Structure

```typescript
interface CDCEvent<T = unknown> {
  id: string              // Unique event ID
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  collection: string      // Table/collection name
  documentId: string      // Row/document ID
  timestamp: number       // When change occurred
  sequence: number        // Ordering sequence
  before?: T              // State before (UPDATE/DELETE)
  after?: T               // State after (INSERT/UPDATE)
  changedFields?: string[] // Changed fields (UPDATE)
  source?: string         // Source DO ID
  correlationId?: string  // Tracing correlation
}
```

### CDC Generation

```typescript
// CDC events are automatically generated on mutations
await hot.insert('users', { id: '1', name: 'Alice' })
// Emits: { operation: 'INSERT', after: { id: '1', name: 'Alice' } }

await hot.update('users', '1', { name: 'Alice Smith' })
// Emits: { operation: 'UPDATE', before: { name: 'Alice' }, after: { name: 'Alice Smith' }, changedFields: ['name'] }

await hot.delete('users', '1')
// Emits: { operation: 'DELETE', before: { id: '1', name: 'Alice Smith' } }
```

### CDC Subscription

```typescript
import { CDCSubscription } from '../cdc'

// Subscribe to changes
const subscription = cdc.subscribe({
  collections: ['users', 'orders'],
  operations: ['INSERT', 'UPDATE'],
  fromCursor: lastCursor,
  batchSize: 100,
})

// Process events
for await (const batch of subscription) {
  for (const event of batch.events) {
    await processEvent(event)
  }
  await saveCursor(batch.cursor)
}
```

### CDC Use Cases

| Use Case | Description |
|----------|-------------|
| **Replication** | Sync data to other DOs or external systems |
| **Analytics** | Stream changes to data warehouse |
| **Search** | Update search indexes in real-time |
| **Audit Log** | Track all data changes for compliance |
| **Webhooks** | Trigger webhooks on data changes |
| **Caching** | Invalidate caches on mutations |

## Storage Sync

Synchronization between storage tiers maintains consistency.

### Sync Flow

```
Hot (SQLite)
    │
    │ CDC Events
    v
┌──────────────────┐
│  Sync Manager    │
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
    v         v
  Warm      Cold
(Cache)   (R2/Ice)
```

### Sync Strategy

```typescript
import { StorageSync } from './index'

const sync = new StorageSync({
  hot: hotStorage,
  warm: warmStorage,
  cold: coldStorage,
})

// Configure sync policies
sync.configure({
  warmSync: {
    enabled: true,
    ttl: minutes(5),
    collections: ['users', 'products'],
  },
  coldSync: {
    enabled: true,
    schedule: 'hourly',
    minAge: days(1),
  },
})

// Manual sync
await sync.syncToWarm()
await sync.syncToCold()

// Get sync state
const state = await sync.getState()
// { lastHotSequence: 1000, lastWarmSequence: 950, lastColdSequence: 800, ... }
```

## File Structure

```
src/storage/
  index.ts            # Storage factory and exports
  hot.ts              # DO SQLite storage
  warm.ts             # Edge Cache storage
  cold.ts             # R2/Iceberg storage
  vortex.ts           # Vortex blob encoding
  snapshots.ts        # Snapshot management
  __tests__/
    hot.test.ts
    warm.test.ts
    cold.test.ts
    vortex.test.ts
    snapshots.test.ts
    index.test.ts
```

## Usage

```typescript
import {
  createStorage,
  HotStorage,
  WarmStorage,
  ColdStorage,
  VortexEncoder,
  SnapshotManager,
} from '@do/core/storage'

// Create unified storage
const storage = createStorage({
  sqlite: env.DO_STORAGE,
  cache: caches,
  r2: env.R2_BUCKET,
})

// Access specific tiers
const hot = storage.hot
const warm = storage.warm
const cold = storage.cold

// Automatic tiering
await storage.put('users', data)  // Goes to hot
await storage.query('users', q)   // Checks warm, falls back to hot
await storage.archive('users', { olderThan: days(30) })  // Moves to cold

// CDC integration
storage.on('change', (event) => {
  console.log(`${event.operation} on ${event.collection}`)
})
```

## Configuration

```typescript
interface StorageConfig {
  // Hot tier
  hot: {
    enabled: true
    maxSize: '10GB'
    vortexThreshold: 1000  // Rows before columnar conversion
  }

  // Warm tier
  warm: {
    enabled: true
    defaultTTL: 300  // 5 minutes
    maxEntries: 10000
  }

  // Cold tier
  cold: {
    enabled: true
    bucket: 'my-bucket'
    prefix: 'iceberg/'
    partitionBy: ['year', 'month']
    compressionCodec: 'zstd'
  }

  // Sync settings
  sync: {
    batchSize: 1000
    interval: 60000  // 1 minute
  }
}
```

## Related

- [Types](/types/storage.ts) - Storage type definitions
- [CDC](/src/cdc/) - Change Data Capture system
- [DO](/src/do/) - Base Digital Object class
