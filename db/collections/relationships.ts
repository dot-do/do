/**
 * Relationships Collection - Graph-style entity linking for Digital Objects
 *
 * @module collections/relationships
 *
 * @description
 * Manages graph-style relationships between Things within a Digital Object.
 * Integrates with the cascade operators for post-generation linking and
 * the RelationManager for unified relation storage.
 *
 * Cascade Operators:
 * | Operator | Type             | Action                                    |
 * |----------|------------------|-------------------------------------------|
 * | `->`     | Forward Insert   | Create entity, link TO it                 |
 * | `~>`     | Forward Search   | Vector search existing, link TO it        |
 * | `<-`     | Backward Insert  | Create entity, link FROM it (it owns us)  |
 * | `<~`     | Backward Search  | Vector search existing, link FROM it      |
 *
 * @example
 * ```typescript
 * const relationships = new RelationshipCollection(storage)
 *
 * // Create a simple relationship
 * await relationships.create({
 *   from: 'customer_123',
 *   to: 'company_456',
 *   type: 'belongsTo'
 * })
 *
 * // Use cascade operators
 * await relationships.createWithOperator('customer_123', '~>Company', companyData)
 *
 * // Traverse relationships
 * const related = await relationships.traverse('customer_123', 'belongsTo', 2)
 * ```
 */

import type { Relationship } from '../../types/collections'
import type {
  StoredRelation,
  RelationManager,
  RelationOperator,
  RelationFieldDefinition,
  parseRelationOperator,
  parseRelationField,
  CascadeResult,
  CascadeFieldResult,
  CascadeError,
} from '../../types/cascade'
import { BaseCollection, DOStorage, NotFoundError, ValidationError } from './base'

/**
 * Options for creating a relationship
 */
export interface CreateRelationshipOptions {
  /**
   * Source entity ID
   */
  from: string

  /**
   * Target entity ID
   */
  to: string

  /**
   * Relationship type
   */
  type: string

  /**
   * Additional data associated with the relationship
   */
  data?: Record<string, unknown>
}

/**
 * Options for querying relationships
 */
export interface RelationshipQueryOptions {
  /**
   * Filter by relationship type
   */
  type?: string

  /**
   * Direction to query
   */
  direction?: 'outgoing' | 'incoming' | 'both'

  /**
   * Maximum depth for traversal
   */
  depth?: number

  /**
   * Include relationship data
   */
  includeData?: boolean
}

/**
 * Result of a relationship traversal
 */
export interface TraversalResult {
  /**
   * Entity ID
   */
  id: string

  /**
   * Depth from source (0 = direct relation)
   */
  depth: number

  /**
   * Relationship that led here
   */
  relationship?: Relationship

  /**
   * Path of IDs from source to this entity
   */
  path: string[]
}

/**
 * Relationships collection for graph-style entity linking
 *
 * @description
 * The RelationshipCollection provides graph-style relationship management
 * between Things in a DO. It integrates with:
 *
 * - Cascade operators for schema-driven linking
 * - RelationManager for unified storage
 * - Things collection for entity resolution
 *
 * Key features:
 * - Bidirectional relationships with automatic inverse creation
 * - Cascade operator support (-> ~> <- <~)
 * - Graph traversal with depth limiting
 * - Relationship metadata storage
 * - Ordered relationships (via ordinal)
 *
 * @example
 * ```typescript
 * const relationships = new RelationshipCollection(storage)
 *
 * // Create relationships
 * await relationships.create({
 *   from: 'order_123',
 *   to: 'customer_456',
 *   type: 'orderedBy'
 * })
 *
 * // Query relationships
 * const customerOrders = await relationships.findTo('customer_456', 'orderedBy')
 *
 * // Traverse graph
 * const network = await relationships.traverse('customer_456', null, 2)
 *
 * // Process cascade schema
 * const result = await relationships.processCascade(
 *   'Customer',
 *   'cust_123',
 *   generatedData,
 *   CustomerSchema
 * )
 * ```
 */
export class RelationshipCollection extends BaseCollection<Relationship> {
  /**
   * Create a new RelationshipCollection instance
   *
   * @param storage - DO storage interface
   */
  constructor(storage: DOStorage) {
    super(storage, {
      name: 'relationships',
      idPrefix: 'rel',
    })
  }

