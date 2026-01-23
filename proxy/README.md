# DO Proxy - Digital Object API Gateway

The DO Proxy provides a unified API gateway for all Digital Objects, enabling:

- **API** - JSON responses with clickable links (HATEOAS)
- **MCP** - Model Context Protocol for AI tools
- **RPC** - Method invocation over HTTP/WebSocket
- **Site/App** - Optional UI serving

## Routes

### Root Discovery

```
GET /
```

Returns API information with links to all endpoints:

```json
{
  "api": "headless.ly",
  "data": {
    "service": "headless.ly",
    "description": "Digital Object API"
  },
  "links": {
    "self": "https://headless.ly",
    "identity": "https://headless.ly/.do",
    "api": "https://headless.ly/api",
    "rpc": "https://headless.ly/rpc",
    "mcp": "https://headless.ly/mcp",
    "health": "https://headless.ly/_health",
    "docs": "https://do.md"
  },
  "timestamp": 1706000000000
}
```

### DO Identity

```
GET /.do
```

Returns the DO's identity ($id, $type, $context, $version):

```json
{
  "api": "headless.ly",
  "data": {
    "$id": "https://headless.ly",
    "$type": "Startup",
    "$context": "https://startups.studio",
    "$version": 1
  },
  "links": {
    "self": "https://headless.ly/.do",
    "api": "https://headless.ly/api",
    "rpc": "https://headless.ly/rpc",
    "mcp": "https://headless.ly/mcp",
    "collections": "https://headless.ly/rpc/do.collections.list"
  }
}
```

### RPC Endpoint

#### POST /rpc or POST /

Call DO methods via JSON-RPC:

```bash
curl -X POST https://headless.ly/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "do.identity.get", "args": []}'
```

Response:

```json
{
  "type": "rpc",
  "id": "...",
  "success": true,
  "result": {
    "$id": "https://headless.ly",
    "$type": "Startup"
  }
}
```

#### GET /rpc

Discover available RPC methods with clickable links:

```json
{
  "api": "headless.ly",
  "data": {
    "description": "RPC API - call methods via POST or explore via GET",
    "usage": {
      "post": "POST /rpc with JSON body: { \"method\": \"do.identity.get\", \"args\": [] }",
      "get": "GET /rpc/{method} to see method info and call with no args"
    }
  },
  "links": {
    "identity": "https://headless.ly/rpc/do.identity.get",
    "collections": "https://headless.ly/rpc/do.collections.list",
    "system": "https://headless.ly/rpc/do.system.schema",
    "ping": "https://headless.ly/rpc/do.system.ping"
  }
}
```

#### GET /rpc/{method}

Clickable link API - call any read-only method via GET:

```
GET /rpc/do.identity.get
GET /rpc/do.collections.list
GET /rpc/do.things.list
GET /rpc/do.system.ping
```

Returns the method result wrapped in an API response with navigation links.

### MCP Endpoint

#### GET /mcp

MCP server discovery (Model Context Protocol):

```json
{
  "protocolVersion": "2024-11-05",
  "capabilities": {
    "tools": { "listChanged": false },
    "resources": { "subscribe": false, "listChanged": false },
    "prompts": { "listChanged": false }
  },
  "serverInfo": {
    "name": "headless.ly",
    "version": "1.0.0"
  },
  "endpoints": {
    "discovery": "https://headless.ly/mcp",
    "tools": "https://headless.ly/mcp",
    "rpc": "https://headless.ly/rpc"
  }
}
```

#### POST /mcp

MCP JSON-RPC endpoint for AI tool calls:

**List tools:**

```bash
curl -X POST https://headless.ly/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'
```

**Call a tool:**

```bash
curl -X POST https://headless.ly/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "do.things.list",
      "arguments": { "limit": 10 }
    }
  }'
```

### REST API

#### GET /api

API discovery with collection links:

```json
{
  "api": "headless.ly",
  "data": {
    "description": "REST-style API for this Digital Object",
    "version": "1.0.0"
  },
  "links": {
    "nouns": "https://headless.ly/api/nouns",
    "things": "https://headless.ly/api/things",
    "actions": "https://headless.ly/api/actions",
    "functions": "https://headless.ly/api/functions",
    "workflows": "https://headless.ly/api/workflows",
    "users": "https://headless.ly/api/users",
    "agents": "https://headless.ly/api/agents"
  }
}
```

#### GET /api/{collection}

List items in a collection:

```
GET /api/things
GET /api/users
GET /api/agents
```

#### GET /api/{collection}/{id}

Get a single item:

```
GET /api/things/abc123
GET /api/users/user-1
```

#### POST /api/{collection}

Create an item:

```bash
curl -X POST https://headless.ly/api/things \
  -H "Content-Type: application/json" \
  -d '{"name": "My Thing", "type": "Product"}'
```

#### PUT /api/{collection}/{id}

Update an item:

```bash
curl -X PUT https://headless.ly/api/things/abc123 \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name"}'
```

#### DELETE /api/{collection}/{id}

Delete an item:

```bash
curl -X DELETE https://headless.ly/api/things/abc123
```

