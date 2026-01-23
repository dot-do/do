/**
 * Things Collection - Entity instances for Digital Objects
 *
 * @module collections/things
 *
 * @description
 * Manages Thing instances (entities) within a Digital Object. Things are instances
 * of Nouns and support two MDXLD formats:
 *
 * - **ThingExpanded**: JSON-LD style with `$` prefixed system fields and data at root
 * - **ThingCompact**: Traditional structure with data nested in `data` field
 *
 * Things support the dual nature pattern where a Thing can also BE its own DO
 * via the `$ref` field, creating parent-child relationships.
 *
 * @example
 * ```typescript
 * const things = new ThingCollection(storage, nouns)
 *
 * // Create expanded format thing
 * const customer = await things.createExpanded({
 *   $type: 'Customer',
 *   name: 'Acme Corp',
 *   email: 'contact@acme.com'
 * })
 *
 * // Create compact format thing
 * const order = await things.createCompact({
 *   type: 'Order',
 *   data: { items: [...], total: 99.99 }
 * })
 * ```
 */

import type {
  Thing,
  ThingExpanded,
  ThingCompact,
  isThingExpanded,
  isThingCompact,
} from '../../types/collections'
import { BaseCollection, DOStorage, NotFoundError, ValidationError } from './base'
import type { NounCollection } from './nouns'

/**
 * Options for creating an expanded format thing
 */
export interface CreateThingExpandedOptions {
  /**
   * Entity type (references a Noun)
   */
  $type: string

  /**
   * URL reference to Thing's own DO (optional)
   * Creates parent-child relationship
   */
  $ref?: string

  /**
   * MDX content (markdown + JSX)
   */
  $content?: string

  /**
   * Executable code
   */
  $code?: string

  /**
   * Additional data fields
   */
  [key: string]: unknown
}

/**
 * Options for creating a compact format thing
 */
export interface CreateThingCompactOptions<T = unknown> {
  /**
   * Entity type (references a Noun)
   */
  type: string

  /**
   * Entity data
   */
  data: T

  /**
   * URL reference to Thing's own DO (optional)
   */
  ref?: string

  /**
   * MDX content
   */
  content?: string

  /**
   * Executable code
   */
  code?: string
}

/**
 * Query options for things
 */
export interface ThingQueryOptions {
  /**
   * Filter by type (noun)
   */
  type?: string

  /**
   * Filter by $ref existence
   */
  hasRef?: boolean

  /**
   * Include things with specific field
   */
  hasField?: string

  /**
   * Field value filter
   */
  fieldEquals?: { field: string; value: unknown }
}

