/**
 * @module miniflare-executor
 * @dotdo/do Miniflare Executor
 *
 * Code executor implementation for testing using Miniflare.
 * Provides V8 isolate-level sandboxing in a Node.js testing environment.
 *
 * @example
 * ```typescript
 * import { MiniflareCodeExecutor } from '@dotdo/do'
 *
 * // In tests
 * const executor = new MiniflareCodeExecutor()
 * const result = await executor.execute(
 *   'return ctx.multiply(6, 7)',
 *   { ctx: { multiply: (a, b) => a * b } },
 *   5000
 * )
 * expect(result.value).toBe(42)
 * ```
 *
 * @security
 * This executor uses the same security measures as the SimpleCodeExecutor
 * but provides hooks for integration testing scenarios where you need to
 * verify security behavior in a controlled environment.
 *
 * Recommended for:
 * - Unit and integration testing
 * - Local development
 * - CI/CD pipelines
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
 * Configuration options for MiniflareCodeExecutor.
 */
export interface MiniflareExecutorOptions extends ExecutorOptions {
  /**
   * Enable verbose logging of execution details.
   * Useful for debugging test failures.
   * @default false
   */
  verbose?: boolean

  /**
   * Callback invoked before code execution.
   * Can be used to set up test fixtures or mocks.
   */
  onBeforeExecute?: (code: string, context: ExecutionContext) => void | Promise<void>

  /**
   * Callback invoked after code execution.
   * Can be used for assertions or cleanup.
   */
  onAfterExecute?: (result: ExecutionResultWithMetrics) => void | Promise<void>

  /**
   * Mock implementations for external dependencies.
   * These are injected into the execution context.
   */
  mocks?: Record<string, unknown>

  /**
   * Whether to simulate Worker environment globals.
   * When true, provides mock Request, Response, Headers, etc.
   * @default false
   */
  simulateWorkerEnv?: boolean
}

/**
 * Mock Worker environment globals for testing.
 *
 * @internal
 */
interface MockWorkerGlobals {
  Request: typeof Request
  Response: typeof Response
  Headers: typeof Headers
  URL: typeof URL
  URLSearchParams: typeof URLSearchParams
  TextEncoder: typeof TextEncoder
  TextDecoder: typeof TextDecoder
  crypto: Crypto
  atob: typeof atob
  btoa: typeof btoa
}

/**
 * Create mock Worker environment globals.
 *
 * @returns Mock globals object
 * @internal
 */
function createMockWorkerGlobals(): MockWorkerGlobals {
  return {
    Request,
    Response,
    Headers,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    crypto: (globalThis as unknown as { crypto: Crypto }).crypto,
    atob: globalThis.atob,
    btoa: globalThis.btoa,
  }
}

/**
 * Code executor for testing environments using Miniflare patterns.
 *
 * This executor is designed for testing scenarios where you need to:
 * - Verify security behavior
 * - Test code execution with controlled inputs
 * - Mock external dependencies
 * - Simulate Worker environment
 *
 * It uses the same security validation as SimpleCodeExecutor but adds
 * testing-specific features like lifecycle hooks and mocking.
 *
 * @example
 * ```typescript
 * // Basic test usage
 * describe('User script execution', () => {
 *   let executor: MiniflareCodeExecutor
 *
 *   beforeEach(() => {
 *     executor = new MiniflareCodeExecutor({
 *       verbose: true,
 *       mocks: {
 *         db: {
 *           query: async () => [{ id: 1, name: 'Test' }]
 *         }
 *       }
 *     })
 *   })
 *
 *   it('executes with mocked database', async () => {
 *     const result = await executor.execute(
 *       'return await db.query("SELECT * FROM users")',
 *       {},
 *       5000
 *     )
 *     expect(result.value).toEqual([{ id: 1, name: 'Test' }])
 *   })
 * })
 * ```
 *
 * @example
 * ```typescript
 * // With lifecycle hooks
 * const executor = new MiniflareCodeExecutor({
 *   onBeforeExecute: (code, context) => {
 *     console.log('Executing:', code)
 *   },
 *   onAfterExecute: (result) => {
 *     console.log('Result:', result.value)
 *     console.log('Duration:', result.duration, 'ms')
 *   }
 * })
 * ```
 */
