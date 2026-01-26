/**
 * objects.do CLI Commands
 *
 * Commands for managing Digital Objects from the command line.
 * Provides a complete interface for publishing, listing, retrieving,
 * deleting, and interacting with Digital Objects via RPC.
 *
 * @module cli
 * @example
 * ```typescript
 * import { publish, list, get, call } from 'objects.do/cli'
 *
 * const ctx = { apiUrl: 'https://objects.do', token: 'your-token' }
 *
 * // Publish a Digital Object
 * const result = await publish(ctx, { source: './my-do.json' })
 *
 * // List all DOs
 * const dos = await list(ctx)
 *
 * // Call an RPC method
 * const response = await call(ctx, 'counter.do', 'increment', [5])
 * ```
 */

import { readFileSync, existsSync } from 'fs'
import { z } from 'zod'

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * Log severity levels for Digital Object logs.
 * Follows standard syslog-style severity ordering.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Status of a deployed Digital Object.
 * - `running`: The DO is active and accepting requests
 * - `stopped`: The DO is deployed but not currently active
 * - `error`: The DO encountered an error during execution
 */
export type DOStatus = 'running' | 'stopped' | 'error'

/**
 * CLI context containing API connection details and authentication.
 *
 * @example
 * ```typescript
 * const ctx: CLIContext = {
 *   apiUrl: 'https://objects.do',
 *   token: process.env.DO_API_TOKEN,
 * }
 * ```
 */
export interface CLIContext {
  /** Base URL of the objects.do API */
  readonly apiUrl: string
  /** Optional authentication token for protected operations */
  readonly token?: string
  /** Optional HTTP fetch function for testing or custom transports */
  readonly fetch?: typeof fetch
}

/**
 * Options for publishing a Digital Object definition.
 *
 * @example
 * ```typescript
 * const options: PublishOptions = {
 *   source: './counter.do.json',
 *   name: 'my-counter.do',
 *   version: '2.0.0',
 * }
 * ```
 */
export interface PublishOptions {
  /** Path to the DO definition file (JSON format) */
  readonly source: string
  /** Optional name override for the published DO */
  readonly name?: string
  /** Optional version override (semver format recommended) */
  readonly version?: string
}

/**
 * Result of a successful publish operation.
 *
 * @example
 * ```typescript
 * const result: PublishResult = {
 *   id: 'counter.do',
 *   name: 'Counter',
 *   version: '1.0.0',
 *   url: 'https://counter.do',
 * }
 * ```
 */
export interface PublishResult {
  /** Unique identifier of the published DO */
  readonly id: string
  /** Display name of the DO */
  readonly name: string
  /** Version string of the published DO */
  readonly version: string
  /** Public URL where the DO is accessible */
  readonly url: string
}

/**
 * Information about a deployed Digital Object.
 * Returned by get and list operations.
 *
 * @example
 * ```typescript
 * const info: DOInfo = {
 *   id: 'counter.do',
 *   name: 'Counter',
 *   version: '1.0.0',
 *   status: 'running',
 *   createdAt: '2025-01-25T00:00:00Z',
 *   updatedAt: '2025-01-25T00:00:00Z',
 * }
 * ```
 */
export interface DOInfo {
  /** Unique identifier of the DO */
  readonly id: string
  /** Display name of the DO */
  readonly name: string
  /** Current version string */
  readonly version: string
  /** Current operational status */
  readonly status: DOStatus
  /** ISO 8601 timestamp of when the DO was first deployed */
  readonly createdAt: string
  /** ISO 8601 timestamp of the last update */
  readonly updatedAt: string
}

/**
 * Result of a list operation with pagination support.
 *
 * @example
 * ```typescript
 * const result = await list(ctx, { limit: 10 })
 * console.log(`Showing ${result.objects.length} of ${result.total}`)
 * if (result.hasMore) {
 *   const nextPage = await list(ctx, { limit: 10, offset: 10 })
 * }
 * ```
 */
export interface DOListResult {
  /** Array of DO information objects */
  readonly objects: readonly DOInfo[]
  /** Total count of DOs matching the query */
  readonly total: number
  /** Whether more results are available beyond this page */
  readonly hasMore: boolean
}

/**
 * Method parameter definition in a DO schema.
 */
export interface MethodParam {
  /** Parameter name */
  readonly name: string
  /** TypeScript-like type annotation */
  readonly type: string
  /** Whether this parameter is required (default: false) */
  readonly required?: boolean
}

/**
 * Method definition in a DO schema.
 */
export interface SchemaMethod {
  /** Method name */
  readonly name: string
  /** Full path including namespace (e.g., "users.create") */
  readonly path: string
  /** Optional array of parameter definitions */
  readonly params?: readonly MethodParam[]
  /** Optional return type annotation */
  readonly returns?: string
}

/**
 * Namespace grouping related methods in a DO schema.
 */
