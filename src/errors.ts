/**
 * @dotdo/do - Structured Error Types
 *
 * Provides typed error classes for the do() method execution:
 * - TimeoutError: Execution exceeded configured timeout
 * - SandboxError: Security violation in sandboxed environment
 * - ExecutionError: Runtime error during code execution
 * - MemoryError: Memory limit exceeded during execution
 *
 * All errors extend DoError which provides a common interface for
 * error handling and serialization.
 */

/**
 * Error codes for categorizing execution errors
 */
export enum DoErrorCode {
  /** Execution exceeded the configured timeout */
  TIMEOUT = 'TIMEOUT',
  /** Security violation in sandboxed environment */
  SANDBOX_VIOLATION = 'SANDBOX_VIOLATION',
  /** Runtime error during code execution */
  EXECUTION_ERROR = 'EXECUTION_ERROR',
  /** Syntax error in provided code */
  SYNTAX_ERROR = 'SYNTAX_ERROR',
  /** Reference error (undefined variable) */
  REFERENCE_ERROR = 'REFERENCE_ERROR',
  /** Type error (invalid operation) */
  TYPE_ERROR = 'TYPE_ERROR',
  /** Memory limit exceeded */
  MEMORY_EXCEEDED = 'MEMORY_EXCEEDED',
  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Serializable error representation for DoResult
 */
export interface SerializedDoError {
  /** Error code for categorization */
  code: DoErrorCode
  /** Human-readable error message */
  message: string
  /** Original error type (e.g., 'SyntaxError', 'ReferenceError') */
  type: string
  /** Stack trace if available */
  stack?: string
  /** Additional context about the error */
  context?: Record<string, unknown>
}

/**
 * Base class for all do() method execution errors.
 *
 * Provides common functionality for error serialization and identification.
 *
 * @example
 * ```typescript
 * try {
 *   const result = await doInstance.do('invalid syntax')
 * } catch (err) {
 *   if (err instanceof DoError) {
 *     console.log(err.code) // DoErrorCode.SYNTAX_ERROR
 *     console.log(err.toJSON()) // SerializedDoError object
 *   }
 * }
 * ```
 */
export class DoError extends Error {
  /** Error code for categorization */
  readonly code: DoErrorCode

  /** Additional context about the error */
  readonly context?: Record<string, unknown>

  /**
   * Create a new DoError
   *
   * @param code - Error code for categorization
   * @param message - Human-readable error message
   * @param context - Additional context about the error
   */
  constructor(code: DoErrorCode, message: string, context?: Record<string, unknown>) {
    super(message)
    this.name = 'DoError'
    this.code = code
    this.context = context

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype)
  }

  /**
   * Serialize the error to a plain object for transport
   *
   * @returns Serializable error representation
   */
  toJSON(): SerializedDoError {
    return {
      code: this.code,
      message: this.message,
      type: this.name,
      stack: this.stack,
      context: this.context,
    }
  }

  /**
   * Create a DoError from an unknown error
   *
   * @param error - Unknown error to wrap
   * @param defaultCode - Default error code if type cannot be determined
   * @returns DoError instance
   */
  static from(error: unknown, defaultCode: DoErrorCode = DoErrorCode.UNKNOWN): DoError {
    if (error instanceof DoError) {
      return error
    }

    if (error instanceof Error) {
      // Map native error types to DoError codes
      let code = defaultCode
      if (error instanceof SyntaxError || error.name === 'SyntaxError') {
        code = DoErrorCode.SYNTAX_ERROR
      } else if (error instanceof ReferenceError || error.name === 'ReferenceError') {
        code = DoErrorCode.REFERENCE_ERROR
      } else if (error instanceof TypeError || error.name === 'TypeError') {
        code = DoErrorCode.TYPE_ERROR
      }

      const doError = new DoError(code, error.message, { originalType: error.name })
      doError.stack = error.stack
      return doError
    }

    return new DoError(defaultCode, String(error))
  }
}

/**
 * Error thrown when code execution exceeds the configured timeout.
 *
 * @example
 * ```typescript
 * const result = await doInstance.do('while(true) {}', { timeout: 100 })
 * // result.success === false
 * // result.error contains TimeoutError info
 * ```
 */
export class TimeoutError extends DoError {
  /** Timeout duration that was exceeded (in milliseconds) */
  readonly timeout: number

  /** Actual execution duration before timeout (in milliseconds) */
  readonly duration?: number

  /**
   * Create a new TimeoutError
   *
   * @param timeout - Timeout duration that was exceeded (in milliseconds)
   * @param duration - Actual execution duration before timeout
   * @param message - Optional custom error message
   */
  constructor(timeout: number, duration?: number, message?: string) {
    super(
      DoErrorCode.TIMEOUT,
      message ?? `Execution timeout exceeded (${timeout}ms)`,
      { timeout, duration }
    )
    this.name = 'TimeoutError'
    this.timeout = timeout
    this.duration = duration
  }

  /**
   * Check if an error is a timeout error
   *
   * @param error - Error to check
   * @returns True if error is a timeout error
   */
  static isTimeout(error: unknown): error is TimeoutError {
    if (error instanceof TimeoutError) return true
    if (error instanceof Error) {
      return (
        error.message.includes('timeout') ||
        error.message.includes('Timeout') ||
        error.message.includes('timed out')
      )
    }
    return false
  }
}

