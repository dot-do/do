/**
 * Cascade Types - Relation Operators for Post-Generation Linking
 *
 * Every DO natively supports four relation operators for post-generation linking:
 *
 * | Operator | Type             | Action                                    |
 * |----------|------------------|-------------------------------------------|
 * | `->`     | Forward Insert   | Create entity, link TO it                 |
 * | `~>`     | Forward Search   | Vector search existing, link TO it        |
 * | `<-`     | Backward Insert  | Create entity, link FROM it (it owns us)  |
 * | `<~`     | Backward Search  | Vector search existing, link FROM it      |
 *
 * Example Schema:
 * ```typescript
 * const CustomerSchema = {
 *   $type: 'Customer',
 *   company: '~>Company',                    // Search for matching Company
 *   industry: '<~Industry|Sector',           // Search Industry, fallback to Sector
 *   contacts: ['->Contact'],                 // Create Contact entities
 *   owner: '<-SalesRep',                     // SalesRep owns this Customer
 * }
 *
 * const StartupSchema = {
 *   $type: 'Startup',
 *   idea: 'What is the idea? <-Idea',        // Idea entity owns this Startup
 *   founders: ['Who are founders? ->Founder'],
 *   customer: '~>IdealCustomerProfile',
 * }
 * ```
 *
 * These are DO-level primitives. Applications define their own cascade stages
 * and generation pipelines using these operators.
 */

// Relation operators are DO-level primitives - no external dependencies needed

// =============================================================================
// Relation Operators
// =============================================================================

/**
 * Relation operator type
 *
 * These define how entities are linked after AI generation:
 * - Forward (`->`, `~>`): Current entity links TO target
 * - Backward (`<-`, `<~`): Target entity links FROM current (target owns current)
 * - Insert (`->`, `<-`): Create new entity
 * - Search (`~>`, `<~`): Vector search existing entities
 */
export type RelationOperator = '->' | '~>' | '<-' | '<~'

/**
 * Relation direction
 */
export type RelationDirection = 'Forward' | 'Backward'

/**
 * Relation method
 */
export type RelationMethod = 'Insert' | 'Search'

/**
 * Parse relation operator into direction and method
 */
export function parseRelationOperator(op: RelationOperator): {
  direction: RelationDirection
  method: RelationMethod
} {
  switch (op) {
    case '->': return { direction: 'Forward', method: 'Insert' }
    case '~>': return { direction: 'Forward', method: 'Search' }
    case '<-': return { direction: 'Backward', method: 'Insert' }
    case '<~': return { direction: 'Backward', method: 'Search' }
  }
}

// =============================================================================
// Relation Field Definition
// =============================================================================

/**
 * Relation field definition in schema
 *
 * Format: "prompt text <operator>TargetType|Fallback1|Fallback2"
 *
 * Examples:
 * - 'Who are they? <~Occupation|Role|JobType'  - Search with fallbacks
 * - '->Founder'                                 - Insert new Founder
 * - '<-Idea'                                    - Backward link from Idea
 * - '~>Company?'                                - Optional search
 * - '->Contact[]'                               - Array of inserts
 */
export interface RelationFieldDefinition {
  /** The prompt/description for AI generation */
  prompt?: string
  /** Relation operator */
  operator: RelationOperator
  /** Target type(s) - first is primary, rest are fallbacks */
  targets: string[]
  /** Is this an array relation? */
  isArray: boolean
  /** Is this optional? */
  isOptional: boolean
}

/**
 * Parse a relation field string
 *
 * @example
 * parseRelationField('Who are they? <~Occupation|Role')
 * // { prompt: 'Who are they?', operator: '<~', targets: ['Occupation', 'Role'], isArray: false, isOptional: false }
 *
 * parseRelationField('->Founder[]')
 * // { operator: '->', targets: ['Founder'], isArray: true, isOptional: false }
 */
