# TDD Plan: @dotdo/do Comprehensive Review Implementation

> Generated from 4 parallel reviews: General Code, Architecture, TypeScript, Product/Vision
> Enhanced with security findings, performance issues, and Cloudflare-native solutions

## Executive Summary

This plan organizes all findings from the comprehensive code review into a Red-Green-Refactor TDD approach. Issues are prioritized by:
- **P0**: Critical bugs/security issues
- **P1**: Type safety and correctness issues
- **P2**: Architecture, performance, production features
- **P3**: Documentation
- **P4**: Cleanup and polish

---

## Current State

| Metric | Current | Target |
|--------|---------|--------|
| Tests Passing | 428/428 (100%) | 100% |
| Test Coverage | Unknown | 80%+ |
| `any` Types | 0 | 0 |
| `Function` Types | 2 | 0 |
| do.ts Lines | 3,098 | < 500 |
| Modules | 4 | 10+ |
| JSON.parse (unsafe) | 12 | 0 |
| Security Issues | 6 | 0 |

---

## Phase 0: Security Critical (P0)

### TDD Cycle 0A: XSS Prevention

#### Issue 1: [RED] Monaco Editor XSS Prevention Tests
- **Phase**: RED
- **Type**: security
- **Priority**: P0
- **Files**: Create `test/security-xss.test.ts`
- **Problem**: Monaco HTML embeds data directly without escaping (`src/do.ts:2947-3008`)
- **Tests to Write**:
  ```typescript
  describe('XSS Prevention', () => {
    it('should escape document IDs containing HTML')
    it('should escape document content containing script tags')
    it('should escape JSON.stringify output in HTML context')
    it('should not execute injected event handlers')
  })
  ```

#### Issue 2: [GREEN] Fix Monaco Editor XSS Vulnerability
- **Phase**: GREEN
- **Type**: security
- **Priority**: P0
- **Depends on**: Issue 1
- **Files**: `src/do.ts:2947-3008`
- **Problem**: Raw string interpolation in HTML:
  ```typescript
  // Current (VULNERABLE - line ~2994)
  value: ${JSON.stringify(json)}
  ```
- **Solution**: Use proper HTML escaping:
  ```typescript
  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  // Or use Hono's html helper
  import { html } from 'hono/html'
  ```

### TDD Cycle 0B: Prototype Pollution Prevention

#### Issue 3: [RED] Sandbox Prototype Pollution Tests
- **Phase**: RED
- **Type**: security
- **Priority**: P0
- **Files**: Add to `test/security.test.ts`
- **Problem**: Sandbox may be escapable via prototype manipulation (`src/do.ts:837`)
- **Tests to Write**:
  ```typescript
  describe('Sandbox Prototype Security', () => {
    it('should block Object.getPrototypeOf attacks')
    it('should block constructor.constructor attacks')
    it('should block __proto__ string access')
    it('should block Reflect-based prototype access')
    it('should block Symbol.iterator manipulation')
  })
  ```

#### Issue 4: [GREEN] Harden Sandbox Against Prototype Attacks
- **Phase**: GREEN
- **Type**: security
- **Priority**: P0
- **Depends on**: Issue 3
- **Files**: `src/do.ts:748-870`
- **Solution**: Add runtime pattern detection:
  ```typescript
  // Before creating Function, validate code
  const dangerousPatterns = [
    /__proto__/,
    /constructor\s*\.\s*constructor/,
    /Object\s*\.\s*getPrototypeOf/,
    /Reflect\s*\./,
    /\[\s*['"]constructor['"]\s*\]/,
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      throw new Error('Potentially dangerous code pattern detected')
    }
  }
  ```

---

## Phase 1: Type Safety (P1)

### TDD Cycle 1A: MCP Type Safety

#### Issue 5: [RED] MCP Type Safety Test Suite
- **Phase**: RED
- **Type**: task
- **Priority**: P1
- **Files**: Create `test/mcp-types.test.ts`
- **Problem**: MCP handler uses loose `Function` types
- **Tests to Write**:
  ```typescript
  describe('MCP Type Safety', () => {
    it('should enforce correct search parameter types')
    it('should enforce correct fetch parameter types')
    it('should enforce correct do parameter types')
    it('should reject invalid parameter types at compile time')
    it('should provide typed return values')
  })
  ```

#### Issue 6: [GREEN] Replace MCP Function Types with Specific Signatures
- **Phase**: GREEN
- **Type**: task
- **Priority**: P1
- **Depends on**: Issue 5
- **Files**: `src/mcp/index.ts:67-69`
- **Problem**:
  ```typescript
  // Current (line 67-69)
  private target: { search: Function; fetch: Function; do: Function }
  ```
- **Solution**:
  ```typescript
  import type { SearchOptions, FetchOptions, DoOptions, SearchResult, FetchResult, DoResult } from '../types'

  interface McpTarget {
    search: (query: string, options?: SearchOptions) => Promise<SearchResult[]>
    fetch: (target: string, options?: FetchOptions) => Promise<FetchResult>
    do: (code: string, options?: DoOptions) => Promise<DoResult>
  }

  private target: McpTarget
  constructor(target: McpTarget) { ... }
  ```

