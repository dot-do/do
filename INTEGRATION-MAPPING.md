# Integration Mapping: @dotdo/do → Primitives Foundation

## Current Architecture (do repo)

```
core/src/
├── index.ts       # DigitalObject class (537 lines)
│                  # - Extends DurableRPC
│                  # - Collections API (ChainableCollection)
│                  # - Relationships API
│                  # - Functions API
│                  # - CDC integration
├── durable-rpc.ts # DurableRPC base (467 lines)
│                  # - HTTP batch RPC via capnweb
│                  # - WebSocket with hibernation
│                  # - REST-style /$method calls
├── rels.ts        # Relationships (133 lines)
│                  # - _rels table: id, from, predicate, to, reverse
│                  # - relationships(id) - outgoing edges
│                  # - references(id) - incoming edges
├── cdc.ts         # Change Data Capture (99 lines)
│                  # - SemanticEvent type
│                  # - Emits to Pipeline binding
├── functions.ts   # Functions as Data (690 lines)
│                  # - CodeFunction, GenerativeFunction
│                  # - Function registry with CDC
│                  # - $.fnName proxy pattern
└── do.ts          # DO() factory (~300 lines)
                   # - Schema with type inference
                   # - Cascades (-> <-)
                   # - Events (onNounEvent)
                   # - Schedules (everyInterval)
```

## Primitives Foundation (primitives.org.ai)

```
packages/
├── digital-objects/
│   └── src/do.ts      # DO() factory (~1000 lines)
│                      # - Full schema parsing
│                      # - Cascades (<-> ~> <~>)
│                      # - Type inference
│                      # - Functions as data
│                      # - Events, schedules, migrations
│                      # - Callable extension pattern
│
├── ai-database/
│   └── src/           # DatabaseDO pattern
│                      # - _data table: id, type, data, timestamps
│                      # - _rels table: from_id, relation, to_id
│                      # - Query operations ($gt, $in, etc.)
│                      # - toSqliteValue() for booleans
│
├── digital-workers/
│   └── src/           # Coordination patterns
│                      # - Stateless actions (notify, decide, askAI)
│
├── ai-providers/
│   └── src/           # Model routing
│                      # - AI Gateway integration
│                      # - Provider registry
│
└── org.ai/
    └── types/         # Shared types
                       # - Thing, Event, Action, Worker, Tool
```

## Feature Mapping

| Feature | do repo | primitives | Action |
|---------|---------|------------|--------|
| **DO() factory** | Basic (300 LOC) | Full (1000 LOC) | Use digital-objects |
| **Schema parsing** | Type inference only | Full parsing + validation | Use digital-objects |
| **Cascades** | -> <- only | All: -> <- <-> ~> <~ <~> | Use digital-objects |
| **Functions** | Separate registry | Built into DO() | Consolidate |
| **Events/Schedules** | Basic | Full with migrations | Use digital-objects |
| **Storage** | @dotdo/collections | Direct SQLite pattern | Use ai-database pattern |
| **_rels table** | from/predicate/to | from_id/relation/to_id | Standardize naming |
| **CDC** | SemanticEvent | Needs standardization | Define in org.ai |
| **DurableRPC** | Yes | No | Keep in @dotdo/do |
| **Types** | Local definitions | org.ai shared | Export from org.ai |

## Proposed Architecture

### @dotdo/do (thin runtime layer)

```typescript
// src/index.ts
import { DurableRPC } from './durable-rpc.js'
import { DO, DODefinition, DOContext } from 'digital-objects'
import type { Thing, Event as CDCEvent } from 'org.ai'

export { DO, DODefinition, DOContext }
export { type Thing, type CDCEvent as SemanticEvent }

export class DigitalObject extends DurableRPC {
  // Keep: $id, $type, $context
  // Keep: DurableRPC inheritance for HTTP/WS/RPC

  // Replace: collections with ai-database _data pattern
  // Replace: rels with ai-database _rels pattern
  // Replace: functions registry with digital-objects pattern
  // Replace: CDC types with org.ai types
}
```

### Package Dependencies

```json
{
  "name": "@dotdo/do",
  "dependencies": {
    "@dotdo/capnweb": "workspace:*",
    "digital-objects": "workspace:*",
    "org.ai": "workspace:*"
  }
}
```

### Type Re-exports

```typescript
// @dotdo/do/types.ts
export {
  DODefinition,
  DOContext,
  DOInstance,
  DOStorage,
  CascadeDefinition,
  CascadeOperator,
} from 'digital-objects'

export type {
  Thing,
  Event,
  Action,
} from 'org.ai'

// Local types unique to @dotdo/do
export interface Relationship {
  id: string
  from: string
  predicate: string
  to: string
  reverse?: string
  createdAt: number
}

export interface SemanticEvent {
  id: string
  timestamp: string
  namespace: 'DO'
  object: string
  event: string
  type: string
  subject_type?: string
  predicate_type?: string
  object_type?: string
  context?: string
  by?: string
  in?: string
  data: Record<string, unknown>
  metadata: Record<string, unknown>
}
```

## Migration Steps

### Phase 1: Convergence (Now)
Since repos are separate, sync implementations:

1. **Audit** ✓ - This document
2. **Sync DO() patterns** - Update do repo do.ts to match digital-objects features
3. **Standardize _rels table** - Match ai-database naming (from_id, relation, to_id)
4. **Standardize CDC types** - Define SemanticEvent compatible with org.ai Event
5. **Update objects.do** - Use improved @dotdo/do

### Phase 2: Consolidation (Future)
When digital-objects is published to npm:

1. **Add dependency** - `@dotdo/do` depends on `digital-objects`
2. **Re-export DO()** - `export { DO } from 'digital-objects'`
3. **Re-export types** - `export type { DODefinition } from 'digital-objects'`
4. **Simplify @dotdo/do** - Just DurableRPC + DigitalObject runtime