export function parseRelationField(field: string): RelationFieldDefinition | null {
  // Match: optional prompt, operator, target types, optional array marker, optional marker
  const match = field.match(/^(.*?)?\s*(->|~>|<-|<~)([A-Z][a-zA-Z0-9]*(?:\|[A-Z][a-zA-Z0-9]*)*)(\[\])?(\?)?$/)
  if (!match) return null

  const [, prompt, operator, targetStr, arrayMarker, optionalMarker] = match
  const targets = targetStr.split('|')

  return {
    prompt: prompt?.trim() || undefined,
    operator: operator as RelationOperator,
    targets,
    isArray: !!arrayMarker,
    isOptional: !!optionalMarker,
  }
}

/**
 * Check if a field value is a relation field
 */
export function isRelationField(value: unknown): boolean {
  if (typeof value === 'string') {
    return /->|~>|<-|<~/.test(value)
  }
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') {
    return /->|~>|<-|<~/.test(value[0])
  }
  return false
}

// =============================================================================
// Stored Relation
// =============================================================================

/**
 * Stored relation (in _rels table)
 *
 * All relations are stored in a unified table for efficient querying
 */
export interface StoredRelation {
  /** Relation ID */
  id: string
  /** Relation type */
  relType: 'Forward' | 'Backward' | 'FuzzyForward' | 'FuzzyBackward'
  /** Relation name (field name in schema) */
  relName: string
  /** Source collection/type */
  fromCollection: string
  /** Source entity ID */
  fromId: string
  /** Target collection/type */
  toCollection: string
  /** Target entity ID */
  toId: string
  /** Human-readable label (usually target's title) */
  label?: string
  /** Source shard (for cross-shard relations) */
  fromShard?: string
  /** Target shard (for cross-shard relations) */
  toShard?: string
  /** Ordinal for ordered relations */
  ordinal: number
  /** Additional metadata */
  metadata?: Record<string, unknown>
  /** Timestamps */
  createdAt: number
  updatedAt: number
}

// =============================================================================
// Relation Manager Interface
// =============================================================================

/**
 * Relation manager interface (DO-level)
 *
 * Every DO has a built-in relation manager for handling cascade relations
 */
export interface RelationManager {
  /** Create a relation */
  create(rel: Omit<StoredRelation, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredRelation>

  /** Create bidirectional relation (forward + inverse) */
  createBidirectional(
    rel: Omit<StoredRelation, 'id' | 'createdAt' | 'updatedAt'>,
    inverseRelName: string
  ): Promise<[StoredRelation, StoredRelation]>

  /** Get outgoing relations from an entity */
  getOutgoing(collection: string, docId: string, relName?: string): Promise<StoredRelation[]>

  /** Get incoming relations to an entity */
  getIncoming(collection: string, docId: string, relName?: string): Promise<StoredRelation[]>

  /** Get all relations for an entity (both directions) */
  getAll(collection: string, docId: string): Promise<StoredRelation[]>

  /** Delete a relation */
  delete(relId: string): Promise<boolean>

  /** Delete all relations for an entity */
  deleteAll(collection: string, docId: string): Promise<number>

  /** Check if relation exists */
  exists(fromCollection: string, fromId: string, toCollection: string, toId: string): Promise<boolean>

  /** Count relations */
  count(collection: string, docId: string, direction?: 'Outgoing' | 'Incoming'): Promise<number>

  /** Update relation metadata */
  updateMetadata(relId: string, metadata: Record<string, unknown>): Promise<StoredRelation>

  /** Update ordinal (for reordering) */
  updateOrdinal(relId: string, ordinal: number): Promise<StoredRelation>
}

// =============================================================================
// Cascade Processor Interface
// =============================================================================

/**
 * Cascade post-processor interface
 *
 * After AI generation, the cascade processor handles relation linking
 */
export interface CascadeProcessor {
  /**
   * Process cascade relations for a generated entity
   *
   * For each field with a relation operator:
   * - `->`: Create new entity, link TO it
   * - `~>`: Vector search, link TO best match
   * - `<-`: Create new entity, link FROM it
   * - `<~`: Vector search, link FROM best match
   */
  process(
    sourceType: string,
    sourceId: string,
    generatedData: Record<string, unknown>,
    schema: Record<string, string | string[]>
  ): Promise<CascadeResult>

