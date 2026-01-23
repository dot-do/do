# DO SDK

TypeScript client SDK for interacting with Durable Objects via RPC.

## Overview

The DO SDK provides a type-safe client for calling methods on Durable Objects. It uses CapnWeb WebSocket as the primary transport protocol with HTTP POST fallback for environments that don't support WebSockets.

## Features

- **Type-safe RPC calls** - Full TypeScript inference from DO schema
- **CapnWeb WebSocket transport** - Primary transport for real-time, bidirectional communication
- **HTTP POST fallback** - Automatic fallback for restricted environments
- **Auto-reconnection** - Automatic reconnection with exponential backoff
- **Request batching** - Batch multiple RPC calls for efficiency
- **Subscription support** - Subscribe to DO state changes

## Installation

```bash
npm install @do/sdk
# or
pnpm add @do/sdk
# or
yarn add @do/sdk
```

## Quick Start

```typescript
import { createClient } from '@do/sdk'
import type { MyDO } from './my-do.schema'

// Create a client for a specific DO instance
const client = createClient<MyDO>({
  url: 'https://my-do.workers.dev',
  id: 'my-instance-id',
})

// Call methods with full type inference
const result = await client.call('increment', { amount: 5 })
console.log(result) // Typed based on MyDO schema

// Subscribe to state changes
const unsubscribe = client.subscribe('counter', (value) => {
  console.log('Counter changed:', value)
})
```

## Configuration

```typescript
interface ClientConfig<T> {
  /** Base URL of the DO worker */
  url: string

  /** DO instance ID (name or hex ID) */
  id: string

  /** Transport preference: 'websocket' | 'http' | 'auto' (default: 'auto') */
  transport?: TransportType

  /** Authentication token */
  token?: string

  /** Custom headers for HTTP requests */
  headers?: Record<string, string>

  /** WebSocket reconnection options */
  reconnect?: {
    /** Enable auto-reconnection (default: true) */
    enabled?: boolean
    /** Initial delay in ms (default: 1000) */
    delay?: number
    /** Maximum delay in ms (default: 30000) */
    maxDelay?: number
    /** Backoff multiplier (default: 2) */
    multiplier?: number
    /** Maximum retry attempts (default: Infinity) */
    maxAttempts?: number
  }

  /** Request timeout in ms (default: 30000) */
  timeout?: number
}
```

## Transport Layer

### CapnWeb WebSocket (Primary)

The SDK uses CapnWeb protocol over WebSocket for efficient, real-time communication:

- Binary message format for minimal overhead
- Bidirectional streaming support
- Built-in request/response correlation
- Automatic ping/pong for connection health

### HTTP POST (Fallback)

When WebSocket is unavailable, the SDK falls back to HTTP POST:

- Compatible with all environments
- Request/response model
- Automatic retry on transient failures

## Type Inference

The SDK provides full type inference from your DO schema:

```typescript
// Define your DO schema
interface CounterDO {
  methods: {
    increment: {
      input: { amount: number }
      output: { value: number }
    }
    decrement: {
      input: { amount: number }
      output: { value: number }
    }
    getValue: {
      input: void
      output: { value: number }
    }
  }
  state: {
    counter: number
  }
}

// Client automatically infers types
const client = createClient<CounterDO>({ url, id })

// TypeScript knows:
// - input must be { amount: number }
// - output is { value: number }
const result = await client.call('increment', { amount: 5 })
```

## API Reference

### `createClient<T>(config: ClientConfig<T>): DOClient<T>`

Creates a new DO client instance.

### `client.call<M>(method: M, input: Input<M>): Promise<Output<M>>`

Calls a method on the DO with typed input/output.

### `client.subscribe<K>(key: K, callback: (value: State[K]) => void): () => void`

Subscribes to state changes. Returns an unsubscribe function.

### `client.batch(calls: Call[]): Promise<Result[]>`

Batches multiple RPC calls into a single request.

### `client.close(): Promise<void>`

Closes the client connection and cleans up resources.

## Events

```typescript
client.on('connected', () => {
  console.log('WebSocket connected')
})

client.on('disconnected', (reason) => {
  console.log('WebSocket disconnected:', reason)
})

client.on('reconnecting', (attempt) => {
  console.log('Reconnecting, attempt:', attempt)
})

client.on('error', (error) => {
  console.error('Client error:', error)
})
```

## Error Handling

```typescript
import { DOError, TimeoutError, TransportError } from '@do/sdk'

try {
  await client.call('myMethod', input)
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Request timed out')
  } else if (error instanceof TransportError) {
    console.log('Transport failed:', error.message)
  } else if (error instanceof DOError) {
    console.log('DO returned error:', error.code, error.message)
  }
}
```

## License

MIT
