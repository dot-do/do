# Collections

Collections are the core data structures within Digital Objects. Every DO can contain these collections for managing entities, actions, and relationships.

## Overview

| Collection | Purpose | Key Types |
|------------|---------|-----------|
| Nouns | Entity type registry | `Noun` |
| Verbs | Action type registry | `Verb` |
| Things | Entity instances | `ThingExpanded`, `ThingCompact` |
| Actions | Durable action execution | `Action`, `ActionStatus` |
| Relationships | Graph-style entity linking | `Relationship`, `StoredRelation` |

## Nouns & Verbs

The linguistic pattern provides a natural way to define entity and action types.

### Nouns (Entity Types)

```typescript
interface Noun {
  id: string
  name: string
  singular: string    // 'customer'
  plural: string      // 'customers'
  slug: string        // 'customer'
  schema?: Record<string, unknown>
  description?: string
}
```

Example:
```typescript
const customerNoun: Noun = {
  id: 'noun_customer',
  name: 'Customer',
  singular: 'customer',
  plural: 'customers',
  slug: 'customer',
  schema: {
    name: 'string',
    email: 'string',
    company: '~>Company'  // Forward search relation
  }
}
```

### Verbs (Action Types)

Every verb has grammatical forms that map to the action lifecycle:

```typescript
interface Verb {
  id: string
  name: string
  action: string      // 'create' (imperative)
  act: string         // 'act' (short form)
  activity: string    // 'creating' (present participle)
  event: string       // 'created' (past tense - what happened)
  reverse: string     // 'createdBy' (passive - who/what did it)
  inverse?: string    // 'delete' (opposite action)
  description?: string
}
```

Example:
```typescript
const createVerb: Verb = {
  id: 'verb_create',
  name: 'Create',
  action: 'create',
  act: 'new',
  activity: 'creating',
  event: 'created',
  reverse: 'createdBy',
  inverse: 'delete'
}
```

## Things

Things are instances of Nouns. They support two MDXLD formats:

### ThingExpanded Format

JSON-LD style with `$` prefixed system fields:

```typescript
interface ThingExpanded {
  $id: string           // Entity ID
  $type: string         // Entity type (Noun reference)
  $ref?: string         // URL reference to Thing's own DO
  $content?: string     // MDX content
  $code?: string        // Executable code
  $version?: number
  $createdAt?: number
  $updatedAt?: number
  [key: string]: unknown  // Data fields at root
}
```

### ThingCompact Format

Traditional data structure:

```typescript
interface ThingCompact<T = unknown> {
  id: string
  type: string
  data: T              // Data nested in 'data' field
  ref?: string
  content?: string
  code?: string
  version?: number
  createdAt?: number
  updatedAt?: number
}
```

### Dual Nature Pattern

A Thing can also BE its own DO via `$ref`:

```typescript
// In startups.studio's Things collection:
const headless: ThingExpanded = {
  $id: 'thing_headless',
  $type: 'Startup',
  $ref: 'https://headless.ly',  // Points to its own DO
  name: 'Headless.ly',
  // ... data
}

// headless.ly DO has $context pointing back:
// { $context: 'https://startups.studio' }
```

## Actions

Actions are durable instances of Verbs with full lifecycle tracking.

### Action Lifecycle

```
pending -> running -> completed
                   -> failed -> retrying -> completed
                            -> cancelled
                   -> blocked
```

### Action Interface

```typescript
interface Action<TInput, TOutput, TConfig> {
  $id: string
  verb: string              // Reference to Verb
  subject?: string          // Who/what performed
  object?: string           // Target of action
  input?: TInput
  config?: TConfig
  output?: TOutput
  status: ActionStatus
  actor: Actor              // Who initiated
  request?: ActionRequest   // Originating request
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: ActionError
}

type ActionStatus =
  | 'pending'     // Waiting to start
  | 'running'     // Currently executing
  | 'completed'   // Successfully finished
  | 'failed'      // Failed with error
  | 'cancelled'   // Cancelled
  | 'retrying'    // Will retry
  | 'blocked'     // Waiting on dependency
```

### Actor Types

```typescript
type ActorType = 'User' | 'Agent' | 'Service' | 'System'

interface Actor {
  type: ActorType
  id: string
  name?: string
}
```

## Relationships

Graph-style connections between Things with cascade operator support.

### Cascade Operators

