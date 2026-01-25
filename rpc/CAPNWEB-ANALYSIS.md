# CapnWeb vs wsAdvanced: Analysis and Recommendations

## Executive Summary

After analyzing the capnweb npm package (v0.4.0 from Cloudflare) and comparing it with rpc.do's `wsAdvanced` transport, the recommendation is:

**Keep wsAdvanced for JSON-RPC use cases, use capnweb for capability-based RPC.**

They solve different problems and are complementary, not redundant.

## Comparison Matrix

| Feature | capnweb | wsAdvanced | Notes |
|---------|---------|------------|-------|
| **Protocol** | Cap'n Proto binary RPC | JSON-RPC | Different wire formats |
| **Reconnection** | None | Exponential backoff | capnweb requires app-level handling |
| **Heartbeat/Keepalive** | None | 30s ping-pong | capnweb has no connection health check |
| **Connection Lifecycle Events** | `onRpcBroken()` only | Full lifecycle (connect/disconnect/reconnecting/error) | wsAdvanced is more comprehensive |
| **Authentication** | In-band via RPC methods | First-message auth | Different patterns, both secure |
| **Promise Pipelining** | Native | Not supported | capnweb can batch dependent calls |
| **Stub-based References** | Native | Not supported | capnweb supports object references |
| **Connection Drop Handling** | Error propagates to pending calls | Auto-reconnect + message queuing | wsAdvanced is more resilient |
| **Bidirectional RPC** | Native (server can call client) | Not supported | capnweb supports callbacks |
| **Resource Management** | `using` keyword / `Symbol.dispose` | Manual | capnweb has explicit resource cleanup |

## Detailed Analysis

### 1. capnweb (Cloudflare's Cap'n Web)

**What it is:**
A JavaScript-native RPC library implementing Cap'n Proto-style promise pipelining and capability-based security. It serializes to JSON but maintains Cap'n Proto semantics.

**What it provides:**
```typescript
// Core APIs
newWebSocketRpcSession<T>(url: string | WebSocket, localMain?: any): RpcStub<T>
newHttpBatchRpcSession<T>(url: string): RpcStub<T>
newWorkersRpcResponse(request: Request, localMain: any): Response

// Key Types
RpcStub<T>  // Proxy for remote objects
RpcTarget   // Base class for exposable objects
onRpcBroken(callback: (error: any) => void): void  // Connection health
```

**What it does NOT provide:**
- Automatic reconnection
- Heartbeat/keepalive
- Connection state machine
- Event handlers beyond `onRpcBroken`
- Message queuing during reconnection

**How connection drops are handled:**
From the source code (`/Users/nathanclevenger/projects/do/node_modules/.pnpm/capnweb@0.4.0/node_modules/capnweb/dist/index.js`):
```javascript
// WebSocketTransport class
webSocket.addEventListener('close', (event) => {
  this.#receivedError(new Error(`Peer closed WebSocket: ${event.code} ${event.reason}`))
})
```
The error propagates to all pending calls, but no reconnection is attempted.

### 2. wsAdvanced (rpc.do's Advanced WebSocket Transport)

**What it provides:**
- Full connection state machine (`disconnected -> connecting -> connected -> reconnecting -> closed`)
- Exponential backoff reconnection (1s to 30s max)
- Heartbeat ping-pong (30s interval, 5s timeout)
- First-message authentication (token not in URL)
- Comprehensive event handlers
- Protocol version negotiation
- Request timeout handling
- Debug logging

**Configuration options:**
```typescript
interface WebSocketAdvancedOptions {
  token?: string | (() => string | Promise<string>)
  autoReconnect?: boolean  // default: true
  maxReconnectAttempts?: number  // default: Infinity
  reconnectBackoff?: number  // default: 1000ms
  maxReconnectBackoff?: number  // default: 30000ms
  heartbeatInterval?: number  // default: 30000ms
  connectTimeout?: number  // default: 10000ms
  requestTimeout?: number  // default: 30000ms
  // Event handlers
  onConnect?: () => void
  onDisconnect?: (reason: string, code?: number) => void
  onReconnecting?: (attempt: number, maxAttempts: number) => void
  onError?: (error: Error) => void
}
```

### 3. rpc/client.ts (DO's Custom Implementation)

The DO project also has its own RPC client at `/Users/nathanclevenger/projects/do/rpc/client.ts` with:
- ~920 lines of code
- JSON-RPC protocol
- Reconnection with exponential backoff
- Message queuing during reconnection
- Subscription support
- Pipeline/batch operations

## Use Case Recommendations

### Use capnweb when:

1. **Promise Pipelining is needed:**
   ```typescript
   // capnweb: Single round-trip for dependent operations
   const user = api.getUser('123')
   const profile = user.getProfile()
   const posts = profile.getPosts()
   const result = await posts  // One network round-trip
   ```

2. **Bidirectional RPC is needed:**
   ```typescript
   // capnweb: Server can call back to client
   class MyClient extends RpcTarget {
     notify(message: string) {
       console.log('Server says:', message)
     }
   }
   const api = newWebSocketRpcSession(ws, new MyClient())
   ```

