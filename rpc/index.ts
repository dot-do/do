/**
 * CapnWeb RPC Module (Epic 2)
 *
 * Schema-free RPC with WebSocket hibernation providing:
 * - 95% cost savings through efficient connection handling
 * - Promise pipelining for batched requests
 * - Automatic reconnection and retry
 * - HTTP fallback for environments without WebSocket
 *
 * ## Migration Notice
 *
 * For **client-side** RPC, prefer using `sdk/rpc.ts` with `rpc.do`:
 *
 * ```typescript
 * // New recommended approach
 * import { RPC, createDOClient } from '@dotdo/do/sdk/rpc'
 *
 * const $ = RPC('https://my-do.workers.dev')
 * const users = await $.sql`SELECT * FROM users`.all()
 * const config = await $.storage.get('config')
 * ```
 *
 * For **server-side** handling (inside Durable Objects), continue using:
 * - `MethodRegistry` - Register and dispatch RPC methods
 * - `RPCServer` - Handle WebSocket/HTTP RPC with hibernation
 * - `RPCRouteHandler` - Schema discovery routes
 *
 * @module rpc
 */

// =============================================================================
// Client SDK (DEPRECATED - use sdk/rpc.ts instead)
// =============================================================================

/**
 * @deprecated Use `RPC()` from `sdk/rpc.ts` instead.
 * See module docs for migration guide.
 */
export {
  DOClient as RPCClientImpl,
  buildRequest,
  type RPCClientOptions,
  type ConnectionState,
  type MethodParams,
  type MethodResult,
} from './client'

// =============================================================================
// Server Implementation (Still Recommended)
// =============================================================================

/**
 * Server-side RPC handling with WebSocket hibernation support.
 * Use inside Durable Objects for handling incoming RPC requests.
 */
export {
  RPCServer,
  createRPCServer,
  createMethodContext,
  type RPCServerOptions,
  type CORSOptions,
} from './server'

// =============================================================================
// Method Registry (Still Recommended)
// =============================================================================

/**
 * Method registration and dispatch system.
 * Used by DigitalObject base class and custom DO implementations.
 */
export {
  MethodRegistry,
  dispatch,
  dispatchBatch,
  createLoggingMiddleware,
  createAuthMiddleware,
  createRateLimitMiddleware,
  createTimingMiddleware,
  registerSystemMethods,
  registerIdentityMethods,
  createDefaultRegistry,
  type MethodHandler,
  type MethodContext,
  type MethodOptions,
  type Middleware,
  type ParamSchema,
  type RegisteredMethod,
  type DOMethodContext,
} from './methods'

// =============================================================================
// Protocol Utilities (DEPRECATED)
// =============================================================================

/**
 * @deprecated Protocol handling is now done by rpc.do/capnweb.
 * These utilities are kept for backwards compatibility only.
 */
export {
  parseRequest,
  parseResponse,
  validateRequest,
  validateResponse,
  validateBatchRequest,
  validateMethodName,
  serializeRequest,
  serializeResponse,
  serializeBatchRequest,
  serializeBatchResponse,
  createError,
  createErrorResponse,
  createSuccessResponse,
  generateRequestId,
  isBatchRequest,
  isBatchResponse,
  extractNamespace,
  extractAction,
  type ParseResult,
  type ValidationResult,
  type SerializeOptions,
} from './protocol'

// =============================================================================
// Route Handling (Still Recommended)
// =============================================================================

/**
 * Schema discovery routes for /rpc/* GET requests.
 * Provides JSON-LD style API documentation with clickable links.
 */
export {
  RPCRouteHandler,
  createRouteHandler,
  STANDARD_COLLECTIONS,
  COLLECTION_OPERATIONS,
  type Link,
  type SchemaResponse,
  type NamespaceInfo,
  type MethodResponse,
  type ParamDoc,
  type NamespaceResponse,
  type MethodSummary,
  type CollectionsResponse,
  type CollectionInfo,
} from './routes'

// Re-export RPC types from types/
export type {
  RPCRequest,
  RPCResponse,
  RPCError,
  RPCMeta,
  RPCBatchRequest,
  RPCBatchResponse,
  RPCClient,
  DORPCMethods,
  DOStats,
  DOSchema,
  MethodSchema,
  CollectionSchema,
  WebSocketState,
  HibernationOptions,
} from '../types/rpc'

export { RpcErrorCodes } from '../types/rpc'