### TDD Cycle 1B: JSON.parse Validation

#### Issue 7: [RED] JSON.parse Validation Test Suite
- **Phase**: RED
- **Type**: task
- **Priority**: P1
- **Files**: Create `test/json-validation.test.ts`
- **Tests to Write**:
  ```typescript
  describe('JSON.parse Validation', () => {
    it('should validate event data against EventDataSchema')
    it('should validate artifact content against schema')
    it('should validate workflow context against schema')
    it('should handle malformed JSON gracefully')
    it('should return null for invalid structures')
    it('should not throw on invalid JSON')
  })
  ```

#### Issue 8: [GREEN] Replace Direct JSON.parse with safeJsonParse
- **Phase**: GREEN
- **Type**: task
- **Priority**: P1
- **Depends on**: Issue 7
- **Files**: `src/do.ts` (12 locations)
- **Locations to fix**:
  | Line | Current | Fix |
  |------|---------|-----|
  | 1366 | `JSON.parse(row.data)` | `safeJsonParse(row.data, EventDataSchema) ?? {}` |
  | 1433 | `JSON.parse(r.data)` | `safeJsonParse(r.data, EventDataSchema) ?? {}` |
  | 1481 | `JSON.parse(row.data)` | `safeJsonParse(row.data, RelationshipDataSchema)` |
  | 1701 | `JSON.parse(row.data)` | `safeJsonParse(row.data, RelationshipDataSchema)` |
  | 1734 | `JSON.parse(row.result)` | `safeJsonParse(row.result, z.unknown())` |
  | 1736 | `JSON.parse(row.metadata)` | `safeJsonParse(row.metadata, ActionMetadataSchema)` |
  | 2259 | `JSON.parse(row.content)` | `safeJsonParse(row.content, ArtifactContentSchema)` |
  | 2263 | `JSON.parse(row.metadata)` | `safeJsonParse(row.metadata, ArtifactMetadataSchema)` |
  | 2298 | `JSON.parse(row.content)` | `safeJsonParse(row.content, ArtifactContentSchema)` |
  | 2302 | `JSON.parse(row.metadata)` | `safeJsonParse(row.metadata, ArtifactMetadataSchema)` |
  | 2381 | `JSON.parse(row.context)` | `safeJsonParse(row.context, WorkflowContextSchema) ?? {}` |
  | 2382 | `JSON.parse(row.history)` | `safeJsonParse(row.history, WorkflowHistorySchema) ?? []` |
  | 2675 | `JSON.parse(messageStr)` | `safeJsonParse(messageStr, RpcMessageSchema)` |

### TDD Cycle 1C: Workflow State Persistence

#### Issue 9: [RED] Workflow State Persistence Tests
- **Phase**: RED
- **Type**: task
- **Priority**: P1
- **Files**: Add to `test/workflows.test.ts`
- **Problem**: Proxy `set()` handler calls `saveWorkflowState()` without awaiting
- **Tests to Write**:
  ```typescript
  describe('Workflow State Persistence', () => {
    it('should persist state changes before handler returns')
    it('should persist all state changes in order')
    it('should handle concurrent state updates')
    it('should flush pending state on handler completion')
    it('should not lose state on handler error')
  })
  ```

#### Issue 10: [GREEN] Fix Proxy State Save Race Condition
- **Phase**: GREEN
- **Type**: bug
- **Priority**: P1
- **Depends on**: Issue 9
- **Files**: `src/do.ts:2467-2487, 2599-2602`
- **Problem**: Lines 2469, 2480, 2486, 2601 call `saveWorkflowState()` without await
- **Challenge**: Proxy `set()` must return boolean synchronously
- **Solution**: Queue state changes, flush at end of handler:
  ```typescript
  let pendingSave: Promise<void> | null = null
  let saveQueued = false

  const queueSave = () => {
    if (!saveQueued) {
      saveQueued = true
      pendingSave = (async () => {
        await Promise.resolve() // Next tick
        saveQueued = false
        await doInstance.saveWorkflowState(state, workflowId)
      })()
    }
  }

  // In Proxy set handler:
  set(target, prop, value) {
    target[prop] = value
    queueSave() // Non-blocking queue
    return true
  }

  // Add flush method to context:
  flush: async () => {
    if (pendingSave) await pendingSave
  }
  ```

### TDD Cycle 1D: RPC Type Safety

#### Issue 11: [RED] RPC Type Guard Tests
- **Phase**: RED
- **Type**: task
- **Priority**: P1
- **Files**: Add to `test/rpc.test.ts`
- **Tests to Write**:
  ```typescript
  describe('RPC Type Guards', () => {
    it('should use proper type guards for method lookup')
    it('should not use double type assertions')
    it('should validate method exists before invocation')
    it('should type-narrow method parameters')
  })
  ```

#### Issue 12: [GREEN] Fix RPC Double Type Assertions
- **Phase**: GREEN
- **Type**: task
- **Priority**: P1
- **Depends on**: Issue 11
- **Files**: `src/rpc/index.ts:30`, `src/do.ts:358`
- **Problem**:
  ```typescript
  // Current (unsafe)
  const fn = (this as unknown as Record<string, unknown>)[method]
  ```