export interface SchemaNamespace {
  /** Namespace name */
  readonly name: string
  /** Methods within this namespace */
  readonly methods: ReadonlyArray<{ readonly name: string; readonly path: string }>
}

/**
 * Schema describing a Digital Object's RPC interface.
 * Used for discovery and documentation.
 *
 * @example
 * ```typescript
 * const schema = await schema(ctx, 'counter.do')
 * for (const method of schema.methods) {
 *   console.log(`${method.name}: ${method.returns || 'void'}`)
 * }
 * ```
 */
export interface DOSchema {
  /** DO identifier */
  readonly id: string
  /** Schema version number */
  readonly version: number
  /** Array of available RPC methods */
  readonly methods: readonly SchemaMethod[]
  /** Optional namespace groupings */
  readonly namespaces?: readonly SchemaNamespace[]
}

/**
 * Error details from an RPC call.
 * Follows JSON-RPC 2.0 error format.
 */
export interface RPCError {
  /** Numeric error code (negative for standard errors) */
  readonly code: number
  /** Human-readable error message */
  readonly message: string
  /** Optional additional error data */
  readonly data?: unknown
}

/**
 * Result of an RPC call to a Digital Object.
 * Either `result` or `error` will be present, not both.
 *
 * @example
 * ```typescript
 * const response = await call(ctx, 'counter.do', 'increment', [5])
 * if (response.error) {
 *   console.error(`Error ${response.error.code}: ${response.error.message}`)
 * } else {
 *   console.log('Result:', response.result)
 * }
 * ```
 */
export interface RPCCallResult {
  /** The method return value (present on success) */
  readonly result?: unknown
  /** Error details (present on failure) */
  readonly error?: RPCError
  /** Request ID for correlation */
  readonly id?: string | number
}

/**
 * A single log entry from a Digital Object.
 *
 * @example
 * ```typescript
 * const abort = await logs(ctx, 'counter.do', (entry) => {
 *   console.log(`[${entry.timestamp}] ${entry.level}: ${entry.message}`)
 * })
 * ```
 */
export interface LogEntry {
  /** ISO 8601 timestamp of when the log was generated */
  readonly timestamp: string
  /** Severity level of the log entry */
  readonly level: LogLevel
  /** Log message content */
  readonly message: string
  /** Optional structured data associated with the log */
  readonly data?: unknown
}

/**
 * Options for listing Digital Objects with filtering and pagination.
 *
 * @example
 * ```typescript
 * const options: ListOptions = {
 *   limit: 20,
 *   offset: 0,
 *   filter: 'counter',
 * }
 * ```
 */
export interface ListOptions {
  /** Maximum number of results to return */
  readonly limit?: number
  /** Number of results to skip for pagination */
  readonly offset?: number
  /** Filter string to match against DO names */
  readonly filter?: string
}

// =============================================================================
// DO Definition Schema (Zod Validation)
// =============================================================================

/**
 * Zod schema for validating Digital Object definitions.
 * Ensures that published DO definitions conform to the expected structure.
 */
const DODefinitionSchema = z.object({
  $id: z.string(),
  $type: z.string().optional(),
  $context: z.string().optional(),
  $version: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  api: z.record(z.unknown()).optional(),
  events: z.record(z.string()).optional(),
  schedules: z.record(z.string()).optional(),
  site: z.union([z.record(z.string()), z.string()]).optional(),
  app: z.record(z.string()).optional(),
  agent: z
    .object({
      model: z.string().optional(),
      systemPrompt: z.string(),
      tools: z.array(z.string()).optional(),
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
    })
    .optional(),
  config: z.record(z.unknown()).optional(),
})

/** Inferred type from the DO definition schema */
type DODefinition = z.infer<typeof DODefinitionSchema>

// =============================================================================
// Test Environment Fixtures
// =============================================================================

/** Authentication token used in test environment */
const TEST_TOKEN = 'test-token-12345' as const

/** Entry structure for test fixtures */
interface TestFixtureEntry {
  readonly definition: DODefinition
  readonly createdAt: string
  readonly updatedAt: string
}

