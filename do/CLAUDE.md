# CLAUDE.md - Implementation Guidelines

## File Naming

- `PascalCase.ts` for classes (e.g., `DigitalObject.ts`)
- `kebab-case.ts` for utilities (e.g., `state.ts`, `hibernation.ts`)
- `*.test.ts` for tests in `__tests__/` directory

## Testing Requirements

- **Minimum 80% code coverage**
- Use Vitest for testing
- Test file location: `__tests__/*.test.ts`
- Run tests: `pnpm test`
- Run coverage: `pnpm test:coverage`

## Key Patterns

### 1. Identity Pattern
Every DO must have `$id`, `$type`, `$context`, `$version`:
```typescript
interface DigitalObjectIdentity {
  $id: string           // HTTPS URL
  $type: DOType         // Type URL
  $context?: string     // Parent DO URL
  $version: number      // Optimistic concurrency
}
```

### 2. State Access
Use async state methods, never direct property access:
```typescript
// Good
const value = await this.state.get('key')
await this.state.set('key', value)

// Bad - don't cache state in instance variables
this.cachedValue = value  // State may change
```

### 3. Hibernation-Safe Code
Design for hibernation - state may be evicted at any time:
```typescript
// Good - re-fetch state on each operation
async handleRequest() {
  const data = await this.state.get('data')
  // ... process ...
}

// Bad - stale state after hibernation
constructor() {
  this.data = {}  // Will be lost on hibernation
}
```

### 4. CDC Event Emission
Always emit CDC events for mutations:
```typescript
await this.state.transaction(async (tx) => {
  await tx.set('key', newValue)
  // CDC event automatically emitted
})
```

### 5. Child DO Creation
Use `$context` for parent-child relationships:
```typescript
const childRef = await this.createChild('Tenant', 'acme')
// Child's $context automatically set to this.$id
```

## Import Conventions

```typescript
// Types from /types/
import type { DigitalObjectIdentity, DOType } from '../../types/identity'
import type { CDCEvent } from '../../types/storage'

// Internal modules
import { DOState } from './state'
import { HibernationManager } from './hibernation'
```

## Error Handling

Use typed errors with codes:
```typescript
class DOError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message)
  }
}

// Usage
throw new DOError('STATE_NOT_FOUND', `Key not found: ${key}`)
```

## Documentation

- JSDoc for all public APIs
- Include `@example` for complex methods
- Document edge cases and error conditions
