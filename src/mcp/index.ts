/**
 * @dotdo/do/mcp - MCP Layer
 *
 * Model Context Protocol support with OAuth 2.1.
 * Provides tools for AI integration (search, fetch, do).
 *
 * Features:
 * - MCP server builder utilities
 * - Standard tool definitions (searchTool, fetchTool, doTool)
 * - Type-safe tool handlers
 * - Easy integration with DO instances
 */

import type {
  SearchOptions,
  SearchResult,
  FetchOptions,
  FetchResult,
  DoOptions,
  DoResult,
} from '../types'

// ============================================================================
// MCP Tool Type Definitions
// ============================================================================

/**
 * JSON Schema property definition
 */
export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'
  description?: string
  default?: unknown
  enum?: unknown[]
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
}

/**
 * MCP tool input schema (JSON Schema subset)
 */
export interface McpInputSchema {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  required?: string[]
}

/**
 * MCP tool definition (base interface without handler)
 */
export interface McpToolBase {
  name: string
  description: string
  inputSchema: McpInputSchema
}

/**
 * MCP tool definition with typed handler
 */
export interface McpTool<TInput = unknown, TOutput = unknown> extends McpToolBase {
  /** Handler function for this tool */
  handler?: (input: TInput) => Promise<TOutput>
}

/**
 * MCP tool call request
 */
export interface McpToolCall {
  name: string
  arguments: Record<string, unknown>
}

/**
 * MCP tool call result
 */
export interface McpToolResult<T = unknown> {
  content: Array<{
    type: 'text' | 'image' | 'resource'
    text?: string
    data?: string
    mimeType?: string
  }>
  isError?: boolean
  result?: T
}

/**
 * MCP manifest
 */
export interface McpManifest {
  name: string
  version: string
  description: string
  tools: McpToolBase[]
  resources?: McpResource[]
  prompts?: McpPrompt[]
}

/**
 * MCP resource definition
 */
export interface McpResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

/**
 * MCP prompt definition
 */
export interface McpPrompt {
  name: string
  description?: string
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
}

// ============================================================================
// Typed Function Signatures for DO Integration
// ============================================================================

/**
 * Search function signature
 */
export type SearchFn = (query: string, options?: SearchOptions) => Promise<SearchResult[]>

/**
 * Fetch function signature (URL fetch, not Request handler)
 */
export type FetchFn = (target: string, options?: FetchOptions) => Promise<FetchResult>

/**
 * Do (execute code) function signature
 */
export type DoFn = (code: string, options?: DoOptions) => Promise<DoResult>

/**
 * MCP handler target interface with typed methods
 */
export interface McpTarget {
  search: SearchFn
  fetch: FetchFn | ((requestOrTarget: Request | string, options?: FetchOptions) => Promise<Response | FetchResult>)
  do: DoFn
}

// ============================================================================
// Standard Tool Definitions
// ============================================================================

/**
 * Search tool input type
 */
export interface SearchToolInput {
  query: string
  collection?: string
  collections?: string[]
  limit?: number
  fuzzy?: boolean
}

/**
 * Search tool definition
 */
export const searchTool: McpTool<SearchToolInput, SearchResult[]> = {
  name: 'search',
  description: 'Search across all collections in the database. Returns matching documents with relevance scores.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query string' },
      collection: { type: 'string', description: 'Limit search to a specific collection' },
      collections: {
        type: 'array',
        description: 'Limit search to multiple specific collections',
        items: { type: 'string' }
      },
      limit: { type: 'number', description: 'Maximum number of results (default: 100)', default: 100 },
      fuzzy: { type: 'boolean', description: 'Enable fuzzy matching', default: false },
    },
    required: ['query'],
  },
}

/**
 * Fetch tool input type
 */
export interface FetchToolInput {
  target: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  body?: unknown
  timeout?: number
}

/**
 * Fetch tool definition
 */
export const fetchTool: McpTool<FetchToolInput, FetchResult> = {
  name: 'fetch',
  description: 'Fetch a resource by URL. Supports HTTP methods and custom headers.',
  inputSchema: {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'URL to fetch' },
      method: {
        type: 'string',
        description: 'HTTP method (GET, POST, PUT, DELETE)',
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        default: 'GET'
      },
      headers: {
        type: 'object',
        description: 'Request headers',
        properties: {}
      },
      body: { type: 'object', description: 'Request body (for POST/PUT)' },
      timeout: { type: 'number', description: 'Request timeout in milliseconds', default: 30000 },
    },
    required: ['target'],
  },
}

/**
 * Do tool input type
 */