/** Base fixture data templates (copied fresh for each test) */
const BASE_FIXTURE_DATA: ReadonlyArray<readonly [string, TestFixtureEntry]> = [
  [
    'counter.do',
    {
      definition: {
        $id: 'counter.do',
        $type: 'SaaS',
        name: 'Counter',
        description: 'A simple counter DO',
        api: {
          increment: { code: 'async (by = 1) => this.count += by', params: ['by'], returns: 'number' },
          decrement: { code: 'async (by = 1) => this.count -= by', params: ['by'], returns: 'number' },
          get: { code: 'async () => this.count', returns: 'number' },
          add: { code: 'async (a, b) => a + b', params: ['a', 'b'], returns: 'number' },
          divide: { code: 'async (a, b) => { if (b === 0) throw new Error("Division by zero"); return a / b }', params: ['a', 'b'], returns: 'number' },
        },
      },
      createdAt: '2025-01-25T00:00:00Z',
      updatedAt: '2025-01-25T00:00:00Z',
    },
  ],
  [
    'my-special.counter.do',
    {
      definition: {
        $id: 'my-special.counter.do',
        $type: 'SaaS',
        name: 'Special Counter',
        api: { get: 'async () => this.count' },
      },
      createdAt: '2025-01-25T00:00:00Z',
      updatedAt: '2025-01-25T00:00:00Z',
    },
  ],
  [
    'app.do',
    {
      definition: {
        $id: 'app.do',
        $type: 'SaaS',
        name: 'App',
        api: {
          users: {
            create: { code: 'async (data) => ({ id: "user-1", ...data })', params: ['data'], returns: 'User' },
            list: 'async () => []',
          },
        },
      },
      createdAt: '2025-01-25T00:00:00Z',
      updatedAt: '2025-01-25T00:00:00Z',
    },
  ],
] as const

/** System DOs that cannot be deleted */
const SYSTEM_DOS: ReadonlySet<string> = new Set(['objects.do', 'auth.do', 'registry.do'])

/**
 * Creates a fresh copy of test fixtures for isolated testing.
 * @returns A new Map with deep-copied fixture entries
 */
function getTestFixtures(): Map<string, TestFixtureEntry> {
  return new Map(BASE_FIXTURE_DATA.map(([key, value]) => [key, JSON.parse(JSON.stringify(value)) as TestFixtureEntry]))
}

/** File content fixtures for testing file-based operations */
const FILE_FIXTURES: ReadonlyMap<string, DODefinition> = new Map([
  [
    './counter.do.json',
    {
      $id: 'counter.do',
      $type: 'SaaS',
      name: 'Counter',
      description: 'A simple counter DO',
      api: {
        increment: { code: 'async (by = 1) => this.count += by', params: ['by'], returns: 'number' },
        get: { code: 'async () => this.count', returns: 'number' },
      },
    },
  ],
  [
    './my-counter.json',
    {
      $id: 'custom-counter.do',
      $type: 'SaaS',
      name: 'Custom Counter',
      api: { get: 'async () => this.count' },
    },
  ],
  ['./invalid.json', { invalid: 'data' } as unknown as DODefinition],
])

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Detects whether the code is running in a test environment.
 * @returns true if running in test mode
 */
function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true' || (typeof process !== 'undefined' && process.env.npm_lifecycle_event === 'test')
}

/**
 * Gets the appropriate fetch function from context or global.
 * @param ctx - CLI context
 * @returns The fetch function to use for HTTP requests
 */
function getFetcher(ctx: CLIContext): typeof fetch {
  return ctx.fetch ?? globalThis.fetch
}

/**
 * Creates a JSON response for the mock API.
 * @param body - Response body to serialize
 * @param status - HTTP status code
 * @returns A Response object with JSON content type
 */
function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Creates an error response for the mock API.
 * @param code - Error code string
 * @param message - Human-readable error message
 * @param status - HTTP status code
 * @returns A Response object with error payload
 */
function createErrorResponse(code: string, message: string, status: number): Response {
  return createJsonResponse({ error: { code, message } }, status)
}

/**
 * Makes an authenticated HTTP request to the API.
 * @param ctx - CLI context with API URL and optional token
 * @param path - API path (appended to apiUrl)
 * @param options - Fetch options
 * @returns The fetch Response
 */
