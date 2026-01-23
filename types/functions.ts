/**
 * Function Types - Fn<Out, In, Opts> Pattern
 *
 * From workers/types/fn.ts: Unified function types with three calling styles
 * 1. fn(input, opts?) - Direct call
 * 2. fn`${vals}` - Tagged template with interpolation
 * 3. fn`{name}`(params) - Tagged template with named params
 *
 * Generic order (most to least important):
 * - Out: Return type (like Promise<T>)
 * - In: Input type (void = no input, any = flexible)
 * - Opts: Options for behavior (model, timeout, etc.)
 */

// =============================================================================
// Parameter Extraction from Template Strings
// =============================================================================

/**
 * Extract {param} names from a template string at compile time
 *
 * @example
 * ```ts
 * type Params = ExtractParams<'SELECT * FROM {table} WHERE id = {id}'>
 * // => 'table' | 'id'
 * ```
 */
export type ExtractParams<S extends string> =
  S extends `${string}{${infer Param}}${infer Rest}`
    ? Param | ExtractParams<Rest>
    : never

/**
 * Check if a string contains any {param} placeholders
 */
export type HasNamedParams<S extends string> =
  S extends `${string}{${string}}${string}` ? true : false

/**
 * Get the parameter record type for a template string
 */
export type ParamsRecord<S extends string, TValue = unknown> =
  [ExtractParams<S>] extends [never]
    ? Record<string, never>
    : Record<ExtractParams<S>, TValue>

// =============================================================================
// Tagged Template Result Type
// =============================================================================

/**
 * Conditional result type for tagged template calls
 *
 * If template has {params}, returns a function accepting those params
 * Otherwise returns the result directly
 */
export type TaggedResult<TReturn, S extends string, TOpts = object> =
  [ExtractParams<S>] extends [never]
    ? TReturn
    : (params: Record<ExtractParams<S>, unknown> & Partial<TOpts>) => TReturn

// =============================================================================
// Core Function Type - Fn<Out, In, Opts>
// =============================================================================

/**
 * A callable supporting three invocation styles
 *
 * @typeParam Out - Return type (most important, like Promise<T>)
 * @typeParam In - Input type (default: any for flexible AI-style input)
 * @typeParam Opts - Options type (model, timeout, etc.)
 *
 * @example
 * ```ts
 * // AI function - flexible input, typed output and options
 * const ai: Fn<string, any, { model?: string; temperature?: number }>
 * ai("summarize this")
 * ai`Summarize ${text}`
 * ai`Summarize {content}`({ content: "...", model: "best" })
 * ```
 */
export interface Fn<Out, In = unknown, Opts extends Record<string, unknown> = Record<string, unknown>> {
  /** Style 1: Direct call with input and optional options */
  (input: In, opts?: Opts): Out

  /** Style 2: Tagged template with ${...} interpolation */
  (strings: TemplateStringsArray, ...values: unknown[]): Out

  /** Style 3: Tagged template with {name} placeholders */
  <S extends string>(
    strings: TemplateStringsArray & { raw: readonly S[] }
  ): TaggedResult<Out, S, Opts>
}

// =============================================================================
// Async Function Type - AsyncFn<Out, In, Opts>
// =============================================================================

/**
 * Async version of Fn - returns Promise<Out>
 */
export interface AsyncFn<Out, In = unknown, Opts extends Record<string, unknown> = Record<string, unknown>> {
  (input: In, opts?: Opts): Promise<Out>
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Out>
  <S extends string>(
    strings: TemplateStringsArray & { raw: readonly S[] }
  ): TaggedResult<Promise<Out>, S, Opts>
}

// =============================================================================
// RPC Function Type - RpcFn<Out, In, Opts>
// =============================================================================

/**
 * RPC promise for promise pipelining
 * Enables calling methods on Out before awaiting
 */
export interface RpcPromise<T> extends Promise<T> {
  /** Pipeline method call */
  pipe<R>(fn: (value: T) => R | Promise<R>): RpcPromise<R>
}

