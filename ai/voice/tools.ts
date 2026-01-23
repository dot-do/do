/**
 * Voice Tool Calling Integration
 *
 * Enables voice agents to call tools mid-conversation.
 * Tools are functions that can be invoked during a call
 * to look up data, perform actions, or control call flow.
 *
 * @module ai/voice/tools
 */

import type {
  VoiceAgentTool,
  ToolCallRecord,
  TranscriptEntry,
} from '../../types/voice-ai'

// =============================================================================
// Types
// =============================================================================

/**
 * Context provided to tool handlers
 */
export interface ToolContext {
  /** Session ID */
  sessionId: string
  /** Voice agent ID */
  agentId: string
  /** Customer phone number (if phone call) */
  customerPhone?: string
  /** Current transcript */
  transcript: TranscriptEntry[]
  /** Session metadata */
  metadata?: Record<string, unknown>
  /** Provider-specific context */
  providerContext?: Record<string, unknown>
}

/**
 * Tool handler function
 *
 * @param args - Arguments passed to the tool
 * @param context - Execution context
 * @returns Tool result (will be sent back to the voice agent)
 */
export type ToolHandler<TArgs = Record<string, unknown>, TResult = unknown> = (
  args: TArgs,
  context: ToolContext
) => Promise<TResult>

/**
 * Tool registration options
 */
export interface RegisterToolOptions {
  /** Tool name (must match VoiceAgentTool.name) */
  name: string
  /** Tool handler function */
  handler: ToolHandler
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number
  /** Whether this tool can end the call */
  canEndCall?: boolean
  /** Validation function for arguments */
  validate?: (args: Record<string, unknown>) => boolean | string
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  /** Tool call record */
  record: ToolCallRecord
  /** Whether to end the call */
  endCall?: boolean
  /** Message to speak before continuing/ending */
  message?: string
}

/**
 * Transfer result from a tool
 */
export interface TransferResult {
  /** Signal transfer */
  transfer: true
  /** Department or destination */
  department?: string
  /** Phone number to transfer to */
  number?: string
  /** Priority level */
  priority?: 'low' | 'normal' | 'high'
  /** Message to speak before transfer */
  message?: string
}

// =============================================================================
// Voice Tool Registry
// =============================================================================

/**
 * Voice tool registry and executor
 *
 * Manages tool registration and execution for voice agents.
 * Tools are called mid-conversation when the voice agent
 * decides to invoke them.
 *
 * @example
 * ```typescript
 * const registry = new VoiceToolRegistry()
 *
 * // Register a tool
 * registry.register({
 *   name: 'lookup_order',
 *   handler: async (args, context) => {
 *     const order = await db.orders.get(args.orderId)
 *     return { status: order.status, eta: order.eta }
 *   },
 * })
 *
 * // Execute a tool call
 * const result = await registry.execute('lookup_order', { orderId: '123' }, context)
 * ```
 */
export class VoiceToolRegistry {
  private tools = new Map<string, RegisterToolOptions>()
  private defaultTimeout = 10000

  /**
   * Register a tool handler
   *
   * @param options - Tool registration options
   */
  register(options: RegisterToolOptions): void {
    if (this.tools.has(options.name)) {
      throw new Error(`Tool already registered: ${options.name}`)
    }
    this.tools.set(options.name, options)
  }

  /**
   * Register multiple tools at once
   *
   * @param tools - Array of tool registration options
   */
  registerAll(tools: RegisterToolOptions[]): void {
    for (const tool of tools) {
      this.register(tool)
    }
  }

  /**
   * Unregister a tool
   *
   * @param name - Tool name
   * @returns True if tool was unregistered
   */
  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  /**
   * Check if a tool is registered
   *
   * @param name - Tool name
   * @returns True if tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * Get registered tool names
   *
   * @returns Array of tool names
   */
  list(): string[] {
    return Array.from(this.tools.keys())
  }

  /**
   * Execute a tool call
   *
   * @param name - Tool name
   * @param args - Tool arguments
   * @param context - Execution context
   * @returns Tool execution result
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      return {
        record: createErrorRecord(name, args, `Tool not found: ${name}`),
      }
    }

    // Validate arguments
    if (tool.validate) {
      const validationResult = tool.validate(args)
      if (validationResult !== true) {
        const error = typeof validationResult === 'string' ? validationResult : 'Invalid arguments'
        return {
          record: createErrorRecord(name, args, error),
        }
      }
    }

    const startTime = Date.now()
    const recordId = `tc_${generateId()}`

    try {
      // Execute with timeout
      const result = await executeWithTimeout(
        tool.handler(args, context),
        tool.timeout ?? this.defaultTimeout
      )

      // Check for transfer result
      if (isTransferResult(result)) {
        return {
          record: {
            id: recordId,
            toolName: name,
            arguments: args,
            result,
            startTime,
            endTime: Date.now(),
            success: true,
          },
          endCall: false,
          message: result.message,
        }
      }

      // Check for end call
      const endCall = tool.canEndCall && isEndCallResult(result)

      return {
        record: {
          id: recordId,
          toolName: name,
          arguments: args,
          result,
          startTime,
          endTime: Date.now(),
          success: true,
        },
        endCall,
        message: typeof result === 'object' && result !== null && 'message' in result
          ? (result as { message?: string }).message
          : undefined,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        record: {
          id: recordId,
          toolName: name,
          arguments: args,
          startTime,
          endTime: Date.now(),
          success: false,
          error: errorMessage,
        },
      }
    }
  }

  /**
   * Set default timeout for tool execution
   *
   * @param timeout - Timeout in milliseconds
   */
  setDefaultTimeout(timeout: number): void {
    this.defaultTimeout = timeout
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear()
  }
}