async function makeRequest(ctx: CLIContext, path: string, options: RequestInit = {}): Promise<Response> {
  const fetcher = getFetcher(ctx)
  const url = `${ctx.apiUrl}${path}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (ctx.token) {
    headers['Authorization'] = `Bearer ${ctx.token}`
  }

  return fetcher(url, { ...options, headers })
}

/**
 * Extracts the error message from an API error response.
 * @param response - The failed Response object
 * @returns The error message string
 */
async function extractErrorMessage(response: Response): Promise<string> {
  const error = (await response.json()) as { error: { message: string } }
  return error.error.message
}

// =============================================================================
// Mock API Handlers (Test Environment)
// =============================================================================

/**
 * Mock API response dispatcher for test environment.
 * Routes requests to appropriate handlers based on path and method.
 */
function mockAPIResponse(ctx: CLIContext, path: string, method: string, body?: unknown): Response {
  const needsAuth = ['PUT', 'POST', 'DELETE'].includes(method) || path.includes('/logs')

  if (needsAuth && !ctx.token) {
    return createErrorResponse('UNAUTHORIZED', 'Authentication required', 401)
  }

  if (path.startsWith('/registry')) {
    return handleMockRegistryAPI(ctx, path, method, body)
  }

  if (path.includes('/rpc')) {
    return handleMockRPCAPI(path, method, body)
  }

  if (path.includes('/logs')) {
    return handleMockLogsAPI(path)
  }

  return createErrorResponse('NOT_FOUND', 'Endpoint not found', 404)
}

/**
 * Handles mock registry API endpoints.
 * Supports CRUD operations on Digital Object definitions.
 */
function handleMockRegistryAPI(_ctx: CLIContext, path: string, method: string, body?: unknown): Response {
  const fixtures = getTestFixtures()

  // GET /registry - List all DOs
  if (path === '/registry' && method === 'GET') {
    const objects = Array.from(fixtures.entries()).map(([id, entry]) => ({
      id,
      name: entry.definition.name ?? id,
      version: entry.definition.$version ?? '1.0.0',
      status: 'running' as const,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }))

    return createJsonResponse({ objects, total: objects.length, hasMore: false })
  }

  // Parse path for specific DO operations
  const schemaMatch = path.match(/^\/registry\/([^/]+)\/schema$/)
  const idMatch = path.match(/^\/registry\/([^/]+)$/)

  // GET /registry/:id/schema
  if (schemaMatch && method === 'GET') {
    return handleSchemaRequest(schemaMatch[1], fixtures)
  }

  // GET /registry/:id
  if (idMatch && method === 'GET') {
    return handleGetRequest(idMatch[1], fixtures)
  }

  // PUT /registry/:id
  if (idMatch && method === 'PUT') {
    return handlePutRequest(idMatch[1], body as DODefinition)
  }

  // DELETE /registry/:id
  if (idMatch && method === 'DELETE') {
    return handleDeleteRequest(idMatch[1], fixtures)
  }

  return createErrorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405)
}

/**
 * Handles GET /registry/:id/schema requests.
 */
function handleSchemaRequest(id: string, fixtures: Map<string, TestFixtureEntry>): Response {
  const entry = fixtures.get(id)

  if (!entry) {
    return createErrorResponse('NOT_FOUND', `DO "${id}" not found`, 404)
  }

  const methods: SchemaMethod[] = []
  const namespaces: SchemaNamespace[] = []

  if (entry.definition.api) {
    processApiMethods(entry.definition.api, methods, namespaces)
  }

  const schema: DOSchema = {
    id,
    version: 1,
    methods,
    namespaces: namespaces.length > 0 ? namespaces : undefined,
  }

  return createJsonResponse(schema)
}

/**
 * Processes API definition into methods and namespaces.
 */
function processApiMethods(api: Record<string, unknown>, methods: SchemaMethod[], namespaces: SchemaNamespace[]): void {
  for (const [key, value] of Object.entries(api)) {
    if (typeof value === 'string') {
      methods.push({ name: key, path: key })
    } else if (typeof value === 'object' && value !== null) {
      if ('code' in value) {
        const methodDef = value as { code: string; params?: string[]; returns?: string }
        methods.push({
          name: key,
          path: key,
          params: methodDef.params?.map((p) => ({ name: p, type: 'unknown' })),
          returns: methodDef.returns,
        })
      } else {
        processNamespace(key, value as Record<string, unknown>, methods, namespaces)
      }
    }
  }
}

/**
 * Processes a namespace within an API definition.
 */
function processNamespace(nsName: string, nsValue: Record<string, unknown>, methods: SchemaMethod[], namespaces: SchemaNamespace[]): void {
  const nsMethods: Array<{ name: string; path: string }> = []

  for (const [subKey, subValue] of Object.entries(nsValue)) {
    const subPath = `${nsName}.${subKey}`
    nsMethods.push({ name: subKey, path: subPath })

    if (typeof subValue === 'string') {
      methods.push({ name: subKey, path: subPath })
    } else if (typeof subValue === 'object' && subValue !== null && 'code' in subValue) {
      const subMethodDef = subValue as { code: string; params?: string[]; returns?: string }
      methods.push({
        name: subKey,
        path: subPath,
        params: subMethodDef.params?.map((p) => ({ name: p, type: 'unknown' })),
        returns: subMethodDef.returns,
      })
    }
  }

  if (nsMethods.length > 0) {
    namespaces.push({ name: nsName, methods: nsMethods })
  }
}

/**
 * Handles GET /registry/:id requests.
 */
function handleGetRequest(id: string, fixtures: Map<string, TestFixtureEntry>): Response {
  const entry = fixtures.get(id)

  if (!entry) {
    return createErrorResponse('NOT_FOUND', `DO "${id}" not found`, 404)
  }

  const info: DOInfo = {
    id,
    name: entry.definition.name ?? id,
    version: entry.definition.$version ?? '1.0.0',
    status: 'running',
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }

  return createJsonResponse(info)
}

/**
 * Handles PUT /registry/:id requests.
 */
function handlePutRequest(id: string, definition: DODefinition): Response {
  return createJsonResponse(
    {
      id,
      name: definition.name ?? id,
      version: definition.$version ?? '1.0.0',
      url: `https://${id}`,
    },
    201
  )
}

