/**
 * Request Routing Configuration
 *
 * Manages routing rules for subdomains to Workers, Durable Objects,
 * Pages deployments, or external URLs.
 *
 * @module domains/routing
 */

import type { PlatformTLD } from '../../types/domains'

// =============================================================================
// Types
// =============================================================================

/**
 * Route target types
 */
export type RouteTargetType = 'worker' | 'do' | 'pages' | 'external'

/**
 * Worker route target
 */
export interface WorkerTarget {
  type: 'worker'
  /** Worker script name */
  script: string
  /** Optional environment (production, staging, etc.) */
  environment?: string
}

/**
 * Durable Object route target
 */
export interface DOTarget {
  type: 'do'
  /** DO namespace binding name */
  namespace: string
  /** Optional specific DO instance ID */
  id?: string
  /** Method to determine DO ID from request (default: subdomain) */
  idFromRequest?: 'subdomain' | 'path' | 'header'
}

/**
 * Cloudflare Pages route target
 */
export interface PagesTarget {
  type: 'pages'
  /** Pages project name */
  project: string
  /** Optional branch (default: production) */
  branch?: string
}

/**
 * External URL route target
 */
export interface ExternalTarget {
  type: 'external'
  /** Target URL (requests will be proxied) */
  url: string
  /** Whether to preserve the original host header */
  preserveHost?: boolean
}

/**
 * Any route target
 */
export type RouteTarget = WorkerTarget | DOTarget | PagesTarget | ExternalTarget

/**
 * Route configuration
 */
export interface RouteConfig {
  /** The subdomain this route applies to */
  subdomain: string
  /** The platform TLD */
  tld: PlatformTLD
  /** Where to route requests */
  target: RouteTarget
  /** Path patterns this route matches (default: all paths) */
  paths?: string[]
  /** Priority for overlapping routes (higher wins) */
  priority?: number
  /** Whether the route is enabled */
  enabled: boolean
  /** Created timestamp */
  createdAt: number
  /** Updated timestamp */
  updatedAt: number
}

/**
 * Options for setting a route
 */
export interface SetRouteOptions {
  /** The subdomain */
  subdomain: string
  /** The platform TLD */
  tld: PlatformTLD
  /** Route target */
  target: RouteTarget
  /** Path patterns (optional) */
  paths?: string[]
  /** Priority (optional) */
  priority?: number
}

/**
 * Options for listing routes
 */
export interface ListRoutesOptions {
  /** Filter by TLD */
  tld?: PlatformTLD
  /** Filter by target type */
  targetType?: RouteTargetType
  /** Filter by enabled status */
  enabled?: boolean
  /** Maximum results */
  limit?: number
  /** Pagination cursor */
  cursor?: string
}

/**
 * Result of listing routes
 */
export interface ListRoutesResult {
  /** The route configurations */
  routes: RouteConfig[]
  /** Cursor for next page */
  cursor?: string
  /** Whether more results exist */
  hasMore: boolean
}

/**
 * Error from routing operations
 */
export class RoutingError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID_TARGET' | 'INVALID_PATH',
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'RoutingError'
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Set a route for a subdomain
 *
 * @param options - Route options
 * @returns The created/updated route config
 *
 * @example
 * ```typescript
 * // Route to a Durable Object
 * const route = await setRoute({
 *   subdomain: 'acme',
 *   tld: 'saas.group',
 *   target: {
 *     type: 'do',
 *     namespace: 'DigitalObject',
 *     id: 'acme-startup'
 *   }
 * })
 *
 * // Route specific paths to a Worker
 * await setRoute({
 *   subdomain: 'api',
 *   tld: 'acme.saas.group',
 *   target: { type: 'worker', script: 'acme-api' },
 *   paths: ['/v1/*', '/v2/*']
 * })
 * ```
 */
