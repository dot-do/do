/**
 * Functions as Data - Store, version, and execute functions via RPC
 *
 * Two function types discriminated by $type:
 *
 * CodeFunction - executable code via ai-evaluate sandbox
 *   $.fizzBuzz = (n) => n % 15 === 0 ? 'FizzBuzz' : n
 *   $.double = { module: 'exports.default = n => n * 2', tests: 'it("works", () => expect(exports.default(2)).toBe(4))' }
 *
 * GenerativeFunction - AI generation via MDX prompt template
 *   $.summarize = 'Summarize {text} in {style} style'
 *   $.summarize = {
 *     $type: 'GenerativeFunction',
 *     mdx: 'Summarize {text} in {style} style',
 *     schema: { summary: 'A concise summary', keyPoints: ['Key takeaways'] }
 *   }
 */

import type { CDCEmitter } from './cdc.js'
import type { Collection } from '@dotdo/collections'

/**
 * Base fields shared by all function types
 */
export interface FunctionBase {
  id: string
  name: string
  version: number
  description?: string
  createdAt: string
  updatedAt: string
}

/**
 * CodeFunction - executable code via ai-evaluate
 *
 * Matches ai-evaluate's EvaluateOptions structure:
 * - module: Code with CommonJS exports
 * - tests: vitest-style tests (describe, it, expect)
 * - script: Script to run with module exports in scope
 * - types: TypeScript type definitions (for documentation)
 */
export interface CodeFunction extends FunctionBase, Record<string, unknown> {
  $type: 'CodeFunction'
  module: string              // Code with exports: exports.run = (n) => n * 2
  tests?: string              // vitest-style: it('doubles', () => expect(run(2)).toBe(4))
  script?: string             // Script to execute with module in scope
  types?: string              // TypeScript definitions for documentation
  imports?: string[]          // External dependencies: ['lodash', 'dayjs']
}

/**
 * GenerativeFunction - AI generation via MDX prompt template
 *
 * Uses MDX syntax for prompts (aligns with MDXLD paradigm):
 * - {varName} for variable interpolation (args spread into scope)
 * - Full MDX power: conditionals, mapping, components
 *
 * Schema uses description-first syntax (90% are strings):
 * - 'A description of this field' → string
 * - 'Score from 0 to 1 (number)' → number
 * - 'Created date (date)' → date string
 * - 'tech | business | science' → enum
 * - ['List of items'] → array of strings
 */
export interface GenerativeFunction extends FunctionBase, Record<string, unknown> {
  $type: 'GenerativeFunction'
  mdx: string                 // MDX prompt: "Summarize {text} in {style} style"
  schema?: Record<string, unknown>  // Output schema in description-first syntax
  model?: 'best' | 'fast' | 'cost' | 'reasoning'
  args?: Record<string, string>     // Argument descriptions for documentation
}

/**
 * AgenticFunction - autonomous agent with tools
 */
export interface AgenticFunction extends FunctionBase, Record<string, unknown> {
  $type: 'AgenticFunction'
  mdx: string                 // System prompt in MDX
  tools?: string[]            // Tool names available to agent
  maxIterations?: number      // Max agent loop iterations
  model?: 'best' | 'fast' | 'cost' | 'reasoning'
}

/**
 * HumanFunction - requires human input/approval
 */
export interface HumanFunction extends FunctionBase, Record<string, unknown> {
  $type: 'HumanFunction'
  mdx: string                 // Prompt/instructions for human
  channel: 'email' | 'slack' | 'web' | 'sms' | 'phone'
  schema?: Record<string, unknown>  // Expected response schema
}

/**
 * Union of all function types - discriminated by $type
 * Intersection with Record<string, unknown> for collection compatibility
 */
export type StoredFunction = (CodeFunction | GenerativeFunction | AgenticFunction | HumanFunction) & Record<string, unknown>

/**
 * Legacy interface for backwards compatibility
 * @deprecated Use CodeFunction | GenerativeFunction instead
 */
export interface LegacyStoredFunction extends Record<string, unknown> {
  id: string
  name: string
  code: string
  version: number
  tier: 'code' | 'generative' | 'agentic' | 'human'
  args?: Record<string, string>
  returns?: string
  description?: string
  createdAt: string
  updatedAt: string
}

/**
 * Evaluator for CodeFunction execution (ai-evaluate)
 */
export interface CodeEvaluator {
  (options: { module?: string; script?: string; tests?: string; imports?: string[] }): Promise<{
    success: boolean
    value?: unknown
    error?: string
    testResults?: { passed: number; failed: number; tests: unknown[] }
  }>
}

/**
 * Generator for GenerativeFunction execution (ai-gateway)
 */
export interface AIGenerator {
  (options: { prompt: string; schema?: Record<string, unknown>; model?: string }): Promise<{
    value: unknown
    tokens?: { input: number; output: number }
  }>
}

