/**
 * SSL Certificate Management
 *
 * Handles SSL certificate status checking and provisioning triggers.
 * Cloudflare manages certificates automatically for proxied records;
 * this module provides visibility and control for edge cases.
 *
 * @module domains/ssl
 */

import type { PlatformTLD } from '../../types/domains'
import { getZoneId } from './tlds'

// =============================================================================
// Types
// =============================================================================

/**
 * SSL certificate status
 */
export type SSLStatus =
  | 'active'
  | 'pending_validation'
  | 'pending_issuance'
  | 'pending_deployment'
  | 'validation_timed_out'
  | 'issuance_timed_out'
  | 'deployment_timed_out'
  | 'deleted'
  | 'inactive'

/**
 * SSL certificate type
 */
export type SSLCertificateType = 'universal' | 'advanced' | 'custom' | 'dedicated'

/**
 * SSL validation method
 */
export type SSLValidationMethod = 'http' | 'txt' | 'email'

/**
 * SSL certificate information
 */
export interface SSLCertificate {
  /** Certificate ID */
  id: string
  /** Certificate type */
  type: SSLCertificateType
  /** Current status */
  status: SSLStatus
  /** Hostnames covered by this certificate */
  hosts: string[]
  /** Certificate authority */
  issuer: string
  /** Expiration timestamp */
  expiresAt: number
  /** When the certificate was issued */
  issuedAt?: number
  /** Validation method used */
  validationMethod?: SSLValidationMethod
}

/**
 * Options for checking certificate status
 */
export interface CheckCertificateOptions {
  /** The full hostname (e.g., 'acme.saas.group') */
  hostname: string
  /** The platform TLD (extracted from hostname if not provided) */
  tld?: PlatformTLD
}

/**
 * Options for waiting for certificate
 */
export interface WaitForCertificateOptions {
  /** Maximum time to wait in milliseconds */
  timeout?: number
  /** Polling interval in milliseconds */
  pollInterval?: number
}

/**
 * Error from SSL operations
 */
export class SSLError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'TIMEOUT' | 'VALIDATION_FAILED' | 'API_ERROR',
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'SSLError'
  }
}

// =============================================================================
// Cloudflare API Constants
// =============================================================================

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

/** Default timeout for waiting (60 seconds) */
const DEFAULT_TIMEOUT = 60_000

/** Default poll interval (5 seconds) */
const DEFAULT_POLL_INTERVAL = 5_000

// =============================================================================
// Public API
// =============================================================================

/**
 * Get SSL certificate status for a hostname
 *
 * @param options - Check options
 * @param env - Environment with CF_API_TOKEN
 * @returns Certificate information or null if not found
 *
 * @example
 * ```typescript
 * const cert = await getCertificateStatus({
 *   hostname: 'acme.saas.group'
 * }, env)
 *
 * if (cert?.status === 'active') {
 *   console.log('SSL active, expires:', new Date(cert.expiresAt))
 * }
 * ```
 */
export async function getCertificateStatus(
  options: CheckCertificateOptions,
  env: { CF_API_TOKEN: string }
): Promise<SSLCertificate | null> {
  // TODO: Implement Cloudflare API call
  // GET /zones/{zone_id}/ssl/certificate_packs
  throw new Error('Not implemented')
}

/**
 * Wait for a certificate to become active
 *
 * Useful after creating DNS records or triggering certificate provisioning.
 *
 * @param hostname - The hostname to check
 * @param options - Wait options
 * @param env - Environment with CF_API_TOKEN
 * @returns The active certificate
 * @throws SSLError if timeout or validation fails
 *
 * @example
 * ```typescript
 * try {
 *   const cert = await waitForCertificate('acme.saas.group', {
 *     timeout: 60000,
 *     pollInterval: 5000
 *   }, env)
 *   console.log('Certificate active!')
 * } catch (error) {
 *   if (error instanceof SSLError && error.code === 'TIMEOUT') {
 *     console.log('Certificate not ready yet')
 *   }
 * }
 * ```
 */
export async function waitForCertificate(
  hostname: string,
  options: WaitForCertificateOptions,
  env: { CF_API_TOKEN: string }
): Promise<SSLCertificate> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT
  const pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const cert = await getCertificateStatus({ hostname }, env)

    if (cert?.status === 'active') {
      return cert
    }

    if (cert?.status === 'validation_timed_out' || cert?.status === 'issuance_timed_out') {
      throw new SSLError(
        'VALIDATION_FAILED',
        `Certificate validation failed: ${cert.status}`,
        { hostname, status: cert.status }
      )
    }

    await sleep(pollInterval)
  }

  throw new SSLError(
    'TIMEOUT',
    `Timed out waiting for certificate: ${hostname}`,
    { hostname, timeout }
  )
}

