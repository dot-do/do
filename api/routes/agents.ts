/**
 * Agents CRUD Routes
 *
 * REST API for Agent management with DO storage integration.
 * Agents are AI workers with communication channels, capabilities, and voice modalities.
 */

import { Hono } from 'hono'
import type { Env, DOContext, APIResponse, PaginatedResponse } from '../types'
import type { Agent as CollectionAgent } from '../../types/collections'
import { AgentRegistry, createSupportAgent, createSalesAgent, createSchedulingAgent } from '../../ai/agents'
import { getAgentManager, createAgent, type CreateAgentOptions } from '../../workers'
import type { Agent } from '../../workers'

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build API response with links
 */
function apiResponse<T>(
  api: string,
  data: T,
  links: Record<string, string>,
  colo?: string
): APIResponse<T> {
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
async function callDO(
  stub: DurableObjectStub,
  method: string,
  args: unknown[] = []
): Promise<unknown> {
  const response = await stub.fetch(new Request('https://do/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'rpc', id: `api-${Date.now()}`, method, args }),
  }))

  const result = await response.json() as { result?: unknown; error?: { message: string } }

  if (result.error) {
    throw new Error(result.error.message)
  }

  return result.result
}

/**
 * Convert worker Agent to collection Agent format
 */
function toCollectionAgent(agent: Agent): CollectionAgent {
  return {
    id: agent.id,
    name: agent.name,
    type: 'agent',
    description: agent.description,
    personality: {
      name: agent.name,
      description: agent.description,
      style: 'professional',
    },
    modalities: agent.voice?.enabled ? ['text', 'voice'] : ['text'],
    voiceConfig: agent.voice?.config ? {
      provider: ((agent.voice.config as Record<string, unknown>).voiceProvider as string || (agent.voice.config as Record<string, unknown>).provider as string || 'elevenlabs') as 'elevenlabs' | 'playht' | 'azure' | 'google' | 'openai' | 'deepgram',
      voiceId: ((agent.voice.config as Record<string, unknown>).voiceId as string) || '',
      voiceName: (agent.voice.config as Record<string, unknown>).voiceId as string,
      speed: (agent.voice.config as Record<string, unknown>).speed as number | undefined,
    } : undefined,
    capabilities: agent.capabilities.skills,
    status: agent.status === 'active' ? 'Idle' : agent.status === 'busy' ? 'Working' : 'Paused',
    config: {
      model: typeof agent.model === 'string' ? agent.model : 'best',
      systemPrompt: agent.systemPrompt,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      tools: agent.tools as string[],
    },
    createdAt: agent.createdAt.getTime(),
    updatedAt: agent.updatedAt.getTime(),
    memory: agent.metadata,
  }
}

// =============================================================================
// Agents Routes
// =============================================================================

/**
 * Create Agents CRUD routes
 */