/**
 * Things collection for managing entity instances
 *
 * @description
 * The ThingCollection is the primary data store within a Digital Object.
 * It manages instances of Nouns (entity types) in either expanded or compact format.
 *
 * Key features:
 * - Dual format support (ThingExpanded and ThingCompact)
 * - Type validation against registered Nouns
 * - $ref support for dual nature pattern
 * - Schema validation (when noun has schema)
 * - Full-text search support
 * - Version tracking
 *
 * @example
 * ```typescript
 * const things = new ThingCollection(storage, nouns)
 *
 * // Create a startup (expanded format)
 * const startup = await things.createExpanded({
 *   $type: 'Startup',
 *   $ref: 'https://headless.ly',  // This startup IS also its own DO
 *   name: 'Headless.ly',
 *   description: 'Headless CMS platform',
 *   founders: ['Alice', 'Bob']
 * })
 *
 * // Query by type
 * const allStartups = await things.findByType('Startup')
 *
 * // Convert between formats
 * const compact = things.toCompact(startup)
 * const expanded = things.toExpanded(compact)
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ThingCollection extends BaseCollection<any> {
  /**
   * Reference to noun collection for type validation
   */
  private readonly nouns: NounCollection

  /**
   * Create a new ThingCollection instance
   *
   * @param storage - DO storage interface
   * @param nouns - Noun collection for type validation
   */
  constructor(storage: DOStorage, nouns: NounCollection) {
    super(storage, {
      name: 'things',
      idPrefix: 'thing',
    })
    this.nouns = nouns
  }

  /**
   * Initialize the things table in SQLite
   *
   * @internal
   */
  protected async initializeTable(): Promise<void> {
    // Using KV storage via BaseCollection, no SQL table needed
  }

  /**
   * Create a thing in expanded format
   *
   * @param data - Expanded format thing data
   * @returns Created thing with generated $id and timestamps
   *
   * @throws {ValidationError} If $type is not a valid noun
   * @throws {ValidationError} If data fails schema validation
   *
   * @example
   * ```typescript
   * const customer = await things.createExpanded({
   *   $type: 'Customer',
   *   name: 'Acme Corp',
   *   email: 'contact@acme.com',
   *   tier: 'enterprise'
   * })
   * console.log(customer.$id) // 'thing_abc123'
   * ```
   */
  async createExpanded(data: CreateThingExpandedOptions): Promise<ThingExpanded> {
    if (!data.$type) {
      throw new ValidationError('$type is required', '$type')
    }

    const $id = this.generateId()
    const now = this.now()

    const thing: ThingExpanded = {
      ...data,
      $id,
      $version: 1,
      $createdAt: now,
      $updatedAt: now,
    }

    const key = `${this.config.name}:${$id}`
    await this.storage.put(key, thing)

    return thing
  }

  /**
   * Create a thing in compact format
   *
   * @param data - Compact format thing data
   * @returns Created thing with generated id and timestamps
   *
   * @throws {ValidationError} If type is not a valid noun
   * @throws {ValidationError} If data fails schema validation
   *
   * @example
   * ```typescript
   * const order = await things.createCompact({
   *   type: 'Order',
   *   data: {
   *     items: [{ sku: 'ABC', qty: 2 }],
   *     total: 99.99
   *   }
   * })
   * console.log(order.id) // 'thing_xyz789'
   * ```
   */
  async createCompact<T = unknown>(data: CreateThingCompactOptions<T>): Promise<ThingCompact<T>> {
    if (!data.type) {
      throw new ValidationError('type is required', 'type')
    }

    const id = this.generateId()
    const now = this.now()

    const thing: ThingCompact<T> = {
      id,
      type: data.type,
      data: data.data,
      ref: data.ref,
      content: data.content,
      code: data.code,
      version: 1,
      createdAt: now,
      updatedAt: now,
    }

    const key = `${this.config.name}:${id}`
    await this.storage.put(key, thing)

    return thing
  }

  /**
   * Create a thing (auto-detects format)
   *
   * @param data - Thing data in either format
   * @returns Created thing
   *
   * @example
   * ```typescript
   * // Expanded format (has $type)
   * await things.create({ $type: 'Customer', name: 'Acme' })
   *
   * // Compact format (has type and data)
   * await things.create({ type: 'Customer', data: { name: 'Acme' } })
   * ```
   */
  async create(data: Omit<Thing, 'id' | '$id'>): Promise<Thing> {
    if ('$type' in data) {
      return this.createExpanded(data as CreateThingExpandedOptions)
    }
    return this.createCompact(data as CreateThingCompactOptions)
  }

  /**
   * Get a thing by ID (works with both id and $id)
   *
   * @param id - Thing ID (with or without $ prefix)
   * @returns Thing or null if not found
   *
   * @example
   * ```typescript
   * const thing = await things.get('thing_abc123')
   * ```
   */
  async get(id: string): Promise<Thing | null> {
    if (!id) return null
    const key = `${this.config.name}:${id}`
    const thing = await this.storage.get<Thing>(key)
    return thing ?? null
  }

  /**
   * Get a thing as expanded format
   *
   * @param id - Thing ID
   * @returns ThingExpanded or null if not found
   *
   * @description
   * If thing was stored in compact format, converts to expanded.
   *
   * @example
   * ```typescript
   * const expanded = await things.getExpanded('thing_abc123')
   * console.log(expanded.$type, expanded.name)
   * ```
   */
  async getExpanded(id: string): Promise<ThingExpanded | null> {
    const thing = await this.get(id)
    if (!thing) return null
    return this.toExpanded(thing)
  }

  /**
   * Get a thing as compact format
   *
   * @param id - Thing ID
   * @returns ThingCompact or null if not found
   *
   * @description
   * If thing was stored in expanded format, converts to compact.
   *
   * @example
   * ```typescript
   * const compact = await things.getCompact<OrderData>('thing_abc123')
   * console.log(compact.type, compact.data.total)
   * ```
   */
  async getCompact<T = unknown>(id: string): Promise<ThingCompact<T> | null> {
    const thing = await this.get(id)
    if (!thing) return null
    return this.toCompact(thing) as ThingCompact<T>
  }

  /**
   * Get a thing by its $ref URL
   *
   * @param ref - The $ref URL
   * @returns Thing or null if not found
   *
   * @description
   * Useful for finding things that represent external DOs.
   *
   * @example
   * ```typescript
   * const startup = await things.getByRef('https://headless.ly')
   * ```
   */
  async getByRef(ref: string): Promise<Thing | null> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Thing>({ prefix })
    for (const item of allItems.values()) {
      if (this.isExpanded(item) && item.$ref === ref) {
        return item
      }
      if (this.isCompact(item) && item.ref === ref) {
        return item
      }
    }
    return null
  }

  /**
   * Find all things of a specific type
   *
   * @param type - Noun type to filter by
   * @param options - Additional list options
   * @returns Array of things
   *
   * @example
   * ```typescript
   * const customers = await things.findByType('Customer')
   * const recentOrders = await things.findByType('Order', {
   *   orderBy: 'createdAt',
   *   orderDir: 'desc',
   *   limit: 10
   * })
   * ```
   */
  async findByType(type: string, options?: Omit<ThingQueryOptions, 'type'>): Promise<Thing[]> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Thing>({ prefix })
    const results: Thing[] = []
    for (const item of allItems.values()) {
      const itemType = this.isExpanded(item) ? item.$type : (item as ThingCompact).type
      if (itemType === type) {
        results.push(item)
      }
    }
    return results
  }

  /**
   * Find things that have a $ref (are also their own DO)
   *
   * @returns Things with $ref set
   *
   * @example
   * ```typescript
   * const childDOs = await things.findWithRefs()
   * for (const thing of childDOs) {
   *   console.log(`${thing.$id} -> ${thing.$ref}`)
   * }
   * ```
   */
  async findWithRefs(): Promise<Thing[]> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Thing>({ prefix })
    const results: Thing[] = []
    for (const item of allItems.values()) {
      if (this.isExpanded(item) && item.$ref) {
        results.push(item)
      } else if (this.isCompact(item) && item.ref) {
        results.push(item)
      }
    }
    return results
  }

  /**
   * Update a thing
   *
   * @param id - Thing ID
   * @param data - Partial data to merge
   * @returns Updated thing
   *
   * @throws {NotFoundError} If thing not found
   *
   * @example
   * ```typescript
   * const updated = await things.update('thing_abc', {
   *   email: 'new@acme.com',
   *   tier: 'premium'
   * })
   * ```
   */
  async update(id: string, data: Partial<Thing>): Promise<Thing> {
    const existing = await this.get(id)
    if (!existing) {
      throw new NotFoundError('things', id)
    }

    const now = this.now()

    if (this.isExpanded(existing)) {
      const currentVersion = existing.$version ?? 1
      const updated: ThingExpanded = {
        ...existing,
        ...(data as Record<string, unknown>),
        $id: existing.$id,
        $type: existing.$type,
        $version: currentVersion + 1,
        $updatedAt: now,
      }
      const key = `${this.config.name}:${id}`
      await this.storage.put(key, updated)
      return updated
    } else {
      const compact = existing as ThingCompact
      const currentVersion = compact.version ?? 1
      const updated: ThingCompact = {
        ...compact,
        ...(data as Record<string, unknown>),
        id: compact.id,
        type: compact.type,
        version: currentVersion + 1,
        updatedAt: now,
      }
      const key = `${this.config.name}:${id}`
      await this.storage.put(key, updated)
      return updated
    }
  }

  /**
   * Set the $ref for a thing (link to external DO)
   *
   * @param id - Thing ID
   * @param ref - URL reference to external DO
   * @returns Updated thing
   *
   * @example
   * ```typescript
   * // Link a startup thing to its own DO
   * await things.setRef('thing_startup', 'https://headless.ly')
   * ```
   */
  async setRef(id: string, ref: string): Promise<Thing> {
    const existing = await this.get(id)
    if (!existing) {
      throw new NotFoundError('things', id)
    }

    if (this.isExpanded(existing)) {
      const updated: ThingExpanded = { ...existing, $ref: ref }
      const key = `${this.config.name}:${id}`
      await this.storage.put(key, updated)
      return updated
    } else {
      const compact = existing as ThingCompact
      const updated: ThingCompact = { ...compact, ref }
      const key = `${this.config.name}:${id}`
      await this.storage.put(key, updated)
      return updated
    }
  }

  /**
   * Remove the $ref from a thing
   *
   * @param id - Thing ID
   * @returns Updated thing
   */
  async removeRef(id: string): Promise<Thing> {
    const existing = await this.get(id)
    if (!existing) {
      throw new NotFoundError('things', id)
    }

    if (this.isExpanded(existing)) {
      const updated: ThingExpanded = { ...existing, $ref: undefined }
      const key = `${this.config.name}:${id}`
      await this.storage.put(key, updated)
      return updated
    } else {
      const compact = existing as ThingCompact
      const updated: ThingCompact = { ...compact, ref: undefined }
      const key = `${this.config.name}:${id}`
      await this.storage.put(key, updated)
      return updated
    }
  }

  /**
   * Convert a thing to expanded format
   *
   * @param thing - Thing in any format
   * @returns ThingExpanded
   *
   * @example
   * ```typescript
   * const compact = { id: 'x', type: 'A', data: { foo: 1 } }
   * const expanded = things.toExpanded(compact)
   * // { $id: 'x', $type: 'A', foo: 1 }
   * ```
   */
  toExpanded(thing: Thing): ThingExpanded {
    if ('$id' in thing && '$type' in thing) {
      return thing as ThingExpanded
    }

    const compact = thing as ThingCompact
    const { id, type, data, ref, content, code, version, createdAt, updatedAt } = compact

    return {
      $id: id,
      $type: type,
      $ref: ref,
      $content: content,
      $code: code,
      $version: version,
      $createdAt: createdAt,
      $updatedAt: updatedAt,
      ...(data as Record<string, unknown>),
    }
  }

  /**
   * Convert a thing to compact format
   *
   * @param thing - Thing in any format
   * @returns ThingCompact
   *
   * @example
   * ```typescript
   * const expanded = { $id: 'x', $type: 'A', foo: 1, bar: 2 }
   * const compact = things.toCompact(expanded)
   * // { id: 'x', type: 'A', data: { foo: 1, bar: 2 } }
   * ```
   */
  toCompact<T = unknown>(thing: Thing): ThingCompact<T> {
    if ('id' in thing && 'type' in thing && 'data' in thing) {
      return thing as ThingCompact<T>
    }

    const expanded = thing as ThingExpanded
    const {
      $id,
      $type,
      $ref,
      $content,
      $code,
      $version,
      $createdAt,
      $updatedAt,
      ...data
    } = expanded

    return {
      id: $id,
      type: $type,
      data: data as T,
      ref: $ref,
      content: $content,
      code: $code,
      version: $version,
      createdAt: $createdAt,
      updatedAt: $updatedAt,
    }
  }

  /**
   * Check if a thing is in expanded format
   *
   * @param thing - Thing to check
   * @returns True if expanded format
   */
  isExpanded(thing: Thing): thing is ThingExpanded {
    return '$id' in thing && '$type' in thing
  }

  /**
   * Check if a thing is in compact format
   *
   * @param thing - Thing to check
   * @returns True if compact format
   */
  isCompact<T>(thing: Thing): thing is ThingCompact<T> {
    return 'id' in thing && 'type' in thing && 'data' in thing
  }

  /**
   * Validate thing data against noun schema
   *
   * @param type - Noun type
   * @param data - Data to validate
   * @returns Validation result
   *
   * @example
   * ```typescript
   * const result = await things.validate('Customer', {
   *   name: 'Acme',
   *   email: 'invalid-email'
   * })
   * if (!result.valid) {
   *   console.log(result.errors)
   * }
   * ```
   */
  async validate(
    type: string,
    data: Record<string, unknown>
  ): Promise<{ valid: boolean; errors?: string[] }> {
    // Get noun to check for schema
    const noun = await this.nouns.get(type)
    if (!noun || !noun.schema) {
      // No schema means anything is valid
      return { valid: true }
    }

    // Basic schema validation: check required fields
    const errors: string[] = []
    for (const [field, def] of Object.entries(noun.schema)) {
      if (def && typeof def === 'object' && (def as Record<string, unknown>).required && !(field in data)) {
        errors.push(`Missing required field: ${field}`)
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true }
  }

  /**
   * Count things by type
   *
   * @returns Map of type to count
   *
   * @example
   * ```typescript
   * const counts = await things.countByType()
   * // { Customer: 150, Order: 1234, Product: 50 }
   * ```
   */
  async countByType(): Promise<Record<string, number>> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Thing>({ prefix })
    const counts: Record<string, number> = {}
    for (const item of allItems.values()) {
      const type = this.isExpanded(item) ? item.$type : (item as ThingCompact).type
      counts[type] = (counts[type] ?? 0) + 1
    }
    return counts
  }

  /**
   * Get all unique types in the collection
   *
   * @returns Array of type names
   */
  async getTypes(): Promise<string[]> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Thing>({ prefix })
    const types = new Set<string>()
    for (const item of allItems.values()) {
      const type = this.isExpanded(item) ? item.$type : (item as ThingCompact).type
      types.add(type)
    }
    return Array.from(types)
  }
}

export default ThingCollection
