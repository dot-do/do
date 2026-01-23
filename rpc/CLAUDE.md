# CLAUDE.md - RPC Module

## Purpose

CapnWeb RPC transport for Digital Objects. Schema-free RPC over WebSocket with hibernation.

## Key Concepts

- **95% cost savings** via Cloudflare Durable Object WebSocket hibernation
- **JSON-RPC style** messages (no schema compilation)
- **Promise pipelining** for batched operations
- **Dual transport**: WebSocket primary, HTTP POST fallback

## Files

| File | Responsibility |
|------|----------------|
| `server.ts` | WebSocket handler, HTTP handler, hibernation |
| `client.ts` | SDK with type inference, auto-reconnect |
| `protocol.ts` | Message parsing, validation, serialization |
| `methods.ts` | Method registry, dispatch, middleware hooks |
| `routes.ts` | GET /rpc/* handlers for schema discovery |

## Implementation Notes

### WebSocket Hibernation

Use Cloudflare's `state.acceptWebSocket()` and hibernation APIs:

```typescript
// In fetch handler
const pair = new WebSocketPair()
state.acceptWebSocket(pair[1])
return new Response(null, { status: 101, webSocket: pair[0] })

// Hibernation handlers
webSocketMessage(ws, message) { /* handle */ }
webSocketClose(ws) { /* cleanup */ }
webSocketError(ws, error) { /* log */ }
```

### Method Dispatch

Methods use dot notation: `do.{namespace}.{action}`

```typescript
const registry = new Map<string, MethodHandler>()
registry.set('do.identity.get', handlers.identity.get)
registry.set('do.things.list', handlers.things.list)
```

### Route Handlers

GET routes return JSON-LD style responses with clickable links:

```typescript
// GET /rpc/do.identity.get
{
  "$id": "/rpc/do.identity.get",
  "$type": "RPCMethod",
  "links": [...]
}
```

### Error Handling

Always return proper RPC errors with codes from `RpcErrorCodes`:

```typescript
return {
  id: request.id,
  error: {
    code: RpcErrorCodes.MethodNotFound,
    message: `Method not found: ${request.method}`,
  },
}
```

## Testing

Test files in `__tests__/`:

- `server.test.ts` - WebSocket and HTTP handling
- `client.test.ts` - SDK functionality
- `protocol.test.ts` - Message parsing/validation
- `methods.test.ts` - Method dispatch
- `routes.test.ts` - HTTP route handlers

## Dependencies

- Types from `../../types/rpc.ts`
- Uses Cloudflare Workers WebSocket APIs
- No external dependencies

## Naming

- Methods: `do.{namespace}.{action}` (e.g., `do.things.list`)
- Events: `RPC.{Object}.{event}` (e.g., `RPC.Request.received`)
- Follow camelCase for functions, PascalCase for types