export function createAgentsRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  // ==========================================================================
  // List Agents
  // ==========================================================================

  /**
   * GET /api/agents - List all agents with pagination
   */
  router.get('/api/agents', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    // Parse query params
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)
    const status = url.searchParams.get('status') as 'active' | 'inactive' | 'busy' | 'away' | 'offline' | null
    const hasVoice = url.searchParams.get('hasVoice')
    const model = url.searchParams.get('model')

    try {
      // First try DO storage via RPC
      const stub = getDOStub(c)
      let agents: Agent[] = []
      let total = 0

      try {
        const result = await callDO(stub, 'do.agents.list', [{
          limit,
          offset,
          status: status || undefined,
          hasVoice: hasVoice === 'true' ? true : hasVoice === 'false' ? false : undefined,
          model: model || undefined,
        }]) as { items?: Agent[]; total?: number }

        agents = result.items || (Array.isArray(result) ? result : [])
        total = result.total || agents.length
      } catch {
        // Fallback to AgentManager
        const manager = getAgentManager()
        agents = await manager.list({
          status: status || undefined,
          hasVoice: hasVoice === 'true' ? true : hasVoice === 'false' ? false : undefined,
          model: model || undefined,
          limit,
          offset,
        })
        total = agents.length
      }

      // Convert to collection format
      const items = agents.map(toCollectionAgent)

      const links: Record<string, string> = {
        self: `${url.origin}/api/agents`,
        api: `${url.origin}/api`,
        create: `${url.origin}/api/agents (POST)`,
        templates: `${url.origin}/api/agents/templates`,
      }

      // Add pagination links
      if (offset > 0) {
        links.prev = `${url.origin}/api/agents?limit=${limit}&offset=${Math.max(0, offset - limit)}`
      }
      if (items.length === limit) {
        links.next = `${url.origin}/api/agents?limit=${limit}&offset=${offset + limit}`
      }

      return c.json({
        api: url.hostname,
        data: items,
        pagination: {
          total,
          page: Math.floor(offset / limit) + 1,
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
          hasMore: items.length === limit,
        },
        links,
        colo,
        timestamp: Date.now(),
      } as PaginatedResponse<CollectionAgent>)
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'LIST_ERROR',
          message: error instanceof Error ? error.message : 'Failed to list agents',
        },
        links: { self: `${url.origin}/api/agents`, api: `${url.origin}/api` },
        timestamp: Date.now(),
      }, 500)
    }
  })

  // ==========================================================================
  // Get Agent Templates
  // ==========================================================================

  /**
   * GET /api/agents/templates - Get agent templates
   */
  router.get('/api/agents/templates', (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    const templates = [
      {
        name: 'support',
        description: 'Customer support agent template',
        usage: 'createSupportAgent(name, { company, products, tone })',
      },
      {
        name: 'sales',
        description: 'Sales development agent template',
        usage: 'createSalesAgent(name, { company, product, style })',
      },
      {
        name: 'scheduling',
        description: 'Calendar/scheduling agent template',
        usage: 'createSchedulingAgent(name, { company, calendarSystem })',
      },
    ]

    return c.json(apiResponse(url.hostname, { templates }, {
      self: `${url.origin}/api/agents/templates`,
      agents: `${url.origin}/api/agents`,
      api: `${url.origin}/api`,
    }, colo))
  })

  // ==========================================================================
  // Create Agent from Template
  // ==========================================================================

  /**
   * POST /api/agents/templates/:template - Create agent from template
   */
  router.post('/api/agents/templates/:template', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const template = c.req.param('template')

    try {
      const body = await c.req.json() as {
        name: string
        company?: string
        products?: string[]
        product?: string
        tone?: 'friendly' | 'professional' | 'casual'
        style?: 'consultative' | 'direct' | 'educational'
        calendarSystem?: string
      }

      let builder: ReturnType<typeof createSupportAgent> | null = null

      switch (template) {
        case 'support':
          builder = createSupportAgent(body.name, {
            company: body.company,
            products: body.products,
            tone: body.tone,
          })
          break
        case 'sales':
          builder = createSalesAgent(body.name, {
            company: body.company,
            product: body.product,
            style: body.style,
          })
          break
        case 'scheduling':
          builder = createSchedulingAgent(body.name, {
            company: body.company,
            calendarSystem: body.calendarSystem,
          })
          break
        default:
          return c.json({
            api: url.hostname,
            error: {
              code: 'INVALID_TEMPLATE',
              message: `Unknown template: ${template}. Valid templates: support, sales, scheduling`,
            },
            links: { templates: `${url.origin}/api/agents/templates` },
            timestamp: Date.now(),
          }, 400)
      }

      const agent = builder.build()

      // Store in DO
      const stub = getDOStub(c)
      try {
        await callDO(stub, 'do.agents.create', [agent])
      } catch {
        // Store in local registry as fallback
        AgentRegistry.register(agent)
      }

      const collectionAgent = toCollectionAgent(agent)

      return c.json(apiResponse(url.hostname, collectionAgent, {
        self: `${url.origin}/api/agents/${agent.id}`,
        agents: `${url.origin}/api/agents`,
        update: `${url.origin}/api/agents/${agent.id} (PUT)`,
        delete: `${url.origin}/api/agents/${agent.id} (DELETE)`,
      }, colo), 201)
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create agent from template',
        },
        links: { templates: `${url.origin}/api/agents/templates`, agents: `${url.origin}/api/agents` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  // ==========================================================================
  // Get Agent
  // ==========================================================================

  /**
   * GET /api/agents/:id - Get agent by ID
   */
  router.get('/api/agents/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      let agent: Agent | null = null

      try {
        agent = await callDO(stub, 'do.agents.get', [id]) as Agent | null
      } catch {
        // Fallback to AgentManager
        const manager = getAgentManager()
        agent = await manager.get(id)
      }

      if (!agent) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'NOT_FOUND',
            message: `Agent not found: ${id}`,
          },
          links: { agents: `${url.origin}/api/agents`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 404)
      }

      const collectionAgent = toCollectionAgent(agent)

      return c.json(apiResponse(url.hostname, collectionAgent, {
        self: `${url.origin}/api/agents/${id}`,
        agents: `${url.origin}/api/agents`,
        update: `${url.origin}/api/agents/${id} (PUT)`,
        delete: `${url.origin}/api/agents/${id} (DELETE)`,
        invoke: `${url.origin}/api/agents/${id}/invoke (POST)`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'GET_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get agent',
        },
        links: { agents: `${url.origin}/api/agents`, api: `${url.origin}/api` },
        timestamp: Date.now(),
      }, 500)
    }
  })

  // ==========================================================================
  // Create Agent
  // ==========================================================================

  /**
   * POST /api/agents - Create a new agent
   */
  router.post('/api/agents', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const body = await c.req.json() as CreateAgentOptions

      // Validate required fields
      if (!body.name) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Agent name is required',
          },
          links: { agents: `${url.origin}/api/agents`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 400)
      }

      if (!body.systemPrompt) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Agent systemPrompt is required',
          },
          links: { agents: `${url.origin}/api/agents`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 400)
      }

      const agent = createAgent(body)

      // Store in DO
      const stub = getDOStub(c)
      try {
        await callDO(stub, 'do.agents.create', [agent])
      } catch {
        // Store in local registry as fallback
        AgentRegistry.register(agent)
      }

      const collectionAgent = toCollectionAgent(agent)

      return c.json(apiResponse(url.hostname, collectionAgent, {
        self: `${url.origin}/api/agents/${agent.id}`,
        agents: `${url.origin}/api/agents`,
        update: `${url.origin}/api/agents/${agent.id} (PUT)`,
        delete: `${url.origin}/api/agents/${agent.id} (DELETE)`,
      }, colo), 201)
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create agent',
        },
        links: { agents: `${url.origin}/api/agents`, api: `${url.origin}/api` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  // ==========================================================================
  // Update Agent
  // ==========================================================================

  /**
   * PUT /api/agents/:id - Update an agent
   */
  router.put('/api/agents/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json() as Partial<CreateAgentOptions>
      const stub = getDOStub(c)
      let agent: Agent | null = null

      try {
        agent = await callDO(stub, 'do.agents.update', [id, body]) as Agent | null
      } catch {
        // Fallback to AgentManager
        const manager = getAgentManager()
        agent = await manager.update(id, body)
      }

      if (!agent) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'NOT_FOUND',
            message: `Agent not found: ${id}`,
          },
          links: { agents: `${url.origin}/api/agents`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 404)
      }

      const collectionAgent = toCollectionAgent(agent)

      return c.json(apiResponse(url.hostname, collectionAgent, {
        self: `${url.origin}/api/agents/${id}`,
        agents: `${url.origin}/api/agents`,
        delete: `${url.origin}/api/agents/${id} (DELETE)`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update agent',
        },
        links: { self: `${url.origin}/api/agents/${id}`, agents: `${url.origin}/api/agents` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  // ==========================================================================
  // Patch Agent
  // ==========================================================================

  /**
   * PATCH /api/agents/:id - Partial update an agent
   */
  router.patch('/api/agents/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json() as Partial<CreateAgentOptions>
      const stub = getDOStub(c)
      let agent: Agent | null = null

      try {
        agent = await callDO(stub, 'do.agents.update', [id, body]) as Agent | null
      } catch {
        // Fallback to AgentManager
        const manager = getAgentManager()
        agent = await manager.update(id, body)
      }

      if (!agent) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'NOT_FOUND',
            message: `Agent not found: ${id}`,
          },
          links: { agents: `${url.origin}/api/agents`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 404)
      }

      const collectionAgent = toCollectionAgent(agent)

      return c.json(apiResponse(url.hostname, collectionAgent, {
        self: `${url.origin}/api/agents/${id}`,
        agents: `${url.origin}/api/agents`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update agent',
        },
        links: { self: `${url.origin}/api/agents/${id}`, agents: `${url.origin}/api/agents` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  // ==========================================================================
  // Delete Agent
  // ==========================================================================

  /**
   * DELETE /api/agents/:id - Delete an agent
   */
  router.delete('/api/agents/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      let deleted = false

      try {
        await callDO(stub, 'do.agents.delete', [id])
        deleted = true
      } catch {
        // Fallback to AgentManager
        const manager = getAgentManager()
        deleted = await manager.delete(id)
      }

      if (!deleted) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'NOT_FOUND',
            message: `Agent not found: ${id}`,
          },
          links: { agents: `${url.origin}/api/agents`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 404)
      }

      return c.json(apiResponse(url.hostname, { deleted: true, id }, {
        agents: `${url.origin}/api/agents`,
        api: `${url.origin}/api`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'DELETE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete agent',
        },
        links: { self: `${url.origin}/api/agents/${id}`, agents: `${url.origin}/api/agents` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  // ==========================================================================
  // Agent Operations
  // ==========================================================================

  /**
   * POST /api/agents/:id/invoke - Invoke an agent
   */
  router.post('/api/agents/:id/invoke', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json().catch(() => ({})) as {
        message?: string
        input?: unknown
        context?: Record<string, unknown>
      }

      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.agents.invoke', [id, body])

      return c.json(apiResponse(url.hostname, result, {
        self: `${url.origin}/api/agents/${id}`,
        agents: `${url.origin}/api/agents`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'INVOKE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to invoke agent',
        },
        links: { self: `${url.origin}/api/agents/${id}`, agents: `${url.origin}/api/agents` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  /**
   * POST /api/agents/:id/status - Update agent status
   */
  router.post('/api/agents/:id/status', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json() as { status: 'active' | 'inactive' | 'busy' | 'away' | 'offline' }

      if (!body.status || !['active', 'inactive', 'busy', 'away', 'offline'].includes(body.status)) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Valid status required: active, inactive, busy, away, offline',
          },
          links: { self: `${url.origin}/api/agents/${id}`, agents: `${url.origin}/api/agents` },
          timestamp: Date.now(),
        }, 400)
      }

      const stub = getDOStub(c)
      let agent: Agent | null = null

      try {
        agent = await callDO(stub, 'do.agents.setStatus', [id, body.status]) as Agent | null
      } catch {
        // Fallback to AgentManager
        const manager = getAgentManager()
        agent = await manager.setStatus(id, body.status)
      }

      if (!agent) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'NOT_FOUND',
            message: `Agent not found: ${id}`,
          },
          links: { agents: `${url.origin}/api/agents`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 404)
      }

      const collectionAgent = toCollectionAgent(agent)

      return c.json(apiResponse(url.hostname, collectionAgent, {
        self: `${url.origin}/api/agents/${id}`,
        agents: `${url.origin}/api/agents`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'STATUS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update agent status',
        },
        links: { self: `${url.origin}/api/agents/${id}`, agents: `${url.origin}/api/agents` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  return router
}

// =============================================================================
// Export
// =============================================================================

export default createAgentsRoutes
