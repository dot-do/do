/**
 * MCP (Model Context Protocol) Module
 *
 * Implements the Model Context Protocol for AI tool integration.
 * Allows AI agents (Claude, GPT, etc.) to interact with Digital Objects.
 *
 * MCP Spec: https://modelcontextprotocol.io/
 */

import { Hono } from 'hono'
import type { Env, DOContext, APIResponse } from '../types'
import { getTools, handleListTools, handleToolCall, handleInitialize } from './handlers'

// =============================================================================
// MCP Types
// =============================================================================

/**
 * MCP Server Info
 */
export interface MCPServerInfo {
  protocolVersion: '2024-11-05'
  capabilities: {
    tools?: { listChanged?: boolean }
    resources?: { subscribe?: boolean; listChanged?: boolean }
    prompts?: { listChanged?: boolean }
    logging?: Record<string, never>
  }
  serverInfo: {
    name: string
    version: string
  }
}

/**
 * MCP Tool Definition
 */
export interface MCPTool {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, MCPSchemaProperty>
    required?: string[]
  }
}

export interface MCPSchemaProperty {
  type: string
  description?: string
  items?: MCPSchemaProperty
  properties?: Record<string, MCPSchemaProperty>
  required?: string[]
  enum?: string[]
  oneOf?: MCPSchemaProperty[]
}

/**
 * MCP Content
 */
export interface MCPContent {
  type: 'text' | 'image' | 'resource'
  text?: string
  data?: string
  mimeType?: string
  resource?: { uri: string; mimeType?: string; text?: string }
}

/**
 * MCP JSON-RPC Request
 */
export interface MCPRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: unknown
}

/**
 * MCP Tool Call Response
 */
export interface MCPToolCallResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: {
    content: MCPContent[]
    isError?: boolean
  }
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

/**
 * MCP List Tools Response
 */
export interface MCPListToolsResponse {
  jsonrpc: '2.0'
  id: string | number
  result: {
    tools: MCPTool[]
  }
}

// =============================================================================
// MCP Routes
// =============================================================================

/**
 * Create MCP routes
 */
export function createMCPRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  /**
   * GET /mcp - MCP server discovery
   */
  router.get('/mcp', (c) => {
    const url = new URL(c.req.url)

    const info: MCPServerInfo = {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false },
        logging: {},
      },
      serverInfo: {
        name: url.hostname,
        version: '1.0.0',
      },
    }

    return c.json({
      ...info,
      endpoints: {
        discovery: `${url.origin}/mcp`,
        tools: `${url.origin}/mcp`,
        rpc: `${url.origin}/rpc`,
      },
      links: {
        self: `${url.origin}/mcp`,
        api: `${url.origin}/.do`,
        docs: 'https://do.md/mcp',
      },
    }, 200, {
      'Access-Control-Allow-Origin': '*',
    })
  })

  /**
   * POST /mcp - MCP JSON-RPC requests
   */
  router.post('/mcp', async (c) => {
    const url = new URL(c.req.url)

    try {
      const body = await c.req.json() as MCPRequest

      let response: MCPToolCallResponse | MCPListToolsResponse

      switch (body.method) {
        case 'initialize':
          response = handleInitialize(url.hostname, body.id)
          break

        case 'tools/list':
          response = await handleListTools(body.id)
          break

        case 'tools/call': {
          const params = body.params as { name: string; arguments?: Record<string, unknown> }
          response = await handleToolCall(
            c.env,
            url.hostname,
            body.id,
            params.name,
            params.arguments || {}
          )
          break
        }

        default:
          response = {
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: -32601,
              message: `Method not found: ${body.method}`,
            },
          }
      }

      return c.json(response, 200, {
        'Access-Control-Allow-Origin': '*',
      })
    } catch (error) {
      return c.json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error',
          data: error instanceof Error ? error.message : undefined,
        },
      }, 400, {
        'Access-Control-Allow-Origin': '*',
      })
    }
  })

  /**
   * OPTIONS /mcp - CORS preflight
   */
  router.options('/mcp', (c) => {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    })
  })

  /**
   * GET /mcp/tools - List available tools
   */
  router.get('/mcp/tools', (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    const tools = getTools()

    return c.json({
      api: url.hostname,
      data: { tools },
      links: {
        self: `${url.origin}/mcp/tools`,
        mcp: `${url.origin}/mcp`,
        api: `${url.origin}/.do`,
      },
      colo,
      timestamp: Date.now(),
    } as APIResponse<{ tools: MCPTool[] }>)
  })

  return router
}

// =============================================================================
// Exports
// =============================================================================

export { getTools, handleListTools, handleToolCall, handleInitialize } from './handlers'
export default createMCPRoutes
