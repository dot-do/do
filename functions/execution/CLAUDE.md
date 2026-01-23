# Execution Layer - Implementation Guidelines

## Architecture Overview

The execution layer implements a tiered execution model where operations are routed to the most efficient tier capable of handling them.

## File Structure

```
src/execution/
  index.ts      - Main execution factory and exports
  tiers.ts      - Tier detection, routing, and metadata
  native.ts     - Tier 1: Native in-worker execution
  rpc.ts        - Tier 2: RPC service calls
  esm.ts        - Tier 3: Dynamic ESM module loading
  sandbox.ts    - Tier 4: Linux sandbox execution
  fsx.ts        - Filesystem abstraction layer
  __tests__/    - Test files
```

## Implementation Priorities

### Phase 1: Core Infrastructure
1. Implement `tiers.ts` with tier detection logic
2. Implement `index.ts` factory pattern
3. Implement `fsx.ts` with memory backend

### Phase 2: Native Execution
1. Implement `native.ts` for Tier 1 operations
2. Add common POSIX utility implementations
3. Integrate with fsx for file operations

### Phase 3: RPC and Modules
1. Implement `rpc.ts` for Tier 2 service calls
2. Implement `esm.ts` for Tier 3 module loading
3. Add module caching strategy

### Phase 4: Sandbox
1. Implement `sandbox.ts` for Tier 4 execution
2. Integrate with external sandbox service
3. Add container lifecycle management

## Type Imports

All types are defined in `/types/execution.ts`. Import as needed:

```typescript
import type {
  ExecutionTier,
  ExecutionTierInfo,
  EXECUTION_TIERS,
  ExecResult,
  ExecError,
  ExecOptions,
  ESMModule,
  ModuleContext,
  ModuleResult,
  FileSystem,
  // ... other types
} from '../../types/execution'
```

## Coding Standards

### Error Handling
- Always return `ExecResult` objects, never throw
- Include meaningful error codes and messages
- Preserve stack traces where available
- Log errors with appropriate context

### Performance
- Measure and report `duration` for all operations
- Use `performance.now()` for timing
- Cache expensive operations where safe
- Prefer streaming over buffering for large data

### Testing
- Unit tests for each module
- Integration tests for tier routing
- Mock external services in tests
- Test error paths thoroughly

## Key Patterns

### Execution Factory

```typescript
// index.ts pattern
export async function execute(
  operation: string,
  args: unknown[],
  options?: ExecOptions
): Promise<ExecResult> {
  const tier = options?.tier ?? detectTier(operation)
  const executor = getExecutor(tier)
  return executor.execute(operation, args, options)
}
```

### Tier Detection

```typescript
// tiers.ts pattern
export function detectTier(operation: string): ExecutionTier {
  if (NATIVE_OPS.has(operation)) return 1
  if (RPC_SERVICES.has(operation)) return 2
  if (DYNAMIC_MODULES.has(operation)) return 3
  return 4 // Default to sandbox for unknown operations
}
```

### Filesystem Abstraction

```typescript
// fsx.ts pattern
export function createFileSystem(backend: 'memory' | 'r2' | 'kv'): FileSystem {
  switch (backend) {
    case 'memory': return new MemoryFileSystem()
    case 'r2': return new R2FileSystem()
    case 'kv': return new KVFileSystem()
  }
}
```

## Security Considerations

1. **Input Validation**: Validate all inputs before execution
2. **Path Traversal**: Sanitize file paths in fsx operations
3. **Resource Limits**: Enforce timeouts and memory limits
4. **Code Injection**: Never eval untrusted code in Tier 1
5. **Network Access**: Control outbound network in sandboxes

## Dependencies

- No external dependencies for Tier 1
- HTTP client for Tier 2 RPC calls
- WASM loader for Tier 3 modules
- External sandbox service for Tier 4

## Monitoring

Track these metrics:
- Execution count per tier
- Latency distribution per tier
- Error rates per operation
- Resource usage (memory, CPU time)
