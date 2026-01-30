/**
 * DigitalObject - Every entity IS a Durable Object
 *
 * Extends DurableRPC with:
 * - $id (this DO's URL)
 * - $context (parent DO's URL)
 * - rels (relationships)
 * - collections (with CDC)
 * - Events pipeline
 */

import { DurableRPC } from './durable-rpc.js'
import { createCollection, type Collection, type Filter, type QueryOptions } from '@dotdo/collections'
import { createRels, type Relationship, type ExpandOptions } from './rels.js'
import { createCDC, type CDCEmitter } from './cdc.js'
import { createFunctionRegistry, type StoredFunction, type FunctionRegistry, type CodeFunction, type GenerativeFunction } from './functions.js'

export { type Relationship, type ExpandOptions } from './rels.js'
export { type CDCEvent, type SemanticEvent } from './cdc.js'
export { type StoredFunction, type FunctionRegistry, type CodeFunction, type GenerativeFunction } from './functions.js'
export { DO, DigitalObjectDefinition, type DODefinition, type DOContext, type DOInstance, type InferSchema } from './do.js'

/**
 * QueryBuilder - chainable query interface for collections
 * Supports: .find({filter}).limit(n).skip(n).sort('field')
 */
class QueryBuilder<T extends Record<string, unknown>> {
  private _filter: Filter<T> = {}
  private _options: QueryOptions = {}

  constructor(private collection: Collection<T>, filter?: Filter<T>) {
    if (filter) this._filter = filter
  }

  limit(n: number): this {
    this._options.limit = n
    return this
  }

  skip(n: number): this {
    this._options.offset = n
    return this
  }

  offset(n: number): this {
    this._options.offset = n
    return this
  }

  sort(field: string): this {
    this._options.sort = field
    return this
  }

  // Terminal methods
  exec(): T[] {
    return this.collection.find(this._filter, this._options)
  }

  toArray(): T[] {
    return this.exec()
  }

  count(): number {
    return this.collection.count(this._filter)
  }

  first(): T | null {
    const results = this.collection.find(this._filter, { ...this._options, limit: 1 })
    return results[0] ?? null
  }

  // Make it thenable so await works
  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected)
  }
}

/**
 * ChainableCollection - wraps Collection with chainable query builder
 * Supports expanding relationships when fetching documents
 */
class ChainableCollection<T extends Record<string, unknown>> {
  constructor(
    private collection: Collection<T>,
    private cdc?: CDCEmitter,
    private name?: string,
    private rels?: ReturnType<typeof createRels>,
    private getCollection?: (name: string) => Collection<any>
  ) {}

  /**
   * Get a document by ID, optionally expanding relationships
   * @param id Document ID
   * @param options.include Outgoing relationship predicates to include
   * @param options.refs Incoming reference predicates to include
   * @param options.expand If true, fetch full related objects (default: just IDs)
   */
  get(id: string, options?: ExpandOptions): (T & Record<string, unknown>) | null {
    const doc = this.collection.get(id)
    if (!doc) return null
    if (!options || !this.rels) return doc as T & Record<string, unknown>

    const result: Record<string, unknown> = { ...doc }

    // Expand outgoing relationships
    if (options.include?.length) {
      const rels = this.rels.getRelationshipsByPredicate(id, options.include)
      for (const [predicate, targetIds] of Object.entries(rels)) {
        if (options.expand && this.getCollection) {
          // Fetch full objects
          result[predicate] = targetIds.map((tid) => this.getCollection!(this.name!).get(tid)).filter(Boolean)
        } else {
          // Just IDs
          result[predicate] = targetIds
        }
      }
    }

    // Expand incoming references
    if (options.refs?.length) {
      const refs = this.rels.getReferencesByPredicate(id, options.refs)
      for (const [key, sourceIds] of Object.entries(refs)) {
        if (options.expand && this.getCollection) {
          result[key] = sourceIds.map((sid) => this.getCollection!(this.name!).get(sid)).filter(Boolean)
        } else {
          result[key] = sourceIds
        }
      }
    }

    return result as T & Record<string, unknown>
  }

  has(id: string): boolean {
    return this.collection.has(id)
  }

  put(id: string, data: T): void {
    const existed = this.collection.has(id)
    this.collection.put(id, data)
    this.cdc?.emit('Document', existed ? 'updated' : 'created', {
      collection: this.name,
      key: id,
      value: data,
    }, {
      subject_type: this.name,
      predicate_type: 'put',
    })
  }

  delete(id: string): boolean {
    const result = this.collection.delete(id)
    if (result) {
      this.cdc?.emit('Document', 'deleted', {
        collection: this.name,
        key: id,
      }, {
        subject_type: this.name,
        predicate_type: 'delete',
      })
    }
    return result
  }

  clear(): number {
    return this.collection.clear()
  }

  keys(): string[] {
    return this.collection.keys()
  }

  count(filter?: Filter<T>): number {
    return this.collection.count(filter)
  }

  list(options?: QueryOptions): T[] {
    return this.collection.list(options)
  }

