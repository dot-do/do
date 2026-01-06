/**
 * @module sandbox
 * @dotdo/do Sandbox Module
 *
 * Sandboxed code execution for the DO platform.
 *
 * This module provides multiple code executor implementations with varying
 * levels of security and runtime requirements:
 *
 * - **SimpleCodeExecutor**: Basic executor using Function constructor.
 *   Suitable for trusted code or development environments.
 *
 * - **WorkerCodeExecutor**: V8 isolate-based executor for Cloudflare Workers.
 *   Recommended for production use with untrusted code.
 *
 * - **MiniflareCodeExecutor**: Testing-focused executor with mocking support.
 *   Ideal for unit and integration tests.
 *
 * @example
 * ```typescript
 * // Simple usage
 * import { createCodeExecutor } from '@dotdo/do'
 *
 * const executor = createCodeExecutor()
 * const result = await executor.execute(
 *   'return 1 + 1',
 *   {},
 *   5000
 * )
 * console.log(result.value) // 2
 * ```
 *
 * @example
 * ```typescript
 * // Auto-detect best executor for environment
 * import { createExecutor } from '@dotdo/do'
 *
 * const executor = createExecutor({
 *   environment: 'auto', // or 'simple', 'worker', 'test'
 *   enableSecurityChecks: true
 * })
 * ```
 *
 * @security
 * All executors implement security measures including:
 * - Code length limits (100KB default)
 * - Dangerous pattern detection (eval, Function, prototype pollution)
 * - Timeout handling
 * - Sandboxed console
 *
 * For maximum security with untrusted code, use WorkerCodeExecutor
 * in a Cloudflare Workers environment.
 */

// Types
export * from './types'

// Core executor
export {
  SimpleCodeExecutor,
  createCodeExecutor,
  DangerousPatternError,
  CodeLengthError,
  validateCodeSecurity,
  validateCodeLength,
  MAX_CODE_LENGTH,
  DANGEROUS_PATTERNS,
  type ExecutorOptions,
  type ExecutionResultWithMetrics,
} from './executor'

// Worker executor
export {
  WorkerCodeExecutor,
  createWorkerExecutor,
  type WorkerExecutorOptions,
} from './worker-executor'

// Miniflare executor (for testing)
export {
  MiniflareCodeExecutor,
  createMiniflareExecutor,
  createTestExecutor,
  type MiniflareExecutorOptions,
} from './miniflare-executor'

// Context builder (re-export with explicit names to avoid conflicts)
export {
  buildExecutionContext,
  buildExecutionContextWithValidation,
  validateAllowedMethods,
  extractMethodSignature,
  getCategoryForMethod,
  type MethodMetadata,
  type ValidationWarning,
  type ContextBuilderResult,
  type ExecutionContext as ContextBuilderExecutionContext,
} from './context'

/**
 * Execution environment type for auto-detection.
 */
export type ExecutorEnvironment = 'auto' | 'simple' | 'worker' | 'test'

/**
 * Options for the universal executor factory.
 */
export interface CreateExecutorOptions {
  /**
   * Execution environment to use.
   * - 'auto': Auto-detect based on runtime environment
   * - 'simple': Use SimpleCodeExecutor
   * - 'worker': Use WorkerCodeExecutor
   * - 'test': Use MiniflareCodeExecutor
   * @default 'auto'
   */
  environment?: ExecutorEnvironment

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
   */
  additionalPatterns?: Array<{
    pattern: RegExp
    name: string
    description: string
  }>

  /**
   * Mock implementations for testing.
   * Only used when environment is 'test'.
   */
  mocks?: Record<string, unknown>

  /**
   * Custom fetch handler for worker environment.
   * Only used when environment is 'worker'.
   */
  fetchHandler?: (request: Request) => Promise<Response>
}

/**
 * Detect the current execution environment.
 *
 * @returns Detected environment type
 *
 * @internal
 */
function detectEnvironment(): 'worker' | 'test' | 'simple' {
  // Check for Cloudflare Workers environment
  if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as any).caches !== 'undefined' &&
    typeof (globalThis as any).HTMLRewriter !== 'undefined'
  ) {
    return 'worker'
  }

  // Check for test environment
  if (
    typeof process !== 'undefined' &&
    (process.env.NODE_ENV === 'test' ||
      process.env.VITEST === 'true' ||
      process.env.JEST_WORKER_ID !== undefined)
  ) {
    return 'test'
  }

  // Default to simple executor
  return 'simple'
}

/**
 * Create an executor instance based on the specified or detected environment.
 *
 * This is the recommended way to create executors as it automatically
 * selects the best implementation for your environment.
 *
 * @param options - Configuration options
 * @returns Configured code executor instance
 *
 * @example
 * ```typescript
 * // Auto-detect environment
 * const executor = createExecutor()
 *
 * // Force specific environment
 * const testExecutor = createExecutor({ environment: 'test' })
 * const workerExecutor = createExecutor({ environment: 'worker' })
 * ```
 *
 * @example
 * ```typescript
 * // With full options
 * const executor = createExecutor({
 *   environment: 'worker',
 *   maxCodeLength: 50000,
 *   enableSecurityChecks: true,
 *   fetchHandler: async (req) => fetch(req)
 * })
 * ```
 */
export function createExecutor(options: CreateExecutorOptions = {}): import('./types').CodeExecutor {
  const environment = options.environment === 'auto' || !options.environment
    ? detectEnvironment()
    : options.environment

  const baseOptions = {
    maxCodeLength: options.maxCodeLength,
    enableSecurityChecks: options.enableSecurityChecks,
    additionalPatterns: options.additionalPatterns,
  }

  switch (environment) {
    case 'worker':
      return new (require('./worker-executor').WorkerCodeExecutor)({
        ...baseOptions,
        fetchHandler: options.fetchHandler,
      })

    case 'test':
      return new (require('./miniflare-executor').MiniflareCodeExecutor)({
        ...baseOptions,
        mocks: options.mocks,
        verbose: process.env.DEBUG === 'true',
        simulateWorkerEnv: true,
      })

    case 'simple':
    default:
      return new (require('./executor').SimpleCodeExecutor)(baseOptions)
  }
}
