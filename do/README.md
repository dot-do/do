# Base DigitalObject Class

The foundational class for all Digital Objects (DOs) in the system.

## Purpose

The DigitalObject class serves as the foundation for all DOs. It provides:

- **Core Identity**: Every DO has `$id`, `$type`, `$context`, and `$version`
- **State Management**: Persistent state via DO SQLite with CDC (Change Data Capture)
- **Hibernation Support**: Efficient resource usage with alarm-based hibernation (Agents SDK pattern)
- **HTTP Routing**: Path-based request routing via `fetch()` handler
- **Hierarchical Relationships**: Child DO creation with `$context` for parent-child relationships

## Core Properties

Every Digital Object has these identity properties:

| Property | Type | Description |
|----------|------|-------------|
| `$id` | `string` | HTTPS URL identifying this DO (e.g., `https://headless.ly`) |
| `$type` | `DOType` | Type URL defining the schema (e.g., `https://do.md/Startup`) |
| `$context` | `DigitalObjectRef?` | Parent DO URL for CDC streaming hierarchy |
| `$version` | `number` | Version number for optimistic concurrency |

### Identity Examples

```typescript
// Root-level Business DO
{
  $id: 'https://startups.studio',
  $type: 'https://do.md/Business',
  $context: undefined,  // No parent
  $version: 1
}

// Startup DO with parent context
{
  $id: 'https://headless.ly',
  $type: 'https://startups.studio/Startup',
  $context: 'https://startups.studio',  // Parent for CDC streaming
  $version: 1
}

// Tenant DO nested under SaaS
{
  $id: 'https://crm.headless.ly/acme',
  $type: 'https://do.md/Tenant',
  $context: 'https://crm.headless.ly',  // Parent SaaS DO
  $version: 1
}
```

## State Management

DOs use SQLite for persistent state storage. The state module provides:

- **Key-Value Access**: Simple get/set/delete operations
- **Transactional Updates**: ACID-compliant state mutations
- **CDC Integration**: Automatic change capture for streaming to parent DOs
- **Versioning**: Optimistic concurrency with `$version`

### State API

```typescript
interface DOState {
  // Basic operations
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<boolean>

  // Batch operations
  getMany<T>(keys: string[]): Promise<Map<string, T>>
  setMany(entries: Map<string, unknown>): Promise<void>
  deleteMany(keys: string[]): Promise<number>

  // Transactional
  transaction<T>(fn: (tx: DOStateTransaction) => Promise<T>): Promise<T>

  // CDC
  getVersion(): number
  onMutation(handler: (event: CDCEvent) => void): void
}
```

## Hibernation Support

Following the Cloudflare Agents SDK pattern, DOs support hibernation for 95% cost savings:

- **Automatic Hibernation**: After idle timeout, DO state is persisted and memory released
- **Alarm-Based Wake**: Alarms wake the DO for scheduled tasks
- **WebSocket Hibernation**: Persistent connections survive hibernation
- **State Preservation**: All state automatically restored on wake

### Hibernation Lifecycle

```
Active ──────────────────────> Hibernating ──────────────────────> Active
         (idle timeout)                      (alarm/request)

State:   In-memory              State: Persisted in SQLite         State: Restored
Memory:  Allocated              Memory: Released                   Memory: Allocated
Cost:    Full                   Cost:   ~5% (storage only)         Cost:   Full
```

### Configuration

```typescript
interface HibernationConfig {
  idleTimeout: number           // Time before hibernation (default: 10s)
  maxHibernationDuration: number // Max hibernation time (default: 24h)
  preserveWebSockets: boolean    // Keep WebSocket connections (default: true)
  onHibernate?: () => Promise<void>  // Pre-hibernation hook
  onWake?: () => Promise<void>       // Post-wake hook
}
```

## fetch() Handler

The `fetch()` method handles all HTTP requests with path-based routing:

```typescript
class DigitalObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // Route based on path
    switch (url.pathname) {
      case '/':
        return this.handleRoot(request)
      case '/rpc':
        return this.handleRPC(request)
      case '/ws':
        return this.handleWebSocket(request)
      default:
        return this.handlePath(request, url.pathname)
    }
  }
}
```

### Default Routes

| Path | Method | Description |
|------|--------|-------------|
| `/` | GET | DO identity and status |
| `/rpc` | POST | JSON-RPC method calls |
| `/ws` | GET | WebSocket upgrade for RPC |
| `/cdc` | GET | CDC event stream |
| `/*` | * | Custom path handling |

## Child DO Creation

DOs can create child DOs with automatic `$context` linking:

```typescript
class DigitalObject {
  // Create a child DO
  async createChild(type: DOType, name: string): Promise<DigitalObjectRef> {
    const childId = `${this.$id}/${name}`

    // The child DO is created with $context pointing to this DO
    // This enables CDC event streaming up the hierarchy
    return childId
  }

  // Get a child DO stub
  getChild(name: string): DurableObjectStub {
    const childId = `${this.$id}/${name}`
    return this.env.DO.get(this.env.DO.idFromName(childId))
  }
}
```

### Hierarchy Example

```
https://startups.studio (Business DO)
    |
    +-- createChild('Startup', 'headless.ly')
    |       |
    |       +-- $context: 'https://startups.studio'
    |       |
    |       +-- createChild('SaaS', 'crm')
    |               |
    |               +-- $context: 'https://headless.ly'
    |               |
    |               +-- createChild('Tenant', 'acme')
    |                       |
    |                       +-- $context: 'https://crm.headless.ly'
```

CDC events flow upward through the `$context` chain, allowing parent DOs to observe and aggregate events from all descendants.

## File Structure

```
src/do/
  DigitalObject.ts    # Base class implementation
  state.ts            # State management (DO SQLite)
  hibernation.ts      # Hibernation support
  __tests__/
    DigitalObject.test.ts
    state.test.ts
    hibernation.test.ts
```

## Usage

```typescript
import { DigitalObject } from './do/DigitalObject'

export class MyStartup extends DigitalObject {
  async onInitialize() {
    // Custom initialization
  }

  async handlePath(request: Request, path: string): Promise<Response> {
    // Custom path handling
    return new Response('OK')
  }
}
```

## Related

- [Types](/types/identity.ts) - Core identity types
- [Types](/types/context.ts) - DO context types
- [Types](/types/storage.ts) - CDC and storage types
- [Types](/types/rpc.ts) - RPC types
