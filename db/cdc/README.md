# CDC Streaming

You're building a system where every change matters. Every insert, update, delete - they all tell a story. CDC captures that story and streams it exactly where it needs to go.

## What CDC Does For You

When data changes in any Digital Object, CDC:

1. **Captures the change** - INSERT, UPDATE, or DELETE with before/after states
2. **Streams it up the hierarchy** - Child events bubble to parents via `$context`
3. **Persists for replay** - Every event stored for recovery from any point in time
4. **Archives to cold storage** - R2/Iceberg for cost-effective long-term retention

```
crm.headless.ly/acme (change happens)
       │
       ▼ CDC Event
crm.headless.ly (parent receives)
       │
       ▼ CDC Event (aggregated)
headless.ly (grandparent receives)
       │
       ▼ CDC Event (aggregated)
startups.studio (root receives)
       │
       ▼ Archive
R2/Iceberg (cold storage)
```

## Event Types

Every mutation generates a `CDCEvent`:

```typescript
interface CDCEvent<T = unknown> {
  id: string                    // Unique event ID
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  collection: string            // Table/collection name
  documentId: string            // Row/document ID
  timestamp: number             // When it happened
  sequence: number              // Ordering within DO
  before?: T                    // State before (UPDATE/DELETE)
  after?: T                     // State after (INSERT/UPDATE)
  changedFields?: string[]      // What changed (UPDATE)
  source?: string               // Originating DO
  correlationId?: string        // For distributed tracing
}
```

## $context Hierarchical Streaming

Every DO has a `$context` pointing to its parent. CDC events automatically propagate up this chain:

```typescript
// When tenant DO changes...
const tenantDO = {
  $id: 'https://crm.headless.ly/acme',
  $context: 'https://crm.headless.ly',  // Parent SaaS
}

// Event flows:
// 1. Captured in tenant DO
// 2. Streamed to crm.headless.ly (SaaS)
// 3. Streamed to headless.ly (Startup)
// 4. Streamed to startups.studio (Business)
// 5. Archived to R2
```

### Event Transformation

Parents can transform/aggregate events as they receive them:

```typescript
// Parent receives raw child events
onChildEvent(event: CDCEvent) {
  // Aggregate: count customer updates per hour
  // Transform: enrich with parent context
  // Filter: only propagate specific collections
}
```

## Batching and Buffering

CDC events are batched for efficiency:

```typescript
interface CDCOptions {
  batchSize?: number      // Max events per batch (default: 100)
  batchTimeout?: number   // Max wait time in ms (default: 1000)
  collections?: string[]  // Filter to specific collections
  operations?: CDCOperation[]  // Filter to specific operations
}
```

Events buffer locally until:
- Batch size reached
- Timeout exceeded
- Explicit flush

## R2/Iceberg Cold Storage

Events archive to R2 in Parquet format using Apache Iceberg table format:

```
r2://do-cdc/
  └── tables/
      └── {doId}/
          ├── metadata/
          │   └── v1.metadata.json
          └── data/
              └── year=2024/
                  └── month=01/
                      └── day=15/
                          └── 00000-0-{uuid}.parquet
```

### Storage Tiers

| Tier | Technology | Latency | Cost |
|------|------------|---------|------|
| Hot | DO SQLite | ~4ms | Included |
| Warm | Edge Cache | ~10ms | Free |
| Cold | R2 + Iceberg | ~69ms | $0.015/GB/mo |

### Parquet Benefits

- Columnar format for analytics queries
- High compression ratios
- Schema evolution support
- Time-travel queries via Iceberg snapshots

## Cursor-Based Replay

Replay events from any point in time:

```typescript
// Replay from specific cursor
const cursor: CDCCursor = {
  sequence: 1000,
  timestamp: Date.now() - 86400000  // 24h ago
}

for await (const batch of cdc.replay({ fromCursor: cursor })) {
  for (const event of batch.events) {
    await processEvent(event)
  }
}
```

### Replay Use Cases

- **Disaster recovery** - Rebuild state from events
- **Debugging** - Understand what happened when
- **Analytics** - Reprocess historical data
- **Sync** - Bring new subscribers up to date

## Checkpoint Management

Checkpoints track replay progress:

```typescript
interface Checkpoint {
  subscriberId: string
  cursor: CDCCursor
  createdAt: number
  updatedAt: number
}

// Save checkpoint after processing
await cdc.saveCheckpoint('my-processor', batch.cursor)

// Resume from checkpoint
const checkpoint = await cdc.getCheckpoint('my-processor')
await cdc.replay({ fromCursor: checkpoint.cursor })
```

### Checkpoint Storage

Checkpoints are stored in the DO's SQLite for hot access, with periodic backup to R2 for durability.

## Module Structure

```
src/cdc/
├── events.ts      # CDC event generation
├── streaming.ts   # $context chain streaming
├── storage.ts     # R2/Iceberg persistence
├── replay.ts      # Event replay and recovery
└── __tests__/
    ├── events.test.ts
    ├── streaming.test.ts
    ├── storage.test.ts
    └── replay.test.ts
```

## Quick Start

```typescript
import { CDCEventEmitter } from './events'
import { ContextStreamer } from './streaming'
import { CDCStorage } from './storage'
import { EventReplayer } from './replay'

// In your DigitalObject
class MyDO extends DigitalObject {
  private cdc = new CDCEventEmitter(this)
  private streamer = new ContextStreamer(this)
  private storage = new CDCStorage(this.env.R2)
  private replayer = new EventReplayer(this.storage)

  async updateThing(id: string, data: unknown) {
    const before = await this.db.get(id)
    await this.db.put(id, data)

    // Emit CDC event
    const event = await this.cdc.emit('UPDATE', 'things', id, {
      before,
      after: data,
    })

    // Stream to parent via $context
    await this.streamer.propagate(event)

    // Archive to cold storage (batched)
    await this.storage.archive(event)
  }
}
```

That's CDC. Every change captured. Every event streamed. Every moment recoverable.
