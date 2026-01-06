/**
 * @module context
 * @dotdo/do Context Builder
 *
 * Build execution context dynamically from DO allowedMethods.
 * Provides method introspection, category grouping, and validation.
 *
 * @example
 * ```typescript
 * import { buildExecutionContext } from '@dotdo/do'
 *
 * const context = buildExecutionContext(doInstance)
 * // Access methods
 * await context.get('collection', 'id')
 *
 * // Introspect available methods
 * console.log(context.__methods__)
 *
 * // View categories
 * console.log(context.__categories__)
 * ```
 */

/**
 * Metadata extracted from a method for documentation and introspection.
 *
 * @example
 * ```typescript
 * const meta: MethodMetadata = {
 *   description: 'Create a new document',
 *   params: ['collection', 'data'],
 *   returns: 'Promise<Document>',
 *   category: 'crud',
 *   signature: 'create(collection: string, data: unknown)'
 * }
 * ```
 */
export interface MethodMetadata {
  /** Human-readable description of what the method does */
  description?: string
  /** Parameter names extracted from function signature or JSDoc */
  params?: string[]
  /** Return type extracted from JSDoc or TypeScript hints */
  returns?: string
  /** Category this method belongs to (e.g., 'crud', 'action', 'thing') */
  category?: string
  /** Full method signature extracted from function.toString() */
  signature?: string
}

/**
 * Validation warning for methods that have issues.
 *
 * @example
 * ```typescript
 * const warning: ValidationWarning = {
 *   method: 'nonExistentMethod',
 *   type: 'missing',
 *   message: 'Method "nonExistentMethod" is in allowedMethods but not found on instance'
 * }
 * ```
 */
export interface ValidationWarning {
  /** Method name that has an issue */
  method: string
  /** Type of warning */
  type: 'missing' | 'not_callable' | 'invalid_signature'
  /** Human-readable warning message */
  message: string
}

/**
 * Result of building an execution context with validation information.
 *
 * @example
 * ```typescript
 * const result = buildExecutionContextWithValidation(instance)
 * if (result.warnings.length > 0) {
 *   console.warn('Context builder warnings:', result.warnings)
 * }
 * ```
 */
export interface ContextBuilderResult {
  /** The execution context with bound methods */
  context: ExecutionContext
  /** Any validation warnings encountered during context building */
  warnings: ValidationWarning[]
}

/**
 * Execution context containing bound methods and metadata.
 *
 * The context object allows direct method invocation while providing
 * introspection capabilities through special properties.
 *
 * @example
 * ```typescript
 * const ctx: ExecutionContext = buildExecutionContext(instance)
 *
 * // Call methods directly
 * await ctx.create('users', { name: 'Alice' })
 *
 * // Introspect methods
 * console.log(ctx.__methods__?.create)
 * // { description: 'Create a document', params: ['collection', 'data'], ... }
 *
 * // View method categories
 * console.log(ctx.__categories__?.crud)
 * // ['get', 'list', 'create', 'update', 'delete']
 * ```
 */
export interface ExecutionContext {
  /** Callable methods bound to the DO instance */
  [key: string]: Function | Record<string, MethodMetadata> | Record<string, string[]> | undefined
  /** Metadata for all exposed methods */
  __methods__?: Record<string, MethodMetadata>
  /** Methods grouped by category */
  __categories__?: Record<string, string[]>
}

/**
 * Default category mappings based on method name prefixes.
 * Methods are categorized by their prefix or explicit patterns.
 *
 * @internal
 */
