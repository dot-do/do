/**
 * Tier 2: RPC Service Execution
 *
 * Executes operations via RPC calls to external Durable Object services.
 * Provides access to specialized services like jq.do, npm.do, git.do
 * with typical latency under 5ms.
 *
 * @module execution/rpc
 */

import type {
  ExecResult,
  ExecOptions,
  GitRepository,
  NpmManager,
} from '../../types/execution'

/**
 * RPC service endpoint configuration
 */
export interface RpcServiceConfig {
  /** Service base URL */
  baseUrl: string
  /** Default timeout in ms */
  timeout?: number
  /** Authentication token */
  authToken?: string
  /** Custom headers */
  headers?: Record<string, string>
}

/**
 * Default service configurations
 */
const DEFAULT_SERVICES: Record<string, RpcServiceConfig> = {
  'jq.do': { baseUrl: 'https://jq.do', timeout: 5000 },
  'npm.do': { baseUrl: 'https://npm.do', timeout: 10000 },
  'git.do': { baseUrl: 'https://git.do', timeout: 10000 },
  'db.do': { baseUrl: 'https://db.do', timeout: 5000 },
  'kv.do': { baseUrl: 'https://kv.do', timeout: 5000 },
}

/**
 * Custom service configurations
 */
const serviceConfigs: Map<string, RpcServiceConfig> = new Map()

/**
 * Execute an operation via RPC service call.
 *
 * @param operation - The operation identifier (e.g., 'jq.query', 'git.clone')
 * @param args - Arguments for the operation
 * @param options - Execution options
 * @returns Promise resolving to the execution result
 *
 * @example
 * ```typescript
 * const result = await executeRpc('jq.query', [data, '.items[].name'])
 * ```
 */
