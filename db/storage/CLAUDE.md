# Storage Layer Implementation Guidelines

## Overview

This module implements the three-tier storage architecture for Digital Objects:
- Hot: DO SQLite with Vortex columnar encoding
- Warm: Cloudflare Edge Cache API
- Cold: R2 with Apache Iceberg table format

## Architecture Principles

### 1. Tier Separation
Each storage tier is independent and can operate standalone:
- Hot storage is always available within a DO
- Warm storage requires Cache API access (Workers runtime)
- Cold storage requires R2 bucket binding

### 2. CDC First
Every mutation in hot storage MUST generate a CDC event:
```typescript
// Every write operation must emit CDC
async insert(collection: string, doc: T): Promise<void> {
  await this.sqlite.insert(collection, doc)
  await this.emitCDC({
    operation: 'INSERT',
    collection,
    documentId: doc.id,
    after: doc,
  })
}
```

### 3. Vortex for Analytics
Use Vortex columnar encoding when:
- Row count exceeds threshold (default: 1000)
- Analytical queries are common
- Compression is beneficial

Keep row-based storage when:
- Frequent single-row updates
- Real-time transactional workloads
- Row count is small

## Implementation Notes

### hot.ts - DO SQLite Storage

Key responsibilities:
1. Wrap DO's SQLite storage with type-safe operations
2. Generate CDC events on all mutations
3. Manage Vortex encoding for large collections
4. Handle transactions and consistency

```typescript
// Pattern for hot storage operations
class HotStorage {
  constructor(
    private sqlite: SqlStorage,
    private cdc: CDCEmitter,
  ) {}

  async insert<T extends { id: string }>(
    collection: string,
    document: T,
  ): Promise<void> {
    const sequence = await this.nextSequence()

    await this.sqlite.exec(
      `INSERT INTO ${collection} (id, data) VALUES (?, ?)`,
      [document.id, JSON.stringify(document)]
    )

    await this.cdc.emit({
      id: crypto.randomUUID(),
      operation: 'INSERT',
      collection,
      documentId: document.id,
      timestamp: Date.now(),
      sequence,
      after: document,
    })
  }
}
```

### warm.ts - Edge Cache Storage

Key responsibilities:
1. Implement cache-aside pattern
2. Manage cache keys and TTLs
3. Provide invalidation by pattern
4. Handle cache misses gracefully

```typescript
// Pattern for warm storage
class WarmStorage {
  constructor(private cache: Cache) {}

  async get<T>(key: string): Promise<T | null> {
    const response = await this.cache.match(this.toRequest(key))
    if (!response) return null
    return response.json()
  }

  async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
    const response = new Response(JSON.stringify(value), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `max-age=${options?.ttl ?? 300}`,
      },
    })
    await this.cache.put(this.toRequest(key), response)
  }

  private toRequest(key: string): Request {
    return new Request(`https://cache.internal/${key}`)
  }
}
```

### cold.ts - R2/Iceberg Storage

Key responsibilities:
1. Manage R2 object lifecycle
2. Implement Iceberg table format
3. Handle Parquet file I/O
4. Support time-travel queries

```typescript
// Pattern for cold storage
class ColdStorage {
  constructor(private r2: R2Bucket) {}

  async archive(snapshot: Snapshot): Promise<R2ObjectRef> {
    const key = this.buildKey(snapshot)
    const parquet = await this.toParquet(snapshot)

    return this.r2.put(key, parquet, {
      customMetadata: {
        doId: snapshot.doId,
        doType: snapshot.doType,
        timestamp: String(snapshot.timestamp),
        version: String(snapshot.version),
      },
    })
  }

  private buildKey(snapshot: Snapshot): string {
    const date = new Date(snapshot.timestamp)
    return `iceberg/${snapshot.doType}/${snapshot.doId}/year=${date.getFullYear()}/month=${date.getMonth() + 1}/${snapshot.id}.parquet`
  }
}
```

### vortex.ts - Columnar Encoding

Key responsibilities:
1. Encode rows to columnar blob format
2. Decode specific columns without full scan
3. Apply compression (dictionary, RLE, delta)
4. Maintain schema information

```typescript
// Vortex blob layout
// [Header: 16 bytes]
//   - Magic: 4 bytes ("VRTX")
//   - Version: 2 bytes
//   - Flags: 2 bytes
//   - Column count: 4 bytes
//   - Row count: 4 bytes
// [Column data: variable]
//   - Per column: [type, encoding, compressed data]
// [Column index: variable]
//   - Per column: [name, offset, length]
// [Footer: 8 bytes]
//   - Checksum: 4 bytes
//   - Index offset: 4 bytes