const DEFAULT_CATEGORY_PREFIXES: Record<string, string> = {
  // CRUD operations
  get: 'crud',
  list: 'crud',
  create: 'crud',
  update: 'crud',
  delete: 'crud',
  // MCP tools
  search: 'mcp',
  fetch: 'mcp',
  do: 'mcp',
  // Thing operations
  createThing: 'thing',
  getThing: 'thing',
  getThingById: 'thing',
  setThing: 'thing',
  deleteThing: 'thing',
  // Action operations
  send: 'action',
  doAction: 'action',
  tryAction: 'action',
  getAction: 'action',
  queryActions: 'action',
  startAction: 'action',
  completeAction: 'action',
  failAction: 'action',
  cancelAction: 'action',
  retryAction: 'action',
  getNextRetryDelay: 'action',
  resetAction: 'action',
  // Event operations
  track: 'event',
  getEvent: 'event',
  queryEvents: 'event',
  // Relationship operations
  relate: 'relationship',
  unrelate: 'relationship',
  related: 'relationship',
  relatedThings: 'relationship',
  relationships: 'relationship',
  references: 'relationship',
  traverse: 'relationship',
  // SearchProvider operations
  setSearchProvider: 'search',
  getSearchProvider: 'search',
  // Artifact operations
  storeArtifact: 'artifact',
  getArtifact: 'artifact',
  getArtifactBySource: 'artifact',
  deleteArtifact: 'artifact',
  cleanExpiredArtifacts: 'artifact',
  // Workflow operations
  createWorkflowContext: 'workflow',
  getWorkflowState: 'workflow',
  saveWorkflowState: 'workflow',
  registerWorkflowHandler: 'workflow',
  registerSchedule: 'workflow',
  getWorkflowHandlers: 'workflow',
  getSchedules: 'workflow',
}

/**
 * Extract parameter names from a function's string representation.
 *
 * Parses `function.toString()` output to extract parameter names,
 * supporting various function syntaxes including arrow functions,
 * async functions, and methods.
 *
 * @param fn - The function to extract parameters from
 * @returns Array of parameter names, or empty array if extraction fails
 *
 * @example
 * ```typescript
 * function myFunc(a: string, b: number) { return a + b }
 * extractMethodSignature(myFunc)
 * // { params: ['a', 'b'], signature: 'myFunc(a, b)' }
 *
 * const arrow = (x, y) => x + y
 * extractMethodSignature(arrow)
 * // { params: ['x', 'y'], signature: '(x, y)' }
 * ```
 */
export function extractMethodSignature(fn: Function): {
  params: string[]
  signature: string
} {
  const fnStr = fn.toString()

  // Match function parameters - handles multiple formats:
  // - function name(params) { }
  // - async function name(params) { }
  // - name(params) { } (method shorthand)
  // - async name(params) { }
  // - (params) => { }
  // - async (params) => { }
  // - param => { } (single param arrow without parens)

  // Pattern for extracting the parameter list
  const patterns = [
    // Standard function: function name(params) or async function name(params)
    /^(?:async\s+)?function\s*\w*\s*\(([^)]*)\)/,
    // Method shorthand: name(params) or async name(params)
    /^(?:async\s+)?\w+\s*\(([^)]*)\)/,
    // Arrow function: (params) => or async (params) =>
    /^(?:async\s+)?\(([^)]*)\)\s*=>/,
    // Single param arrow: param =>
    /^(?:async\s+)?(\w+)\s*=>/,
  ]

  let paramString = ''
  let matchedPattern = false

  for (const pattern of patterns) {
    const match = fnStr.match(pattern)
    if (match) {
      paramString = match[1]
      matchedPattern = true
      break
    }
  }

  if (!matchedPattern) {
    return { params: [], signature: fn.name || '()' }
  }

  // Parse parameter string to extract names
  // Handle TypeScript type annotations: param: Type, param?: Type, param = default
  const params: string[] = []

  if (paramString.trim()) {
    // Split by comma, but be careful of commas in type annotations like Record<K, V>
    let depth = 0
    let current = ''
    for (const char of paramString) {
      if (char === '<' || char === '(' || char === '[' || char === '{') {
        depth++
        current += char
      } else if (char === '>' || char === ')' || char === ']' || char === '}') {
        depth--
        current += char
      } else if (char === ',' && depth === 0) {
        if (current.trim()) {
          params.push(extractParamName(current.trim()))
        }
        current = ''
      } else {
        current += char
      }
    }
    if (current.trim()) {
      params.push(extractParamName(current.trim()))
    }
  }

  // Build signature string
  const fnName = fn.name || ''
  const signature = `${fnName}(${params.join(', ')})`

  return { params, signature }
}

