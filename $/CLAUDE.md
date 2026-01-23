# DO Context Implementation Guidelines

## Overview

This document provides implementation guidelines for the DO Context (`$`) runtime. The context is the primary interface through which Digital Objects interact with the platform.

## Core Principles

### 1. Type Safety First

All implementations must be fully typed and match the interfaces defined in `types/context.ts`. Use TypeScript's strict mode and avoid `any` types.

```typescript
// Good: Explicit types
export function createAIContext(env: DOEnvironment): AIContext {
  // ...
}

// Bad: Implicit any
export function createAIContext(env) {
  // ...
}
```

### 2. Tagged Template Pattern

The tagged template pattern is central to the DO Context. Implement it consistently:

```typescript
function createTaggedTemplate<T>(executor: (prompt: string) => Promise<T>): TaggedTemplate<T> {
  const fn = (strings: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
    const prompt = interpolateTemplate(strings, values)
    return executor(prompt)
  }

  // Support fn`template`(options) pattern
  return fn as TaggedTemplate<T>
}
```

### 3. Proxy-Based Dynamic Access

Use Proxy for dynamic property access patterns like `$.db.User` and `$.on.Customer.created`:

```typescript
function createDBContext(): DBContext {
  return new Proxy({} as DBContext, {
    get(target, prop) {
      if (typeof prop === 'string' && prop[0] === prop[0].toUpperCase()) {
        // Return collection accessor
        return createDBCollection(prop)
      }
      // Return static methods
      return target[prop as keyof DBContext]
    }
  })
}
```

### 4. Lazy Initialization

Context properties should be lazily initialized to avoid unnecessary overhead:

```typescript
export function createContext(identity: DigitalObjectIdentity): DOContext {
  let _ai: AIContext | null = null
  let _db: DBContext | null = null

  return {
    get ai() {
      if (!_ai) _ai = createAIContext(env)
      return _ai
    },
    get db() {
      if (!_db) _db = createDBContext(env)
      return _db
    },
    // ...
  }
}
```

### 5. Provider Abstraction

All external services should be abstracted behind provider interfaces:

```typescript
interface AIProvider {
  generate(prompt: string, options: TextGenerationOptions): Promise<string>
  embed(text: string): Promise<number[]>
}

// Implementation selects provider at runtime
function createAIContext(env: DOEnvironment): AIContext {
  const provider = resolveAIProvider(env)
  // ...
}
```

## File Structure

### index.ts

The main entry point. Exports:
- `createContext(identity)` - Create a context for a DO
- `DO(setup)` - Factory for creating DOs with context

```typescript
import type { DOContext, DOFactory, DigitalObjectIdentity } from '../../types/context'

export function createContext(identity: DigitalObjectIdentity): DOContext {
  // Initialize all context properties
}

export const DO: DOFactory = (setup) => {
  // Return fetch handler that creates context and runs setup
}
```

### ai.ts

AI operations implementation. Key considerations:
- Route through Cloudflare AI Gateway
- Support model selection via characteristics (fast, best, cost)
- Implement all AI modalities (text, image, video, voice)

```typescript
export function createAIContext(env: DOEnvironment): AIContext {
  // Main tagged template handler
  const ai = createTaggedTemplate(async (prompt) => {
    return generateText(prompt, { model: 'best' })
  })

  // Sub-operations
  ai.list = createTaggedTemplate(async (prompt) => {
    // Return as ChainableList
  })

  ai.is = createTaggedTemplate(async (prompt) => {
    // Return boolean
  })

  // ... more operations

  return ai
}
```

### db.ts

Database operations. Key considerations:
- Support natural language queries via AI
- Proxy-based collection access
- Chainable list results

```typescript
export function createDBContext(env: DOEnvironment): DBContext {
  const handler = {
    get(target: object, prop: string | symbol) {
      // Handle collection access
      if (typeof prop === 'string' && /^[A-Z]/.test(prop)) {
        return createDBCollection(prop)
      }
      // Handle static methods
    }
  }

  return new Proxy({
    query: async (sql, params) => { /* ... */ },
    documents: { /* ... */ },
    graph: { /* ... */ },
    analytics: { /* ... */ },
  }, handler)
}
```

### events.ts

Event handler registration. Key considerations:
- Noun.verb pattern via nested Proxy
- Handlers stored in registry for runtime dispatch
- Type-safe event data

```typescript
export function createOnContext(registry: EventRegistry): OnContext {
  return new Proxy({} as OnContext, {
    get(_, noun) {
      return new Proxy({}, {
        get(_, verb) {
          return (handler: OnEventHandler) => {
            registry.register(`${noun}.${verb}`, handler)
          }
        }
      })
    }
  })
}
```

### schedule.ts

Schedule registration. Key considerations:
- Support all time expressions (day names, intervals, times)
- Combine day + time (Monday.at9am)
- Store in schedule registry

```typescript
export function createEveryContext(registry: ScheduleRegistry): EveryContext {
  const createScheduleHandler = (cron: string): ScheduleHandler => {
    return (handler) => registry.register(cron, handler)
  }

  return {
    hour: createScheduleHandler('0 * * * *'),
    day: createScheduleHandler('0 0 * * *'),
    Monday: Object.assign(
      createScheduleHandler('0 0 * * 1'),
      { at9am: createScheduleHandler('0 9 * * 1') }
    ),
    // ...
  }
}
```