  /**
   * Initialize the relationships table in SQLite
   *
   * @internal
   */
  protected async initializeTable(): Promise<void> {
    // Using KV storage via BaseCollection, no SQL table needed
  }

  /**
   * Create a relationship
   *
   * @param data - Relationship creation options
   * @returns Created relationship
   *
   * @throws {ValidationError} If relationship already exists
   *
   * @example
   * ```typescript
   * const rel = await relationships.create({
   *   from: 'order_123',
   *   to: 'customer_456',
   *   type: 'belongsTo'
   * })
   * ```
   */
  async create(data: Omit<Relationship, 'id' | 'createdAt'>): Promise<Relationship> {
    // Check for duplicate
    const existing = await this.exists(data.from, data.to, data.type)
    if (existing) {
      throw new ValidationError(`Relationship from '${data.from}' to '${data.to}' of type '${data.type}' already exists.`)
    }

    const id = this.generateId()
    const now = this.now()

    const rel: Relationship = {
      id,
      from: data.from,
      to: data.to,
      type: data.type,
      data: data.data,
      createdAt: now,
    }

    const key = `${this.config.name}:${id}`
    await this.storage.put(key, rel)

    return rel
  }

  /**
   * Create a bidirectional relationship
   *
   * @param data - Relationship data
   * @param inverseType - Type for the inverse relationship
   * @returns Tuple of [forward, inverse] relationships
   *
   * @example
   * ```typescript
   * const [parentRel, childRel] = await relationships.createBidirectional(
   *   { from: 'parent_1', to: 'child_2', type: 'hasChild' },
   *   'hasParent'
   * )
   * ```
   */
  async createBidirectional(
    data: Omit<Relationship, 'id' | 'createdAt'>,
    inverseType: string
  ): Promise<[Relationship, Relationship]> {
    const forward = await this.create(data)
    const inverse = await this.create({
      from: data.to,
      to: data.from,
      type: inverseType,
      data: data.data,
    })
    return [forward, inverse]
  }