/**
 * Extract just the parameter name from a parameter declaration.
 * Strips TypeScript type annotations, default values, and modifiers.
 *
 * @param paramDecl - Full parameter declaration (e.g., "data: unknown = {}")
 * @returns Just the parameter name (e.g., "data")
 *
 * @internal
 */
function extractParamName(paramDecl: string): string {
  // Remove leading modifiers like 'readonly', 'public', 'private', 'protected'
  let param = paramDecl.replace(/^(?:readonly|public|private|protected)\s+/, '')

  // Handle destructuring: { a, b } or [a, b]
  if (param.startsWith('{') || param.startsWith('[')) {
    // For destructuring, return a placeholder or the first identifier
    const identifiers = param.match(/\w+/g)
    return identifiers ? `{${identifiers.slice(0, 2).join(', ')}...}` : param
  }

  // Handle rest parameters: ...args
  const restMatch = param.match(/^\.\.\.(\w+)/)
  if (restMatch) {
    return `...${restMatch[1]}`
  }

  // Extract name before : (type annotation) or = (default value) or ? (optional)
  const nameMatch = param.match(/^(\w+)/)
  return nameMatch ? nameMatch[1] : param
}

/**
 * Determine the category for a method based on its name.
 *
 * Uses default prefix mappings and supports @category decorator pattern
 * via function property.
 *
 * @param methodName - Name of the method
 * @param fn - The method function (may have category property)
 * @returns Category string or 'other' if no match
 *
 * @example
 * ```typescript
 * getCategoryForMethod('createThing', fn) // 'thing'
 * getCategoryForMethod('customMethod', fn) // 'other'
 *
 * // With @category decorator
 * fn.category = 'custom'
 * getCategoryForMethod('myMethod', fn) // 'custom'
 * ```
 */
export function getCategoryForMethod(methodName: string, fn: Function): string {
  // Check for explicit category property (decorator pattern)
  if ('category' in fn && typeof (fn as any).category === 'string') {
    return (fn as any).category
  }

  // Check exact match in default mappings
  if (methodName in DEFAULT_CATEGORY_PREFIXES) {
    return DEFAULT_CATEGORY_PREFIXES[methodName]
  }

  // Check prefix patterns (e.g., getXxx -> based on prefix)
  const prefixPatterns: [RegExp, string][] = [
    [/^get[A-Z]/, 'crud'],
    [/^set[A-Z]/, 'crud'],
    [/^create[A-Z]/, 'crud'],
    [/^update[A-Z]/, 'crud'],
    [/^delete[A-Z]/, 'crud'],
    [/^find[A-Z]/, 'query'],
    [/^query[A-Z]/, 'query'],
    [/^search[A-Z]/, 'search'],
  ]

  for (const [pattern, category] of prefixPatterns) {
    if (pattern.test(methodName)) {
      return category
    }
  }

  return 'other'
}

/**
 * Validate that methods in allowedMethods exist and are callable.
 *
 * @param instance - DO instance to validate
 * @returns Array of validation warnings
 *
 * @example
 * ```typescript
 * const instance = {
 *   allowedMethods: new Set(['exists', 'missing', 'notFunction']),
 *   exists: () => 'ok',
 *   notFunction: 42
 * }
 * const warnings = validateAllowedMethods(instance)
 * // [
 * //   { method: 'missing', type: 'missing', message: '...' },
 * //   { method: 'notFunction', type: 'not_callable', message: '...' }
 * // ]
 * ```
 */
export function validateAllowedMethods(instance: {
  allowedMethods: Set<string>
  [key: string]: unknown
}): ValidationWarning[] {
  const warnings: ValidationWarning[] = []

  for (const methodName of instance.allowedMethods) {
    const member = instance[methodName]

    if (member === undefined) {
      warnings.push({
        method: methodName,
        type: 'missing',
        message: `Method "${methodName}" is in allowedMethods but not found on instance`,
      })
    } else if (typeof member !== 'function') {
      warnings.push({
        method: methodName,
        type: 'not_callable',
        message: `"${methodName}" is in allowedMethods but is not a function (type: ${typeof member})`,
      })
    }
  }

  return warnings
}