  /**
   * Process a single relation field
   */
  processField(
    sourceType: string,
    sourceId: string,
    fieldName: string,
    fieldValue: unknown,
    fieldDef: RelationFieldDefinition
  ): Promise<CascadeFieldResult>
}

/**
 * Result of cascade processing
 */
export interface CascadeResult {
  /** Entities created during cascade */
  created: Array<{ type: string; id: string; data?: unknown }>
  /** Relations created */
  relations: StoredRelation[]
  /** Errors encountered */
  errors: CascadeError[]
}

/**
 * Result of processing a single field
 */
export interface CascadeFieldResult {
  /** Entity created (if insert) */
  created?: { type: string; id: string; data?: unknown }
  /** Entity matched (if search) */
  matched?: { type: string; id: string; score?: number }
  /** Relation created */
  relation?: StoredRelation
  /** Error if failed */
  error?: CascadeError
}

/**
 * Cascade error
 */
export interface CascadeError {
  field: string
  message: string
  targetType?: string
  code?: 'NotFound' | 'Ambiguous' | 'Invalid' | 'Failed'
}

// =============================================================================
// Schema Type Definitions
// =============================================================================

/**
 * Entity schema with relation fields
 *
 * Fields can be:
 * - Primitive: 'string', 'number', 'boolean', etc.
 * - Prompt: 'What is the name?'
 * - Relation: '->TargetType' or 'prompt ~>TargetType|Fallback'
 * - Array relation: ['->TargetType']
 */
export type EntitySchema = Record<string, SchemaField>

export type SchemaField =
  | string                    // Primitive type, prompt, or relation
  | [string]                  // Array relation
  | SchemaFieldDefinition     // Full definition

export interface SchemaFieldDefinition {
  /** Field type or prompt */
  type: string
  /** Description */
  description?: string
  /** Is required */
  required?: boolean
  /** Default value */
  default?: unknown
  /** Relation definition (if relation field) */
  relation?: RelationFieldDefinition
}

// =============================================================================
// Cascade Configuration
// =============================================================================

/**
 * Cascade configuration (application-defined)
 *
 * Applications define their own cascade stages and pipelines.
 * This is a generic configuration interface.
 */
export interface CascadeConfig {
  /** Maximum depth for recursive cascades */
  maxDepth?: number
  /** Concurrency for parallel processing */
  concurrency?: number
  /** Retry policy */
  retryPolicy?: {
    maxAttempts: number
    backoff: 'Linear' | 'Exponential'
    initialDelay?: number
  }
  /** Rate limiting */
  rateLimit?: {
    requestsPerMinute: number
    tokensPerMinute?: number
  }
  /** Vector search options */
  vectorSearch?: {
    topK?: number
    scoreThreshold?: number
  }
  /** Checkpoint during long cascades */
  checkpoint?: boolean
  /** Checkpoint interval (number of entities) */
  checkpointInterval?: number
}

// =============================================================================
// Cascade Events
// =============================================================================

/**
 * Cascade event types for observability
 */
export type CascadeEvent =
  | { type: 'Cascade.Entity.created'; payload: { type: string; id: string } }
  | { type: 'Cascade.Entity.matched'; payload: { type: string; id: string; score: number } }
  | { type: 'Cascade.Relation.created'; payload: { relId: string; from: string; to: string } }
  | { type: 'Cascade.Error.occurred'; payload: CascadeError }
  | { type: 'Cascade.Processing.started'; payload: { sourceType: string; sourceId: string } }
  | { type: 'Cascade.Processing.completed'; payload: { sourceType: string; sourceId: string; created: number; relations: number } }