export async function executeRpc(
  operation: string,
  args: unknown[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const startTime = performance.now()

  try {
    const { service, method } = parseOperation(operation)
    const config = getServiceConfig(service)

    if (!config) {
      return {
        success: false,
        tier: 2,
        duration: performance.now() - startTime,
        error: {
          code: 'UNKNOWN_SERVICE',
          message: `Unknown RPC service: ${service}`,
        },
      }
    }

    const timeout = options.timeout ?? config.timeout ?? 5000
    const result = await callService(config, method, args, timeout)

    return {
      success: true,
      tier: 2,
      duration: performance.now() - startTime,
      output: result,
    }
  } catch (error) {
    return {
      success: false,
      tier: 2,
      duration: performance.now() - startTime,
      error: {
        code: 'RPC_ERROR',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    }
  }
}

/**
 * Parse operation string into service and method.
 *
 * @param operation - Operation identifier (e.g., 'jq.query', 'git.do/clone')
 * @returns Parsed service and method names
 */
function parseOperation(operation: string): { service: string; method: string } {
  // Handle 'service.do/method' format
  if (operation.includes('/')) {
    const [service, method] = operation.split('/')
    return { service, method }
  }

  // Handle 'service.method' format
  const parts = operation.split('.')
  if (parts.length >= 2) {
    const service = `${parts[0]}.do`
    const method = parts.slice(1).join('.')
    return { service, method }
  }

  return { service: operation, method: 'default' }
}

/**
 * Get service configuration.
 *
 * @param service - Service name
 * @returns Service configuration or undefined
 */
function getServiceConfig(service: string): RpcServiceConfig | undefined {
  return serviceConfigs.get(service) ?? DEFAULT_SERVICES[service]
}

/**
 * Call an RPC service.
 *
 * @param config - Service configuration
 * @param method - Method to call
 * @param args - Method arguments
 * @param timeout - Request timeout
 * @returns Promise resolving to the response data
 */
async function callService(
  config: RpcServiceConfig,
  method: string,
  args: unknown[],
  timeout: number
): Promise<unknown> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const url = `${config.baseUrl}/${method}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.authToken && { Authorization: `Bearer ${config.authToken}` }),
        ...config.headers,
      },
      body: JSON.stringify({ args }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`RPC call failed: ${response.status} ${errorText}`)
    }

    return response.json()
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Configure an RPC service.
 *
 * @param service - Service name
 * @param config - Service configuration
 *
 * @example
 * ```typescript
 * configureService('custom.do', {
 *   baseUrl: 'https://custom.do',
 *   timeout: 10000,
 *   authToken: 'secret',
 * })
 * ```
 */
export function configureService(service: string, config: RpcServiceConfig): void {
  serviceConfigs.set(service, config)
}

/**
 * Remove service configuration.
 *
 * @param service - Service name
 */
export function removeServiceConfig(service: string): void {
  serviceConfigs.delete(service)
}

// =============================================================================
// Service Clients
// =============================================================================

/**
 * Create a JQ service client.
 *
 * @returns JQ service methods
 *
 * @example
 * ```typescript
 * const jq = createJqClient()
 * const names = await jq.query(data, '.items[].name')
 * ```
 */
export function createJqClient() {
  return {
    /**
     * Query JSON data with a jq expression
     */
    async query(data: unknown, expression: string): Promise<unknown> {
      const result = await executeRpc('jq.query', [data, expression])
      if (!result.success) throw new Error(result.error?.message)
      return result.output
    },

    /**
     * Filter JSON data
     */
    async filter(data: unknown, filter: string): Promise<unknown> {
      const result = await executeRpc('jq.filter', [data, filter])
      if (!result.success) throw new Error(result.error?.message)
      return result.output
    },

    /**
     * Transform JSON data
     */
    async transform(data: unknown, transformation: string): Promise<unknown> {
      const result = await executeRpc('jq.transform', [data, transformation])
      if (!result.success) throw new Error(result.error?.message)
      return result.output
    },
  }
}

/**
 * Create a Git service client.
 *
 * @param repoPath - Repository path
 * @returns Git repository interface
 *
 * @example
 * ```typescript
 * const git = createGitClient('/repo')
 * await git.init()
 * await git.add(['file.txt'])
 * await git.commit('Initial commit')
 * ```
 */
export function createGitClient(repoPath: string): GitRepository {
  const call = async <T>(method: string, args: unknown[]): Promise<T> => {
    const result = await executeRpc(`git.${method}`, [repoPath, ...args])
    if (!result.success) throw new Error(result.error?.message)
    return result.output as T
  }

  return {
    init: (options) => call('init', [options]),
    clone: (url, options) => call('clone', [url, options]),
    add: (paths) => call('add', [paths]),
    reset: (paths) => call('reset', [paths]),
    commit: (message, options) => call('commit', [message, options]),
    log: (options) => call('log', [options]),
    status: () => call('status', []),
    branch: (name, options) => call('branch', [name, options]),
    checkout: (ref, options) => call('checkout', [ref, options]),
    merge: (branch, options) => call('merge', [branch, options]),
    fetch: (remote, options) => call('fetch', [remote, options]),
    pull: (remote, branch, options) => call('pull', [remote, branch, options]),
    push: (remote, branch, options) => call('push', [remote, branch, options]),
    diff: (options) => call('diff', [options]),
    show: (ref) => call('show', [ref]),
    refs: () => call('refs', []),
  }
}

/**
 * Create an NPM service client.
 *
 * @param projectPath - Project path
 * @returns NPM manager interface
 *
 * @example
 * ```typescript
 * const npm = createNpmClient('/project')
 * await npm.install(['lodash', 'express'])
 * const packages = await npm.list()
 * ```
 */
export function createNpmClient(projectPath: string): NpmManager {
  const call = async <T>(method: string, args: unknown[]): Promise<T> => {
    const result = await executeRpc(`npm.${method}`, [projectPath, ...args])
    if (!result.success) throw new Error(result.error?.message)
    return result.output as T
  }

  return {
    install: (packages, options) => call('install', [packages, options]),
    uninstall: (packages) => call('uninstall', [packages]),
    list: (options) => call('list', [options]),
    search: (query, options) => call('search', [query, options]),
    info: (name) => call('info', [name]),
    run: (script, args) => call('run', [script, args]),
    pack: () => call('pack', []),
    publish: (options) => call('publish', [options]),
  }
}

/**
 * Create a KV service client.
 *
 * @param namespace - KV namespace
 * @returns KV client methods
 */
export function createKvClient(namespace: string) {
  const call = async <T>(method: string, args: unknown[]): Promise<T> => {
    const result = await executeRpc(`kv.${method}`, [namespace, ...args])
    if (!result.success) throw new Error(result.error?.message)
    return result.output as T
  }

  return {
    get: <T = unknown>(key: string): Promise<T | null> => call('get', [key]),
    set: (key: string, value: unknown, ttl?: number): Promise<void> =>
      call('set', [key, value, ttl]),
    delete: (key: string): Promise<void> => call('delete', [key]),
    list: (prefix?: string): Promise<string[]> => call('list', [prefix]),
  }
}

/**
 * Create a DB service client.
 *
 * @param database - Database identifier
 * @returns DB client methods
 */
export function createDbClient(database: string) {
  const call = async <T>(method: string, args: unknown[]): Promise<T> => {
    const result = await executeRpc(`db.${method}`, [database, ...args])
    if (!result.success) throw new Error(result.error?.message)
    return result.output as T
  }

  return {
    query: <T = unknown>(sql: string, params?: unknown[]): Promise<T[]> =>
      call('query', [sql, params]),
    execute: (sql: string, params?: unknown[]): Promise<{ changes: number }> =>
      call('execute', [sql, params]),
    transaction: <T>(fn: () => Promise<T>): Promise<T> =>
      call('transaction', [fn.toString()]),
  }
}