3. **Capability-based security:**
   ```typescript
   // capnweb: Return authenticated sub-objects
   interface AuthApi {
     authenticate(token: string): AuthenticatedApi
   }
   interface AuthenticatedApi {
     getSecretData(): Promise<Data>
   }
   ```

4. **Cloudflare Workers Durable Objects:**
   The capnweb protocol is what Cloudflare uses internally for Worker-to-DO RPC.

### Use wsAdvanced when:

1. **Production-grade reliability is needed:**
   - Automatic reconnection keeps connections alive
   - Heartbeat detects zombie connections
   - Message queuing prevents request loss

2. **Simple JSON-RPC semantics:**
   ```typescript
   // wsAdvanced: Simple method calls
   await rpc.users.list()
   await rpc.users.create({ name: 'Alice' })
   ```

3. **Client-side applications:**
   - Browser apps need reconnection handling
   - Mobile apps face network instability

4. **Debugging and observability:**
   - Comprehensive event handlers
   - Debug logging
   - Protocol version negotiation

## Hybrid Approach Recommendation

The optimal architecture uses both:

```
Client Applications (Browser/Mobile/Node)
    |
    |-- wsAdvanced (JSON-RPC) -- for reliability
    |
    v
API Gateway / Proxy Worker
    |
    |-- capnweb -- for efficiency
    |
    v
Durable Objects
```

### Implementation:

1. **SDK layer (`sdk/`)**: Use wsAdvanced for public-facing APIs
   - End users get automatic reconnection
   - Simple JSON-RPC semantics
   - First-message auth for security

2. **Internal communication**: Use capnweb
   - Proxy Worker to Durable Objects
   - Worker-to-Worker RPC
   - Promise pipelining for efficiency

3. **rpc.do package**: Already provides both
   - `ws()` / `wsAdvanced()` for JSON-RPC
   - `capnweb()` for Cap'n Proto RPC

## Code Consolidation Opportunities

### Current Redundancy:

1. **rpc/client.ts** (920 lines) - Custom JSON-RPC client
2. **sdk/transport.ts** (862 lines) - WebSocket/HTTP transports
3. **rpc.do wsAdvanced** - External package

### Recommended Consolidation:

1. **Remove rpc/client.ts** in favor of rpc.do package
   - rpc.do already provides http(), ws(), wsAdvanced(), capnweb()
   - Reduces maintenance burden
   - Better tested external package

2. **Simplify sdk/transport.ts**
   - Use rpc.do transports internally
   - Keep only DO-specific wrapper logic
   - Focus on type-safety, not transport implementation

3. **Keep rpc/server.ts and rpc/methods.ts**
   - Server-side handling is DO-specific
   - Method registry pattern is valuable

### Migration Path:

```typescript
// Before: Custom implementation
import { DOClient } from '../rpc/client'
const client = new DOClient('wss://example.com/rpc')

// After: Using rpc.do
import { RPC, wsAdvanced } from 'rpc.do'
const client = RPC(wsAdvanced('wss://example.com/rpc', {
  token: 'auth-token',
  onReconnecting: (attempt) => console.log('Reconnecting...', attempt)
}))
```

## What capnweb Would Need to Replace wsAdvanced

If the goal is to use capnweb exclusively, you would need to implement a wrapper:

```typescript
// Hypothetical: capnweb with reconnection
function capnwebWithReconnect<T>(url: string, options: {
  localMain?: any
  autoReconnect?: boolean
  maxAttempts?: number
  onConnect?: () => void
  onDisconnect?: (reason: string) => void
  onReconnecting?: (attempt: number) => void
}): RpcStub<T> & { close(): void } {
  let stub: RpcStub<T>
  let attempts = 0

  function connect() {
    stub = newWebSocketRpcSession<T>(url, options.localMain)
    stub.onRpcBroken((error) => {
      options.onDisconnect?.(error.message)
      if (options.autoReconnect && attempts < (options.maxAttempts ?? Infinity)) {
        setTimeout(() => {
          options.onReconnecting?.(++attempts)
          connect()
        }, 1000 * Math.pow(2, attempts))
      }
    })
    attempts = 0
    options.onConnect?.()
  }

  connect()
  return stub
}
```

However, this still lacks:
- Heartbeat/keepalive (capnweb has no ping/pong)
- Message queuing during reconnection
- Connection state machine

## Conclusion

**wsAdvanced and capnweb are complementary, not redundant:**

- **capnweb**: Efficient binary RPC with promise pipelining for internal Worker-to-DO communication
- **wsAdvanced**: Reliable JSON-RPC with reconnection for client-facing APIs

**Recommended action:**
1. Keep both transport options in rpc.do
2. Consolidate DO's custom implementations to use rpc.do
3. Use capnweb for internal communication (via service bindings)
4. Use wsAdvanced for external client APIs

**Code reduction opportunity:**
- Remove ~1,800 lines of custom transport code (rpc/client.ts + sdk/transport.ts)
- Replace with rpc.do package usage (~50 lines of wrapper code)
