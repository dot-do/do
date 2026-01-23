/**
 * Bashx - Shell Execution Layer
 *
 * DO-native shell execution. Covers 90% of compute needs without
 * requiring a full container/VM. Runs directly in the Durable Object.
 *
 * @module tools/computer/bashx
 */

import type { ExecutionContext, CommandResult } from '../types'

// =============================================================================
// Bashx Interface
// =============================================================================

/**
 * Execute a shell command in the DO environment
 *
 * @param command - Shell command to execute
 * @param context - Execution context (cwd, env, timeout)
 * @returns Command result with stdout, stderr, exit code
 *
 * @example
 * ```typescript
 * // Simple command
 * const result = await bashx.exec('ls -la')
 *
 * // With working directory
 * const result = await bashx.exec('npm install', { cwd: '/project' })
 *
 * // With environment variables
 * const result = await bashx.exec('node script.js', {
 *   env: { NODE_ENV: 'production' }
 * })
 * ```
 */
export async function exec(command: string, context?: ExecutionContext): Promise<CommandResult> {
  const startTime = Date.now()

  // TODO: Implement actual shell execution
  // In CF Workers environment, this would need to use a sandboxed approach
  // For now, return a placeholder result

  return {
    success: true,
    exitCode: 0,
    stdout: `[bashx] Would execute: ${command}`,
    stderr: '',
    duration: Date.now() - startTime,
  }
}

/**
 * Execute multiple commands in sequence
 *
 * @param commands - Array of commands to execute
 * @param context - Execution context
 * @returns Array of command results
 *
 * @example
 * ```typescript
 * const results = await bashx.execMany([
 *   'npm install',
 *   'npm run build',
 *   'npm test',
 * ], { cwd: '/project' })
 * ```
 */
export async function execMany(commands: string[], context?: ExecutionContext): Promise<CommandResult[]> {
  const results: CommandResult[] = []

  for (const command of commands) {
    const result = await exec(command, context)
    results.push(result)

    // Stop on failure
    if (!result.success) {
      break
    }
  }

  return results
}

/**
 * Execute command with streaming output
 *
 * @param command - Shell command to execute
 * @param onStdout - Callback for stdout data
 * @param onStderr - Callback for stderr data
 * @param context - Execution context
 * @returns Final command result
 *
 * @example
 * ```typescript
 * const result = await bashx.execStream(
 *   'npm install',
 *   (data) => console.log('[stdout]', data),
 *   (data) => console.error('[stderr]', data),
 *   { cwd: '/project' }
 * )
 * ```
 */
export async function execStream(
  command: string,
  onStdout: (data: string) => void,
  onStderr: (data: string) => void,
  context?: ExecutionContext
): Promise<CommandResult> {
  // TODO: Implement streaming execution
  const result = await exec(command, context)
  if (result.stdout) onStdout(result.stdout)
  if (result.stderr) onStderr(result.stderr)
  return result
}

/**
 * Execute command and return stdout as string (convenience)
 *
 * @param command - Shell command to execute
 * @param context - Execution context
 * @returns stdout string
 * @throws Error if command fails
 *
 * @example
 * ```typescript
 * const version = await bashx.run('node --version')
 * console.log(version) // "v20.0.0"
 * ```
 */
export async function run(command: string, context?: ExecutionContext): Promise<string> {
  const result = await exec(command, context)
  if (!result.success) {
    throw new Error(`Command failed: ${result.stderr || result.stdout}`)
  }
  return result.stdout.trim()
}

/**
 * Check if a command exists
 *
 * @param command - Command name to check
 * @returns True if command is available
 *
 * @example
 * ```typescript
 * if (await bashx.which('docker')) {
 *   await bashx.exec('docker build .')
 * }
 * ```
 */
export async function which(command: string): Promise<boolean> {
  const result = await exec(`which ${command}`)
  return result.success && result.exitCode === 0
}

// =============================================================================
// Bashx Namespace Export
// =============================================================================

export const bashx = {
  exec,
  execMany,
  execStream,
  run,
  which,
}
