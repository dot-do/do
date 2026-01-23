/**
 * CapnWeb RPC Module (Epic 2)
 *
 * Schema-free RPC with WebSocket hibernation providing:
 * - 95% cost savings through efficient connection handling
 * - Promise pipelining for batched requests
 * - Automatic reconnection and retry
 * - HTTP fallback for environments without WebSocket
 *
 * @module rpc
 */

// Client SDK
export {
  DOClient as RPCClientImpl,
  buildRequest,
  type RPCClientOptions,
  type ConnectionState,
  type MethodParams,
  type MethodResult,
} from './client'

// Server implementation
export {
  RPCServer,
  createRPCServer,
  createMethodContext,
  type RPCServerOptions,
  type CORSOptions,
} from './server'

// Method registry
export {
  MethodRegistry,
  createLoggingMiddleware,
  createAuthMiddleware,
  createRateLimitMiddleware,
  createTimingMiddleware,
  registerSystemMethods,
  registerIdentityMethods,
  type MethodHandler,
  type MethodContext,
  type MethodOptions,
  type Middleware,
  type ParamSchema,
  type RegisteredMethod,
} from './methods'

// Protocol utilities
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

// Route handling
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