/**
 * Build an execution context from a DO instance's allowedMethods.
 *
 * Only methods listed in allowedMethods are exposed, and they are
 * properly bound to the instance. This function provides:
 *
 * - **Method binding**: All exposed methods are bound to the instance
 * - **Signature extraction**: Parameter names extracted from function.toString()
 * - **Category grouping**: Methods organized by category (crud, action, thing, etc.)
 * - **Metadata collection**: Description, params, returns from function properties
 *
 * @param instance - DO instance with allowedMethods Set
 * @returns Execution context with bound methods and metadata
 *
 * @example
 * ```typescript
 * const instance = {
 *   allowedMethods: new Set(['get', 'create']),
 *   async get(collection: string, id: string) {
 *     return { collection, id }
 *   },
 *   async create(collection: string, data: unknown) {
 *     return { ...data, id: 'new-id' }
 *   }
 * }
 *
 * const context = buildExecutionContext(instance)
 *
 * // Call methods
 * await context.get('users', '123')
 *
 * // Inspect metadata
 * console.log(context.__methods__.get)
 * // {
 * //   params: ['collection', 'id'],
 * //   signature: 'get(collection, id)',
 * //   category: 'crud'
 * // }
 *
 * // View categories
 * console.log(context.__categories__)
 * // { crud: ['get', 'create'] }
 * ```
 */
export function buildExecutionContext(instance: {
  allowedMethods: Set<string>
  [key: string]: unknown
}): ExecutionContext {
  const context: ExecutionContext = {}
  const metadata: Record<string, MethodMetadata> = {}
  const categories: Record<string, string[]> = {}

  for (const methodName of instance.allowedMethods) {
    const member = instance[methodName]

    if (typeof member === 'function') {
      // Bind method to instance
      context[methodName] = member.bind(instance)

      // Extract signature from function.toString()
      const { params, signature } = extractMethodSignature(member)

      // Determine category
      const category = getCategoryForMethod(methodName, member)

      // Build metadata
      const methodMeta: MethodMetadata = {
        params,
        signature,
        category,
      }

      // Add explicit metadata if available
      if ('description' in member && (member as any).description !== undefined) {
        methodMeta.description = (member as any).description
      }
      if ('params' in member && (member as any).params !== undefined) {
        // Explicit params override extracted ones
        methodMeta.params = (member as any).params
      }
      if ('returns' in member && (member as any).returns !== undefined) {
        methodMeta.returns = (member as any).returns
      }

      metadata[methodName] = methodMeta

      // Group by category
      if (!categories[category]) {
        categories[category] = []
      }
      categories[category].push(methodName)
    }
  }

  // Always include metadata and categories for introspection
  context.__methods__ = metadata
  context.__categories__ = categories

  return context
}

/**
 * Build an execution context with validation warnings.
 *
 * This is the full-featured version that includes validation
 * to warn about methods in allowedMethods that don't exist
 * or aren't callable.
 *
 * @param instance - DO instance with allowedMethods Set
 * @returns Context builder result with context and warnings
 *
 * @example
 * ```typescript
 * const result = buildExecutionContextWithValidation(instance)
 *
 * if (result.warnings.length > 0) {
 *   console.warn('Context builder warnings:')
 *   for (const warning of result.warnings) {
 *     console.warn(`  [${warning.type}] ${warning.method}: ${warning.message}`)
 *   }
 * }
 *
 * // Use the context
 * const ctx = result.context
 * await ctx.get('users', '123')
 * ```
 */
export function buildExecutionContextWithValidation(instance: {
  allowedMethods: Set<string>
  [key: string]: unknown
}): ContextBuilderResult {
  const warnings = validateAllowedMethods(instance)
  const context = buildExecutionContext(instance)

  return { context, warnings }
}