/**
 * RPC version of Fn - returns RpcPromise<Out> for pipelining
 *
 * @example
 * ```ts
 * const sql: RpcFn<SqlResult, any, { timeout?: number }>
 *
 * // Pipelining - all in one round trip:
 * const user = sql`SELECT * FROM users WHERE id = ${id}`.first()
 * const posts = sql`SELECT * FROM posts WHERE userId = ${id}`.all()
 * ```
 */
export interface RpcFn<Out, In = unknown, Opts extends Record<string, unknown> = Record<string, unknown>> {
  (input: In, opts?: Opts): RpcPromise<Out>
  (strings: TemplateStringsArray, ...values: unknown[]): RpcPromise<Out>
  <S extends string>(
    strings: TemplateStringsArray & { raw: readonly S[] }
  ): TaggedResult<RpcPromise<Out>, S, Opts>
}

// =============================================================================
// Stream Function Types
// =============================================================================

/**
 * Stream function - returns AsyncIterable<Out>
 */
export interface StreamFn<Out, In = unknown, Opts extends Record<string, unknown> = Record<string, unknown>> {
  (input: In, opts?: Opts): AsyncIterable<Out>
  (strings: TemplateStringsArray, ...values: unknown[]): AsyncIterable<Out>
  <S extends string>(
    strings: TemplateStringsArray & { raw: readonly S[] }
  ): TaggedResult<AsyncIterable<Out>, S, Opts>
}

// =============================================================================
// Function Type Utilities
// =============================================================================

/**
 * Extract output type from any Fn variant
 */
export type FnOut<F> = F extends Fn<infer O, infer _I, infer _Opts> ? O : never

/**
 * Extract input type from any Fn variant
 */
export type FnIn<F> = F extends Fn<infer _O, infer I, infer _Opts> ? I : never

/**
 * Extract options type from any Fn variant
 */
export type FnOpts<F> = F extends Fn<infer _O, infer _I, infer Opts> ? Opts : never

/**
 * Convert Fn to AsyncFn
 */
export type ToAsync<F> = F extends Fn<infer O, infer I, infer Opts>
  ? AsyncFn<O, I, Opts extends Record<string, unknown> ? Opts : Record<string, never>>
  : never

/**
 * Convert Fn to RpcFn
 */
export type ToRpc<F> = F extends Fn<infer O, infer I, infer Opts>
  ? RpcFn<O, I, Opts extends Record<string, unknown> ? Opts : Record<string, never>>
  : never

// =============================================================================
// Function Tiers (from AI Workflows cascade)
// =============================================================================

/**
 * Function tier levels (matched to execution tiers)
 */
export type FunctionTier = 'code' | 'generative' | 'agentic' | 'human'

/**
 * Code function - pure TypeScript/JavaScript
 */
export interface CodeFunction {
  type: 'code'
  code: string
  runtime?: 'javascript' | 'typescript'
}

/**
 * Generative function - AI model call
 */
export interface GenerativeFunction {
  type: 'generative'
  model: string
  prompt: string
  schema?: Record<string, unknown>
  temperature?: number
  maxTokens?: number
}

/**
 * Agentic function - autonomous agent
 */
export interface AgenticFunction {
  type: 'agentic'
  agent: string
  goal: string
  tools?: string[]
  maxIterations?: number
}

/**
 * Human function - human in the loop
 */
export interface HumanFunction {
  type: 'human'
  assignee?: string
  instructions: string
  timeout?: number
}

/**
 * Tiered function definition (union of all 4 tiers)
 * Use this for the detailed function implementation
 */
export type TieredFunctionDef =
  | CodeFunction
  | GenerativeFunction
  | AgenticFunction
  | HumanFunction

// =============================================================================
// Serializable Function Call (for RPC)
// =============================================================================

/**
 * Serializable representation of a function call
 */
export interface SerializableFnCall<Args = unknown> {
  /** Method name */
  method: string
  /** Direct arguments */
  args?: Args
  /** Template call data */
  template?: {
    strings: string[]
    values: unknown[]
  }
  /** Named parameters */
  params?: Record<string, unknown>
  /** Options/config */
  config?: Record<string, unknown>
}

/**
 * Function registry entry
 */
export interface FunctionEntry {
  id: string
  name: string
  tier: FunctionTier
  definition: TieredFunctionDef
  description?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  timeout?: number
  retries?: number
}
