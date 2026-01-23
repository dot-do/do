/**
 * Computer Tools - DO-Native Execution Layers
 *
 * Layered execution capabilities for agents and workers:
 * 1. bashx - Shell execution (90% of needs, runs in DO)
 * 2. fsx - File system operations
 * 3. gitx - Git operations
 * 4. npx - Package execution
 * 5. sandbox - Full container/VM (when bashx isn't enough)
 *
 * @module tools/computer
 */

import type { ProviderConfig, ProviderHealth } from '../communication/types'
import type {
  ComputeProvider,
  ToolProviderInfo,
  CommandResult,
  FileInfo,
  FileResult,
  GitResult,
  ExecutionContext,
  SandboxSession,
} from '../types'

// =============================================================================
// Export Layer Modules
// =============================================================================

export { bashx, exec, execMany, execStream, run, which } from './bashx'
export {
  fsx,
  readFile,
  readFileBytes,
  writeFile,
  deleteFile,
  copyFile,
  moveFile,
  listDir,
  stat,
  exists,
  mkdir,
  glob,
  appendFile,
  readJson,
  writeJson,
} from './fsx'
export { gitx, clone, status, add, commit, push, pull, diff, log, branch, currentBranch } from './gitx'
export {
  npx,
  run as npxRun,
  install,
  installDev,
  uninstall,
  script,
  list,
  outdated,
  update,
  init,
  ci,
  audit,
  publish,
} from './npx'
export {
  sandbox,
  SandboxManager,
  getSandboxManager,
  createSandbox,
  execInSandbox,
  destroySandbox,
  type SandboxConfig,
} from './sandbox'
export {
  codex,
  execute as codexExecute,
  test as codexTest,
  validate as codexValidate,
  setEnvironment as setCodexEnvironment,
  getEnvironment as getCodexEnvironment,
  type CodexOptions,
  type CodexResult,
  type TestResults as CodexTestResults,
  type ValidationResult as CodexValidationResult,
} from './codex'

// =============================================================================
// DO-Native Compute Provider
// =============================================================================

/**
 * DO-native compute provider implementation
 *
 * Provides all compute capabilities through the layered architecture:
 * - bashx for shell commands
 * - fsx for file operations
 * - gitx for version control
 * - npx for package management
 * - sandbox for isolated execution
 *
 * @example
 * ```typescript
 * const compute = new DONativeProvider()
 * await compute.initialize({})
 *
 * // Shell commands
 * await compute.exec('npm install')
 *
 * // File operations
 * const content = await compute.readFile('package.json')
 * await compute.writeFile('output.txt', 'Hello')
 *
 * // Git operations
 * await compute.gitCommit('.', 'feat: new feature')
 *
 * // Package execution
 * await compute.npx('prettier', ['--write', '.'])
 * ```
 */
export class DONativeProvider implements ComputeProvider {
  readonly info: ToolProviderInfo = {
    id: 'do-native',
    name: 'DO Native',
    description: 'DO-native compute with bashx, fsx, gitx, npx layers',
    category: 'computer',
    executionTier: 'do',
    capabilities: [
      'exec',
      'execMany',
      'readFile',
      'writeFile',
      'deleteFile',
      'listDir',
      'stat',
      'exists',
      'mkdir',
      'glob',
      'gitClone',
      'gitStatus',
      'gitAdd',
      'gitCommit',
      'gitPush',
      'gitPull',
      'gitDiff',
      'npx',
      'npmInstall',
      'createSandbox',
    ],
    requiredConfig: [],
    optionalConfig: [],
  }

  private config: ProviderConfig = {}

