/**
 * @module executor
 * @dotdo/do Sandbox Executor
 *
 * Sandboxed code execution with security hardening for the DO platform.
 * Provides multiple executor implementations for different runtime environments.
 *
 * @example
 * ```typescript
 * import { SimpleCodeExecutor, createCodeExecutor } from '@dotdo/do'
 *
 * const executor = createCodeExecutor()
 * const result = await executor.execute(
 *   'return greet("World")',
 *   { greet: (name: string) => `Hello, ${name}!` },
 *   5000
 * )
 * console.log(result.value) // "Hello, World!"
 * ```
 *
 * @security
 * This module implements several security measures:
 * - Blocks dangerous patterns (eval, Function constructor, prototype pollution)
 * - Enforces code length limits (100KB max)
 * - Runs code in strict mode
 * - Provides sandboxed console
 *
 * For production use with untrusted code, consider using V8 isolates
 * via WorkerCodeExecutor or MiniflareCodeExecutor.
 */

import type { CodeExecutor, ExecutionContext, ExecutionResult } from './types'

/**
 * Maximum allowed code length in bytes (100KB).
 * Prevents denial-of-service attacks via extremely large code payloads.
 */
export const MAX_CODE_LENGTH = 100 * 1024 // 100KB

/**
 * Dangerous patterns that are blocked during code execution.
 * These patterns can be used to escape the sandbox or cause security issues.
 *
 * @internal
 */