- **Solution**: Use proper method registry pattern:
  ```typescript
  // Create typed method map
  private readonly methodMap = new Map<string, (...args: unknown[]) => Promise<unknown>>()

  protected registerMethod(name: string, fn: (...args: unknown[]) => Promise<unknown>): void {
    this.methodMap.set(name, fn.bind(this))
  }

  async invoke(method: string, params: unknown[]): Promise<unknown> {
    const fn = this.methodMap.get(method)
    if (!fn) throw new Error(`Method not found: ${method}`)
    return fn(...params)
  }
  ```

---

## Phase 2: Architecture (P2)

### TDD Cycle 2A: Module Extraction

#### Issue 13: [RED] Create Module Test Suites
- **Phase**: RED
- **Type**: task
- **Priority**: P2
- **Description**: Create focused test files for each planned module:
  ```
  test/modules/crud.test.ts        # CRUD operations
  test/modules/graph.test.ts       # Things + Relationships
  test/modules/events.test.ts      # Event tracking
  test/modules/actions.test.ts     # Durable actions
  test/modules/artifacts.test.ts   # Content caching
  test/modules/workflows.test.ts   # Workflow engine
  test/modules/http.test.ts        # HTTP routing
  ```
- **Note**: Many tests exist; this reorganizes them by responsibility

#### Issue 14: [GREEN] Extract CRUD Module
- **Phase**: GREEN
- **Type**: task
- **Priority**: P2
- **Depends on**: Issue 13
- **Files**: Create `src/crud/index.ts`
- **Extract**:
  - `get<T>()` - lines 444-465
  - `list<T>()` - lines 467-517
  - `create<T>()` - lines 519-547
  - `update<T>()` - lines 549-581
  - `delete()` - lines 583-601
  - `generateId()` - line 437-442
  - `rowToDocument<T>()` - lines 433-435
- **Target**: ~200 lines
- **Interface**:
  ```typescript
  export interface CrudOperations<T extends Document> {
    get(collection: string, id: string): Promise<T | null>
    list(collection: string, options?: ListOptions): Promise<T[]>
    create(collection: string, doc: T): Promise<T>
    update(collection: string, id: string, doc: Partial<T>): Promise<T | null>
    delete(collection: string, id: string): Promise<boolean>
  }
  ```

#### Issue 15: [GREEN] Extract Graph Module (Things + Relationships)
- **Phase**: GREEN
- **Type**: task
- **Priority**: P2
- **Depends on**: Issue 14
- **Files**: Create `src/graph/index.ts`
- **Extract**:
  - Thing operations: ~400 lines (891-1298)
  - Relationship operations: ~270 lines (1440-1712)
  - `rowToThing<T>()`, `rowToRelationship<T>()`
- **Target**: ~450 lines

#### Issue 16: [GREEN] Extract Events Module
- **Phase**: GREEN
- **Type**: task
- **Priority**: P2
- **Depends on**: Issue 14
- **Files**: Create `src/events/index.ts`
- **Extract**:
  - `track<T>()` - lines 1300-1363
  - `getEvent()` - lines 1365-1388
  - `queryEvents()` - lines 1390-1438
  - `rowToEvent<T>()`
- **Target**: ~150 lines

#### Issue 17: [GREEN] Extract Actions Module
- **Phase**: GREEN
- **Type**: task
- **Priority**: P2
- **Depends on**: Issue 14
- **Files**: Create `src/actions/index.ts`
- **Extract**:
  - `send<T>()`, `doAction<T>()`, `tryAction<T>()` - lines 1714-1900
  - State transitions: `startAction()`, `completeAction()`, `failAction()`, `cancelAction()` - lines 1902-2100
  - `retryAction()`, `resetAction()`, `getNextRetryDelay()` - lines 2102-2182
  - `queryActions()`, `getAction()`
  - `rowToAction<T>()`
- **Target**: ~350 lines

#### Issue 18: [GREEN] Extract Artifacts Module
- **Phase**: GREEN
- **Type**: task
- **Priority**: P2
- **Depends on**: Issue 14
- **Files**: Create `src/artifacts/index.ts`
- **Extract**:
  - `storeArtifact<T>()` - lines 2184-2230
  - `getArtifact<T>()`, `getArtifactBySource()` - lines 2232-2310
  - `deleteArtifact()` - lines 2312-2328
  - `cleanExpiredArtifacts()` - lines 2330-2348
  - `rowToArtifact<T>()`
- **Target**: ~180 lines

#### Issue 19: [GREEN] Extract Workflows Module
- **Phase**: GREEN
- **Type**: task
- **Priority**: P2
- **Depends on**: Issue 14
- **Files**: Create `src/workflows/index.ts`
- **Extract**:
  - `createWorkflowContext()` - lines 2350-2630
  - `getWorkflowState()`, `saveWorkflowState()` - lines 2350-2420
  - `registerWorkflowHandler()`, `registerSchedule()` - lines 2422-2480
  - Workflow execution logic
- **Target**: ~350 lines

