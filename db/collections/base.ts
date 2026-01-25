/**
 * Base Collection - Generic CRUD operations for DO collections
 *
 * @module collections/base
 *
 * @description
 * Provides the foundational collection interface that all specialized collections
 * extend. Uses Durable Object SQLite storage for persistence.
 *
 * @example
 * ```typescript
 * class CustomerCollection extends BaseCollection<Customer> {
 *   constructor(ctx: DurableObjectState) {
 *     super(ctx, 'customers', 'cust')
 *   }
 * }
 *
 * const customers = new CustomerCollection(ctx)
 * const customer = await customers.create({ name: 'Acme' })
 * ```
 */

import type {
  CollectionMethods,
  ListOptions,
  ListResult,
  FilterExpression,
  FilterOp,
} from '../../types/collections'

/**
 * Base entity interface that all collection entities must extend.
 *
 * @description
 * Defines the common fields that BaseCollection manages automatically:
 * - id: Unique identifier generated on create
 * - createdAt: Timestamp when entity was created
 * - updatedAt: Timestamp when entity was last modified
 */
export interface BaseEntity {
  id: string
  createdAt?: number
  updatedAt?: number
}

/**
 * Storage interface for Durable Object state
 *
 * @description
 * Abstracts the DO storage layer to enable testing with mocks.
 * In production, this wraps ctx.storage from Cloudflare Workers.
 */
export interface DOStorage {
  /**
   * Execute a SQL query against the DO SQLite database
   *
   * @param query - SQL query string with ? placeholders
   * @param params - Parameter values for placeholders
   * @returns Query results
   */
  sql<T = unknown>(query: string, ...params: unknown[]): Promise<T[]>

  /**
   * Get a value by key from the storage
   *
   * @param key - Storage key
   * @returns The stored value or undefined
   */
  get<T = unknown>(key: string): Promise<T | undefined>

  /**
   * Store a value by key
   *
   * @param key - Storage key
   * @param value - Value to store
   */
  put<T = unknown>(key: string, value: T): Promise<void>

  /**
   * Delete a value by key
   *
   * @param key - Storage key
   * @returns True if the key existed
   */
  delete(key: string): Promise<boolean>

  /**
   * List keys with optional prefix filtering
   *
   * @param options - List options including prefix and limit
   * @returns Map of key-value pairs
   */
  list<T = unknown>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>>
}

/**
 * Configuration options for BaseCollection
 */
export interface CollectionConfig {
  /**
   * Name of the collection (used as table name)
   */
  name: string

  /**
   * Prefix for generated IDs (e.g., 'cust' -> 'cust_abc123')
   */
  idPrefix: string

  /**
   * Default page size for list operations
   * @default 50
   */
  defaultLimit?: number

  /**
   * Maximum page size allowed
   * @default 1000
   */
  maxLimit?: number
}

/**
 * Base collection class providing generic CRUD operations
 *
 * @description
 * All DO collections extend this class to inherit standard CRUD operations,
 * filtering, pagination, and storage abstraction. The class is generic over
 * the entity type T, which must have an 'id' field.
 *
 * @typeParam T - Entity type with required 'id' field
 *
 * @example
 * ```typescript
 * interface Product {
 *   id: string
 *   name: string
 *   price: number
 *   createdAt: number
 *   updatedAt: number
 * }
 *
 * class ProductCollection extends BaseCollection<Product> {
 *   constructor(storage: DOStorage) {
 *     super(storage, { name: 'products', idPrefix: 'prod' })
 *   }
 *
 *   // Add domain-specific methods
 *   async findByPriceRange(min: number, max: number): Promise<Product[]> {
 *     return this.find({
 *       and: [
 *         { field: 'price', op: 'gte', value: min },
 *         { field: 'price', op: 'lte', value: max }
 *       ]
 *     })
 *   }
 * }
 * ```
 */
