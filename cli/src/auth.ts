/**
 * Authentication management for @dotdo/cli
 */

import { loadConfig, saveConfig } from './config.js'
import type { CLIConfig, CLIResult } from './types.js'

export interface LoginOptions {
  token: string
  refreshToken?: string
  expiresAt?: number
  configPath?: string
}

export interface LogoutOptions {
  configPath?: string
}

/**
 * Store authentication token in shared config
 */
export async function login(options: LoginOptions): Promise<CLIResult> {
  const { token, refreshToken, expiresAt, configPath } = options

  const config = loadConfig(configPath)

  config.auth = {
    token,
    refreshToken,
    expiresAt,
  }

  await saveConfig(config, configPath)

  return {
    success: true,
    message: 'Successfully logged in',
    exitCode: 0,
  }
}

/**
 * Clear authentication from shared config
 */
export async function logout(options: LogoutOptions = {}): Promise<CLIResult> {
  const { configPath } = options

  const config = loadConfig(configPath)

  // Clear auth data but preserve the auth object
  config.auth = {}

  await saveConfig(config, configPath)

  return {
    success: true,
    message: 'Successfully logged out',
    exitCode: 0,
  }
}

/**
 * Get current authentication token
 */
export function getToken(configPath?: string): string | undefined {
  const config = loadConfig(configPath)
  return config.auth?.token
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(configPath?: string): boolean {
  const token = getToken(configPath)
  return !!token
}

/**
 * Verify token and get user info
 */
export async function verifyToken(configPath?: string): Promise<CLIResult> {
  const token = getToken(configPath)

  if (!token) {
    return {
      success: false,
      message: 'Not authenticated. Run `do login` first.',
      exitCode: 1,
    }
  }

  // For now, just return a mock user based on having a token
  // In production, this would validate against the auth server
  return {
    success: true,
    data: {
      user: {
        authenticated: true,
        hasToken: true,
      },
    },
    exitCode: 0,
  }
}
