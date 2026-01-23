/**
 * Domain Management Module
 *
 * Manages subdomains on 50+ platform TLDs with DNS, SSL, and routing.
 *
 * @module domains
 *
 * @example
 * ```typescript
 * import { createSubdomainClient, validateSubdomain, setRoute } from 'do/domains'
 *
 * // Create client
 * const client = createSubdomainClient(env.BUILDER_DOMAINS)
 *
 * // Validate and claim
 * const validation = validateSubdomain('acme')
 * if (validation.valid) {
 *   const result = await client.claim({
 *     subdomain: 'acme',
 *     tld: 'saas.group',
 *     ownerRef: 'do://Startup/acme'
 *   })
 * }
 *
 * // Configure routing
 * await setRoute({
 *   subdomain: 'acme',
 *   tld: 'saas.group',
 *   target: { type: 'do', namespace: 'DigitalObject', id: 'acme' }
 * })
 * ```
 */

// =============================================================================
// TLD Registry
// =============================================================================

export {
  getAllTLDs,
  getTLDsByCategory,
  isValidTLD,
  getTLDConfig,
  getZoneId,
  getDefaultTarget,
  hasFeature,
  initializeTLDs,
  getTLDDescription,
  TLD_CATEGORY_DESCRIPTIONS,
  type TLDConfig,
  type TLDFeatures,
  type TLDCategory,
  type RouteTarget,
} from './tlds'

// =============================================================================
// Subdomain Operations
// =============================================================================

export {
  SubdomainClient,
  createSubdomainClient,
  buildDomainUrl,
  parseDomainUrl,
  isPlatformDomain,
  type ListSubdomainsOptions,
  type ListSubdomainsResult,
  type SearchSubdomainsOptions,
} from './subdomains'

// =============================================================================
// DNS Management
// =============================================================================

export {
  createDNSRecord,
  getDNSRecord,
  updateDNSRecord,
  deleteDNSRecord,
  listDNSRecords,
  findDNSRecordsByName,
  batchCreateDNSRecords,
  deleteAllDNSRecords,
  buildDNSName,
  shouldProxyByDefault,
  DNSError,
  type DNSRecordType,
  type DNSRecord,
  type CreateDNSRecordOptions,
  type UpdateDNSRecordOptions,
  type ListDNSRecordsOptions,
  type ListDNSRecordsResult,
} from './dns'

// =============================================================================
// SSL Certificates
// =============================================================================

export {
  getCertificateStatus,
  waitForCertificate,
  isCertificateActive,
  listCertificates,
  requiresAdvancedCertificate,
  getExpiringCertificates,
  orderAdvancedCertificate,
  extractTLD,
  extractSubdomain,
  SSLError,
  type SSLStatus,
  type SSLCertificateType,
  type SSLValidationMethod,
  type SSLCertificate,
  type CheckCertificateOptions,
  type WaitForCertificateOptions,
} from './ssl'

// =============================================================================
// Request Routing
// =============================================================================

export {
  setRoute,
  getRoute,
  deleteRoute,
  listRoutes,
  enableRoute,
  disableRoute,
  resolveRoute,
  forwardToTarget,
  validateTarget,
  validatePathPattern,
  RoutingError,
  type RouteTargetType,
  type WorkerTarget,
  type DOTarget,
  type PagesTarget,
  type ExternalTarget,
  type RouteConfig,
  type SetRouteOptions,
  type ListRoutesOptions,
  type ListRoutesResult,
} from './routing'

// =============================================================================
// Validation
// =============================================================================

export {
  validateSubdomain,
  validateTLD,
  validateDomain,
  isReserved,
  normalizeSubdomain,
  suggestAlternatives,
  getReservedSubdomains,
  ADDITIONAL_RESERVED_SUBDOMAINS,
  ALL_RESERVED_SUBDOMAINS,
  type ValidationResult,
  type ValidationDetails,
  type ValidationOptions,
} from './validation'

// =============================================================================
// Re-export types from types/domains.ts
// =============================================================================

export {
  PLATFORM_TLDS,
  RESERVED_SUBDOMAINS,
  isReservedSubdomain,
  validateSubdomain as validateSubdomainBase,
  type PlatformTLD,
  type SubdomainStatus,
  type SubdomainRegistration,
  type ClaimSubdomainRequest,
  type ClaimSubdomainResult,
  type DomainsManager,
  type DomainContext,
  type ReservedSubdomain,
} from '../../types/domains'
