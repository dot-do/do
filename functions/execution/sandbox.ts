/**
 * Tier 4: Linux Sandbox Execution
 *
 * Executes operations in a full Linux sandbox environment for
 * operations requiring native binaries, compilers, or complete
 * isolation. Typical latency is 2-3 seconds for cold starts.
 *
 * @module execution/sandbox
 */

import type { ExecResult, ExecOptions, BashResult } from '../../types/execution'

/**
 * Sandbox configuration
 */
export interface SandboxConfig {
  /** Sandbox service URL */
  serviceUrl: string
  /** Authentication token */
  authToken?: string
  /** Default timeout in ms */
  timeout?: number
  /** Default memory limit in bytes */
  memoryLimit?: number
  /** Default CPU limit (cores) */
  cpuLimit?: number
  /** Default disk limit in bytes */
  diskLimit?: number
  /** Network access enabled */
  networkEnabled?: boolean
}

/**
 * Sandbox instance state
 */
export interface SandboxInstance {
  id: string
  status: 'creating' | 'running' | 'stopped' | 'error'
  createdAt: number
  config: SandboxConfig
}

/**
 * Default sandbox configuration
 */
const defaultConfig: SandboxConfig = {
  serviceUrl: 'https://sandbox.do',
  timeout: 30000,
  memoryLimit: 512 * 1024 * 1024, // 512MB
  cpuLimit: 1,
  diskLimit: 1024 * 1024 * 1024, // 1GB
  networkEnabled: false,
}

/**
 * Current sandbox configuration
 */
let currentConfig: SandboxConfig = { ...defaultConfig }

/**
 * Active sandbox instances
 */
const activeInstances: Map<string, SandboxInstance> = new Map()

/**
 * Execute an operation in the Linux sandbox.
 *
 * @param operation - The operation identifier (e.g., 'bash', 'compile')
 * @param args - Arguments for the operation
 * @param options - Execution options
 * @returns Promise resolving to the execution result
 *
 * @example
 * ```typescript
 * const result = await executeSandbox('bash', ['ls -la /tmp'])
 * console.log(result.output)
 * ```
 */
