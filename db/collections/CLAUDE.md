# Collections - Implementation Guidelines

## Quick Reference

- Types: `/types/collections.ts`, `/types/cascade.ts`
- TDD: Red (tests first) -> Green (implement) -> Refactor

## Architecture

All collections extend `BaseCollection<T>` which provides CRUD via DO SQLite storage.

```
BaseCollection<T>
  |-- NounCollection
  |-- VerbCollection
  |-- ThingCollection (supports Expanded/Compact)
  |-- ActionCollection (durable execution)
  |-- RelationshipCollection (integrates RelationManager)
```

## Key Implementation Details

### Base Collection
- Storage: DO SQLite via `this.ctx.storage.sql`
- IDs: `${prefix}_${nanoid()}` format
- Timestamps: Unix ms via `Date.now()`
- Filtering: SQL WHERE clause builder

### Things
- Type guard: `isThingExpanded()` / `isThingCompact()`
- Dual nature: `$ref` links to Thing's own DO
- Convert between formats as needed

### Actions
- Status transitions: `pending -> running -> completed/failed`
- Retry logic: exponential backoff
- Track: `actor`, `request`, timestamps

### Relationships
- Use `RelationManager` from cascade.ts
- Store in `_rels` table
- Support cascade operators: `->`, `~>`, `<-`, `<~`

## Patterns

```typescript
// Collection method pattern
async create(data: Omit<T, 'id'>): Promise<T> {
  const id = `${this.prefix}_${nanoid()}`
  const now = Date.now()
  const entity = { ...data, id, createdAt: now, updatedAt: now }
  await this.storage.put(id, entity)
  return entity as T
}

// Filter to SQL
buildWhere(filter: FilterExpression): string {
  if ('field' in filter) {
    return `${filter.field} ${opToSql(filter.op)} ?`
  }
  // Handle and/or/not
}
```

## Testing

- Unit: Mock `ctx.storage.sql`
- Integration: Use miniflare
- Coverage: 80%+ required

## Cascade Processing

```typescript
// Post-generation linking
const result = await cascadeProcessor.process(
  'Customer',
  customerId,
  generatedData,
  CustomerSchema
)
// Creates entities and relations based on operators
```