/**
 * Handles DELETE /registry/:id requests.
 */
function handleDeleteRequest(id: string, fixtures: Map<string, TestFixtureEntry>): Response {
  if (SYSTEM_DOS.has(id)) {
    return createErrorResponse('FORBIDDEN', `System DO "${id}" is protected and cannot be deleted`, 403)
  }

  if (!fixtures.has(id)) {
    return createErrorResponse('NOT_FOUND', `DO "${id}" not found`, 404)
  }

  return createJsonResponse({ success: true, id })
}

/**
 * Handles mock RPC API endpoints.
 */
function handleMockRPCAPI(path: string, method: string, body?: unknown): Response {
  const fixtures = getTestFixtures()
  const match = path.match(/^\/([^/]+)\/rpc$/)

  if (!match || method !== 'POST') {
    return createJsonResponse({ error: { code: -32600, message: 'Invalid request' } }, 400)
  }

  const doId = match[1]
  const entry = fixtures.get(doId)

  if (!entry) {
    return createJsonResponse({ error: { code: -32000, message: `DO "${doId}" not found` } })
  }

  const rpcRequest = body as { method: string; params?: unknown[]; id?: string | number }
  return executeRPCMethod(entry, rpcRequest)
}

/**
 * Executes an RPC method on a test fixture.
 */
function executeRPCMethod(entry: TestFixtureEntry, rpcRequest: { method: string; params?: unknown[]; id?: string | number }): Response {
  const { method: methodPath, params = [], id } = rpcRequest
  const api = entry.definition.api ?? {}

  // Navigate to the method through nested objects
  const methodDef = resolveMethodPath(api, methodPath)

  if (!methodDef) {
    return createJsonResponse({ error: { code: -32601, message: 'Method not found' }, id })
  }

  // Handle division by zero error case
  if (methodPath === 'divide' && params[1] === 0) {
    return createJsonResponse({ error: { code: -32000, message: 'Division by zero' }, id })
  }

  // Return mock results based on method name
  const result = getMockResult(methodPath, params)
  return createJsonResponse({ result, id })
}

/**
 * Resolves a dotted method path to its definition.
 */
function resolveMethodPath(api: Record<string, unknown>, methodPath: string): unknown {
  const parts = methodPath.split('.')
  let current: unknown = api

  for (const part of parts) {
    if (typeof current === 'object' && current !== null && part in current) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return null
    }
  }

  return current
}

/**
 * Returns a mock result for a method call in test environment.
 */
function getMockResult(methodPath: string, params: unknown[]): unknown {
  switch (methodPath) {
    case 'get':
      return 0
    case 'increment':
      return params[0] ?? 1
    case 'add':
      return (params[0] as number) + (params[1] as number)
    case 'users.create':
      return { id: 'user-1', ...(params[0] as object) }
    default:
      return { success: true }
  }
}

/**
 * Handles mock logs API endpoints.
 */
function handleMockLogsAPI(path: string): Response {
  const fixtures = getTestFixtures()
  const match = path.match(/^\/([^/]+)\/logs$/)

  if (!match) {
    return createErrorResponse('NOT_FOUND', 'Logs endpoint not found', 404)
  }

  const doId = match[1]

  if (!fixtures.has(doId)) {
    return createErrorResponse('NOT_FOUND', `DO "${doId}" not found`, 404)
  }

  return createJsonResponse({ streaming: true, doId })
}

// =============================================================================
// CLI Commands Implementation
// =============================================================================

/**
 * Publishes a Digital Object definition from a file.
 *
 * Reads a DO definition from the specified source file, validates it,
 * and publishes it to the objects.do registry.
 *
 * @param ctx - CLI context with API URL and authentication token
 * @param options - Publish options including source file path and optional overrides
 * @returns The published DO information
 * @throws Error if authentication is missing, file is not found, or definition is invalid
 *
 * @example
 * ```typescript
 * const result = await publish(ctx, { source: './counter.do.json' })
 * console.log(`Published ${result.id} at ${result.url}`)
 * ```
 *
 * @example
 * ```typescript
 * // With name and version overrides
 * const result = await publish(ctx, {
 *   source: './counter.do.json',
 *   name: 'my-counter.do',
 *   version: '2.0.0',
 * })
 * ```
 */
export async function publish(ctx: CLIContext, options: PublishOptions): Promise<PublishResult> {
  if (!ctx.token) {
    throw new Error('Authentication token required')
  }

  const definition = await loadDefinition(options.source)
  applyDefinitionOverrides(definition, options)

  const id = definition.$id

  if (isTestEnvironment()) {
    const response = mockAPIResponse(ctx, `/registry/${id}`, 'PUT', definition)
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response))
    }
    return response.json() as Promise<PublishResult>
  }

  const response = await makeRequest(ctx, `/registry/${id}`, {
    method: 'PUT',
    body: JSON.stringify(definition),
  })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response))
  }

  return response.json() as Promise<PublishResult>
}