export abstract class BaseCollection<T extends BaseEntity>
  implements CollectionMethods<T>
{
  /**
   * DO storage interface
   */
  protected readonly storage: DOStorage

  /**
   * Collection configuration
   */
  protected readonly config: Required<CollectionConfig>

  /**
   * Create a new BaseCollection instance
   *
   * @param storage - DO storage interface
   * @param config - Collection configuration
   */
  constructor(storage: DOStorage, config: CollectionConfig) {
    this.storage = storage
    this.config = {
      defaultLimit: 50,
      maxLimit: 1000,
      ...config,
    }
  }

  /**
   * Generate a unique ID for a new entity
   *
   * @returns A unique ID in format '{prefix}_{nanoid}'
   *
   * @example
   * ```typescript
   * const id = this.generateId() // 'cust_V1StGXR8_Z5jdHi6B-myT'
   * ```
   */
  protected generateId(): string {
    // TODO: Implement nanoid generation
    const random = Math.random().toString(36).substring(2, 15)
    return `${this.config.idPrefix}_${random}`
  }

  /**
   * Get current timestamp in Unix milliseconds
   *
   * @returns Current time as Unix timestamp (ms)
   */
  protected now(): number {
    return Date.now()
  }

  /**
   * Initialize the collection's database table if it doesn't exist
   *
   * @description
   * Called automatically on first access. Creates the SQLite table
   * with appropriate schema for the entity type.
   */
  protected abstract initializeTable(): Promise<void>

  /**
   * List entities with pagination and filtering
   *
   * @param options - List options including limit, offset, cursor, ordering, and filter
   * @returns Paginated list result with items and metadata
   *
   * @example
   * ```typescript
   * // Simple pagination
   * const page1 = await collection.list({ limit: 10 })
   * const page2 = await collection.list({ limit: 10, cursor: page1.cursor })
   *
   * // With filtering
   * const active = await collection.list({
   *   filter: { field: 'status', op: 'eq', value: 'active' },
   *   orderBy: 'createdAt',
   *   orderDir: 'desc'
   * })
   * ```
   */
  async list(options: ListOptions = {}): Promise<ListResult<T>> {
    const limit = Math.min(options.limit ?? this.config.defaultLimit, this.config.maxLimit)
    const offset = options.offset ?? 0

    // Get all items from storage
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<T>({ prefix })

    // Convert to array
    let items = Array.from(allItems.values())

    // Apply filtering
    if (options.filter) {
      items = items.filter(item => this.matchesFilter(item, options.filter!))
    }

    const total = items.length

    // Apply ordering
    if (options.orderBy) {
      const dir = options.orderDir === 'desc' ? -1 : 1
      items.sort((a, b) => {
        const aVal = (a as Record<string, unknown>)[options.orderBy!]
        const bVal = (b as Record<string, unknown>)[options.orderBy!]
        if (aVal === bVal) return 0
        if (aVal === undefined || aVal === null) return dir
        if (bVal === undefined || bVal === null) return -dir
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return aVal.localeCompare(bVal) * dir
        }
        return aVal < bVal ? -dir : dir
      })
    }

    // Handle cursor-based pagination
    let startIndex = offset
    if (options.cursor) {
      const cursorIndex = items.findIndex(item => item.id === options.cursor)
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1
      }
    }

    // Apply pagination
    const paginatedItems = items.slice(startIndex, startIndex + limit)
    const hasMore = startIndex + limit < items.length

    // Generate cursor for next page
    const cursor = paginatedItems.length > 0 ? paginatedItems[paginatedItems.length - 1].id : undefined

    return {
      items: paginatedItems,
      total,
      cursor,
      hasMore,
    }
  }

  /**
   * Get a single entity by ID
   *
   * @param id - Entity ID
   * @returns The entity or null if not found
   *
   * @example
   * ```typescript
   * const customer = await customers.get('cust_abc123')
   * if (customer) {
   *   console.log(customer.name)
   * }
   * ```
   */
  async get(id: string): Promise<T | null> {
    if (!id) return null
    const key = `${this.config.name}:${id}`
    const entity = await this.storage.get<T>(key)
    return entity ?? null
  }

  /**
   * Create a new entity
   *
   * @param data - Entity data without ID (ID is auto-generated)
   * @returns The created entity with generated ID and timestamps
   *
   * @throws {Error} If creation fails due to validation or storage error
   *
   * @example
   * ```typescript
   * const customer = await customers.create({
   *   name: 'Acme Corp',
   *   email: 'contact@acme.com'
   * })
   * console.log(customer.id) // 'cust_abc123'
   * ```
   */
  async create(data: Omit<T, 'id'>): Promise<T> {
    if (data === null || data === undefined) {
      throw new ValidationError('Data cannot be null or undefined')
    }

    const id = this.generateId()
    const timestamp = this.now()

    // Type assertion is needed because TypeScript cannot prove that
    // Omit<T, 'id'> & BaseEntity equals T, even though it does for our use case
    const entity = {
      ...data,
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
    } as T

    const key = `${this.config.name}:${id}`
    await this.storage.put(key, entity)

    return entity
  }

  /**
   * Update an existing entity
   *
   * @param id - Entity ID
   * @param data - Partial entity data to merge
   * @returns The updated entity
   *
   * @throws {Error} If entity not found or update fails
   *
   * @example
   * ```typescript
   * const updated = await customers.update('cust_abc123', {
   *   email: 'new@acme.com'
   * })
   * ```
   */
  async update(id: string, data: Partial<T>): Promise<T> {
    const existing = await this.get(id)
    if (!existing) {
      throw new NotFoundError(this.config.name, id)
    }

    // Merge data but preserve id and update timestamp
    const updated = {
      ...existing,
      ...data,
      id: existing.id, // Preserve original ID
      updatedAt: this.now(),
    } as T

    const key = `${this.config.name}:${id}`
    await this.storage.put(key, updated)

    return updated
  }

  /**
   * Delete an entity by ID
   *
   * @param id - Entity ID
   *
   * @example
   * ```typescript
   * await customers.delete('cust_abc123')
   * ```
   */
  async delete(id: string): Promise<void> {
    const key = `${this.config.name}:${id}`
    await this.storage.delete(key)
  }

  /**
   * Count entities matching a filter
   *
   * @param filter - Optional filter expression
   * @returns Count of matching entities
   *
   * @example
   * ```typescript
   * const total = await customers.count()
   * const active = await customers.count({
   *   field: 'status', op: 'eq', value: 'active'
   * })
   * ```
   */
  async count(filter?: FilterExpression): Promise<number> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<T>({ prefix })

    if (!filter) {
      return allItems.size
    }

    let count = 0
    for (const item of allItems.values()) {
      if (this.matchesFilter(item, filter)) {
        count++
      }
    }
    return count
  }

  /**
   * Find entities matching a filter
   *
   * @param filter - Filter expression
   * @returns Array of matching entities
   *
   * @example
   * ```typescript
   * const highValue = await customers.find({
   *   and: [
   *     { field: 'totalSpent', op: 'gte', value: 10000 },
   *     { field: 'status', op: 'eq', value: 'active' }
   *   ]
   * })
   * ```
   */
  async find(filter: FilterExpression): Promise<T[]> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<T>({ prefix })

    const results: T[] = []
    for (const item of allItems.values()) {
      if (this.matchesFilter(item, filter)) {
        results.push(item)
      }
    }
    return results
  }

  /**
   * Check if an entity matches a filter expression
   *
   * @param entity - The entity to check
   * @param filter - The filter expression
   * @returns True if the entity matches the filter
   *
   * @internal
   */
  protected matchesFilter(entity: T, filter: FilterExpression): boolean {
    // Handle AND conditions
    if ('and' in filter) {
      return filter.and.every(f => this.matchesFilter(entity, f))
    }

    // Handle OR conditions
    if ('or' in filter) {
      return filter.or.some(f => this.matchesFilter(entity, f))
    }

    // Handle NOT conditions
    if ('not' in filter) {
      return !this.matchesFilter(entity, filter.not)
    }

    // Handle field conditions
    const { field, op, value } = filter as { field: string; op: FilterOp; value: unknown }
    const entityValue = (entity as Record<string, unknown>)[field]

    switch (op) {
      case 'eq':
        return entityValue === value
      case 'ne':
        return entityValue !== value
      case 'gt':
        return (entityValue as number) > (value as number)
      case 'gte':
        return (entityValue as number) >= (value as number)
      case 'lt':
        return (entityValue as number) < (value as number)
      case 'lte':
        return (entityValue as number) <= (value as number)
      case 'in':
        return (value as unknown[]).includes(entityValue)
      case 'nin':
        return !(value as unknown[]).includes(entityValue)
      case 'contains':
        return typeof entityValue === 'string' && entityValue.includes(value as string)
      case 'startsWith':
        return typeof entityValue === 'string' && entityValue.startsWith(value as string)
      case 'endsWith':
        return typeof entityValue === 'string' && entityValue.endsWith(value as string)
      default:
        return false
    }
  }

  /**
   * Build SQL WHERE clause from filter expression
   *
   * @param filter - Filter expression
   * @returns Object with SQL clause and parameter values
   *
   * @internal
   */
  protected buildWhereClause(filter: FilterExpression): {
    sql: string
    params: unknown[]
  } {
    // Handle AND conditions
    if ('and' in filter) {
      const clauses = filter.and.map(f => this.buildWhereClause(f))
      return {
        sql: `(${clauses.map(c => c.sql).join(' AND ')})`,
        params: clauses.flatMap(c => c.params),
      }
    }

    // Handle OR conditions
    if ('or' in filter) {
      const clauses = filter.or.map(f => this.buildWhereClause(f))
      return {
        sql: `(${clauses.map(c => c.sql).join(' OR ')})`,
        params: clauses.flatMap(c => c.params),
      }
    }

    // Handle NOT conditions
    if ('not' in filter) {
      const clause = this.buildWhereClause(filter.not)
      return {
        sql: `NOT (${clause.sql})`,
        params: clause.params,
      }
    }

    // Handle field conditions
    const { field, op, value } = filter as { field: string; op: FilterOp; value: unknown }
    const sqlOp = this.operatorToSql(op)

    switch (op) {
      case 'in':
      case 'nin': {
        const values = value as unknown[]
        const placeholders = values.map(() => '?').join(', ')
        return {
          sql: `${field} ${sqlOp} (${placeholders})`,
          params: values,
        }
      }
      case 'contains':
        return {
          sql: `${field} ${sqlOp} ?`,
          params: [`%${value}%`],
        }
      case 'startsWith':
        return {
          sql: `${field} ${sqlOp} ?`,
          params: [`${value}%`],
        }
      case 'endsWith':
        return {
          sql: `${field} ${sqlOp} ?`,
          params: [`%${value}`],
        }
      default:
        return {
          sql: `${field} ${sqlOp} ?`,
          params: [value],
        }
    }
  }

  /**
   * Convert filter operator to SQL operator
   *
   * @param op - Filter operator
   * @returns SQL operator string
   *
   * @internal
   */
  protected operatorToSql(op: FilterOp): string {
    const opMap: Record<FilterOp, string> = {
      eq: '=',
      ne: '!=',
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<=',
      in: 'IN',
      nin: 'NOT IN',
      contains: 'LIKE',
      startsWith: 'LIKE',
      endsWith: 'LIKE',
    }
    return opMap[op]
  }
}

/**
 * Collection error types
 */
export class CollectionError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'VALIDATION' | 'STORAGE' | 'CONFLICT',
    public readonly entityId?: string
  ) {
    super(message)
    this.name = 'CollectionError'
  }
}

/**
 * Entity not found error
 */
export class NotFoundError extends CollectionError {
  constructor(collection: string, id: string) {
    super(`${collection} with id '${id}' not found`, 'NOT_FOUND', id)
    this.name = 'NotFoundError'
  }
}

/**
 * Validation error
 */
export class ValidationError extends CollectionError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION')
    this.name = 'ValidationError'
  }
}

export default BaseCollection
