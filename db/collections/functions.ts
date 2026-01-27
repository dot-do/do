/**
 * Functions Collection - Unified function management
 *
 * @module collections/functions
 *
 * @description
 * Manages the 4 function types:
 * - CodeFunction - pure TypeScript/JavaScript, executes synchronously
 * - GenerativeFunction - AI model call, async
 * - AgenticFunction - autonomous agent, async with multiple steps
 * - HumanFunction - human-in-the-loop, waits for human response
 *
 * Functions are Things with $type='Function' and functionType discriminator.
 *
 * @example
 * ```typescript
 * const functions = new FunctionCollection(storage)
 *
 * // Create a code function
 * const addFn = await functions.createCode({
 *   name: 'add',
 *   code: 'return a + b',
 *   runtime: 'javascript'
 * })
 *
 * // Create a generative function
 * const summarizeFn = await functions.createGenerative({
 *   name: 'summarize',
 *   model: 'best',
 *   prompt: 'Summarize: {{text}}'
 * })
 * ```
 */

import type { SchemaDefinition, FunctionType, ListOptions, ListResult, FilterExpression } from '../../types/collections'
import { BaseCollection, DOStorage, ValidationError, NotFoundError } from './base'

// =============================================================================
// Config Types
// =============================================================================

/**
 * Configuration for code functions
 */
export interface CodeFunctionConfig {
  type: 'code'
  /** The code to execute */
  code: string
  /** Runtime environment */
  runtime: 'javascript' | 'typescript'
}

/**
 * Configuration for generative (AI model) functions
 */
export interface GenerativeFunctionConfig {
  type: 'generative'
  /** Model characteristic (not hardcoded model name) */
  model: string
  /** Prompt template with {{placeholders}} */
  prompt: string
  /** Temperature for AI generation (0-1) */
  temperature?: number
  /** Maximum tokens in response */
  maxTokens?: number
  /** Output schema for structured responses */
  schema?: SchemaDefinition
}

/**
 * Configuration for agentic functions
 */
export interface AgenticFunctionConfig {
  type: 'agentic'
  /** Agent identifier or reference */
  agent: string
  /** Goal description with {{placeholders}} */
  goal: string
  /** Tools the agent can use */
  tools?: string[]
  /** Maximum iterations for the agent */
  maxIterations?: number
}

/**
 * Configuration for human-in-the-loop functions
 */
export interface HumanFunctionConfig {
  type: 'human'
  /** Instructions for the human */
  instructions: string
  /** Assignee (email or user ID) */
  assignee?: string
  /** Timeout in milliseconds */
  timeout?: number
}

/**
 * Union of all function config types
 */
export type FunctionConfig = CodeFunctionConfig | GenerativeFunctionConfig | AgenticFunctionConfig | HumanFunctionConfig

// =============================================================================
// Entity Type
// =============================================================================

/**
 * Function entity - a stored function definition
 */
export interface FunctionEntity {
  /** Unique identifier (func_ prefix) - same as $id for BaseEntity compatibility */
  id: string
  /** Unique identifier (func_ prefix) */
  $id: string
  /** Entity type - always 'Function' */
  $type: 'Function'
  /** Function type discriminator */
  functionType: FunctionType
  /** Function name */
  name: string
  /** Function description */
  description?: string
  /** Type-specific configuration */
  config: FunctionConfig
  /** Input schema for validation */
  inputSchema?: SchemaDefinition
  /** Output schema for validation */
  outputSchema?: SchemaDefinition
  /** Execution timeout in milliseconds */
  timeout?: number
  /** Created timestamp (Unix ms) */
  $createdAt?: number
  /** Updated timestamp (Unix ms) */
  $updatedAt?: number
}

// =============================================================================
// Create Options Types
// =============================================================================

/**
 * Options for creating a code function
 */
export interface CreateCodeFunctionOptions {
  name: string
  description?: string
  code: string
  runtime?: 'javascript' | 'typescript'
  inputSchema?: SchemaDefinition
  outputSchema?: SchemaDefinition
  timeout?: number
}

/**
 * Options for creating a generative function
 */
export interface CreateGenerativeFunctionOptions {
  name: string
  description?: string
  model: string
  prompt: string
  temperature?: number
  maxTokens?: number
  schema?: SchemaDefinition
  inputSchema?: SchemaDefinition
  outputSchema?: SchemaDefinition
  timeout?: number
}

/**
 * Options for creating an agentic function
 */
export interface CreateAgenticFunctionOptions {
  name: string
  description?: string
  agent: string
  goal: string
  tools?: string[]
  maxIterations?: number
  inputSchema?: SchemaDefinition
  outputSchema?: SchemaDefinition
  timeout?: number
}

/**
 * Options for creating a human function
 */
export interface CreateHumanFunctionOptions {
  name: string
  description?: string
  instructions: string
  assignee?: string
  timeout?: number
  inputSchema?: SchemaDefinition
  outputSchema?: SchemaDefinition
}

// =============================================================================
// Internal Base Entity Type
// =============================================================================

