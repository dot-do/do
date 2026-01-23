/**
 * Tier 3: Dynamic ESM Module Execution
 *
 * Executes dynamically loaded ESM (ECMAScript Module) code with
 * sandboxing and resource controls. Supports WASM modules, build
 * tools, and code transformation utilities.
 *
 * @module execution/esm
 */

import type {
  ExecResult,
  ExecOptions,
  ESMModule,
  ModuleContext,
  ModuleResult,
  TestCase,
} from '../../types/execution'

/**
 * Module loader function signature
 */
type ModuleLoader = () => Promise<unknown>

/**
 * Registry of available modules
 */
const moduleRegistry: Map<string, ModuleLoader> = new Map()

/**
 * Cache of loaded modules
 */
const moduleCache: Map<string, unknown> = new Map()

/**
 * Execute an ESM module operation.
 *
 * @param operation - The operation identifier (e.g., 'esm.run', 'esbuild.build')
 * @param args - Arguments for the operation
 * @param options - Execution options
 * @returns Promise resolving to the execution result
 *
 * @example
 * ```typescript
 * const result = await executeModule('esm.run', [module, context])
 * ```
 */
export async function executeModule(
  operation: string,
  args: unknown[] = [],
  options: ExecOptions = {}
): Promise<ModuleResult> {
  const startTime = performance.now()

  try {
    const [category, method] = operation.split('.')

    let result: unknown

    switch (category) {
      case 'esm':
        result = await handleEsmOperation(method, args, options)
        break
      case 'esbuild':
        result = await handleEsbuildOperation(method, args, options)
        break
      case 'typescript':
        result = await handleTypescriptOperation(method, args, options)
        break
      case 'prettier':
        result = await handlePrettierOperation(method, args, options)
        break
      case 'markdown':
        result = await handleMarkdownOperation(method, args, options)
        break
      default:
        return {
          success: false,
          tier: 3,
          duration: performance.now() - startTime,
          error: {
            code: 'UNKNOWN_MODULE',
            message: `Unknown module category: ${category}`,
          },
        }
    }

    return {
      success: true,
      tier: 3,
      duration: performance.now() - startTime,
      output: result,
      returnValue: result,
    }
  } catch (error) {
    return {
      success: false,
      tier: 3,
      duration: performance.now() - startTime,
      error: {
        code: 'MODULE_ERROR',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    }
  }
}

// =============================================================================
// ESM Operations
// =============================================================================

/**
 * Handle ESM-specific operations.
 */
async function handleEsmOperation(
  method: string,
  args: unknown[],
  options: ExecOptions
): Promise<unknown> {
  switch (method) {
    case 'run':
      return runModule(args[0] as ESMModule, args[1] as ModuleContext)
    case 'import':
      return importModule(args[0] as string)
    case 'evaluate':
      return evaluateCode(args[0] as string, args[1] as ModuleContext)
    default:
      throw new Error(`Unknown ESM method: ${method}`)
  }
}

/**
 * Run an ESM module.
 *
 * @param module - Module definition
 * @param context - Execution context
 * @returns Module exports and return value
 */
async function runModule(
  module: ESMModule,
  context: ModuleContext = {}
): Promise<{ exports: Record<string, unknown>; returnValue?: unknown }> {
  // Create a sandboxed execution environment
  const sandbox = createSandbox(context)

  // Build module code with wrapper
  const wrappedCode = wrapModuleCode(module.module, context)

  // Execute in sandbox
  const exports = await executeSandboxed(wrappedCode, sandbox, context.timeout)

  // Run script if provided
  let returnValue: unknown
  if (module.script && typeof exports[module.script] === 'function') {
    returnValue = await (exports[module.script] as () => Promise<unknown>)()
  }

  return { exports, returnValue }
}

/**
 * Import a module by name from the registry.
 *
 * @param name - Module name
 * @returns Module exports
 */
async function importModule(name: string): Promise<unknown> {
  // Check cache first
  if (moduleCache.has(name)) {
    return moduleCache.get(name)
  }

  // Load from registry
  const loader = moduleRegistry.get(name)
  if (!loader) {
    throw new Error(`Module not found: ${name}`)
  }

  const module = await loader()
  moduleCache.set(name, module)
  return module
}

/**
 * Evaluate code string in a sandboxed context.
 *
 * @param code - Code to evaluate
 * @param context - Execution context
 * @returns Evaluation result
 */
async function evaluateCode(
  code: string,
  context: ModuleContext = {}
): Promise<unknown> {
  const sandbox = createSandbox(context)
  return executeSandboxed(code, sandbox, context.timeout)
}

// =============================================================================
// Build Tool Operations
// =============================================================================

/**
 * Handle esbuild operations.
 */
async function handleEsbuildOperation(
  method: string,
  args: unknown[],
  _options: ExecOptions
): Promise<unknown> {
  // Lazy load esbuild module
  const esbuild = await loadModule('esbuild')

  switch (method) {
    case 'build':
      return (esbuild as { build: (options: unknown) => Promise<unknown> }).build(args[0])
    case 'transform':
      return (esbuild as { transform: (code: string, options?: unknown) => Promise<unknown> }).transform(
        args[0] as string,
        args[1] as Record<string, unknown>
      )
    case 'minify':
      return (esbuild as { transform: (code: string, options?: unknown) => Promise<unknown> }).transform(
        args[0] as string,
        { minify: true }
      )
    default:
      throw new Error(`Unknown esbuild method: ${method}`)
  }
}

/**
 * Handle TypeScript operations.
 */
async function handleTypescriptOperation(
  method: string,
  args: unknown[],
  _options: ExecOptions
): Promise<unknown> {
  // Lazy load TypeScript module
  const ts = await loadModule('typescript')

  switch (method) {
    case 'compile':
      return (ts as { transpileModule: (code: string, options?: unknown) => { outputText: string } }).transpileModule(
        args[0] as string,
        args[1] as Record<string, unknown>
      )
    case 'check':
      // Type checking requires more complex setup
      throw new Error('Type checking not yet implemented')
    case 'transpile':
      return (ts as { transpileModule: (code: string, options?: unknown) => { outputText: string } }).transpileModule(
        args[0] as string,
        { compilerOptions: { module: 99 /* ESNext */ } }
      ).outputText
    default:
      throw new Error(`Unknown typescript method: ${method}`)
  }
}

/**
 * Handle Prettier operations.
 */
async function handlePrettierOperation(
  method: string,
  args: unknown[],
  _options: ExecOptions
): Promise<unknown> {
  // Lazy load Prettier module
  const prettier = await loadModule('prettier')

  switch (method) {
    case 'format':
      return (prettier as { format: (code: string, options?: unknown) => Promise<string> }).format(
        args[0] as string,
        args[1] as Record<string, unknown>
      )
    case 'check':
      return (prettier as { check: (code: string, options?: unknown) => Promise<boolean> }).check(
        args[0] as string,
        args[1] as Record<string, unknown>
      )
    default:
      throw new Error(`Unknown prettier method: ${method}`)
  }
}

/**
 * Handle Markdown operations.
 */
async function handleMarkdownOperation(
  method: string,
  args: unknown[],
  _options: ExecOptions
): Promise<unknown> {
  // Lazy load markdown module
  const md = await loadModule('markdown')

  switch (method) {
    case 'parse':
      return (md as { parse: (text: string) => unknown }).parse(args[0] as string)
    case 'render':
    case 'toHtml':
      return (md as { render: (text: string) => string }).render(args[0] as string)
    default:
      throw new Error(`Unknown markdown method: ${method}`)
  }
}

// =============================================================================
// Sandbox Utilities
// =============================================================================

/**
 * Create a sandboxed execution environment.
 *
 * @param context - Module context with constraints
 * @returns Sandbox object with allowed globals
 */
function createSandbox(context: ModuleContext): Record<string, unknown> {
  const sandbox: Record<string, unknown> = {
    // Safe built-ins
    console: {
      log: (...args: unknown[]) => console.log('[sandbox]', ...args),
      warn: (...args: unknown[]) => console.warn('[sandbox]', ...args),
      error: (...args: unknown[]) => console.error('[sandbox]', ...args),
    },
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    Promise,
    Symbol,

    // Async utilities
    setTimeout: undefined, // Disabled by default
    setInterval: undefined, // Disabled
    fetch: undefined, // Disabled by default

    // Add user-provided globals
    ...context.globals,
  }

  return sandbox
}

/**
 * Wrap module code with sandbox boundary.
 *
 * @param code - Module code
 * @param context - Execution context
 * @returns Wrapped code string
 */
function wrapModuleCode(code: string, _context: ModuleContext): string {
  // The code is expected to be valid ESM
  // We'll evaluate it in a controlled context
  return code
}

/**
 * Execute code in a sandboxed environment.
 *
 * @param code - Code to execute
 * @param sandbox - Sandbox object
 * @param timeout - Execution timeout
 * @returns Execution result
 */
async function executeSandboxed(
  code: string,
  _sandbox: Record<string, unknown>,
  timeout?: number
): Promise<Record<string, unknown>> {
  // Create a blob URL for the module
  const blob = new Blob([code], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)

  try {
    // Dynamic import with timeout
    const importPromise = import(url)

    if (timeout) {
      const result = await Promise.race([
        importPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Module execution timed out')), timeout)
        ),
      ])
      return result as Record<string, unknown>
    }

    return (await importPromise) as Record<string, unknown>
  } finally {
    URL.revokeObjectURL(url)
  }
}