#### Issue 20: [GREEN] Extract HTTP Router
- **Phase**: GREEN
- **Type**: task
- **Priority**: P2
- **Depends on**: Issue 14
- **Files**: Create `src/http/router.ts`
- **Extract**:
  - `createRouter()` - lines 2793-3098
  - Route handlers for REST, MCP, Monaco
  - HTML escaping utilities
- **Target**: ~350 lines

#### Issue 21: [REFACTOR] Create Storage Abstraction Layer
- **Phase**: REFACTOR
- **Type**: task
- **Priority**: P2
- **Depends on**: Issues 14-20
- **Files**: Create `src/storage/index.ts`
- **Implementation**:
  ```typescript
  export interface StorageEngine {
    query<T>(sql: string, params: unknown[]): T[]
    exec(sql: string, params: unknown[]): void
    transaction<T>(fn: () => T): T
  }

  export class SqliteStorage implements StorageEngine {
    constructor(private ctx: DurableObjectState) {}

    query<T>(sql: string, params: unknown[]): T[] {
      return this.ctx.storage.sql.exec(sql, ...params).toArray() as T[]
    }

    exec(sql: string, params: unknown[]): void {
      this.ctx.storage.sql.exec(sql, ...params)
    }

    transaction<T>(fn: () => T): T {
      return this.ctx.storage.transaction(fn)
    }
  }
  ```

### TDD Cycle 2B: Workflow Handler Persistence

#### Issue 22: [RED] Workflow Handler Persistence Tests
- **Phase**: RED
- **Type**: task
- **Priority**: P2
- **Files**: Add to `test/workflows.test.ts`
- **Problem**: Handlers stored in memory Map, lost on restart
- **Tests to Write**:
  ```typescript
  describe('Workflow Handler Persistence', () => {
    it('should persist handlers to database')
    it('should load handlers on DO init')
    it('should survive DO restart')
    it('should not miss events during deployment')
  })
  ```

#### Issue 23: [GREEN] Persist Workflow Handlers to Database
- **Phase**: GREEN
- **Type**: task
- **Priority**: P2
- **Depends on**: Issue 22
- **Files**: `src/do.ts` (new table + methods)
- **Solution**:
  ```sql
  CREATE TABLE IF NOT EXISTS workflow_handlers_store (
    id TEXT PRIMARY KEY,
    event_pattern TEXT NOT NULL,
    handler_code TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
  ```
  - Store serialized handler references
  - Load on DO initialization
  - Consider using handler IDs with external registry

---

## Phase 3: Performance (P2)

### TDD Cycle 3A: Query Optimization

#### Issue 24: [RED] Performance Benchmark Tests
- **Phase**: RED
- **Type**: task
- **Priority**: P2
- **Files**: Create `test/performance.test.ts`
- **Tests to Write**:
  ```typescript
  describe('Performance', () => {
    it('should load 100 related things in <= 3 queries', async () => {
      // Create 100 relationships
      // Call related() - measure query count
      expect(queryCount).toBeLessThanOrEqual(3)
    })

    it('should list 1000 documents in < 50ms', async () => {
      // Create 1000 documents
      const start = Date.now()
      await db.list('docs', { limit: 1000 })
      expect(Date.now() - start).toBeLessThan(50)
    })

    it('should handle concurrent operations', async () => {
      // Fire 100 concurrent creates
      // All should succeed without deadlock
    })
  })
  ```

#### Issue 25: [GREEN] Fix N+1 Queries in related/references
- **Phase**: GREEN
- **Type**: bug
- **Priority**: P2
- **Depends on**: Issue 24
- **Files**: `src/do.ts:1545-1600` (references method)
- **Problem**: Fetches each thing individually in a loop
- **Solution**: Batch load with IN clause:
  ```typescript
  async references<T extends Record<string, unknown>>(
    url: string,
    type?: string
  ): Promise<Thing<T>[]> {
    const rels = await this.relationships(url, type, 'to')
    if (rels.length === 0) return []

    const urls = rels.map(r => r.from)
    // Single query with IN clause
    const placeholders = urls.map(() => '?').join(',')
    const rows = this.ctx.storage.sql.exec(
      `SELECT * FROM things WHERE url IN (${placeholders})`,
      ...urls
    ).toArray()

    return rows.map(r => this.rowToThing<T>(r))
  }
  ```

#### Issue 26: [GREEN] Add Missing Indexes
- **Phase**: GREEN
- **Type**: task
- **Priority**: P2
- **Depends on**: Issue 24
- **Files**: `src/do.ts:307-327`
- **Missing Indexes**:
  ```sql
  -- Workflow tables
  CREATE INDEX IF NOT EXISTS idx_workflow_state_id
    ON workflow_state(workflow_id)
  CREATE INDEX IF NOT EXISTS idx_workflow_handlers_pattern
    ON workflow_handlers(event_pattern)

  -- Relationship lookups
  CREATE INDEX IF NOT EXISTS idx_relationships_to
    ON relationships("to")
  CREATE INDEX IF NOT EXISTS idx_relationships_from_type
    ON relationships("from", type)

  -- Action scheduling
  CREATE INDEX IF NOT EXISTS idx_actions_scheduled
    ON actions(status, scheduled_for)
  ```

