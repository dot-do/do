/**
 * Codex - Secure Code Execution Layer
 *
 * Wraps ai-evaluate for secure JavaScript/TypeScript execution in a sandboxed
 * environment. Uses Cloudflare worker_loaders in production and Miniflare
 * for local development.
 *
 * Security Model:
 * - Runs code in isolated V8 isolates via Cloudflare workerd
 * - Network access blocked by default (fetch: null)
 * - Only safe JavaScript globals available
 * - SDK globals ($, db, ai, api) available when sdk: true
 *
 * @module tools/computer/codex
 */

import type { EvaluateOptions, EvaluateResult, SandboxEnv, TestResults as AITestResults } from 'ai-evaluate'

// =============================================================================
// Types
// =============================================================================

/**
 * Options for code execution
 */
export interface CodexOptions {
  /** Execution timeout in milliseconds (default: 5000) */
  timeout?: number
  /** Environment variables to pass to the sandbox */
  env?: Record<string, string>
  /** Enable SDK globals ($, db, ai, api) */
  sdk?: boolean
}

/**
 * Result from code execution
 */
export interface CodexResult {
  /** Whether execution succeeded */
  success: boolean
  /** Return value from script (if any) */
  value?: unknown
  /** Console output from execution */
  logs: Array<{ level: string; args: unknown[] }>
  /** Error message if execution failed */
  error?: string
  /** Execution time in milliseconds */
  duration: number
}

/**
 * Results from test execution
 */
export interface TestResults {
  /** Total number of tests */
  total: number
  /** Number of passed tests */
  passed: number
  /** Number of failed tests */
  failed: number
  /** Individual test results */
  tests: Array<{ name: string; passed: boolean; error?: string }>
}

/**
 * Validation result for type checking
 */
export interface ValidationResult {
  /** Whether the module is valid against the types */
  valid: boolean
  /** Validation errors if invalid */
  errors?: string[]
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Wraps a promise with a timeout that rejects if the operation takes too long.
 * Used to enforce CPU timeout for sandbox execution.
 */
async function withTimeout<T>(promise: Promise<T>, timeout: number, timeoutMessage: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeout)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId!)
  }
}

/**
 * Convert ai-evaluate log format to CodexResult log format
 */
function convertLogs(aiLogs: Array<{ level: string; message: string; timestamp: number }>): Array<{ level: string; args: unknown[] }> {
  return aiLogs.map((log) => ({
    level: log.level,
    args: [log.message],
  }))
}

/**
 * Parse type declarations to extract export info
 */
function parseTypeDeclarations(types: string): Map<string, { kind: 'function' | 'const' | 'class'; arity?: number }> {
  const exports = new Map<string, { kind: 'function' | 'const' | 'class'; arity?: number }>()

  // Match function declarations: export declare function name(params): return
  const funcRegex = /export\s+declare\s+function\s+(\w+)\s*\(([^)]*)\)/g
  let match
  funcRegex.lastIndex = 0
  while ((match = funcRegex.exec(types)) !== null) {
    const name = match[1]
    const params = match[2].trim()
    const arity = params === '' ? 0 : params.split(',').length
    exports.set(name, { kind: 'function', arity })
  }

  // Match const declarations: export declare const name: type
  const constRegex = /export\s+declare\s+const\s+(\w+)\s*:/g
  constRegex.lastIndex = 0
  while ((match = constRegex.exec(types)) !== null) {
    exports.set(match[1], { kind: 'const' })
  }

  // Match class declarations: export declare class Name
  const classRegex = /export\s+declare\s+class\s+(\w+)/g
  classRegex.lastIndex = 0
  while ((match = classRegex.exec(types)) !== null) {
    exports.set(match[1], { kind: 'class' })
  }

  return exports
}

/**
 * Parse module code to extract export info
 */
function parseModuleExports(module: string): Map<string, { kind: 'function' | 'const' | 'class'; arity?: number }> {
  const exports = new Map<string, { kind: 'function' | 'const' | 'class'; arity?: number }>()

  // Match exported functions: export function name(params) or export async function name(params)
  const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g
  let match
  funcRegex.lastIndex = 0
  while ((match = funcRegex.exec(module)) !== null) {
    const name = match[1]
    const params = match[2].trim()
    const arity = params === '' ? 0 : params.split(',').length
    exports.set(name, { kind: 'function', arity })
  }

  // Match exported const: export const name = value
  const constRegex = /export\s+const\s+(\w+)\s*=/g
  constRegex.lastIndex = 0
  while ((match = constRegex.exec(module)) !== null) {
    exports.set(match[1], { kind: 'const' })
  }

  // Match exported let: export let name = value
  const letRegex = /export\s+let\s+(\w+)\s*=/g
  letRegex.lastIndex = 0
  while ((match = letRegex.exec(module)) !== null) {
    exports.set(match[1], { kind: 'const' })
  }

  // Match exported class: export class Name
  const classRegex = /export\s+class\s+(\w+)/g
  classRegex.lastIndex = 0
  while ((match = classRegex.exec(module)) !== null) {
    exports.set(match[1], { kind: 'class' })
  }

  return exports
}

