/**
 * @dotdo/cli - The DO CLI
 *
 * Publish, deploy, and manage Digital Objects.
 */

// Core types
export type { BaseCLI, CLICommand, CLIPlugin, CLIConfig, CLIResult, CreateCLIOptions, ParsedCommand } from './types.js'

// Base CLI
export { createCLI, resolveCommand, listCommands, getCommandHelp, execute } from './base.js'

// Config management
export { getDefaultConfigPath, initConfig, loadConfig, saveConfig, getConfigValue, setConfigValue } from './config.js'

// Auth management
export { login, logout, getToken, isAuthenticated, verifyToken } from './auth.js'
export type { LoginOptions, LogoutOptions } from './auth.js'

// Parser
export { parseCommand, formatCommand } from './parser.js'

// Plugins
export { registerPlugin, unregisterPlugin, loadPluginsFromConfig, getPlugins } from './plugins.js'

// Legacy exports for backwards compatibility
export { publish, createPublisher, type PublishOptions, type PublishResult, type DODefinition } from './publish.js'
export { dev, type DevOptions } from './dev.js'