  /**
   * Get all outgoing relationships from an entity
   *
   * @param entityId - Source entity ID
   * @param type - Optional filter by relationship type
   * @returns Array of relationships
   *
   * @example
   * ```typescript
   * const orders = await relationships.findFrom('customer_123', 'hasOrder')
   * ```
   */
  async findFrom(entityId: string, type?: string): Promise<Relationship[]> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Relationship>({ prefix })
    const results: Relationship[] = []
    for (const item of allItems.values()) {
      if (item.from === entityId && (!type || item.type === type)) {
        results.push(item)
      }
    }
    // Sort by ordinal if present in data
    results.sort((a, b) => ((a.data?.ordinal as number) ?? 0) - ((b.data?.ordinal as number) ?? 0))
    return results
  }

  /**
   * Get all incoming relationships to an entity
   *
   * @param entityId - Target entity ID
   * @param type - Optional filter by relationship type
   * @returns Array of relationships
   *
   * @example
   * ```typescript
   * const owners = await relationships.findTo('order_123', 'belongsTo')
   * ```
   */
  async findTo(entityId: string, type?: string): Promise<Relationship[]> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Relationship>({ prefix })
    const results: Relationship[] = []
    for (const item of allItems.values()) {
      if (item.to === entityId && (!type || item.type === type)) {
        results.push(item)
      }
    }
    return results
  }

  /**
   * Get all relationships for an entity (both directions)
   *
   * @param entityId - Entity ID
   * @param options - Query options
   * @returns Array of relationships
   *
   * @example
   * ```typescript
   * const allRels = await relationships.findAll('entity_123')
   * ```
   */
  async findAll(entityId: string, options?: RelationshipQueryOptions): Promise<Relationship[]> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Relationship>({ prefix })
    const results: Relationship[] = []
    for (const item of allItems.values()) {
      const matchesType = !options?.type || item.type === options.type
      if (!matchesType) continue

      if (options?.direction === 'outgoing') {
        if (item.from === entityId) results.push(item)
      } else if (options?.direction === 'incoming') {
        if (item.to === entityId) results.push(item)
      } else {
        if (item.from === entityId || item.to === entityId) results.push(item)
      }
    }
    return results
  }

  /**
   * Check if a relationship exists
   *
   * @param from - Source entity ID
   * @param to - Target entity ID
   * @param type - Relationship type
   * @returns True if relationship exists
   *
   * @example
   * ```typescript
   * if (await relationships.exists('customer_123', 'company_456', 'belongsTo')) {
   *   // Already linked
   * }
   * ```
   */
  async exists(from: string, to: string, type: string): Promise<boolean> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Relationship>({ prefix })
    for (const item of allItems.values()) {
      if (item.from === from && item.to === to && item.type === type) {
        return true
      }
    }
    return false
  }

  /**
   * Delete a relationship by ID
   *
   * @param id - Relationship ID
   *
   * @throws {NotFoundError} If relationship not found
   */
  async delete(id: string): Promise<void> {
    const key = `${this.config.name}:${id}`
    const exists = await this.storage.get(key)
    if (!exists) {
      throw new NotFoundError('relationships', id)
    }
    await this.storage.delete(key)
  }

  /**
   * Delete a specific relationship by from/to/type
   *
   * @param from - Source entity ID
   * @param to - Target entity ID
   * @param type - Relationship type
   * @returns True if deleted, false if not found
   */
  async deleteRelation(from: string, to: string, type: string): Promise<boolean> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Relationship>({ prefix })
    for (const [key, item] of allItems.entries()) {
      if (item.from === from && item.to === to && item.type === type) {
        await this.storage.delete(key)
        return true
      }
    }
    return false
  }

  /**
   * Delete all relationships for an entity
   *
   * @param entityId - Entity ID
   * @returns Number of deleted relationships
   *
   * @description
   * Deletes both incoming and outgoing relationships.
   *
   * @example
   * ```typescript
   * const deleted = await relationships.deleteAll('entity_123')
   * console.log(`Deleted ${deleted} relationships`)
   * ```
   */
  async deleteAll(entityId: string): Promise<number> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Relationship>({ prefix })
    let deleted = 0
    for (const [key, item] of allItems.entries()) {
      if (item.from === entityId || item.to === entityId) {
        await this.storage.delete(key)
        deleted++
      }
    }
    return deleted
  }

  /**
   * Update relationship data
   *
   * @param id - Relationship ID
   * @param data - Data to merge
   * @returns Updated relationship
   *
   * @throws {NotFoundError} If relationship not found
   */
  async updateData(id: string, data: Record<string, unknown>): Promise<Relationship> {
    const key = `${this.config.name}:${id}`
    const existing = await this.storage.get<Relationship>(key)
    if (!existing) {
      throw new NotFoundError('relationships', id)
    }

    const updated: Relationship = {
      ...existing,
      data: { ...(existing.data ?? {}), ...data },
    }

    await this.storage.put(key, updated)
    return updated
  }

  /**
   * Traverse the relationship graph
   *
   * @param startId - Starting entity ID
   * @param type - Relationship type to follow (null for any)
   * @param maxDepth - Maximum traversal depth
   * @param direction - Direction to traverse
   * @returns Array of traversal results
   *
   * @description
   * Performs breadth-first traversal of the relationship graph.
   *
   * @example
   * ```typescript
   * // Find all entities connected to customer within 2 hops
   * const network = await relationships.traverse('customer_123', null, 2)
   *
   * // Find all children of an organization
   * const children = await relationships.traverse('org_1', 'hasChild', 3, 'outgoing')
   * ```
   */
  async traverse(
    startId: string,
    type: string | null,
    maxDepth: number = 1,
    direction: 'outgoing' | 'incoming' | 'both' = 'both'
  ): Promise<TraversalResult[]> {
    const visited = new Set<string>([startId])
    const results: TraversalResult[] = []
    const queue: Array<{ id: string; depth: number; path: string[] }> = [
      { id: startId, depth: 0, path: [startId] },
    ]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (current.depth >= maxDepth) continue

      // Get relationships for current node
      const prefix = `${this.config.name}:`
      const allItems = await this.storage.list<Relationship>({ prefix })

      for (const item of allItems.values()) {
        if (type && item.type !== type) continue

        let targetId: string | null = null

        if (direction === 'outgoing' || direction === 'both') {
          if (item.from === current.id && !visited.has(item.to)) {
            targetId = item.to
          }
        }
        if (!targetId && (direction === 'incoming' || direction === 'both')) {
          if (item.to === current.id && !visited.has(item.from)) {
            targetId = item.from
          }
        }

        if (targetId && !visited.has(targetId)) {
          visited.add(targetId)
          const newPath = [...current.path, targetId]
          const result: TraversalResult = {
            id: targetId,
            depth: current.depth + 1,
            relationship: item,
            path: newPath,
          }
          results.push(result)
          queue.push({ id: targetId, depth: current.depth + 1, path: newPath })
        }
      }
    }

    return results
  }

  /**
   * Find shortest path between two entities
   *
   * @param fromId - Source entity ID
   * @param toId - Target entity ID
   * @param maxDepth - Maximum search depth
   * @returns Path of relationships or null if not connected
   *
   * @example
   * ```typescript
   * const path = await relationships.findPath('entity_a', 'entity_z', 5)
   * if (path) {
   *   console.log(`Connected via ${path.length} relationships`)
   * }
   * ```
   */
  async findPath(
    fromId: string,
    toId: string,
    maxDepth: number = 5
  ): Promise<Relationship[] | null> {
    const visited = new Set<string>([fromId])
    const queue: Array<{ id: string; depth: number; path: Relationship[] }> = [
      { id: fromId, depth: 0, path: [] },
    ]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (current.depth >= maxDepth) continue

      const prefix = `${this.config.name}:`
      const allItems = await this.storage.list<Relationship>({ prefix })

      for (const item of allItems.values()) {
        let targetId: string | null = null

        if (item.from === current.id && !visited.has(item.to)) {
          targetId = item.to
        } else if (item.to === current.id && !visited.has(item.from)) {
          targetId = item.from
        }

        if (targetId) {
          const newPath = [...current.path, item]

          if (targetId === toId) {
            return newPath
          }

          visited.add(targetId)
          queue.push({ id: targetId, depth: current.depth + 1, path: newPath })
        }
      }
    }

    return null
  }

  /**
   * Count relationships for an entity
   *
   * @param entityId - Entity ID
   * @param direction - Direction to count
   * @returns Relationship count
   */
  async countFor(
    entityId: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both'
  ): Promise<number> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Relationship>({ prefix })
    let count = 0
    for (const item of allItems.values()) {
      if (direction === 'outgoing' && item.from === entityId) count++
      else if (direction === 'incoming' && item.to === entityId) count++
      else if (direction === 'both' && (item.from === entityId || item.to === entityId)) count++
    }
    return count
  }

  /**
   * Get relationship types used by an entity
   *
   * @param entityId - Entity ID
   * @returns Array of unique relationship types
   */
  async getTypesFor(entityId: string): Promise<string[]> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Relationship>({ prefix })
    const types = new Set<string>()
    for (const item of allItems.values()) {
      if (item.from === entityId || item.to === entityId) {
        types.add(item.type)
      }
    }
    return Array.from(types)
  }

  // ===========================================================================
  // Cascade Operator Support
  // ===========================================================================

  /**
   * Create relationship using cascade operator
   *
   * @param sourceId - Source entity ID
   * @param operator - Cascade operator (-> ~> <- <~)
   * @param targetType - Target entity type
   * @param targetId - Target entity ID
   * @param relName - Relationship name (field name)
   * @returns Created relationship
   *
   * @example
   * ```typescript
   * // Forward insert: customer -> contact
   * await relationships.createWithOperator('cust_1', '->', 'Contact', 'contact_2', 'contacts')
   *
   * // Backward search: industry <~ customer
   * await relationships.createWithOperator('cust_1', '<~', 'Industry', 'ind_3', 'industry')
   * ```
   */
  async createWithOperator(
    sourceId: string,
    operator: RelationOperator,
    targetType: string,
    targetId: string,
    relName: string
  ): Promise<Relationship> {
    const { direction, method } = this.parseOperator(operator)

    const relType = method === 'insert'
      ? (direction === 'forward' ? 'forward' : 'backward')
      : (direction === 'forward' ? 'fuzzyForward' : 'fuzzyBackward')

    // For backward operators, swap from/to
    const from = direction === 'forward' ? sourceId : targetId
    const to = direction === 'forward' ? targetId : sourceId

    return this.create({
      from,
      to,
      type: relName,
      data: {
        relType,
        targetType,
        operator,
      },
    })
  }

  /**
   * Parse a cascade operator into direction and method
   *
   * @param op - Cascade operator
   * @returns Parsed operator components
   *
   * @internal
   */
  private parseOperator(op: RelationOperator): {
    direction: 'forward' | 'backward'
    method: 'insert' | 'search'
  } {
    switch (op) {
      case '->': return { direction: 'forward', method: 'insert' }
      case '~>': return { direction: 'forward', method: 'search' }
      case '<-': return { direction: 'backward', method: 'insert' }
      case '<~': return { direction: 'backward', method: 'search' }
    }
  }

  /**
   * Process cascade relationships for a generated entity
   *
   * @param sourceType - Source entity type
   * @param sourceId - Source entity ID
   * @param generatedData - AI-generated data
   * @param schema - Schema with cascade operators
   * @returns Processing results
   *
   * @description
   * Processes all fields in the schema that have cascade operators:
   * - `->`: Creates new entity and links TO it
   * - `~>`: Searches for entity and links TO it
   * - `<-`: Creates new entity and links FROM it
   * - `<~`: Searches for entity and links FROM it
   *
   * @example
   * ```typescript
   * const schema = {
   *   contacts: ['->Contact'],       // Create contacts
   *   company: '~>Company',          // Search for company
   *   owner: '<-SalesRep',           // SalesRep owns this
   * }
   *
   * const result = await relationships.processCascade(
   *   'Customer',
   *   'cust_123',
   *   generatedData,
   *   schema
   * )
   *
   * console.log(result.created)    // Entities created
   * console.log(result.relations)  // Relations created
   * console.log(result.errors)     // Any errors
   * ```
   */
  async processCascade(
    sourceType: string,
    sourceId: string,
    generatedData: Record<string, unknown>,
    schema: Record<string, string | string[]>
  ): Promise<CascadeResult> {
    const result: CascadeResult = {
      created: [],
      relations: [],
      errors: [],
    }

    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
      const fieldStr = Array.isArray(fieldSchema) ? fieldSchema[0] : fieldSchema
      // Parse operator from field schema string
      const opMatch = fieldStr.match(/(->|~>|<-|<~)([A-Z][a-zA-Z0-9]*)/)
      if (!opMatch) continue

      const operator = opMatch[1] as RelationOperator
      const targetType = opMatch[2]
      const fieldValue = generatedData[fieldName]

      if (fieldValue === undefined || fieldValue === null) {
        result.errors.push({
          field: fieldName,
          message: `No value for field '${fieldName}'`,
          targetType,
          code: 'NotFound',
        })
        continue
      }

      const { direction, method } = this.parseOperator(operator)

      if (method === 'search') {
        // For search operators, we cannot actually do vector search here
        // Record an error indicating the search target was not found
        result.errors.push({
          field: fieldName,
          message: `Vector search not available for '${fieldName}' targeting '${targetType}'`,
          targetType,
          code: 'NotFound',
        })
        continue
      }

      // For insert operators, create the entity and link
      const items = Array.isArray(fieldValue) ? fieldValue : [fieldValue]
      for (const item of items) {
        const entityId = this.generateId()
        result.created.push({ type: targetType, id: entityId, data: item })

        try {
          const from = direction === 'forward' ? sourceId : entityId
          const to = direction === 'forward' ? entityId : sourceId

          const rel = await this.create({
            from,
            to,
            type: fieldName,
            data: { relType: direction === 'forward' ? 'forward' : 'backward', targetType, operator },
          })

          result.relations.push(this.toStoredRelation(rel, {
            relType: direction === 'forward' ? 'Forward' : 'Backward',
            relName: fieldName,
            fromCollection: direction === 'forward' ? sourceType : targetType,
            toCollection: direction === 'forward' ? targetType : sourceType,
          }))
        } catch (err) {
          result.errors.push({
            field: fieldName,
            message: err instanceof Error ? err.message : String(err),
            targetType,
            code: 'Failed',
          })
        }
      }
    }

    return result
  }

  /**
   * Process a single cascade field
   *
   * @param sourceType - Source entity type
   * @param sourceId - Source entity ID
   * @param fieldName - Field name
   * @param fieldValue - Generated value for field
   * @param fieldDef - Parsed field definition
   * @returns Field processing result
   *
   * @internal
   */
  async processCascadeField(
    sourceType: string,
    sourceId: string,
    fieldName: string,
    fieldValue: unknown,
    fieldDef: RelationFieldDefinition
  ): Promise<CascadeFieldResult> {
    const { direction, method } = this.parseOperator(fieldDef.operator)
    const targetType = fieldDef.targets[0]

    if (method === 'search') {
      // Vector search not available - return error
      return {
        error: {
          field: fieldName,
          message: `Vector search not available for '${fieldName}'`,
          targetType,
          code: 'NotFound',
        },
      }
    }

    // Insert: create entity and link
    const entityId = this.generateId()
    const from = direction === 'forward' ? sourceId : entityId
    const to = direction === 'forward' ? entityId : sourceId

    try {
      const rel = await this.create({
        from,
        to,
        type: fieldName,
        data: { relType: direction === 'forward' ? 'forward' : 'backward', targetType },
      })

      const storedRel = this.toStoredRelation(rel, {
        relType: direction === 'forward' ? 'Forward' : 'Backward',
        relName: fieldName,
        fromCollection: direction === 'forward' ? sourceType : targetType,
        toCollection: direction === 'forward' ? targetType : sourceType,
      })

      return {
        created: { type: targetType, id: entityId, data: fieldValue },
        relation: storedRel,
      }
    } catch (err) {
      return {
        error: {
          field: fieldName,
          message: err instanceof Error ? err.message : String(err),
          targetType,
          code: 'Failed',
        },
      }
    }
  }

  // ===========================================================================
  // RelationManager Interface Implementation
  // ===========================================================================

  /**
   * Convert to StoredRelation format
   *
   * @param rel - Relationship
   * @param options - Additional fields
   * @returns StoredRelation
   *
   * @internal
   */
  toStoredRelation(
    rel: Relationship,
    options: {
      relType: 'Forward' | 'Backward' | 'FuzzyForward' | 'FuzzyBackward'
      relName: string
      fromCollection?: string
      toCollection?: string
      label?: string
      ordinal?: number
    }
  ): StoredRelation {
    return {
      id: rel.id,
      relType: options.relType,
      relName: options.relName,
      fromCollection: options.fromCollection ?? '',
      fromId: rel.from,
      toCollection: options.toCollection ?? '',
      toId: rel.to,
      label: options.label,
      ordinal: options.ordinal ?? 0,
      metadata: rel.data,
      createdAt: rel.createdAt,
      updatedAt: rel.createdAt,
    }
  }

  /**
   * Get outgoing relations (RelationManager interface)
   *
   * @param collection - Source collection
   * @param docId - Source document ID
   * @param relName - Optional relation name filter
   */
  async getOutgoing(
    collection: string,
    docId: string,
    relName?: string
  ): Promise<StoredRelation[]> {
    const rels = await this.findFrom(docId, relName)
    return rels.map(rel => this.toStoredRelation(rel, {
      relType: 'Forward',
      relName: rel.type,
      fromCollection: collection,
    }))
  }

  /**
   * Get incoming relations (RelationManager interface)
   *
   * @param collection - Target collection
   * @param docId - Target document ID
   * @param relName - Optional relation name filter
   */
  async getIncoming(
    collection: string,
    docId: string,
    relName?: string
  ): Promise<StoredRelation[]> {
    const rels = await this.findTo(docId, relName)
    return rels.map(rel => this.toStoredRelation(rel, {
      relType: 'Backward',
      relName: rel.type,
      toCollection: collection,
    }))
  }

  /**
   * Update ordinal for a relationship (for reordering)
   *
   * @param id - Relationship ID
   * @param ordinal - New ordinal value
   * @returns Updated relationship
   */
  async updateOrdinal(id: string, ordinal: number): Promise<Relationship> {
    return this.updateData(id, { ordinal })
  }

  /**
   * Reorder relationships for an entity
   *
   * @param entityId - Entity ID
   * @param type - Relationship type
   * @param orderedIds - Array of relationship IDs in new order
   *
   * @example
   * ```typescript
   * // Reorder contacts for a customer
   * await relationships.reorder('customer_123', 'hasContact', [
   *   'rel_c', 'rel_a', 'rel_b'  // New order
   * ])
   * ```
   */
  async reorder(entityId: string, type: string, orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await this.updateOrdinal(orderedIds[i], i)
    }
  }
}

export default RelationshipCollection
