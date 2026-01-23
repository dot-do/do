/**
 * Tool Provider Types
 *
 * Capabilities for workers (humans and agents) to interact with browsers and computers.
 * These are the "hands" that let workers do things in the digital world.
 *
 * @module tools/types
 */

import type { BaseProvider, ProviderConfig, ProviderHealth, ProviderInfo } from './communication/types'

// =============================================================================
// Tool Provider Base
// =============================================================================

/**
 * Tool categories
 */
export type ToolCategory = 'browser' | 'computer' | 'search' | 'file'

/**
 * Tool provider info extends base provider info
 */
export interface ToolProviderInfo extends Omit<ProviderInfo, 'category'> {
  category: ToolCategory
  /** Execution tier: where does this tool run? */
  executionTier: 'do' | 'worker' | 'sandbox' | 'external'
  /** Capabilities this tool provides */
  capabilities: string[]
}

/**
 * Base tool provider interface
 */
export interface ToolProvider extends Omit<BaseProvider, 'info'> {
  readonly info: ToolProviderInfo
  initialize(config: ProviderConfig): Promise<void>
  healthCheck(): Promise<ProviderHealth>
  dispose(): Promise<void>
}

// =============================================================================
// Browser Provider
// =============================================================================

/**
 * Browser action types
 */
export type BrowserAction =
  | 'navigate'
  | 'click'
  | 'type'
  | 'scroll'
  | 'screenshot'
  | 'extract'
  | 'wait'
  | 'evaluate'

/**
 * Navigate options
 */
export interface NavigateOptions {
  url: string
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'
  timeout?: number
}

/**
 * Click options
 */
export interface ClickOptions {
  selector?: string
  text?: string
  position?: { x: number; y: number }
  button?: 'left' | 'right' | 'middle'
  clickCount?: number
}

/**
 * Type options
 */
export interface TypeOptions {
  selector?: string
  text: string
  delay?: number
  clear?: boolean
}

/**
 * Screenshot options
 */
export interface ScreenshotOptions {
  selector?: string
  fullPage?: boolean
  format?: 'png' | 'jpeg' | 'webp'
  quality?: number
}

/**
 * Extract options (for AI-powered extraction)
 */
export interface ExtractOptions {
  /** What to extract - AI will interpret this */
  instruction: string
  /** Schema for structured extraction */
  schema?: Record<string, unknown>
  /** Selector to focus on */
  selector?: string
}

/**
 * Browser action result
 */
export interface BrowserActionResult {
  success: boolean
  action: BrowserAction
  data?: unknown
  screenshot?: string
  error?: {
    code: string
    message: string
  }
}

/**
 * Browser session
 */
export interface BrowserSession {
  id: string
  url: string
  title: string
  createdAt: Date
  lastActivityAt: Date
}

/**
 * Browser provider interface
 *
 * Provides web automation capabilities using Stagehand pattern:
 * - AI-powered element targeting ("click the login button")
 * - Structured data extraction
 * - Visual understanding
 */
export interface BrowserProvider extends ToolProvider {
  /** Create a new browser session */
  createSession(options?: { headless?: boolean }): Promise<BrowserSession>

  /** Close a browser session */
  closeSession(sessionId: string): Promise<void>

  /** Navigate to URL */
  navigate(sessionId: string, options: NavigateOptions): Promise<BrowserActionResult>

  /** Click an element (AI-powered targeting) */
  click(sessionId: string, options: ClickOptions): Promise<BrowserActionResult>

  /** Type text (AI-powered field targeting) */
  type(sessionId: string, options: TypeOptions): Promise<BrowserActionResult>

  /** Take screenshot */
  screenshot(sessionId: string, options?: ScreenshotOptions): Promise<BrowserActionResult>

  /** Extract data from page (AI-powered) */
  extract(sessionId: string, options: ExtractOptions): Promise<BrowserActionResult>

  /** Act - high-level AI action (e.g., "log in with these credentials") */
  act(sessionId: string, instruction: string, context?: Record<string, unknown>): Promise<BrowserActionResult>

  /** Observe - get current page state */
  observe(sessionId: string): Promise<{
    url: string
    title: string
    text: string
    screenshot?: string
  }>
}

// =============================================================================
// Computer Provider (Execution Layers)
// =============================================================================

/**
 * Execution context for computer operations
 */
export interface ExecutionContext {
  /** Working directory */
  cwd?: string
  /** Environment variables */
  env?: Record<string, string>
  /** Timeout in milliseconds */
  timeout?: number
  /** User to run as */
  user?: string
}

/**
 * Command execution result
 */
export interface CommandResult {
  success: boolean
  exitCode: number
  stdout: string
  stderr: string
  duration: number
}

/**
 * File info
 */
export interface FileInfo {
  path: string
  name: string
  size: number
  isDirectory: boolean
  isFile: boolean
  createdAt: Date
  modifiedAt: Date
  permissions?: string
}

/**
 * File operation result
 */
export interface FileResult {
  success: boolean
  path: string
  error?: {
    code: string
    message: string
  }
}

/**
 * Git operation result
 */
