/**
 * DO API Module
 *
 * Hono-based API layer for Digital Objects.
 * Provides REST, RPC, and MCP endpoints with composable middleware.
 *
 * @example
 * ```typescript
 * import { createApp } from './api'
 *
 * // Create the app with all defaults
 * const app = createApp()
 *
 * // Or customize
 * const app = createApp({
 *   cors: true,
 *   rateLimit: true,
 *   auth: false,
 * })
 *
 * export default {
 *   fetch: app.fetch,
 * }
 * ```
 */

import { Hono } from 'hono'
import type { Env, DOContext } from './types'

// Middleware
import {
  createContextMiddleware,
  createErrorMiddleware,
  createLoggingMiddleware,
  createSecurityMiddleware,
  createCorsMiddleware,
  createRateLimitMiddleware,
  createAuthMiddleware,
} from './middleware'

// Routes
import { createHealthRoutes } from './routes/health'
import { createDORoutes } from './routes/do'
import { createAIRoutes } from './routes/ai'
import { createRootRoute, createRPCRoutes } from './routes'
// Agents routes excluded from 0.0.1 - depends on workers module
// import { createAgentsRoutes } from './routes/agents'
import { createRolesRoutes } from './routes/roles'
import { createMCPRoutes } from './mcp'

// =============================================================================
// App Configuration
// =============================================================================

/**
 * App configuration options
 */
export interface AppConfig {
  /** Enable CORS middleware (default: true) */
  cors?: boolean
  /** Enable rate limiting (default: true) */
  rateLimit?: boolean
  /** Enable authentication middleware (default: false) */
  auth?: boolean
  /** Enable request logging (default: true in dev, false in prod) */
  logging?: boolean
  /** Enable security headers (default: true) */
  security?: boolean
  /** Custom middleware to add */
  middleware?: Array<(c: unknown, next: () => Promise<void>) => Promise<void | Response>>
}

// =============================================================================
// App Factory
// =============================================================================

/**
 * Create a fully configured Hono app for the DO API
 *
 * @example
 * // Basic usage - all defaults
 * const app = createApp()
 *
 * @example
 * // Production setup
 * const app = createApp({
 *   cors: true,
 *   rateLimit: true,
 *   auth: true,
 *   logging: false,
 *   security: true,
 * })
 *
 * @example
 * // Development setup
 * const app = createApp({
 *   cors: true,
 *   rateLimit: false,
 *   auth: false,
 *   logging: true,
 * })
 */
export function createApp(config: AppConfig = {}): Hono<{ Bindings: Env; Variables: DOContext }> {
  const app = new Hono<{ Bindings: Env; Variables: DOContext }>()

  // ==========================================================================
  // Core Middleware (always enabled)
  // ==========================================================================

  // Request context (request ID, timing, hostname)
  app.use('*', createContextMiddleware())

  // Error handling
  app.use('*', createErrorMiddleware())

  // ==========================================================================
  // Optional Middleware
  // ==========================================================================

  // Logging (default: true)
  if (config.logging !== false) {
    app.use('*', createLoggingMiddleware({
      skipPaths: ['/_health', '/favicon.ico'],
    }))
  }

  // Security headers (default: true)
  if (config.security !== false) {
    app.use('*', createSecurityMiddleware())
  }

  // CORS (default: true)
  if (config.cors !== false) {
    app.use('*', createCorsMiddleware())
  }

  // Rate limiting (default: true)
  if (config.rateLimit !== false) {
    app.use('*', createRateLimitMiddleware())
  }

  // Authentication (default: false - opt-in)
  if (config.auth) {
    app.use('*', createAuthMiddleware())
  }

  // Custom middleware
  if (config.middleware) {
    for (const mw of config.middleware) {
      app.use('*', mw as any)
    }
  }

  // ==========================================================================
  // Routes
  // ==========================================================================

  // Health checks (first to ensure they're always fast)
  app.route('/', createHealthRoutes())

  // MCP routes
  app.route('/', createMCPRoutes())

  // RPC routes
  app.route('/', createRPCRoutes())

  // AI routes
  app.route('/', createAIRoutes())

  // Agents routes excluded from 0.0.1 - depends on workers module
  // app.route('/', createAgentsRoutes())

  // Roles routes (before generic DO routes for specific path matching)
  app.route('/', createRolesRoutes())

  // DO CRUD routes
  app.route('/', createDORoutes())

  // Root discovery (last to not interfere with other routes)
  app.route('/', createRootRoute())

  // ==========================================================================
  // Catch-all: Route to DO
  // ==========================================================================

  app.all('*', async (c) => {
    const url = new URL(c.req.url)

    // Route to the appropriate DO
    const doId = c.env.DO.idFromName(url.hostname)
    const stub = c.env.DO.get(doId)

    return stub.fetch(c.req.raw)
  })

  return app
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Create a minimal app with just core middleware
 * Useful for testing or when you want full control
 */
export function createMinimalApp(): Hono<{ Bindings: Env; Variables: DOContext }> {
  return createApp({
    cors: false,
    rateLimit: false,
    auth: false,
    logging: false,
    security: false,
  })
}

/**
 * Create a production-ready app with all security features
 */
export function createProductionApp(): Hono<{ Bindings: Env; Variables: DOContext }> {
  return createApp({
    cors: true,
    rateLimit: true,
    auth: true,
    logging: false,
    security: true,
  })
}

/**
 * Create a development app with logging and relaxed security
 */
export function createDevelopmentApp(): Hono<{ Bindings: Env; Variables: DOContext }> {
  return createApp({
    cors: true,
    rateLimit: false,
    auth: false,
    logging: true,
    security: false,
  })
}

// =============================================================================
// Re-exports
// =============================================================================

// Types
export type {
  Env,
  DOContext,
  AuthUser,
  AuthOptions,
  AuthResult,
  APIResponse,
  APIErrorResponse,
  PaginatedResponse,
  PaginationInfo,
  RateLimitConfig,
  RateLimitInfo,
  CORSConfig,
  HealthCheckResponse,
  AIGenerateRequest,
  AIChatRequest,
  AIEmbedRequest,
} from './types'

// Middleware
export {
  createAuthMiddleware,
  createApiKeyMiddleware,
  createCorsMiddleware,
  createDynamicCorsMiddleware,
  createRateLimitMiddleware,
  createAIRateLimitMiddleware,
  createWriteRateLimitMiddleware,
  createContextMiddleware,
  createLoggingMiddleware,
  createErrorMiddleware,
  createSecurityMiddleware,
  composeMiddleware,
  getUser,
  requireUser,
  hasRole,
  hasPermission,
} from './middleware'

// Routes
export {
  createHealthRoutes,
  createDORoutes,
  createAIRoutes,
  createRootRoute,
  createRPCRoutes,
  createAllRoutes,
  // Agents routes excluded from 0.0.1 - depends on workers module
  // createAgentsRoutes,
  createRolesRoutes,
} from './routes'

// MCP
export {
  createMCPRoutes,
  getTools,
  handleListTools,
  handleToolCall,
  handleInitialize,
} from './mcp'

export type {
  MCPServerInfo,
  MCPTool,
  MCPContent,
  MCPRequest,
  MCPToolCallResponse,
  MCPListToolsResponse,
} from './mcp'

// =============================================================================
// Default Export
// =============================================================================

export default createApp