#### Issue 27: [REFACTOR] Create Query Builder
- **Phase**: REFACTOR
- **Type**: task
- **Priority**: P2
- **Depends on**: Issues 25, 26
- **Files**: Create `src/query/index.ts`
- **API**:
  ```typescript
  const results = await query<Thing>('things')
    .where('type', '=', 'user')
    .whereJson('data.status', '=', 'active')
    .whereIn('id', ['1', '2', '3'])
    .orderBy('created_at', 'desc')
    .limit(10)
    .offset(0)
    .execute(storage)
  ```

---

## Phase 4: Production Features (P2)

### TDD Cycle 4A: Authentication

#### Issue 28: [RED] Authentication Test Suite
- **Phase**: RED
- **Type**: task
- **Priority**: P2
- **Files**: Create `test/auth.test.ts`
- **Tests**:
  ```typescript
  describe('Authentication', () => {
    it('should reject requests without auth header')
    it('should reject invalid tokens')
    it('should accept valid Bearer tokens')
    it('should populate AuthContext for valid auth')
    it('should validate WebSocket upgrade auth')
    it('should apply method-level permissions')
    it('should support custom auth providers')
  })
  ```

#### Issue 29: [GREEN] Implement Authentication Middleware
- **Phase**: GREEN
- **Type**: feature
- **Priority**: P2
- **Depends on**: Issue 28
- **Files**: Create `src/auth/index.ts`, modify `src/do.ts`
- **Implementation**:
  ```typescript
  export interface AuthProvider {
    authenticate(request: Request): Promise<AuthContext | null>
    authorize(context: AuthContext, method: string, resource?: string): Promise<boolean>
  }

  export class BearerTokenAuthProvider implements AuthProvider {
    constructor(private verifyToken: (token: string) => Promise<AuthContext | null>) {}

    async authenticate(request: Request): Promise<AuthContext | null> {
      const auth = request.headers.get('Authorization')
      if (!auth?.startsWith('Bearer ')) return null
      return this.verifyToken(auth.slice(7))
    }

    async authorize(context: AuthContext, method: string): Promise<boolean> {
      return context.permissions?.includes(method) ?? false
    }
  }
  ```

#### Issue 30: [REFACTOR] Make Authentication Pluggable
- **Phase**: REFACTOR
- **Type**: task
- **Priority**: P2
- **Depends on**: Issue 29
- **Description**: Allow custom auth providers via constructor:
  ```typescript
  interface DOOptions<Env> {
    authProvider?: AuthProvider
    // other options...
  }

  class DO<Env> extends Agent<Env> {
    constructor(ctx: DurableObjectState, env: Env, options?: DOOptions<Env>) {
      this.authProvider = options?.authProvider
    }
  }
  ```

### TDD Cycle 4B: Rate Limiting (Cloudflare Native)

#### Issue 31: [RED] Rate Limiting Test Suite
- **Phase**: RED
- **Type**: task
- **Priority**: P2
- **Files**: Create `test/rate-limiting.test.ts`
- **Tests**:
  ```typescript
  describe('Rate Limiting (Cloudflare)', () => {
    it('should call Cloudflare Rate Limiting API')
    it('should allow requests under limit')
    it('should reject requests over limit with 429')
    it('should include Retry-After header')
    it('should support per-method limits')
    it('should support per-user limits')
    it('should work with rate limiting binding')
  })
  ```

#### Issue 32: [GREEN] Implement Cloudflare Rate Limiting
- **Phase**: GREEN
- **Type**: feature
- **Priority**: P2
- **Depends on**: Issue 31
- **Files**: Create `src/rate-limit/index.ts`
- **Implementation**: Use Cloudflare Rate Limiting API binding:
  ```typescript
  import { RateLimiter } from '@cloudflare/workers-types'

  export interface RateLimitConfig {
    binding: RateLimiter
    defaultLimit: number      // requests per minute
    methodLimits?: Record<string, number>
  }

  export class CloudflareRateLimiter {
    constructor(private config: RateLimitConfig) {}

    async check(
      request: Request,
      method: string,
      userId?: string
    ): Promise<{ allowed: boolean; retryAfter?: number }> {
      const key = userId
        ? `user:${userId}:${method}`
        : `ip:${request.headers.get('CF-Connecting-IP')}:${method}`

      const limit = this.config.methodLimits?.[method] ?? this.config.defaultLimit

      const { success } = await this.config.binding.limit({
        key,
        limit,
        period: 60, // per minute
      })

      if (!success) {
        return { allowed: false, retryAfter: 60 }
      }
      return { allowed: true }
    }
  }
  ```
- **Env Binding**: Add to wrangler.toml:
  ```toml
  [[rate_limits]]
  binding = "RATE_LIMITER"
  namespace_id = "..."
  simple = { limit = 100, period = 60 }
  ```

#### Issue 33: [REFACTOR] Configurable Rate Limits
- **Phase**: REFACTOR
- **Type**: task
- **Priority**: P2
- **Depends on**: Issue 32
- **Description**: Per-method and per-user configurable limits:
  ```typescript
  interface DOOptions<Env> {
    rateLimiter?: {
      binding: RateLimiter
      limits: {
        default: number
        methods?: Record<string, number>
        users?: Record<string, number>
      }
    }
  }
  ```

