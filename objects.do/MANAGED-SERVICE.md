# objects.do - Managed Digital Object Service

> Deploy, run, and manage Digital Objects without infrastructure.
> One command. Infinite scale. Zero complexity.

## Vision

**objects.do** is THE managed service for deploying and running Digital Objects. It provides:

1. **One-Command Deployment** - `do publish` deploys your DO to the global edge
2. **Universal Runtime** - Every DO runs on the same battle-tested infrastructure  
3. **Complete Tooling** - CLI, SDK, API - everything you need to build and operate
4. **Zero Infrastructure** - No servers, no databases, no DevOps - just code

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           YOUR APP                                   │
│                                                                      │
│   CLI (do)          SDK (@do/sdk)          Direct API               │
│   do publish        import { DO }          POST /rpc                │
│   do dev            DO('my.do')            PUT /registry/:id        │
│   do logs                                  GET /__schema            │
└─────────┬─────────────────┬────────────────────┬────────────────────┘
          │                 │                    │
          └─────────────────┼────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       objects.do API                                 │
│                                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │  /registry   │ │    /rpc      │ │  /__schema   │ │  /services │ │
│  │  DO CRUD     │ │  Unified RPC │ │  Discovery   │ │  Hub proxy │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
│                            │                                        │
│                            ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   GenericDO Runtime                           │  │
│  │  - Loads DO definitions from R2 registry                     │  │
│  │  - Executes API methods with $ context                       │  │
│  │  - Handles events, schedules, site, app                      │  │
│  │  - Proxies to service DOs (auth, stripe, ai, etc.)          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Service Hub                                │  │
│  │  auth.do │ oauth.do │ stripe.do │ ai.do │ github.do │ mcp.do │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. objects.do API (Worker)

The API is a Cloudflare Worker that handles:

| Endpoint | Purpose |
|----------|---------|
| `PUT /registry/:id` | Create/update DO definition |
| `GET /registry/:id` | Get DO definition |
| `DELETE /registry/:id` | Delete DO definition |
| `GET /registry` | List all DOs |
| `POST /rpc` | Unified RPC to any DO or service |
| `GET /__schema` | OpenAPI/JSON Schema discovery |
| `GET|POST /:doId/*` | Route to specific DO |

**Current Status**: Implemented in `/objects.do/src/index.ts`

### 2. objects.do SDK (`@do/sdk/objects`)

Type-safe TypeScript client for objects.do:

```typescript
import { ObjectsClient } from '@do/sdk/objects'

// Connect to objects.do
const objects = new ObjectsClient({
  apiKey: process.env.DO_API_KEY,
  baseUrl: 'https://objects.do' // default
})

// Deploy a DO
await objects.publish({
  $id: 'my-app.do',
  $type: 'SaaS',
  api: {
    hello: 'async (name) => `Hello ${name}!`'
  }
})

// Call a DO
const result = await objects.call('my-app.do', 'hello', ['World'])
// => "Hello World!"

// List your DOs
const dos = await objects.list()

// Delete a DO
await objects.delete('my-app.do')

// Get DO schema
const schema = await objects.schema('my-app.do')
```

**Chainable Proxy Pattern**:

```typescript
// Create a proxy client for a specific DO
const myApp = objects.do('my-app.do')

// Chainable RPC calls
const customers = await myApp.customers.list()
const customer = await myApp.customers.get('123')
await myApp.customers.create({ name: 'Acme' })

// Subscribe to events
myApp.on('Customer.created', (customer) => {
  console.log('New customer:', customer.name)
})
```

### 3. objects.do CLI (`do objects` / standalone `objects`)

Command-line interface integrated with @dotdo/cli:

```bash
# Publishing
do publish ./my-do.ts           # Deploy a DO from TypeScript
do publish ./definition.json    # Deploy from JSON definition
do publish                      # Deploy from current directory (do.config.ts)

# Development
do dev                          # Local dev server with hot reload
do dev --port 3000              # Custom port
do dev --persist                # Persist state between restarts

# Management
do list                         # List all deployed DOs
do list --type SaaS             # Filter by type
do get <id>                     # Get DO definition
do delete <id>                  # Delete a DO
do delete <id> --force          # Skip confirmation

# Observability
do logs <id>                    # Stream logs from a DO
do logs <id> --since 1h         # Last hour of logs
do logs <id> --level error      # Filter by level
do logs <id> --follow           # Follow mode

# Introspection
do schema <id>                  # View DO schema
do schema <id> --json           # Output as JSON
do call <id> <method> [args]    # Call a DO method

# Configuration
do config set apiKey <key>      # Set API key
do config set baseUrl <url>     # Set custom base URL
do login                        # Authenticate with objects.do
do logout                       # Clear credentials
```

### 4. Integration with @dotdo/cli

The objects.do CLI extends the base @dotdo/cli:

