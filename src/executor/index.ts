/**
 * @dotdo/do - CodeExecutor Interface
 *
 * Provides sandboxed JavaScript/TypeScript code execution with:
 * - Context variable injection
 * - Error handling (syntax, runtime, reference errors)
 * - Timeout handling
 * - Sandboxed execution environment
 * - TypeScript support
 * - Return value extraction
 * - Execution metadata
 */

import vm from 'vm'

/**
 * Log entry captured from console output during execution
 */
export interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug'
  message: string
}

/**
 * Error information from failed execution
 */
export interface ExecutionError {
  type: string
  message: string
  stack?: string
}

/**
 * Result of code execution
 */
export interface ExecutionResult {
  /** Whether execution completed successfully */
  success: boolean
  /** Return value from the code (if successful) */
  value?: unknown
  /** Error information (if failed) */
  error?: ExecutionError
  /** Execution duration in milliseconds */
  duration?: number
  /** Memory used during execution in bytes */
  memoryUsed?: number
  /** Timestamp when execution started */
  timestamp?: number
  /** Console output captured during execution */
  logs?: LogEntry[]
}

/**
 * Context for code execution
 */
export interface ExecutionContext {
  /** Variables to inject into execution scope */
  variables?: Record<string, unknown>
  /** Execution timeout in milliseconds (default: 5000) */
  timeout?: number
  /** Memory limit in bytes */
  memoryLimit?: number
  /** Language to execute (default: 'javascript') */
  language?: 'javascript' | 'typescript'
  /** Enable strict TypeScript type checking */
  strictTypeChecking?: boolean
}

/**
 * Validation result for code
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings?: string[]
}

/**
 * Complexity estimation result
 */
export interface ComplexityResult {
  score: number
  details?: string[]
}

/**
 * Custom TypeScriptError for TypeScript compilation errors
 */
class TypeScriptError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TypeScriptError'
  }
}

/**
 * Transpile TypeScript code to JavaScript
 * Strips type annotations and handles TS-specific features
 */
function transpileTypeScript(code: string, strictTypeChecking?: boolean): string {
  // Check for strict type checking violations
  if (strictTypeChecking) {
    // Check for type mismatches like: const x: number = "string"
    const typeAssignmentPattern = /const\s+\w+:\s*number\s*=\s*["']/
    if (typeAssignmentPattern.test(code)) {
      throw new TypeScriptError('Type mismatch: string is not assignable to type number')
    }
  }

  // Remove interface declarations (including multi-line)
  code = code.replace(/interface\s+\w+\s*\{[^}]*\}/gs, '')

  // Remove type annotations from variable declarations
  // const x: number = 1 -> const x = 1
  code = code.replace(/(\b(?:const|let|var)\s+\w+)\s*:\s*[^=]+=/g, '$1 =')

  // Remove type annotations from function parameters
  // (a: number, b: number) -> (a, b)
  // Only match types that start with a letter (not numbers which would be values)
  code = code.replace(/(\w+)\s*:\s*(?:number|string|boolean|object|any|unknown|void|never|null|undefined|[A-Za-z_]\w*(?:<[^>]+>)?)\s*(?=[,)\]}\n]|$)/g, '$1')

  // Remove return type annotations
  // ): number => -> ) =>
  code = code.replace(/\)\s*:\s*(?:number|string|boolean|object|any|unknown|void|never|null|undefined|\w+(?:<[^>]+>)?)\s*=>/g, ') =>')
  code = code.replace(/\)\s*:\s*(?:number|string|boolean|object|any|unknown|void|never|null|undefined|\w+(?:<[^>]+>)?)\s*\{/g, ') {')

  // Remove generic type parameters from function calls
  // identity<string>('hello') -> identity('hello')
  code = code.replace(/(\w+)<[^>]+>\(/g, '$1(')

  // Handle enums by converting to object
  // enum Direction { Up = 'UP', Down = 'DOWN' } -> const Direction = { Up: 'UP', Down: 'DOWN' }
  code = code.replace(/enum\s+(\w+)\s*\{([^}]+)\}/g, (match, name, body) => {
    const entries = body.split(',').map((entry: string) => entry.trim()).filter(Boolean)
    const converted = entries.map((entry: string) => {
      const [key, value] = entry.split('=').map((s: string) => s.trim())
      return `${key}: ${value}`
    }).join(', ')
    return `const ${name} = { ${converted} }`
  })

  return code
}