const VORTEX_MAGIC = new Uint8Array([0x56, 0x52, 0x54, 0x58]) // "VRTX"
const VORTEX_VERSION = 1
```

### snapshots.ts - Snapshot Management

Key responsibilities:
1. Create full and incremental snapshots
2. Manage snapshot lifecycle (create, restore, delete)
3. Handle tier promotion (hot -> cold)
4. Implement retention policies

```typescript
// Snapshot creation pattern
class SnapshotManager {
  async create(
    type: 'full' | 'incremental',
    data: SnapshotData,
  ): Promise<Snapshot> {
    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      doId: data.doId,
      doType: data.doType,
      timestamp: Date.now(),
      version: await this.nextVersion(data.doId),
      tables: data.tables,
      metadata: {
        type,
        sizeBytes: this.calculateSize(data.tables),
        rowCount: this.countRows(data.tables),
        parentId: type === 'incremental' ? data.parentId : undefined,
      },
    }

    // Store in hot tier
    await this.hot.storeSnapshot(snapshot)

    return snapshot
  }
}
```

## Testing Guidelines

### Unit Tests
Test each tier in isolation with mocked dependencies:

```typescript
describe('HotStorage', () => {
  let storage: HotStorage
  let mockSqlite: MockSqlStorage
  let mockCdc: MockCDCEmitter

  beforeEach(() => {
    mockSqlite = new MockSqlStorage()
    mockCdc = new MockCDCEmitter()
    storage = new HotStorage(mockSqlite, mockCdc)
  })

  it('should emit CDC event on insert', async () => {
    await storage.insert('users', { id: '1', name: 'Alice' })

    expect(mockCdc.events).toHaveLength(1)
    expect(mockCdc.events[0]).toMatchObject({
      operation: 'INSERT',
      collection: 'users',
      documentId: '1',
    })
  })
})
```

### Integration Tests
Test tier interactions and sync:

```typescript
describe('StorageSync', () => {
  it('should sync changes from hot to cold', async () => {
    // Setup
    await hot.insert('users', testUser)

    // Sync
    await sync.syncToCold()

    // Verify
    const archived = await cold.query('users', { id: testUser.id })
    expect(archived).toEqual([testUser])
  })
})
```

## Performance Considerations

### Hot Storage
- Use prepared statements for repeated queries
- Batch inserts when possible
- Keep indexes minimal (id + commonly queried fields)

### Warm Storage
- Set appropriate TTLs (shorter for volatile data)
- Use hierarchical cache keys for invalidation
- Don't cache large objects (>1MB)

### Cold Storage
- Partition by time (year/month) for efficient queries
- Use Parquet predicate pushdown
- Batch writes to reduce R2 operations

### Vortex
- Only use for collections > 1000 rows
- Choose encoding based on data characteristics
- Pre-allocate buffers for known sizes

## Error Handling

```typescript
// Storage errors should be typed
class StorageError extends Error {
  constructor(
    message: string,
    public tier: StorageTier,
    public operation: string,
    public cause?: Error,
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

// Wrap tier operations with error handling
async function withErrorHandling<T>(
  tier: StorageTier,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw new StorageError(
      `${tier} storage ${operation} failed`,
      tier,
      operation,
      error as Error,
    )
  }
}
```

## Type Imports

Always import types from the types package:

```typescript
import type {
  StorageTier,
  CDCEvent,
  CDCOperation,
  Snapshot,
  SnapshotMetadata,
  R2Storage,
  R2ObjectRef,
  SyncState,
  SyncResult,
} from '@do/types/storage'
```

## File Dependencies

```
index.ts
  ├── hot.ts
  ├── warm.ts
  ├── cold.ts
  ├── vortex.ts
  └── snapshots.ts
        ├── hot.ts (for storage)
        ├── cold.ts (for archival)
        └── vortex.ts (for encoding)
```
