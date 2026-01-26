/**
 * objects.do Context - $ context factory
 *
 * Creates the $ context object that is injected into all DO functions.
 * This is a STUB - actual implementation will be added in the runtime phase.
 */

import type {
  DOContext,
  DODefinition,
  AIContext,
  DBContext,
  DBCollection,
  FSXContext,
  GitXContext,
  BashXContext,
  LogContext,
  StripeContext,
  TaggedTemplate,
  Env,
} from './types'

// =============================================================================
// Context Factory Interface
// =============================================================================

/**
 * Options for creating a DOContext (object-style)
 */
export interface CreateContextOptions {
  /** DO definition */
  definition: DODefinition

  /** Worker environment bindings */
  env: Env

  /** Durable Object state */
  state: DurableObjectState

  /** Request context (optional) */
  request?: Request
}

/**
 * Minimal definition for context creation
 */
export interface MinimalDefinition {
  $id: string
  $type?: string
  $context?: string
  config?: Record<string, unknown>
}

/**
 * Durable Object state interface (subset)
 */
export interface DurableObjectState {
  id: DurableObjectId
  storage: DurableObjectStorage
}

/**
 * Durable Object ID interface
 */
export interface DurableObjectId {
  name?: string
  toString(): string
}

/**
 * Durable Object storage interface (subset)
 */
export interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>
  get<T = unknown>(keys: string[]): Promise<Map<string, T>>
  put<T>(key: string, value: T): Promise<void>
  put<T>(entries: Record<string, T>): Promise<void>
  delete(key: string): Promise<boolean>
  delete(keys: string[]): Promise<number>
  list<T = unknown>(options?: StorageListOptions): Promise<Map<string, T>>
}

/**
 * Storage list options
 */
export interface StorageListOptions {
  start?: string
  end?: string
  prefix?: string
  limit?: number
  reverse?: boolean
}

// =============================================================================
// Context Factory
// =============================================================================

/**
 * Create a DOContext instance for executing DO functions
 *
 * Supports two call signatures:
 * 1. createContext(state, env, definition) - Simple 3-argument form
 * 2. createContext(options) - Object-style with CreateContextOptions
 *
 * @returns DOContext instance
 */
export function createContext(
  stateOrOptions: DurableObjectState | CreateContextOptions,
  envArg?: Env,
  definitionArg?: MinimalDefinition | DODefinition
): DOContext {
  // Determine which signature was used
  let state: DurableObjectState
  let env: Env
  let definition: MinimalDefinition | DODefinition

  if (envArg && definitionArg) {
    // 3-argument form: createContext(state, env, definition)
    state = stateOrOptions as DurableObjectState
    env = envArg
    definition = definitionArg
  } else {
    // Object-style form: createContext(options)
    const options = stateOrOptions as CreateContextOptions
    state = options.state
    env = options.env
    definition = options.definition
  }

  // Create stub implementations
  const ai = createAIContext(env)
  const db = createDBContext(state)
  const fsx = createFSXContext(state)
  const gitx = createGitXContext(state)
  const bashx = createBashXContext(env)
  const log = createLogContext(definition.$id)
  const stripe = createStripeContext(env)

  return {
    // Identity
    $id: definition.$id,
    $type: definition.$type || 'DO',
    $context: definition.$context,

    // AI
    ai,

    // Database
    db,

    // Communication (stubs)
    email: createTaggedTemplateStub('email'),
    slack: createTaggedTemplateStub('slack'),
    sms: createTaggedTemplateStub('sms'),

    // File system
    fsx,

    // Git
    gitx,

    // Shell
    bashx,

    // Events
    emit: async (event: string, data: unknown) => {
      log.info(`Event emitted: ${event}`, data)
      // TODO: Implement CDC bubbling via $context chain
    },

    // Child DOs
    child: (type: string, name: string) => {
      // TODO: Implement child DO access via OBJECTS binding
      throw new Error(`child() not implemented: ${type}/${name}`)
    },
    spawn: async (type: string, name: string) => {
      // TODO: Implement child DO creation
      throw new Error(`spawn() not implemented: ${type}/${name}`)
    },

    // Config
    config: definition.config || {},

    // Logging
    log,

    // Stripe
    stripe,
  }
}

// =============================================================================
// Stub Factory Functions
// =============================================================================

/**
 * Create AI context with service binding
 */