  // Chainable find - returns QueryBuilder
  find(filter?: Filter<T>): QueryBuilder<T> {
    return new QueryBuilder(this.collection, filter)
  }

  // Direct find for simple cases
  findAll(filter?: Filter<T>, options?: QueryOptions): T[] {
    return this.collection.find(filter, options)
  }
}

/**
 * RPC interface for ai-evaluate service
 */
interface EvalService {
  fetch(url: string, init?: RequestInit): Promise<Response>
  ping(): Promise<{ pong: boolean; time: number }>
  evaluate(options: {
    module?: string
    script?: string
    tests?: string
    imports?: string[]
  }): Promise<{
    success: boolean
    value?: unknown
    error?: string
    logs?: unknown[]
    duration?: number
    testResults?: { passed: number; failed: number; tests: unknown[] }
  }>
}

/**
 * Cloudflare Workers AI binding (direct CF model access)
 */
interface WorkersAI {
  run(
    model: string,
    options: {
      prompt?: string
      messages?: Array<{ role: string; content: string }>
      max_tokens?: number
      temperature?: number
      stream?: boolean
    }
  ): Promise<{
    response?: string
    tool_calls?: unknown[]
  }>
}

/**
 * RPC interface for dotdo-ai service (OpenAI, Anthropic, Google, etc.)
 */
interface AIService {
  fetch(url: string, init?: RequestInit): Promise<Response>
}

interface Env extends Record<string, unknown> {
  EVENTS_PIPELINE?: unknown
  EVAL?: EvalService
  AI?: WorkersAI    // Workers AI binding (CF models)
  ai?: AIService    // dotdo-ai service binding (frontier models)
}

export class DigitalObject extends DurableRPC {
  /** Unique identifier URL for this Digital Object */
  $id: string = ''

  /** Type of this Digital Object */
  $type: string = 'DigitalObject'

  /** Parent context URL (for CDC event bubbling) */
  $context: string = ''

  private _rels!: ReturnType<typeof createRels>
  private _cdc!: CDCEmitter
  private _env!: Env
  private _collections = new Map<string, ChainableCollection<any>>()
  private _functionRegistry!: FunctionRegistry
  private _$!: Record<string, unknown>

  constructor(state: DurableObjectState, env: Env) {
    super(state, env)
    this._env = env
    this._rels = createRels(this.sql)
  }