## Key Decisions

### Keep in @dotdo/do
- `DurableRPC` - Unique runtime component for hibernation/RPC
- `DigitalObject` class - Instantiated as Durable Objects
- Relationship methods - `relate()`, `relationships()`, `references()`
- CDC emission logic - When/how to emit (not the types)

### Use from digital-objects (when published)
- `DO()` factory function
- Schema parsing and type inference
- Cascade parsing (`->`, `<->`, `~>`, etc.)
- Event/schedule/migration handler patterns
- `DODefinition`, `DOContext`, `DOInstance` types

### Use from ai-database
- `_data` table pattern (id, type, data, created_at, updated_at)
- `_rels` table pattern (from_id, relation, to_id, metadata)
- Query operations ($gt, $lt, $in, etc.)
- Boolean handling (`toSqliteValue()`)

## Schema Comparison: _rels Table

### Current @dotdo/do
```sql
CREATE TABLE IF NOT EXISTS _rels (
  id TEXT PRIMARY KEY,        -- Composite: from:predicate:to
  "from" TEXT NOT NULL,
  predicate TEXT NOT NULL,
  "to" TEXT NOT NULL,
  reverse TEXT,               -- Inverse predicate name
  created_at INTEGER          -- Unix timestamp
);
```

### ai-database (recommended)
```sql
CREATE TABLE IF NOT EXISTS _rels (
  from_id TEXT NOT NULL,
  relation TEXT NOT NULL,     -- "predicate" renamed to "relation"
  to_id TEXT NOT NULL,
  metadata TEXT,              -- JSON blob (more flexible)
  created_at TEXT NOT NULL,   -- ISO timestamp
  PRIMARY KEY (from_id, relation, to_id)
);
```

### Migration Path
1. Add `metadata` column (JSON) to store `reverse` and other properties
2. Rename columns: `from`→`from_id`, `to`→`to_id`, `predicate`→`relation`
3. Change `created_at` from INTEGER to TEXT (ISO format)
4. Use composite primary key instead of synthetic `id` column

### Use from org.ai
- `Thing` base type
- `Event` type (5W+H structured events)
- `Action` type for relationships
- Other shared primitives

## Event Type Mapping

### @dotdo/do SemanticEvent (CDC-focused)
```typescript
interface SemanticEvent {
  id: string
  timestamp: string
  namespace: 'DO'
  object: string           // 'Document', 'Relationship', 'Function'
  event: string            // 'created', 'updated', 'deleted'
  type: string             // 'DO.Document.created'
  subject_type?: string
  predicate_type?: string
  object_type?: string
  context?: string
  by?: string              // actor
  in?: string              // request ID
  data: Record<string, unknown>
  metadata: Record<string, unknown>
}
```

### org.ai Event (5W+H structured)
```typescript
interface Event {
  $id: string
  $type: string
  what: { action: string; verb?: string; subject?: Thing; object?: Thing }
  who: { id: string; type: 'user' | 'system' | 'agent' | 'service'; name?: string }
  when: { timestamp: Date; duration?: number; sequence?: number }
  where?: { ns?: string; url?: string; location?: { lat: number; lng: number } }
  why?: { reason?: string; trigger?: string; parent?: string }
  how?: { method?: string; tool?: string; details?: Record<string, unknown> }
}
```

### Conversion: SemanticEvent → org.ai Event
```typescript
function toOrgAIEvent(cdc: SemanticEvent): Event {
  return {
    $id: cdc.id,
    $type: `https://events.do/${cdc.type}`,
    what: {
      action: cdc.event,
      verb: cdc.predicate_type,
      subject: cdc.subject_type ? { $id: '', $type: cdc.subject_type } : undefined,
      object: cdc.object_type ? { $id: '', $type: cdc.object_type } : undefined,
    },
    who: {
      id: cdc.by || 'system',
      type: cdc.by?.startsWith('agent:') ? 'agent' : cdc.by?.startsWith('ip:') ? 'system' : 'user',
      name: cdc.by,
    },
    when: {
      timestamp: new Date(cdc.timestamp),
    },
    where: {
      ns: cdc.namespace,
      url: cdc.context,
    },
    how: {
      details: cdc.data,
    },
  }
}
```

### Recommendation
Keep both event types:
- `SemanticEvent` for internal CDC pipeline (optimized for streaming)
- `org.ai Event` for external APIs and cross-system integration
- Provide conversion utilities in both directions

## Canonical Source of Truth

**digital-objects** (primitives.org.ai) is the canonical source for:
- `DO()` factory function and all parsing logic
- `DigitalObjectDefinition` class
- Type system (`DODefinition`, `DOContext`, `DOInstance`, `InferSchema`)
- All cascade operators and parsing (`->`, `<-`, `<->`, `~>`, `<~`, `<~>`)
- Event/schedule/migration patterns

**@dotdo/do** (do repo) is the canonical source for:
- `DurableRPC` base class (hibernation, WebSocket, HTTP batch RPC)
- `DigitalObject` runtime class (extends DurableRPC)
- Collections API with CDC integration
- Functions registry with evaluator/generator

### Convergence Strategy

Until digital-objects is published to npm:
1. Both repos maintain their own DO() implementations
2. Features should be synced: digital-objects leads, @dotdo/do follows
3. APIs should be compatible for future integration

When digital-objects is published:
```typescript
// @dotdo/do/src/index.ts
export { DO, DODefinition, DOContext, DOInstance, InferSchema } from 'digital-objects'
export { DurableRPC } from './durable-rpc.js'
export { DigitalObject } from './digital-object.js'
```