/**
 * Error thrown when code attempts to access restricted functionality
 * in the sandboxed environment.
 *
 * @example
 * ```typescript
 * const result = await doInstance.do('process.exit()')
 * // result.success === false
 * // result.error contains SandboxError info about process access
 * ```
 */
export class SandboxError extends DoError {
  /** The resource or API that was blocked */
  readonly blockedResource: string

  /** Category of the sandbox violation */
  readonly violationType: 'global_access' | 'eval' | 'import' | 'prototype_pollution' | 'other'

  /**
   * Create a new SandboxError
   *
   * @param blockedResource - The resource or API that was blocked
   * @param violationType - Category of the sandbox violation
   * @param message - Optional custom error message
   */
  constructor(
    blockedResource: string,
    violationType: 'global_access' | 'eval' | 'import' | 'prototype_pollution' | 'other' = 'other',
    message?: string
  ) {
    super(
      DoErrorCode.SANDBOX_VIOLATION,
      message ?? `Sandbox security violation: access to '${blockedResource}' is not allowed`,
      { blockedResource, violationType }
    )
    this.name = 'SandboxError'
    this.blockedResource = blockedResource
    this.violationType = violationType
  }

  /**
   * List of blocked global variables in the sandbox
   */
  static readonly BLOCKED_GLOBALS = [
    'process',
    'require',
    '__dirname',
    '__filename',
    'Buffer',
    'fs',
    'path',
    'child_process',
    'module',
    'exports',
    'global',
  ] as const

  /**
   * Check if a variable name is blocked in the sandbox
   *
   * @param name - Variable name to check
   * @returns True if the variable is blocked
   */
  static isBlocked(name: string): boolean {
    return SandboxError.BLOCKED_GLOBALS.includes(name as typeof SandboxError.BLOCKED_GLOBALS[number])
  }
}

/**
 * Error thrown when code execution fails due to a runtime error.
 *
 * This is the most common error type, wrapping JavaScript runtime errors
 * like TypeError, ReferenceError, RangeError, etc.
 *
 * @example
 * ```typescript
 * const result = await doInstance.do('null.foo')
 * // result.success === false
 * // result.error contains ExecutionError with original TypeError info
 * ```
 */
export class ExecutionError extends DoError {
  /** Original error type (e.g., 'TypeError', 'ReferenceError') */
  readonly originalType: string

  /** Line number where error occurred (if available) */
  readonly line?: number

  /** Column number where error occurred (if available) */
  readonly column?: number

  /**
   * Create a new ExecutionError
   *
   * @param message - Error message
   * @param originalType - Original error type
   * @param options - Additional error context
   */
  constructor(
    message: string,
    originalType: string = 'Error',
    options?: { line?: number; column?: number; stack?: string }
  ) {
    super(DoErrorCode.EXECUTION_ERROR, message, { originalType, ...options })
    this.name = 'ExecutionError'
    this.originalType = originalType
    this.line = options?.line
    this.column = options?.column
    if (options?.stack) {
      this.stack = options.stack
    }
  }

  /**
   * Create an ExecutionError from an unknown runtime error
   *
   * @param error - Unknown error to wrap
   * @returns ExecutionError instance
   */
  static from(error: unknown): ExecutionError {
    if (error instanceof ExecutionError) {
      return error
    }

    if (error instanceof Error) {
      // Parse line/column from stack trace
      const location = ExecutionError.parseLocation(error.stack)
      return new ExecutionError(error.message, error.name, {
        ...location,
        stack: error.stack,
      })
    }

    return new ExecutionError(String(error))
  }

  /**
   * Parse line and column numbers from a stack trace
   *
   * @param stack - Stack trace string
   * @returns Object with line and column if found
   */
  private static parseLocation(stack?: string): { line?: number; column?: number } {
    if (!stack) return {}

    // Match patterns like ":10:5" or ":10:5)"
    const match = stack.match(/:(\d+):(\d+)\)?/)
    if (match) {
      return {
        line: parseInt(match[1], 10),
        column: parseInt(match[2], 10),
      }
    }

    return {}
  }
}

/**
 * Error thrown when code execution exceeds memory limits.
 *
 * Note: In Node.js, true memory limits require worker threads or external
 * isolation. This error is thrown when approximate memory tracking detects
 * excessive allocation.
 *
 * @example
 * ```typescript
 * const result = await doInstance.do('new Array(1e9).fill(0)', { memory: 100 * 1024 * 1024 })
 * // May throw MemoryError if limit exceeded
 * ```
 */
export class MemoryError extends DoError {
  /** Configured memory limit in bytes */
  readonly limit: number

  /** Actual memory used in bytes (if measurable) */
  readonly used?: number

  /**
   * Create a new MemoryError
   *
   * @param limit - Configured memory limit in bytes
   * @param used - Actual memory used in bytes
   * @param message - Optional custom error message
   */
  constructor(limit: number, used?: number, message?: string) {
    super(
      DoErrorCode.MEMORY_EXCEEDED,
      message ?? `Memory limit exceeded: ${used ? `${used} bytes used, ` : ''}limit is ${limit} bytes`,
      { limit, used }
    )
    this.name = 'MemoryError'
    this.limit = limit
    this.used = used
  }
}
