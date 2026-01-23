/**
 * Platform TLD Registry
 *
 * Manages the 50+ platform-owned TLDs available for free subdomain registration.
 * Each TLD has associated Cloudflare zone configuration and feature flags.
 *
 * @module domains/tlds
 */

import { PLATFORM_TLDS, type PlatformTLD } from '../../types/domains'

// =============================================================================
// TLD Configuration Types
// =============================================================================

/**
 * Route target for default subdomain routing
 */
export type RouteTarget =
  | { type: 'worker'; script: string }
  | { type: 'do'; namespace: string; id?: string }
  | { type: 'pages'; project: string }
  | { type: 'external'; url: string }

/**
 * Feature flags for a TLD
 */
export interface TLDFeatures {
  /** Email routing enabled for this TLD */
  email: boolean
  /** Wildcard SSL certificate available */
  wildcardSSL: boolean
  /** Allow custom DNS records (beyond default A/AAAA) */
  customDNS: boolean
  /** Allow deep subdomains (a.b.tld) */
  deepSubdomains: boolean
}

/**
 * Configuration for a platform TLD
 */
export interface TLDConfig {
  /** The TLD (e.g., 'saas.group') */
  tld: PlatformTLD
  /** Cloudflare zone ID */
  zoneId: string
  /** Default routing target for new subdomains */
  defaultTarget: RouteTarget
  /** Feature flags */
  features: TLDFeatures
  /** Human-readable description */
  description: string
  /** Category for grouping */
  category: TLDCategory
}

/**
 * TLD category for organizational purposes
 */
export type TLDCategory =
  | 'business'
  | 'studio'
  | 'startup'
  | 'saas'
  | 'infrastructure'

// =============================================================================
// TLD Registry
// =============================================================================

/**
 * Registry of all platform TLD configurations
 *
 * Note: Zone IDs should be populated from environment variables in production.
 * Placeholder values shown here for structure reference.
 */
const TLD_CONFIGS: Map<PlatformTLD, TLDConfig> = new Map()

/**
 * Default features for most TLDs
 */
const DEFAULT_FEATURES: TLDFeatures = {
  email: true,
  wildcardSSL: true,
  customDNS: true,
  deepSubdomains: false,
}

/**
 * Default route target (route to DO)
 */
const DEFAULT_TARGET: RouteTarget = {
  type: 'do',
  namespace: 'DigitalObject',
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get all available platform TLDs
 *
 * @returns Array of all platform TLD strings
 *
 * @example
 * ```typescript
 * const tlds = getAllTLDs()
 * // ['hq.com.ai', 'app.net.ai', 'saas.group', ...]
 * ```
 */
export function getAllTLDs(): readonly PlatformTLD[] {
  return PLATFORM_TLDS
}

/**
 * Get TLDs by category
 *
 * @param category - The category to filter by
 * @returns Array of TLDs in the specified category
 *
 * @example
 * ```typescript
 * const saasTLDs = getTLDsByCategory('saas')
 * // ['saas.group', 'agents.do', 'workers.do', 'functions.do']
 * ```
 */
export function getTLDsByCategory(category: TLDCategory): PlatformTLD[] {
  // TODO: Implement based on TLD_CONFIGS
  throw new Error('Not implemented')
}

/**
 * Check if a string is a valid platform TLD
 *
 * @param tld - The string to check
 * @returns True if the string is a valid platform TLD
 *
 * @example
 * ```typescript
 * isValidTLD('saas.group') // true
 * isValidTLD('example.com') // false
 * ```
 */
export function isValidTLD(tld: string): tld is PlatformTLD {
  return (PLATFORM_TLDS as readonly string[]).includes(tld)
}

/**
 * Get configuration for a specific TLD
 *
 * @param tld - The platform TLD
 * @returns TLD configuration or null if not found
 *
 * @example
 * ```typescript
 * const config = getTLDConfig('saas.group')
 * // { tld: 'saas.group', zoneId: '...', features: {...}, ... }
 * ```
 */
export function getTLDConfig(tld: PlatformTLD): TLDConfig | null {
  // TODO: Implement lookup from TLD_CONFIGS or environment
  throw new Error('Not implemented')
}

/**
 * Get the Cloudflare zone ID for a TLD
 *
 * @param tld - The platform TLD
 * @returns Zone ID or null if not configured
 *
 * @example
 * ```typescript
 * const zoneId = getZoneId('saas.group')
 * // 'abc123...'
 * ```
 */
export function getZoneId(tld: PlatformTLD): string | null {
  // TODO: Implement - should read from environment or config
  throw new Error('Not implemented')
}

/**
 * Get default route target for a TLD
 *
 * @param tld - The platform TLD
 * @returns Default route target
 *
 * @example
 * ```typescript
 * const target = getDefaultTarget('saas.group')
 * // { type: 'do', namespace: 'DigitalObject' }
 * ```
 */
export function getDefaultTarget(tld: PlatformTLD): RouteTarget {
  const config = TLD_CONFIGS.get(tld)
  return config?.defaultTarget ?? DEFAULT_TARGET
}

/**
 * Check if a TLD supports a specific feature
 *
 * @param tld - The platform TLD
 * @param feature - The feature to check
 * @returns True if the feature is enabled for this TLD
 *
 * @example
 * ```typescript
 * hasFeature('saas.group', 'email') // true
 * hasFeature('cdn.land', 'email') // false
 * ```
 */
export function hasFeature(tld: PlatformTLD, feature: keyof TLDFeatures): boolean {
  const config = TLD_CONFIGS.get(tld)
  return config?.features[feature] ?? DEFAULT_FEATURES[feature]
}

/**
 * Initialize TLD configurations from environment
 *
 * @param env - Environment bindings with zone IDs
 *
 * @example
 * ```typescript
 * // In worker entry point
 * initializeTLDs(env)
 * ```
 */
export function initializeTLDs(env: Record<string, string>): void {
  // TODO: Populate TLD_CONFIGS from environment variables
  // e.g., env.CF_ZONE_SAAS_GROUP -> 'saas.group' zone ID
  throw new Error('Not implemented')
}

// =============================================================================
// TLD Metadata (for documentation/UI)
// =============================================================================

/**
 * Human-readable descriptions for each TLD category
 */
export const TLD_CATEGORY_DESCRIPTIONS: Record<TLDCategory, string> = {
  business: 'Primary business TLDs for headquarters and applications',
  studio: 'Studio and builder TLDs for development platforms',
  startup: 'Startup-focused TLDs for new ventures',
  saas: 'SaaS product TLDs for software services',
  infrastructure: 'Infrastructure TLDs for CDN, edge, and platform services',
}

/**
 * Get a human-readable description for a TLD
 *
 * @param tld - The platform TLD
 * @returns Description string
 */
export function getTLDDescription(tld: PlatformTLD): string {
  const config = TLD_CONFIGS.get(tld)
  return config?.description ?? `Platform TLD: ${tld}`
}
