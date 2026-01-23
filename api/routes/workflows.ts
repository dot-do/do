/**
 * Workflow CRUD Routes
 *
 * REST-style API for Workflow collection operations.
 * Provides CRUD operations for workflow definitions (execution handled separately).
 *
 * Routes:
 * - GET /api/workflows - List all workflows with pagination
 * - GET /api/workflows/:id - Get a workflow by ID
 * - POST /api/workflows - Create a new workflow
 * - PUT /api/workflows/:id - Update a workflow
 * - DELETE /api/workflows/:id - Delete a workflow
 */

import { Hono } from 'hono'
import type { Env, DOContext, APIResponse, PaginatedResponse } from '../types'
import type { Workflow, WorkflowExecutionState, WorkflowDefinition, StateMachineDefinition, ListOptions, ListResult } from '../../types/collections'

// =============================================================================
// Constants
// =============================================================================

const COLLECTION = 'workflows'
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

// =============================================================================
// Types
// =============================================================================

/**
 * Workflow create input (without auto-generated fields)
 */
export interface WorkflowCreateInput {
  name: string
  type: 'code' | 'state-machine'
  definition: WorkflowDefinition | StateMachineDefinition
  context?: Record<string, unknown>
}

/**
 * Workflow update input (partial update allowed)
 */
export interface WorkflowUpdateInput {
  name?: string
  definition?: WorkflowDefinition | StateMachineDefinition
  context?: Record<string, unknown>
  executionState?: WorkflowExecutionState
  currentState?: string
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
      body: JSON.stringify({ type: 'rpc', id: `workflow-${Date.now()}`, method, args }),
    })
  )

  const result = (await response.json()) as { result?: unknown; error?: { message: string } }

  if (result.error) {
    throw new Error(result.error.message)
  }

  return result.result
}

/**
 * Validate workflow create input
 */
function validateCreateInput(input: unknown): { valid: true; data: WorkflowCreateInput } | { valid: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Request body must be an object' }
  }

  const data = input as Record<string, unknown>

  if (!data.name || typeof data.name !== 'string') {
    return { valid: false, error: 'name is required and must be a string' }
  }

  if (!data.type || (data.type !== 'code' && data.type !== 'state-machine')) {
    return { valid: false, error: "type is required and must be 'code' or 'state-machine'" }
  }

  if (!data.definition || typeof data.definition !== 'object') {
    return { valid: false, error: 'definition is required and must be an object' }
  }

  const definition = data.definition as Record<string, unknown>

  // Validate code workflow definition
  if (data.type === 'code') {
    if (definition.type !== 'code') {
      return { valid: false, error: "definition.type must be 'code' for code workflows" }
    }
    if (!Array.isArray(definition.steps)) {
      return { valid: false, error: 'definition.steps must be an array for code workflows' }
    }
  }

  // Validate state-machine workflow definition
  if (data.type === 'state-machine') {
    if (definition.type !== 'state-machine') {
      return { valid: false, error: "definition.type must be 'state-machine' for state machine workflows" }
    }
    if (!definition.id || typeof definition.id !== 'string') {
      return { valid: false, error: 'definition.id is required for state machine workflows' }
    }
    if (!definition.initial || typeof definition.initial !== 'string') {
      return { valid: false, error: 'definition.initial is required for state machine workflows' }
    }
    if (!definition.states || typeof definition.states !== 'object') {
      return { valid: false, error: 'definition.states is required for state machine workflows' }
    }
  }

  return {
    valid: true,
    data: {
      name: data.name as string,
      type: data.type as 'code' | 'state-machine',
      definition: data.definition as WorkflowDefinition | StateMachineDefinition,
      context: data.context as Record<string, unknown> | undefined,
    },
  }
}

/**
 * Validate workflow update input
 */
function validateUpdateInput(input: unknown): { valid: true; data: WorkflowUpdateInput } | { valid: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Request body must be an object' }
  }

  const data = input as Record<string, unknown>
  const update: WorkflowUpdateInput = {}

  if (data.name !== undefined) {
    if (typeof data.name !== 'string') {
      return { valid: false, error: 'name must be a string' }
    }
    update.name = data.name
  }

  if (data.definition !== undefined) {
    if (typeof data.definition !== 'object') {
      return { valid: false, error: 'definition must be an object' }
    }
    update.definition = data.definition as WorkflowDefinition | StateMachineDefinition
  }

  if (data.context !== undefined) {
    if (typeof data.context !== 'object') {
      return { valid: false, error: 'context must be an object' }
    }
    update.context = data.context as Record<string, unknown>
  }

  if (data.executionState !== undefined) {
    const validStates: WorkflowExecutionState[] = ['Idle', 'Running', 'Paused', 'Waiting', 'Completed', 'Failed']
    if (!validStates.includes(data.executionState as WorkflowExecutionState)) {
      return { valid: false, error: `executionState must be one of: ${validStates.join(', ')}` }
    }
    update.executionState = data.executionState as WorkflowExecutionState
  }

  if (data.currentState !== undefined) {
    if (typeof data.currentState !== 'string') {
      return { valid: false, error: 'currentState must be a string' }
    }
    update.currentState = data.currentState
  }

  return { valid: true, data: update }
}

