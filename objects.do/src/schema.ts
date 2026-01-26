/**
 * objects.do Schema - Zod validation schemas for DO definitions
 *
 * These schemas validate DODefinition structures at runtime,
 * ensuring that loaded definitions are well-formed before execution.
 */

import { z } from 'zod'

// =============================================================================
// Model Selection Schema
// =============================================================================

/**
 * Model characteristic enum
 */
export const ModelCharacteristicSchema = z.enum([
  'best',
  'fast',
  'cost',
  'reasoning',
  'vision',
  'code',
  'long',
])

/**
 * Model selector - single characteristic or comma-separated combo
 */
export const ModelSelectorSchema = z.union([
  ModelCharacteristicSchema,
  z.string().regex(/^(best|fast|cost|reasoning|vision|code|long),(best|fast|cost|reasoning|vision|code|long)$/),
])

// =============================================================================
// Agent Definition Schema
// =============================================================================

/**
 * Voice provider enum
 */
export const VoiceProviderSchema = z.enum([
  'elevenlabs',
  'playht',
  'azure',
  'google',
  'openai',
  'deepgram',
  'vapi',
  'livekit',
  'retell',
  'bland',
])

/**
 * Agent voice configuration schema
 */
export const AgentVoiceConfigSchema = z.object({
  provider: VoiceProviderSchema,
  voiceId: z.string().min(1),
  voiceName: z.string().optional(),
  speed: z.number().min(0.5).max(2.0).optional(),
  stability: z.number().min(0).max(1).optional(),
})

/**
 * Agent definition schema
 */
export const AgentDefinitionSchema = z.object({
  model: ModelSelectorSchema.optional(),
  systemPrompt: z.string().min(1),
  tools: z.array(z.string()).optional(),
  voice: AgentVoiceConfigSchema.optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  maxIterations: z.number().positive().optional(),
})

// =============================================================================
// API Definition Schema
// =============================================================================

/**
 * API method definition schema (detailed form)
 */
export const APIMethodDefinitionSchema = z.object({
  code: z.string().min(1),
  params: z.array(z.string()).optional(),
  returns: z.string().optional(),
  description: z.string().optional(),
  auth: z.boolean().optional(),
  rateLimit: z.number().positive().optional(),
  timeout: z.number().positive().optional(),
})

/**
 * API method schema - string or detailed definition
 */
export const APIMethodSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().min(1),           // Stringified function
    APIMethodDefinitionSchema,   // Detailed definition
    z.record(APIMethodOrNamespaceSchema), // Nested namespace
  ])
)

/**
 * API method or namespace schema (recursive)
 */
export const APIMethodOrNamespaceSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().min(1),           // Stringified function
    APIMethodDefinitionSchema,   // Detailed definition
    z.record(APIMethodOrNamespaceSchema), // Nested namespace
  ])
)

/**
 * API definition schema
 */
export const APIDefinitionSchema = z.record(APIMethodOrNamespaceSchema)

// =============================================================================
// Site and App Schema
// =============================================================================

/**
 * Site pages schema - string (root only) or record of paths
 */
export const SiteDefinitionSchema = z.union([
  z.string().min(1),
  z.record(z.string().min(1)),
])

/**
 * App pages schema - record of paths to MDX content
 */
export const AppDefinitionSchema = z.record(z.string().min(1))

// =============================================================================
// Events and Schedules Schema
// =============================================================================

/**
 * Events schema - pattern -> handler
 *
 * Pattern validation:
 * - Must contain at least one dot (Noun.event or Namespace.Noun.event)
 * - Examples: 'Customer.created', 'stripe.payment_failed', 'Order.Item.added'
 */
export const EventPatternSchema = z.string().regex(
  /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9_]*)+$/,
  'Event pattern must be Noun.event or Namespace.Noun.event format'
)

export const EventsDefinitionSchema = z.record(
  EventPatternSchema,
  z.string().min(1)
)

/**
 * Schedule pattern schema
 *
 * Valid patterns:
 * - every.second, every.minute, every.hour, every.day, every.week, every.month
 * - every.5.minutes, every.30.seconds, every.2.hours
 * - every.Monday, every.Tuesday, ..., every.Sunday
 * - every.weekday, every.weekend
 * - every.day.at9am, every.Monday.at9am, every.weekday.atmidnight
 * - every.month.on1st, every.month.on15th, every.month.onLast
 */
