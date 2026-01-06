/**
 * @dotdo/do/mcp - MCP Layer
 *
 * Model Context Protocol support with OAuth 2.1.
 * Provides tools for AI integration (search, fetch, do).
 */

import { z } from 'zod'

/**
 * MCP tool definition
 */
export interface McpTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description?: string }>
    required?: string[]
  }
}

/**
 * Custom validation error for MCP
 */
export class McpValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public expected?: string,
    public received?: string,
    public maxLength?: number,
    public maxValue?: number
  ) {
    super(message)
    this.name = 'McpValidationError'
  }
}

/**
 * Zod schema for search tool input (base schema without strict mode)
 */
const searchInputSchemaBase = z.object({
  query: z
    .string()
    .trim()
    .min(1, 'Query cannot be empty')
    .max(10000, 'Query exceeds maximum length of 10000 characters')
    .refine((s) => !s.includes('\x00'), 'Query contains null bytes'),
  collection: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_-]+$/, 'Collection name can only contain alphanumeric characters, hyphens, and underscores')
    .optional(),
  limit: z
    .number()
    .int()
    .positive('Limit must be positive')
    .max(10000, 'Limit cannot exceed 10000')
    .refine((n) => !isNaN(n) && isFinite(n), 'Limit must be a valid number')
    .optional(),
})

/**
 * Exported search input schema with strict mode
 */
export const searchInputSchema = searchInputSchemaBase.strict()

/**
 * Zod schema for fetch tool input (base schema without strict mode)
 */
const fetchInputSchemaBase = z.object({
  target: z
    .string()
    .trim()
    .min(1, 'Target cannot be empty')
    .refine((s) => !s.includes('\x00'), 'Target contains null bytes')
    .refine((s) => {
      // Check if it's a URL
      if (s.includes('://')) {
        try {
          const url = new URL(s)
          // Only allow http and https protocols
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return false
          }
          return true
        } catch {
          return false
        }
      }
      // Otherwise, treat as document ID - basic validation
      return true
    }, 'Target must be a valid document ID or http/https URL'),
})

/**
 * Exported fetch input schema with strict mode
 */
export const fetchInputSchema = fetchInputSchemaBase.strict()

/**
 * Zod schema for do tool input (base schema without strict mode)
 */
const doInputSchemaBase = z.object({
  code: z
    .string()
    .min(1, 'Code cannot be empty')
    .max(1000000, 'Code exceeds maximum length of 1MB')
    .refine((s) => !s.includes('\x00'), 'Code contains null bytes'),
  timeout: z
    .number()
    .int()
    .nonnegative('Timeout cannot be negative')
    .max(3600000, 'Timeout cannot exceed 1 hour (3600000ms)')
    .refine((n) => !isNaN(n) && isFinite(n), 'Timeout must be a valid number')
    .optional(),
})

/**
 * Exported do input schema with strict mode
 */
export const doInputSchema = doInputSchemaBase.strict()

/**
 * Type inference from Zod schemas
 */
export type SearchInput = z.infer<typeof searchInputSchema>
export type FetchInput = z.infer<typeof fetchInputSchema>
export type DoInput = z.infer<typeof doInputSchema>

/**
 * MCP tools manifest
 */
export const MCP_TOOLS: McpTool[] = [
  {
    name: 'search',
    description: 'Search across all collections in the database',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        collection: { type: 'string', description: 'Optional: limit to specific collection' },
        limit: { type: 'number', description: 'Maximum number of results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch',
    description: 'Fetch a document by ID or a URL',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Document ID (collection/id) or URL' },
      },
      required: ['target'],
    },
  },
  {
    name: 'do',
    description: 'Execute code in a secure sandbox with access to the database',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute' },
        timeout: { type: 'number', description: 'Execution timeout in ms' },
      },
      required: ['code'],
    },
  },
]

/**
 * Handler options
 */
export interface McpHandlerOptions {
  strictValidation?: boolean
  allErrors?: boolean
}

/**
 * Validate tool input
 */
export function validateToolInput(toolName: string, input: unknown, _options?: McpHandlerOptions): unknown {
  const schema = toolName === 'search' ? searchInputSchema : toolName === 'fetch' ? fetchInputSchema : doInputSchema

  return schema.parse(input)
}

/**
 * MCP protocol handler
 */
export class McpHandler {
  private target: { search: Function; fetch: Function; do: Function }
  private options: McpHandlerOptions

  constructor(target: { search: Function; fetch: Function; do: Function }, options: McpHandlerOptions = {}) {
    this.target = target
    this.options = options
  }

