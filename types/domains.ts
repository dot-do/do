/**
 * Domain Types - Subdomain Registration for Digital Objects
 *
 * Domains in DO are simpler than traditional DNS:
 * - Claiming a subdomain creates an $id (e.g., https://acme.saas.group)
 * - A primary DO (Builder.Domains) manages all registrations
 * - No DNS configuration needed - just claim and use
 *
 * The subdomain becomes the $id of a new DO.
 */

// =============================================================================
// Platform TLDs
// =============================================================================

/**
 * Platform-owned TLDs for free subdomains
 * Each TLD is owned by Builder.Domains
 */
export const PLATFORM_TLDS = [
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
] as const

export type PlatformTLD = typeof PLATFORM_TLDS[number]

// =============================================================================
// Subdomain Registration
// =============================================================================

/**
 * Subdomain registration status
 */
export type SubdomainStatus =
  | 'Available'   // Can be claimed
  | 'Claimed'     // Owned by a DO
  | 'Reserved'    // Reserved by platform

/**
 * Subdomain registration - what gets stored in Builder.Domains
 */
export interface SubdomainRegistration {
  /** Full domain as $id (e.g., https://acme.saas.group) */
  $id: string

  /** Subdomain portion (e.g., 'acme') */
  subdomain: string

  /** Platform TLD (e.g., 'saas.group') */
  tld: PlatformTLD

  /** Owner DO $id (the DO that claimed this subdomain) */
  ownerRef: string

  /** Status */
  status: SubdomainStatus

  /** Created timestamp */
  createdAt: number

  /** Metadata */
  metadata?: Record<string, unknown>
}

/**
 * Request to claim a subdomain
 */
export interface ClaimSubdomainRequest {
  /** Desired subdomain (e.g., 'acme') */
  subdomain: string

  /** Platform TLD (e.g., 'saas.group') */
  tld: PlatformTLD

  /** Claiming DO's $id */
  ownerRef: string

  /** Optional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Result of claiming a subdomain
 */
export interface ClaimSubdomainResult {
  /** Whether the claim succeeded */
  success: boolean

  /** The full domain $id if successful */
  $id?: string

  /** Error message if failed */
  error?: string

  /** Reason for failure */
  reason?: 'Taken' | 'Reserved' | 'Invalid' | 'QuotaExceeded'
}

// =============================================================================
// Reserved Subdomains
// =============================================================================

/**
 * Reserved subdomains that cannot be claimed
 */
export const RESERVED_SUBDOMAINS = [
  // Infrastructure
  'www', 'mail', 'email', 'smtp', 'pop', 'imap',
  'ftp', 'sftp', 'ssh', 'ns1', 'ns2', 'dns',

  // Platform
  'api', 'app', 'admin', 'dashboard', 'console',
  'dev', 'staging', 'prod', 'test', 'demo',

  // Auth
  'auth', 'login', 'signin', 'signup', 'logout',
  'sso', 'oauth', 'account', 'profile',

  // Support
  'support', 'help', 'docs', 'blog', 'status',
  'cdn', 'static', 'assets', 'media', 'images',

  // Legal/Corporate
  'legal', 'terms', 'privacy', 'about', 'contact',
  'team', 'careers', 'press', 'investors',

  // Generic reserved
  'undefined', 'null', 'true', 'false', 'root',
] as const

export type ReservedSubdomain = typeof RESERVED_SUBDOMAINS[number]

/**
 * Check if a subdomain is reserved
 */
export function isReservedSubdomain(subdomain: string): boolean {
  return (RESERVED_SUBDOMAINS as readonly string[]).includes(subdomain.toLowerCase())
}

/**
 * Validate a subdomain
 */
export function validateSubdomain(subdomain: string): { valid: boolean; error?: string } {
  // Must be lowercase
  if (subdomain !== subdomain.toLowerCase()) {
    return { valid: false, error: 'Subdomain must be lowercase' }
  }

  // Length check
  if (subdomain.length < 2 || subdomain.length > 63) {
    return { valid: false, error: 'Subdomain must be 2-63 characters' }
  }

  // Character check (alphanumeric and hyphens, no leading/trailing hyphens)
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain)) {
    return { valid: false, error: 'Subdomain must be alphanumeric with optional hyphens' }
  }

  // Reserved check
  if (isReservedSubdomain(subdomain)) {
    return { valid: false, error: 'Subdomain is reserved' }
  }

  return { valid: true }
}

// =============================================================================
// Builder.Domains DO Interface
// =============================================================================

/**
 * Interface for the Builder.Domains DO
 * This is the primary DO that manages all subdomain registrations
 */
export interface DomainsManager {
  /** Check if a subdomain is available */
  check(subdomain: string, tld: PlatformTLD): Promise<SubdomainStatus>

  /** Claim a subdomain */
  claim(request: ClaimSubdomainRequest): Promise<ClaimSubdomainResult>

  /** Release a subdomain */
  release(subdomain: string, tld: PlatformTLD, ownerRef: string): Promise<boolean>

  /** List subdomains for an owner */
  listByOwner(ownerRef: string): Promise<SubdomainRegistration[]>

  /** Get registration by subdomain */
  get(subdomain: string, tld: PlatformTLD): Promise<SubdomainRegistration | null>

  /** Search subdomains */
  search(query: string, tld?: PlatformTLD): Promise<SubdomainRegistration[]>
}

// =============================================================================
// Context Integration
// =============================================================================

/**
 * Domain context for $ accessor
 *
 * Usage:
 * ```typescript
 * DO($ => {
 *   // Claim a subdomain (creates a child DO)
 *   const { $id } = await $.domain`acme.saas.group`
 *   // → https://acme.saas.group
 *
 *   // Or explicitly
 *   const { $id } = await $.domain.claim('acme', 'saas.group')
 *
 *   // Check availability
 *   const available = await $.domain.check('acme', 'saas.group')
 * })
 * ```
 */
export interface DomainContext {
  /** Claim subdomain with tagged template */
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<{ $id: string }>

  /** Check availability */
  check(subdomain: string, tld: PlatformTLD): Promise<SubdomainStatus>

  /** Claim a subdomain */
  claim(subdomain: string, tld: PlatformTLD): Promise<ClaimSubdomainResult>

  /** Release a subdomain */
  release(subdomain: string, tld: PlatformTLD): Promise<boolean>

  /** List owned subdomains */
  list(): Promise<SubdomainRegistration[]>
}