export class MiniflareCodeExecutor implements CodeExecutor {
  private readonly options: Required<
    Omit<MiniflareExecutorOptions, 'onBeforeExecute' | 'onAfterExecute' | 'mocks'>
  > & {
    onBeforeExecute?: (code: string, context: ExecutionContext) => void | Promise<void>
    onAfterExecute?: (result: ExecutionResultWithMetrics) => void | Promise<void>
    mocks?: Record<string, unknown>
  }

  /**
   * Execution history for test assertions.
   * Contains the last N executions (configurable via maxHistorySize).
   */
  readonly executionHistory: ExecutionResultWithMetrics[] = []

  /**
   * Maximum number of executions to keep in history.
   */
  readonly maxHistorySize = 100

  /**
   * Create a new MiniflareCodeExecutor instance.
   *
   * @param options - Configuration options
   *
   * @example
   * ```typescript
   * const executor = new MiniflareCodeExecutor({
   *   verbose: true,
   *   simulateWorkerEnv: true
   * })
   * ```
   */
  constructor(options: MiniflareExecutorOptions = {}) {
    this.options = {
      maxCodeLength: options.maxCodeLength ?? MAX_CODE_LENGTH,
      enableSecurityChecks: options.enableSecurityChecks ?? true,
      additionalPatterns: options.additionalPatterns ?? [],
      verbose: options.verbose ?? false,
      simulateWorkerEnv: options.simulateWorkerEnv ?? false,
      onBeforeExecute: options.onBeforeExecute,
      onAfterExecute: options.onAfterExecute,
      mocks: options.mocks,
    }
  }

  /**
   * Execute code in a test sandbox.
   *
   * @param code - JavaScript code to execute
   * @param context - Variables to inject into the execution context
   * @param timeout - Maximum execution time in milliseconds
   * @returns Execution result with value, logs, and metrics
   *
   * @example
   * ```typescript
   * const result = await executor.execute(
   *   'return items.reduce((sum, x) => sum + x, 0)',
   *   { items: [1, 2, 3, 4, 5] },
   *   5000
   * )
   * expect(result.value).toBe(15)
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

    // Verbose logging
    if (this.options.verbose) {
      console.log('[MiniflareExecutor] Executing code:', code.slice(0, 100) + '...')
      console.log('[MiniflareExecutor] Context keys:', Object.keys(context))
    }

    // Before execute hook
    if (this.options.onBeforeExecute) {
      await this.options.onBeforeExecute(code, context)
    }

    let result: ExecutionResultWithMetrics

    try {
      // Step 1: Validate code
      validateCodeLength(code, this.options.maxCodeLength)

      if (this.options.enableSecurityChecks) {
        validateCodeSecurity(code, this.options.additionalPatterns)
      }
      securityValidated = true

      // Step 2: Build execution context
      const fullContext = this.buildContext(context, logs)

      // Step 3: Execute
      const contextKeys = Object.keys(fullContext)
      const contextValues = Object.values(fullContext)

      const wrappedCode = `
        "use strict";
        return (async () => {
          ${code}
        })()
      `

      const fn = new Function(...contextKeys, wrappedCode)

      // Step 4: Execute with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout')), timeout)
      })

      const value = await Promise.race([fn(...contextValues), timeoutPromise])

      const endTime = Date.now()

      result = {
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
        result = {
          error: error.message,
          logs,
          duration: endTime - startTime,
          startTime,
          endTime,
          securityValidated,
        }
      } else {
        result = {
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

    // Store in history
    this.addToHistory(result)

    // Verbose logging
    if (this.options.verbose) {
      console.log('[MiniflareExecutor] Result:', result)
    }

    // After execute hook
    if (this.options.onAfterExecute) {
      await this.options.onAfterExecute(result)
    }

    return result
  }

  /**
   * Build the complete execution context.
   *
   * @param context - User-provided context
   * @param logs - Array for console output
   * @returns Complete context with all globals
   *
   * @internal
   */
  private buildContext(context: ExecutionContext, logs: string[]): Record<string, unknown> {
    const fullContext: Record<string, unknown> = {}

    // Add mocks first (can be overridden by context)
    if (this.options.mocks) {
      Object.assign(fullContext, this.options.mocks)
    }

    // Add user context
    Object.assign(fullContext, context)

    // Add sandboxed console
    fullContext.console = {
      log: (...args: unknown[]) => logs.push(this.stringify(args)),
      error: (...args: unknown[]) => logs.push('[ERROR] ' + this.stringify(args)),
      warn: (...args: unknown[]) => logs.push('[WARN] ' + this.stringify(args)),
      info: (...args: unknown[]) => logs.push('[INFO] ' + this.stringify(args)),
      debug: (...args: unknown[]) => logs.push('[DEBUG] ' + this.stringify(args)),
    }

    // Add Worker environment globals if simulating
    if (this.options.simulateWorkerEnv) {
      const workerGlobals = createMockWorkerGlobals()
      Object.assign(fullContext, workerGlobals)
    }

    // Safe built-ins
    fullContext.JSON = JSON
    fullContext.Math = Math
    fullContext.Date = Date
    fullContext.Array = Array
    fullContext.Object = Object
    fullContext.String = String
    fullContext.Number = Number
    fullContext.Boolean = Boolean
    fullContext.Map = Map
    fullContext.Set = Set
    fullContext.Promise = Promise
    fullContext.RegExp = RegExp
    fullContext.Error = Error

    return fullContext
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
            return JSON.stringify(arg, null, 2)
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
   * @param error - Error object
   * @returns Line number or undefined
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
        if (lineNum > 3) {
          return lineNum - 3
        }
        return lineNum
      }
    }

    return undefined
  }

  /**
   * Add result to execution history.
   *
   * @param result - Execution result to add
   *
   * @internal
   */
  private addToHistory(result: ExecutionResultWithMetrics): void {
    this.executionHistory.push(result)
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift()
    }
  }

  /**
   * Clear execution history.
   *
   * Useful in test teardown to reset state between tests.
   *
   * @example
   * ```typescript
   * afterEach(() => {
   *   executor.clearHistory()
   * })
   * ```
   */
  clearHistory(): void {
    this.executionHistory.length = 0
  }

  /**
   * Get the last execution result.
   *
   * @returns Last execution result or undefined if no executions
   *
   * @example
   * ```typescript
   * await executor.execute('return 42', {}, 5000)
   * const last = executor.getLastExecution()
   * expect(last?.value).toBe(42)
   * ```
   */
  getLastExecution(): ExecutionResultWithMetrics | undefined {
    return this.executionHistory[this.executionHistory.length - 1]
  }

  /**
   * Get execution statistics.
   *
   * @returns Statistics about executions
   *
   * @example
   * ```typescript
   * const stats = executor.getStats()
   * console.log('Total executions:', stats.totalExecutions)
   * console.log('Avg duration:', stats.averageDuration, 'ms')
   * console.log('Success rate:', stats.successRate, '%')
   * ```
   */
  getStats(): {
    totalExecutions: number
    successfulExecutions: number
    failedExecutions: number
    averageDuration: number
    successRate: number
  } {
    const total = this.executionHistory.length
    const successful = this.executionHistory.filter((r) => !r.error).length
    const failed = total - successful
    const avgDuration =
      total > 0 ? this.executionHistory.reduce((sum, r) => sum + r.duration, 0) / total : 0

    return {
      totalExecutions: total,
      successfulExecutions: successful,
      failedExecutions: failed,
      averageDuration: Math.round(avgDuration * 100) / 100,
      successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
    }
  }
}