export async function executeSandbox(
  operation: string,
  args: unknown[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const startTime = performance.now()

  try {
    // Get or create sandbox instance
    const instance = await getOrCreateInstance(options)

    // Execute operation in sandbox
    const result = await executeInSandbox(instance, operation, args, options)

    return {
      success: true,
      tier: 4,
      duration: performance.now() - startTime,
      output: result,
    }
  } catch (error) {
    return {
      success: false,
      tier: 4,
      duration: performance.now() - startTime,
      error: {
        code: 'SANDBOX_ERROR',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    }
  }
}

/**
 * Execute a bash command in the sandbox.
 *
 * @param command - The bash command to execute
 * @param options - Execution options
 * @returns Promise resolving to bash execution result
 *
 * @example
 * ```typescript
 * const result = await executeBash('echo "Hello, World!"')
 * console.log(result.stdout) // "Hello, World!"
 * ```
 */
export async function executeBash(
  command: string,
  options: ExecOptions = {}
): Promise<BashResult> {
  const result = await executeSandbox('bash', [command], options)

  if (!result.success) {
    return {
      ...result,
      exitCode: 1,
      stdout: '',
      stderr: result.error?.message ?? 'Unknown error',
    }
  }

  const output = result.output as {
    exitCode?: number
    stdout?: string
    stderr?: string
    signal?: string
  }

  return {
    ...result,
    exitCode: output?.exitCode ?? 0,
    stdout: output?.stdout ?? '',
    stderr: output?.stderr ?? '',
    signal: output?.signal,
  }
}

/**
 * Get or create a sandbox instance.
 *
 * @param options - Execution options
 * @returns Sandbox instance
 */
async function getOrCreateInstance(options: ExecOptions): Promise<SandboxInstance> {
  // For now, create a new instance for each execution
  // In production, implement instance pooling
  const instanceId = crypto.randomUUID()

  const instance: SandboxInstance = {
    id: instanceId,
    status: 'creating',
    createdAt: Date.now(),
    config: { ...currentConfig },
  }

  activeInstances.set(instanceId, instance)

  // Request sandbox creation from service
  await createSandboxInstance(instance)

  instance.status = 'running'
  return instance
}

/**
 * Create a sandbox instance via the sandbox service.
 *
 * @param instance - Instance configuration
 */
async function createSandboxInstance(instance: SandboxInstance): Promise<void> {
  const { config } = instance

  const response = await fetch(`${config.serviceUrl}/instances`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.authToken && { Authorization: `Bearer ${config.authToken}` }),
    },
    body: JSON.stringify({
      id: instance.id,
      memoryLimit: config.memoryLimit,
      cpuLimit: config.cpuLimit,
      diskLimit: config.diskLimit,
      networkEnabled: config.networkEnabled,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to create sandbox: ${response.status}`)
  }
}

/**
 * Execute an operation in a sandbox instance.
 *
 * @param instance - Sandbox instance
 * @param operation - Operation to execute
 * @param args - Operation arguments
 * @param options - Execution options
 * @returns Operation result
 */
async function executeInSandbox(
  instance: SandboxInstance,
  operation: string,
  args: unknown[],
  options: ExecOptions
): Promise<unknown> {
  const { config } = instance
  const timeout = options.timeout ?? config.timeout ?? 30000

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`${config.serviceUrl}/instances/${instance.id}/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.authToken && { Authorization: `Bearer ${config.authToken}` }),
      },
      body: JSON.stringify({
        operation,
        args,
        env: options.env,
        cwd: options.cwd,
        timeout,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Sandbox execution failed: ${response.status} ${errorText}`)
    }

    return response.json()
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Destroy a sandbox instance.
 *
 * @param instanceId - Instance ID to destroy
 */
async function destroyInstance(instanceId: string): Promise<void> {
  const instance = activeInstances.get(instanceId)
  if (!instance) return

  try {
    await fetch(`${instance.config.serviceUrl}/instances/${instanceId}`, {
      method: 'DELETE',
      headers: {
        ...(instance.config.authToken && {
          Authorization: `Bearer ${instance.config.authToken}`,
        }),
      },
    })
  } finally {
    activeInstances.delete(instanceId)
  }
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configure the sandbox service.
 *
 * @param config - Sandbox configuration
 *
 * @example
 * ```typescript
 * configureSandbox({
 *   serviceUrl: 'https://my-sandbox.do',
 *   authToken: 'secret',
 *   memoryLimit: 1024 * 1024 * 1024, // 1GB
 * })
 * ```
 */
export function configureSandbox(config: Partial<SandboxConfig>): void {
  currentConfig = { ...currentConfig, ...config }
}

/**
 * Get current sandbox configuration.
 *
 * @returns Current configuration
 */
export function getSandboxConfig(): SandboxConfig {
  return { ...currentConfig }
}

/**
 * Reset sandbox configuration to defaults.
 */
export function resetSandboxConfig(): void {
  currentConfig = { ...defaultConfig }
}

// =============================================================================
// Instance Management
// =============================================================================

/**
 * Get active sandbox instances.
 *
 * @returns Array of active instances
 */
export function getActiveInstances(): SandboxInstance[] {
  return Array.from(activeInstances.values())
}

/**
 * Destroy all active instances.
 *
 * @returns Promise resolving when all instances are destroyed
 */
export async function destroyAllInstances(): Promise<void> {
  const destroyPromises = Array.from(activeInstances.keys()).map(destroyInstance)
  await Promise.all(destroyPromises)
}

/**
 * Clean up stale instances older than maxAge.
 *
 * @param maxAge - Maximum instance age in ms
 * @returns Number of instances cleaned up
 */
export async function cleanupStaleInstances(maxAge: number): Promise<number> {
  const now = Date.now()
  let cleaned = 0

  for (const [id, instance] of activeInstances) {
    if (now - instance.createdAt > maxAge) {
      await destroyInstance(id)
      cleaned++
    }
  }

  return cleaned
}

// =============================================================================
// Specialized Executors
// =============================================================================

/**
 * Compile code in the sandbox.
 *
 * @param language - Programming language
 * @param code - Source code
 * @param options - Compilation options
 * @returns Compilation result
 */
export async function compile(
  language: string,
  code: string,
  options: ExecOptions & { args?: string[] } = {}
): Promise<ExecResult> {
  const compilerMap: Record<string, string> = {
    c: 'gcc',
    cpp: 'g++',
    rust: 'rustc',
    go: 'go build',
    java: 'javac',
  }

  const compiler = compilerMap[language.toLowerCase()]
  if (!compiler) {
    return {
      success: false,
      tier: 4,
      duration: 0,
      error: {
        code: 'UNSUPPORTED_LANGUAGE',
        message: `Unsupported language: ${language}`,
      },
    }
  }

  return executeSandbox('compile', [language, code, compiler, options.args], options)
}

/**
 * Run a container image in the sandbox.
 *
 * @param image - Container image name
 * @param command - Command to run
 * @param options - Container options
 * @returns Container execution result
 */
export async function runContainer(
  image: string,
  command: string[],
  options: ExecOptions & {
    volumes?: Record<string, string>
    env?: Record<string, string>
  } = {}
): Promise<ExecResult> {
  return executeSandbox(
    'container',
    [image, command, options.volumes, options.env],
    options
  )
}

/**
 * Execute a Python script in the sandbox.
 *
 * @param script - Python script code
 * @param options - Execution options
 * @returns Script execution result
 */
export async function executePython(
  script: string,
  options: ExecOptions & { packages?: string[] } = {}
): Promise<BashResult> {
  const { packages = [] } = options

  // Install packages if needed
  if (packages.length > 0) {
    const installCmd = `pip install ${packages.join(' ')}`
    const installResult = await executeBash(installCmd, options)
    if (installResult.exitCode !== 0) {
      return installResult
    }
  }

  // Write script to temp file and execute
  const scriptPath = '/tmp/script.py'
  const writeCmd = `cat > ${scriptPath} << 'PYTHON_SCRIPT'\n${script}\nPYTHON_SCRIPT`
  await executeBash(writeCmd, options)

  return executeBash(`python3 ${scriptPath}`, options)
}

/**
 * Execute a Node.js script in the sandbox.
 *
 * @param script - JavaScript code
 * @param options - Execution options
 * @returns Script execution result
 */
export async function executeNode(
  script: string,
  options: ExecOptions & { packages?: string[] } = {}
): Promise<BashResult> {
  const { packages = [] } = options

  // Install packages if needed
  if (packages.length > 0) {
    const installCmd = `npm install ${packages.join(' ')}`
    const installResult = await executeBash(installCmd, options)
    if (installResult.exitCode !== 0) {
      return installResult
    }
  }

  // Write script to temp file and execute
  const scriptPath = '/tmp/script.js'
  const writeCmd = `cat > ${scriptPath} << 'NODE_SCRIPT'\n${script}\nNODE_SCRIPT`
  await executeBash(writeCmd, options)

  return executeBash(`node ${scriptPath}`, options)
}