export async function setRoute(options: SetRouteOptions): Promise<RouteConfig> {
  // Validate target
  const validation = validateTarget(options.target)
  if (!validation.valid) {
    throw new RoutingError('INVALID_TARGET', validation.error!)
  }

  // Validate paths if provided
  if (options.paths) {
    for (const path of options.paths) {
      const pathValidation = validatePathPattern(path)
      if (!pathValidation.valid) {
        throw new RoutingError('INVALID_PATH', pathValidation.error!, { path })
      }
    }
  }

  // TODO: Store route in Builder.Domains DO
  throw new Error('Not implemented')
}

/**
 * Get the route configuration for a subdomain
 *
 * @param subdomain - The subdomain
 * @param tld - The platform TLD
 * @returns The route config or null if not found
 *
 * @example
 * ```typescript
 * const route = await getRoute('acme', 'saas.group')
 * if (route) {
 *   console.log('Routes to:', route.target.type)
 * }
 * ```
 */
export async function getRoute(subdomain: string, tld: PlatformTLD): Promise<RouteConfig | null> {
  // TODO: Fetch from Builder.Domains DO
  throw new Error('Not implemented')
}

/**
 * Delete a route
 *
 * @param subdomain - The subdomain
 * @param tld - The platform TLD
 * @returns True if deleted successfully
 *
 * @example
 * ```typescript
 * await deleteRoute('acme', 'saas.group')
 * ```
 */
export async function deleteRoute(subdomain: string, tld: PlatformTLD): Promise<boolean> {
  // TODO: Delete from Builder.Domains DO
  throw new Error('Not implemented')
}

/**
 * List routes
 *
 * @param options - List options
 * @returns Paginated list of routes
 *
 * @example
 * ```typescript
 * const result = await listRoutes({
 *   tld: 'saas.group',
 *   targetType: 'do'
 * })
 * ```
 */
export async function listRoutes(options?: ListRoutesOptions): Promise<ListRoutesResult> {
  // TODO: Fetch from Builder.Domains DO
  throw new Error('Not implemented')
}

/**
 * Enable a route
 *
 * @param subdomain - The subdomain
 * @param tld - The platform TLD
 * @returns The updated route config
 */
export async function enableRoute(subdomain: string, tld: PlatformTLD): Promise<RouteConfig> {
  // TODO: Update route in Builder.Domains DO
  throw new Error('Not implemented')
}

/**
 * Disable a route (stops routing without deleting config)
 *
 * @param subdomain - The subdomain
 * @param tld - The platform TLD
 * @returns The updated route config
 */
export async function disableRoute(subdomain: string, tld: PlatformTLD): Promise<RouteConfig> {
  // TODO: Update route in Builder.Domains DO
  throw new Error('Not implemented')
}

// =============================================================================
// Route Resolution
// =============================================================================

/**
 * Resolve the route target for an incoming request
 *
 * @param request - The incoming request
 * @returns The matched route or null
 *
 * @example
 * ```typescript
 * const route = await resolveRoute(request)
 * if (route) {
 *   switch (route.target.type) {
 *     case 'do':
 *       return forwardToDO(route.target, request)
 *     case 'worker':
 *       return forwardToWorker(route.target, request)
 *     // ...
 *   }
 * }
 * ```
 */
export async function resolveRoute(request: Request): Promise<RouteConfig | null> {
  const url = new URL(request.url)
  const hostname = url.hostname

  // Extract subdomain and TLD from hostname
  const parsed = parseHostname(hostname)
  if (!parsed) {
    return null
  }

  // Get route config
  const route = await getRoute(parsed.subdomain, parsed.tld as PlatformTLD)
  if (!route || !route.enabled) {
    return null
  }

  // Check path matching
  if (route.paths && route.paths.length > 0) {
    const matched = route.paths.some((pattern) => matchPath(url.pathname, pattern))
    if (!matched) {
      return null
    }
  }

  return route
}

/**
 * Forward a request to its route target
 *
 * @param route - The route configuration
 * @param request - The incoming request
 * @param env - Environment bindings
 * @returns The response from the target
 */
export async function forwardToTarget(
  route: RouteConfig,
  request: Request,
  env: Record<string, unknown>
): Promise<Response> {
  switch (route.target.type) {
    case 'do':
      return forwardToDO(route.target, request, env)
    case 'worker':
      return forwardToWorker(route.target, request)
    case 'pages':
      return forwardToPages(route.target, request)
    case 'external':
      return forwardToExternal(route.target, request)
    default:
      return new Response('Unknown route target', { status: 500 })
  }
}