interface FunctionBaseEntity {
  id: string
  $id: string
  $type: 'Function'
  functionType: FunctionType
  name: string
  description?: string
  config: FunctionConfig
  inputSchema?: SchemaDefinition
  outputSchema?: SchemaDefinition
  timeout?: number
  createdAt?: number
  updatedAt?: number
  $createdAt?: number
  $updatedAt?: number
}

// =============================================================================
// Collection Implementation
// =============================================================================

/**
 * FunctionCollection - manages function entities
 *
 * @extends BaseCollection<FunctionBaseEntity>
 */
export class FunctionCollection extends BaseCollection<FunctionBaseEntity> {
  constructor(storage: DOStorage) {
    super(storage, {
      name: 'functions',
      idPrefix: 'func',
    })
  }

  /**
   * Initialize the collection's database table
   * @internal
   */
  protected async initializeTable(): Promise<void> {
    // Not using SQL for this implementation - using KV storage
  }

  // ===========================================================================
  // Create Methods
  // ===========================================================================

  /**
   * Create a code function
   *
   * @param options - Code function configuration
   * @returns The created function entity
   * @throws {ValidationError} If required fields are missing
   */
  async createCode(options: CreateCodeFunctionOptions): Promise<FunctionEntity> {
    this.validateCodeOptions(options)

    const config: CodeFunctionConfig = {
      type: 'code',
      code: options.code,
      runtime: options.runtime ?? 'javascript',
    }

    return this.createFunction('code', options, config)
  }

  /**
   * Create a generative (AI model) function
   *
   * @param options - Generative function configuration
   * @returns The created function entity
   * @throws {ValidationError} If required fields are missing
   */
  async createGenerative(options: CreateGenerativeFunctionOptions): Promise<FunctionEntity> {
    this.validateGenerativeOptions(options)

    const config: GenerativeFunctionConfig = {
      type: 'generative',
      model: options.model,
      prompt: options.prompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      schema: options.schema,
    }

    return this.createFunction('generative', options, config)
  }

  /**
   * Create an agentic function
   *
   * @param options - Agentic function configuration
   * @returns The created function entity
   * @throws {ValidationError} If required fields are missing
   */
  async createAgentic(options: CreateAgenticFunctionOptions): Promise<FunctionEntity> {
    this.validateAgenticOptions(options)

    const config: AgenticFunctionConfig = {
      type: 'agentic',
      agent: options.agent,
      goal: options.goal,
      tools: options.tools,
      maxIterations: options.maxIterations,
    }

    return this.createFunction('agentic', options, config)
  }

  /**
   * Create a human-in-the-loop function
   *
   * @param options - Human function configuration
   * @returns The created function entity
   * @throws {ValidationError} If required fields are missing
   */
  async createHuman(options: CreateHumanFunctionOptions): Promise<FunctionEntity> {
    this.validateHumanOptions(options)

    const config: HumanFunctionConfig = {
      type: 'human',
      instructions: options.instructions,
      assignee: options.assignee,
      timeout: options.timeout,
    }

    return this.createFunction('human', options, config)
  }

  /**
   * Internal method to create a function entity
   */
  private async createFunction(
    functionType: FunctionType,
    options: { name: string; description?: string; inputSchema?: SchemaDefinition; outputSchema?: SchemaDefinition; timeout?: number },
    config: FunctionConfig
  ): Promise<FunctionEntity> {
    const id = this.generateId()
    const timestamp = this.now()

    const entity: FunctionBaseEntity = {
      id,
      $id: id,
      $type: 'Function',
      functionType,
      name: options.name,
      description: options.description,
      config,
      inputSchema: options.inputSchema,
      outputSchema: options.outputSchema,
      timeout: options.timeout,
      createdAt: timestamp,
      updatedAt: timestamp,
      $createdAt: timestamp,
      $updatedAt: timestamp,
    }

    const key = `${this.config.name}:${id}`
    await this.storage.put(key, entity)

    return this.toFunctionEntity(entity)
  }

  // ===========================================================================
  // Read Methods
  // ===========================================================================

  /**
   * Get a function by ID
   *
   * @param id - Function ID
   * @returns The function entity or null if not found
   */
  async get(id: string): Promise<FunctionEntity | null> {
    if (!id) return null
    const entity = await super.get(id)
    return entity ? this.toFunctionEntity(entity) : null
  }

  /**
   * Find functions by type
   *
   * @param type - Function type to filter by
   * @returns Array of matching function entities
   */
  async findByType(type: FunctionType): Promise<FunctionEntity[]> {
    const entities = await this.find({
      field: 'functionType',
      op: 'eq',
      value: type,
    })
    return entities.map((e) => this.toFunctionEntity(e))
  }

  /**
   * Find a function by name
   *
   * @param name - Function name to search for
   * @returns The function entity or null if not found
   */
  async findByName(name: string): Promise<FunctionEntity | null> {
    const entities = await this.find({
      field: 'name',
      op: 'eq',
      value: name,
    })
    return entities.length > 0 ? this.toFunctionEntity(entities[0]) : null
  }

  /**
   * List functions with pagination
   *
   * @param options - List options
   * @returns Paginated list result
   */
  async list(options: ListOptions = {}): Promise<ListResult<FunctionEntity>> {
    const result = await super.list(options)
    return {
      ...result,
      items: result.items.map((e) => this.toFunctionEntity(e)),
    }
  }

