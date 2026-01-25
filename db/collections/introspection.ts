/**
 * Introspection - Type introspection/self-reflection for Digital Objects
 *
 * @module collections/introspection
 *
 * @description
 * Provides schema reflection capabilities for Digital Objects, enabling:
 * - getSchema(): Returns all registered nouns with their schemas
 * - getVerbs(): Returns all registered verbs with grammatical forms
 * - getStats(): Returns counts for things, actions, relationships
 * - getRelationshipTypes(): Returns all relationship types in use
 * - Full introspection response for RPC serialization
 *
 * @example
 * ```typescript
 * const introspection = new Introspection(storage)
 *
 * // Get all schemas
 * const schemas = await introspection.getSchema()
 *
 * // Get verb forms
 * const verbs = await introspection.getVerbs()
 *
 * // Full introspection
 * const result = await introspection.introspect()
 * ```
 */

import type { Noun, Verb, Thing, ThingExpanded, ThingCompact, Action, ActionStatus, Relationship } from '../../types/collections'
import type { RelationOperator } from '../../types/cascade'
import type { DOStorage } from './base'

// =============================================================================
// Types
// =============================================================================

/**
 * Cascade annotation extracted from schema field
 */
export interface CascadeAnnotation {
  /** Field name in schema */
  field: string
  /** Cascade operator (-> ~> <- <~) */
  operator: RelationOperator
  /** Primary target type */
  targetType: string
  /** Fallback types if primary not found */
  fallbackTypes?: string[]
  /** Whether field is an array */
  isArray: boolean
  /** Whether field is optional */
  isOptional: boolean
  /** Relation direction */
  direction: 'forward' | 'backward'
  /** Relation method */
  method: 'insert' | 'search'
  /** Optional prompt text */
  prompt?: string
}

/**
 * Noun schema with cascade annotations
 */
export interface NounSchema {
  /** Noun ID */
  id: string
  /** Display name */
  name: string
  /** Singular form */
  singular?: string
  /** Plural form */
  plural?: string
  /** URL slug */
  slug: string
  /** Schema definition */
  schema: Record<string, unknown>
  /** Cascade field annotations */
  cascadeAnnotations: CascadeAnnotation[]
  /** Description */
  description?: string
}

/**
 * Verb with all grammatical forms
 */
export interface VerbForms {
  /** Verb ID */
  id: string
  /** Display name */
  name?: string
  /** Imperative form */
  action: string
  /** Short form */
  act: string
  /** Present participle */
  activity: string
  /** Past tense (event) */
  event: string
  /** Passive form */
  reverse: string
  /** Opposite action */
  inverse?: string
  /** Description */
  description?: string
}

/**
 * Collection statistics
 */
export interface CollectionStats {
  /** Number of registered nouns */
  nouns: number
  /** Number of registered verbs */
  verbs: number
  /** Thing statistics */
  things: {
    /** Total number of things */
    total: number
    /** Count by type */
    byType: Record<string, number>
  }
  /** Action statistics */
  actions: {
    /** Total number of actions */
    total: number
    /** Count by status */
    byStatus: Record<string, number>
  }
  /** Relationship statistics */
  relationships: {
    /** Total number of relationships */
    total: number
  }
}

/**
 * Cascade operator definition
 */
export interface CascadeOperatorDef {
  /** Operator symbol */
  operator: RelationOperator
  /** Operator name */
  name: string
  /** Description of what this operator does */
  description: string
  /** Relation direction */
  direction: 'forward' | 'backward'
  /** Relation method */
  method: 'insert' | 'search'
}

/**
 * Full introspection result
 */
export interface IntrospectionResult {
  /** API version */
  version: number
  /** Timestamp of introspection */
  timestamp: number
  /** All registered nouns with schemas */
  nouns: NounSchema[]
  /** All registered verbs with forms */
  verbs: VerbForms[]
  /** Collection statistics */
  stats: CollectionStats
  /** Unique relationship types in use */
  relationshipTypes: string[]
  /** Available cascade operators */
  cascadeOperators: CascadeOperatorDef[]
}

// =============================================================================
// Constants
// =============================================================================

/**
 * All available cascade operators with their definitions
 */