```typescript
// cli/src/commands/publish.ts - Extended for objects.do
import { publish as basePublish } from '@dotdo/cli/commands/publish'
import { ObjectsClient } from '@do/sdk/objects'

export async function publish(options: PublishOptions): Promise<CommandResult> {
  // If publishing to objects.do
  if (options.target === 'objects.do' || !options.target) {
    const client = new ObjectsClient({ apiKey: options.apiKey })
    const definition = await loadDefinition(options.source)
    await client.publish(definition)
    return { success: true, message: `Published to ${definition.$id}` }
  }
  
  // Otherwise use base Cloudflare deploy
  return basePublish(options)
}
```

**CLI Architecture**:

```
@dotdo/cli (base)
├── init      - Initialize project
├── dev       - Local development  
├── deploy    - Deploy to Cloudflare (direct)
├── sync      - GitHub sync
└── publish   - NPM publish

@do/cli/objects (extension)
├── publish   - Deploy to objects.do
├── list      - List DOs on objects.do
├── get       - Get DO from objects.do
├── delete    - Delete DO from objects.do
├── logs      - Stream logs from objects.do
├── schema    - Get schema from objects.do
└── call      - Call DO method on objects.do
```

## DO Definition Schema

```typescript
interface DODefinition {
  // Identity
  $id: string           // Unique identifier
  $type?: string        // DO type (SaaS, Agent, etc.)
  $context?: string     // Parent DO URL
  $version?: string     // Version tag

  // API (stringified functions)
  api?: {
    [method: string]: string | {
      code: string
      params?: string[]
      returns?: string
    }
  }

  // Events (stringified handlers)
  events?: {
    [pattern: string]: string
  }

  // Schedules (cron/interval handlers)
  schedules?: {
    [pattern: string]: string
  }

  // Site (public MDX pages)
  site?: {
    [path: string]: string
  }

  // App (authenticated MDX pages)
  app?: {
    [path: string]: string
  }

  // Agent config (if AI agent)
  agent?: {
    model?: 'best' | 'fast' | 'cost' | 'reasoning'
    systemPrompt: string
    tools?: string[]
    voice?: { provider: string; voiceId: string }
  }

  // Custom config
  config?: Record<string, unknown>
}
```

## Authentication & Authorization

### API Key Authentication

```bash
# Set API key for CLI
do config set apiKey sk_live_...

# Or via environment variable
export DO_API_KEY=sk_live_...
```

### OAuth Authentication

```bash
# Interactive login
do login

# Opens browser for OAuth flow
# Stores refresh token securely
```

### SDK Authentication

```typescript
// API key
const objects = new ObjectsClient({
  apiKey: 'sk_live_...'
})

// Or OAuth token
const objects = new ObjectsClient({
  token: 'eyJ...'
})

// Or from environment
const objects = new ObjectsClient() // Uses DO_API_KEY
```

## Access Control

DOs have owner-based access control:

```typescript
// Only owner can:
// - Update definition
// - Delete DO
// - View logs
// - Access admin endpoints

// Public endpoints (if defined in API):
// - /rpc - Call public API methods
// - /site/* - View public site
// - /__schema - View public schema
```

## Local Development

```bash
# Start local dev server
do dev

# Server runs at http://localhost:8787
# - Hot reloads on file changes
# - Uses miniflare for DO simulation
# - Mocks service bindings locally
```

```typescript
// do.config.ts
export default {
  $id: 'my-app.do',
  $type: 'SaaS',
  
  api: {
    hello: async (name: string) => `Hello ${name}!`,
    customers: {
      list: async () => $.db.Customer.list(),
      create: async (data) => $.db.Customer.create(data)
    }
  }
}
```

## Deployment

```bash
# Deploy to objects.do
do publish

# Deploy specific file
do publish ./my-do.ts

# Deploy with version tag
do publish --version v1.0.0

# Deploy to staging
do publish --env staging
```

## Monitoring & Observability

```bash
# Stream logs
do logs my-app.do --follow

# View metrics
do metrics my-app.do

# View events
do events my-app.do
```

## Pricing Model (Future)

| Tier | DOs | Requests | Storage | Price |
|------|-----|----------|---------|-------|
| Free | 3 | 100K/mo | 100MB | $0 |
| Pro | 100 | 10M/mo | 10GB | $20/mo |
| Team | Unlimited | 100M/mo | 100GB | $100/mo |
| Enterprise | Unlimited | Unlimited | Unlimited | Custom |

## Roadmap

### Phase 1: Core SDK & CLI (Current)
- [ ] ObjectsClient SDK implementation
- [ ] CLI `publish`, `list`, `delete`, `logs` commands
- [ ] API key authentication
- [ ] Basic logging

### Phase 2: Developer Experience
- [ ] `do dev` local development
- [ ] Hot reload for definitions
- [ ] TypeScript DO definitions
- [ ] Schema validation

### Phase 3: Enterprise Features
- [ ] OAuth SSO
- [ ] Team management
- [ ] RBAC
- [ ] Audit logs
- [ ] Custom domains

### Phase 4: Advanced Features
- [ ] DO versioning
- [ ] Canary deployments
- [ ] A/B testing
- [ ] Multi-region
