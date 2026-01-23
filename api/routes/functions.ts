/**
 * Functions CRUD Routes
 *
 * REST-style API for Function management.
 * Supports all 4 function tiers: code, generative, agentic, human.
 * Execution is handled separately - this module is for CRUD only.
 *
 * @module api/routes/functions
 */

import { Hono } from 'hono'
import type { Env, DOContext, APIResponse, PaginatedResponse } from '../types'
import type {
  FunctionEntry,
  FunctionTier,
  TieredFunctionDef,
  CodeFunction,
  GenerativeFunction,
  AgenticFunction,
  HumanFunction,
} from '../../types/functions'

// =============================================================================
// Types
// =============================================================================

/**
 * Create function request body
 */
export interface CreateFunctionRequest {
  name: string
  tier: FunctionTier
  definition: TieredFunctionDef
  description?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  timeout?: number
  retries?: number
}

/**
 * Update function request body
 */
export interface UpdateFunctionRequest {
  name?: string
  tier?: FunctionTier
  definition?: TieredFunctionDef
  description?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  timeout?: number
  retries?: number
}

// =============================================================================
// Function Registry
// =============================================================================

/**
 * FunctionRegistry - Storage pattern for Functions in DO storage
 *
 * Uses key-value storage with prefix `function:` for all function entries.
 * Provides CRUD operations with ID generation and timestamp management.
 *
 * @example
 * ```typescript
 * const registry = new FunctionRegistry(storage)
 * const fn = await registry.create({
 *   name: 'processOrder',
 *   tier: 'code',
 *   definition: { type: 'code', code: 'return input * 2' }
 * })
 * ```
 */
export class FunctionRegistry {
  private static readonly PREFIX = 'function:'

  constructor(private storage: DurableObjectStorage) {}

  /**
   * Generate a unique function ID
   */
  private generateId(): string {
    const random = Math.random().toString(36).substring(2, 15)
    return `fn_${random}`
  }

  /**
   * Get storage key for a function ID
   */
  private getKey(id: string): string {
    return `${FunctionRegistry.PREFIX}${id}`
  }

  /**
   * List all functions with pagination
   */
  async list(options: { limit?: number; offset?: number } = {}): Promise<{
    items: FunctionEntry[]
    total: number
    hasMore: boolean
  }> {
    const limit = Math.min(options.limit || 50, 1000)
    const offset = options.offset || 0

    // List all function keys
    const allEntries = await this.storage.list<FunctionEntry>({
      prefix: FunctionRegistry.PREFIX,
    })

    const allItems = Array.from(allEntries.values())
    const total = allItems.length

    // Apply pagination
    const items = allItems.slice(offset, offset + limit)
    const hasMore = offset + limit < total

    return { items, total, hasMore }
  }

  /**
   * Get a function by ID
   */
  async get(id: string): Promise<FunctionEntry | null> {
    const entry = await this.storage.get<FunctionEntry>(this.getKey(id))
    return entry || null
  }

  /**
   * Create a new function
   */
  async create(data: Omit<FunctionEntry, 'id'>): Promise<FunctionEntry> {
    const id = this.generateId()
    const entry: FunctionEntry = {
      id,
      ...data,
    }

    await this.storage.put(this.getKey(id), entry)
    return entry
  }

  /**
   * Update an existing function
   */
  async update(id: string, data: Partial<FunctionEntry>): Promise<FunctionEntry> {
    const existing = await this.get(id)
    if (!existing) {
      throw new Error(`Function not found: ${id}`)
    }

    const updated: FunctionEntry = {
      ...existing,
      ...data,
      id, // Ensure ID cannot be changed
    }

    await this.storage.put(this.getKey(id), updated)
    return updated
  }

  /**
   * Delete a function by ID
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.get(id)
    if (!existing) {
      return false
    }

    await this.storage.delete(this.getKey(id))
    return true
  }

  /**
   * Count total functions
   */
  async count(): Promise<number> {
    const entries = await this.storage.list({ prefix: FunctionRegistry.PREFIX })
    return entries.size
  }