| Operator | Name | Action |
|----------|------|--------|
| `->` | Forward Insert | Create entity, link TO it |
| `~>` | Forward Search | Vector search existing, link TO it |
| `<-` | Backward Insert | Create entity, link FROM it (it owns us) |
| `<~` | Backward Search | Vector search existing, link FROM it |

### Schema Examples

```typescript
const CustomerSchema = {
  $type: 'Customer',
  company: '~>Company',              // Search for matching Company
  industry: '<~Industry|Sector',     // Search Industry, fallback to Sector
  contacts: ['->Contact'],           // Create Contact entities
  owner: '<-SalesRep',               // SalesRep owns this Customer
}

const StartupSchema = {
  $type: 'Startup',
  idea: 'What is the idea? <-Idea',  // Idea entity owns this Startup
  founders: ['Who are founders? ->Founder'],
  customer: '~>IdealCustomerProfile',
}
```

### Stored Relation

```typescript
interface StoredRelation {
  id: string
  relType: 'forward' | 'backward' | 'fuzzyForward' | 'fuzzyBackward'
  relName: string            // Field name in schema
  fromCollection: string
  fromId: string
  toCollection: string
  toId: string
  label?: string
  fromShard?: string
  toShard?: string
  ordinal: number
  metadata?: Record<string, unknown>
  createdAt: number
  updatedAt: number
}
```

### RelationManager Interface

Every DO has a built-in RelationManager for handling cascade relations:

```typescript
interface RelationManager {
  create(rel: Omit<StoredRelation, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredRelation>
  createBidirectional(rel, inverseRelName): Promise<[StoredRelation, StoredRelation]>
  getOutgoing(collection, docId, relName?): Promise<StoredRelation[]>
  getIncoming(collection, docId, relName?): Promise<StoredRelation[]>
  getAll(collection, docId): Promise<StoredRelation[]>
  delete(relId): Promise<boolean>
  deleteAll(collection, docId): Promise<number>
  exists(fromCollection, fromId, toCollection, toId): Promise<boolean>
  count(collection, docId, direction?): Promise<number>
  updateMetadata(relId, metadata): Promise<StoredRelation>
  updateOrdinal(relId, ordinal): Promise<StoredRelation>
}
```

## Base Collection

All collections extend the base collection interface:

```typescript
interface CollectionMethods<T> {
  list(options?: ListOptions): Promise<ListResult<T>>
  get(id: string): Promise<T | null>
  create(data: Omit<T, 'id'>): Promise<T>
  update(id: string, data: Partial<T>): Promise<T>
  delete(id: string): Promise<void>
  count(filter?: FilterExpression): Promise<number>
  find(filter: FilterExpression): Promise<T[]>
}

interface ListOptions {
  limit?: number
  offset?: number
  cursor?: string
  orderBy?: string
  orderDir?: 'asc' | 'desc'
  filter?: FilterExpression
}

interface ListResult<T> {
  items: T[]
  total?: number
  cursor?: string
  hasMore: boolean
}
```

## File Structure

```
src/collections/
  base.ts          # Base collection with CRUD
  nouns.ts         # Noun registry
  verbs.ts         # Verb registry
  things.ts        # Things collection (both formats)
  actions.ts       # Durable actions
  relationships.ts # Graph relationships with cascade support
  index.ts         # Public exports
  __tests__/       # Test files
```

## Usage

```typescript
import { DigitalObject } from '../do/DigitalObject'

// Access collections from any DO
const do = new DigitalObject({ id: 'my-do' })

// Register a noun
await do.nouns.create({
  name: 'Customer',
  singular: 'customer',
  plural: 'customers',
  slug: 'customer'
})

// Register a verb
await do.verbs.create({
  name: 'Subscribe',
  action: 'subscribe',
  act: 'sub',
  activity: 'subscribing',
  event: 'subscribed',
  reverse: 'subscribedBy'
})

// Create a thing
const customer = await do.things.create({
  $type: 'Customer',
  name: 'Acme Corp',
  email: 'contact@acme.com'
})

// Create an action
const action = await do.actions.create({
  verb: 'subscribe',
  object: customer.$id,
  actor: { type: 'User', id: 'user_123' }
})

// Create a relationship
await do.relationships.create({
  from: customer.$id,
  to: 'company_456',
  type: 'belongsTo'
})
```
