# Execution Layer

The execution layer provides a tiered approach to code execution, optimizing for latency while maintaining security and isolation boundaries.

## Execution Tiers

### Tier 1: Native In-Worker (<1ms)

Native operations that execute directly within the Cloudflare Worker runtime.

**Capabilities:**
- File system operations (via fsx abstraction)
- HTTP fetch requests
- POSIX utility emulation
- JSON/YAML parsing
- String manipulation
- Crypto operations

**Use Cases:**
- Reading/writing to R2 or KV storage
- Making API calls
- Data transformation
- Configuration parsing

### Tier 2: RPC Service (<5ms)

External Durable Object service calls for specialized operations.

**Services:**
- `jq.do` - JSON query and transformation
- `npm.do` - NPM package resolution and info
- `git.do` - Git operations
- `db.do` - Database queries

**Architecture:**
- Service discovery via `.do` domain convention
- RPC over HTTP or WebSocket
- Automatic retry and failover
- Result caching where appropriate

### Tier 3: Dynamic Module (<10ms)

Dynamically loaded WASM or JavaScript modules for complex processing.

**Supported Modules:**
- `esbuild` - JavaScript/TypeScript bundling
- `typescript` - Type checking and transpilation
- `prettier` - Code formatting
- `markdown` - Markdown processing

**Loading Strategy:**
- Lazy loading on first use
- Module caching in memory
- WASM modules loaded from R2/KV
- Version pinning support

### Tier 4: Linux Sandbox (2-3s)

Full Linux container execution for operations requiring native binaries or complete isolation.

**Capabilities:**
- Full Linux userspace
- Native binary execution
- Container isolation
- Arbitrary language runtimes

**Implementation:**
- Firecracker microVMs or gVisor
- Ephemeral containers
- Network isolation
- Resource limits (CPU, memory, disk)

## ESM Module Execution

The execution layer supports running ESM (ECMAScript Module) code with:

- **Type Safety**: TypeScript definitions for all modules
- **Sandboxing**: Controlled execution environment
- **Dependencies**: Automatic dependency resolution
- **Testing**: Built-in test case execution

### Module Structure

```typescript
interface ESMModule {
  name: string           // Package name
  version?: string       // Semantic version
  types?: string         // TypeScript definitions
  module: string         // Implementation code
  script?: string        // Entry point
  tests?: TestCase[]     // Test cases
  dependencies?: Record<string, string>
}
```

### Execution Context

Modules run within a controlled context:

```typescript
interface ModuleContext {
  globals?: Record<string, unknown>  // Available globals
  allowedImports?: string[]          // Whitelist of imports
  memoryLimit?: number               // Memory cap in bytes
  timeout?: number                   // Execution timeout
}
```

## Filesystem Abstraction (fsx)

A virtual filesystem interface that abstracts storage backends.

### Supported Backends

- **Memory**: In-memory filesystem for ephemeral operations
- **R2**: Cloudflare R2 object storage
- **KV**: Cloudflare KV for small files
- **SQLite**: D1-backed filesystem with SQLite

### API

The `FileSystem` interface provides Node.js-compatible operations:

```typescript
interface FileSystem {
  readFile(path: string, encoding?: BufferEncodingType): Promise<string | Uint8Array>
  writeFile(path: string, data: string | Uint8Array): Promise<void>
  appendFile(path: string, data: string | Uint8Array): Promise<void>
  mkdir(path: string, options?: MkdirOptions): Promise<void>
  rmdir(path: string, options?: RmdirOptions): Promise<void>
  readdir(path: string, options?: ReaddirOptions): Promise<Dirent[] | string[]>
  stat(path: string): Promise<Stats>
  lstat(path: string): Promise<Stats>
  unlink(path: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  copyFile(src: string, dest: string): Promise<void>
  exists(path: string): Promise<boolean>
  realpath(path: string): Promise<string>
  symlink(target: string, path: string): Promise<void>
  readlink(path: string): Promise<string>
  chmod(path: string, mode: number): Promise<void>
  chown(path: string, uid: number, gid: number): Promise<void>
  truncate(path: string, len?: number): Promise<void>
  utimes(path: string, atime: Date | number, mtime: Date | number): Promise<void>
}
```

## Tier Selection

The execution factory automatically selects the appropriate tier:

1. **Explicit Override**: Use `options.tier` to force a specific tier
2. **Capability Match**: Match operation requirements to tier capabilities
3. **Latency Target**: Choose lowest latency tier that can complete the operation
4. **Fallback**: Escalate to higher tiers if lower tiers fail

## Error Handling

All execution results follow a consistent structure:

```typescript
interface ExecResult {
  success: boolean
  tier: ExecutionTier
  duration: number
  output?: unknown
  error?: ExecError
  logs?: LogEntry[]
}
```

## Security

- **Sandboxing**: Each tier provides appropriate isolation
- **Resource Limits**: CPU, memory, and time limits enforced
- **Network Control**: Configurable network access per operation
- **Audit Logging**: All executions logged with context