  override async fetch(request: Request): Promise<Response> {
    // Set identity from request
    const url = new URL(request.url)
    this.$id = url.origin + (url.pathname !== '/' ? url.pathname.split('/').slice(0, 2).join('/') : '')
    this.$context = request.headers.get('X-DO-Context') || ''

    // Initialize events emitter with identity
    this._cdc = createCDC(this.$id, this.$context, this._env.EVENTS_PIPELINE)

    // Extract actor and request ID for CDC correlation
    const actor =
      request.headers.get('X-User-ID') ||
      request.headers.get('X-Agent-ID') ||
      (request.headers.get('CF-Connecting-IP') ? `ip:${request.headers.get('CF-Connecting-IP')}` : undefined)

    const requestId =
      request.headers.get('CF-Ray') || request.headers.get('X-Request-ID') || undefined

    this._cdc.setContext({ actor, requestId })

    // Initialize function registry with CDC
    if (!this._functionRegistry) {
      const functionsCollection = createCollection<StoredFunction>(this.sql, '_functions')
      this._functionRegistry = createFunctionRegistry({
        collection: functionsCollection,
        cdc: this._cdc,
        // Evaluator is set dynamically per-request below
      })
      this._$ = this._functionRegistry.createProxy()
    }

    // Set evaluator for this request (uses EVAL service binding via HTTP fetch)
    if (this._env.EVAL) {
      const evalService = this._env.EVAL
      this._functionRegistry.setEvaluator(async (options) => {
        try {
          const response = await evalService.fetch('https://evaluate.do/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: options.script || '',
              options: {
                module: options.module,
                imports: options.imports,
              },
            }),
          })
          return (await response.json()) as { success: boolean; value?: unknown; error?: string; logs?: unknown[]; duration?: number }
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            logs: [],
            duration: 0,
          }
        }
      })
    }

    // Set generator for this request (uses dotdo-ai service binding)
    if (this._env.ai) {
      const aiService = this._env.ai
      this._functionRegistry.setGenerator(async (options) => {
        try {
          const response = await aiService.fetch('https://ai.do/$generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{
              prompt: options.prompt,
              schema: options.schema,
              // Default to Workers AI models (cf-*) until gateway keys are configured
              model: options.model || 'cf-fast',
            }]),
          })
          const result = await response.json() as { value: unknown; tokens?: { input: number; output: number } }
          return result
        } catch (error) {
          return {
            value: null,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      })
    } else {
      // Fallback: return placeholder if no AI service
      this._functionRegistry.setGenerator(async (options) => {
        return {
          value: { _noAiService: true, prompt: options.prompt },
        }
      })
    }

    return super.fetch(request)
  }

  /**
   * Function context - define and call functions as data
   * @example $.fizzBuzz = (n) => n % 15 === 0 ? 'FizzBuzz' : n
   * @example await $.fizzBuzz(15)
   */
  get $(): Record<string, unknown> {
    return this._$
  }

  // ========================================
  // Relationships API
  // ========================================

  /**
   * Create a relationship: from --[predicate]--> to
   * @example relate("alice", "follows", "bob", "followedBy")
   */
  relate(from: string, predicate: string, to: string, reverse?: string): Relationship {
    const rel = this._rels.add(from, predicate, to, reverse)
    this._cdc.emit('Relationship', 'created', {
      id: rel.id,
      from: rel.from,
      predicate: rel.predicate,
      to: rel.to,
      reverse: rel.reverse,
    }, {
      subject_type: 'Entity',
      predicate_type: predicate,
      object_type: 'Entity',
    })
    return rel
  }

  /**
   * Delete a relationship by ID
   * @example unrelate("alice:follows:bob")
   */
  unrelate(id: string): void {
    // Get relationship info before deleting for the event
    const parts = id.split(':')
    const predicate = parts.length >= 2 ? parts[1] : undefined
    this._rels.delete(id)
    this._cdc.emit('Relationship', 'deleted', {
      id,
    }, {
      predicate_type: predicate,
    })
  }

  /**
   * Get outgoing relationships FROM an entity
   * "What does this entity point to?"
   * @example relationships("alice") // all outgoing
   * @example relationships("alice", "follows") // just follows
   */
  relationships(id: string, predicate?: string): Relationship[] {
    return this._rels.relationships(id, predicate)
  }

  /**
   * Get incoming references TO an entity
   * "What points to this entity?"
   * @example references("bob") // all incoming
   * @example references("bob", "follows") // who follows bob
   */
  references(id: string, predicate?: string): Relationship[] {
    return this._rels.references(id, predicate)
  }

  // ========================================
  // Functions API - Functions as Data
  // ========================================

  /**
   * Define a CodeFunction from module/tests/script
   * @example defineCodeFunction("double", { module: "exports.default = n => n * 2", tests: "it('works', () => expect(double(2)).toBe(4))" })
   */
  defineCodeFunction(name: string, def: { module: string; tests?: string; script?: string; types?: string; imports?: string[]; description?: string }): CodeFunction {
    return this._functionRegistry.defineCodeFunction(name, def)
  }

  /**
   * Define a GenerativeFunction from MDX prompt template
   * @example defineGenerativeFunction("summarize", { mdx: "Summarize {props.text}", schema: { summary: "A concise summary" } })
   */
  defineGenerativeFunction(name: string, def: { mdx: string; schema?: Record<string, unknown>; model?: 'best' | 'fast' | 'cost' | 'reasoning'; args?: Record<string, string>; description?: string }): GenerativeFunction {
    return this._functionRegistry.defineGenerative(name, def)
  }

  /**
   * Define a function from code string (legacy, converts to CodeFunction)
   * @deprecated Use defineCodeFunction instead
   * @example defineFunction("fizzBuzz", "(n) => n % 15 === 0 ? 'FizzBuzz' : n")
   */
  defineFunction(name: string, code: string, metadata?: Partial<StoredFunction>): StoredFunction {
    return this._functionRegistry.defineFromCode(name, code, metadata)
  }

  /**
   * Get a function definition
   * @example getFunction("fizzBuzz")
   */
  getFunction(name: string): StoredFunction | null {
    return this._functionRegistry.get(name)
  }

  /**
   * Execute a stored function (routes based on $type)
   * @example callFunction("fizzBuzz", [15])
   * @example callFunction("summarize", [{ text: "...", style: "bullet" }])
   */
  async callFunction(name: string, args: unknown[] = []): Promise<unknown> {
    return this._functionRegistry.execute(name, args)
  }

  /**
   * Test EVAL RPC connection
   */
  async testEval(): Promise<unknown> {
    if (!this._env.EVAL) {
      return { error: 'EVAL binding not available' }
    }
    try {
      const pingResult = await this._env.EVAL.ping()
      return { ping: pingResult, status: 'connected' }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * Delete a function
   * @example deleteFunction("fizzBuzz")
   */
  deleteFunction(name: string): boolean {
    return this._functionRegistry.remove(name)
  }

  /**
   * List all functions
   * @example listFunctions()
   */
  listFunctions(): StoredFunction[] {
    return this._functionRegistry.list()
  }


  // ========================================
  // Collections API
  // ========================================

  /**
   * Get a collection with chainable query builder and relationship expansion
   * @example collection("users").get("alice", { include: ["follows"] })
   */
  collection<T extends Record<string, unknown> = Record<string, unknown>>(name: string): ChainableCollection<T> {
    if (!this._collections.has(name)) {
      const col = createCollection<T>(this.sql, name)
      const chainable = new ChainableCollection(
        col,
        this._cdc,
        name,
        this._rels,
        (n) => createCollection(this.sql, n)
      )
      this._collections.set(name, chainable)
    }
    return this._collections.get(name)! as ChainableCollection<T>
  }
}
