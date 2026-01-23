/**
 * Subdomain Validation
 *
 * Utilities for validating subdomain names, checking reserved lists,
 * and verifying TLD validity.
 *
 * @module domains/validation
 */

import {
  RESERVED_SUBDOMAINS,
  isReservedSubdomain,
  validateSubdomain as validateSubdomainBase,
  type PlatformTLD,
} from '../../types/domains'
import { isValidTLD } from './tlds'

// =============================================================================
// Types
// =============================================================================

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean
  /** Error message if invalid */
  error?: string
  /** Detailed validation info */
  details?: ValidationDetails
}

/**
 * Detailed validation information
 */
export interface ValidationDetails {
  /** The value that was validated */
  value: string
  /** Checks that passed */
  passed: string[]
  /** Check that failed (if any) */
  failed?: string
}

/**
 * Validation options
 */
export interface ValidationOptions {
  /** Allow uppercase (will be normalized) */
  allowUppercase?: boolean
  /** Minimum length (default: 2) */
  minLength?: number
  /** Maximum length (default: 63) */
  maxLength?: number
  /** Additional reserved words to block */
  additionalReserved?: string[]
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Additional reserved subdomains beyond the core list
 * These are commonly used or potentially confusing names
 */
export const ADDITIONAL_RESERVED_SUBDOMAINS = [
  // Numbers that might be confusing
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',

  // Common abbreviations
  'www2', 'www3', 'ftp2', 'mail2', 'smtp2',
  'ns', 'ns3', 'ns4', 'mx', 'mx2',

  // Security related
  'security', 'secure', 'ssl', 'vpn', 'proxy',

  // Common service names
  'api2', 'api3', 'graphql', 'rest', 'rpc', 'ws', 'wss',
  'beta', 'alpha', 'preview', 'canary', 'edge',

  // Platform specific
  'admin2', 'panel', 'cp', 'controlpanel', 'webmail',
  'autodiscover', 'autoconfig', 'mail-server',

  // Potential trademark issues
  'google', 'facebook', 'amazon', 'microsoft', 'apple',
  'twitter', 'github', 'cloudflare', 'stripe', 'aws',
] as const

/**
 * All reserved subdomains (core + additional)
 */
export const ALL_RESERVED_SUBDOMAINS = [
  ...RESERVED_SUBDOMAINS,
  ...ADDITIONAL_RESERVED_SUBDOMAINS,
] as const

// =============================================================================
// Public API
// =============================================================================

/**
 * Validate a subdomain name
 *
 * Checks:
 * 1. Length (2-63 characters)
 * 2. Characters (lowercase alphanumeric + hyphens)
 * 3. No leading/trailing hyphens
 * 4. Not reserved
 *
 * @param subdomain - The subdomain to validate
 * @param options - Validation options
 * @returns Validation result
 *
 * @example
 * ```typescript
 * validateSubdomain('acme')
 * // { valid: true, details: { passed: ['length', 'characters', 'hyphens', 'reserved'] } }
 *
 * validateSubdomain('www')
 * // { valid: false, error: 'Subdomain is reserved' }
 *
 * validateSubdomain('a')
 * // { valid: false, error: 'Subdomain must be 2-63 characters' }
 * ```
 */
export function validateSubdomain(
  subdomain: string,
  options: ValidationOptions = {}
): ValidationResult {
  const passed: string[] = []
  const minLength = options.minLength ?? 2
  const maxLength = options.maxLength ?? 63

  // Normalize if uppercase allowed
  const normalized = options.allowUppercase ? subdomain.toLowerCase() : subdomain

  // Check lowercase
  if (!options.allowUppercase && subdomain !== subdomain.toLowerCase()) {
    return {
      valid: false,
      error: 'Subdomain must be lowercase',
      details: { value: subdomain, passed, failed: 'lowercase' },
    }
  }
  passed.push('lowercase')

  // Check length
  if (normalized.length < minLength || normalized.length > maxLength) {
    return {
      valid: false,
      error: `Subdomain must be ${minLength}-${maxLength} characters`,
      details: { value: subdomain, passed, failed: 'length' },
    }
  }
  passed.push('length')

  // Check characters
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(normalized) && normalized.length > 1) {
    return {
      valid: false,
      error: 'Subdomain must be alphanumeric with optional hyphens (no leading/trailing hyphens)',
      details: { value: subdomain, passed, failed: 'characters' },
    }
  }
  // Single character check
  if (normalized.length === 1 && !/^[a-z0-9]$/.test(normalized)) {
    return {
      valid: false,
      error: 'Single character subdomain must be alphanumeric',
      details: { value: subdomain, passed, failed: 'characters' },
    }
  }
  passed.push('characters')

  // Check consecutive hyphens
  if (normalized.includes('--')) {
    return {
      valid: false,
      error: 'Subdomain cannot contain consecutive hyphens',
      details: { value: subdomain, passed, failed: 'consecutive-hyphens' },
    }
  }
  passed.push('consecutive-hyphens')

