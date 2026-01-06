# @dotdo/do

> An agentic database that can DO anything.

The foundational base class for all .do workers - a Cloudflare Durable Object that provides:

- **Multi-transport RPC**: Workers RPC (service bindings), HTTP, WebSocket, MCP
- **Simple CRUD operations**: ai-database compatible interface
- **MCP tools**: search, fetch, do (secure code execution)
- **WebSocket hibernation**: Efficient long-lived connections
- **HATEOAS REST API**: Auto-discoverable REST endpoints
- **Monaco Editor UI**: Built-in editing at /~/:resource/:id

## Installation

```bash
npm install @dotdo/do
# or
pnpm add @dotdo/do
```

## Quick Start

```typescript
import { DO } from '@dotdo/do'

export class MyDatabase extends DO {
  // Add custom methods - they're automatically exposed via RPC
  async customQuery(filter: Record<string, unknown>) {
    return this.list('items', { where: filter })
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const id = env.MY_DATABASE.idFromName('main')
    const stub = env.MY_DATABASE.get(id)
    return stub.fetch(request)
  },
}
```

## Class Hierarchy

```
DurableObject
    └── Server (agents package)
        └── Agent (agents package)
            └── DO (@dotdo/do)
                └── MongoDB (mongo.do)
                └── GitStore (gitx.do)
                └── Your custom classes
```

## Multi-Transport Support

### Workers RPC (Service Bindings)

```typescript
// From another worker
const result = await env.DATABASE.get(id).customQuery({ status: 'active' })
```

### HTTP RPC

```bash
curl -X POST https://database.do/rpc \
  -H 'Content-Type: application/json' \
  -d '{"id": "1", "method": "get", "params": ["users", "123"]}'
```

### MCP (Model Context Protocol)

```bash
# Get tools manifest
curl https://database.do/mcp

# Execute search tool
curl -X POST https://database.do/mcp/tools/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "active users"}'
```

### REST API

```bash
# HATEOAS discovery
curl https://database.do/

# CRUD operations
curl https://database.do/api/users
curl https://database.do/api/users/123
curl -X POST https://database.do/api/users -d '{"name": "John"}'
curl -X PUT https://database.do/api/users/123 -d '{"name": "Jane"}'
curl -X DELETE https://database.do/api/users/123
```

### Monaco Editor

Visit `https://database.do/~/users/123` in a browser for a JSON editor with auto-save.

## MCP Tools

DO exposes three tools for AI integration:

- **search**: Full-text search across collections
- **fetch**: Retrieve documents or URLs
- **do**: Execute code in a secure sandbox (via ai-evaluate)

## Extending DO

```typescript
import { DO } from '@dotdo/do'

export class UserDatabase extends DO<Env> {
  // Override allowed methods to expose custom RPC methods
  protected allowedMethods = new Set([
    ...super.allowedMethods,
    'getUserByEmail',
    'createUserWithProfile',
  ])

  async getUserByEmail(email: string) {
    const users = await this.list('users', { where: { email } })
    return users[0] ?? null
  }

  async createUserWithProfile(userData: UserData, profileData: ProfileData) {
    const user = await this.create('users', userData)
    await this.create('profiles', { ...profileData, userId: user.id })
    return user
  }
}
```

## Configuration

```toml
# wrangler.toml
name = "my-database"

[[durable_objects.bindings]]
name = "MY_DATABASE"
class_name = "MyDatabase"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["MyDatabase"]
```

## Related Packages

- [`agents`](https://www.npmjs.com/package/agents) - Base Agent class
- [`@dotdo/middleware`](https://www.npmjs.com/package/@dotdo/middleware) - Middleware utilities
- [`hono`](https://www.npmjs.com/package/hono) - Lightweight router

## License

MIT
