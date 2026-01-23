/**
 * DO Authentication Module
 *
 * Wraps oauth.do for Digital Object authentication.
 * Provides both CLI (browser launch) and headless (device flow) modes.
 *
 * @module @do/sdk/auth
 */

import {
  getToken,
  isAuthenticated,
  createSecureStorage,
  configure,
  getConfig,
  authorizeDevice,
  pollForTokens,
  type TokenStorage,
} from 'oauth.do'
import type { StoredTokenData, OAuthConfig } from 'oauth.do/types'

// =============================================================================
// Types
// =============================================================================

/**
 * DO-specific storage configuration
 */
export interface DOStorageConfig {
  /** Custom storage path (default: ~/.do/tokens) */
  storagePath?: string
  /** Custom storage implementation */
  storage?: TokenStorage
}

/**
 * Options for DO authentication
 */
export interface DOAuthOptions extends DOStorageConfig {
  /** Open browser automatically for login (default: true) */
  openBrowser?: boolean
  /** Custom print function for output */
  print?: (message: string) => void
  /** OAuth provider to use directly */
  provider?: 'GitHubOAuth' | 'GoogleOAuth' | 'MicrosoftOAuth' | 'AppleOAuth'
  /** Use headless mode (device flow without browser) */
  headless?: boolean
  /** DO API URL (default: https://api.do.md) */
  apiUrl?: string
  /** Client ID for OAuth (default: from env DO_CLIENT_ID) */
  clientId?: string
}

/**
 * Result of a DO authentication operation
 */
export interface DOAuthResult {
  /** Access token */
  token: string
  /** Whether this was a fresh login */
  isNewLogin: boolean
}

/**
 * Device flow authorization response
 */
