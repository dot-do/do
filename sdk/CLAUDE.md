# DO SDK - Implementation Guidelines

## Architecture Overview

The SDK is designed as a thin, type-safe wrapper around the DO RPC protocol. It prioritizes:

1. **Type Safety** - Full inference from DO schemas
2. **Transport Agnosticism** - WebSocket primary, HTTP fallback
3. **Reliability** - Auto-reconnection, request queuing
4. **Developer Experience** - Simple API, clear errors

## File Structure

```
src/sdk/
├── client.ts      # Main client class and factory
├── transport.ts   # WebSocket and HTTP transport implementations
├── types.ts       # SDK-specific type definitions
├── errors.ts      # Error classes (to be created)
├── utils.ts       # Utility functions (to be created)
└── index.ts       # Public exports (to be created)
```

## Implementation Guidelines

### client.ts

The main client should:

1. Accept a generic type parameter for the DO schema
2. Use conditional types to infer method inputs/outputs
3. Manage transport lifecycle
4. Handle request/response correlation
5. Emit events for connection state changes

```typescript
// Key patterns to follow:
// - Use a message queue for requests during reconnection
// - Implement request deduplication
// - Support both Promise and callback patterns
// - Clean up resources on close()
```

### transport.ts

Transport implementations should:

1. Implement a common `Transport` interface
2. Handle connection lifecycle independently
3. Support message serialization (JSON for HTTP, binary for WS)
4. Implement health checks (ping/pong for WS)

```typescript
// CapnWeb WebSocket specifics:
// - Use binary frames for efficiency
// - Include request ID in every message
// - Handle server-initiated messages (subscriptions)
// - Implement backpressure handling
```

### types.ts

Type definitions should:

1. Be compatible with DO schema format
2. Support generic inference patterns
3. Export utility types for consumers
4. Document complex types thoroughly

## CapnWeb Protocol

The CapnWeb protocol uses a simple binary format:

```
[1 byte: message type]
[4 bytes: request ID]
[4 bytes: payload length]
[N bytes: payload (MessagePack or JSON)]
```

Message types:
- 0x01: Request
- 0x02: Response
- 0x03: Error
- 0x04: Subscribe
- 0x05: Unsubscribe
- 0x06: Event
- 0x07: Ping
- 0x08: Pong

## Error Handling Strategy

1. **Transport errors** - Retry with backoff, then fail
2. **DO errors** - Parse and rethrow with context
3. **Timeout errors** - Configurable per-request
4. **Schema errors** - Fail fast with clear message

## Testing Considerations

- Mock transport for unit tests
- Integration tests against real DOs
- Test reconnection scenarios
- Test type inference at compile time

## Performance Considerations

- Use connection pooling for HTTP
- Implement request batching
- Minimize serialization overhead
- Use WeakMap for internal state

## Security Considerations

- Never log sensitive tokens
- Validate server responses
- Handle malformed messages gracefully
- Support custom auth headers
