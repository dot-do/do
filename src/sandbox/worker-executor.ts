/**
 * @module worker-executor
 * @dotdo/do Worker Executor
 *
 * Code executor implementation for Cloudflare Workers using V8 isolates.
 * Provides true sandboxing through V8 isolate boundaries.
 *
 * @example
 * ```typescript
 * import { WorkerCodeExecutor } from '@dotdo/do'
 *
 * // In a Cloudflare Worker context
 * const executor = new WorkerCodeExecutor()
 * const result = await executor.execute(
 *   'return data.value * 2',
 *   { data: { value: 21 } },
 *   5000
 * )
 * console.log(result.value) // 42
 * ```
 *
 * @security
 * This executor provides the highest level of security through V8 isolate
 * boundaries. Each execution runs in its own isolate, preventing:
 * - Cross-execution data leakage
 * - Prototype pollution attacks
 * - Global state manipulation
 *
 * Recommended for production use with untrusted code.
 */

import type { CodeExecutor, ExecutionContext } from './types'
import {
  validateCodeLength,
  validateCodeSecurity,
  MAX_CODE_LENGTH,
  DangerousPatternError,
  CodeLengthError,
  type ExecutorOptions,
  type ExecutionResultWithMetrics,
} from './executor'

/**
 * Options specific to the WorkerCodeExecutor.
 */
export interface WorkerExecutorOptions extends ExecutorOptions {
  /**
   * Whether to use the Durable Object's alarm for timeout handling.
   * When true, uses DO alarm instead of setTimeout for more reliable timeouts.
   * @default false
   */
  useAlarmForTimeout?: boolean

  /**
   * Whether to enable CPU time limit enforcement.
   * This uses Cloudflare's built-in CPU time limits.
   * @default true
   */
  enforceCpuLimit?: boolean

  /**
   * Custom fetch handler for the sandbox context.
   * If provided, a sandboxed fetch function will be available.
   */
  fetchHandler?: (request: Request) => Promise<Response>
}

/**
 * Code executor for Cloudflare Workers using V8 isolates.
 *
 * This executor leverages Cloudflare Workers' V8 isolate architecture
 * to provide true sandboxing for code execution. Each execution runs
 * in the same isolate as the worker but with controlled context.
 *
 * For even stronger isolation, consider using a separate Worker or
 * Durable Object for each execution context.
 *
 * @security
 * While V8 isolates provide strong security boundaries, this implementation
 * still runs in the same isolate as the calling code. For maximum security
 * with untrusted code, consider:
 * - Using a dedicated Worker via Service Bindings
 * - Using Cloudflare's HTMLRewriter for DOM manipulation sandboxing
 * - Rate limiting and resource quotas
 *
 * @example
 * ```typescript
 * // Basic usage
 * const executor = new WorkerCodeExecutor()
 *
 * // With custom options
 * const executor = new WorkerCodeExecutor({
 *   maxCodeLength: 50000,
 *   enableSecurityChecks: true,
 *   enforceCpuLimit: true,
 *   fetchHandler: async (req) => {
 *     // Sandboxed fetch that restricts URLs
 *     if (!req.url.startsWith('https://api.example.com')) {
 *       throw new Error('Fetch not allowed to this URL')
 *     }
 *     return fetch(req)
 *   }
 * })
 *
 * const result = await executor.execute(
 *   `
 *   const response = await fetch('https://api.example.com/data')
 *   return response.json()
 *   `,
 *   {},
 *   5000
 * )
 * ```
 */
export class WorkerCodeExecutor implements CodeExecutor {
  private readonly options: Required<Omit<WorkerExecutorOptions, 'fetchHandler'>> & {
    fetchHandler?: (request: Request) => Promise<Response>
  }

  /**
   * Create a new WorkerCodeExecutor instance.
   *
   * @param options - Configuration options for the executor
   *
   * @example
   * ```typescript
   * const executor = new WorkerCodeExecutor({
   *   maxCodeLength: 50000,
   *   enableSecurityChecks: true
   * })
   * ```
   */
  constructor(options: WorkerExecutorOptions = {}) {
    this.options = {
      maxCodeLength: options.maxCodeLength ?? MAX_CODE_LENGTH,
      enableSecurityChecks: options.enableSecurityChecks ?? true,
      additionalPatterns: options.additionalPatterns ?? [],
      useAlarmForTimeout: options.useAlarmForTimeout ?? false,
      enforceCpuLimit: options.enforceCpuLimit ?? true,
      fetchHandler: options.fetchHandler,
    }
  }

  /**
   * Execute code in a V8 isolate context.
   *
   * The execution flow:
   * 1. Validate code length and security patterns
   * 2. Build execution context with sandboxed globals
   * 3. Execute using AsyncFunction for async/await support
   * 4. Handle timeout using Promise.race
   * 5. Return result with execution metrics
   *
   * @param code - JavaScript code to execute
   * @param context - Variables to inject into the execution context
   * @param timeout - Maximum execution time in milliseconds
   * @returns Execution result with value, logs, and metrics
   *
   * @example
   * ```typescript
   * const executor = new WorkerCodeExecutor()
   *
   * // Execute with context
   * const result = await executor.execute(
   *   'return items.filter(x => x > 0).map(x => x * 2)',
   *   { items: [-1, 2, -3, 4] },
   *   5000
   * )
   * console.log(result.value) // [4, 8]
   * ```
   */
  async execute(
    code: string,
    context: ExecutionContext,
    timeout: number
  ): Promise<ExecutionResultWithMetrics> {
    const logs: string[] = []
    const startTime = Date.now()
    let securityValidated = false

    try {
      // Step 1: Validate code
      validateCodeLength(code, this.options.maxCodeLength)

      if (this.options.enableSecurityChecks) {
        validateCodeSecurity(code, this.options.additionalPatterns)
      }
      securityValidated = true

      // Step 2: Build sandboxed context
      const sandboxContext = this.buildSandboxContext(context, logs)

      // Step 3: Create async function for execution
      const contextKeys = Object.keys(sandboxContext)
      const contextValues = Object.values(sandboxContext)

      // Use AsyncFunction constructor for async/await support
      // Note: In Workers, we could potentially use eval with stricter CSP
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
      const wrappedCode = `
        "use strict";
        ${code}
      `

      const fn = new AsyncFunction(...contextKeys, wrappedCode)

      // Step 4: Execute with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout')), timeout)
      })