const CASCADE_OPERATORS: CascadeOperatorDef[] = [
  {
    operator: '->',
    name: 'ForwardInsert',
    description: 'Create entity, link TO it',
    direction: 'forward',
    method: 'insert',
  },
  {
    operator: '~>',
    name: 'ForwardSearch',
    description: 'Vector search existing, link TO it',
    direction: 'forward',
    method: 'search',
  },
  {
    operator: '<-',
    name: 'BackwardInsert',
    description: 'Create entity, link FROM it (it owns us)',
    direction: 'backward',
    method: 'insert',
  },
  {
    operator: '<~',
    name: 'BackwardSearch',
    description: 'Vector search existing, link FROM it',
    direction: 'backward',
    method: 'search',
  },
]

// =============================================================================
// Introspection Class
// =============================================================================

/**
 * Introspection class for schema reflection
 *
 * @description
 * Provides methods to introspect the DO's registered types, schemas,
 * and collection statistics. Useful for:
 * - API documentation generation
 * - Schema validation
 * - Dynamic UI generation
 * - RPC serialization
 *
 * @example
 * ```typescript
 * const introspection = new Introspection(storage)
 *
 * // Get schemas for all nouns
 * const schemas = await introspection.getSchema()
 *
 * // Get single noun schema
 * const customerSchema = await introspection.getNounSchema('customer')
 *
 * // Get all verbs with grammatical forms
 * const verbs = await introspection.getVerbs()
 *
 * // Get collection statistics
 * const stats = await introspection.getStats()
 *
 * // Full introspection for RPC
 * const result = await introspection.introspect()
 * ```
 */
export class Introspection {
  /**
   * DO storage interface
   */
  private readonly storage: DOStorage

  /**
   * Create a new Introspection instance
   *
   * @param storage - DO storage interface
   */
  constructor(storage: DOStorage) {
    this.storage = storage
  }

  // ===========================================================================
  // Schema Methods
  // ===========================================================================

  /**
   * Get all noun schemas or filter by name
   *
   * @param nounName - Optional noun name to filter by
   * @returns Array of noun schemas with cascade annotations
   *
   * @example
   * ```typescript
   * // Get all schemas
   * const all = await introspection.getSchema()
   *
   * // Get filtered by name
   * const customers = await introspection.getSchema('Customer')
   * ```
   */
  async getSchema(nounName?: string): Promise<NounSchema[]> {
    const nouns = await this.getAllNouns()
    const schemas: NounSchema[] = []

    for (const noun of nouns) {
      // Filter by name if provided
      if (nounName && noun.name !== nounName) {
        continue
      }

      const schema = noun.schema ?? {}
      const cascadeAnnotations = this.extractCascadeAnnotations(schema)

      schemas.push({
        id: noun.id,
        name: noun.name,
        singular: noun.singular,
        plural: noun.plural,
        slug: noun.slug,
        schema,
        cascadeAnnotations,
        description: noun.description,
      })
    }

    return schemas
  }

  /**
   * Get schema for a single noun by slug
   *
   * @param slug - Noun slug
   * @returns Noun schema or null if not found
   *
   * @example
   * ```typescript
   * const schema = await introspection.getNounSchema('customer')
   * if (schema) {
   *   console.log(schema.name, schema.schema)
   * }
   * ```
   */
  async getNounSchema(slug: string): Promise<NounSchema | null> {
    const nouns = await this.getAllNouns()

    for (const noun of nouns) {
      if (noun.slug === slug) {
        const schema = noun.schema ?? {}
        const cascadeAnnotations = this.extractCascadeAnnotations(schema)

        return {
          id: noun.id,
          name: noun.name,
          singular: noun.singular,
          plural: noun.plural,
          slug: noun.slug,
          schema,
          cascadeAnnotations,
          description: noun.description,
        }
      }
    }

    return null
  }

  // ===========================================================================
  // Verb Methods
  // ===========================================================================

