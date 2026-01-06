/**
 * @module types
 * @dotdo/do Sandbox Types
 *
 * Interface definitions for sandboxed code execution.
 *
 * This module provides the core type definitions used by all executor
 * implementations in the sandbox module.
 *
 * @example
 * ```typescript
 * import type { CodeExecutor, ExecutionContext, ExecutionResult } from '@dotdo/do'
 *
 * // Implement a custom executor
 * class MyExecutor implements CodeExecutor {
 *   async execute(
 *     code: string,
 *     context: ExecutionContext,
 *     timeout: number
 *   ): Promise<ExecutionResult> {
 *     // Custom implementation
 *   }
 * }
 * ```
 */

/**
 * Context object passed to code execution.
 *
 * Keys become available as global variables in the sandbox.
 * Values can be primitives, objects, or functions that the
 * executed code can call.
 *
 * @example
 * ```typescript
 * const context: ExecutionContext = {
 *   // Primitives
 *   userId: '123',
 *   maxItems: 100,
 *
 *   // Objects
 *   config: { debug: true, env: 'production' },
 *
 *   // Functions
 *   greet: (name: string) => `Hello, ${name}!`,
 *
 *   // Async functions
 *   fetchData: async (id: string) => {
 *     const response = await fetch(`/api/data/${id}`)
 *     return response.json()
 *   }
 * }
 *
 * // In executed code, these are available as globals:
 * // return greet(userId) // "Hello, 123!"
 * // return await fetchData('abc')
 * ```
 *
 * @security
 * Be careful what you expose in the context:
 * - Never expose sensitive credentials
 * - Wrap dangerous operations with validation
 * - Consider using immutable objects
 */
export type ExecutionContext = Record<string, unknown>

/**
 * Result of code execution.
 *
 * Contains either a successful value or error information,
 * along with captured console output and timing metrics.
 *
 * @example
 * ```typescript
 * const result: ExecutionResult = await executor.execute(
 *   'console.log("Hello"); return 42',
 *   {},
 *   5000
 * )
 *
 * if (result.error) {
 *   console.error('Execution failed:', result.error)
 *   if (result.errorLine) {
 *     console.error('Error on line:', result.errorLine)
 *   }
 * } else {
 *   console.log('Value:', result.value)  // 42
 *   console.log('Logs:', result.logs)    // ["Hello"]
 *   console.log('Duration:', result.duration, 'ms')
 * }
 * ```
 */
export interface ExecutionResult {
  /**
   * Return value from the executed code.
   *
   * This is the value returned by the user's code (via `return` statement).
   * Will be undefined if the code doesn't return anything or if an error occurred.
   *
   * @example
   * ```typescript
   * // Code: "return { sum: 1 + 2, product: 2 * 3 }"
   * // result.value = { sum: 3, product: 6 }
   * ```
   */
  value?: unknown

  /**
   * Error message if execution failed.
   *
   * Contains the error message from any thrown exception,
   * security violation, or timeout.
   *
   * @example
   * ```typescript
   * // Code: "throw new Error('Something went wrong')"
   * // result.error = "Something went wrong"
   *
   * // Code: "while(true){}" with 100ms timeout
   * // result.error = "Execution timeout"
   *
   * // Code: "eval('1+1')" with security checks
   * // result.error = "Dangerous pattern detected: eval..."
   * ```
   */
  error?: string

  /**
   * Line number where error occurred.
   *
   * Extracted from the error stack trace when available.
   * Note: Line numbers are best-effort and may not always be accurate
   * due to code wrapping and environment differences.
   *
   * @example
   * ```typescript
   * // Code: "const x = null;\nx.foo" (line 2 error)
   * // result.errorLine = 2
   * ```
   */
  errorLine?: number

  /**
   * Console output captured during execution.
   *
   * All console.log, console.error, console.warn, console.info,
   * and console.debug calls are captured here.
   *
   * Error levels are prefixed:
   * - console.log -> "message"
   * - console.error -> "[ERROR] message"
   * - console.warn -> "[WARN] message"
   * - console.info -> "[INFO] message"
   * - console.debug -> "[DEBUG] message"
   *
   * @example
   * ```typescript
   * // Code:
   * // console.log("Starting")
   * // console.warn("Low memory")
   * // console.error("Failed!")
   * // return "done"
   *
   * // result.logs = [
   * //   "Starting",
   * //   "[WARN] Low memory",
   * //   "[ERROR] Failed!"
   * // ]
   * ```
   */
  logs: string[]

  /**
   * Execution duration in milliseconds.
   *
   * Total time from when execute() was called to when it returned,
   * including any security validation and context building overhead.
   *
   * @example
   * ```typescript
   * // Measure performance
   * const result = await executor.execute(code, context, 5000)
   * if (result.duration > 1000) {
   *   console.warn('Slow execution:', result.duration, 'ms')
   * }
   * ```
   */
  duration: number
}

/**
 * CodeExecutor interface for sandboxed code execution.
 *
 * This is the core interface implemented by all executor types:
 * - SimpleCodeExecutor: Basic Function-based execution
 * - WorkerCodeExecutor: V8 isolate execution for Cloudflare Workers
 * - MiniflareCodeExecutor: Testing-focused execution
 *
 * @example
 * ```typescript
 * // Using the interface for dependency injection
 * class ScriptRunner {
 *   constructor(private executor: CodeExecutor) {}
 *
 *   async runUserScript(script: string): Promise<unknown> {
 *     const result = await this.executor.execute(
 *       script,
 *       { api: this.createApi() },
 *       5000
 *     )
 *
 *     if (result.error) {
 *       throw new Error(`Script failed: ${result.error}`)
 *     }
 *
 *     return result.value
 *   }
 * }
 *
 * // In production
 * const runner = new ScriptRunner(new WorkerCodeExecutor())
 *
 * // In tests
 * const testRunner = new ScriptRunner(new MiniflareCodeExecutor({
 *   mocks: { api: mockApi }
 * }))
 * ```
 */
export interface CodeExecutor {
  /**
   * Execute code in a sandboxed context.
   *
   * @param code - JavaScript code to execute.
   *   The code runs in strict mode inside an async function,
   *   so you can use `return` to provide a value and `await`
   *   for async operations.
   *
   * @param context - Variables to inject into the execution context.
   *   Each key becomes a global variable accessible in the code.
   *
   * @param timeout - Maximum execution time in milliseconds.
   *   If exceeded, execution is terminated and error contains "timeout".
   *
   * @returns Promise that resolves to ExecutionResult with either
   *   a value or error, plus logs and metrics.
   *
   * @example
   * ```typescript
   * // Simple arithmetic
   * const r1 = await executor.execute('return 1 + 1', {}, 5000)
   * // r1.value = 2
   *
   * // Using context
   * const r2 = await executor.execute(
   *   'return items.filter(x => x > 0)',
   *   { items: [-1, 2, -3, 4] },
   *   5000
   * )
   * // r2.value = [2, 4]
   *
   * // Async operations
   * const r3 = await executor.execute(
   *   'const data = await fetchUser(id); return data.name',
   *   {
   *     id: '123',
   *     fetchUser: async (id) => ({ id, name: 'Alice' })
   *   },
   *   5000
   * )
   * // r3.value = 'Alice'
   *
   * // Error handling
   * const r4 = await executor.execute('return x.foo', {}, 5000)
   * // r4.error = "x is not defined"
   *
   * // Timeout
   * const r5 = await executor.execute('while(true){}', {}, 100)
   * // r5.error = "Execution timeout"
   * ```
   */
  execute(
    code: string,
    context: ExecutionContext,
    timeout: number
  ): Promise<ExecutionResult>
}
