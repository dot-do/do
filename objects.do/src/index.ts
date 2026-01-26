/**
 * objects.do - Universal DO Runtime
 *
 * Every DO is data. No deployment needed.
 *
 * This package provides:
 * - Types for DO definitions
 * - Zod schemas for validation
 * - Context factory for $ object creation
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
  // Core definition types
  DODefinition,
  APIDefinition,
  APIMethodOrNamespace,
  APIMethodDefinition,
  AgentDefinition,
  AgentVoiceConfig,
  ModelSelector,

  // Context types
  DOContext,
  AIContext,
  DBContext,
  DBCollection,
  FSXContext,
  GitXContext,
  BashXContext,
  LogContext,
  StripeContext,
  TaggedTemplate,

  // Execution types
  ExecutionResult,
  ExecutionError,
  LogEntry,

  // RPC types
  RPCRequest,
  RPCResponse,
  RPCError,

  // Registry types
  RegistryEntry,
  AccessControl,
  RegistryMetrics,

  // Supporting types
  ListOptions,
  GitCommit,
  GitStatus,
  BashResult,
  StripeCustomer,
  StripeSubscription,
  StripePaymentIntent,

  // Environment types
  Env,
  R2Bucket,
  R2Object,
  R2ListOptions,
  R2Objects,
  DurableObjectNamespace,
  DurableObjectId,
  DurableObjectStub,
  Fetcher,
} from './types'

// =============================================================================
// Schema Exports
// =============================================================================

export {
  // Main schemas
  DODefinitionSchema,
  DODefinitionStrictSchema,
  APIDefinitionSchema,
  APIMethodDefinitionSchema,
  AgentDefinitionSchema,
  AgentVoiceConfigSchema,

  // Pattern schemas
  EventPatternSchema,
  SchedulePatternSchema,
  DOIdentifierSchema,
  DOTypeSchema,
  ModelSelectorSchema,

  // RPC schemas
  RPCRequestSchema,
  RPCResponseSchema,
  RPCErrorSchema,

  // Registry schemas
  RegistryEntrySchema,
  AccessControlSchema,
  RegistryMetricsSchema,

  // Validation functions
  validateDODefinition,
  validateDODefinitionStrict,
  safeParseDODefinition,
  safeParseDODefinitionStrict,
  validateRPCRequest,
  safeParseRPCRequest,
  validateRegistryEntry,

  // RPC helpers
  RPC_ERROR_CODES,
  createRPCError,
  createRPCSuccess,
} from './schema'

// Re-export schema-inferred types
export type {
  DODefinition as SchemaInferredDODefinition,
  DODefinitionStrict,
  RPCRequest as SchemaInferredRPCRequest,
  RPCError as SchemaInferredRPCError,
  RPCResponse as SchemaInferredRPCResponse,
  RegistryEntry as SchemaInferredRegistryEntry,
} from './schema'

// =============================================================================
// Context Exports
// =============================================================================

export {
  createContext,
  extractFunctionParams,
  resolveMethodCode,
  flattenAPIMethods,
} from './context'

export type {
  CreateContextOptions,
  DurableObjectState,
  DurableObjectStorage,
  StorageListOptions,
} from './context'

// =============================================================================
// GenericDO Runtime Export
// =============================================================================

export { GenericDO } from './GenericDO'

// =============================================================================
// Executor Exports
// =============================================================================

export { executeFunction, parseFunction, validateFunctionCode, extractParams } from './executor'
export type { ExecuteOptions } from './executor'
