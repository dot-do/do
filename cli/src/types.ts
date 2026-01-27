/**
 * Core type definitions for @dotdo/cli
 */

/**
 * CLI command definition
 */
export interface CLICommand {
  name: string
  description: string
  aliases?: string[]
  namespace?: string
  execute: (args: string[], options: Record<string, unknown>) => Promise<CLIResult>
}

/**
 * CLI plugin interface for extensibility
 */
export interface CLIPlugin {
  name: string
  version: string
  namespace: string
  commands: CLICommand[]
  register: (cli: BaseCLI) => void
  unregister: (cli: BaseCLI) => void
}

/**
 * CLI configuration stored in ~/.dotdo/config.json
 */
export interface CLIConfig {
  auth?: {
    token?: string
    refreshToken?: string
    expiresAt?: number
  }
  defaults?: {
    registry?: string
    environment?: string
  }
  plugins?: string[]
}

/**
 * CLI execution result
 */
export interface CLIResult {
  success: boolean
  message?: string
  data?: unknown
  exitCode: number
}

/**
 * Base CLI interface that all DO CLIs should implement
 */
export interface BaseCLI {
  name: string
  version: string
  commands: CLICommand[]
  plugins: CLIPlugin[]
  config: CLIConfig
}

/**
 * Parsed command from CLI input
 */
export interface ParsedCommand {
  namespace?: string
  command: string
  args: string[]
  options: Record<string, unknown>
}

/**
 * Options for creating a CLI instance
 */
export interface CreateCLIOptions {
  configPath?: string
}