export const SchedulePatternSchema = z.string().regex(
  /^every\.(\d+\.)?(second|minute|hour|day|week|month|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|weekday|weekend)(\.at\d{1,2}(am|pm)|\.atmidnight|\.atnoon|\.on\d+(st|nd|rd|th)|\.onLast)?$/,
  'Invalid schedule pattern. Examples: every.hour, every.5.minutes, every.Monday.at9am'
)

export const SchedulesDefinitionSchema = z.record(
  SchedulePatternSchema,
  z.string().min(1)
)

// =============================================================================
// Main DODefinition Schema
// =============================================================================

/**
 * DO identifier schema
 *
 * Valid formats:
 * - Domain: 'crm.acme.com', 'startup.do'
 * - Domain with path: 'startup.do/tenant-123', 'api.example.com/v1'
 */
export const DOIdentifierSchema = z.string().regex(
  /^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*)+(\/.+)?$/,
  'Invalid DO identifier. Must be domain or domain/path format'
)

/**
 * DO type schema
 *
 * Valid formats:
 * - Short name: 'SaaS', 'Startup', 'Agent'
 * - Full URL: 'https://schema.org.ai/Agent'
 */
export const DOTypeSchema = z.string().min(1)

/**
 * DO context schema - parent DO URL
 */
export const DOContextSchema = z.string().url().optional()

/**
 * Version schema - semver or git commit
 */
export const VersionSchema = z.string().optional()

/**
 * Config schema - arbitrary key-value pairs
 */
export const ConfigSchema = z.record(z.unknown()).optional()

/**
 * Complete DODefinition schema
 */
export const DODefinitionSchema = z.object({
  // Identity
  $id: DOIdentifierSchema,
  $type: DOTypeSchema.optional(),
  $context: DOContextSchema,
  $version: VersionSchema,

  // API
  api: APIDefinitionSchema.optional(),

  // Events
  events: z.record(z.string()).optional(), // Relaxed for flexibility

  // Schedules
  schedules: z.record(z.string()).optional(), // Relaxed for flexibility

  // Site
  site: SiteDefinitionSchema.optional(),

  // App
  app: AppDefinitionSchema.optional(),

  // Agent
  agent: AgentDefinitionSchema.optional(),

  // Config
  config: ConfigSchema,
})

/**
 * Strict DODefinition schema - with pattern validation
 */
export const DODefinitionStrictSchema = z.object({
  // Identity
  $id: DOIdentifierSchema,
  $type: DOTypeSchema.optional(),
  $context: DOContextSchema,
  $version: VersionSchema,

  // API
  api: APIDefinitionSchema.optional(),

  // Events (with pattern validation)
  events: EventsDefinitionSchema.optional(),

  // Schedules (with pattern validation)
  schedules: SchedulesDefinitionSchema.optional(),

  // Site
  site: SiteDefinitionSchema.optional(),

  // App
  app: AppDefinitionSchema.optional(),

  // Agent
  agent: AgentDefinitionSchema.optional(),

  // Config
  config: ConfigSchema,
})

// =============================================================================
// RPC Schemas
// =============================================================================

/**
 * RPC request schema
 */
export const RPCRequestSchema = z.object({
  method: z.string().min(1),
  params: z.array(z.unknown()).optional(),
  id: z.union([z.string(), z.number()]).optional(),
})

/**
 * RPC error schema
 */
export const RPCErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
})

/**
 * RPC response schema
 */
export const RPCResponseSchema = z.object({
  result: z.unknown().optional(),
  error: RPCErrorSchema.optional(),
  id: z.union([z.string(), z.number()]).optional(),
})

// =============================================================================
// Registry Schemas
// =============================================================================

/**
 * Access control schema
 */
export const AccessControlSchema = z.object({
  public: z.boolean().optional(),
  readers: z.array(z.string()).optional(),
  writers: z.array(z.string()).optional(),
  admins: z.array(z.string()).optional(),
})

/**
 * Registry metrics schema
 */
