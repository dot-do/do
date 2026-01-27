/**
 * Configuration management for @dotdo/cli
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type { CLIConfig } from './types.js'

/**
 * Get the default config path at ~/.dotdo/config.json
 */
export function getDefaultConfigPath(): string {
  return join(homedir(), '.dotdo', 'config.json')
}

/**
 * Initialize configuration directory and file
 */
export async function initConfig(options: { configPath?: string } = {}): Promise<CLIConfig> {
  const configPath = options.configPath || getDefaultConfigPath()
  const configDir = dirname(configPath)

  // Create config directory if it doesn't exist
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  // Create empty config file if it doesn't exist
  if (!existsSync(configPath)) {
    const defaultConfig: CLIConfig = {}
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2))
    return defaultConfig
  }

  return loadConfig(configPath)
}

/**
 * Load configuration from file
 */
export function loadConfig(configPath?: string): CLIConfig {
  const path = configPath || getDefaultConfigPath()

  if (!existsSync(path)) {
    return {}
  }

  try {
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content) as CLIConfig
  } catch {
    return {}
  }
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: CLIConfig, configPath?: string): Promise<void> {
  const path = configPath || getDefaultConfigPath()
  const configDir = dirname(path)

  // Ensure directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  writeFileSync(path, JSON.stringify(config, null, 2))
}

/**
 * Get a nested config value by dot notation path
 */
export function getConfigValue(config: CLIConfig, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = config

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/**
 * Set a nested config value by dot notation path
 */
export function setConfigValue(config: CLIConfig, path: string, value: unknown): CLIConfig {
  const parts = path.split('.')
  const result = { ...config }
  let current: Record<string, unknown> = result as Record<string, unknown>

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {}
    }
    current[part] = { ...(current[part] as Record<string, unknown>) }
    current = current[part] as Record<string, unknown>
  }

  current[parts[parts.length - 1]] = value
  return result
}