  // Check reserved (core list)
  if (isReservedSubdomain(normalized)) {
    return {
      valid: false,
      error: 'Subdomain is reserved',
      details: { value: subdomain, passed, failed: 'reserved' },
    }
  }
  passed.push('reserved')

  // Check additional reserved
  const additionalReserved = options.additionalReserved ?? ADDITIONAL_RESERVED_SUBDOMAINS
  if ((additionalReserved as readonly string[]).includes(normalized)) {
    return {
      valid: false,
      error: 'Subdomain is reserved',
      details: { value: subdomain, passed, failed: 'additional-reserved' },
    }
  }
  passed.push('additional-reserved')

  return {
    valid: true,
    details: { value: subdomain, passed },
  }
}

/**
 * Validate a platform TLD
 *
 * @param tld - The TLD to validate
 * @returns Validation result
 *
 * @example
 * ```typescript
 * validateTLD('saas.group')
 * // { valid: true }
 *
 * validateTLD('example.com')
 * // { valid: false, error: 'Not a valid platform TLD' }
 * ```
 */
export function validateTLD(tld: string): ValidationResult {
  if (isValidTLD(tld)) {
    return { valid: true }
  }
  return {
    valid: false,
    error: 'Not a valid platform TLD',
    details: { value: tld, passed: [], failed: 'platform-tld' },
  }
}

/**
 * Validate a full domain (subdomain + TLD)
 *
 * @param subdomain - The subdomain
 * @param tld - The TLD
 * @param options - Validation options
 * @returns Validation result
 *
 * @example
 * ```typescript
 * validateDomain('acme', 'saas.group')
 * // { valid: true }
 * ```
 */
export function validateDomain(
  subdomain: string,
  tld: string,
  options?: ValidationOptions
): ValidationResult {
  const subdomainResult = validateSubdomain(subdomain, options)
  if (!subdomainResult.valid) {
    return subdomainResult
  }

  const tldResult = validateTLD(tld)
  if (!tldResult.valid) {
    return tldResult
  }

  return { valid: true }
}

/**
 * Check if a subdomain is in the reserved list
 *
 * @param subdomain - The subdomain to check
 * @param includeAdditional - Include additional reserved list
 * @returns True if reserved
 *
 * @example
 * ```typescript
 * isReserved('www') // true
 * isReserved('acme') // false
 * isReserved('google', true) // true (in additional list)
 * ```
 */
export function isReserved(subdomain: string, includeAdditional = true): boolean {
  const normalized = subdomain.toLowerCase()

  if (isReservedSubdomain(normalized)) {
    return true
  }

  if (includeAdditional) {
    return (ADDITIONAL_RESERVED_SUBDOMAINS as readonly string[]).includes(normalized)
  }

  return false
}

/**
 * Normalize a subdomain
 *
 * @param subdomain - The subdomain to normalize
 * @returns Normalized subdomain (lowercase, trimmed)
 *
 * @example
 * ```typescript
 * normalizeSubdomain('  ACME  ')
 * // 'acme'
 * ```
 */
export function normalizeSubdomain(subdomain: string): string {
  return subdomain.toLowerCase().trim()
}

/**
 * Suggest similar available subdomains
 *
 * When a subdomain is taken or reserved, suggest alternatives.
 *
 * @param subdomain - The original subdomain
 * @param checkAvailability - Function to check if a subdomain is available
 * @returns Array of suggested alternatives
 *
 * @example
 * ```typescript
 * const suggestions = await suggestAlternatives('acme', async (s) => {
 *   const status = await client.check(s, 'saas.group')
 *   return status === 'available'
 * })
 * // ['acme-app', 'acme-hq', 'getacme', 'acme2']
 * ```
 */
export async function suggestAlternatives(
  subdomain: string,
  checkAvailability: (subdomain: string) => Promise<boolean>,
  maxSuggestions = 5
): Promise<string[]> {
  const suggestions: string[] = []
  const suffixes = ['app', 'hq', 'io', 'dev', 'co', 'team', 'labs', '2', '3']
  const prefixes = ['get', 'try', 'use', 'my', 'the', 'go']

  // Try suffixes
  for (const suffix of suffixes) {
    if (suggestions.length >= maxSuggestions) break
    const candidate = `${subdomain}-${suffix}`
    const validation = validateSubdomain(candidate)
    if (validation.valid && (await checkAvailability(candidate))) {
      suggestions.push(candidate)
    }
  }

  // Try prefixes
  for (const prefix of prefixes) {
    if (suggestions.length >= maxSuggestions) break
    const candidate = `${prefix}${subdomain}`
    const validation = validateSubdomain(candidate)
    if (validation.valid && (await checkAvailability(candidate))) {
      suggestions.push(candidate)
    }
  }

  return suggestions
}

/**
 * Get all reserved subdomains
 *
 * @param includeAdditional - Include additional reserved list
 * @returns Array of reserved subdomain names
 */
export function getReservedSubdomains(includeAdditional = true): readonly string[] {
  if (includeAdditional) {
    return ALL_RESERVED_SUBDOMAINS
  }
  return RESERVED_SUBDOMAINS
}
