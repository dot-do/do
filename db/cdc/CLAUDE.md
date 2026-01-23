# CDC Implementation Guidelines

## Overview

CDC (Change Data Capture) streams mutations through the DO hierarchy via `$context` and archives to R2/Iceberg.

## Module Responsibilities

| File | Purpose |
|------|---------|
| `events.ts` | Generate CDCEvent on mutations |
| `streaming.ts` | Propagate events up $context chain |
| `storage.ts` | Archive to R2 in Parquet/Iceberg format |
| `replay.ts` | Cursor-based event replay and checkpoints |

## Key Types

Import from `types/storage.ts`:
- `CDCEvent<T>` - The event payload
- `CDCOperation` - INSERT, UPDATE, DELETE
- `CDCCursor` - Pagination cursor (sequence + timestamp)
- `CDCOptions` - Subscription/replay options
- `CDCBatch` - Batch of events with cursor
- `CDCSubscription` - Active subscription handle

## Implementation Rules

### Event Generation (events.ts)

1. Generate unique event ID using `crypto.randomUUID()`
2. Sequence numbers are monotonically increasing per DO
3. Include `correlationId` for distributed tracing
4. `changedFields` only populated for UPDATE operations
5. `before`/`after` inclusion controlled by options

### Streaming (streaming.ts)

1. Resolve `$context` to parent DO stub
2. Batch events before sending (default: 100 events or 1s)
3. Handle parent unavailable gracefully (buffer and retry)
4. Support transformation/aggregation hooks
5. Track delivery with acknowledgments

### Storage (storage.ts)

1. Partition by time: year/month/day
2. Use Parquet columnar format
3. Maintain Iceberg metadata for time-travel
4. Compact small files periodically
5. Schema evolution via Iceberg

### Replay (replay.ts)

1. Support cursor-based pagination
2. Merge hot (SQLite) and cold (R2) sources
3. Checkpoint management for subscribers
4. Exactly-once delivery semantics
5. Handle gaps in sequence numbers

## Naming Conventions

- Classes: PascalCase (`CDCEventEmitter`, `ContextStreamer`)
- Methods: camelCase (`emit`, `propagate`, `archive`)
- Events: NS.Object.event (`CDC.Event.emitted`, `CDC.Stream.propagated`)

## Error Handling

1. Wrap all async operations in try/catch
2. Use typed error classes (e.g., `CDCStreamError`)
3. Log errors with correlation IDs
4. Implement circuit breaker for parent streaming

## Testing Strategy

1. Unit tests for each module
2. Integration tests for full flow
3. Mock R2 for storage tests
4. Test cursor pagination edge cases
5. Verify event ordering guarantees

## Performance Targets

- Event generation: <1ms
- Local batch flush: <10ms
- Parent propagation: <50ms
- R2 archive: <100ms
- Replay throughput: 10k events/sec

## Dependencies

- `types/storage.ts` - Type definitions
- `src/do/DigitalObject.ts` - Base DO class (Epic 1)
- `src/rpc/client.ts` - RPC client for parent calls (Epic 2)
