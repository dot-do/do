# CapnWeb RPC Transport

You want to build real-time, low-latency APIs. You need WebSocket connections that don't drain your wallet. You need schema-free RPC that just works.

CapnWeb gives you all of this.

## What is CapnWeb?

CapnWeb is schema-free RPC over WebSocket with hibernation support. It's the transport layer for Digital Objects, enabling:

- **95% cost savings** through WebSocket hibernation
- **Sub-millisecond latency** for real-time operations
- **Promise pipelining** for batched operations (reduce round-trips)
- **JSON-RPC style messages** - no schema compilation needed

## Quick Start

```typescript
import { createRPCClient } from 'do/rpc/client'

// Connect to a Digital Object
const client = await createRPCClient('wss://my-startup.do/rpc')

// Call methods with full type inference
const identity = await client.call('do.identity.get')
const things = await client.call('do.things.list', { limit: 10 })

// Batch multiple operations (promise pipelining)
const batch = await client.batch([
  { id: '1', method: 'do.nouns.list' },
  { id: '2', method: 'do.verbs.list' },
  { id: '3', method: 'do.things.list', params: { limit: 100 } },
])
```

## Protocol

### Message Format (JSON-RPC Style)

**Request:**
```json
{
  "id": "req-123",
  "method": "do.things.list",
  "params": { "limit": 10 },
  "meta": {
    "auth": "Bearer ...",
    "traceId": "trace-abc"
  }
}
```

**Response:**
```json
{
  "id": "req-123",
  "result": [{ "$id": "thing-1", "name": "Widget" }],
  "meta": {
    "duration": 2,
    "timestamp": 1706012400000
  }
}
```

**Error:**
```json
{
  "id": "req-123",
  "error": {
    "code": -32601,
    "message": "Method not found",
    "data": { "method": "do.invalid.method" }
  }
}
```

### Promise Pipelining (Batch)

Send multiple requests in a single message to reduce round-trips:

```json
{
  "id": "batch-1",
  "requests": [
    { "id": "1", "method": "do.nouns.list" },
    { "id": "2", "method": "do.verbs.list" },
    { "id": "3", "method": "do.things.create", "params": { "name": "Widget" } }
  ],
  "abortOnError": true
}
```

## Transports

### Primary: WebSocket with Hibernation

WebSocket is the primary transport. Connections hibernate after idle periods, saving 95% on compute costs while maintaining instant wake-up.

```
wss://your-do.example.com/rpc
```

**Hibernation Flow:**
1. Client connects via WebSocket
2. After idle timeout (default: 10s), connection hibernates
3. Next message wakes the connection instantly
4. No reconnection needed - connection state preserved

### Fallback: HTTP POST

For environments where WebSocket isn't available:

```
POST /
POST /rpc
```