export interface DeviceAuthResponse {
  /** URL for user to visit */
  verificationUri: string
  /** Complete URL with code embedded */
  verificationUriComplete: string
  /** Code for user to enter */
  userCode: string
  /** Device code for polling */
  deviceCode: string
  /** Polling interval in seconds */
  interval: number
  /** Expiration time in seconds */
  expiresIn: number
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_DO_API_URL = 'https://api.do.md'
const DEFAULT_DO_STORAGE_PATH = '~/.do/tokens'

/**
 * Get environment variable safely across platforms (Workers, Node, Browser)
 */
function getEnv(key: string): string | undefined {
  // Check globalThis first (works in Cloudflare Workers)
  if ((globalThis as Record<string, unknown>)[key]) {
    return (globalThis as Record<string, unknown>)[key] as string
  }
  // Check process.env for Node.js environments
  const proc = (globalThis as Record<string, unknown>).process as { env?: Record<string, string | undefined> } | undefined
  if (proc?.env?.[key]) {
    return proc.env[key]
  }
  return undefined
}

/**
 * Configure DO authentication
 * Call this before using any auth functions if you need custom settings
 */
export function configureDOAuth(options: {
  apiUrl?: string
  clientId?: string
  storagePath?: string
}): void {
  configure({
    apiUrl: options.apiUrl || getEnv('DO_API_URL') || DEFAULT_DO_API_URL,
    clientId: options.clientId || getEnv('DO_CLIENT_ID'),
    storagePath: options.storagePath || getEnv('DO_STORAGE_PATH') || DEFAULT_DO_STORAGE_PATH,
  } as OAuthConfig)
}

/**
 * Get the configured DO storage instance
 */
function getDOStorage(options: DOStorageConfig = {}): TokenStorage {
  if (options.storage) {
    return options.storage
  }

  const config = getConfig()
  const storagePath = options.storagePath || config.storagePath || DEFAULT_DO_STORAGE_PATH

  return createSecureStorage(storagePath)
}

// =============================================================================
// Main Auth Functions
// =============================================================================

/**
 * Ensure the user is authenticated with DO.
 *
 * This is the primary authentication function for DO applications.
 * It handles:
 * - Checking for existing valid tokens
 * - Refreshing expired tokens
 * - Initiating device flow login when needed
 *
 * @param options - Authentication options
 * @returns Authentication result with token
 *
 * @example
 * ```typescript
 * // CLI mode - opens browser automatically
 * const { token } = await ensureDOAuth()
 *
 * // Headless mode - prints code for manual entry
 * const { token } = await ensureDOAuth({ headless: true })
 *
 * // Use token with DO client
 * const client = createClient({
 *   url: 'https://my-do.workers.dev',
 *   id: 'my-instance',
 *   token,
 * })
 * ```
 */
export async function ensureDOAuth(options: DOAuthOptions = {}): Promise<DOAuthResult> {
  // Configure if custom settings provided
  if (options.apiUrl || options.clientId || options.storagePath) {
    configureDOAuth({
      apiUrl: options.apiUrl,
      clientId: options.clientId,
      storagePath: options.storagePath,
    })
  }

  const storage = getDOStorage(options)

  // For headless mode, use our own device flow implementation
  if (options.headless) {
    // Check for existing valid token first
    const existingToken = await storage.getToken()
    if (existingToken) {
      const tokenData = storage.getTokenData ? await storage.getTokenData() : null

      // If we have expiration info and token is not expired, return it
      if (tokenData?.expiresAt) {
        const now = Date.now()
        const bufferMs = 5 * 60 * 1000 // 5 minute buffer
        if (tokenData.expiresAt > now + bufferMs) {
          return { token: existingToken, isNewLogin: false }
        }
      } else {
        // No expiration info - assume token is valid
        return { token: existingToken, isNewLogin: false }
      }
    }

    // No valid token - start device flow
    return doDeviceFlowHeadless(options, storage)
  }

  // Try browser-based login using oauth.do/node
  return doDeviceFlowBrowser(options, storage)
}

/**
 * Device flow with browser auto-launch (CLI mode)
 * Uses oauth.do/node's ensureLoggedIn which handles token refresh automatically
 */
async function doDeviceFlowBrowser(options: DOAuthOptions, storage: TokenStorage): Promise<DOAuthResult> {
  const { openBrowser = true, print = console.log, provider } = options

  try {
    // Dynamically import node-specific module which has browser launch capabilities
    const loginModule = await import('oauth.do/node')

    const result = await loginModule.ensureLoggedIn({
      openBrowser,
      print,
      provider,
      storage,
    })

    return { token: result.token, isNewLogin: result.isNewLogin }
  } catch {
    // Fall back to headless mode if browser launch fails
    print('Browser launch not available, using device flow...\n')
    return doDeviceFlowHeadless(options, storage)
  }
}

/**
 * Device flow without browser (headless mode)
 */
async function doDeviceFlowHeadless(options: DOAuthOptions, storage: TokenStorage): Promise<DOAuthResult> {
  const { print = console.log, provider } = options

  print('\nStarting device authorization...\n')

  const authResponse = await authorizeDevice({ provider })

  print('To complete login:')
  print(`  1. Visit: ${authResponse.verification_uri}`)
  print(`  2. Enter code: ${authResponse.user_code}`)
  print(`\n  Or open: ${authResponse.verification_uri_complete}\n`)
  print('Waiting for authorization...\n')

  const tokenResponse = await pollForTokens(authResponse.device_code, authResponse.interval, authResponse.expires_in)

  // Store the token
  const expiresAt = tokenResponse.expires_in ? Date.now() + tokenResponse.expires_in * 1000 : undefined

  const newData: StoredTokenData = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt,
  }

  if (storage.setTokenData) {
    await storage.setTokenData(newData)
  } else {
    await storage.setToken(tokenResponse.access_token)
  }

  print('Login successful!\n')

  return { token: tokenResponse.access_token, isNewLogin: true }
}

/**
 * Get the current DO authentication token.
 *
 * Returns null if not authenticated.
 *
 * @param options - Storage configuration options
 * @returns The current token or null
 *
 * @example
 * ```typescript
 * const token = await getDOToken()
 * if (token) {
 *   console.log('Authenticated')
 * } else {
 *   console.log('Not authenticated')
 * }
 * ```
 */
export async function getDOToken(options: DOStorageConfig = {}): Promise<string | null> {
  // First check oauth.do's built-in token getter (checks env vars)
  const envToken = await getToken()
  if (envToken) {
    return envToken
  }

  // Then check local storage
  const storage = getDOStorage(options)
  return storage.getToken()
}

/**
 * Check if the user is currently authenticated with DO.
 *
 * @param options - Storage configuration options
 * @returns True if authenticated with a valid token
 *
 * @example
 * ```typescript
 * if (await isDOAuthenticated()) {
 *   // User is logged in
 * } else {
 *   await ensureDOAuth()
 * }
 * ```
 */