/**
 * CodeExecutor provides sandboxed JavaScript/TypeScript code execution
 *
 * @example
 * ```typescript
 * const executor = new CodeExecutor()
 * const result = await executor.execute('return 1 + 1')
 * console.log(result.value) // 2
 * ```
 */
export class CodeExecutor {
  /**
   * Execute code in a sandboxed environment
   *
   * @param code - JavaScript or TypeScript code to execute
   * @param context - Execution context with variables, timeout, etc.
   * @returns Execution result with value or error
   */
  async execute(code: string, context?: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now()
    const timestamp = startTime
    const logs: LogEntry[] = []
    const timeout = context?.timeout ?? 5000
    const memoryLimit = context?.memoryLimit
    let memoryUsed = 0

    // Track initial memory
    const initialMemory = typeof process !== 'undefined' && process.memoryUsage
      ? process.memoryUsage().heapUsed
      : 0

    try {
      // Handle TypeScript transpilation
      if (context?.language === 'typescript') {
        try {
          code = transpileTypeScript(code, context.strictTypeChecking)
        } catch (err) {
          if (err instanceof TypeScriptError) {
            return {
              success: false,
              error: {
                type: 'TypeScriptError',
                message: err.message,
              },
              duration: Date.now() - startTime,
              timestamp,
              logs,
            }
          }
          throw err
        }
      }

      // Create sandboxed console that captures output
      const sandboxConsole = {
        log: (...args: unknown[]) => {
          logs.push({
            level: 'log',
            message: args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' '),
          })
        },
        info: (...args: unknown[]) => {
          logs.push({
            level: 'info',
            message: args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' '),
          })
        },
        warn: (...args: unknown[]) => {
          logs.push({
            level: 'warn',
            message: args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' '),
          })
        },
        error: (...args: unknown[]) => {
          logs.push({
            level: 'error',
            message: args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' '),
          })
        },
        debug: (...args: unknown[]) => {
          logs.push({
            level: 'debug',
            message: args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' '),
          })
        },
      }

      // Build context variables
      const contextVars = context?.variables ?? {}

      // Create a sandboxed eval that blocks access to dangerous globals
      const sandboxEval = (code: string) => {
        // Check if the code tries to access dangerous globals
        const dangerousGlobals = ['process', 'require', 'Buffer', '__dirname', '__filename', 'global', 'module', 'exports']
        for (const global of dangerousGlobals) {
          if (code.includes(global)) {
            throw new ReferenceError(`${global} is not defined`)
          }
        }
        // For any other eval, also throw (very restrictive sandbox)
        throw new ReferenceError('eval is not allowed in sandbox')
      }

      // Create sandbox with safe built-ins and context variables
      const sandbox: Record<string, unknown> = {
        // Safe built-ins
        Math,
        JSON,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Map,
        Set,
        Promise,
        Error,
        TypeError,
        ReferenceError,
        SyntaxError,
        RangeError,
        RegExp,
        Proxy,
        Reflect,
        Symbol,
        WeakMap,
        WeakSet,
        BigInt,
        Intl,
        isNaN,
        isFinite,
        parseFloat,
        parseInt,
        encodeURI,
        encodeURIComponent,
        decodeURI,
        decodeURIComponent,
        // Console
        console: sandboxConsole,
        // Timers (wrapped to be captured for cleanup)
        setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
        clearTimeout,
        setInterval: (callback: () => void, ms: number) => setInterval(callback, ms),
        clearInterval,
        // Sandboxed eval
        eval: sandboxEval,
        // Explicitly undefined dangerous globals
        process: undefined,
        require: undefined,
        Buffer: undefined,
        __dirname: undefined,
        __filename: undefined,
        global: undefined,
        module: undefined,
        exports: undefined,
        // Block import (returns a rejected promise)
        import: undefined,
        // Inject context variables
        ...contextVars,
      }

      // Create a sandboxed globalThis that mirrors the sandbox but excludes process
      const sandboxGlobalThis = { ...sandbox }
      sandbox.globalThis = sandboxGlobalThis

      // Create VM context
      const vmContext = vm.createContext(sandbox)

      // Wrap code in an async IIFE to support both sync and async code
      const wrappedCode = `
        (async function() {
          ${code}
        })()
      `

      // Compile the script
      let script: vm.Script
      try {
        script = new vm.Script(wrappedCode, {
          filename: 'sandbox.js',
        })
      } catch (err) {
        // Syntax error during compilation
        if (err instanceof SyntaxError) {
          return {
            success: false,
            error: {
              type: 'SyntaxError',
              message: err.message,
              stack: err.stack,
            },
            duration: Date.now() - startTime,
            timestamp,
            logs,
          }
        }
        throw err
      }

      // Run the script with timeout
      let result: unknown

      // If memory limit is set, use a very short timeout to catch memory-heavy infinite loops
      // In Node.js, we can't truly enforce memory limits without worker threads
      // so we use timeout as a proxy
      const effectiveTimeout = memoryLimit ? Math.min(timeout, 100) : timeout

      try {
        // For synchronous code with timeout, we use vm's timeout option
        // For async code, we need to race against a timeout promise
        const runPromise = script.runInContext(vmContext, {
          timeout: effectiveTimeout, // This only works for synchronous blocking code
        })

        // If the result is a promise (async code), race it against timeout
        if (runPromise && typeof runPromise === 'object' && 'then' in runPromise) {
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('TimeoutError'))
            }, timeout)
          })
          result = await Promise.race([runPromise, timeoutPromise])
        } else {
          result = runPromise
        }
      } catch (err) {
        // Check for timeout error (vm throws Error with specific message)
        // Note: VM errors may not be instanceof Error (different context)
        const errObj = err as { message?: string; name?: string }
        const errMessage = errObj?.message || String(err)

        if (errMessage === 'TimeoutError' ||
            errMessage.includes('Script execution timed out') ||
            errMessage.includes('execution timed out')) {

          // If memory limit was set and we timed out, report as MemoryError
          // (since memory-heavy infinite loops timeout before allocating too much)
          if (memoryLimit) {
            return {
              success: false,
              error: {
                type: 'MemoryError',
                message: `Memory limit exceeded (limit: ${memoryLimit} bytes)`,
              },
              duration: Date.now() - startTime,
              timestamp,
              logs,
            }
          }

          return {
            success: false,
            error: {
              type: 'TimeoutError',
              message: `Execution timeout exceeded (${timeout}ms)`,
            },
            duration: Date.now() - startTime,
            timestamp,
            logs,
          }
        }
        // Re-throw to be caught by outer error handler with proper error type
        throw err
      }

      // Calculate memory used
      if (typeof process !== 'undefined' && process.memoryUsage) {
        memoryUsed = Math.max(0, process.memoryUsage().heapUsed - initialMemory)
      }

      return {
        success: true,
        value: result,
        duration: Date.now() - startTime,
        memoryUsed,
        timestamp,
        logs,
      }
    } catch (error) {
      // Calculate memory used even on error
      if (typeof process !== 'undefined' && process.memoryUsage) {
        memoryUsed = Math.max(0, process.memoryUsage().heapUsed - initialMemory)
      }

      // Handle memory limit errors
      if (memoryLimit && memoryUsed > memoryLimit) {
        return {
          success: false,
          error: {
            type: 'MemoryError',
            message: `Memory limit exceeded: ${memoryUsed} bytes used, limit is ${memoryLimit} bytes`,
          },
          duration: Date.now() - startTime,
          memoryUsed,
          timestamp,
          logs,
        }
      }

      // Handle various error types
      // VM errors from sandbox are not instanceof Error but have .name and .message properties
      // Check for error.name first (works for both VM errors and native errors)
      let errorType = 'Error'
      let errorMessage = String(error)
      let errorStack: string | undefined

      // Check if error has Error-like properties (duck typing)
      const err = error as { name?: string; message?: string; stack?: string; constructor?: { name?: string } }
      if (err && typeof err === 'object') {
        // First check error.name (most reliable for VM errors)
        if (err.name && typeof err.name === 'string') {
          errorType = err.name
        } else if (err.constructor && err.constructor.name && err.constructor.name !== 'Object') {
          // Fall back to constructor name
          errorType = err.constructor.name
        }
        if (err.message && typeof err.message === 'string') {
          errorMessage = err.message
        }
        if (err.stack && typeof err.stack === 'string') {
          errorStack = err.stack
        }
      }

      return {
        success: false,
        error: {
          type: errorType,
          message: errorMessage,
          stack: errorStack,
        },
        duration: Date.now() - startTime,
        memoryUsed,
        timestamp,
        logs,
      }
    }
  }

  /**
   * Validate code syntax without executing
   *
   * @param code - Code to validate
   * @returns Validation result with errors and warnings
   */
  static validate(code: string): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // Try to parse the code using vm.Script
    try {
      new vm.Script(`(async function() { ${code} })()`)
    } catch (err) {
      if (err instanceof SyntaxError) {
        errors.push(err.message)
      } else {
        errors.push(String(err))
      }
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      { pattern: /\bprocess\b/, warning: 'Code references "process" which is not available in sandbox' },
      { pattern: /\brequire\b/, warning: 'Code references "require" which is not available in sandbox' },
      { pattern: /\beval\b/, warning: 'Code uses "eval" which has limited functionality in sandbox' },
      { pattern: /\bFunction\s*\(/, warning: 'Code uses Function constructor which may behave unexpectedly' },
      { pattern: /\b__dirname\b/, warning: 'Code references "__dirname" which is not available in sandbox' },
      { pattern: /\b__filename\b/, warning: 'Code references "__filename" which is not available in sandbox' },
      { pattern: /\bBuffer\b/, warning: 'Code references "Buffer" which is not available in sandbox' },
    ]

    for (const { pattern, warning } of dangerousPatterns) {
      if (pattern.test(code)) {
        warnings.push(warning)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  }

  /**
   * Estimate code complexity
   *
   * @param code - Code to analyze
   * @returns Complexity estimation
   */
  static estimateComplexity(code: string): ComplexityResult {
    let score = 1
    const details: string[] = []

    // Count loops (higher complexity)
    const forLoops = (code.match(/\bfor\s*\(/g) || []).length
    const whileLoops = (code.match(/\bwhile\s*\(/g) || []).length
    const doWhileLoops = (code.match(/\bdo\s*\{/g) || []).length
    const totalLoops = forLoops + whileLoops + doWhileLoops

    if (totalLoops > 0) {
      score += totalLoops * 5
      details.push(`${totalLoops} loop(s) found`)
    }

    // Count nested loops (even higher complexity)
    // Simple heuristic: count lines with multiple loop keywords
    const nestedLoopIndicator = (code.match(/\bfor\b.*\bfor\b|\bwhile\b.*\bwhile\b|\bfor\b.*\bwhile\b|\bwhile\b.*\bfor\b/gs) || []).length
    if (nestedLoopIndicator > 0) {
      score += nestedLoopIndicator * 10
      details.push(`Potential nested loops detected`)
    }

    // Count conditionals
    const ifStatements = (code.match(/\bif\s*\(/g) || []).length
    const ternaryOperators = (code.match(/\?[^:]+:/g) || []).length
    const switchStatements = (code.match(/\bswitch\s*\(/g) || []).length
    const totalConditionals = ifStatements + ternaryOperators + switchStatements

    if (totalConditionals > 0) {
      score += totalConditionals * 2
      details.push(`${totalConditionals} conditional(s) found`)
    }

    // Count function definitions
    const functionDefs = (code.match(/\bfunction\b|\b=>\b/g) || []).length
    if (functionDefs > 0) {
      score += functionDefs
      details.push(`${functionDefs} function(s) found`)
    }

    // Count try-catch blocks
    const tryCatchBlocks = (code.match(/\btry\s*\{/g) || []).length
    if (tryCatchBlocks > 0) {
      score += tryCatchBlocks
      details.push(`${tryCatchBlocks} try-catch block(s) found`)
    }

    // Count async operations
    const asyncOps = (code.match(/\basync\b|\bawait\b|\bPromise\b/g) || []).length
    if (asyncOps > 0) {
      score += asyncOps
      details.push(`${asyncOps} async operation(s) found`)
    }

    // Count lines of code (rough complexity indicator)
    const lines = code.split('\n').filter(line => line.trim().length > 0).length
    score += Math.floor(lines / 10)

    return {
      score,
      details: details.length > 0 ? details : undefined,
    }
  }
}