  /**
   * Find functions by tier
   */
  async findByTier(tier: FunctionTier): Promise<FunctionEntry[]> {
    const { items } = await this.list({ limit: 1000 })
    return items.filter((fn) => fn.tier === tier)
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build API response with links
 */
function apiResponse<T>(api: string, data: T, links: Record<string, string>, colo?: string): APIResponse<T> {
  return {
    api,
    data,
    links,
    colo,
    timestamp: Date.now(),
  }
}

/**
 * Get DO stub for the current hostname
 */
function getDOStub(c: { env: Env; req: { url: string } }) {
  const url = new URL(c.req.url)
  const doId = c.env.DO.idFromName(url.hostname)
  return c.env.DO.get(doId)
}

/**
 * Call DO via RPC
 */
async function callDO(stub: DurableObjectStub, method: string, args: unknown[] = []): Promise<unknown> {
  const response = await stub.fetch(
    new Request('https://do/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'rpc', id: `api-${Date.now()}`, method, args }),
    })
  )

  const result = (await response.json()) as { result?: unknown; error?: { message: string } }

  if (result.error) {
    throw new Error(result.error.message)
  }

  return result.result
}

/**
 * Validate function definition matches tier
 */
function validateFunctionDefinition(tier: FunctionTier, definition: TieredFunctionDef): string | null {
  if (definition.type !== tier) {
    return `Definition type '${definition.type}' does not match tier '${tier}'`
  }

  switch (tier) {
    case 'code': {
      const def = definition as CodeFunction
      if (!def.code) {
        return 'Code function requires a code property'
      }
      break
    }
    case 'generative': {
      const def = definition as GenerativeFunction
      if (!def.model || !def.prompt) {
        return 'Generative function requires model and prompt properties'
      }
      break
    }
    case 'agentic': {
      const def = definition as AgenticFunction
      if (!def.agent || !def.goal) {
        return 'Agentic function requires agent and goal properties'
      }
      break
    }
    case 'human': {
      const def = definition as HumanFunction
      if (!def.instructions) {
        return 'Human function requires instructions property'
      }
      break
    }
  }

  return null
}

// =============================================================================
// Functions Routes
// =============================================================================

/**
 * Create Functions CRUD routes
 */
export function createFunctionsRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  // ==========================================================================
  // GET /api/functions - List all functions
  // ==========================================================================

  router.get('/api/functions', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    // Parse query params
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)
    const tier = url.searchParams.get('tier') as FunctionTier | null