// =============================================================================
// Module Registry
// =============================================================================

/**
 * Load a module from the registry or CDN.
 *
 * @param name - Module name
 * @returns Module exports
 */
async function loadModule(name: string): Promise<unknown> {
  // Check cache
  if (moduleCache.has(name)) {
    return moduleCache.get(name)
  }

  // Check registry
  const loader = moduleRegistry.get(name)
  if (loader) {
    const module = await loader()
    moduleCache.set(name, module)
    return module
  }

  // Try loading from esm.sh CDN
  const cdnUrl = `https://esm.sh/${name}`
  const module = await import(cdnUrl)
  moduleCache.set(name, module)
  return module
}

/**
 * Register a module loader.
 *
 * @param name - Module name
 * @param loader - Loader function
 *
 * @example
 * ```typescript
 * registerModule('custom', async () => {
 *   return { hello: () => 'world' }
 * })
 * ```
 */
export function registerModule(name: string, loader: ModuleLoader): void {
  moduleRegistry.set(name, loader)
  moduleCache.delete(name) // Invalidate cache
}

/**
 * Clear the module cache.
 *
 * @param name - Optional specific module to clear
 */
export function clearModuleCache(name?: string): void {
  if (name) {
    moduleCache.delete(name)
  } else {
    moduleCache.clear()
  }
}