### TDD Cycle 4C: WebSocket Security

#### Issue 34: [RED] WebSocket Security Tests
- **Phase**: RED
- **Type**: task
- **Priority**: P2
- **Files**: Add to `test/websocket.test.ts`
- **Tests**:
  ```typescript
  describe('WebSocket Security', () => {
    it('should require auth on upgrade')
    it('should reject invalid auth on upgrade')
    it('should track authenticated connections')
    it('should handle connection cleanup on auth expiry')
    it('should rate limit per connection')
  })
  ```

#### Issue 35: [GREEN] Add WebSocket Authentication
- **Phase**: GREEN
- **Type**: feature
- **Priority**: P2
- **Depends on**: Issues 29, 34
- **Files**: `src/do.ts:3020-3040`
- **Implementation**:
  ```typescript
  // In handleRequest, before accepting WebSocket
  if (upgradeHeader?.toLowerCase() === 'websocket') {
    if (this.authProvider) {
      const authContext = await this.authProvider.authenticate(request)
      if (!authContext) {
        return new Response('Unauthorized', { status: 401 })
      }
      // Store auth context with connection
    }
    // ... accept WebSocket
  }
  ```

### TDD Cycle 4D: Error Handling

#### Issue 36: [RED] Error Handling Test Suite
- **Phase**: RED
- **Type**: task
- **Priority**: P2
- **Files**: Add to `test/error-handling.test.ts`
- **Tests**:
  ```typescript
  describe('Error Handling', () => {
    it('should log WebSocket errors with context')
    it('should implement circuit breaker for fetch')
    it('should return structured error responses')
    it('should include error codes in responses')
    it('should not leak internal errors to clients')
  })
  ```

#### Issue 37: [GREEN] Improve WebSocket Error Handling
- **Phase**: GREEN
- **Type**: task
- **Priority**: P2
- **Depends on**: Issue 36
- **Files**: `src/do.ts:2789-2792`
- **Current**:
  ```typescript
  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error)  // Just logs
  }
  ```
- **Solution**:
  ```typescript
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const connInfo = this.connections.get(ws)
    const errorMsg = error instanceof Error ? error.message : String(error)

    // Structured logging
    this.logger?.error('WebSocket error', {
      connectionId: connInfo?.id,
      subscribedTopics: connInfo?.topics,
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Cleanup connection state
    this.connections.delete(ws)
    for (const [topic, subs] of this.subscribers) {
      subs.delete(ws)
    }

    // Emit error event for monitoring
    await this.track({
      type: 'WebSocket.error',
      source: 'system',
      data: { connectionId: connInfo?.id, error: errorMsg }
    })
  }
  ```

#### Issue 38: [GREEN] Add Circuit Breaker for External Calls
- **Phase**: GREEN
- **Type**: feature
- **Priority**: P2
- **Depends on**: Issue 36
- **Files**: Create `src/circuit-breaker/index.ts`
- **Implementation**:
  ```typescript
  export class CircuitBreaker {
    private failures = new Map<string, { count: number; lastFailure: number }>()
    private readonly threshold = 5
    private readonly resetTimeout = 60000 // 1 minute

    isOpen(key: string): boolean {
      const state = this.failures.get(key)
      if (!state) return false
      if (Date.now() - state.lastFailure > this.resetTimeout) {
        this.failures.delete(key)
        return false
      }
      return state.count >= this.threshold
    }

    recordFailure(key: string): void {
      const state = this.failures.get(key) ?? { count: 0, lastFailure: 0 }
      state.count++
      state.lastFailure = Date.now()
      this.failures.set(key, state)
    }

    recordSuccess(key: string): void {
      this.failures.delete(key)
    }
  }
  ```

### TDD Cycle 4E: Observability

#### Issue 39: [RED] Observability Test Suite
- **Phase**: RED
- **Type**: task
- **Priority**: P2
- **Files**: Create `test/observability.test.ts`
- **Tests**:
  ```typescript
  describe('Observability', () => {
    it('should log all operations with structured format')
    it('should include operation timing')
    it('should track error rates')
    it('should support custom logger')
    it('should emit operation metrics')
  })
  ```

#### Issue 40: [GREEN] Add Structured Logging
- **Phase**: GREEN
- **Type**: feature
- **Priority**: P2
- **Depends on**: Issue 39
- **Files**: Create `src/logging/index.ts`
- **Implementation**:
  ```typescript
  export interface Logger {
    debug(message: string, context?: Record<string, unknown>): void
    info(message: string, context?: Record<string, unknown>): void
    warn(message: string, context?: Record<string, unknown>): void
    error(message: string, error?: Error, context?: Record<string, unknown>): void
  }

  export class ConsoleLogger implements Logger {
    constructor(private prefix: string = 'DO') {}

    private format(level: string, message: string, context?: Record<string, unknown>): string {
      return JSON.stringify({
        level,
        timestamp: new Date().toISOString(),
        prefix: this.prefix,
        message,
        ...context,
      })
    }

    debug(message: string, context?: Record<string, unknown>): void {
      console.debug(this.format('debug', message, context))
    }
    // ... other methods
  }
  ```