export interface FunctionRegistryOptions {
  collection: Collection<StoredFunction>
  cdc: CDCEmitter
  evaluate?: CodeEvaluator
  generate?: AIGenerator
}

/**
 * Input type for defining a CodeFunction (user-provided fields only)
 */
export interface CodeFunctionInput {
  module: string
  tests?: string
  script?: string
  types?: string
  imports?: string[]
  description?: string
}

/**
 * Input type for defining a GenerativeFunction (user-provided fields only)
 */
export interface GenerativeFunctionInput {
  mdx: string
  schema?: Record<string, unknown>
  model?: 'best' | 'fast' | 'cost' | 'reasoning'
  args?: Record<string, string>
  description?: string
}

/**
 * Create a function registry that stores functions as data
 */
export function createFunctionRegistry(options: FunctionRegistryOptions) {
  const { collection, cdc } = options
  let evaluate = options.evaluate
  let generate = options.generate

  /**
   * Define a CodeFunction from a JavaScript Function object
   */
  function defineCode(name: string, fn: Function, metadata?: Partial<CodeFunction>): CodeFunction {
    const code = fn.toString()
    // Convert arrow/function to module export
    const module = code.startsWith('function') || code.startsWith('(') || code.startsWith('async')
      ? `exports.default = ${code}`
      : `exports.default = ${code}`

    return defineCodeFunction(name, { module, ...metadata })
  }

  /**
   * Define a CodeFunction from module/tests/script
   */
  function defineCodeFunction(name: string, def: CodeFunctionInput): CodeFunction {
    const existing = collection.get(name)
    const version = existing ? existing.version + 1 : 1
    const now = new Date().toISOString()

    const stored: CodeFunction = {
      $type: 'CodeFunction',
      id: name,
      name,
      version,
      module: def.module,
      tests: def.tests,
      script: def.script,
      types: def.types,
      imports: def.imports,
      description: def.description,
      createdAt: (existing as FunctionBase)?.createdAt || now,
      updatedAt: now,
    }

    collection.put(name, stored)
    emitFunctionEvent(stored, existing)
    return stored
  }

  /**
   * Define a GenerativeFunction from MDX prompt template
   */
  function defineGenerative(name: string, def: GenerativeFunctionInput): GenerativeFunction {
    const existing = collection.get(name)
    const version = existing ? existing.version + 1 : 1
    const now = new Date().toISOString()

    const stored: GenerativeFunction = {
      $type: 'GenerativeFunction',
      id: name,
      name,
      version,
      mdx: def.mdx,
      schema: def.schema,
      model: def.model,
      args: def.args,
      description: def.description,
      createdAt: (existing as FunctionBase)?.createdAt || now,
      updatedAt: now,
    }

    collection.put(name, stored)
    emitFunctionEvent(stored, existing)
    return stored
  }

  /**
   * Define any function type from an object with $type
   */
  function defineFromObject(name: string, def: Record<string, unknown>): StoredFunction {
    const $type = def.$type as string

    if ($type === 'GenerativeFunction') {
      return defineGenerative(name, def as unknown as GenerativeFunctionInput)
    }

    if ($type === 'AgenticFunction' || $type === 'HumanFunction') {
      // Handle other types similarly
      const existing = collection.get(name)
      const version = existing ? existing.version + 1 : 1
      const now = new Date().toISOString()

      const stored = {
        ...def,
        $type,
        id: name,
        name,
        version,
        createdAt: (existing as FunctionBase)?.createdAt || now,
        updatedAt: now,
      } as StoredFunction

      collection.put(name, stored)
      emitFunctionEvent(stored, existing)
      return stored
    }

    // Default to CodeFunction if $type not specified but has module
    if (def.module) {
      return defineCodeFunction(name, def as unknown as CodeFunctionInput)
    }

    throw new Error(`Invalid function definition: must have $type or module`)
  }

  /**
   * Emit CDC event for function creation/update
   */
  function emitFunctionEvent(stored: StoredFunction, existing: StoredFunction | null): void {
    cdc.emit('Function', existing ? 'updated' : 'created', {
      name: stored.name,
      version: stored.version,
      $type: stored.$type,
    }, {
      subject_type: stored.$type,
      predicate_type: existing ? 'update' : 'define',
      metadata: {
        previousVersion: existing?.version,
      },
    })
  }

  /**
   * Legacy: Define from code string (converts to CodeFunction)
   * @deprecated Use defineCode or defineCodeFunction instead
   */
  function defineFromCode(name: string, code: string, metadata?: Partial<LegacyStoredFunction>): StoredFunction {
    // Pass through the code - executeCode handles format conversion
    return defineCodeFunction(name, { module: code, description: metadata?.description })
  }

  /**
   * Get a function definition
   */
  function get(name: string): StoredFunction | null {
    return collection.get(name)
  }

  /**
   * Execute a stored function with arguments
   * Routes to appropriate executor based on $type
   */
  async function execute(name: string, args: unknown[]): Promise<unknown> {
    const fn = collection.get(name)
    if (!fn) {
      throw new Error(`Function '${name}' not found`)
    }

    const startTime = Date.now()

    try {
      let result: unknown

      // Route based on $type
      if (fn.$type === 'CodeFunction') {
        result = await executeCode(fn as CodeFunction, args)
      } else if (fn.$type === 'GenerativeFunction') {
        result = await executeGenerative(fn as GenerativeFunction, args)
      } else if (fn.$type === 'AgenticFunction') {
        throw new Error('AgenticFunction execution not yet implemented')
      } else if (fn.$type === 'HumanFunction') {
        throw new Error('HumanFunction execution not yet implemented')
      } else {
        // Legacy fallback - treat as code
        result = await executeCode(fn as unknown as CodeFunction, args)
      }

      const duration = Date.now() - startTime

      // Emit execution event
      cdc.emit('Function', 'executed', {
        name,
        version: fn.version,
        $type: fn.$type,
        args,
        result,
        duration,
        success: true,
      }, {
        subject_type: fn.$type,
        predicate_type: 'execute',
      })

      return result
    } catch (error) {
      const duration = Date.now() - startTime

      // Emit failed execution event
      cdc.emit('Function', 'failed', {
        name,
        version: fn.version,
        $type: fn.$type,
        args,
        error: error instanceof Error ? error.message : String(error),
        duration,
        success: false,
      }, {
        subject_type: fn.$type,
        predicate_type: 'execute',
      })

      throw error
    }
  }

  /**
   * Execute a CodeFunction via ai-evaluate
   */
  async function executeCode(fn: CodeFunction, args: unknown[]): Promise<unknown> {
    if (!evaluate) {
      return {
        _execute: true,
        name: fn.name,
        $type: 'CodeFunction',
        module: fn.module,
        args,
        message: 'No evaluator configured. Use ai-evaluate service binding for execution.',
      }
    }

    // Handle different module formats:
    // 1. Already ES module: "export const fn = ..." or "export default ..."
    // 2. Legacy CommonJS: "exports.default = ..."
    // 3. Raw function: "(a, b) => a * b" or "function(a, b) { ... }"
    let module: string
    let fnCode = fn.module

    if (fnCode.startsWith('export ')) {
      // Already ES module format - use as-is but ensure we have a named export to call
      if (fnCode.includes('export default')) {
        module = fnCode.replace('export default', 'export const fn =')
      } else {
        module = fnCode
      }
    } else if (fnCode.startsWith('exports.default = ')) {
      // Legacy CommonJS format - extract the function
      fnCode = fnCode.slice('exports.default = '.length)
      module = `export const fn = ${fnCode}`
    } else {
      // Raw function expression
      module = `export const fn = ${fnCode}`
    }

    // Script calls the named export with args
    const argsJson = args.map((a) => JSON.stringify(a)).join(', ')
    const script = `return fn(${argsJson})`

    const result = await evaluate({
      module,
      script,
      imports: fn.imports,
    })

    if (!result.success) {
      throw new Error(result.error || 'Code execution failed')
    }

    return result.value
  }

  /**
   * Execute a GenerativeFunction via AI
   * Renders MDX template with props, then generates structured output
   */
  async function executeGenerative(fn: GenerativeFunction, args: unknown[]): Promise<unknown> {
    if (!generate) {
      return {
        _generate: true,
        name: fn.name,
        $type: 'GenerativeFunction',
        mdx: fn.mdx,
        args,
        message: 'No AI generator configured. Use ai-gateway service binding for generation.',
      }
    }

    // Build props from args using arg names
    const argNames = Object.keys(fn.args || {})
    const props: Record<string, unknown> = {}
    argNames.forEach((name, i) => {
      props[name] = args[i]
    })

    // Render MDX template with props
    // For now, simple {props.x} replacement - full MDX rendering via ai-evaluate later
    const prompt = renderMdxTemplate(fn.mdx, props)

    // Emit generation started event
    cdc.emit('Generation', 'started', {
      function: fn.name,
      version: fn.version,
      model: fn.model,
      prompt,
    }, {
      subject_type: 'GenerativeFunction',
      predicate_type: 'generate',
    })

    const result = await generate({
      prompt,
      schema: fn.schema,
      model: fn.model,
    })

    // Emit generation completed event
    cdc.emit('Generation', 'completed', {
      function: fn.name,
      version: fn.version,
      tokens: result.tokens,
    }, {
      subject_type: 'GenerativeFunction',
      predicate_type: 'generate',
    })

    return result.value
  }

  /**
   * Render MDX template with variables spread into scope
   * Simple implementation - replace {varName} with values
   * Full MDX rendering can use ai-evaluate for secure execution
   */
  function renderMdxTemplate(mdx: string, scope: Record<string, unknown>): string {
    return mdx.replace(/\{(\w+)\}/g, (match, key) => {
      const value = scope[key]
      if (value === undefined) return match
      // Convert objects to YAML-like format for readability in prompts
      if (typeof value === 'object' && value !== null) {
        return JSON.stringify(value, null, 2)
      }
      return String(value)
    })
  }

  /**
   * Delete a function
   */
  function remove(name: string): boolean {
    const existing = collection.get(name)
    if (!existing) return false

    collection.delete(name)

    cdc.emit('Function', 'deleted', {
      name,
      version: existing.version,
    }, {
      subject_type: 'Function',
      predicate_type: 'delete',
    })

    return true
  }

  /**
   * List all functions
   */
  function list(): StoredFunction[] {
    return collection.list()
  }

  /**
   * Get function history (all versions) - requires CDC query
   */
  function history(name: string): StoredFunction | null {
    // Current version only - full history available via CDC events
    return collection.get(name)
  }

  /**
   * Create a proxy that allows $.fnName = fn syntax
   *
   * Supports multiple assignment patterns:
   *   $.fizzBuzz = (n) => n % 15 === 0 ? 'FizzBuzz' : n   // CodeFunction from arrow
   *   $.fizzBuzz = function(n) { return n * 2 }          // CodeFunction from function
   *   $.fizzBuzz = { module: 'exports.default = ...', tests: '...' }  // CodeFunction explicit
   *   $.summarize = { $type: 'GenerativeFunction', mdx: '...', schema: {...} }  // GenerativeFunction
   */
  function createProxy(): Record<string, unknown> {
    return new Proxy({} as Record<string, unknown>, {
      get(target, prop: string) {
        // Internal access
        if (prop === '_registry') return {
          defineCode,
          defineCodeFunction,
          defineGenerative,
          defineFromObject,
          get,
          execute,
          remove,
          list,
          history,
        }
        if (prop === '_functions') return collection

        // Return a callable that executes the function
        const fn = collection.get(prop)
        if (fn) {
          const callable = async (...args: unknown[]) => execute(prop, args)
          // Attach function metadata for inspection
          Object.assign(callable, { _fn: fn })
          return callable
        }

        return undefined
      },

      set(target, prop: string, value: unknown) {
        // Function object → CodeFunction
        if (typeof value === 'function') {
          defineCode(prop, value as Function)
          return true
        }

        // Object with $type or module → appropriate function type
        if (typeof value === 'object' && value !== null) {
          defineFromObject(prop, value as Record<string, unknown>)
          return true
        }

        // String → treat as MDX prompt for GenerativeFunction
        if (typeof value === 'string') {
          defineGenerative(prop, { mdx: value })
          return true
        }

        return false
      },

      has(target, prop: string) {
        return collection.get(prop) !== null
      },

      ownKeys() {
        return collection.keys()
      },

      getOwnPropertyDescriptor(target, prop: string) {
        const fn = collection.get(prop)
        if (fn) {
          return { configurable: true, enumerable: true, value: fn }
        }
        return undefined
      },
    })
  }

  /**
   * Set the code evaluator (ai-evaluate service binding)
   */
  function setEvaluator(fn: CodeEvaluator): void {
    evaluate = fn
  }

  /**
   * Set the AI generator (ai-gateway service binding)
   */
  function setGenerator(fn: AIGenerator): void {
    generate = fn
  }

  return {
    // New typed methods
    defineCode,
    defineCodeFunction,
    defineGenerative,
    defineFromObject,
    // Legacy
    defineFromCode,
    // Core
    get,
    execute,
    remove,
    list,
    history,
    createProxy,
    setEvaluator,
    setGenerator,
  }
}

export type FunctionRegistry = ReturnType<typeof createFunctionRegistry>

/**
 * Type guard for CodeFunction
 */
export function isCodeFunction(fn: StoredFunction): fn is CodeFunction {
  return fn.$type === 'CodeFunction'
}

/**
 * Type guard for GenerativeFunction
 */
export function isGenerativeFunction(fn: StoredFunction): fn is GenerativeFunction {
  return fn.$type === 'GenerativeFunction'
}

/**
 * Type guard for AgenticFunction
 */
export function isAgenticFunction(fn: StoredFunction): fn is AgenticFunction {
  return fn.$type === 'AgenticFunction'
}

/**
 * Type guard for HumanFunction
 */
export function isHumanFunction(fn: StoredFunction): fn is HumanFunction {
  return fn.$type === 'HumanFunction'
}