/**
 * Create a new MiniflareCodeExecutor instance.
 *
 * Factory function for creating test executors.
 *
 * @param options - Optional configuration options
 * @returns New MiniflareCodeExecutor instance
 *
 * @example
 * ```typescript
 * const executor = createMiniflareExecutor({
 *   verbose: true,
 *   mocks: { api: mockApiClient }
 * })
 * ```
 */
export function createMiniflareExecutor(options?: MiniflareExecutorOptions): MiniflareCodeExecutor {
  return new MiniflareCodeExecutor(options)
}

/**
 * Create a pre-configured test executor with common testing defaults.
 *
 * This is a convenience function that creates an executor with:
 * - Verbose logging enabled
 * - Worker environment simulation
 * - Shorter default timeout
 *
 * @param mocks - Optional mock implementations
 * @returns Configured MiniflareCodeExecutor
 *
 * @example
 * ```typescript
 * const executor = createTestExecutor({
 *   db: mockDatabase,
 *   cache: mockCache
 * })
 *
 * const result = await executor.execute(
 *   'return await db.find("users", { active: true })',
 *   {},
 *   1000
 * )
 * ```
 */
export function createTestExecutor(mocks?: Record<string, unknown>): MiniflareCodeExecutor {
  return new MiniflareCodeExecutor({
    verbose: process.env.DEBUG === 'true' || process.env.VERBOSE === 'true',
    simulateWorkerEnv: true,
    enableSecurityChecks: true,
    mocks,
  })
}