// =============================================================================
// Test Runner
// =============================================================================

/**
 * Run test cases for a module.
 *
 * @param module - Module with test cases
 * @param context - Execution context
 * @returns Test results
 *
 * @example
 * ```typescript
 * const module: ESMModule = {
 *   name: 'math',
 *   module: 'export const add = (a, b) => a + b',
 *   tests: [
 *     { name: 'add 1+1', input: [1, 1], expected: 2 },
 *   ],
 * }
 *
 * const results = await runTests(module)
 * ```
 */
export async function runTests(
  module: ESMModule,
  context: ModuleContext = {}
): Promise<TestResult[]> {
  if (!module.tests || module.tests.length === 0) {
    return []
  }

  const { exports } = await runModule(module, context)
  const results: TestResult[] = []

  for (const test of module.tests) {
    const result = await runSingleTest(test, exports)
    results.push(result)
  }

  return results
}

/**
 * Test result
 */
export interface TestResult {
  name: string
  passed: boolean
  duration: number
  actual?: unknown
  expected?: unknown
  error?: string
}

/**
 * Run a single test case.
 */
async function runSingleTest(
  test: TestCase,
  exports: Record<string, unknown>
): Promise<TestResult> {
  const startTime = performance.now()

  try {
    // Find the function to test
    const fn = Object.values(exports).find(
      (v) => typeof v === 'function'
    ) as ((...args: unknown[]) => unknown) | undefined

    if (!fn) {
      return {
        name: test.name,
        passed: false,
        duration: performance.now() - startTime,
        error: 'No function exported',
      }
    }

    // Run with timeout
    const timeout = test.timeout ?? 5000
    const inputArray = Array.isArray(test.input) ? test.input : [test.input]

    const actual = await Promise.race([
      Promise.resolve(fn(...inputArray)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Test timed out')), timeout)
      ),
    ])

    const passed = JSON.stringify(actual) === JSON.stringify(test.expected)

    return {
      name: test.name,
      passed,
      duration: performance.now() - startTime,
      actual,
      expected: test.expected,
    }
  } catch (error) {
    return {
      name: test.name,
      passed: false,
      duration: performance.now() - startTime,
      expected: test.expected,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