    try {
      const stub = getDOStub(c)
      const result = (await callDO(stub, 'do.functions.list', [{ limit, offset, tier }])) as {
        items?: FunctionEntry[]
        total?: number
        cursor?: string
      }

      const items = result.items || (result as unknown as FunctionEntry[])
      const total = result.total || (Array.isArray(items) ? items.length : 0)

      const links: Record<string, string> = {
        self: `${url.origin}/api/functions`,
        api: `${url.origin}/api`,
        create: `${url.origin}/api/functions (POST)`,
      }

      // Add pagination links
      if (offset > 0) {
        links.prev = `${url.origin}/api/functions?limit=${limit}&offset=${Math.max(0, offset - limit)}`
      }
      if (Array.isArray(items) && items.length === limit) {
        links.next = `${url.origin}/api/functions?limit=${limit}&offset=${offset + limit}`
      }

      // Add tier filter links
      links.code = `${url.origin}/api/functions?tier=code`
      links.generative = `${url.origin}/api/functions?tier=generative`
      links.agentic = `${url.origin}/api/functions?tier=agentic`
      links.human = `${url.origin}/api/functions?tier=human`

      return c.json({
        api: url.hostname,
        data: items,
        pagination: {
          total,
          page: Math.floor(offset / limit) + 1,
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
          hasMore: Array.isArray(items) && items.length === limit,
        },
        links,
        colo,
        timestamp: Date.now(),
      } as PaginatedResponse<FunctionEntry>)
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'LIST_ERROR',
            message: error instanceof Error ? error.message : 'Failed to list functions',
          },
          links: { self: `${url.origin}/api/functions`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // GET /api/functions/:id - Get a function by ID
  // ==========================================================================

  router.get('/api/functions/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.functions.get', [id])

      if (!result) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `Function not found: ${id}`,
            },
            links: { functions: `${url.origin}/api/functions`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          404
        )
      }

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/functions/${id}`,
            functions: `${url.origin}/api/functions`,
            update: `${url.origin}/api/functions/${id} (PUT)`,
            delete: `${url.origin}/api/functions/${id} (DELETE)`,
            invoke: `${url.origin}/api/functions/${id}/invoke (POST)`,
          },
          colo
        )
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'GET_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get function',
          },
          links: { functions: `${url.origin}/api/functions`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // POST /api/functions - Create a new function
  // ==========================================================================

  router.post('/api/functions', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const body = (await c.req.json()) as CreateFunctionRequest

      // Validate required fields
      if (!body.name) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'name is required',
            },
            links: { functions: `${url.origin}/api/functions`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          400
        )
      }

      if (!body.tier) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'tier is required (code, generative, agentic, or human)',
            },
            links: { functions: `${url.origin}/api/functions`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          400
        )
      }

      if (!body.definition) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'definition is required',
            },
            links: { functions: `${url.origin}/api/functions`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          400
        )
      }

      // Validate definition matches tier
      const validationError = validateFunctionDefinition(body.tier, body.definition)
      if (validationError) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'VALIDATION_ERROR',
              message: validationError,
            },
            links: { functions: `${url.origin}/api/functions`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          400
        )
      }

      const stub = getDOStub(c)
      const result = (await callDO(stub, 'do.functions.create', [body])) as FunctionEntry

      const id = result.id

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/functions/${id}`,
            functions: `${url.origin}/api/functions`,
            update: `${url.origin}/api/functions/${id} (PUT)`,
            delete: `${url.origin}/api/functions/${id} (DELETE)`,
            invoke: `${url.origin}/api/functions/${id}/invoke (POST)`,
          },
          colo
        ),
        201
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'CREATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to create function',
          },
          links: { functions: `${url.origin}/api/functions`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // PUT /api/functions/:id - Update a function
  // ==========================================================================

  router.put('/api/functions/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = (await c.req.json()) as UpdateFunctionRequest

      // Validate definition matches tier if both are provided
      if (body.tier && body.definition) {
        const validationError = validateFunctionDefinition(body.tier, body.definition)
        if (validationError) {
          return c.json(
            {
              api: url.hostname,
              error: {
                code: 'VALIDATION_ERROR',
                message: validationError,
              },
              links: { self: `${url.origin}/api/functions/${id}`, functions: `${url.origin}/api/functions` },
              timestamp: Date.now(),
            },
            400
          )
        }
      }

      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.functions.update', [id, body])

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/functions/${id}`,
            functions: `${url.origin}/api/functions`,
            delete: `${url.origin}/api/functions/${id} (DELETE)`,
            invoke: `${url.origin}/api/functions/${id}/invoke (POST)`,
          },
          colo
        )
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update function'

      // Check if it's a not found error
      if (message.includes('not found')) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `Function not found: ${id}`,
            },
            links: { functions: `${url.origin}/api/functions`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          404
        )
      }

      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'UPDATE_ERROR',
            message,
          },
          links: { self: `${url.origin}/api/functions/${id}`, functions: `${url.origin}/api/functions` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // PATCH /api/functions/:id - Partial update a function
  // ==========================================================================

  router.patch('/api/functions/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = (await c.req.json()) as UpdateFunctionRequest

      // Validate definition matches tier if both are provided
      if (body.tier && body.definition) {
        const validationError = validateFunctionDefinition(body.tier, body.definition)
        if (validationError) {
          return c.json(
            {
              api: url.hostname,
              error: {
                code: 'VALIDATION_ERROR',
                message: validationError,
              },
              links: { self: `${url.origin}/api/functions/${id}`, functions: `${url.origin}/api/functions` },
              timestamp: Date.now(),
            },
            400
          )
        }
      }

      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.functions.update', [id, body])

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/functions/${id}`,
            functions: `${url.origin}/api/functions`,
          },
          colo
        )
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update function'

      if (message.includes('not found')) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `Function not found: ${id}`,
            },
            links: { functions: `${url.origin}/api/functions`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          404
        )
      }

      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'UPDATE_ERROR',
            message,
          },
          links: { self: `${url.origin}/api/functions/${id}`, functions: `${url.origin}/api/functions` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // DELETE /api/functions/:id - Delete a function
  // ==========================================================================

  router.delete('/api/functions/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      await callDO(stub, 'do.functions.delete', [id])

      return c.json(
        apiResponse(
          url.hostname,
          { deleted: true, id },
          {
            functions: `${url.origin}/api/functions`,
            api: `${url.origin}/api`,
          },
          colo
        )
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete function'

      if (message.includes('not found')) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `Function not found: ${id}`,
            },
            links: { functions: `${url.origin}/api/functions`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          404
        )
      }

      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'DELETE_ERROR',
            message,
          },
          links: { self: `${url.origin}/api/functions/${id}`, functions: `${url.origin}/api/functions` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  return router
}

// =============================================================================
// Export
// =============================================================================

export default createFunctionsRoutes