  /**
   * Get all verbs or filter by action
   *
   * @param action - Optional action to filter by
   * @returns Array of verb forms
   *
   * @example
   * ```typescript
   * // Get all verbs
   * const all = await introspection.getVerbs()
   *
   * // Get specific verb
   * const createVerbs = await introspection.getVerbs('create')
   * ```
   */
  async getVerbs(action?: string): Promise<VerbForms[]> {
    const verbs = await this.getAllVerbs()
    const forms: VerbForms[] = []

    for (const verb of verbs) {
      // Filter by action if provided
      if (action && verb.action !== action) {
        continue
      }

      forms.push({
        id: verb.id,
        name: verb.name,
        action: verb.action,
        act: verb.act,
        activity: verb.activity,
        event: verb.event,
        reverse: verb.reverse,
        inverse: verb.inverse,
        description: verb.description,
      })
    }

    return forms
  }

  /**
   * Get a single verb by its action form
   *
   * @param action - Verb action form
   * @returns Verb forms or null if not found
   *
   * @example
   * ```typescript
   * const verb = await introspection.getVerbByAction('create')
   * console.log(verb?.event) // 'created'
   * ```
   */
  async getVerbByAction(action: string): Promise<VerbForms | null> {
    const verbs = await this.getAllVerbs()

    for (const verb of verbs) {
      if (verb.action === action) {
        return {
          id: verb.id,
          name: verb.name,
          action: verb.action,
          act: verb.act,
          activity: verb.activity,
          event: verb.event,
          reverse: verb.reverse,
          inverse: verb.inverse,
          description: verb.description,
        }
      }
    }

    return null
  }

  // ===========================================================================
  // Statistics Methods
  // ===========================================================================

  /**
   * Get collection statistics
   *
   * @returns Collection statistics including counts for nouns, verbs, things, actions, relationships
   *
   * @example
   * ```typescript
   * const stats = await introspection.getStats()
   * console.log(`Total things: ${stats.things.total}`)
   * console.log(`By type:`, stats.things.byType)
   * ```
   */
  async getStats(): Promise<CollectionStats> {
    const [nouns, verbs, things, actions, relationships] = await Promise.all([
      this.getAllNouns(),
      this.getAllVerbs(),
      this.getAllThings(),
      this.getAllActions(),
      this.getAllRelationships(),
    ])

    // Count things by type
    const thingsByType: Record<string, number> = {}
    for (const thing of things) {
      const type = this.getThingType(thing)
      thingsByType[type] = (thingsByType[type] ?? 0) + 1
    }

    // Count actions by status
    const actionsByStatus: Record<string, number> = {}
    for (const action of actions) {
      const status = action.status
      actionsByStatus[status] = (actionsByStatus[status] ?? 0) + 1
    }

    return {
      nouns: nouns.length,
      verbs: verbs.length,
      things: {
        total: things.length,
        byType: thingsByType,
      },
      actions: {
        total: actions.length,
        byStatus: actionsByStatus,
      },
      relationships: {
        total: relationships.length,
      },
    }
  }

  // ===========================================================================
  // Relationship Methods
  // ===========================================================================

  /**
   * Get all unique relationship types
   *
   * @returns Array of unique relationship type names
   *
   * @example
   * ```typescript
   * const types = await introspection.getRelationshipTypes()
   * // ['hasOrder', 'belongsTo', 'manages']
   * ```
   */
  async getRelationshipTypes(): Promise<string[]> {
    const relationships = await this.getAllRelationships()
    const types = new Set<string>()

    for (const rel of relationships) {
      types.add(rel.type)
    }

    return Array.from(types)
  }

  /**
   * Get relationship types with usage counts
   *
   * @returns Array of types with counts, sorted by count descending
   *
   * @example
   * ```typescript
   * const types = await introspection.getRelationshipTypesWithCounts()
   * // [{ type: 'hasChild', count: 3 }, { type: 'belongsTo', count: 1 }]
   * ```
   */
  async getRelationshipTypesWithCounts(): Promise<Array<{ type: string; count: number }>> {
    const relationships = await this.getAllRelationships()
    const typeCounts: Record<string, number> = {}

    for (const rel of relationships) {
      typeCounts[rel.type] = (typeCounts[rel.type] ?? 0) + 1
    }

    // Convert to array and sort by count descending
    const result = Object.entries(typeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)

    return result
  }

  // ===========================================================================
  // Cascade Operator Methods
  // ===========================================================================