/**
 * Convert ESM module to executable code with exports in global scope
 */
function convertToExecutable(module: string): string {
  let code = module

  // Replace export function with regular function
  code = code.replace(/export\s+(async\s+)?function\s+(\w+)/g, '$1function $2')

  // Replace export const with regular const
  code = code.replace(/export\s+const\s+/g, 'const ')

  // Replace export let with regular let
  code = code.replace(/export\s+let\s+/g, 'let ')

  // Replace export class with regular class
  code = code.replace(/export\s+class\s+/g, 'class ')

  return code
}

/**
 * Extract export names from module
 */
function extractExportNames(module: string): string[] {
  const names: string[] = []

  // Match export function name
  const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)/g
  let match
  funcRegex.lastIndex = 0
  while ((match = funcRegex.exec(module)) !== null) {
    names.push(match[1])
  }

  // Match export const name
  const constRegex = /export\s+const\s+(\w+)/g
  constRegex.lastIndex = 0
  while ((match = constRegex.exec(module)) !== null) {
    names.push(match[1])
  }

  // Match export let name
  const letRegex = /export\s+let\s+(\w+)/g
  letRegex.lastIndex = 0
  while ((match = letRegex.exec(module)) !== null) {
    names.push(match[1])
  }

  // Match export class name
  const classRegex = /export\s+class\s+(\w+)/g
  classRegex.lastIndex = 0
  while ((match = classRegex.exec(module)) !== null) {
    names.push(match[1])
  }

  return names
}

// =============================================================================
// Environment Management
// =============================================================================

let sandboxEnv: SandboxEnv | undefined

/**
 * Set the sandbox environment (for Cloudflare Workers with worker_loaders)
 *
 * @param env - Environment with loader and TEST bindings
 */
export function setEnvironment(env: SandboxEnv): void {
  sandboxEnv = env
}

/**
 * Get the current sandbox environment
 */
