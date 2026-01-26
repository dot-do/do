# do.do - Universal DO Runtime & Service Hub

> Every DO is data. No deployment needed.
> One binding to rule them all.

## The Hub Pattern

Instead of every worker needing bindings to auth, stripe, esbuild, etc., they just need ONE binding:

```
User's worker
    │
    └── [DO binding] → do.do (the hub)
                          │
                          ├── auth.do     (authentication)
                          ├── oauth.do    (OAuth providers)
                          ├── mcp.do      (Model Context Protocol)
                          ├── esbuild.do  (TypeScript/bundling)
                          ├── stripe.do   (payments)
                          ├── github.do   (repos, PRs)
                          ├── ai.do       (LLMs, embeddings)
                          └── objects.do  (DO registry & runtime)
```

**User's wrangler.jsonc is trivial:**
```jsonc
{
  "services": [
    { "binding": "DO", "service": "do-do" }
  ]
}
```

**All capabilities through one binding:**
```typescript
// Services
await env.DO.auth.verify(token)
await env.DO.stripe.customers.create({ email })
await env.DO.esbuild.transform(code)
await env.DO.ai.generate(prompt)
await env.DO.github.repos.get('owner/repo')

// DOs
const startup = await env.DO.get('startup.do')
await startup.customers.create({ name: 'Acme' })
```

## Core Insight

The factory pattern `DO($ => { return { api } })` means a DO is just:
- API methods (stringified functions)
- Event handlers (stringified functions)
- Schedules (cron → stringified functions)
- Site/App content (MDX in fsx)
- State (DO storage)

If DOs are data, we need ONE universal runtime that interprets them.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        workers.do                                │
│         (wildcard: *.hq.sb, *.app.net.ai, custom domains)       │
│                                                                  │
│  Request: https://crm.acme.com/api/customers                    │
│      ↓                                                          │
│  Extract hostname: crm.acme.com                                 │
│      ↓                                                          │
│  Route to: objects.do/crm.acme.com                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        objects.do                                │
│                   (Universal DO Runtime)                         │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Registry   │    │  GenericDO  │    │  Services   │         │
│  │  (R2/KV)    │───▶│   Runtime   │◀───│  (bindings) │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│        │                   │                   │                 │
│   DO definitions     $ context          esbuild.do              │
│   (JSON/code)        injection          stripe.do               │
│                                         ai.do                    │
└─────────────────────────────────────────────────────────────────┘
```

## DO Definition Schema

```typescript
interface DODefinition {
  // Identity
  $id: string           // "crm.acme.com" or "startup.do/tenant-123"
  $type?: string        // "SaaS", "Startup", "Agent", etc.
  $context?: string     // Parent DO URL (for CDC bubbling)

  // Version
  $version?: string     // "1.0.0" or git commit

  // API (RPC methods)
  api?: {
    [method: string]: string | {
      code: string
      params?: string[]
      returns?: string
    } | {
      // Nested namespace
      [method: string]: string | { code: string }
    }
  }

  // Events
  events?: {
    [pattern: string]: string  // "Customer.created" → "async (c) => { ... }"
  }

  // Schedules
  schedules?: {
    [pattern: string]: string  // "every.hour" → "async () => { ... }"
  }

  // Site (public pages)
  site?: {
    [path: string]: string     // "/" → "# Welcome\n\n<Hero />"
  } | string                   // Or just root MDX content

  // App (authenticated pages)
  app?: {
    [path: string]: string     // "/dashboard" → "<Dashboard />"
  }

  // Agent (if this DO is an AI agent)
  agent?: {
    model?: 'best' | 'fast' | 'cost' | 'reasoning'
    systemPrompt: string
    tools?: string[]
    voice?: { provider: string; voiceId: string }
  }

  // Config
  config?: Record<string, unknown>
}
```

## Example: Full SaaS

```typescript
const definition: DODefinition = {
  $id: "crm.acme.com",
  $type: "SaaS",

  api: {
    ping: "async () => 'pong'",

    customers: {
      list: "async () => $.db.Customer.list()",
      get: "async (id) => $.db.Customer.get(id)",
      create: `async (data) => {
        const customer = await $.db.Customer.create(data)
        await $.email\`Welcome \${data.name} to \${data.email}\`
        return customer
      }`,
    },

    billing: {
      subscribe: "async (plan) => $.stripe.subscriptions.create({ ... })",
      cancel: "async () => $.stripe.subscriptions.cancel(...)",
    }
  },

  events: {
    "Customer.created": `async (customer) => {
      await $.slack\`#sales New customer: \${customer.name}\`
    }`,
    "stripe.payment_failed": `async (event) => {
      await $.email\`Payment failed for \${event.customer}\`
    }`
  },

  schedules: {
    "every.day.at9am": `async () => {
      const metrics = await $.db.Metrics.today()
      await $.slack\`#metrics Daily: $\${metrics.mrr} MRR\`
    }`
  },

  site: {
    "/": "# Acme CRM\n\nThe best CRM for startups.\n\n<PricingTable />",
    "/pricing": "# Pricing\n\n<PricingDetails />",
    "/docs": "# Documentation\n\n<DocsNav />"
  },

  app: {
    "/dashboard": "<Dashboard stats={$.db.Stats.current()} />",
    "/customers": "<CustomerList customers={$.db.Customer.list()} />",
    "/settings": "<Settings config={$.config} />"
  }
}
```

## GenericDO Runtime

```typescript
export class GenericDO extends DurableObject {
  private definition: DODefinition | null = null
  private $: DOContext