export const DANGEROUS_PATTERNS: ReadonlyArray<{
  pattern: RegExp
  name: string
  description: string
}> = [
  {
    pattern: /\beval\s*\(/,
    name: 'eval',
    description: 'eval() can execute arbitrary code and escape the sandbox',
  },
  {
    pattern: /\bnew\s+Function\s*\(/,
    name: 'Function constructor',
    description: 'new Function() can create functions that escape strict mode',
  },
  {
    pattern: /\bFunction\s*\(/,
    name: 'Function call',
    description: 'Function() can create functions that escape strict mode',
  },
  {
    pattern: /__proto__/,
    name: '__proto__',
    description: '__proto__ access can lead to prototype pollution attacks',
  },
  {
    pattern: /\bconstructor\s*\[\s*['"`]prototype['"`]\s*\]/,
    name: 'constructor.prototype',
    description: 'Bracket notation prototype access can bypass property checks',
  },
  {
    pattern: /Object\s*\.\s*setPrototypeOf/,
    name: 'Object.setPrototypeOf',
    description: 'setPrototypeOf can modify object prototypes causing prototype pollution',
  },
  {
    pattern: /Object\s*\.\s*defineProperty\s*\([^,]+,\s*['"`]__proto__['"`]/,
    name: 'Object.defineProperty __proto__',
    description: 'defineProperty on __proto__ can cause prototype pollution',
  },
  {
    pattern: /\bimport\s*\(/,
    name: 'dynamic import',
    description: 'Dynamic import() can load arbitrary modules',
  },
  {
    pattern: /\brequire\s*\(/,
    name: 'require',
    description: 'require() can load arbitrary Node.js modules',
  },
  {
    pattern: /\bprocess\s*\./,
    name: 'process access',
    description: 'process object access can expose sensitive environment information',
  },
  {
    pattern: /\bglobalThis\s*\[/,
    name: 'globalThis bracket access',
    description: 'Bracket notation on globalThis can bypass property checks',
  },
]

/**
 * Error thrown when dangerous code patterns are detected.
 *
 * This error is thrown during the security validation phase before
 * code execution, preventing potentially malicious code from running.
 *
 * @example
 * ```typescript
 * try {
 *   await executor.execute('eval("1+1")', {}, 5000)
 * } catch (error) {
 *   if (error instanceof DangerousPatternError) {
 *     console.error(`Blocked pattern: ${error.patternName}`)
 *     console.error(`Reason: ${error.description}`)
 *   }
 * }
 * ```
 */
export class DangerousPatternError extends Error {
  /**
   * Name of the detected dangerous pattern
   */
  readonly patternName: string

  /**
   * Description of why this pattern is dangerous
   */
  readonly description: string

  /**
   * The code snippet that matched the pattern (for debugging)
   */
  readonly matchedCode?: string

  constructor(patternName: string, description: string, matchedCode?: string) {
    super(`Dangerous pattern detected: ${patternName}. ${description}`)
    this.name = 'DangerousPatternError'
    this.patternName = patternName
    this.description = description
    this.matchedCode = matchedCode
  }
}

/**
 * Error thrown when code exceeds the maximum allowed length.
 *
 * @example
 * ```typescript
 * try {
 *   await executor.execute(veryLargeCode, {}, 5000)
 * } catch (error) {
 *   if (error instanceof CodeLengthError) {
 *     console.error(`Code too long: ${error.actualLength} bytes`)
 *   }
 * }
 * ```
 */
export class CodeLengthError extends Error {
  /**
   * Actual length of the code in bytes
   */
  readonly actualLength: number

  /**
   * Maximum allowed length in bytes
   */
  readonly maxLength: number

  constructor(actualLength: number, maxLength: number = MAX_CODE_LENGTH) {
    super(`Code exceeds maximum length: ${actualLength} bytes (max: ${maxLength} bytes)`)
    this.name = 'CodeLengthError'
    this.actualLength = actualLength
    this.maxLength = maxLength
  }
}

/**
 * Extended execution result with additional metrics.
 *
 * Provides detailed timing information for performance monitoring
 * and debugging purposes.
 */
export interface ExecutionResultWithMetrics extends ExecutionResult {
  /**
   * Timestamp when execution started (Unix milliseconds)
   */
  startTime: number

  /**
   * Timestamp when execution ended (Unix milliseconds)
   */
  endTime: number

  /**
   * Whether security validation passed
   */
  securityValidated: boolean
}

/**
 * Options for configuring the SimpleCodeExecutor.
 */
export interface ExecutorOptions {
  /**
   * Maximum allowed code length in bytes.
   * @default 102400 (100KB)
   */
  maxCodeLength?: number

  /**
   * Whether to enable security pattern detection.
   * @default true
   */
  enableSecurityChecks?: boolean

  /**
   * Additional dangerous patterns to check for.
   * These are added to the default patterns.
   */
  additionalPatterns?: Array<{
    pattern: RegExp
    name: string
    description: string
  }>
}

/**
 * Validate code for dangerous patterns.
 *
 * Scans the code for known dangerous patterns that could be used
 * to escape the sandbox or cause security issues.
 *
 * @param code - JavaScript code to validate
 * @param additionalPatterns - Additional patterns to check
 * @throws {DangerousPatternError} If a dangerous pattern is detected
 *
 * @example
 * ```typescript
 * // This will throw DangerousPatternError
 * validateCodeSecurity('const x = eval("1+1")')
 *
 * // This is safe
 * validateCodeSecurity('const x = 1 + 1')
 * ```
 */
export function validateCodeSecurity(
  code: string,
  additionalPatterns: typeof DANGEROUS_PATTERNS = []
): void {
  const allPatterns = [...DANGEROUS_PATTERNS, ...additionalPatterns]

  for (const { pattern, name, description } of allPatterns) {
    const match = code.match(pattern)
    if (match) {
      throw new DangerousPatternError(name, description, match[0])
    }
  }
}

/**
 * Validate code length against maximum limit.
 *
 * @param code - JavaScript code to validate
 * @param maxLength - Maximum allowed length in bytes
 * @throws {CodeLengthError} If code exceeds maximum length
 *
 * @example
 * ```typescript
 * validateCodeLength('const x = 1', 100) // OK
 * validateCodeLength('x'.repeat(1000), 100) // Throws CodeLengthError
 * ```
 */
export function validateCodeLength(code: string, maxLength: number = MAX_CODE_LENGTH): void {
  const byteLength = new TextEncoder().encode(code).length
  if (byteLength > maxLength) {
    throw new CodeLengthError(byteLength, maxLength)
  }
}

/**
 * Create an optimized sandboxed console for capturing output.
 *
 * The console captures all output levels (log, error, warn, info, debug)
 * and stores them in an array for later retrieval.
 *
 * @param logs - Array to store log messages
 * @returns Sandboxed console object
 *
 * @internal
 */
function createSandboxConsole(logs: string[]): {
  log: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
} {
  // Pre-bind String for performance
  const stringify = (arg: unknown): string => {
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
  }

  return {
    log: (...args: unknown[]) => logs.push(args.map(stringify).join(' ')),
    error: (...args: unknown[]) => logs.push('[ERROR] ' + args.map(stringify).join(' ')),
    warn: (...args: unknown[]) => logs.push('[WARN] ' + args.map(stringify).join(' ')),
    info: (...args: unknown[]) => logs.push('[INFO] ' + args.map(stringify).join(' ')),
    debug: (...args: unknown[]) => logs.push('[DEBUG] ' + args.map(stringify).join(' ')),
  }
}

/**
 * Simple code executor using Function constructor with timeout handling.
 *
 * This executor provides:
 * - Security hardening with dangerous pattern detection
 * - Code length limits to prevent DoS attacks
 * - Strict mode execution
 * - Sandboxed console with captured output
 * - Timeout handling for runaway code
 * - Detailed execution metrics
 *
 * @security
 * Note: This provides basic sandboxing through strict mode and controlled context.
 * For production use with untrusted code, consider using V8 isolates via
 * WorkerCodeExecutor (Cloudflare Workers) or MiniflareCodeExecutor (testing).
 *
 * @example
 * ```typescript
 * const executor = new SimpleCodeExecutor({
 *   maxCodeLength: 50000,
 *   enableSecurityChecks: true
 * })
 *
 * const result = await executor.execute(
 *   'console.log("Hello"); return 42',
 *   {},
 *   5000
 * )
 *
 * console.log(result.value) // 42
 * console.log(result.logs)  // ["Hello"]
 * console.log(result.duration) // e.g., 5
 * ```
 */
export class SimpleCodeExecutor implements CodeExecutor {
  private readonly options: Required<ExecutorOptions>

  /**
   * Create a new SimpleCodeExecutor instance.
   *
   * @param options - Configuration options
   *
   * @example
   * ```typescript
   * // Default options
   * const executor = new SimpleCodeExecutor()
   *
   * // Custom options
   * const executor = new SimpleCodeExecutor({
   *   maxCodeLength: 50000,
   *   enableSecurityChecks: true,
   *   additionalPatterns: [
   *     { pattern: /forbidden/, name: 'forbidden', description: 'Custom block' }
   *   ]
   * })
   * ```
   */
  constructor(options: ExecutorOptions = {}) {
    this.options = {
      maxCodeLength: options.maxCodeLength ?? MAX_CODE_LENGTH,
      enableSecurityChecks: options.enableSecurityChecks ?? true,
      additionalPatterns: options.additionalPatterns ?? [],
    }
  }

  /**
   * Execute code in a sandboxed context with security validation.
   *
   * The execution flow:
   * 1. Validate code length
   * 2. Check for dangerous patterns (if enabled)
   * 3. Wrap code in strict mode async function
   * 4. Execute with timeout
   * 5. Return result with metrics
   *
   * @param code - JavaScript code to execute
   * @param context - Variables to inject into the execution context
   * @param timeout - Maximum execution time in milliseconds
   * @returns Execution result with value, logs, and metrics
   *
   * @throws {CodeLengthError} If code exceeds maximum length
   * @throws {DangerousPatternError} If dangerous patterns are detected
   *
   * @example
   * ```typescript
   * const executor = new SimpleCodeExecutor()
   *
   * // Simple execution
   * const result = await executor.execute('return 1 + 1', {}, 5000)
   * console.log(result.value) // 2
   *
   * // With context
   * const result = await executor.execute(
   *   'return await fetchData()',
   *   { fetchData: async () => ({ id: 1 }) },
   *   5000
   * )
   * console.log(result.value) // { id: 1 }
   *
   * // With console output
   * const result = await executor.execute(
   *   'console.log("Processing..."); return "done"',
   *   {},
   *   5000
   * )
   * console.log(result.logs) // ["Processing..."]
   * console.log(result.value) // "done"
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
      // Step 1: Validate code length
      validateCodeLength(code, this.options.maxCodeLength)

      // Step 2: Security pattern validation
      if (this.options.enableSecurityChecks) {
        validateCodeSecurity(code, this.options.additionalPatterns)
      }
      securityValidated = true

      // Step 3: Build the function with context in scope
      const contextKeys = Object.keys(context)
      const contextValues = Object.values(context)

      // Wrap code in async function with strict mode
      const wrappedCode = `
        "use strict";
        return (async () => {
          ${code}
        })()
      `

      // Step 4: Create optimized sandboxed console
      const sandboxConsole = createSandboxConsole(logs)

      // Step 5: Execute with timeout
      const fn = new Function(...contextKeys, 'console', wrappedCode)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Execution timeout')), timeout)
      )

      const value = await Promise.race([fn(...contextValues, sandboxConsole), timeoutPromise])

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

      // Re-throw security errors with full details
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
   * Extract line number from error stack trace.
   *
   * Parses the error stack trace to find the line number where
   * the error occurred in the user's code.
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

    // Look for line numbers in the stack trace
    // Patterns vary by environment, but commonly:
    // - "<anonymous>:3:10"
    // - "at eval (eval at execute, <anonymous>:3:10)"
    // - "Function (<anonymous>:3:10)"
    const stackLines = error.stack.split('\n')

    for (const line of stackLines) {
      // Match patterns like ":3:10" or "line 3"
      const match = line.match(/<anonymous>:(\d+):\d+/)
      if (match) {
        const lineNum = parseInt(match[1], 10)
        // Adjust for the wrapper code (3 lines before user code)
        // "use strict"; + return (async () => { = ~3 lines
        if (lineNum > 3) {
          return lineNum - 3
        }
        return lineNum
      }
    }

    return undefined
  }
}

/**
 * Create a new SimpleCodeExecutor instance.
 *
 * Factory function for creating code executors with default or custom options.
 *
 * @param options - Optional configuration options
 * @returns New CodeExecutor instance
 *
 * @example
 * ```typescript
 * // Default executor
 * const executor = createCodeExecutor()
 *
 * // Custom executor with options
 * const executor = createCodeExecutor({
 *   maxCodeLength: 50000,
 *   enableSecurityChecks: true
 * })
 * ```
 */
export function createCodeExecutor(options?: ExecutorOptions): CodeExecutor {
  return new SimpleCodeExecutor(options)
}