export function getEnvironment(): SandboxEnv | undefined {
  return sandboxEnv
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Execute code in a secure sandbox
 *
 * Runs the provided script in an isolated V8 environment with:
 * - No network access by default
 * - Safe JavaScript globals only
 * - Optional SDK globals ($, db, ai, api)
 *
 * @param script - JavaScript/TypeScript code to execute
 * @param options - Execution options
 * @returns Execution result with value, logs, and duration
 *
 * @example
 * ```typescript
 * const result = await execute('return 1 + 1')
 * // { success: true, value: 2, logs: [], duration: 5 }
 *
 * const result = await execute(`
 *   console.log('Hello')
 *   return { answer: 42 }
 * `)
 * // { success: true, value: { answer: 42 }, logs: [...], duration: 10 }
 * ```
 */
export async function execute(script: string, options: CodexOptions = {}): Promise<CodexResult> {
  const { timeout = 5000, env, sdk = false } = options
  const startTime = Date.now()

  try {
    // Dynamic import to support both Node.js and Workers
    const { evaluate } = await import('ai-evaluate/node')

    // Wrap script to handle async/await properly
    let wrappedScript = script
    if (script.includes('await ')) {
      const hasReturn = /\breturn\b/.test(script)
      if (hasReturn) {
        wrappedScript = `return (async () => { ${script} })()`
      } else {
        const lines = script.trim().split('\n')
        const lastLine = lines[lines.length - 1].trim()
        if (lastLine && !/^\s*(const|let|var|if|for|while|switch|try|class|function|return|throw)\b/.test(lastLine)) {
          lines[lines.length - 1] = `return ${lastLine.replace(/;?\s*$/, '')}`
        }
        wrappedScript = `return (async () => { ${lines.join('\n')} })()`
      }
    }

    const evaluateOptions: EvaluateOptions = {
      script: wrappedScript,
      timeout,
      env,
      fetch: null, // Block network access
      sdk: sdk || undefined,
    }

    const result = await withTimeout(evaluate(evaluateOptions, sandboxEnv), timeout, 'CPU timeout limit exceeded')

    return {
      success: result.success,
      value: result.value,
      logs: convertLogs(result.logs),
      error: result.error,
      duration: result.duration,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    const normalizedError = errorMessage.includes('timeout') || errorMessage.includes('Timeout') || errorMessage.includes('CPU timeout') ? 'Script timeout limit exceeded' : errorMessage

    return {
      success: false,
      logs: [],
      error: normalizedError,
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Run vitest-style tests against a module
 *
 * Executes tests written using describe/it/expect syntax against
 * the provided module code.
 *
 * @param module - ESM module code with exports
 * @param tests - Test code using vitest syntax
 * @param options - Execution options
 * @returns Test results with pass/fail counts
 *
 * @example
 * ```typescript
 * const module = `
 *   export function add(a, b) {
 *     return a + b
 *   }
 * `
 *
 * const tests = `
 *   describe('add', () => {
 *     it('adds two numbers', () => {
 *       expect(add(1, 2)).toBe(3)
 *     })
 *   })
 * `
 *
 * const result = await test(module, tests)
 * // { total: 1, passed: 1, failed: 0, tests: [...] }
 * ```
 */
export async function test(module: string, tests: string, options: CodexOptions = {}): Promise<TestResults> {
  const { timeout = 5000, env, sdk = false } = options
  const startTime = Date.now()

  try {
    const { evaluate } = await import('ai-evaluate/node')

    // Convert ESM module to executable code with exports in global scope
    const executableModule = convertToExecutable(module)
    const exportNames = extractExportNames(module)

    // Build module code that exports to global scope for tests
    const moduleWithExports = `
// Block dangerous globals for security
globalThis.WebSocket = undefined;
globalThis.fetch = function() { throw new Error('fetch is not defined'); };

${executableModule}

// Export to global scope for tests
${exportNames.map((name) => `globalThis.${name} = ${name};`).join('\n')}
`

    const evaluateOptions: EvaluateOptions = {
      module: moduleWithExports,
      tests,
      timeout,
      env,
      fetch: null, // Block network access
      sdk: sdk || undefined,
    }

    const result = await withTimeout(evaluate(evaluateOptions, sandboxEnv), timeout, 'CPU timeout limit exceeded')

    if (!result.testResults) {
      return {
        total: 1,
        passed: 0,
        failed: 1,
        tests: [
          {
            name: result.error ? 'Module/Test parsing' : 'Test execution',
            passed: false,
            error: result.error || 'No test results returned',
          },
        ],
      }
    }

    return {
      total: result.testResults.total,
      passed: result.testResults.passed,
      failed: result.testResults.failed,
      tests: result.testResults.tests.map((t) => ({
        name: t.name,
        passed: t.passed,
        error: t.error,
      })),
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    const normalizedError = errorMessage.includes('timeout') || errorMessage.includes('Timeout') || errorMessage.includes('CPU timeout') ? 'Test timeout limit exceeded' : errorMessage

    return {
      total: 1,
      passed: 0,
      failed: 1,
      tests: [
        {
          name: 'Test execution',
          passed: false,
          error: normalizedError,
        },
      ],
    }
  }
}

/**
 * Validate that a module's exports match type declarations
 *
 * Performs static analysis to check:
 * - All declared exports exist in the module
 * - Export types match (function vs const vs class)
 * - Function arities match
 * - No undeclared exports in the module
 *
 * @param types - TypeScript type declarations
 * @param module - ESM module code
 * @returns Validation result with errors if invalid
 *
 * @example
 * ```typescript
 * const types = `
 *   export declare function add(a: number, b: number): number
 *   export declare const PI: number
 * `
 *
 * const module = `
 *   export function add(a, b) { return a + b }
 *   export const PI = 3.14159
 * `
 *
 * const result = await validate(types, module)
 * // { valid: true }
 * ```
 */
export async function validate(types: string, module: string): Promise<ValidationResult> {
  const errors: string[] = []

  try {
    const declaredExports = parseTypeDeclarations(types)
    const actualExports = parseModuleExports(module)

    // Check for missing exports (declared but not in module)
    for (const [name, info] of declaredExports) {
      const actual = actualExports.get(name)
      if (!actual) {
        errors.push(`Export '${name}' is declared in types (${info.kind}${info.arity !== undefined ? ` with ${info.arity} params` : ''}) but not found in module`)
        continue
      }

      // Check type mismatch (function vs const)
      if (info.kind !== actual.kind) {
        errors.push(`Export '${name}' is declared as ${info.kind} but implemented as ${actual.kind}`)
        continue
      }

      // Check arity mismatch for functions
      if (info.kind === 'function' && actual.kind === 'function') {
        if (info.arity !== undefined && actual.arity !== undefined && info.arity !== actual.arity) {
          errors.push(`Function '${name}' declares ${info.arity} parameter(s) in types but has ${actual.arity} parameter(s) in implementation`)
        }
      }
    }

    // Check for undeclared exports (in module but not declared)
    for (const [name] of actualExports) {
      if (!declaredExports.has(name)) {
        errors.push(`Export '${name}' is in module but not declared in type definitions`)
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  }
}

// =============================================================================
// Namespace Export
// =============================================================================

/**
 * Codex namespace - secure code execution utilities
 *
 * @example
 * ```typescript
 * import { codex } from './codex'
 *
 * // Execute code
 * const result = await codex.execute('return 1 + 1')
 *
 * // Run tests
 * const testResult = await codex.test(module, tests)
 *
 * // Validate types
 * const validation = await codex.validate(types, module)
 * ```
 */
export const codex = {
  execute,
  test,
  validate,
  setEnvironment,
  getEnvironment,
}