// =============================================================================
// Target-Specific Forwarding
// =============================================================================

/**
 * Forward request to a Durable Object
 */
async function forwardToDO(
  target: DOTarget,
  request: Request,
  env: Record<string, unknown>
): Promise<Response> {
  const namespace = env[target.namespace] as DurableObjectNamespace | undefined
  if (!namespace) {
    return new Response(`DO namespace not found: ${target.namespace}`, { status: 500 })
  }

  // Determine DO ID
  let doId: DurableObjectId
  if (target.id) {
    doId = namespace.idFromName(target.id)
  } else {
    // Derive ID from request based on idFromRequest setting
    const url = new URL(request.url)
    const idSource = target.idFromRequest ?? 'subdomain'

    switch (idSource) {
      case 'subdomain':
        const parsed = parseHostname(url.hostname)
        doId = namespace.idFromName(parsed?.subdomain ?? 'default')
        break
      case 'path':
        const pathSegment = url.pathname.split('/')[1] ?? 'default'
        doId = namespace.idFromName(pathSegment)
        break
      case 'header':
        const headerId = request.headers.get('X-DO-ID') ?? 'default'
        doId = namespace.idFromName(headerId)
        break
    }
  }

  const stub = namespace.get(doId)
  return stub.fetch(request)
}

/**
 * Forward request to a Worker
 */
async function forwardToWorker(target: WorkerTarget, request: Request): Promise<Response> {
  // TODO: Implement Worker service binding forwarding
  throw new Error('Not implemented')
}

/**
 * Forward request to Cloudflare Pages
 */
async function forwardToPages(target: PagesTarget, request: Request): Promise<Response> {
  // Rewrite to pages.dev URL
  const pagesUrl = `https://${target.project}.pages.dev`
  const url = new URL(request.url)
  const newUrl = new URL(url.pathname + url.search, pagesUrl)

  return fetch(new Request(newUrl.toString(), request))
}

/**
 * Forward request to external URL
 */
async function forwardToExternal(target: ExternalTarget, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const targetUrl = new URL(url.pathname + url.search, target.url)

  const newRequest = new Request(targetUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
  })

  if (!target.preserveHost) {
    newRequest.headers.set('Host', targetUrl.host)
  }

  return fetch(newRequest)
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate a route target
 */
export function validateTarget(target: RouteTarget): { valid: boolean; error?: string } {
  switch (target.type) {
    case 'worker':
      if (!target.script) {
        return { valid: false, error: 'Worker target requires script name' }
      }
      break
    case 'do':
      if (!target.namespace) {
        return { valid: false, error: 'DO target requires namespace' }
      }
      break
    case 'pages':
      if (!target.project) {
        return { valid: false, error: 'Pages target requires project name' }
      }
      break
    case 'external':
      if (!target.url) {
        return { valid: false, error: 'External target requires URL' }
      }
      try {
        new URL(target.url)
      } catch {
        return { valid: false, error: 'External target URL is invalid' }
      }
      break
  }
  return { valid: true }
}

/**
 * Validate a path pattern
 */
export function validatePathPattern(pattern: string): { valid: boolean; error?: string } {
  if (!pattern.startsWith('/')) {
    return { valid: false, error: 'Path pattern must start with /' }
  }
  return { valid: true }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse hostname into subdomain and TLD
 */
function parseHostname(hostname: string): { subdomain: string; tld: string } | null {
  const parts = hostname.split('.')
  if (parts.length < 3) {
    return null
  }
  // Assumes TLD is last 2 parts
  return {
    subdomain: parts.slice(0, -2).join('.'),
    tld: parts.slice(-2).join('.'),
  }
}

/**
 * Match a path against a pattern
 */
function matchPath(path: string, pattern: string): boolean {
  // Simple glob matching
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2)
    return path.startsWith(prefix)
  }
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1)
    return path.startsWith(prefix)
  }
  return path === pattern
}