Both endpoints accept the same JSON-RPC message format.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/rpc` | Schema discovery - lists available methods with clickable links |
| `GET` | `/rpc/*` | Method documentation - describes a specific method |
| `POST` | `/` | Execute RPC (HTTP fallback) |
| `POST` | `/rpc` | Execute RPC (HTTP fallback) |
| `WS` | `/rpc` | WebSocket connection for real-time RPC |

### Clickable Links (GET /rpc/*)

Navigate the API through your browser:

```
GET /rpc
```

Returns:
```json
{
  "$id": "https://my-do.example.com/rpc",
  "$type": "RPCSchema",
  "methods": {
    "identity": {
      "$ref": "/rpc/do.identity",
      "methods": ["get", "setContext", "getContext"]
    },
    "collections": {
      "$ref": "/rpc/do.collections",
      "methods": ["list"]
    },
    "nouns": {
      "$ref": "/rpc/do.nouns",
      "methods": ["list", "get", "create", "update", "delete"]
    }
  },
  "links": [
    { "rel": "identity", "href": "/rpc/do.identity.get" },
    { "rel": "collections", "href": "/rpc/do.collections.list" },
    { "rel": "nouns", "href": "/rpc/do.nouns.list" }
  ]
}
```

```
GET /rpc/do.identity.get
```

Returns:
```json
{
  "$id": "https://my-do.example.com/rpc/do.identity.get",
  "$type": "RPCMethod",
  "name": "do.identity.get",
  "description": "Get the Digital Object's identity",
  "params": null,
  "returns": "DigitalObjectIdentity",
  "links": [
    { "rel": "invoke", "href": "/rpc", "method": "POST" },
    { "rel": "parent", "href": "/rpc/do.identity" },
    { "rel": "related", "href": "/rpc/do.identity.setContext" },
    { "rel": "related", "href": "/rpc/do.identity.getContext" }
  ]
}
```

```
GET /rpc/do.collections.list
```

Returns:
```json
{
  "$id": "https://my-do.example.com/rpc/do.collections.list",
  "$type": "RPCMethod",
  "name": "do.collections.list",
  "description": "List all collections in this Digital Object",
  "params": null,
  "returns": "string[]",
  "collections": [
    { "name": "nouns", "href": "/rpc/do.nouns.list" },
    { "name": "verbs", "href": "/rpc/do.verbs.list" },
    { "name": "things", "href": "/rpc/do.things.list" },
    { "name": "actions", "href": "/rpc/do.actions.list" },
    { "name": "relationships", "href": "/rpc/do.relationships.list" },
    { "name": "functions", "href": "/rpc/do.functions.list" },
    { "name": "workflows", "href": "/rpc/do.workflows.list" },
    { "name": "events", "href": "/rpc/do.events.list" }
  ]
}
```

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32700 | ParseError | Invalid JSON |
| -32600 | InvalidRequest | Invalid request structure |
| -32601 | MethodNotFound | Method doesn't exist |
| -32602 | InvalidParams | Invalid method parameters |
| -32603 | InternalError | Internal server error |
| -32001 | Unauthorized | Authentication required |
| -32002 | Forbidden | Permission denied |
| -32003 | NotFound | Resource not found |
| -32004 | Conflict | Resource conflict |
| -32005 | RateLimited | Too many requests |
| -32006 | Timeout | Operation timed out |

## Client SDK Features

### Auto-Reconnection

The client automatically handles connection drops:

```typescript
const client = await createRPCClient('wss://my-do.example.com/rpc', {
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,
})
```

### Subscriptions

Subscribe to real-time events:

```typescript
const unsubscribe = client.subscribe('cdc', (event) => {
  console.log('Change:', event)
})

// Later: unsubscribe
unsubscribe()
```

### Type Safety

Full TypeScript inference for all DO methods:

```typescript
// Params and return types are inferred
const things = await client.call('do.things.list', { limit: 10 })
//    ^? Thing[]

const identity = await client.call('do.identity.get')
//    ^? DigitalObjectIdentity
```

## Architecture

```
+--------------+     WebSocket      +------------------+
|   Client     |<------------------>|   RPC Server     |
|  (Browser)   |                    |  (Durable Obj)   |
+--------------+                    +--------+---------+
                                             |
                                             v
                                    +------------------+
                                    | Method Registry  |
                                    |   & Dispatch     |
                                    +--------+---------+
                                             |
                    +------------------------+------------------------+
                    v                        v                        v
           +----------------+       +----------------+       +----------------+
           |  Collections   |       |      CDC       |       |    System      |
           |  (CRUD ops)    |       |  (streaming)   |       |   (stats)      |
           +----------------+       +----------------+       +----------------+
```

## Files

| File | Purpose |
|------|---------|
| `server.ts` | RPC server handling WebSocket and HTTP |
| `client.ts` | Client SDK with type inference |
| `protocol.ts` | Message serialization and validation |
| `methods.ts` | Method registry and dispatch |
| `routes.ts` | HTTP route handlers for /rpc/* |

## That's Your API. Running.

Connect once. Call methods. Batch operations. Subscribe to changes. All with 95% lower costs than traditional WebSocket implementations.

No schema files. No code generation. Just types that flow from server to client.