  /**
   * Get all available cascade operators with descriptions
   *
   * @returns Array of cascade operator definitions
   *
   * @example
   * ```typescript
   * const operators = await introspection.getCascadeOperators()
   * // [{ operator: '->', name: 'ForwardInsert', ... }, ...]
   * ```
   */
  async getCascadeOperators(): Promise<CascadeOperatorDef[]> {
    return CASCADE_OPERATORS
  }

  /**
   * Get cascade operators currently used in schemas
   *
   * @returns Array of cascade operator definitions that are in use
   *
   * @example
   * ```typescript
   * const used = await introspection.getUsedCascadeOperators()
   * // Only operators found in current noun schemas
   * ```
   */
  async getUsedCascadeOperators(): Promise<CascadeOperatorDef[]> {
    const nouns = await this.getAllNouns()
    const usedOperators = new Set<string>()

    for (const noun of nouns) {
      if (!noun.schema) continue

      const annotations = this.extractCascadeAnnotations(noun.schema)
      for (const ann of annotations) {
        usedOperators.add(ann.operator)
      }
    }

    return CASCADE_OPERATORS.filter(op => usedOperators.has(op.operator))
  }

  // ===========================================================================
  // Full Introspection
  // ===========================================================================

  /**
   * Get full introspection result
   *
   * @returns Complete introspection result with all schemas, verbs, stats, etc.
   *
   * @description
   * Returns a JSON-serializable object containing all introspection data,
   * suitable for RPC transport.
   *
   * @example
   * ```typescript
   * const result = await introspection.introspect()
   * // Send over RPC
   * const json = JSON.stringify(result)
   * ```
   */
  async introspect(): Promise<IntrospectionResult> {
    const [nouns, verbs, stats, relationshipTypes, cascadeOperators] = await Promise.all([
      this.getSchema(),
      this.getVerbs(),
      this.getStats(),
      this.getRelationshipTypes(),
      this.getCascadeOperators(),
    ])

    return {
      version: 1,
      timestamp: Date.now(),
      nouns,
      verbs,
      stats,
      relationshipTypes,
      cascadeOperators,
    }
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Get all nouns from storage
   */
  private async getAllNouns(): Promise<Noun[]> {
    const items = await this.storage.list<Noun>({ prefix: 'nouns:' })
    return Array.from(items.values())
  }

  /**
   * Get all verbs from storage
   */
  private async getAllVerbs(): Promise<Verb[]> {
    const items = await this.storage.list<Verb>({ prefix: 'verbs:' })
    return Array.from(items.values())
  }

  /**
   * Get all things from storage
   */
  private async getAllThings(): Promise<Thing[]> {
    const items = await this.storage.list<Thing>({ prefix: 'things:' })
    return Array.from(items.values())
  }

  /**
   * Get all actions from storage
   */
  private async getAllActions(): Promise<Action[]> {
    const items = await this.storage.list<Action>({ prefix: 'actions:' })
    return Array.from(items.values())
  }

  /**
   * Get all relationships from storage
   */
  private async getAllRelationships(): Promise<Relationship[]> {
    const items = await this.storage.list<Relationship>({ prefix: 'relationships:' })
    return Array.from(items.values())
  }

  /**
   * Get the type of a thing (works with both expanded and compact formats)
   */
  private getThingType(thing: Thing): string {
    if ('$type' in thing) {
      return (thing as ThingExpanded).$type
    }
    return (thing as ThingCompact).type
  }

  /**
   * Extract cascade annotations from a schema
   *
   * @param schema - Schema object with field definitions
   * @returns Array of cascade annotations
   */
  private extractCascadeAnnotations(schema: Record<string, unknown>): CascadeAnnotation[] {
    const annotations: CascadeAnnotation[] = []

    for (const [field, value] of Object.entries(schema)) {
      // Handle string or array values
      let fieldStr: string
      let isArray = false

      if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') {
        fieldStr = value[0]
        isArray = true
      } else if (typeof value === 'string') {
        fieldStr = value
      } else {
        continue
      }

      const annotation = this.parseCascadeField(field, fieldStr, isArray)
      if (annotation) {
        annotations.push(annotation)
      }
    }

    return annotations
  }