// =============================================================================
// Common Tool Factories
// =============================================================================

/**
 * Create a lookup tool that queries a data source
 *
 * @param name - Tool name
 * @param description - Tool description
 * @param lookup - Lookup function
 * @returns Tool registration options
 */
export function createLookupTool<T>(
  name: string,
  description: string,
  lookup: (args: Record<string, unknown>, context: ToolContext) => Promise<T>
): RegisterToolOptions {
  return {
    name,
    handler: lookup,
  }
}

/**
 * Create an action tool that performs a side effect
 *
 * @param name - Tool name
 * @param description - Tool description
 * @param action - Action function
 * @returns Tool registration options
 */
export function createActionTool(
  name: string,
  description: string,
  action: (args: Record<string, unknown>, context: ToolContext) => Promise<{ success: boolean; message?: string }>
): RegisterToolOptions {
  return {
    name,
    handler: action,
  }
}

/**
 * Create a transfer tool that initiates call transfer
 *
 * @param name - Tool name
 * @param getTransferConfig - Function to determine transfer destination
 * @returns Tool registration options
 */
export function createTransferTool(
  name: string,
  getTransferConfig: (
    args: Record<string, unknown>,
    context: ToolContext
  ) => Promise<Omit<TransferResult, 'transfer'>>
): RegisterToolOptions {
  return {
    name,
    handler: async (args, context) => {
      const config = await getTransferConfig(args, context)
      return { transfer: true, ...config } as TransferResult
    },
  }
}

/**
 * Create an end call tool
 *
 * @param name - Tool name
 * @param getMessage - Function to get closing message
 * @returns Tool registration options
 */
export function createEndCallTool(
  name: string,
  getMessage: (args: Record<string, unknown>, context: ToolContext) => Promise<string>
): RegisterToolOptions {
  return {
    name,
    handler: async (args, context) => {
      const message = await getMessage(args, context)
      return { endCall: true, message }
    },
    canEndCall: true,
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a random ID
 */
function generateId(): string {
  // TODO: Use nanoid
  return Math.random().toString(36).substring(2, 15)
}

/**
 * Create an error tool call record
 */
function createErrorRecord(
  toolName: string,
  args: Record<string, unknown>,
  error: string
): ToolCallRecord {
  const now = Date.now()
  return {
    id: `tc_${generateId()}`,
    toolName,
    arguments: args,
    startTime: now,
    endTime: now,
    success: false,
    error,
  }
}

/**
 * Execute a promise with timeout
 */
async function executeWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Tool execution timeout')), timeout)
  })
  return Promise.race([promise, timeoutPromise])
}

/**
 * Check if result signals transfer
 */
function isTransferResult(result: unknown): result is TransferResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'transfer' in result &&
    (result as TransferResult).transfer === true
  )
}

/**
 * Check if result signals end call
 */
function isEndCallResult(result: unknown): boolean {
  return (
    typeof result === 'object' &&
    result !== null &&
    'endCall' in result &&
    (result as { endCall?: boolean }).endCall === true
  )
}

// =============================================================================
// Singleton Access
// =============================================================================

const defaultRegistry = new VoiceToolRegistry()

/**
 * Voice tools singleton access
 *
 * @example
 * ```typescript
 * import { VoiceTools } from 'do/ai/voice'
 *
 * VoiceTools.register({
 *   name: 'lookup_order',
 *   handler: async (args, context) => {
 *     // ...
 *   },
 * })
 * ```
 */
export const VoiceTools = {
  /**
   * Register a tool
   */
  register(options: RegisterToolOptions): void {
    defaultRegistry.register(options)
  },

  /**
   * Register multiple tools
   */
  registerAll(tools: RegisterToolOptions[]): void {
    defaultRegistry.registerAll(tools)
  },

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    return defaultRegistry.unregister(name)
  },

  /**
   * Check if tool is registered
   */
  has(name: string): boolean {
    return defaultRegistry.has(name)
  },

  /**
   * List registered tools
   */
  list(): string[] {
    return defaultRegistry.list()
  },

  /**
   * Execute a tool
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolExecutionResult> {
    return defaultRegistry.execute(name, args, context)
  },

  /**
   * Clear all tools
   */
  clear(): void {
    defaultRegistry.clear()
  },

  /**
   * Get the underlying registry
   */
  getRegistry(): VoiceToolRegistry {
    return defaultRegistry
  },
}

// =============================================================================
// Exports
// =============================================================================

// VoiceToolRegistry is already exported as a class declaration above
