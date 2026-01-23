/**
 * Domain Context Implementation
 *
 * Provides subdomain claiming and management for Digital Objects.
 * Integrates with Builder.Domains DO for registration.
 *
 * @example
 * ```typescript
 * // Claim a subdomain
 * const { $id } = await $.domain`acme.saas.group`
 *
 * // Check availability
 * const status = await $.domain.check('acme', 'saas.group')
 *
 * // List owned domains
 * const domains = await $.domain.list()
 * ```
 *
 * @module context/domain
 */

import type { DomainContext, PlatformTLD, SubdomainStatus, ClaimSubdomainResult, SubdomainRegistration } from '../types/domains'
import type { DigitalObjectIdentity } from '../types/identity'
import type { DOEnvironment } from './index'
import { interpolateTemplate } from './proxy'

/**
 * Internal context state
 */
interface ContextState {
  env: DOEnvironment
}

// =============================================================================
// Domain Operations
// =============================================================================

/**
 * Parse a domain template to extract subdomain and TLD
 *
 * @param template - Template string (e.g., 'acme.saas.group')
 * @returns Parsed domain components
 */
function parseDomainTemplate(template: string): { subdomain: string; tld: string } | null {
  const trimmed = template.trim()

  // Split by dots
  const parts = trimmed.split('.')

  if (parts.length < 2) {
    return null
  }

  // The first part is the subdomain
  const subdomain = parts[0]

  // The rest is the TLD (e.g., 'saas.group', 'agents.do')
  const tld = parts.slice(1).join('.')

  return { subdomain, tld }
}

/**
 * Check if a subdomain is available
 *
 * @param state - Context state
 * @param subdomain - Subdomain to check
 * @param tld - Platform TLD
 * @returns Subdomain status
 */
async function checkSubdomain(
  state: ContextState,
  subdomain: string,
  tld: PlatformTLD
): Promise<SubdomainStatus> {
  // TODO: Implement actual check via Builder.Domains DO
  console.log(`[Domain] Checking ${subdomain}.${tld}`)

  // Simulate checking
  // In production, this would call the Builder.Domains DO
  return 'Available'
}

/**
 * Claim a subdomain
 *
 * @param state - Context state
 * @param subdomain - Subdomain to claim
 * @param tld - Platform TLD
 * @param ownerRef - Owner DO reference
 * @returns Claim result
 */
async function claimSubdomain(
  state: ContextState,
  subdomain: string,
  tld: PlatformTLD,
  ownerRef: string
): Promise<ClaimSubdomainResult> {
  // TODO: Implement actual claim via Builder.Domains DO
  console.log(`[Domain] Claiming ${subdomain}.${tld} for ${ownerRef}`)

  // Validate subdomain
  const validation = validateSubdomain(subdomain)
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      reason: 'Invalid',
    }
  }

  // Check availability
  const status = await checkSubdomain(state, subdomain, tld)
  if (status !== 'Available') {
    return {
      success: false,
      error: `Subdomain ${subdomain} is ${status}`,
      reason: status === 'Claimed' ? 'Taken' : 'Reserved',
    }
  }

  // Claim the subdomain
  const $id = `https://${subdomain}.${tld}`

  return {
    success: true,
    $id,
  }
}

/**
 * Release a subdomain
 *
 * @param state - Context state
 * @param subdomain - Subdomain to release
 * @param tld - Platform TLD
 * @param ownerRef - Owner DO reference
 * @returns Success boolean
 */
async function releaseSubdomain(
  state: ContextState,
  subdomain: string,
  tld: PlatformTLD,
  ownerRef: string
): Promise<boolean> {
  // TODO: Implement actual release via Builder.Domains DO
  console.log(`[Domain] Releasing ${subdomain}.${tld} from ${ownerRef}`)
  return true
}

/**
 * List subdomains owned by a DO
 *
 * @param state - Context state
 * @param ownerRef - Owner DO reference
 * @returns Array of subdomain registrations
 */
async function listSubdomains(
  state: ContextState,
  ownerRef: string
): Promise<SubdomainRegistration[]> {
  // TODO: Implement actual list via Builder.Domains DO
  console.log(`[Domain] Listing subdomains for ${ownerRef}`)
  return []
}

/**
 * Validate a subdomain
 *
 * @param subdomain - Subdomain to validate
 * @returns Validation result
 */