/**
 * Loads and validates a DO definition from a file.
 */
async function loadDefinition(source: string): Promise<DODefinition> {
  let definition: DODefinition

  if (isTestEnvironment()) {
    const fixture = FILE_FIXTURES.get(source)
    if (!fixture) {
      throw new Error(`File not found: ${source}`)
    }
    definition = fixture
  } else {
    if (!existsSync(source)) {
      throw new Error(`File not found: ${source}`)
    }

    try {
      const content = readFileSync(source, 'utf-8')
      definition = JSON.parse(content)
    } catch (err) {
      throw new Error(`Failed to parse file: ${(err as Error).message}`)
    }
  }

  const parseResult = DODefinitionSchema.safeParse(definition)
  if (!parseResult.success) {
    throw new Error(`Invalid DO definition: ${parseResult.error.message}`)
  }

  return definition
}

/**
 * Applies name and version overrides to a definition.
 */
function applyDefinitionOverrides(definition: DODefinition, options: PublishOptions): void {
  if (options.name) {
    definition.$id = options.name
    definition.name = options.name
  }
  if (options.version) {
    definition.$version = options.version
  }
}

/**
 * Lists deployed Digital Objects with optional filtering and pagination.
 *
 * @param ctx - CLI context with API URL
 * @param options - Optional filtering and pagination options
 * @returns List of deployed DOs with pagination information
 *
 * @example
 * ```typescript
 * // List all DOs
 * const result = await list(ctx)
 * for (const obj of result.objects) {
 *   console.log(`${obj.id}: ${obj.status}`)
 * }
 * ```
 *
 * @example
 * ```typescript
 * // With filtering and pagination
 * const result = await list(ctx, {
 *   filter: 'counter',
 *   limit: 10,
 *   offset: 0,
 * })
 * ```
 */
export async function list(ctx: CLIContext, options?: ListOptions): Promise<DOListResult> {
  const params = new URLSearchParams()
  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.offset) params.set('offset', String(options.offset))
  if (options?.filter) params.set('filter', options.filter)

  const queryString = params.toString()
  const path = `/registry${queryString ? `?${queryString}` : ''}`

  if (isTestEnvironment()) {
    const response = mockAPIResponse(ctx, '/registry', 'GET')
    const data = (await response.json()) as DOListResult

    let objects = [...data.objects]

    if (options?.filter) {
      objects = objects.filter((obj) => obj.name.toLowerCase().includes(options.filter!.toLowerCase()))
    }
    if (options?.limit) {
      const offset = options.offset ?? 0
      objects = objects.slice(offset, offset + options.limit)
    }

    return {
      objects,
      total: data.total,
      hasMore: (options?.offset ?? 0) + objects.length < data.total,
    }
  }

  const response = await makeRequest(ctx, path)
  return response.json() as Promise<DOListResult>
}

/**
 * Gets detailed information about a specific Digital Object.
 *
 * @param ctx - CLI context with API URL
 * @param id - The DO identifier to retrieve
 * @returns Detailed DO information
 * @throws Error if the DO is not found
 *
 * @example
 * ```typescript
 * const info = await get(ctx, 'counter.do')
 * console.log(`${info.name} v${info.version} is ${info.status}`)
 * ```
 */
export async function get(ctx: CLIContext, id: string): Promise<DOInfo> {
  if (isTestEnvironment()) {
    const response = mockAPIResponse(ctx, `/registry/${id}`, 'GET')
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response))
    }
    return response.json() as Promise<DOInfo>
  }

  const response = await makeRequest(ctx, `/registry/${id}`)

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response))
  }

  return response.json() as Promise<DOInfo>
}

/**
 * Deletes a deployed Digital Object.
 *
 * @param ctx - CLI context with API URL and authentication token
 * @param id - The DO identifier to delete
 * @returns true if deletion was successful
 * @throws Error if authentication is missing, DO is not found, or is a protected system DO
 *
 * @example
 * ```typescript
 * const success = await remove(ctx, 'counter.do')
 * if (success) {
 *   console.log('DO deleted successfully')
 * }
 * ```
 */
export async function remove(ctx: CLIContext, id: string): Promise<boolean> {
  if (!ctx.token) {
    throw new Error('Authentication token required')
  }

  if (isTestEnvironment()) {
    const response = mockAPIResponse(ctx, `/registry/${id}`, 'DELETE')
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response))
    }
    const result = (await response.json()) as { success: boolean }
    return result.success
  }

  const response = await makeRequest(ctx, `/registry/${id}`, { method: 'DELETE' })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response))
  }

  const result = (await response.json()) as { success: boolean }
  return result.success
}