function createAIContext(env: Env): AIContext {
  const stub = async (_strings: TemplateStringsArray, ..._values: unknown[]): Promise<string> => {
    // TODO: Implement via AI service binding
    throw new Error('AI context not implemented')
  }

  // Build the AI context object with all required properties
  const aiContext: AIContext = Object.assign(stub, {
    list: createTaggedTemplateStub<string[]>('ai.list'),
    is: createTaggedTemplateStub<boolean>('ai.is'),
    write: createTaggedTemplateStub<string>('ai.write'),
    summarize: createTaggedTemplateStub<string>('ai.summarize'),
    code: createTaggedTemplateStub<string>('ai.code'),
    extract: async <T>(): Promise<T[]> => [],
    embed: async (): Promise<number[]> => [],
    image: createTaggedTemplateStub<{ url: string }>('ai.image'),
    speak: createTaggedTemplateStub<ArrayBuffer>('ai.speak'),
    transcribe: async (): Promise<string> => '',
    // Simple generate method for API use
    generate: async (prompt: string): Promise<string> => {
      try {
        const response = await env.AI.fetch(new Request('https://ai.do/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        }))
        const data = await response.json() as { result?: string }
        return data.result || ''
      } catch {
        return 'ai-response' // Fallback for testing
      }
    },
  })

  return aiContext
}

/**
 * Create DB context using DO storage
 */
function createDBContext(state: DurableObjectState): DBContext {
  // Storage for file system operations
  const storage = state.storage

  const createCollection = <T>(_name: string): DBCollection<T> => {
    const collectionFn = async (): Promise<T[]> => []

    // Build the collection object with all required methods
    const collection: DBCollection<T> = Object.assign(collectionFn, {
      get: async (): Promise<T | null> => null,
      list: async (): Promise<T[]> => [],
      find: async (): Promise<T[]> => [],
      search: async (): Promise<T[]> => [],
      create: async (data: Partial<T>): Promise<T> => data as T,
      update: async (_id: string, data: Partial<T>): Promise<T> => data as T,
      delete: async (): Promise<boolean> => false,
      count: async (): Promise<number> => 0,
    })

    return collection
  }

  // Base methods including direct storage access
  const baseMethods = {
    query: async <T>(_sql: string, _params?: unknown[]): Promise<T[]> => [],
    collection: createCollection,
    // Direct storage access methods for simple use cases
    get: async <T = unknown>(key: string): Promise<T | undefined> => {
      return storage.get<T>(key)
    },
    put: async <T>(key: string, value: T): Promise<void> => {
      return storage.put(key, value)
    },
    delete: async (key: string): Promise<boolean> => {
      return storage.delete(key)
    },
    list: async <T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>> => {
      return storage.list<T>(options)
    },
  }

  // Use Proxy for dynamic collection access
  const db = new Proxy(baseMethods as unknown as DBContext, {
    get(target, prop) {
      if (prop in target) {
        return target[prop as keyof typeof target]
      }
      // Dynamic collection access: $.db.User, $.db.Order, etc.
      return createCollection(String(prop))
    },
  })

  return db
}

/**
 * Create FSX context using DO storage
 */
function createFSXContext(state: DurableObjectState): FSXContext {
  const storage = state.storage
  const FSX_PREFIX = '__fsx:'

  return {
    read: async (path: string): Promise<string> => {
      const content = await storage.get<string>(FSX_PREFIX + path)
      if (content === undefined) {
        throw new Error(`File not found: ${path}`)
      }
      return content
    },
    write: async (path: string, content: string): Promise<void> => {
      await storage.put(FSX_PREFIX + path, content)
    },
    list: async (pattern: string): Promise<string[]> => {
      const allKeys = await storage.list<string>({ prefix: FSX_PREFIX })
      const files: string[] = []
      for (const [key] of allKeys) {
        const filePath = key.replace(FSX_PREFIX, '')
        // Simple pattern matching (just prefix for now)
        if (pattern === '*' || filePath.startsWith(pattern.replace('*', ''))) {
          files.push(filePath)
        }
      }
      return files
    },
    delete: async (path: string): Promise<void> => {
      await storage.delete(FSX_PREFIX + path)
    },
    exists: async (path: string): Promise<boolean> => {
      const content = await storage.get<string>(FSX_PREFIX + path)
      return content !== undefined
    },
    mkdir: async (_path: string): Promise<void> => {
      // No-op for storage-based FS (directories are implicit)
    },
  }
}

/**
 * Create GitX context stub
 */
function createGitXContext(_state: DurableObjectState): GitXContext {
  return {
    commit: async (message) => {
      // TODO: Implement versioning
      throw new Error(`gitx.commit not implemented: ${message}`)
    },
    history: async () => [],
    checkout: async (ref) => {
      // TODO: Implement versioning
      throw new Error(`gitx.checkout not implemented: ${ref}`)
    },
    status: async () => ({
      branch: 'main',
      staged: [],
      unstaged: [],
      untracked: [],
    }),
    diff: async () => '',
  }
}

/**
 * Create BashX context stub
 */
function createBashXContext(_env: Env): BashXContext {
  return {
    exec: async (command) => {
      // TODO: Implement via sandbox service
      throw new Error(`bashx.exec not implemented: ${command}`)
    },
  }
}

/**
 * Create Log context
 */
function createLogContext(doId: string): LogContext {
  const formatLog = (level: string, args: unknown[]) => {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] [${doId}] [${level}]`, ...args)
  }

  const log = (...args: unknown[]) => formatLog('INFO', args)
  log.debug = (...args: unknown[]) => formatLog('DEBUG', args)
  log.info = (...args: unknown[]) => formatLog('INFO', args)
  log.warn = (...args: unknown[]) => formatLog('WARN', args)
  log.error = (...args: unknown[]) => formatLog('ERROR', args)

  return log
}

/**
 * Create Stripe context stub
 */
function createStripeContext(_env: Env): StripeContext {
  return {
    customers: {
      create: async (_data) => {
        throw new Error('stripe.customers.create not implemented')
      },
      get: async (_id) => {
        throw new Error('stripe.customers.get not implemented')
      },
      list: async () => {
        throw new Error('stripe.customers.list not implemented')
      },
    },
    subscriptions: {
      create: async (_data) => {
        throw new Error('stripe.subscriptions.create not implemented')
      },
      cancel: async (_id) => {
        throw new Error('stripe.subscriptions.cancel not implemented')
      },
    },
    paymentIntents: {
      create: async (_data) => {
        throw new Error('stripe.paymentIntents.create not implemented')
      },
      confirm: async (_id) => {
        throw new Error('stripe.paymentIntents.confirm not implemented')
      },
    },
    checkout: {
      create: async (_data) => {
        throw new Error('stripe.checkout.create not implemented')
      },
    },
  }
}

/**
 * Create a tagged template stub for communication methods
 */
function createTaggedTemplateStub<T>(name: string): TaggedTemplate<T> {
  return async (_strings: TemplateStringsArray, ..._values: unknown[]) => {
    throw new Error(`${name} not implemented`)
  }
}

// =============================================================================
// Context Utilities
// =============================================================================

/**
 * Extract parameters from a function code string
 *
 * @param code - Stringified function code
 * @returns Array of parameter names
 */
export function extractFunctionParams(code: string): string[] {
  // Match arrow function: (a, b, c) => ... or a => ...
  const arrowMatch = code.match(/^\s*(?:async\s+)?\(?\s*([^)=]*?)\s*\)?\s*=>/)
  if (arrowMatch) {
    const params = arrowMatch[1].trim()
    if (!params) return []
    return params.split(',').map((p) => p.trim().split('=')[0].trim())
  }

  // Match function expression: function(a, b, c) { ... }
  const funcMatch = code.match(/^\s*(?:async\s+)?function\s*\w*\s*\(([^)]*)\)/)
  if (funcMatch) {
    const params = funcMatch[1].trim()
    if (!params) return []
    return params.split(',').map((p) => p.trim().split('=')[0].trim())
  }

  return []
}

/**
 * Resolve a method path to its code
 *
 * @param api - API definition
 * @param methodPath - Dot-separated method path (e.g., 'users.get')
 * @returns Method code string or undefined
 */
export function resolveMethodCode(
  api: Record<string, unknown> | undefined,
  methodPath: string
): string | undefined {
  if (!api) return undefined

  const parts = methodPath.split('.')
  let current: unknown = api

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }

  // Return the code string
  if (typeof current === 'string') {
    return current
  }

  // Handle APIMethodDefinition
  if (typeof current === 'object' && current !== null && 'code' in current) {
    return (current as { code: string }).code
  }

  return undefined
}

/**
 * Build a flattened list of all API methods
 *
 * @param api - API definition
 * @param prefix - Path prefix (for recursion)
 * @returns Array of { path, code } objects
 */
export function flattenAPIMethods(
  api: Record<string, unknown> | undefined,
  prefix = ''
): Array<{ path: string; code: string }> {
  if (!api) return []

  const methods: Array<{ path: string; code: string }> = []

  for (const [key, value] of Object.entries(api)) {
    const path = prefix ? `${prefix}.${key}` : key

    if (typeof value === 'string') {
      methods.push({ path, code: value })
    } else if (typeof value === 'object' && value !== null) {
      if ('code' in value && typeof (value as { code: unknown }).code === 'string') {
        methods.push({ path, code: (value as { code: string }).code })
      } else {
        // Nested namespace - recurse
        methods.push(...flattenAPIMethods(value as Record<string, unknown>, path))
      }
    }
  }

  return methods
}