  /**
   * Find functions matching a filter
   *
   * @param filter - Filter expression
   * @returns Array of matching function entities
   */
  async find(filter: FilterExpression): Promise<FunctionEntity[]> {
    const entities = await super.find(filter)
    return entities.map((e) => this.toFunctionEntity(e))
  }

  // ===========================================================================
  // Update Methods
  // ===========================================================================

  /**
   * Update a function's metadata (name, description, schemas)
   *
   * @param id - Function ID
   * @param data - Partial update data
   * @returns The updated function entity
   * @throws {NotFoundError} If function not found
   */
  async update(
    id: string,
    data: Partial<Pick<FunctionEntity, 'name' | 'description' | 'inputSchema' | 'outputSchema' | 'timeout'>>
  ): Promise<FunctionEntity> {
    const timestamp = this.now()
    const updateData = {
      ...data,
      $updatedAt: timestamp,
    } as Partial<FunctionBaseEntity>
    const entity = await super.update(id, updateData)
    return this.toFunctionEntity(entity)
  }

  /**
   * Update a function's configuration
   *
   * @param id - Function ID
   * @param config - New configuration
   * @returns The updated function entity
   * @throws {NotFoundError} If function not found
   */
  async updateConfig(id: string, config: FunctionConfig): Promise<FunctionEntity> {
    const timestamp = this.now()
    const entity = await super.update(id, { config, $updatedAt: timestamp })
    return this.toFunctionEntity(entity)
  }

  // ===========================================================================
  // Delete Method
  // ===========================================================================

  /**
   * Delete a function
   *
   * @param id - Function ID
   */
  async delete(id: string): Promise<void> {
    await super.delete(id)
  }

  // ===========================================================================
  // Count Methods
  // ===========================================================================

  /**
   * Count all functions
   *
   * @returns Total count of functions
   */
  async count(): Promise<number> {
    return super.count()
  }

  /**
   * Count functions by type
   *
   * @returns Object with counts per function type
   */
  async countByType(): Promise<Record<FunctionType, number>> {
    const allItems = await this.list({ limit: 10000 })

    const counts: Record<FunctionType, number> = {
      code: 0,
      generative: 0,
      agentic: 0,
      human: 0,
    }

    for (const item of allItems.items) {
      counts[item.functionType]++
    }

    return counts
  }

  // ===========================================================================
  // Execute Method (Signature Only)
  // ===========================================================================

  /**
   * Execute a function
   *
   * @param id - Function ID
   * @param input - Input data for the function
   * @returns Promise resolving to the function output
   *
   * @description
   * This is a signature-only method. Actual implementation is in execution.ts.
   * The execute method accepts the function ID and input, then routes to the
   * appropriate executor based on function type.
   */
  async execute(id: string, input: unknown): Promise<unknown> {
    // Signature only - actual implementation in execution.ts
    // This returns a promise to satisfy the interface
    return Promise.resolve({ functionId: id, input, status: 'not_implemented' })
  }

  // ===========================================================================
  // Validation Methods
  // ===========================================================================

  private validateCodeOptions(options: CreateCodeFunctionOptions): void {
    if (!options.name || options.name.trim() === '') {
      throw new ValidationError('name is required')
    }
    if (!options.code || options.code.trim() === '') {
      throw new ValidationError('code is required')
    }
  }

  private validateGenerativeOptions(options: CreateGenerativeFunctionOptions): void {
    if (!options.name || options.name.trim() === '') {
      throw new ValidationError('name is required')
    }
    if (!options.model || options.model.trim() === '') {
      throw new ValidationError('model is required')
    }
    if (!options.prompt || options.prompt.trim() === '') {
      throw new ValidationError('prompt is required')
    }
  }

  private validateAgenticOptions(options: CreateAgenticFunctionOptions): void {
    if (!options.name || options.name.trim() === '') {
      throw new ValidationError('name is required')
    }
    if (!options.agent || options.agent.trim() === '') {
      throw new ValidationError('agent is required')
    }
    if (!options.goal || options.goal.trim() === '') {
      throw new ValidationError('goal is required')
    }
  }

  private validateHumanOptions(options: CreateHumanFunctionOptions): void {
    if (!options.name || options.name.trim() === '') {
      throw new ValidationError('name is required')
    }
    if (!options.instructions || options.instructions.trim() === '') {
      throw new ValidationError('instructions is required')
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Convert internal entity to FunctionEntity
   */
  private toFunctionEntity(entity: FunctionBaseEntity): FunctionEntity {
    const id = entity.$id || entity.id
    return {
      id,
      $id: id,
      $type: 'Function',
      functionType: entity.functionType,
      name: entity.name,
      description: entity.description,
      config: entity.config,
      inputSchema: entity.inputSchema,
      outputSchema: entity.outputSchema,
      timeout: entity.timeout,
      $createdAt: entity.$createdAt || entity.createdAt,
      $updatedAt: entity.$updatedAt || entity.updatedAt,
    }
  }
}

export default FunctionCollection