export interface DoToolInput {
  code: string
  timeout?: number
  memory?: number
  env?: Record<string, unknown>
}

/**
 * Do (execute code) tool definition
 */
export const doTool: McpTool<DoToolInput, DoResult> = {
  name: 'do',
  description: 'Execute JavaScript code in a secure sandbox with restricted scope. Safe globals only (Math, Date, JSON, etc.). Dangerous operations are blocked.',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript code to execute' },
      timeout: { type: 'number', description: 'Execution timeout in milliseconds' },
      memory: { type: 'number', description: 'Memory limit in bytes' },
      env: { type: 'object', description: 'Environment variables accessible in sandbox' },
    },
    required: ['code'],
  },
}

/**
 * Standard MCP tools array (without handlers, for manifest/listing)
 */
export const MCP_TOOLS: McpToolBase[] = [searchTool, fetchTool, doTool]

// ============================================================================
// MCP Server Builder Utilities
// ============================================================================

/**
 * Options for MCP server builder
 */
export interface McpServerOptions {
  name: string
  version: string
  description?: string
  tools?: McpToolBase[]
  resources?: McpResource[]
  prompts?: McpPrompt[]
}

/**
 * MCP server configuration
 */
export interface McpServerConfig {
  manifest: McpManifest
  target: McpTarget
  basePath?: string
}

/**
 * Create an MCP server configuration
 */
export function createMcpServer(options: McpServerOptions, target: McpTarget): McpServerConfig {
  const manifest: McpManifest = {
    name: options.name,
    version: options.version,
    description: options.description ?? `${options.name} MCP Server`,
    tools: options.tools ?? MCP_TOOLS,
    resources: options.resources,
    prompts: options.prompts,
  }

  return {
    manifest,
    target,
    basePath: '/mcp',
  }
}

/**
 * Typed tool with handler - return type for createDoTools
 */
export interface TypedDoTool<TInput, TOutput> extends McpToolBase {
  handler: (input: TInput) => Promise<TOutput>
}

/**
 * Create standard DO tools bound to a target
 * Returns tools with typed handlers for search, fetch, and do operations
 */
export function createDoTools(target: McpTarget): [
  TypedDoTool<SearchToolInput, SearchResult[]>,
  TypedDoTool<FetchToolInput, FetchResult>,
  TypedDoTool<DoToolInput, DoResult>
] {
  return [
    {
      ...searchTool,
      handler: async (input: SearchToolInput): Promise<SearchResult[]> => {
        return target.search(input.query, {
          collections: input.collection ? [input.collection] : input.collections,
          limit: input.limit,
          fuzzy: input.fuzzy,
        })
      },
    },
    {
      ...fetchTool,
      handler: async (input: FetchToolInput): Promise<FetchResult> => {
        const result = await target.fetch(input.target, {
          method: input.method,
          headers: input.headers,
          body: input.body,
          timeout: input.timeout,
        })
        // Handle case where fetch returns Response (from DO's dual-purpose fetch)
        if (result instanceof Response) {
          const headers: Record<string, string> = {}
          result.headers.forEach((v, k) => { headers[k] = v })
          return {
            status: result.status,
            headers,
            body: await result.text(),
            url: input.target,
          }
        }
        return result
      },
    },
    {
      ...doTool,
      handler: async (input: DoToolInput): Promise<DoResult> => {
        return target.do(input.code, {
          timeout: input.timeout,
          memory: input.memory,
          env: input.env,
        })
      },
    },
  ]
}

// ============================================================================
// MCP Protocol Handler
// ============================================================================

/**
 * MCP protocol handler class
 * Handles MCP HTTP requests and routes them to the appropriate tool handlers
 */
export class McpHandler {
  private target: McpTarget
  private manifest: McpManifest
  private basePath: string

  constructor(target: McpTarget, options?: Partial<McpServerOptions>) {
    this.target = target
    this.basePath = '/mcp'
    this.manifest = {
      name: options?.name ?? 'DO',
      version: options?.version ?? '1.0.0',
      description: options?.description ?? 'An agentic database that can DO anything',
      tools: options?.tools ?? MCP_TOOLS,
      resources: options?.resources,
      prompts: options?.prompts,
    }
  }

  /**
   * Get the manifest
   */
  getManifest(): McpManifest {
    return this.manifest
  }

  /**
   * Get all tools
   */
  getTools(): McpToolBase[] {
    return this.manifest.tools
  }