#### Issue 41: [REFACTOR] Pluggable Logger
- **Phase**: REFACTOR
- **Type**: task
- **Priority**: P2
- **Depends on**: Issue 40
- **Description**: Allow custom logger via constructor:
  ```typescript
  interface DOOptions<Env> {
    logger?: Logger
  }
  ```

---

## Phase 5: Data Validation (P2)

### TDD Cycle 5A: Schema Validation

#### Issue 42: [RED] Data Validation Test Suite
- **Phase**: RED
- **Type**: task
- **Priority**: P2
- **Files**: Create `test/validation.test.ts`
- **Tests**:
  ```typescript
  describe('Validation', () => {
    it('should reject documents not matching schema')
    it('should provide detailed validation errors')
    it('should validate on create and update')
    it('should allow schema-less collections')
    it('should validate Things against schema')
  })
  ```

#### Issue 43: [GREEN] Integrate Zod Schema Validation
- **Phase**: GREEN
- **Type**: feature
- **Priority**: P2
- **Depends on**: Issue 42
- **Description**: Add optional schema validation to collections:
  ```typescript
  interface DOOptions<Env> {
    schemas?: Record<string, z.ZodType>
  }

  // In create/update methods:
  if (this.options?.schemas?.[collection]) {
    const result = this.options.schemas[collection].safeParse(doc)
    if (!result.success) {
      throw new ValidationError(result.error)
    }
  }
  ```

#### Issue 44: [REFACTOR] Schema Error Formatting
- **Phase**: REFACTOR
- **Type**: task
- **Priority**: P2
- **Depends on**: Issue 43
- **Description**: Provide user-friendly validation error messages

---

## Phase 6: Documentation (P3)

#### Issue 45: API Reference Documentation
- **Phase**: N/A (documentation)
- **Type**: task
- **Priority**: P3
- **Deliverables**:
  - TypeDoc or similar auto-generated docs
  - Method-by-method reference
  - Type definitions explained
  - Example usage for each method

#### Issue 46: Deployment Guide
- **Phase**: N/A (documentation)
- **Type**: task
- **Priority**: P3
- **Deliverables**:
  - wrangler.toml example
  - Environment setup (bindings, rate limiters)
  - Production checklist
  - Migration guide

#### Issue 47: Troubleshooting Guide
- **Phase**: N/A (documentation)
- **Type**: task
- **Priority**: P3
- **Deliverables**:
  - FAQ section
  - Error code reference
  - Debug tips
  - Common issues and solutions

---

## Phase 7: Cleanup (P4)

#### Issue 48: Complete Monaco Collections Discovery
- **Phase**: GREEN
- **Type**: task
- **Priority**: P4
- **Files**: `src/do.ts:2889`
- **Problem**: `const collections: string[] = []  // TODO: Get actual collections`
- **Fix**:
  ```typescript
  const collections = this.ctx.storage.sql.exec(
    'SELECT DISTINCT collection FROM documents'
  ).toArray().map(r => r.collection as string)
  ```

#### Issue 49: WebSocket Connection Cleanup
- **Phase**: GREEN
- **Type**: task
- **Priority**: P4
- **Files**: `src/do.ts:173-176`
- **Problem**: No cleanup for stale connections
- **Fix**:
  ```typescript
  // Add periodic cleanup
  private cleanupInterval?: number

  private startConnectionCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      for (const [ws, info] of this.connections) {
        if (ws.readyState !== WebSocket.OPEN) {
          this.connections.delete(ws)
          for (const [topic, subs] of this.subscribers) {
            subs.delete(ws)
          }
        }
      }
    }, 60000) as unknown as number
  }
  ```

#### Issue 50: Type Database Row Interfaces
- **Phase**: REFACTOR
- **Type**: task
- **Priority**: P4
- **Files**: `src/types.ts`
- **Description**: Create explicit row types for database queries:
  ```typescript
  interface DocumentRow {
    collection: string
    id: string
    data: string
    created_at: string
    updated_at: string
  }

  interface ThingRow {
    ns: string
    type: string
    id: string
    url: string
    data: string
    created_at: string
    updated_at: string
  }

  // ... etc for all tables
  ```

---

## Dependency Graph

