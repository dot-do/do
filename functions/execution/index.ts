/**
 * Execution Factory
 *
 * Main entry point for the execution layer. Routes operations to the
 * appropriate execution tier based on operation type and configuration.
 *
 * @module execution
 */

import type {
  ExecutionTier,
  ExecResult,
  ExecOptions,
  ESMModule,
  ModuleContext,
  ModuleResult,
  FileSystem,
} from '../../types/execution'

import { detectTier, getTierInfo } from './tiers'
import { executeNative } from './native'
import { executeRpc } from './rpc'
import { executeModule } from './esm'
import { executeSandbox } from './sandbox'
import { createFileSystem } from './fsx'

// Re-export tier utilities
export { detectTier, getTierInfo, EXECUTION_TIERS } from './tiers'

// Re-export filesystem
export { createFileSystem, type FileSystemBackend } from './fsx'

// Re-export tier executors
export { executeNative } from './native'
export { executeRpc } from './rpc'
export { executeModule } from './esm'
export { executeSandbox } from './sandbox'

/**
 * Execute an operation using the appropriate tier.
 *
 * The execution factory automatically selects the optimal tier based on:
 * 1. Explicit tier override in options
 * 2. Operation type detection
 * 3. Capability matching
 *
 * @param operation - The operation identifier (e.g., 'fs.readFile', 'jq.query')
 * @param args - Arguments for the operation
 * @param options - Execution options including optional tier override
 * @returns Promise resolving to the execution result
 *
 * @example
 * ```typescript
 * // Auto-detect tier
 * const result = await execute('fs.readFile', ['/path/to/file'])
 *
 * // Force specific tier
 * const result = await execute('compile', ['code'], { tier: 4 })
 * ```
 */
export async function execute(
  operation: string,
  args: unknown[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const startTime = performance.now()
  const tier = options.tier ?? detectTier(operation)

  try {
    let result: ExecResult

    switch (tier) {
      case 1:
        result = await executeNative(operation, args, options)
        break
      case 2:
        result = await executeRpc(operation, args, options)
        break
      case 3:
        result = await executeModule(operation, args, options)
        break
      case 4:
        result = await executeSandbox(operation, args, options)
        break
      default:
        result = {
          success: false,
          tier,
          duration: performance.now() - startTime,
          error: {
            code: 'INVALID_TIER',
            message: `Invalid execution tier: ${tier}`,
          },
        }
    }

    // Ensure duration is set
    if (!result.duration) {
      result.duration = performance.now() - startTime
    }

    return result
  } catch (error) {
    return {
      success: false,
      tier,
      duration: performance.now() - startTime,
      error: {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    }
  }
}

/**
 * Execute an ESM module with the given context.
 *
 * @param module - The ESM module definition
 * @param context - Execution context with globals and constraints
 * @returns Promise resolving to the module execution result
 *
 * @example
 * ```typescript
 * const module: ESMModule = {
 *   name: 'my-module',
 *   module: 'export const add = (a, b) => a + b',
 * }
 *
 * const result = await runModule(module, {
 *   timeout: 5000,
 *   memoryLimit: 50 * 1024 * 1024,
 * })
 * ```
 */
export async function runModule(
  module: ESMModule,
  context: ModuleContext = {}
): Promise<ModuleResult> {
  return executeModule('esm.run', [module, context], {
    timeout: context.timeout,
  })
}

/**
 * Execute a bash command in the sandbox.
 *
 * @param command - The bash command to execute
 * @param options - Execution options
 * @returns Promise resolving to the bash execution result
 *
 * @example
 * ```typescript
 * const result = await bash('ls -la /tmp')
 * console.log(result.stdout)
 * ```
 */
export async function bash(
  command: string,
  options: ExecOptions = {}
): Promise<ExecResult> {
  return execute('bash', [command], { ...options, tier: 4 })
}

/**
 * Create a scoped execution context with shared filesystem.
 *
 * @param backend - Filesystem backend type
 * @returns Scoped executor with shared state
 *
 * @example
 * ```typescript
 * const ctx = createExecutionContext('memory')
 * await ctx.fs.writeFile('/data.json', '{}')
 * const result = await ctx.execute('fs.readFile', ['/data.json'])
 * ```
 */
export function createExecutionContext(backend: 'memory' | 'r2' | 'kv' = 'memory') {
  const fs = createFileSystem(backend)

  return {
    fs,

    /**
     * Execute an operation within this context
     */
    execute: (operation: string, args: unknown[] = [], options: ExecOptions = {}) =>
      execute(operation, args, { ...options, cwd: options.cwd ?? '/' }),

    /**
     * Run an ESM module within this context
     */
    runModule: (module: ESMModule, context: ModuleContext = {}) =>
      runModule(module, context),

    /**
     * Execute bash within this context
     */
    bash: (command: string, options: ExecOptions = {}) => bash(command, options),
  }
}

/**
 * Default execution context with memory filesystem.
 */
export const defaultContext = createExecutionContext('memory')