  /**
   * Handle MCP request
   */
  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname.replace(this.basePath, '').replace(/^\//, '') || 'manifest'

    switch (path) {
      case 'manifest':
      case '':
        return this.handleManifest()

      case 'tools':
        return this.handleToolsList()

      default:
        if (path.startsWith('tools/')) {
          const toolName = path.replace('tools/', '')
          return this.handleToolCall(toolName, request)
        }
        return new Response('Not found', { status: 404 })
    }
  }

  /**
   * Return MCP manifest
   */
  private handleManifest(): Response {
    return Response.json(this.manifest)
  }

  /**
   * Return tools list
   */
  private handleToolsList(): Response {
    return Response.json({ tools: this.manifest.tools })
  }

  /**
   * Handle tool call
   */
  private async handleToolCall(toolName: string, request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const tool = this.manifest.tools.find((t) => t.name === toolName)
    if (!tool) {
      return new Response(`Tool not found: ${toolName}`, { status: 404 })
    }

    try {
      const body = (await request.json()) as Record<string, unknown>

      // Validate input against tool schema
      const validation = validateToolInput(tool, body)
      if (!validation.valid) {
        return Response.json(
          { error: validation.errors.join('; ') },
          { status: 400 }
        )
      }

      const result = await this.executeTool(toolName, body)
      return Response.json({ result })
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      )
    }
  }

  /**
   * Execute a tool by name
   * Passes through inputs to target methods, allowing flexibility in options.
   */
  async executeTool(toolName: string, input: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'search': {
        const query = input.query as string
        // Extract options, preserving original structure for backward compatibility
        const { query: _q, ...options } = input
        const hasOptions = Object.keys(options).length > 0

        return this.target.search(query, hasOptions ? options as SearchOptions : undefined)
      }

      case 'fetch': {
        const target = input.target as string
        // Extract options, preserving original structure
        const { target: _t, ...options } = input
        const hasOptions = Object.keys(options).length > 0

        const result = await this.target.fetch(target, hasOptions ? options as FetchOptions : undefined)
        // Handle case where fetch returns Response (from DO's dual-purpose fetch)
        if (result instanceof Response) {
          const respHeaders: Record<string, string> = {}
          result.headers.forEach((v, k) => { respHeaders[k] = v })
          return {
            status: result.status,
            headers: respHeaders,
            body: await result.text(),
            url: target,
          }
        }
        return result
      }

      case 'do': {
        const code = input.code as string
        // Extract options, preserving original structure
        // Note: do tool always passes an options object (empty {} if no options)
        const { code: _c, ...options } = input

        return this.target.do(code, options as DoOptions)
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`)
    }
  }

  /**
   * Format a tool result for MCP protocol
   */
  formatToolResult<T>(result: T, isError = false): McpToolResult<T> {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
      isError,
      result,
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a tool handler from a function
 */
export function createToolHandler<TInput, TOutput>(
  tool: McpTool<TInput, TOutput>,
  handler: (input: TInput) => Promise<TOutput>
): McpTool<TInput, TOutput> {
  return {
    ...tool,
    handler,
  }
}

/**
 * Validate tool input against schema (basic validation)
 */
export function validateToolInput(
  tool: McpTool,
  input: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const { properties, required = [] } = tool.inputSchema

  // Check required fields
  for (const field of required) {
    if (!(field in input) || input[field] === undefined || input[field] === null) {
      errors.push(`Missing required field: ${field}`)
    }
  }

  // Check types (basic validation)
  for (const [key, value] of Object.entries(input)) {
    const prop = properties[key]
    if (prop) {
      const actualType = Array.isArray(value) ? 'array' : typeof value
      if (prop.type !== actualType && value !== null && value !== undefined) {
        // Allow number/string coercion for convenience
        if (!(prop.type === 'number' && typeof value === 'string' && !isNaN(Number(value)))) {
          errors.push(`Invalid type for ${key}: expected ${prop.type}, got ${actualType}`)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Parse and coerce tool input based on schema
 */
export function parseToolInput<T extends Record<string, unknown>>(
  tool: McpTool,
  input: Record<string, unknown>
): T {
  const result: Record<string, unknown> = {}
  const { properties } = tool.inputSchema

  for (const [key, prop] of Object.entries(properties)) {
    if (key in input) {
      const value = input[key]
      // Coerce types
      if (prop.type === 'number' && typeof value === 'string') {
        result[key] = Number(value)
      } else if (prop.type === 'boolean' && typeof value === 'string') {
        result[key] = value === 'true'
      } else {
        result[key] = value
      }
    } else if ('default' in prop) {
      result[key] = prop.default
    }
  }

  return result as T
}