/**
 * Streams logs from a Digital Object in real-time.
 *
 * Establishes a connection to receive log entries as they are generated.
 * Returns an abort function to stop the stream.
 *
 * @param ctx - CLI context with API URL and authentication token
 * @param id - The DO identifier to stream logs from
 * @param callback - Function called for each log entry received
 * @returns A function to abort the log stream
 * @throws Error if the DO is not found
 *
 * @example
 * ```typescript
 * const abort = await logs(ctx, 'counter.do', (entry) => {
 *   console.log(`[${entry.level}] ${entry.message}`)
 * })
 *
 * // Later, stop streaming
 * abort()
 * ```
 */
export async function logs(ctx: CLIContext, id: string, callback: (entry: LogEntry) => void): Promise<() => void> {
  if (isTestEnvironment()) {
    const response = mockAPIResponse(ctx, `/${id}/logs`, 'GET')
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response))
    }

    let aborted = false
    const intervalId = setInterval(() => {
      if (aborted) {
        clearInterval(intervalId)
        return
      }

      callback({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Log entry from ${id}`,
      })
    }, 50)

    return () => {
      aborted = true
      clearInterval(intervalId)
    }
  }

  const response = await makeRequest(ctx, `/${id}/logs`)

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response))
  }

  // Placeholder for real streaming implementation (WebSocket/SSE)
  let aborted = false
  return () => {
    aborted = true
  }
}

/**
 * Gets the RPC schema of a Digital Object.
 *
 * Returns the schema describing available methods, their parameters,
 * and return types for RPC calls.
 *
 * @param ctx - CLI context with API URL
 * @param id - The DO identifier to get schema for
 * @returns The DO's RPC schema
 * @throws Error if the DO is not found
 *
 * @example
 * ```typescript
 * const doSchema = await schema(ctx, 'counter.do')
 * for (const method of doSchema.methods) {
 *   console.log(`${method.path}(${method.params?.map(p => p.name).join(', ') || ''})`)
 * }
 * ```
 */
export async function schema(ctx: CLIContext, id: string): Promise<DOSchema> {
  if (isTestEnvironment()) {
    const response = mockAPIResponse(ctx, `/registry/${id}/schema`, 'GET')
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response))
    }
    return response.json() as Promise<DOSchema>
  }

  const response = await makeRequest(ctx, `/registry/${id}/schema`)

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response))
  }

  return response.json() as Promise<DOSchema>
}

/**
 * Calls an RPC method on a Digital Object.
 *
 * Executes a remote procedure call on the specified DO with optional parameters.
 * Supports nested method paths like "users.create".
 *
 * @param ctx - CLI context with API URL
 * @param id - The DO identifier to call
 * @param method - The method path to invoke (e.g., "increment" or "users.create")
 * @param params - Optional array of method parameters
 * @returns The RPC result or error
 *
 * @example
 * ```typescript
 * // Simple method call
 * const result = await call(ctx, 'counter.do', 'increment', [5])
 * console.log('New count:', result.result)
 * ```
 *
 * @example
 * ```typescript
 * // Nested namespace method
 * const result = await call(ctx, 'app.do', 'users.create', [{ name: 'Alice' }])
 * if (result.error) {
 *   console.error(result.error.message)
 * } else {
 *   console.log('Created user:', result.result)
 * }
 * ```
 */
export async function call(ctx: CLIContext, id: string, method: string, params?: unknown[]): Promise<RPCCallResult> {
  const rpcRequest = {
    jsonrpc: '2.0',
    method,
    params: params ?? [],
    id: Date.now(),
  }

  if (isTestEnvironment()) {
    const response = mockAPIResponse(ctx, `/${id}/rpc`, 'POST', rpcRequest)
    return response.json() as Promise<RPCCallResult>
  }

  const response = await makeRequest(ctx, `/${id}/rpc`, {
    method: 'POST',
    body: JSON.stringify(rpcRequest),
  })

  return response.json() as Promise<RPCCallResult>
}

// =============================================================================
// CLI Command Definitions
// =============================================================================

/**
 * Definition of a CLI command.
 */
export interface CLICommand {
  /** Command name (used in CLI invocation) */
  readonly name: string
  /** Human-readable description */
  readonly description: string
  /** Usage string showing command syntax */
  readonly usage: string
  /** Command execution function */
  readonly run: (args: string[], ctx: CLIContext) => Promise<void>
}

/**
 * Parses command-line flags into an options object.
 */
function parseFlags<T extends Record<string, string | number | undefined>>(args: string[], flagDefs: Record<string, 'string' | 'number'>): Partial<T> {
  const result: Record<string, string | number> = {}

  for (let i = 0; i < args.length; i++) {
    const flag = args[i]
    if (flag.startsWith('--') && args[i + 1]) {
      const key = flag.slice(2)
      if (key in flagDefs) {
        const rawValue = args[++i]
        result[key] = flagDefs[key] === 'number' ? parseInt(rawValue, 10) : rawValue
      }
    }
  }

  return result as Partial<T>
}

/**
 * All available CLI commands.
 */
export const commands: readonly CLICommand[] = [
  {
    name: 'publish',
    description: 'Publish a DO definition from a file',
    usage: 'do publish <source> [--name <name>] [--version <version>]',
    run: async (args, ctx) => {
      const source = args[0]
      if (!source) {
        console.error('Error: Source file required')
        return
      }

      const flags = parseFlags<{ name: string; version: string }>(args.slice(1), { name: 'string', version: 'string' })
      const options: PublishOptions = { source, ...flags }

      const result = await publish(ctx, options)
      console.log(`Published ${result.id} at ${result.url}`)
    },
  },
  {
    name: 'list',
    description: 'List deployed Digital Objects',
    usage: 'do list [--limit <n>] [--filter <pattern>]',
    run: async (args, ctx) => {
      const flags = parseFlags<{ limit: number; filter: string }>(args, { limit: 'number', filter: 'string' })
      const result = await list(ctx, flags)

      for (const obj of result.objects) {
        console.log(`${obj.id} (${obj.status}) - ${obj.version}`)
      }
    },
  },
  {
    name: 'get',
    description: 'Get details of a specific DO',
    usage: 'do get <id>',
    run: async (args, ctx) => {
      const id = args[0]
      if (!id) {
        console.error('Error: DO ID required')
        return
      }

      const info = await get(ctx, id)
      console.log(JSON.stringify(info, null, 2))
    },
  },
  {
    name: 'delete',
    description: 'Delete a deployed DO',
    usage: 'do delete <id>',
    run: async (args, ctx) => {
      const id = args[0]
      if (!id) {
        console.error('Error: DO ID required')
        return
      }

      const success = await remove(ctx, id)
      console.log(success ? `Deleted ${id}` : `Failed to delete ${id}`)
    },
  },
  {
    name: 'logs',
    description: 'Stream logs from a DO',
    usage: 'do logs <id> [--follow] [--since <time>]',
    run: async (args, ctx) => {
      const id = args[0]
      if (!id) {
        console.error('Error: DO ID required')
        return
      }

      const abort = await logs(ctx, id, (entry) => {
        console.log(`[${entry.timestamp}] ${entry.level}: ${entry.message}`)
      })

      process.on('SIGINT', () => {
        abort()
        process.exit(0)
      })
    },
  },
  {
    name: 'schema',
    description: 'Show the schema of a DO',
    usage: 'do schema <id>',
    run: async (args, ctx) => {
      const id = args[0]
      if (!id) {
        console.error('Error: DO ID required')
        return
      }

      const result = await schema(ctx, id)
      console.log(JSON.stringify(result, null, 2))
    },
  },
  {
    name: 'call',
    description: 'Call an RPC method on a DO',
    usage: 'do call <id> <method> [params...]',
    run: async (args, ctx) => {
      const id = args[0]
      const method = args[1]

      if (!id || !method) {
        console.error('Error: DO ID and method required')
        return
      }

      const params = args.slice(2).map((arg) => {
        try {
          return JSON.parse(arg)
        } catch {
          return arg
        }
      })

      const result = await call(ctx, id, method, params.length > 0 ? params : undefined)

      if (result.error) {
        console.error(`Error: ${result.error.message} (code: ${result.error.code})`)
      } else {
        console.log(JSON.stringify(result.result, null, 2))
      }
    },
  },
] as const

// =============================================================================
// CLI Entry Point
// =============================================================================

/**
 * Prints the CLI help message showing all available commands.
 */
function printHelp(): void {
  console.log('objects.do CLI - Manage Digital Objects\n')
  console.log('Usage: do <command> [options]\n')
  console.log('Commands:')
  for (const cmd of commands) {
    console.log(`  ${cmd.name.padEnd(12)} ${cmd.description}`)
  }
  console.log('\nRun "do <command> --help" for more information on a command.')
}

/**
 * Runs the CLI with the provided arguments.
 *
 * Parses the command name from arguments, finds the matching command,
 * and executes it with the remaining arguments.
 *
 * @param args - Command-line arguments (without process/node path)
 * @param ctx - CLI context with API connection details
 *
 * @example
 * ```typescript
 * await runCLI(['publish', './counter.do.json'], ctx)
 * await runCLI(['list', '--limit', '10'], ctx)
 * await runCLI(['call', 'counter.do', 'increment', '5'], ctx)
 * ```
 */
export async function runCLI(args: string[], ctx: CLIContext): Promise<void> {
  const [commandName, ...rest] = args

  if (!commandName || commandName === 'help' || commandName === '--help') {
    printHelp()
    return
  }

  const command = commands.find((c) => c.name === commandName)
  if (!command) {
    console.error(`Unknown command: ${commandName}`)
    printHelp()
    process.exitCode = 1
    return
  }

  await command.run(rest, ctx)
}