  constructor(config?: ProviderConfig) {
    if (config) {
      this.config = config
    }
  }

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...this.config, ...config }
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      healthy: true,
      checkedAt: new Date(),
      message: 'DO-native compute ready',
    }
  }

  async dispose(): Promise<void> {
    // Clean up any sandbox sessions
    const { getSandboxManager } = await import('./sandbox')
    await getSandboxManager().destroyAll()
  }

  // ===========================================================================
  // Bashx - Shell Execution
  // ===========================================================================

  async exec(command: string, context?: ExecutionContext): Promise<CommandResult> {
    const { exec } = await import('./bashx')
    return exec(command, context)
  }

  async execMany(commands: string[], context?: ExecutionContext): Promise<CommandResult[]> {
    const { execMany } = await import('./bashx')
    return execMany(commands, context)
  }

  async execStream(
    command: string,
    onStdout: (data: string) => void,
    onStderr: (data: string) => void,
    context?: ExecutionContext
  ): Promise<CommandResult> {
    const { execStream } = await import('./bashx')
    return execStream(command, onStdout, onStderr, context)
  }

  // ===========================================================================
  // Fsx - File System
  // ===========================================================================

  async readFile(path: string): Promise<string> {
    const { readFile } = await import('./fsx')
    return readFile(path)
  }

  async readFileBytes(path: string): Promise<ArrayBuffer> {
    const { readFileBytes } = await import('./fsx')
    return readFileBytes(path)
  }

  async writeFile(path: string, content: string | ArrayBuffer): Promise<FileResult> {
    const { writeFile } = await import('./fsx')
    return writeFile(path, content)
  }

  async deleteFile(path: string, recursive?: boolean): Promise<FileResult> {
    const { deleteFile } = await import('./fsx')
    return deleteFile(path, recursive)
  }

  async copyFile(src: string, dest: string): Promise<FileResult> {
    const { copyFile } = await import('./fsx')
    return copyFile(src, dest)
  }

  async moveFile(src: string, dest: string): Promise<FileResult> {
    const { moveFile } = await import('./fsx')
    return moveFile(src, dest)
  }

  async listDir(path: string): Promise<FileInfo[]> {
    const { listDir } = await import('./fsx')
    return listDir(path)
  }

  async stat(path: string): Promise<FileInfo | null> {
    const { stat } = await import('./fsx')
    return stat(path)
  }

  async exists(path: string): Promise<boolean> {
    const { exists } = await import('./fsx')
    return exists(path)
  }

  async mkdir(path: string, recursive?: boolean): Promise<FileResult> {
    const { mkdir } = await import('./fsx')
    return mkdir(path, recursive)
  }

  async glob(pattern: string, options?: { cwd?: string }): Promise<string[]> {
    const { glob } = await import('./fsx')
    return glob(pattern, options)
  }

  // ===========================================================================
  // Gitx - Git Operations
  // ===========================================================================

  async gitClone(url: string, dest: string, options?: { branch?: string; depth?: number }): Promise<GitResult> {
    const { clone } = await import('./gitx')
    return clone(url, dest, options)
  }

  async gitStatus(cwd: string): Promise<GitResult> {
    const { status } = await import('./gitx')
    return status(cwd)
  }

  async gitAdd(cwd: string, files: string | string[]): Promise<GitResult> {
    const { add } = await import('./gitx')
    return add(cwd, files)
  }

  async gitCommit(cwd: string, message: string, options?: { author?: string }): Promise<GitResult> {
    const { commit } = await import('./gitx')
    return commit(cwd, message, options)
  }

  async gitPush(cwd: string, options?: { remote?: string; branch?: string }): Promise<GitResult> {
    const { push } = await import('./gitx')
    return push(cwd, options)
  }

  async gitPull(cwd: string, options?: { remote?: string; branch?: string }): Promise<GitResult> {
    const { pull } = await import('./gitx')
    return pull(cwd, options)
  }

  async gitDiff(cwd: string, options?: { staged?: boolean }): Promise<GitResult> {
    const { diff } = await import('./gitx')
    return diff(cwd, options)
  }

  // ===========================================================================
  // Npx - Package Execution
  // ===========================================================================

  async npx(pkg: string, args?: string[], context?: ExecutionContext): Promise<CommandResult> {
    const { run } = await import('./npx')
    return run(pkg, args, context)
  }

  async npmInstall(packages?: string[], context?: ExecutionContext): Promise<CommandResult> {
    const { install } = await import('./npx')
    return install(packages, context)
  }

  // ===========================================================================
  // Sandbox - Full Isolation
  // ===========================================================================

  async createSandbox(options?: {
    image?: string
    memory?: number
    cpu?: number
    timeout?: number
  }): Promise<SandboxSession> {
    const { createSandbox } = await import('./sandbox')
    return createSandbox(options)
  }

  async execInSandbox(sandboxId: string, command: string, context?: ExecutionContext): Promise<CommandResult> {
    const { execInSandbox } = await import('./sandbox')
    return execInSandbox(sandboxId, command, context)
  }

  async destroySandbox(sandboxId: string): Promise<void> {
    const { destroySandbox } = await import('./sandbox')
    return destroySandbox(sandboxId)
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a DO-native compute provider
 *
 * @param config - Provider configuration
 * @returns Initialized compute provider
 *
 * @example
 * ```typescript
 * const compute = await createDONativeProvider()
 *
 * await compute.exec('npm test')
 * await compute.writeFile('result.json', JSON.stringify(data))
 * ```
 */
export async function createDONativeProvider(config: ProviderConfig = {}): Promise<DONativeProvider> {
  const provider = new DONativeProvider(config)
  await provider.initialize(config)
  return provider
}
