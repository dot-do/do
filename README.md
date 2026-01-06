# DO

> **The AI-Native Durable Object that lets any AI Agent or Human .do anything.**

DO is the foundational infrastructure layer powering the entire [.do](https://dotdo.ai) platform. Built on Cloudflare's edge runtime, it's the intelligent substrate that enables [Functions.do](https://functions.do), [Database.do](https://database.do), [Workflows.do](https://workflows.do), [APIs.do](https://apis.do), [Events.do](https://events.do), [Actions.do](https://actions.do), and every other .do service - all rolling up to [Platform.do](https://platform.do).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Platform.do                                     │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐    │
│  │ Functions.do│ Database.do │ Workflows.do│  Events.do  │ Actions.do  │    │
│  ├─────────────┼─────────────┼─────────────┼─────────────┼─────────────┤    │
│  │   APIs.do   │   RPC.do    │   CLI.do    │   MCP.do    │  Agents.do  │    │
│  └─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘    │
│                                    │                                         │
│                          ┌─────────┴─────────┐                              │
│                          │        DO         │  ← AI-Native Durable Object  │
│                          │   (This Package)  │                              │
│                          └───────────────────┘                              │
│                                    │                                         │
│  ┌─────────────────────────────────┴───────────────────────────────────┐    │
│  │              Cloudflare Workers + Durable Objects + SQLite           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Why DO?

The future of software is AI-native. Every application will be built for AI agents and humans to collaborate seamlessly. DO provides:

- **Graph-Native Data**: Things and Relationships form a semantic knowledge graph
- **Event Sourcing**: Immutable audit trails for compliance and AI reasoning
- **Durable Execution**: Actions with state machines, retries, and guaranteed delivery
- **Multi-Transport**: Workers RPC, HTTP, WebSocket, and MCP for AI tool integration
- **Edge-First**: Runs on Cloudflare's global edge network for sub-100ms latency

## Installation

```bash
npm install @dotdo/do
```

## Quick Start

```typescript
import { DO } from '@dotdo/do'

export class MyDO extends DO {
  // Your custom methods are automatically exposed via RPC
  async processOrder(orderId: string) {
    // Track the event (immutable audit trail)
    await this.track({
      type: 'Order.processing',
      source: 'order-service',
      data: { orderId }
    })

    // Create a durable action that survives failures
    return this.doAction({
      actor: 'system',
      object: `order:${orderId}`,
      action: 'process'
    })
  }
}
```

## The Data Model

DO implements a rich data model designed for AI agents and complex business logic:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DO Data Model                                     │
│                                                                              │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────┐           │
│  │   Things    │────────→│Relationships│←────────│   Things    │           │
│  │  (Nodes)    │         │   (Edges)   │         │  (Nodes)    │           │
│  └─────────────┘         └─────────────┘         └─────────────┘           │
│                                                                              │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────┐           │
│  │   Events    │         │   Actions   │         │  Artifacts  │           │
│  │ (Immutable) │         │  (Durable)  │         │  (Cached)   │           │
│  └─────────────┘         └─────────────┘         └─────────────┘           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                     Workflows                                │           │
│  │              (Orchestration & State Machines)                │           │
│  └─────────────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Things (Graph Nodes)

URL-addressable entities that form the nodes of your knowledge graph:

```typescript
// Create a Thing with semantic addressing
const user = await this.Thing.create({
  ns: 'acme.com',        // Namespace
  type: 'user',          // Entity type
  id: 'john',            // Unique ID
  data: {
    name: 'John Doe',
    email: 'john@acme.com'
  }
})
// URL: https://acme.com/user/john

// Traverse the graph
const posts = await this.Thing.related(user.url, 'authored')
const followers = await this.Thing.references(user.url, 'follows')
```

### Relationships (Graph Edges)

Typed connections between Things that enable semantic queries:

```typescript
// Create a relationship
await this.relate({
  from: 'https://acme.com/user/john',
  type: 'authored',
  to: 'https://acme.com/post/hello-world',
  data: { role: 'primary' }
})

// Query relationships
const authorships = await this.relationships(userUrl, 'authored')
```

### Events (Immutable Audit Trail)

Append-only event log for compliance, debugging, and AI reasoning:

```typescript
// Track an event (immutable, no updates or deletes)
const event = await this.track({
  type: 'Order.created',
  source: 'checkout-service',
  data: { orderId: '123', amount: 99.99 },
  correlationId: 'request-abc'
})

// Query events for AI analysis
const orderEvents = await this.queryEvents({
  type: 'Order.created',
  after: new Date('2024-01-01'),
  correlationId: 'request-abc'
})
```

### Actions (Durable Execution)

Long-running operations with state machines, retries, and guaranteed delivery:

```typescript
// Fire-and-forget (queued for processing)
await this.send({
  actor: 'user:123',
  object: 'invoice:456',
  action: 'generate'
})

// Durable execution with retries
const action = await this.doAction({
  actor: 'system',
  object: 'report:789',
  action: 'compile',
  metadata: {
    maxRetries: 3,
    retryDelay: 1000
  }
})

// State transitions
await this.completeAction(action.id, { url: 'https://...' })
// or
await this.failAction(action.id, 'Compilation failed')
```

### Artifacts (Intelligent Caching)

Cache derived content with TTL and hash-based invalidation:

```typescript
// Store compiled artifact
await this.storeArtifact({
  key: 'module:user-service',
  type: 'esm',
  source: 'https://github.com/acme/user-service',
  sourceHash: 'abc123',
  content: compiledModule,
  expiresAt: new Date(Date.now() + 86400000) // 24h TTL
})

// Retrieve with cache hit
const cached = await this.getArtifactBySource(sourceUrl, 'esm')
```

### Workflows (Orchestration)

Event-driven workflows with state machines and human-in-the-loop:

```typescript
async handleWorkflow($: WorkflowContext) {
  // Register event handlers
  $.on.Order.created = async (event) => {
    await $.do('process', event.data)
    $.set('status', 'processing')
  }

  // Schedule recurring tasks
  $.every.cron('0 * * * *') = async () => {
    await $.send('cleanup', { olderThan: '24h' })
  }

  // Access persistent state
  const status = $.get('status')
}
```

## Multi-Transport Architecture

DO speaks every protocol your AI agents and applications need:

### Workers RPC (Native Performance)

```typescript
// Direct service binding calls
const user = await env.DATABASE.get(id).Thing.get('https://acme.com/user/john')
const events = await env.DATABASE.get(id).queryEvents({ type: 'User.created' })
```

### HTTP RPC (Universal Access)

```bash
curl -X POST https://your-do.workers.dev/rpc \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"method": "Thing.create", "params": [{"ns": "acme.com", "type": "user", "id": "jane", "data": {"name": "Jane"}}]}'
```

### MCP (AI Tool Integration)

DO is a first-class MCP server, exposing tools for AI agents:

```bash
# Discover available tools
curl https://your-do.workers.dev/mcp

# Search across all data
curl -X POST https://your-do.workers.dev/mcp/tools/search \
  -d '{"query": "active premium users", "collections": ["users"]}'

# Fetch any resource
curl -X POST https://your-do.workers.dev/mcp/tools/fetch \
  -d '{"target": "https://acme.com/user/john"}'

# Execute code in sandbox
curl -X POST https://your-do.workers.dev/mcp/tools/do \
  -d '{"code": "return users.filter(u => u.premium)"}'
```

### WebSocket (Real-time)

```typescript
const ws = new WebSocket('wss://your-do.workers.dev')
ws.send(JSON.stringify({
  jsonrpc: '2.0',
  method: 'Thing.list',
  params: [{ type: 'notification', limit: 10 }]
}))
```

### REST API (HATEOAS)

```bash
# Discover endpoints
curl https://your-do.workers.dev/

# Standard CRUD
curl https://your-do.workers.dev/api/users
curl -X POST https://your-do.workers.dev/api/users -d '{"name": "John"}'
```

## Authentication & Security

Enterprise-grade auth with JWT validation, RBAC, and rate limiting:

```typescript
import { DO, requirePermission } from '@dotdo/do'

export class SecureDO extends DO {
  @requirePermission('orders:write')
  async createOrder(data: OrderData) {
    // Auth context automatically available
    const { userId, organizationId, permissions } = this.getAuthContext()

    return this.create('orders', {
      ...data,
      createdBy: userId,
      organization: organizationId
    })
  }
}
```

**Supported auth methods:**
- Bearer JWT with JWKS validation (WorkOS integration)
- API keys via `X-API-Key` header
- Basic authentication
- Custom auth context via `X-Auth-Context` header
- Session management with expiry and refresh

**Security features:**
- Role-based access control (RBAC) with wildcards
- Rate limiting per user/IP with fail-closed semantics
- Input validation via Zod schemas
- Sandboxed code execution with blocked globals

## Class Hierarchy

DO extends the Cloudflare ecosystem:

```
DurableObject (Cloudflare)
    └── Server (agents)
        └── Agent (agents)
            └── DO (@dotdo/do)           ← You are here
                └── MongoDB (mongo.do)
                └── Redis (redis.do)
                └── Neo4j (neo4j.do)
                └── Your custom classes
```

## The .do Ecosystem

DO is the foundation that powers:

| Service | Purpose |
|---------|---------|
| [Functions.do](https://functions.do) | Atomic, composable business logic |
| [Database.do](https://database.do) | AI-native data with vector search |
| [Workflows.do](https://workflows.do) | Declarative orchestration |
| [APIs.do](https://apis.do) | Unified REST/GraphQL gateway |
| [Events.do](https://events.do) | Event sourcing and streaming |
| [Actions.do](https://actions.do) | Durable execution and retries |
| [RPC.do](https://rpc.do) | Multi-transport RPC framework |
| [MCP.do](https://mcp.do) | Model Context Protocol server |
| [CLI.do](https://cli.do) | Developer tooling |
| [Agents.do](https://agents.do) | AI agent deployment |

All powered by [Platform.do](https://platform.do) - Business-as-Code infrastructure.

## Configuration

```toml
# wrangler.toml
name = "my-do"

[[durable_objects.bindings]]
name = "MY_DO"
class_name = "MyDO"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["MyDO"]
```

## Advanced Features

### Change Data Capture (CDC)

Stream changes to data warehouses:

```typescript
// Create batch for analytics export
const batch = await this.createCDCBatch({
  startTime: yesterday,
  endTime: now
})

// Transform to Parquet and export to R2
await this.transformBatch(batch.id)
```

### Schema Migrations

Version and evolve your schema:

```typescript
const migrations = [
  {
    version: 1,
    name: 'add-premium-flag',
    up: 'ALTER TABLE users ADD COLUMN premium BOOLEAN DEFAULT FALSE',
    down: 'ALTER TABLE users DROP COLUMN premium'
  }
]
```

### Deployment Router

Multi-version deployments with health checks:

```typescript
// Route traffic to healthy deployments
const router = new DeployRouter({
  healthCheck: {
    interval: 30000,
    threshold: 3
  }
})
```

## Philosophy

> "Build the infrastructure that enables Autonomous General Intelligence to operate millions of profitable businesses, transforming every industry and empowering every professional."

DO embodies this vision by providing:

1. **Semantic Data**: Things and Relationships model real-world entities and their connections
2. **Audit Trails**: Events create immutable records for compliance and AI reasoning
3. **Durable Execution**: Actions guarantee operations complete even across failures
4. **AI-First Protocols**: MCP integration makes every DO a tool for AI agents
5. **Edge Performance**: Sub-100ms latency globally via Cloudflare's network

## Related Packages

- [`agents`](https://www.npmjs.com/package/agents) - Base Agent class for Durable Objects
- [`@dotdo/middleware`](https://www.npmjs.com/package/@dotdo/middleware) - Middleware utilities
- [`hono`](https://www.npmjs.com/package/hono) - Lightweight web framework

## License

MIT

---

<p align="center">
  <strong>Built by <a href="https://dotdo.ai">.do</a></strong><br>
  <em>Let any AI Agent or Human .do anything.</em>
</p>