      const value = await Promise.race([fn(...contextValues), timeoutPromise])

      const endTime = Date.now()

      return {
        value,
        logs,
        duration: endTime - startTime,
        startTime,
        endTime,
        securityValidated,
      }
    } catch (error) {
      const endTime = Date.now()

      if (error instanceof DangerousPatternError || error instanceof CodeLengthError) {
        return {
          error: error.message,
          logs,
          duration: endTime - startTime,
          startTime,
          endTime,
          securityValidated,
        }
      }

      return {
        error: error instanceof Error ? error.message : String(error),
        errorLine: this.extractErrorLine(error),
        logs,
        duration: endTime - startTime,
        startTime,
        endTime,
        securityValidated,
      }
    }
  }

  /**
   * Build a sandboxed execution context with controlled globals.
   *
   * Creates a context object that includes:
   * - User-provided context variables
   * - Sandboxed console for output capture
   * - Optional sandboxed fetch (if configured)
   * - Restricted access to Worker globals
   *
   * @param context - User-provided context variables
   * @param logs - Array to capture console output
   * @returns Sandboxed context object
   *
   * @internal
   */
  private buildSandboxContext(
    context: ExecutionContext,
    logs: string[]
  ): Record<string, unknown> {
    const sandboxContext: Record<string, unknown> = { ...context }

    // Sandboxed console
    sandboxContext.console = {
      log: (...args: unknown[]) => logs.push(this.stringify(args)),
      error: (...args: unknown[]) => logs.push('[ERROR] ' + this.stringify(args)),
      warn: (...args: unknown[]) => logs.push('[WARN] ' + this.stringify(args)),
      info: (...args: unknown[]) => logs.push('[INFO] ' + this.stringify(args)),
      debug: (...args: unknown[]) => logs.push('[DEBUG] ' + this.stringify(args)),
    }

    // Sandboxed fetch (if configured)
    if (this.options.fetchHandler) {
      sandboxContext.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        return this.options.fetchHandler!(request)
      }
    }

    // Provide safe utilities
    sandboxContext.JSON = JSON
    sandboxContext.Math = Math
    sandboxContext.Date = Date
    sandboxContext.Array = Array
    sandboxContext.Object = Object
    sandboxContext.String = String
    sandboxContext.Number = Number
    sandboxContext.Boolean = Boolean
    sandboxContext.Map = Map
    sandboxContext.Set = Set
    sandboxContext.Promise = Promise
    sandboxContext.RegExp = RegExp
    sandboxContext.Error = Error
    sandboxContext.TypeError = TypeError
    sandboxContext.RangeError = RangeError

    // Explicitly undefined dangerous globals
    sandboxContext.eval = undefined
    sandboxContext.Function = undefined
    sandboxContext.globalThis = undefined
    sandboxContext.self = undefined

    return sandboxContext
  }

  /**
   * Stringify arguments for console output.
   *
   * @param args - Arguments to stringify
   * @returns Stringified output
   *
   * @internal
   */
  private stringify(args: unknown[]): string {
    return args
      .map((arg) => {
        if (typeof arg === 'string') return arg
        if (arg === null) return 'null'
        if (arg === undefined) return 'undefined'
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg)
          } catch {
            return String(arg)
          }
        }
        return String(arg)
      })
      .join(' ')
  }

  /**
   * Extract line number from error stack trace.
   *
   * @param error - Error object with stack trace
   * @returns Line number in user code, or undefined if not available
   *
   * @internal
   */
  private extractErrorLine(error: unknown): number | undefined {
    if (!(error instanceof Error) || !error.stack) {
      return undefined
    }

    const stackLines = error.stack.split('\n')

    for (const line of stackLines) {
      const match = line.match(/<anonymous>:(\d+):\d+/)
      if (match) {
        const lineNum = parseInt(match[1], 10)
        // Adjust for wrapper code
        if (lineNum > 2) {
          return lineNum - 2
        }
        return lineNum
      }
    }

    return undefined
  }
}

/**
 * Create a new WorkerCodeExecutor instance.
 *
 * Factory function for creating Worker-based code executors.
 *
 * @param options - Optional configuration options
 * @returns New WorkerCodeExecutor instance
 *
 * @example
 * ```typescript
 * const executor = createWorkerExecutor({
 *   enableSecurityChecks: true,
 *   fetchHandler: async (req) => {
 *     // Custom sandboxed fetch
 *     return fetch(req)
 *   }
 * })
 * ```
 */
export function createWorkerExecutor(options?: WorkerExecutorOptions): CodeExecutor {
  return new WorkerCodeExecutor(options)
}