export interface GitResult {
  success: boolean
  data?: unknown
  error?: {
    code: string
    message: string
  }
}

/**
 * Computer provider interface - layered execution capabilities
 *
 * Execution hierarchy (most operations use bashx, escalate when needed):
 * 1. bashx - Shell execution in DO (90% of needs)
 * 2. fsx - File system operations
 * 3. gitx - Git operations
 * 4. npx - Package execution
 * 5. sandbox - Full container/VM for isolation
 */
export interface ComputeProvider extends ToolProvider {
  // =========================================================================
  // Bashx - Shell Execution (runs in DO)
  // =========================================================================

  /**
   * Execute a shell command
   *
   * @example
   * ```typescript
   * await compute.exec('ls -la')
   * await compute.exec('npm install', { cwd: '/project' })
   * ```
   */
  exec(command: string, context?: ExecutionContext): Promise<CommandResult>

  /**
   * Execute multiple commands in sequence
   */
  execMany(commands: string[], context?: ExecutionContext): Promise<CommandResult[]>

  /**
   * Execute command with streaming output
   */
  execStream?(
    command: string,
    onStdout: (data: string) => void,
    onStderr: (data: string) => void,
    context?: ExecutionContext
  ): Promise<CommandResult>

  // =========================================================================
  // Fsx - File System Operations
  // =========================================================================

  /**
   * Read file contents
   */
  readFile(path: string): Promise<string>

  /**
   * Read file as bytes
   */
  readFileBytes?(path: string): Promise<ArrayBuffer>

  /**
   * Write file contents
   */
  writeFile(path: string, content: string | ArrayBuffer): Promise<FileResult>

  /**
   * Delete file or directory
   */
  deleteFile(path: string, recursive?: boolean): Promise<FileResult>

  /**
   * Copy file or directory
   */
  copyFile?(src: string, dest: string): Promise<FileResult>

  /**
   * Move/rename file or directory
   */
  moveFile?(src: string, dest: string): Promise<FileResult>

  /**
   * List directory contents
   */
  listDir(path: string): Promise<FileInfo[]>

  /**
   * Get file info
   */
  stat(path: string): Promise<FileInfo | null>

  /**
   * Check if path exists
   */
  exists(path: string): Promise<boolean>

  /**
   * Create directory
   */
  mkdir(path: string, recursive?: boolean): Promise<FileResult>

  /**
   * Find files matching pattern
   */
  glob?(pattern: string, options?: { cwd?: string }): Promise<string[]>

  // =========================================================================
  // Gitx - Git Operations
  // =========================================================================

  /**
   * Clone a repository
   */
  gitClone?(url: string, dest: string, options?: { branch?: string; depth?: number }): Promise<GitResult>

  /**
   * Git status
   */
  gitStatus?(cwd: string): Promise<GitResult>

  /**
   * Git add
   */
  gitAdd?(cwd: string, files: string | string[]): Promise<GitResult>

  /**
   * Git commit
   */
  gitCommit?(cwd: string, message: string, options?: { author?: string }): Promise<GitResult>

  /**
   * Git push
   */
  gitPush?(cwd: string, options?: { remote?: string; branch?: string }): Promise<GitResult>

  /**
   * Git pull
   */
  gitPull?(cwd: string, options?: { remote?: string; branch?: string }): Promise<GitResult>

  /**
   * Git diff
   */
  gitDiff?(cwd: string, options?: { staged?: boolean }): Promise<GitResult>

  // =========================================================================
  // Npx - Package Execution
  // =========================================================================

  /**
   * Run an npm package
   */
  npx?(pkg: string, args?: string[], context?: ExecutionContext): Promise<CommandResult>

  /**
   * Install npm packages
   */
  npmInstall?(packages?: string[], context?: ExecutionContext): Promise<CommandResult>

  // =========================================================================
  // Sandbox - Full Container/VM (escalation)
  // =========================================================================

  /**
   * Create an isolated sandbox for complex operations
   *
   * Use when bashx isn't enough:
   * - Need full process isolation
   * - Running untrusted code
   * - Complex multi-process workflows
   */
  createSandbox?(options?: {
    image?: string
    memory?: number
    cpu?: number
    timeout?: number
  }): Promise<SandboxSession>

  /**
   * Execute in sandbox
   */
  execInSandbox?(sandboxId: string, command: string, context?: ExecutionContext): Promise<CommandResult>

  /**
   * Destroy sandbox
   */
  destroySandbox?(sandboxId: string): Promise<void>
}

/**
 * Sandbox session
 */
export interface SandboxSession {
  id: string
  status: 'creating' | 'running' | 'stopped' | 'error'
  image?: string
  createdAt: Date
  expiresAt?: Date
}

// =============================================================================
// Tool Registry Types
// =============================================================================

/**
 * Tool factory function
 */
export type ToolFactory<T extends ToolProvider> = (config: ProviderConfig) => Promise<T>

/**
 * Registered tool entry
 */
export interface RegisteredTool<T extends ToolProvider = ToolProvider> {
  info: ToolProviderInfo
  factory: ToolFactory<T>
}