export async function isDOAuthenticated(options: DOStorageConfig = {}): Promise<boolean> {
  // Check oauth.do's built-in check first (checks env vars)
  if (await isAuthenticated()) {
    return true
  }

  // Check local storage
  const storage = getDOStorage(options)
  const token = await storage.getToken()
  if (!token) {
    return false
  }

  // Check if token is expired
  if (storage.getTokenData) {
    const tokenData = await storage.getTokenData()
    if (tokenData?.expiresAt) {
      return tokenData.expiresAt > Date.now()
    }
  }

  return true
}

/**
 * Force a new login, ignoring any existing token.
 *
 * @param options - Authentication options
 * @returns Authentication result with new token
 *
 * @example
 * ```typescript
 * // Force re-authentication
 * const { token } = await forceReauthDO()
 * ```
 */
export async function forceReauthDO(options: DOAuthOptions = {}): Promise<DOAuthResult> {
  const storage = getDOStorage(options)
  await storage.removeToken()
  return ensureDOAuth(options)
}

/**
 * Log out from DO, clearing stored credentials.
 *
 * @param options - Storage configuration options
 *
 * @example
 * ```typescript
 * await logoutDO()
 * console.log('Logged out')
 * ```
 */
export async function logoutDO(options: DOStorageConfig & { print?: (message: string) => void } = {}): Promise<void> {
  const { print = console.log } = options
  const storage = getDOStorage(options)
  await storage.removeToken()
  print('Logged out from DO\n')
}

// =============================================================================
// Device Flow Utilities
// =============================================================================

/**
 * Start a device flow authorization manually.
 *
 * This is useful for custom UIs that want to display the verification
 * code and URL themselves.
 *
 * @param options - Device flow options
 * @returns Device authorization response
 *
 * @example
 * ```typescript
 * const auth = await startDODeviceFlow()
 * console.log(`Visit ${auth.verificationUri} and enter code ${auth.userCode}`)
 *
 * // Then poll for completion
 * const token = await completeDODeviceFlow(auth.deviceCode, auth.interval, auth.expiresIn)
 * ```
 */
export async function startDODeviceFlow(options: Pick<DOAuthOptions, 'provider' | 'apiUrl' | 'clientId'> = {}): Promise<DeviceAuthResponse> {
  if (options.apiUrl || options.clientId) {
    configureDOAuth({
      apiUrl: options.apiUrl,
      clientId: options.clientId,
    })
  }

  const response = await authorizeDevice({ provider: options.provider })

  return {
    verificationUri: response.verification_uri,
    verificationUriComplete: response.verification_uri_complete,
    userCode: response.user_code,
    deviceCode: response.device_code,
    interval: response.interval,
    expiresIn: response.expires_in,
  }
}

/**
 * Complete a device flow authorization by polling for tokens.
 *
 * @param deviceCode - Device code from startDODeviceFlow
 * @param interval - Polling interval in seconds
 * @param expiresIn - Expiration time in seconds
 * @param options - Storage options
 * @returns The access token
 *
 * @example
 * ```typescript
 * const auth = await startDODeviceFlow()
 * // ... display code to user ...
 * const token = await completeDODeviceFlow(auth.deviceCode, auth.interval, auth.expiresIn)
 * ```
 */
export async function completeDODeviceFlow(
  deviceCode: string,
  interval: number,
  expiresIn: number,
  options: DOStorageConfig = {}
): Promise<string> {
  const storage = getDOStorage(options)

  const tokenResponse = await pollForTokens(deviceCode, interval, expiresIn)

  // Store the token
  const expiresAt = tokenResponse.expires_in ? Date.now() + tokenResponse.expires_in * 1000 : undefined

  const newData: StoredTokenData = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt,
  }

  if (storage.setTokenData) {
    await storage.setTokenData(newData)
  } else {
    await storage.setToken(tokenResponse.access_token)
  }

  return tokenResponse.access_token
}

// =============================================================================
// Re-exports from oauth.do
// =============================================================================

export { createSecureStorage, configure as configureOAuth, getConfig as getOAuthConfig } from 'oauth.do'

export type { TokenStorage, StoredTokenData, OAuthConfig }
