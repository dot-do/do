/**
 * MCP (Model Context Protocol) Server Implementation
 *
 * Enables AI tools (Claude, GPT, etc.) to interact with Digital Objects
 * through a standardized protocol.
 *
 * MCP Spec: https://modelcontextprotocol.io/
 *
 * Every DO exposes its capabilities as MCP tools:
 * - Identity methods (do.identity.get, do.identity.setContext)
 * - Collection CRUD (do.{collection}.{method})
 * - System methods (do.system.ping, do.system.stats)
 * - Custom methods registered by the DO
 */

import type { Env } from './index'
import type { DORPCMethods, DOSchema, MethodSchema } from '../types/rpc'
import type { DigitalObjectIdentity } from '../types/identity'

// =============================================================================
// MCP Types (subset of the protocol)
// =============================================================================

/**
 * MCP Server Info - returned on GET /mcp
 */
export interface MCPServerInfo {
  /** Protocol version */
  protocolVersion: '2024-11-05'
  /** Server capabilities */
  capabilities: {
    tools?: { listChanged?: boolean }
    resources?: { subscribe?: boolean; listChanged?: boolean }
    prompts?: { listChanged?: boolean }
    logging?: Record<string, never>
  }
  /** Server info */
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
}

/**
 * MCP Tool Call Request
 */
export interface MCPToolCallRequest {
  jsonrpc: '2.0'
  id: string | number
  method: 'tools/call'
  params: {
    name: string
    arguments?: Record<string, unknown>
  }
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

export interface MCPContent {
  type: 'text' | 'image' | 'resource'
  text?: string
  data?: string
  mimeType?: string
  resource?: { uri: string; mimeType?: string; text?: string }
}

/**
 * MCP List Tools Request
 */
export interface MCPListToolsRequest {
  jsonrpc: '2.0'
  id: string | number
  method: 'tools/list'
  params?: Record<string, never>
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
// MCP Server
// =============================================================================

/**
 * MCP Server for a Digital Object
 *
 * Maps DO RPC methods to MCP tools
 */
export class MCPServer {
  private readonly env: Env
  private readonly hostname: string
  private readonly baseUrl: string

  constructor(env: Env, hostname: string) {
    this.env = env
    this.hostname = hostname
    this.baseUrl = `https://${hostname}`
  }