/**
 * Check if a hostname is covered by an active certificate
 *
 * @param hostname - The hostname to check
 * @param env - Environment with CF_API_TOKEN
 * @returns True if covered by an active certificate
 *
 * @example
 * ```typescript
 * const covered = await isCertificateActive('acme.saas.group', env)
 * ```
 */
export async function isCertificateActive(
  hostname: string,
  env: { CF_API_TOKEN: string }
): Promise<boolean> {
  const cert = await getCertificateStatus({ hostname }, env)
  return cert?.status === 'active'
}

/**
 * List all SSL certificates for a zone
 *
 * @param zone - The platform TLD
 * @param env - Environment with CF_API_TOKEN
 * @returns Array of certificates
 *
 * @example
 * ```typescript
 * const certs = await listCertificates('saas.group', env)
 * ```
 */
export async function listCertificates(
  zone: PlatformTLD,
  env: { CF_API_TOKEN: string }
): Promise<SSLCertificate[]> {
  // TODO: Implement Cloudflare API call
  // GET /zones/{zone_id}/ssl/certificate_packs
  throw new Error('Not implemented')
}

/**
 * Check if a hostname requires Advanced Certificate Manager
 *
 * Deep subdomains (a.b.saas.group) are not covered by Universal SSL
 * and require Advanced Certificate Manager.
 *
 * @param hostname - The hostname to check
 * @returns True if Advanced Certificate Manager is required
 *
 * @example
 * ```typescript
 * requiresAdvancedCertificate('acme.saas.group') // false
 * requiresAdvancedCertificate('api.acme.saas.group') // true
 * ```
 */
export function requiresAdvancedCertificate(hostname: string): boolean {
  // Count subdomain depth
  // acme.saas.group = depth 1 (covered by *.saas.group)
  // api.acme.saas.group = depth 2 (NOT covered)
  const parts = hostname.split('.')
  // Assuming TLD is last 2 parts (e.g., saas.group)
  const subdomainDepth = parts.length - 2
  return subdomainDepth > 1
}

/**
 * Get certificates expiring within a time window
 *
 * @param zone - The platform TLD
 * @param withinMs - Time window in milliseconds
 * @param env - Environment with CF_API_TOKEN
 * @returns Certificates expiring within the window
 *
 * @example
 * ```typescript
 * // Get certificates expiring in the next 30 days
 * const expiring = await getExpiringCertificates('saas.group', 30 * 24 * 60 * 60 * 1000, env)
 * ```
 */
export async function getExpiringCertificates(
  zone: PlatformTLD,
  withinMs: number,
  env: { CF_API_TOKEN: string }
): Promise<SSLCertificate[]> {
  const certs = await listCertificates(zone, env)
  const expiryThreshold = Date.now() + withinMs
  return certs.filter((cert) => cert.expiresAt < expiryThreshold)
}

// =============================================================================
// Advanced Certificate Management
// =============================================================================

/**
 * Order an Advanced Certificate for deep subdomains
 *
 * @param hostnames - Hostnames to cover
 * @param zone - The platform TLD
 * @param env - Environment with CF_API_TOKEN
 * @returns The ordered certificate (pending)
 *
 * @example
 * ```typescript
 * const cert = await orderAdvancedCertificate(
 *   ['api.acme.saas.group', 'admin.acme.saas.group'],
 *   'saas.group',
 *   env
 * )
 * ```
 */
export async function orderAdvancedCertificate(
  hostnames: string[],
  zone: PlatformTLD,
  env: { CF_API_TOKEN: string }
): Promise<SSLCertificate> {
  // TODO: Implement Cloudflare API call
  // POST /zones/{zone_id}/ssl/certificate_packs/order
  throw new Error('Not implemented')
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Extract TLD from a hostname
 *
 * @param hostname - Full hostname (e.g., 'acme.saas.group')
 * @returns The TLD portion (e.g., 'saas.group')
 */
export function extractTLD(hostname: string): string {
  const parts = hostname.split('.')
  // Assumes TLD is last 2 parts
  return parts.slice(-2).join('.')
}

/**
 * Extract subdomain from a hostname
 *
 * @param hostname - Full hostname (e.g., 'acme.saas.group')
 * @returns The subdomain portion (e.g., 'acme')
 */
export function extractSubdomain(hostname: string): string {
  const parts = hostname.split('.')
  // Everything except last 2 parts
  return parts.slice(0, -2).join('.')
}