### Health Check

```
GET /_health
```

```json
{
  "status": "ok",
  "colo": "iad",
  "timestamp": 1706000000000
}
```

## Collections

Every DO has these collections accessible via RPC and REST:

| Collection | Description |
|------------|-------------|
| `nouns` | Entity type definitions |
| `verbs` | Action type definitions with grammatical forms |
| `things` | Instances of nouns |
| `actions` | Durable action instances |
| `relationships` | Connections between things |
| `functions` | Executable functions (code, generative, agentic, human) |
| `workflows` | Durable workflows and state machines |
| `events` | Immutable event records |
| `experiments` | A/B tests and feature flags |
| `orgs` | Organizations |
| `roles` | Permission roles |
| `users` | User identities |
| `agents` | Autonomous AI agents |
| `integrations` | External service connections |
| `webhooks` | Outbound event notifications |

## RPC Methods

### Identity

- `do.identity.get` - Get DO identity
- `do.identity.setContext(ref)` - Set parent context for CDC
- `do.identity.getContext` - Get parent context

### System

- `do.system.ping` - Health check
- `do.system.stats` - Get DO statistics
- `do.system.schema` - Get available methods

### Collections

For each collection (nouns, things, etc.):

- `do.{collection}.list(options)` - List items
- `do.{collection}.get(id)` - Get item by ID
- `do.{collection}.create(data)` - Create item
- `do.{collection}.update(id, data)` - Update item
- `do.{collection}.delete(id)` - Delete item

### CDC

- `do.cdc.subscribe(options)` - Subscribe to changes
- `do.cdc.unsubscribe(id)` - Unsubscribe
- `do.cdc.getChanges(cursor, limit)` - Get changes
- `do.cdc.getCursor` - Get current cursor

### Schedule

- `do.schedule(when, callback, payload)` - Schedule callback
- `do.schedule.list` - List schedules
- `do.schedule.cancel(id)` - Cancel schedule

## MCP Tools

The MCP server exposes all RPC methods as tools for AI assistants:

```json
{
  "name": "do.things.create",
  "description": "Create a new Thing",
  "inputSchema": {
    "type": "object",
    "properties": {
      "data": {
        "type": "object",
        "description": "Thing data"
      }
    },
    "required": ["data"]
  }
}
```

AI tools (Claude, GPT, etc.) can:

1. Discover available tools via `GET /mcp`
2. Call tools via `POST /mcp` with JSON-RPC
3. Navigate using clickable links in responses

## Clickable Link Pattern

Every JSON response includes a `links` object with clickable URLs:

```json
{
  "api": "headless.ly",
  "data": { ... },
  "links": {
    "self": "https://headless.ly/rpc/do.things.list",
    "create": "https://headless.ly/rpc/do.things.create",
    "api": "https://headless.ly/.do",
    "mcp": "https://headless.ly/mcp"
  }
}
```

This enables:

- **Discoverability** - Browse the API by clicking links
- **No docs needed** - The API documents itself
- **AI navigation** - LLMs can follow links to discover capabilities

## Service-Specific Routes

### Colo Service (*.colo.do)

```
GET https://colo.do/ - List all colos
GET https://colo.do/all - All colo codes
GET https://colo.do/regions - Regional breakdown
GET https://iad.colo.do/ - IAD colo info
GET https://iad.colo.do/workers.cloudflare.com/cf.json - CF info for domain
```

### Database Service (*.db4.ai)

```
GET https://imdb.db4.ai/ - Database info
GET https://imdb.db4.ai/collections - List collections
GET https://imdb.db4.ai/{collection} - List documents
GET https://imdb.db4.ai/{collection}/{id} - Get document
```

## Sites and Apps

DOs can optionally serve Sites (marketing, docs, blog) and Apps (dashboard, admin):

- Sites are served from the root domain (headless.ly)
- Apps are served from subdomains (app.headless.ly, admin.headless.ly)
- API is always available at /.do, /api, /rpc, /mcp

The proxy detects if a request should serve UI or API based on:

1. Accept header (application/json for API)
2. Path patterns (/.do, /api/*, /rpc/*, /mcp)
3. Request method (POST always routes to API)

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │          DO Proxy (Worker)           │
                    ├─────────────────────────────────────┤
                    │                                      │
Request ──────────► │  ┌─────────┐  ┌─────────┐           │
                    │  │ Router  │──│  MCP    │           │
                    │  └────┬────┘  └─────────┘           │
                    │       │                              │
                    │       ▼                              │
                    │  ┌─────────────────────────────┐    │
                    │  │     Durable Object (DO)     │    │
                    │  │  ┌──────────────────────┐   │    │
                    │  │  │  SQLite + CDC + RPC  │   │    │
                    │  │  └──────────────────────┘   │    │
                    │  └─────────────────────────────┘    │
                    │                                      │
                    └─────────────────────────────────────┘
```

## Files

- `index.ts` - Worker entry point
- `router.ts` - HTTP routing with Hono
- `mcp.ts` - MCP server implementation
- `do.ts` - DigitalObject base class