  /**
   * Parse a cascade field string into an annotation
   *
   * Supported formats:
   * - '->TargetType'                    Basic forward insert
   * - '~>TargetType'                    Forward search
   * - '<-TargetType'                    Backward insert
   * - '<~TargetType'                    Backward search
   * - '~>TargetType?'                   Optional
   * - '->TargetType[]'                  Array (when passed as string)
   * - 'Prompt text? ->TargetType'       With prompt
   * - '<~TargetType|Fallback1|Fallback2' With fallbacks
   *
   * @param field - Field name
   * @param value - Field value string
   * @param isArray - Whether the field was defined as an array
   * @returns Cascade annotation or null if not a cascade field
   */
  private parseCascadeField(field: string, value: string, isArray: boolean): CascadeAnnotation | null {
    // Look for cascade operators anywhere in the string
    const operatorMatch = value.match(/(->|~>|<-|<~)/)
    if (!operatorMatch) {
      return null
    }

    const operator = operatorMatch[1] as RelationOperator
    const operatorIndex = operatorMatch.index!

    // Extract prompt (everything before the operator)
    const beforeOperator = value.substring(0, operatorIndex).trim()
    const prompt = beforeOperator.length > 0 ? beforeOperator : undefined

    // Extract everything after the operator
    let afterOperator = value.substring(operatorIndex + 2).trim()

    // Check for array marker in the type itself
    if (afterOperator.endsWith('[]')) {
      isArray = true
      afterOperator = afterOperator.slice(0, -2)
    }

    // Check for optional marker
    let isOptional = false
    if (afterOperator.endsWith('?')) {
      isOptional = true
      afterOperator = afterOperator.slice(0, -1)
    }

    // Parse target types (primary|fallback1|fallback2)
    const targets = afterOperator.split('|').map(t => t.trim()).filter(t => t.length > 0)
    if (targets.length === 0) {
      return null
    }

    const targetType = targets[0]
    const fallbackTypes = targets.length > 1 ? targets.slice(1) : undefined

    // Determine direction and method from operator
    const { direction, method } = this.parseOperator(operator)

    return {
      field,
      operator,
      targetType,
      fallbackTypes,
      isArray,
      isOptional,
      direction,
      method,
      prompt,
    }
  }

  /**
   * Parse cascade operator into direction and method
   */
  private parseOperator(op: RelationOperator): { direction: 'forward' | 'backward'; method: 'insert' | 'search' } {
    switch (op) {
      case '->':
        return { direction: 'forward', method: 'insert' }
      case '~>':
        return { direction: 'forward', method: 'search' }
      case '<-':
        return { direction: 'backward', method: 'insert' }
      case '<~':
        return { direction: 'backward', method: 'search' }
    }
  }
}

// =============================================================================
// Standalone Functions
// =============================================================================

/**
 * Get all noun schemas (standalone function)
 *
 * @param storage - DO storage interface
 * @returns Array of noun schemas
 *
 * @example
 * ```typescript
 * const schemas = await getSchema(storage)
 * ```
 */
export async function getSchema(storage: DOStorage): Promise<NounSchema[]> {
  const introspection = new Introspection(storage)
  return introspection.getSchema()
}

/**
 * Get all verbs (standalone function)
 *
 * @param storage - DO storage interface
 * @returns Array of verb forms
 *
 * @example
 * ```typescript
 * const verbs = await getVerbs(storage)
 * ```
 */
export async function getVerbs(storage: DOStorage): Promise<VerbForms[]> {
  const introspection = new Introspection(storage)
  return introspection.getVerbs()
}

/**
 * Get collection statistics (standalone function)
 *
 * @param storage - DO storage interface
 * @returns Collection statistics
 *
 * @example
 * ```typescript
 * const stats = await getStats(storage)
 * ```
 */
export async function getStats(storage: DOStorage): Promise<CollectionStats> {
  const introspection = new Introspection(storage)
  return introspection.getStats()
}

/**
 * Get relationship types (standalone function)
 *
 * @param storage - DO storage interface
 * @returns Array of unique relationship type names
 *
 * @example
 * ```typescript
 * const types = await getRelationshipTypes(storage)
 * ```
 */
export async function getRelationshipTypes(storage: DOStorage): Promise<string[]> {
  const introspection = new Introspection(storage)
  return introspection.getRelationshipTypes()
}

export default Introspection