### communication.ts

Email, Slack, SMS contexts. Key considerations:
- Parse tagged templates for recipient/channel
- Abstract over providers (SES, Mailchannels, Twilio, etc.)
- Support template-based sending

```typescript
export function createEmailContext(env: DOEnvironment): EmailContext {
  const email = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const parsed = parseEmailTemplate(strings, values)
    return sendEmail(parsed)
  }

  email.to = (address: string) => createTaggedTemplate(async (body) => {
    return sendEmail({ to: address, body })
  })

  email.template = async (templateId, to, vars) => {
    // Render and send template
  }

  return email
}
```

### telephony.ts

Call and voice contexts. Key considerations:
- Phone number validation (E.164)
- Provider abstraction (Twilio, Telnyx, etc.)
- Voice AI agent management

### financial.ts

Payment operations. Key considerations:
- Parse currency from templates ($100, 100 USD)
- Journal entry validation (debits = credits)
- Provider abstraction (Stripe, etc.)

### domain.ts

Domain management. Key considerations:
- Subdomain validation
- Integration with Builder.Domains DO
- Status tracking

### cascade.ts

Cascade execution. Key considerations:
- Execute tiers in order until success
- Return which tier succeeded
- Handle errors gracefully

```typescript
export function createCascadeContext(): DOCascadeContext {
  return async <T>(options) => {
    const tiers = ['code', 'generative', 'agentic', 'human'] as const

    for (const tier of tiers) {
      const fn = options[tier]
      if (fn) {
        try {
          const result = await fn()
          if (result !== undefined) {
            return { result, tier }
          }
        } catch {
          // Continue to next tier
        }
      }
    }

    throw new Error('All cascade tiers failed')
  }
}
```

### proxy.ts

Shared proxy utilities:

```typescript
export function interpolateTemplate(
  strings: TemplateStringsArray,
  values: unknown[]
): string {
  return strings.reduce((acc, str, i) => {
    return acc + str + (values[i] ?? '')
  }, '')
}

export function createChainableList<T>(promise: Promise<T[]>): ChainableList<T> {
  const chainable = promise as ChainableList<T>

  chainable.map = (fn) => createChainableList(
    promise.then(items => Promise.all(items.map(fn)))
  )

  chainable.filter = (fn) => createChainableList(
    promise.then(async items => {
      const results = await Promise.all(items.map(async item => ({
        item,
        keep: await fn(item)
      })))
      return results.filter(r => r.keep).map(r => r.item)
    })
  )

  chainable.forEach = async (fn) => {
    const items = await promise
    for (const item of items) {
      await fn(item)
    }
  }

  return chainable
}
```

## Testing

### Unit Tests

Each module should have corresponding tests in `__tests__/`:

```typescript
// __tests__/ai.test.ts
import { createAIContext } from '../ai'

describe('AIContext', () => {
  it('should generate text with tagged template', async () => {
    const ai = createAIContext(mockEnv)
    const result = await ai`hello world`
    expect(result).toBeDefined()
  })

  it('should return boolean from ai.is', async () => {
    const ai = createAIContext(mockEnv)
    const result = await ai.is`the sky is blue`
    expect(typeof result).toBe('boolean')
  })
})
```

### Integration Tests

Test the full context with mock providers:

```typescript
// __tests__/context.test.ts
import { createContext } from '../index'

describe('DOContext', () => {
  it('should provide all context properties', () => {
    const $ = createContext({ $id: 'test', $type: 'Test' })

    expect($.ai).toBeDefined()
    expect($.db).toBeDefined()
    expect($.on).toBeDefined()
    expect($.every).toBeDefined()
    expect($.email).toBeDefined()
    expect($.slack).toBeDefined()
    expect($.sms).toBeDefined()
    expect($.call).toBeDefined()
    expect($.voice).toBeDefined()
    expect($.pay).toBeDefined()
    expect($.domain).toBeDefined()
    expect($.cascade).toBeDefined()
  })
})
```

## Error Handling

- All async operations should have proper error handling
- Errors should include context (operation, parameters)
- Use typed errors for specific failure modes

```typescript
export class ContextError extends Error {
  constructor(
    public readonly operation: string,
    public readonly details: Record<string, unknown>,
    message: string
  ) {
    super(message)
    this.name = 'ContextError'
  }
}
```

## Performance Considerations

1. **Lazy initialization** - Don't create providers until needed
2. **Connection pooling** - Reuse connections where possible
3. **Caching** - Cache AI gateway responses when appropriate
4. **Batching** - Batch multiple DB operations when possible

## Dependencies

- `types/context.ts` - Type definitions
- `types/identity.ts` - DO identity types
- `types/domains.ts` - Domain types
- `types/cascade.ts` - Cascade types
- `types/ai.ts` - AI types
- `types/communication.ts` - Communication types
- `types/telephony.ts` - Telephony types
- `types/voice-ai.ts` - Voice AI types
- `types/financial.ts` - Financial types