// =============================================================================
// Workflow Routes
// =============================================================================

/**
 * Create Workflow CRUD routes
 */
export function createWorkflowRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  // ==========================================================================
  // GET /api/workflows - List all workflows
  // ==========================================================================

  router.get('/api/workflows', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    // Parse query params
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')
    const orderBy = url.searchParams.get('orderBy') || 'createdAt'
    const orderDir = (url.searchParams.get('orderDir') as 'asc' | 'desc') || 'desc'

    let limit = limitParam ? parseInt(limitParam, 10) : DEFAULT_LIMIT
    if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT
    if (limit > MAX_LIMIT) limit = MAX_LIMIT

    let offset = offsetParam ? parseInt(offsetParam, 10) : 0
    if (isNaN(offset) || offset < 0) offset = 0

    const listOptions: ListOptions = { limit, offset, orderBy, orderDir }

    try {
      const stub = getDOStub(c)
      const result = (await callDO(stub, `do.${COLLECTION}.list`, [listOptions])) as ListResult<Workflow>

      const items = result.items || []
      const total = result.total ?? items.length
      const hasMore = result.hasMore ?? items.length === limit

      const links: Record<string, string> = {
        self: `${url.origin}/api/${COLLECTION}`,
        api: `${url.origin}/api`,
        create: `${url.origin}/api/${COLLECTION} (POST)`,
      }

      // Add pagination links
      if (offset > 0) {
        links.prev = `${url.origin}/api/${COLLECTION}?limit=${limit}&offset=${Math.max(0, offset - limit)}`
        links.first = `${url.origin}/api/${COLLECTION}?limit=${limit}&offset=0`
      }
      if (hasMore) {
        links.next = `${url.origin}/api/${COLLECTION}?limit=${limit}&offset=${offset + limit}`
      }

      const response: PaginatedResponse<Workflow> = {
        api: url.hostname,
        data: items,
        pagination: {
          total,
          page: Math.floor(offset / limit) + 1,
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
          hasMore,
        },
        links,
        colo,
        timestamp: Date.now(),
      }

      return c.json(response)
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'LIST_ERROR',
            message: error instanceof Error ? error.message : 'Failed to list workflows',
          },
          links: { self: `${url.origin}/api/${COLLECTION}`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // GET /api/workflows/:id - Get a workflow by ID
  // ==========================================================================

  router.get('/api/workflows/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      const result = (await callDO(stub, `do.${COLLECTION}.get`, [id])) as Workflow | null

      if (!result) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `Workflow not found: ${id}`,
            },
            links: {
              collection: `${url.origin}/api/${COLLECTION}`,
              api: `${url.origin}/api`,
            },
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
            self: `${url.origin}/api/${COLLECTION}/${id}`,
            collection: `${url.origin}/api/${COLLECTION}`,
            update: `${url.origin}/api/${COLLECTION}/${id} (PUT)`,
            delete: `${url.origin}/api/${COLLECTION}/${id} (DELETE)`,
            start: `${url.origin}/api/${COLLECTION}/${id}/start (POST)`,
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
            message: error instanceof Error ? error.message : 'Failed to get workflow',
          },
          links: {
            collection: `${url.origin}/api/${COLLECTION}`,
            api: `${url.origin}/api`,
          },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // POST /api/workflows - Create a new workflow
  // ==========================================================================

  router.post('/api/workflows', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const body = await c.req.json()

      // Validate input
      const validation = validateCreateInput(body)
      if (!validation.valid) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'VALIDATION_ERROR',
              message: validation.error,
            },
            links: {
              collection: `${url.origin}/api/${COLLECTION}`,
              api: `${url.origin}/api`,
            },
            timestamp: Date.now(),
          },
          400
        )
      }

      const stub = getDOStub(c)

      // Build the full workflow object with defaults
      const workflowData = {
        ...validation.data,
        executionState: 'Idle' as WorkflowExecutionState,
        context: validation.data.context || {},
        createdAt: Date.now(),
      }

      const result = (await callDO(stub, `do.${COLLECTION}.create`, [workflowData])) as Workflow

      const id = result.id

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/${COLLECTION}/${id}`,
            collection: `${url.origin}/api/${COLLECTION}`,
            update: `${url.origin}/api/${COLLECTION}/${id} (PUT)`,
            delete: `${url.origin}/api/${COLLECTION}/${id} (DELETE)`,
            start: `${url.origin}/api/${COLLECTION}/${id}/start (POST)`,
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
            message: error instanceof Error ? error.message : 'Failed to create workflow',
          },
          links: {
            collection: `${url.origin}/api/${COLLECTION}`,
            api: `${url.origin}/api`,
          },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // PUT /api/workflows/:id - Update a workflow
  // ==========================================================================

  router.put('/api/workflows/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json()

      // Validate input
      const validation = validateUpdateInput(body)
      if (!validation.valid) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'VALIDATION_ERROR',
              message: validation.error,
            },
            links: {
              self: `${url.origin}/api/${COLLECTION}/${id}`,
              collection: `${url.origin}/api/${COLLECTION}`,
            },
            timestamp: Date.now(),
          },
          400
        )
      }

      const stub = getDOStub(c)

      // Check if workflow exists
      const existing = (await callDO(stub, `do.${COLLECTION}.get`, [id])) as Workflow | null
      if (!existing) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `Workflow not found: ${id}`,
            },
            links: {
              collection: `${url.origin}/api/${COLLECTION}`,
              api: `${url.origin}/api`,
            },
            timestamp: Date.now(),
          },
          404
        )
      }

      // Add updatedAt timestamp
      const updateData = {
        ...validation.data,
        updatedAt: Date.now(),
      }

      const result = (await callDO(stub, `do.${COLLECTION}.update`, [id, updateData])) as Workflow

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/${COLLECTION}/${id}`,
            collection: `${url.origin}/api/${COLLECTION}`,
            delete: `${url.origin}/api/${COLLECTION}/${id} (DELETE)`,
            start: `${url.origin}/api/${COLLECTION}/${id}/start (POST)`,
          },
          colo
        )
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'UPDATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to update workflow',
          },
          links: {
            self: `${url.origin}/api/${COLLECTION}/${id}`,
            collection: `${url.origin}/api/${COLLECTION}`,
          },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // PATCH /api/workflows/:id - Partial update a workflow
  // ==========================================================================

  router.patch('/api/workflows/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json()

      // Validate input
      const validation = validateUpdateInput(body)
      if (!validation.valid) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'VALIDATION_ERROR',
              message: validation.error,
            },
            links: {
              self: `${url.origin}/api/${COLLECTION}/${id}`,
              collection: `${url.origin}/api/${COLLECTION}`,
            },
            timestamp: Date.now(),
          },
          400
        )
      }

      const stub = getDOStub(c)

      // Add updatedAt timestamp
      const updateData = {
        ...validation.data,
        updatedAt: Date.now(),
      }

      const result = (await callDO(stub, `do.${COLLECTION}.update`, [id, updateData])) as Workflow

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/${COLLECTION}/${id}`,
            collection: `${url.origin}/api/${COLLECTION}`,
          },
          colo
        )
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'UPDATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to update workflow',
          },
          links: {
            self: `${url.origin}/api/${COLLECTION}/${id}`,
            collection: `${url.origin}/api/${COLLECTION}`,
          },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // DELETE /api/workflows/:id - Delete a workflow
  // ==========================================================================

  router.delete('/api/workflows/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)

      // Check if workflow exists
      const existing = (await callDO(stub, `do.${COLLECTION}.get`, [id])) as Workflow | null
      if (!existing) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `Workflow not found: ${id}`,
            },
            links: {
              collection: `${url.origin}/api/${COLLECTION}`,
              api: `${url.origin}/api`,
            },
            timestamp: Date.now(),
          },
          404
        )
      }

      // Prevent deletion of running workflows
      if (existing.executionState === 'Running' || existing.executionState === 'Waiting') {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'WORKFLOW_ACTIVE',
              message: `Cannot delete workflow in '${existing.executionState}' state. Stop the workflow first.`,
            },
            links: {
              self: `${url.origin}/api/${COLLECTION}/${id}`,
              collection: `${url.origin}/api/${COLLECTION}`,
            },
            timestamp: Date.now(),
          },
          409
        )
      }

      await callDO(stub, `do.${COLLECTION}.delete`, [id])

      return c.json(
        apiResponse(
          url.hostname,
          { deleted: true, id },
          {
            collection: `${url.origin}/api/${COLLECTION}`,
            api: `${url.origin}/api`,
          },
          colo
        )
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'DELETE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to delete workflow',
          },
          links: {
            self: `${url.origin}/api/${COLLECTION}/${id}`,
            collection: `${url.origin}/api/${COLLECTION}`,
          },
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

export default createWorkflowRoutes