```
Phase 0 (P0 - Security Critical)
├── Issue 1: XSS tests [RED]
│   └── Issue 2: Fix XSS [GREEN]
├── Issue 3: Prototype tests [RED]
│   └── Issue 4: Harden sandbox [GREEN]

Phase 1 (P1 - Type Safety)
├── Issue 5: MCP type tests [RED]
│   └── Issue 6: Fix MCP types [GREEN]
├── Issue 7: JSON tests [RED]
│   └── Issue 8: Fix JSON.parse [GREEN]
├── Issue 9: Workflow state tests [RED]
│   └── Issue 10: Fix Proxy state [GREEN]
├── Issue 11: RPC tests [RED]
│   └── Issue 12: Fix RPC types [GREEN]

Phase 2 (P2 - Architecture)
├── Issue 13: Module tests [RED]
│   ├── Issue 14: CRUD module [GREEN]
│   ├── Issue 15: Graph module [GREEN]
│   ├── Issue 16: Events module [GREEN]
│   ├── Issue 17: Actions module [GREEN]
│   ├── Issue 18: Artifacts module [GREEN]
│   ├── Issue 19: Workflows module [GREEN]
│   └── Issue 20: HTTP router [GREEN]
│       └── Issue 21: Storage abstraction [REFACTOR]
├── Issue 22: Handler persistence tests [RED]
│   └── Issue 23: Persist handlers [GREEN]

Phase 3 (P2 - Performance)
├── Issue 24: Performance tests [RED]
│   ├── Issue 25: Fix N+1 [GREEN]
│   └── Issue 26: Add indexes [GREEN]
│       └── Issue 27: Query builder [REFACTOR]

Phase 4 (P2 - Production)
├── Auth: 28 [RED] → 29 [GREEN] → 30 [REFACTOR]
├── Rate Limit: 31 [RED] → 32 [GREEN] → 33 [REFACTOR]
├── WS Security: 34 [RED] → 35 [GREEN]
├── Error Handling: 36 [RED] → 37, 38 [GREEN]
└── Observability: 39 [RED] → 40 [GREEN] → 41 [REFACTOR]

Phase 5 (P2 - Validation)
└── Validation: 42 [RED] → 43 [GREEN] → 44 [REFACTOR]

Phase 6 (P3 - Docs)
├── Issue 45: API docs
├── Issue 46: Deployment guide
└── Issue 47: Troubleshooting

Phase 7 (P4 - Cleanup)
├── Issue 48: Monaco collections [GREEN]
├── Issue 49: WS cleanup [GREEN]
└── Issue 50: Row types [REFACTOR]
```

---

## Sprint Planning

### Sprint 1: Security (P0) - 2-3 days
1. Issues 1-2: XSS prevention
2. Issues 3-4: Prototype pollution hardening
- **Goal**: Zero security vulnerabilities

### Sprint 2: Type Safety (P1) - 3-4 days
3. Issues 5-6: MCP types
4. Issues 7-8: JSON validation
5. Issues 9-10: Workflow state
6. Issues 11-12: RPC types
- **Goal**: Zero `Function` types, safe JSON parsing

### Sprint 3: Architecture Part 1 (P2) - 4-5 days
7. Issue 13: Module test suites
8. Issues 14-17: Extract CRUD, Graph, Events, Actions
- **Goal**: do.ts reduced by 1,200 lines

### Sprint 4: Architecture Part 2 (P2) - 3-4 days
9. Issues 18-21: Extract Artifacts, Workflows, HTTP, Storage
10. Issues 22-23: Workflow handler persistence
- **Goal**: do.ts < 500 lines, 8+ modules

### Sprint 5: Performance (P2) - 2-3 days
11. Issue 24: Performance tests
12. Issues 25-27: N+1 fix, indexes, query builder
- **Goal**: < 3 queries for related(), proper indexes

### Sprint 6: Production Part 1 (P2) - 3-4 days
13. Issues 28-30: Authentication
14. Issues 31-33: Cloudflare Rate Limiting
- **Goal**: Auth middleware, CF rate limiting

### Sprint 7: Production Part 2 (P2) - 3-4 days
15. Issues 34-35: WebSocket security
16. Issues 36-38: Error handling + circuit breaker
17. Issues 39-41: Observability
- **Goal**: Production-ready error handling

### Sprint 8: Validation & Docs (P2-P3) - 2-3 days
18. Issues 42-44: Schema validation
19. Issues 45-47: Documentation
- **Goal**: Optional validation, complete docs

### Sprint 9: Polish (P4) - 1-2 days
20. Issues 48-50: Monaco, cleanup, row types
- **Goal**: All TODOs resolved

---

## Success Metrics

| Metric | Current | After Phase 0 | After Phase 1 | After All |
|--------|---------|---------------|---------------|-----------|
| Security Issues | 6 | 0 | 0 | 0 |
| Tests Passing | 428/428 | 440+ | 460+ | 550+ |
| `Function` Types | 2 | 2 | 0 | 0 |
| Unsafe JSON.parse | 12 | 12 | 0 | 0 |
| do.ts Lines | 3,098 | 3,098 | 3,098 | < 500 |
| Modules | 4 | 4 | 4 | 10+ |
| Test Coverage | ? | ? | ? | 80%+ |

---

## TDD Discipline

1. **Always RED first**: Write failing tests before any implementation
2. **Minimum GREEN**: Write only enough code to pass tests
3. **Refactor only when GREEN**: Never refactor while tests fail
4. **One commit per issue**: Reference issue ID in commit message
5. **Dependencies matter**: Don't start GREEN until RED is done
6. **Security first**: Phase 0 must complete before Phase 1

---

## Notes

- **Cloudflare Rate Limiting**: Uses native CF bindings, not custom implementation
- **Auth is optional**: System works without auth for development
- **Module extraction preserves API**: External interface unchanged
- **Performance tests use real SQLite**: Not mocked for accuracy