  /**
   * Handle MCP request
   */
  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname.replace('/mcp', '').replace('/', '') || 'manifest'

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
    return Response.json({
      name: 'DO',
      version: '1.0.0',
      description: 'An agentic database that can DO anything',
      tools: MCP_TOOLS,
    })
  }

  /**
   * Return tools list
   */
  private handleToolsList(): Response {
    return Response.json({ tools: MCP_TOOLS })
  }

  /**
   * Create MCP-compliant error response
   */
  private createErrorResponse(error: unknown, _toolName: string, requestId?: string): Response {
    if (error instanceof z.ZodError) {
      // Check if there are any issues
      if (!error.issues || error.issues.length === 0) {
        const errorMessage = 'Validation error'
        return Response.json(
          {
            error: errorMessage,
            code: 'VALIDATION_ERROR',
            ...(requestId && { requestId }),
          },
          { status: 400 }
        )
      }

      // Handle all errors mode
      if (this.options.allErrors && error.issues.length > 1) {
        const errors = error.issues.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }))
        return Response.json(
          {
            errors,
            ...(requestId && { requestId }),
          },
          { status: 400 }
        )
      }

      // Single error mode
      const firstError = error.issues[0]
      const field = firstError.path.length > 0 ? (firstError.path[0] as string) : 'unknown'
      const message = firstError.message

      // Determine expected and received types
      let expected: string | undefined
      let received: string | undefined

      if (firstError.code === 'invalid_type') {
        expected = (firstError as any).expected
        received = (firstError as any).received
      }

      // Create error message string
      const errorMessage = `Validation error for field '${field}': ${message}`

      return Response.json(
        {
          error: errorMessage, // Flat string format for convenience
          code: 'VALIDATION_ERROR',
          field,
          ...(expected !== undefined && { expected }),
          ...(received !== undefined && { received }),
          ...(requestId && { requestId }),
        },
        { status: 400 }
      )
    }

    // Generic error response
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }

  /**
   * Parse and validate JSON body
   */
  private async parseAndValidateBody(request: Request, toolName: string): Promise<unknown> {
    // Check content type
    const contentType = request.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Content-Type must be application/json')
    }

    // Get request body text
    const bodyText = await request.text()

    // Check for empty body
    if (!bodyText || bodyText.trim() === '') {
      throw new Error('Request body is empty')
    }

    // Parse JSON
    let body: unknown
    try {
      body = JSON.parse(bodyText)
    } catch (error) {
      const parseError = new Error('Invalid JSON body')
      ;(parseError as any).code = 'PARSE_ERROR'
      throw parseError
    }

    // Validate that body is an object
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      const validationError = new Error('Request body must be a JSON object')
      ;(validationError as any).code = 'VALIDATION_ERROR'
      throw validationError
    }

    // Validate with Zod schema
    let schema: z.ZodSchema
    switch (toolName) {
      case 'search':
        schema = this.options.strictValidation ? searchInputSchemaBase.strict() : searchInputSchemaBase.passthrough()
        break
      case 'fetch':
        schema = this.options.strictValidation ? fetchInputSchemaBase.strict() : fetchInputSchemaBase.passthrough()
        break
      case 'do':
        schema = this.options.strictValidation ? doInputSchemaBase.strict() : doInputSchemaBase.passthrough()
        break
      default:
        throw new Error(`Unknown tool: ${toolName}`)
    }

    return schema.parse(body)
  }

  /**
   * Handle tool call
   */
  private async handleToolCall(toolName: string, request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const tool = MCP_TOOLS.find((t) => t.name === toolName)
    if (!tool) {
      return new Response(`Tool not found: ${toolName}`, { status: 404 })
    }

    const requestId = request.headers.get('X-Request-ID') || undefined

    try {
      const validatedInput = await this.parseAndValidateBody(request, toolName)

      switch (toolName) {
        case 'search': {
          const input = validatedInput as SearchInput
          const searchResult = await this.target.search(input.query, {
            collection: input.collection,
            limit: input.limit,
          })
          return Response.json({ result: searchResult })
        }

        case 'fetch': {
          const input = validatedInput as FetchInput
          // Decode URL encoding
          const target = decodeURIComponent(input.target)
          const fetchResult = await this.target.fetch(target)
          return Response.json({ result: fetchResult })
        }

        case 'do': {
          const input = validatedInput as DoInput
          // Set default timeout if not provided
          const timeout = input.timeout ?? 30000
          const doResult = await this.target.do(input.code, {
            timeout,
          })
          return Response.json({ result: doResult })
        }

        default:
          return new Response('Not implemented', { status: 501 })
      }
    } catch (error) {
      // Handle content-type errors
      if (error instanceof Error && error.message.includes('Content-Type')) {
        return Response.json(
          {
            error: error.message,
          },
          { status: 415 }
        )
      }

      // Handle parse errors
      if (error instanceof Error && (error as any).code === 'PARSE_ERROR') {
        return Response.json(
          {
            error: error.message,
            code: 'PARSE_ERROR',
            ...(requestId && { requestId }),
          },
          { status: 400 }
        )
      }

      // Handle validation errors
      if (error instanceof Error && (error as any).code === 'VALIDATION_ERROR') {
        return Response.json(
          {
            error: error.message,
            code: 'VALIDATION_ERROR',
            ...(requestId && { requestId }),
          },
          { status: 400 }
        )
      }

      // Handle Zod validation errors
      return this.createErrorResponse(error, toolName, requestId)
    }
  }
}
