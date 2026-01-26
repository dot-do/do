/**
 * objects.do Executor - Safe function execution
 *
 * Executes stringified functions in a controlled environment with
 * the $ context injected. Prevents access to dangerous globals.
 */

import type { DOContext, ExecutionResult } from './types'

// =============================================================================
// Execution Types
// =============================================================================

/**
 * Options for function execution
 */
export interface ExecuteOptions {
  /** Maximum execution time in milliseconds */
  timeout?: number

  /** Enable strict mode (more restrictions) */
  strict?: boolean
}

// =============================================================================
// Safe Function Execution
// =============================================================================

/**
 * List of dangerous globals that should be blocked
 */
const BLOCKED_GLOBALS = [
  'process',
  'require',
  'eval',
  'globalThis',
  'global',
  '__dirname',
  '__filename',
  'module',
  'exports',
  'importScripts',
]

/**
 * List of allowed globals in the execution context
 */
const ALLOWED_GLOBALS = [
  'console',
  'JSON',
  'Math',
  'Date',
  'Array',
  'Object',
  'String',
  'Number',
  'Boolean',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Promise',
  'Proxy',
  'Reflect',
  'Symbol',
  'Error',
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
  'URIError',
  'EvalError',
  'RegExp',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURI',
  'encodeURIComponent',
  'decodeURI',
  'decodeURIComponent',
  'undefined',
  'NaN',
  'Infinity',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'queueMicrotask',
  'atob',
  'btoa',
  'TextEncoder',
  'TextDecoder',
  'URL',
  'URLSearchParams',
  'Headers',
  'Request',
  'Response',
  'fetch',
  'AbortController',
  'AbortSignal',
  'Blob',
  'File',
  'FormData',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  'crypto',
  'performance',
  'structuredClone',
]

/**
 * Create a safe execution context with blocked globals
 */
function createSafeContext($: DOContext): Record<string, unknown> {
  const context: Record<string, unknown> = {
    $,
    // Explicitly add allowed globals
    console,
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Proxy,
    Reflect,
    Symbol,
    Error,
    TypeError,
    ReferenceError,
    SyntaxError,
    RangeError,
    URIError,
    EvalError,
    RegExp,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURI,
    encodeURIComponent,
    decodeURI,
    decodeURIComponent,
    undefined,
    NaN,
    Infinity,
  }

  // Add blocked globals as undefined to prevent access
  for (const name of BLOCKED_GLOBALS) {
    context[name] = undefined
  }

  return context
}

/**
 * Parse a stringified function to extract parameters and body
 */
export function parseFunction(code: string): { params: string[]; body: string; isAsync: boolean } {
  const trimmed = code.trim()

  // Match arrow function: async (a, b, c) => { ... } or async a => ...
  const arrowMatch = trimmed.match(/^(async\s+)?\(?\s*([^)=]*?)\s*\)?\s*=>\s*(.*)$/s)
  if (arrowMatch) {
    const isAsync = !!arrowMatch[1]
    const paramsStr = arrowMatch[2].trim()
    const body = arrowMatch[3].trim()

    const params = paramsStr ? paramsStr.split(',').map((p) => p.trim().split('=')[0].trim()).filter(Boolean) : []

    // Handle expression body vs block body
    if (body.startsWith('{')) {
      // Block body - remove outer braces
      const innerBody = body.slice(1, -1).trim()
      return { params, body: innerBody, isAsync }
    } else {
      // Expression body - wrap in return
      return { params, body: `return (${body})`, isAsync }
    }
  }

  // Match function expression: async function(a, b, c) { ... }
  const funcMatch = trimmed.match(/^(async\s+)?function\s*\w*\s*\(([^)]*)\)\s*\{(.*)\}$/s)
  if (funcMatch) {
    const isAsync = !!funcMatch[1]
    const paramsStr = funcMatch[2].trim()
    const body = funcMatch[3].trim()

    const params = paramsStr ? paramsStr.split(',').map((p) => p.trim().split('=')[0].trim()).filter(Boolean) : []

    return { params, body, isAsync }
  }

  // If we can't parse it, treat the whole thing as a function body
  return { params: [], body: code, isAsync: code.includes('await') }
}

/**
 * Execute a stringified function with the given context and parameters
 *
 * @param code - Stringified function code
 * @param $ - The DO context to inject
 * @param params - Parameters to pass to the function
 * @param options - Execution options
 * @returns Execution result
 */
export async function executeFunction<T = unknown>(
  code: string,
  $: DOContext,
  params: unknown[] = [],
  options: ExecuteOptions = {}
): Promise<ExecutionResult<T>> {
  const startTime = performance.now()

  try {
    const { params: funcParams, body, isAsync } = parseFunction(code)
    const context = createSafeContext($)

    // Build the function dynamically
    // We use Function constructor here, but with a controlled context
    const contextKeys = Object.keys(context)
    const contextValues = Object.values(context)

    // Create the function with context variables in scope
    const fnCode = isAsync
      ? `return (async function(${funcParams.join(', ')}) { ${body} })`
      : `return (function(${funcParams.join(', ')}) { ${body} })`

    // Create function factory with context in scope
    const factory = new Function(...contextKeys, fnCode)
    const fn = factory(...contextValues)

    // Execute with timeout if specified
    let result: T
    if (options.timeout) {
      result = await Promise.race([
        fn(...params),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Execution timeout')), options.timeout)),
      ])
    } else {
      result = await fn(...params)
    }

    return {
      success: true,
      result,
      duration: performance.now() - startTime,
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))

    // Check for security-related errors
    const isSecurityError =
      BLOCKED_GLOBALS.some((g) => err.message.includes(g)) ||
      err.message.includes('not defined') ||
      err.message.includes('not allowed') ||
      err.message.includes('forbidden')

    return {
      success: false,
      error: {
        code: isSecurityError ? 'SECURITY_ERROR' : 'EXECUTION_ERROR',
        message: err.message,
        stack: err.stack,
      },
      duration: performance.now() - startTime,
    }
  }
}

/**
 * Validate function code for obvious security issues
 * Returns true if the code appears safe, false otherwise
 */
export function validateFunctionCode(code: string): { valid: boolean; reason?: string } {
  // Check for direct access to blocked globals
  for (const global of BLOCKED_GLOBALS) {
    // Match standalone access (not as property)
    const regex = new RegExp(`\\b${global}\\b(?!\\s*[:\\]])`, 'g')
    if (regex.test(code)) {
      return { valid: false, reason: `Access to '${global}' is not allowed` }
    }
  }

  // Check for Function constructor usage
  if (/new\s+Function\s*\(/.test(code)) {
    return { valid: false, reason: 'Function constructor is not allowed' }
  }

  // Check for eval usage
  if (/\beval\s*\(/.test(code)) {
    return { valid: false, reason: 'eval is not allowed' }
  }

  return { valid: true }
}

/**
 * Extract parameter names from function code
 */
export function extractParams(code: string): string[] {
  const { params } = parseFunction(code)
  return params
}