  constructor(state: DurableObjectState, env: Env) {
    super(state, env)
    this.$ = createContext(state, env)
  }

  async fetch(request: Request): Promise<Response> {
    // Load definition if not cached
    if (!this.definition) {
      this.definition = await this.loadDefinition()
    }

    const url = new URL(request.url)
    const path = url.pathname

    // Route request
    if (path.startsWith('/api/') || path === '/rpc') {
      return this.handleRPC(request)
    }
    if (path === '/__schema') {
      return this.handleSchema()
    }
    if (path === '/mcp') {
      return this.handleMCP(request)
    }
    if (path.startsWith('/app/')) {
      return this.handleApp(request)
    }
    // Default: site
    return this.handleSite(request)
  }

  private async handleRPC(request: Request): Promise<Response> {
    const { method, params } = await request.json()

    // Find method in definition
    const fn = this.resolveMethod(method)
    if (!fn) {
      return Response.json({ error: 'Method not found' }, { status: 404 })
    }

    // Execute with $ context
    const result = await this.executeFunction(fn, params)
    return Response.json({ result })
  }

  private async executeFunction(code: string, params: unknown[]): Promise<unknown> {
    // Create function with $ in scope
    const fn = new Function('$', ...paramNames, `return (${code})`)
    return fn(this.$, ...params)
  }

  private async loadDefinition(): Promise<DODefinition> {
    // Load from registry (R2/KV)
    const id = this.ctx.id.name
    return await this.env.REGISTRY.get(id, 'json')
  }
}
```

## $ Context

The $ context provides full capabilities:

```typescript
interface DOContext {
  // Identity
  $id: string
  $type: string
  $context: string

  // Database
  db: DB4AI

  // AI
  ai: AIContext

  // File System
  fsx: {
    read(path: string): Promise<string>
    write(path: string, content: string): Promise<void>
    list(pattern: string): Promise<string[]>
    delete(path: string): Promise<void>
  }

  // Git (versioning)
  gitx: {
    commit(message: string): Promise<string>
    history(): Promise<Commit[]>
    checkout(ref: string): Promise<void>
  }

  // Bash (commands)
  bashx: {
    exec(command: string): Promise<{ stdout: string; stderr: string }>
  }

  // Communication
  email: TaggedTemplate
  sms: TaggedTemplate
  slack: TaggedTemplate

  // Payments (via stripe.do service)
  stripe: Stripe

  // Build tools (via esbuild.do service)
  esbuild: typeof esbuild

  // Events
  emit(event: string, data: unknown): Promise<void>

  // Config
  config: Record<string, unknown>
}
```

## Service Bindings

Heavy dependencies are separate workers:

```typescript
// esbuild.do/index.ts
import * as esbuild from 'esbuild'
export default RPC(esbuild)

// stripe.do/index.ts
import Stripe from 'stripe'
export default RPC(new Stripe(env.STRIPE_KEY))

// wrangler.jsonc for objects.do
{
  "services": [
    { "binding": "ESBUILD", "service": "esbuild-do" },
    { "binding": "STRIPE", "service": "stripe-do" },
    { "binding": "AI", "service": "ai-do" }
  ]
}
```

## Routing

### By ID
```
objects.do/startup.do         → DO with $id="startup.do"
objects.do/crm.acme.com       → DO with $id="crm.acme.com"
objects.do/crm.acme.com/123   → DO with $id="crm.acme.com/123"
```

### By Domain (via workers.do)
```
https://crm.acme.com/         → workers.do → objects.do/crm.acme.com
https://app.startup.do/       → workers.do → objects.do/app.startup.do
```

### Versioning
```
objects.do/startup.do@v1.0.0  → Specific version
objects.do/startup.do@abc123  → Specific git commit
objects.do/startup.do@latest  → Latest version
```

## Creating a DO

```typescript
// PUT to create/update
await fetch('https://objects.do/my-app.do', {
  method: 'PUT',
  headers: { 'Authorization': 'Bearer ...' },
  body: JSON.stringify({
    api: {
      hello: 'async (name) => `Hello ${name}!`'
    }
  })
})

// Immediately callable
const res = await fetch('https://objects.do/my-app.do/rpc', {
  method: 'POST',
  body: JSON.stringify({ method: 'hello', params: ['World'] })
})
// { result: "Hello World!" }
```

## Security

1. **Sandboxed execution** - Functions run in isolated context
2. **$ access control** - Capabilities scoped to DO owner
3. **Rate limiting** - Per-DO and per-user limits
4. **Resource quotas** - CPU, memory, storage limits
5. **Authentication** - JWT/OAuth for DO management

## File Structure

```
objects.do/
├── wrangler.jsonc           # Worker config with service bindings
├── src/
│   ├── index.ts             # Worker entry, routes to GenericDO
│   ├── GenericDO.ts         # Universal DO runtime
│   ├── context.ts           # $ context factory
│   ├── executor.ts          # Safe function execution
│   ├── registry.ts          # DO definition storage
│   ├── site.ts              # Site/MDX renderer
│   └── app.ts               # App renderer
├── services/
│   ├── esbuild.do/          # esbuild RPC service
│   ├── stripe.do/           # Stripe RPC service
│   └── ai.do/               # AI model RPC service
└── tests/
```

## Next Steps

1. Implement GenericDO runtime
2. Implement $ context with fsx, gitx, bashx
3. Implement safe function executor
4. Implement RPC() wrapper for services
5. Deploy to objects.do