export const RegistryMetricsSchema = z.object({
  invocations: z.number().nonnegative(),
  lastInvokedAt: z.number().optional(),
  totalExecutionTime: z.number().nonnegative(),
  errors: z.number().nonnegative(),
})

/**
 * Registry entry schema
 */
export const RegistryEntrySchema = z.object({
  definition: DODefinitionSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
  owner: z.string().optional(),
  acl: AccessControlSchema.optional(),
  metrics: RegistryMetricsSchema.optional(),
})

// =============================================================================
// Type Exports (inferred from schemas)
// =============================================================================

export type ModelCharacteristic = z.infer<typeof ModelCharacteristicSchema>
export type ModelSelector = z.infer<typeof ModelSelectorSchema>
export type VoiceProvider = z.infer<typeof VoiceProviderSchema>
export type AgentVoiceConfig = z.infer<typeof AgentVoiceConfigSchema>
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>
export type APIMethodDefinition = z.infer<typeof APIMethodDefinitionSchema>
export type DODefinition = z.infer<typeof DODefinitionSchema>
export type DODefinitionStrict = z.infer<typeof DODefinitionStrictSchema>
export type RPCRequest = z.infer<typeof RPCRequestSchema>
export type RPCError = z.infer<typeof RPCErrorSchema>
export type RPCResponse = z.infer<typeof RPCResponseSchema>
export type AccessControl = z.infer<typeof AccessControlSchema>
export type RegistryMetrics = z.infer<typeof RegistryMetricsSchema>
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a DO definition (relaxed)
 *
 * @param data - The data to validate
 * @returns Parsed DODefinition or throws ZodError
 */
export function validateDODefinition(data: unknown): DODefinition {
  return DODefinitionSchema.parse(data)
}

/**
 * Validate a DO definition (strict - with pattern validation)
 *
 * @param data - The data to validate
 * @returns Parsed DODefinition or throws ZodError
 */
export function validateDODefinitionStrict(data: unknown): DODefinitionStrict {
  return DODefinitionStrictSchema.parse(data)
}

/**
 * Safe parse a DO definition (relaxed)
 *
 * @param data - The data to validate
 * @returns SafeParseResult with success/error
 */
export function safeParseDODefinition(data: unknown) {
  return DODefinitionSchema.safeParse(data)
}

/**
 * Safe parse a DO definition (strict)
 *
 * @param data - The data to validate
 * @returns SafeParseResult with success/error
 */
export function safeParseDODefinitionStrict(data: unknown) {
  return DODefinitionStrictSchema.safeParse(data)
}

/**
 * Validate an RPC request
 *
 * @param data - The data to validate
 * @returns Parsed RPCRequest or throws ZodError
 */
export function validateRPCRequest(data: unknown): RPCRequest {
  return RPCRequestSchema.parse(data)
}

/**
 * Safe parse an RPC request
 *
 * @param data - The data to validate
 * @returns SafeParseResult with success/error
 */
export function safeParseRPCRequest(data: unknown) {
  return RPCRequestSchema.safeParse(data)
}

/**
 * Validate a registry entry
 *
 * @param data - The data to validate
 * @returns Parsed RegistryEntry or throws ZodError
 */
export function validateRegistryEntry(data: unknown): RegistryEntry {
  return RegistryEntrySchema.parse(data)
}

// =============================================================================
// Error Codes
// =============================================================================

/**
 * Standard RPC error codes (JSON-RPC 2.0 compatible)
 */
export const RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // Custom error codes (application-specific, >= -32000)
  DO_NOT_FOUND: -32000,
  UNAUTHORIZED: -32001,
  RATE_LIMITED: -32002,
  EXECUTION_ERROR: -32003,
  TIMEOUT: -32004,
  VALIDATION_ERROR: -32005,
} as const

export type RPCErrorCode = (typeof RPC_ERROR_CODES)[keyof typeof RPC_ERROR_CODES]

/**
 * Create a standard RPC error response
 */
export function createRPCError(
  code: RPCErrorCode,
  message: string,
  data?: unknown,
  id?: string | number
): RPCResponse {
  return {
    error: { code, message, data },
    id,
  }
}

/**
 * Create a standard RPC success response
 */
export function createRPCSuccess<T>(result: T, id?: string | number): RPCResponse {
  return {
    result,
    id,
  }
}