function validateSubdomain(subdomain: string): { valid: boolean; error?: string } {
  // Must be lowercase
  if (subdomain !== subdomain.toLowerCase()) {
    return { valid: false, error: 'Subdomain must be lowercase' }
  }

  // Length check
  if (subdomain.length < 2 || subdomain.length > 63) {
    return { valid: false, error: 'Subdomain must be 2-63 characters' }
  }

  // Character check
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain)) {
    return { valid: false, error: 'Subdomain must be alphanumeric with optional hyphens' }
  }

  // Reserved check
  const reserved = [
    'www', 'mail', 'email', 'smtp', 'ftp', 'sftp', 'ssh',
    'api', 'app', 'admin', 'dashboard', 'console',
    'dev', 'staging', 'prod', 'test', 'demo',
    'auth', 'login', 'signup', 'logout', 'sso',
    'support', 'help', 'docs', 'blog', 'status',
  ]

  if (reserved.includes(subdomain)) {
    return { valid: false, error: 'Subdomain is reserved' }
  }

  return { valid: true }
}

/**
 * Create the Domain Context
 *
 * @param state - Internal context state
 * @param identity - DO identity for owner reference
 * @returns DomainContext implementation
 */
export function createDomainContext(
  state: ContextState,
  identity: DigitalObjectIdentity
): DomainContext {
  const ownerRef = identity.$id

  /**
   * Main domain tagged template function
   * Usage: $.domain`acme.saas.group`
   */
  const domain = (async (strings: TemplateStringsArray, ...values: unknown[]): Promise<{ $id: string }> => {
    const template = interpolateTemplate(strings, values)
    const parsed = parseDomainTemplate(template)

    if (!parsed) {
      throw new Error(`Invalid domain format: ${template}`)
    }

    const result = await claimSubdomain(state, parsed.subdomain, parsed.tld as PlatformTLD, ownerRef)

    if (!result.success) {
      throw new Error(result.error || 'Failed to claim subdomain')
    }

    return { $id: result.$id! }
  }) as DomainContext

  /**
   * Check subdomain availability
   * Usage: $.domain.check('acme', 'saas.group')
   */
  domain.check = (subdomain: string, tld: PlatformTLD): Promise<SubdomainStatus> => {
    return checkSubdomain(state, subdomain, tld)
  }

  /**
   * Claim a subdomain
   * Usage: $.domain.claim('acme', 'saas.group')
   */
  domain.claim = (subdomain: string, tld: PlatformTLD): Promise<ClaimSubdomainResult> => {
    return claimSubdomain(state, subdomain, tld, ownerRef)
  }

  /**
   * Release a subdomain
   * Usage: $.domain.release('acme', 'saas.group')
   */
  domain.release = (subdomain: string, tld: PlatformTLD): Promise<boolean> => {
    return releaseSubdomain(state, subdomain, tld, ownerRef)
  }

  /**
   * List owned subdomains
   * Usage: $.domain.list()
   */
  domain.list = (): Promise<SubdomainRegistration[]> => {
    return listSubdomains(state, ownerRef)
  }

  return domain
}

// =============================================================================
// Domain Utilities
// =============================================================================

/**
 * Platform TLDs available for subdomain registration
 */
export const PLATFORM_TLDS: PlatformTLD[] = [
  // Primary business TLDs
  'hq.com.ai',
  'app.net.ai',
  'api.net.ai',
  'services.com.ai',
  'do.com.ai',
  'do.net.ai',

  // Studio/Builder TLDs
  'io.sb',
  'hq.sb',
  'api.sb',
  'db.sb',
  'studio.sb',
  'mcp.sb',
  'sh.sb',
  'directory.sb',

  // Startup TLDs
  'ful.st',
  'kit.st',
  'llc.st',
  'mgmt.st',
  'svc.st',
  'management.st',
  'marketing.st',

  // SaaS TLDs
  'saas.group',
  'agents.do',
  'workers.do',
  'functions.do',

  // Infrastructure TLDs
  'cdn.land',
  'edge.land',
  'mdx.land',
  'agint.land',
]

/**
 * Check if a TLD is a platform TLD
 *
 * @param tld - TLD to check
 * @returns Whether it's a platform TLD
 */
export function isPlatformTLD(tld: string): tld is PlatformTLD {
  return (PLATFORM_TLDS as string[]).includes(tld)
}

/**
 * Build full domain URL from subdomain and TLD
 *
 * @param subdomain - Subdomain
 * @param tld - Platform TLD
 * @returns Full HTTPS URL
 */
export function buildDomainUrl(subdomain: string, tld: PlatformTLD): string {
  return `https://${subdomain}.${tld}`
}