  /**
   * Get MCP server info (for GET /mcp)
   */
  getServerInfo(): MCPServerInfo {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false },
        logging: {},
      },
      serverInfo: {
        name: this.hostname,
        version: '1.0.0',
      },
    }
  }

  /**
   * Get available tools (maps DO methods to MCP tools)
   */
  async getTools(): Promise<MCPTool[]> {
    // Get DO schema for custom methods
    const doId = this.env.DO.idFromName(this.hostname)
    const stub = this.env.DO.get(doId)

    let identity: DigitalObjectIdentity | null = null
    try {
      const response = await stub.fetch(new Request(`${this.baseUrl}/.do`))
      if (response.ok) {
        identity = await response.json()
      }
    } catch {
      // Ignore errors, use default tools
    }

    // Core DO tools
    const tools: MCPTool[] = [
      // Identity
      {
        name: 'do.identity.get',
        description: 'Get the identity of this Digital Object ($id, $type, $context, $version)',
        inputSchema: { type: 'object' },
      },
      {
        name: 'do.identity.setContext',
        description: 'Set the parent context for CDC streaming',
        inputSchema: {
          type: 'object',
          properties: {
            context: { type: 'string', description: 'Parent DO URL (e.g., https://parent.domain)' },
          },
          required: ['context'],
        },
      },

      // System
      {
        name: 'do.system.ping',
        description: 'Health check - returns pong with timestamp',
        inputSchema: { type: 'object' },
      },
      {
        name: 'do.system.stats',
        description: 'Get DO statistics (storage, connections, CDC)',
        inputSchema: { type: 'object' },
      },
      {
        name: 'do.system.schema',
        description: 'Get DO schema (available methods and collections)',
        inputSchema: { type: 'object' },
      },

      // Collections - generic CRUD
      ...this.getCollectionTools('nouns', 'Noun', 'entity type definitions'),
      ...this.getCollectionTools('verbs', 'Verb', 'action type definitions with grammatical forms'),
      ...this.getCollectionTools('things', 'Thing', 'instances of nouns'),
      ...this.getCollectionTools('actions', 'Action', 'durable action instances'),
      ...this.getCollectionTools('relationships', 'Relationship', 'connections between things'),
      ...this.getCollectionTools('functions', 'Function', 'executable functions (code, generative, agentic, human)'),
      ...this.getCollectionTools('workflows', 'Workflow', 'durable workflows and state machines'),
      ...this.getCollectionTools('events', 'Event', 'immutable event records'),
      ...this.getCollectionTools('users', 'User', 'user identities'),
      ...this.getCollectionTools('agents', 'Agent', 'autonomous AI agents'),
      ...this.getCollectionTools('integrations', 'Integration', 'external service connections'),

      // CDC
      {
        name: 'do.cdc.subscribe',
        description: 'Subscribe to change data capture events',
        inputSchema: {
          type: 'object',
          properties: {
            collections: { type: 'array', items: { type: 'string' }, description: 'Collections to subscribe to' },
          },
        },
      },
      {
        name: 'do.cdc.getChanges',
        description: 'Get CDC changes since a cursor (pull-based)',
        inputSchema: {
          type: 'object',
          properties: {
            cursor: { type: 'string', description: 'CDC cursor' },
            limit: { type: 'number', description: 'Max events to return' },
          },
        },
      },

      // Schedule
      {
        name: 'do.schedule',
        description: 'Schedule a callback to be executed at a specific time or interval',
        inputSchema: {
          type: 'object',
          properties: {
            when: { type: 'string', description: 'Date (ISO string), delay in seconds (number), or cron expression' },
            callback: { type: 'string', description: 'Method name to call' },
            payload: { type: 'object', description: 'Data to pass to the callback' },
          },
          required: ['when', 'callback'],
        },
      },
      {
        name: 'do.schedule.list',
        description: 'List all scheduled callbacks',
        inputSchema: { type: 'object' },
      },
      {
        name: 'do.schedule.cancel',
        description: 'Cancel a scheduled callback',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Schedule ID to cancel' },
          },
          required: ['id'],
        },
      },
    ]

    return tools
  }

  /**
   * Generate CRUD tools for a collection
   */
  private getCollectionTools(collection: string, type: string, description: string): MCPTool[] {
    return [
      {
        name: `do.${collection}.list`,
        description: `List ${description}`,
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Max items to return' },
            offset: { type: 'number', description: 'Offset for pagination' },
            cursor: { type: 'string', description: 'Cursor for pagination' },
            orderBy: { type: 'string', description: 'Field to order by' },
            orderDir: { type: 'string', enum: ['asc', 'desc'], description: 'Order direction' },
          },
        },
      },
      {
        name: `do.${collection}.get`,
        description: `Get a single ${type} by ID`,
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: `${type} ID` },
          },
          required: ['id'],
        },
      },
      {
        name: `do.${collection}.create`,
        description: `Create a new ${type}`,
        inputSchema: {
          type: 'object',
          properties: {
            data: { type: 'object', description: `${type} data` },
          },
          required: ['data'],
        },
      },
      {
        name: `do.${collection}.update`,
        description: `Update an existing ${type}`,
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: `${type} ID` },
            data: { type: 'object', description: 'Fields to update' },
          },
          required: ['id', 'data'],
        },
      },
      {
        name: `do.${collection}.delete`,
        description: `Delete a ${type}`,
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: `${type} ID` },
          },
          required: ['id'],
        },
      },
    ]
  }

  /**
   * Handle MCP JSON-RPC request
   */
  async handleRequest(request: unknown): Promise<MCPListToolsResponse | MCPToolCallResponse> {
    const req = request as { jsonrpc: string; id: string | number; method: string; params?: unknown }

    if (req.method === 'tools/list') {
      const tools = await this.getTools()
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: { tools },
      }
    }

    if (req.method === 'tools/call') {
      const params = req.params as { name: string; arguments?: Record<string, unknown> }
      return this.callTool(req.id, params.name, params.arguments || {})
    }

    if (req.method === 'initialize') {
      // Return server info for initialize request
      const info = this.getServerInfo()
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
        },
      }
    }

    return {
      jsonrpc: '2.0',
      id: req.id,
      error: {
        code: -32601,
        message: `Method not found: ${req.method}`,
      },
    }
  }

  /**
   * Call a tool and return the result
   */
  private async callTool(
    id: string | number,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolCallResponse> {
    try {
      // Route to DO via internal RPC
      const doId = this.env.DO.idFromName(this.hostname)
      const stub = this.env.DO.get(doId)

      // Build RPC request
      const rpcRequest = {
        type: 'rpc',
        id: `mcp-${id}`,
        method: toolName,
        args: this.argsToArray(toolName, args),
      }

      // Call DO via WebSocket-style RPC over HTTP
      const response = await stub.fetch(new Request(`${this.baseUrl}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rpcRequest),
      }))

      const result = await response.json()

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        },
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      }
    }
  }

  /**
   * Convert named arguments to positional array for RPC
   */
  private argsToArray(method: string, args: Record<string, unknown>): unknown[] {
    // Most DO methods take a single object or ID
    if (method.endsWith('.get') || method.endsWith('.delete')) {
      return [args.id]
    }
    if (method.endsWith('.create')) {
      return [args.data]
    }
    if (method.endsWith('.update')) {
      return [args.id, args.data]
    }
    if (method === 'do.identity.setContext') {
      return [args.context]
    }
    if (method === 'do.schedule') {
      return [args.when, args.callback, args.payload]
    }
    if (method === 'do.schedule.cancel') {
      return [args.id]
    }
    if (method === 'do.cdc.getChanges') {
      return [args.cursor, args.limit]
    }
    if (method === 'do.cdc.subscribe') {
      return [args]
    }

    // Default: pass as single object
    return Object.keys(args).length > 0 ? [args] : []
  }
}

// =============================================================================
// MCP Route Handlers
// =============================================================================

/**
 * Handle GET /mcp - Server discovery
 */
export function handleMCPDiscovery(env: Env, hostname: string): Response {
  const server = new MCPServer(env, hostname)
  const info = server.getServerInfo()

  // Include tools in discovery response for convenience
  return new Response(JSON.stringify({
    ...info,
    endpoints: {
      discovery: `https://${hostname}/mcp`,
      tools: `https://${hostname}/mcp`,
      rpc: `https://${hostname}/rpc`,
    },
    links: {
      self: `https://${hostname}/mcp`,
      api: `https://${hostname}/.do`,
      docs: 'https://do.md/mcp',
    },
  }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

/**
 * Handle POST /mcp - MCP JSON-RPC requests
 */
export async function handleMCPRequest(request: Request, env: Env, hostname: string): Promise<Response> {
  const server = new MCPServer(env, hostname)

  try {
    const body = await request.json()
    const response = await server.handleRequest(body)

    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
        data: error instanceof Error ? error.message : undefined,
      },
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
