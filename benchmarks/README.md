# DO Bundle Size Benchmarks

Minimal workers to measure Durable Object overhead and bundle sizes.

## Results

| Benchmark | Raw Size | Gzipped | Description |
|-----------|----------|---------|-------------|
| **01-bare-do** | 0.61 KB | **0.35 KB** | Absolute minimum DO |
| **02-sqlite-do** | 1.34 KB | **0.63 KB** | DO with SQLite storage |
| **03-minimal-rpc** | 1.99 KB | **0.86 KB** | Inline JSON-RPC + WebSocket |
| **04-minimal-routing** | 1.26 KB | **0.59 KB** | Routing strategies (inline) |
| **05-with-rpc-do** | 20.80 KB | **5.13 KB** | Worker importing rpc.do |
| **Full proxy (current)** | 160.37 KB | **36.70 KB** | Complete DO platform |

## Key Insights

### Baseline DO Overhead
- **Bare DO**: 0.35 KB gzipped - the absolute minimum
- **SQLite DO**: 0.63 KB gzipped (+0.28 KB for SQLite)
- **With RPC**: 0.86 KB gzipped (+0.51 KB for JSON-RPC + WebSocket)

### rpc.do Package Overhead
- **rpc.do import**: ~5 KB gzipped
- This includes the RPC client, transports, and type definitions

### Full Platform Overhead
- **Full proxy**: 36.70 KB gzipped
- This includes: Hono, all routes, all collections, CDC, AI, integrations

### Breakdown of Full Proxy (36.70 KB)
| Component | Estimated Size |
|-----------|---------------|
| Baseline DO | ~0.5 KB |
| rpc.do | ~5 KB |
| Hono framework | ~10 KB |
| API routes | ~8 KB |
| Collections/CDC | ~5 KB |
| Integrations | ~5 KB |
| Types/utilities | ~3 KB |

## Running Benchmarks

```bash
# Measure all benchmarks
cd /Users/nathanclevenger/projects/do
for dir in benchmarks/0*/; do
  name=$(basename "$dir")
  size=$(cd "$dir" && npx wrangler deploy --dry-run 2>&1 | grep "Total Upload" | awk '{print $3, $5}')
  echo "$name: $size"
done

# Measure current proxy
npx wrangler deploy --dry-run --config proxy/wrangler.jsonc 2>&1 | grep "Total Upload"
```

## Routing Strategies

The `04-minimal-routing` benchmark demonstrates different DO mapping patterns:

### 1. Per-User (`user`)
```
user:alice -> DO-1
user:bob   -> DO-2
```
One DO per user globally. Simple but no tenant isolation.

### 2. Per-Hostname (`hostname`)
```
api.example.com -> DO-1 (shared by all users)
api.other.com   -> DO-2 (shared by all users)
```
One DO per domain. Good for domain-specific config/state.

### 3. Per-Hostname+User (`hostname-user`) [DEFAULT]
```
api.example.com:alice -> DO-1
api.example.com:bob   -> DO-2
api.other.com:alice   -> DO-3
```
Isolates users per domain. Good for multi-domain SaaS.

### 4. Per-Tenant+User (`tenant-user`)
```
/acme/alice  -> tenant:acme:user:alice  -> DO-1
/acme/bob    -> tenant:acme:user:bob    -> DO-2
/corp/alice  -> tenant:corp:user:alice  -> DO-3
```
Multi-tenant SaaS pattern. Tenant extracted from URL path.

## Optimization Targets

For a minimal RPC-only proxy:
- **Target**: ~5-10 KB gzipped
- **Current overhead**: ~31 KB from Hono, routes, collections, integrations

To achieve minimal proxy:
1. Use inline routing (0.59 KB) instead of Hono
2. Import only rpc.do client (5 KB)
3. Move collections/integrations to DO-side only
4. Lazy-load features on demand

## Configuration

Set routing strategy via environment variable:

```jsonc
// wrangler.jsonc
{
  "vars": {
    "ROUTING_STRATEGY": "hostname-user"  // or "user", "hostname", "tenant-user"
  }
}
```
