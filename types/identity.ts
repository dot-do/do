/**
 * Core Identity Model for Digital Objects
 *
 * Every DO has three identity properties: $id, $type, and optional $context
 * All identifiers are real HTTPS URLs - no custom schemes.
 *
 * DUAL NATURE PATTERN (N-Level Hierarchy):
 * A Thing inside a parent DO can also BE its own independent DO.
 * This pattern supports unlimited nesting depth.
 *
 * Example hierarchy:
 * ```
 * https://startups.studio (Business DO)
 *   └─ headless.ly (Thing in startups.studio)
 *        └─ https://headless.ly (Startup DO, $context: 'https://startups.studio')
 *             └─ https://crm.headless.ly (SaaS App DO, $context: 'https://headless.ly')
 *                  └─ https://crm.headless.ly/acme (Tenant DO, $context: 'https://crm.headless.ly')
 * ```
 *
 * $context chain (all HTTPS URLs):
 * - https://crm.headless.ly/acme.$context = 'https://crm.headless.ly'
 * - https://crm.headless.ly.$context = 'https://headless.ly'
 * - https://headless.ly.$context = 'https://startups.studio'
 *
 * Bidirectional relationships:
 * - Parent → Child: Thing.$ref = 'https://child.domain' (URL string)
 * - Child → Parent: DO.$context = 'https://parent.domain' (URL string)
 *
 * CDC events bubble up: Child DO → Parent DO ($context) → ... → R2/Iceberg
 * Each level can observe/aggregate events from all descendants.
 */

/**
 * $type is a URL that defines the type/schema of this DO
 *
 * Type URL patterns:
 * - Relative to $context: If $context is 'https://startups.studio' and type is 'Startup',
 *   the resolved $type URL is 'https://startups.studio/Startup'
 * - External schema: 'https://schema.org.ai/Agent' - using shared schema definitions
 * - Platform types: 'https://do.md/Business', 'https://do.md/SaaS'
 *
 * Examples:
 * ```typescript
 * // Type derived from $context
 * {
 *   $id: 'https://headless.ly',
 *   $type: 'https://startups.studio/Startup',  // or just 'Startup' if $context resolves it
 *   $context: 'https://startups.studio'
 * }
 *
 * // External schema type
 * {
 *   $id: 'https://agents.do/sales-agent',
 *   $type: 'https://schema.org.ai/Agent',
 *   $context: 'https://agents.do'
 * }
 * ```
 */
export type DOType = string // URL or shorthand name that resolves to URL

/**
 * Well-known type names (resolve to https://do.md/{TypeName})
 *
 * Business Types: Top-level business constructs
 * Content Types: Sites, apps, and content entities
 * Operational Types: Runtime components
 * Utility Types: Supporting entities
 */
export type WellKnownType =
  // Business Types (top-level constructs)
  | 'Business' // Top-level organization (e.g., startups.studio)
  | 'Startup' // Generated startup entity with full cascade
  | 'SaaS' // Multi-tenant application platform (e.g., headless.ly)
  | 'IaaS' // Infrastructure as a Service
  | 'PaaS' // Platform as a Service
  | 'Service' // AI Services-as-Software (e.g., agentic.services)

  // Content Types (mdxui + mdxdb)
  | 'Site' // Marketing site, docs, blog, directory (14 site types)
  | 'App' // SaaS application (17 app types)
  | 'Page' // MDX page within Site
  | 'Post' // Blog post
  | 'Doc' // Documentation page

  // Operational Types
  | 'Agent' // Autonomous agent
  | 'Database' // Data storage (db4 instance)
  | 'Directory' // Curated collection/registry
  | 'Marketplace' // Multi-vendor marketplace

  // Utility Types
  | 'Workflow' // Process orchestration (11-stage cascade)
  | 'Function' // Fn<Out,In,Opts> executable
  | 'Collection' // Generic collection
  | 'User' // Human identity
  | 'Org' // Organization/group

/**
 * Resolve a type name to its full URL
 *
 * @param typeName - Short name like 'Startup' or full URL
 * @param context - Optional $context URL to resolve relative types
 * @returns Full type URL
 *
 * Examples:
 * - resolveTypeUrl('Startup') → 'https://do.md/Startup'
 * - resolveTypeUrl('Startup', 'https://startups.studio') → 'https://startups.studio/Startup'
 * - resolveTypeUrl('https://schema.org.ai/Agent') → 'https://schema.org.ai/Agent'
 */
export function resolveTypeUrl(typeName: string, context?: string): string {
  // Already a URL
  if (typeName.startsWith('https://')) return typeName

  // Resolve relative to context if provided
  if (context) return `${context}/${typeName}`

  // Fall back to platform types
  return `https://do.md/${typeName}`
}

/**
 * Reference to another Digital Object - just a URL string
 * Used for $context, $ref, relationships, and dependencies
 *
 * Examples:
 * - 'https://startups.studio'
 * - 'https://headless.ly'
 * - 'https://crm.headless.ly/acme'
 */
export type DigitalObjectRef = string

/**
 * Core identity interface for all Digital Objects
 */
export interface DigitalObjectIdentity {
  /** HTTPS URL: https://domain or https://domain/path */
  $id: string
  /**
   * Type URL - defines the schema/type of this DO
   *
   * Can be:
   * - Full URL: 'https://schema.org.ai/Agent'
   * - Relative to $context: 'Startup' resolves to '${$context}/Startup'
   * - Platform type: 'Business' resolves to 'https://do.md/Business'
   */
  $type: DOType
  /** Parent DO URL for streaming (hierarchical CDC) */
  $context?: DigitalObjectRef
  /** Version number for optimistic concurrency */
  $version: number
  /** Creation timestamp (Unix ms) */
  $createdAt: number
  /** Last update timestamp (Unix ms) */
  $updatedAt: number
}

/**
 * Parse a DO URL into its components
 */
export interface ParsedDOUrl {
  /** Always https */
  protocol: 'https'
  /** Domain (e.g., 'headless.ly', 'crm.headless.ly') */
  domain: string
  /** Path after domain (e.g., '/acme', '/users/bob') */
  path?: string
}

/**
 * DO metadata that can be attached to any object
 */
export interface DOMetadata {
  /** Human-readable name */
  name?: string
  /** Description of this DO */
  description?: string
  /** Tags for categorization */
  tags?: string[]
  /** Custom labels (key-value pairs) */
  labels?: Record<string, string>
  /** Annotations (non-identifying metadata) */
  annotations?: Record<string, unknown>
}
