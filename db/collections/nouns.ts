/**
 * Noun Collection - Entity type registry for Digital Objects
 *
 * @module collections/nouns
 *
 * @description
 * Manages the registration and lookup of Nouns (entity types) within a Digital Object.
 * Nouns define the schema and linguistic forms for entity types following the
 * linguistic pattern from digital-objects.
 *
 * @example
 * ```typescript
 * const nouns = new NounCollection(storage)
 *
 * // Register a noun
 * const customerNoun = await nouns.create({
 *   name: 'Customer',
 *   singular: 'customer',
 *   plural: 'customers',
 *   slug: 'customer',
 *   schema: {
 *     name: 'string',
 *     email: 'string',
 *     company: '~>Company'
 *   }
 * })
 *
 * // Look up by slug
 * const noun = await nouns.getBySlug('customer')
 * ```
 */

import type { Noun } from '../../types/collections'
import { BaseCollection, DOStorage, NotFoundError, ValidationError } from './base'

/**
 * Options for creating a noun
 */
export interface CreateNounOptions {
  /**
   * Noun name (display name)
   */
  name: string

  /**
   * Singular form for display
   * @example 'customer'
   */
  singular: string

  /**
   * Plural form for display
   * @example 'customers'
   */
  plural: string

  /**
   * URL-safe slug for routing
   * @example 'customer'
   */
  slug: string

  /**
   * Optional JSON Schema for validating Thing instances
   */
  schema?: Record<string, unknown>

  /**
   * Human-readable description
   */
  description?: string
}

/**
 * Noun collection for managing entity type definitions
 *
 * @description
 * The NounCollection provides methods for registering, looking up, and managing
 * entity types. Each noun defines:
 *
 * - Linguistic forms (singular, plural, slug)
 * - Optional schema for validation
 * - Description for documentation
 *
 * Nouns are referenced by Things via the `$type` field and enable:
 * - Type validation
 * - Dynamic routing (e.g., `/customers/:id`)
 * - Schema-driven UI generation
 * - API documentation
 *
 * @example
 * ```typescript
 * // Define multiple nouns
 * const nouns = new NounCollection(storage)
 *
 * await nouns.create({
 *   name: 'Customer',
 *   singular: 'customer',
 *   plural: 'customers',
 *   slug: 'customer',
 *   schema: {
 *     name: { type: 'string', required: true },
 *     email: { type: 'string', format: 'email' },
 *     company: '~>Company'  // Relation field
 *   },
 *   description: 'A customer entity representing a business client'
 * })
 *
 * await nouns.create({
 *   name: 'Order',
 *   singular: 'order',
 *   plural: 'orders',
 *   slug: 'order',
 *   schema: {
 *     customer: '->Customer',
 *     items: ['->OrderItem'],
 *     total: { type: 'number', minimum: 0 }
 *   }
 * })
 * ```
 */
export class NounCollection extends BaseCollection<Noun> {
  /**
   * Create a new NounCollection instance
   *
   * @param storage - DO storage interface
   */
  constructor(storage: DOStorage) {
    super(storage, {
      name: 'nouns',
      idPrefix: 'noun',
    })
  }

  /**
   * Initialize the nouns table in SQLite
   *
   * @internal
   */
  protected async initializeTable(): Promise<void> {
    // TODO: Create nouns table with schema:
    // id TEXT PRIMARY KEY,
    // name TEXT NOT NULL,
    // singular TEXT NOT NULL,
    // plural TEXT NOT NULL,
    // slug TEXT UNIQUE NOT NULL,
    // schema TEXT, -- JSON
    // description TEXT,
    // createdAt INTEGER NOT NULL,
    // updatedAt INTEGER NOT NULL
    throw new Error('Not implemented')
  }

  /**
   * Create a new noun
   *
   * @param data - Noun creation options
   * @returns The created noun with generated ID
   *
   * @throws {ValidationError} If slug is invalid or already exists
   *
   * @example
   * ```typescript
   * const noun = await nouns.create({
   *   name: 'Product',
   *   singular: 'product',
   *   plural: 'products',
   *   slug: 'product'
   * })
   * ```
   */
  async create(data: Omit<Noun, 'id'>): Promise<Noun> {
    // TODO: Implement with:
    // 1. Validate slug format (lowercase, alphanumeric, hyphens)
    // 2. Check slug uniqueness
    // 3. Generate ID
    // 4. Store in SQLite
    throw new Error('Not implemented')
  }

  /**
   * Get a noun by its URL slug
   *
   * @param slug - The noun's slug
   * @returns The noun or null if not found
   *
   * @example
   * ```typescript
   * const customerNoun = await nouns.getBySlug('customer')
   * if (customerNoun) {
   *   console.log(customerNoun.schema)
   * }
   * ```
   */
  async getBySlug(slug: string): Promise<Noun | null> {
    // TODO: Query by slug
    throw new Error('Not implemented')
  }

  /**
   * Get a noun by its name (case-insensitive)
   *
   * @param name - The noun's name
   * @returns The noun or null if not found
   *
   * @example
   * ```typescript
   * const noun = await nouns.getByName('Customer')
   * ```
   */
  async getByName(name: string): Promise<Noun | null> {
    // TODO: Query by name with case-insensitive comparison
    throw new Error('Not implemented')
  }

  /**
   * Check if a slug is available
   *
   * @param slug - Slug to check
   * @returns True if slug is available
   *
   * @example
   * ```typescript
   * if (await nouns.isSlugAvailable('new-entity')) {
   *   await nouns.create({ ... })
   * }
   * ```
   */
  async isSlugAvailable(slug: string): Promise<boolean> {
    // TODO: Check for existing noun with slug
    throw new Error('Not implemented')
  }

  /**
   * Update a noun's schema
   *
   * @param id - Noun ID
   * @param schema - New schema definition
   * @returns Updated noun
   *
   * @throws {NotFoundError} If noun not found
   *
   * @example
   * ```typescript
   * await nouns.updateSchema('noun_abc', {
   *   name: 'string',
   *   email: 'string',
   *   phone: 'string?'  // Added optional field
   * })
   * ```
   */
  async updateSchema(id: string, schema: Record<string, unknown>): Promise<Noun> {
    // TODO: Update only the schema field
    throw new Error('Not implemented')
  }

  /**
   * Validate a slug format
   *
   * @param slug - Slug to validate
   * @returns True if valid
   *
   * @description
   * Valid slugs:
   * - Lowercase alphanumeric characters and hyphens
   * - Must start with a letter
   * - Must not end with a hyphen
   * - 1-64 characters
   *
   * @example
   * ```typescript
   * nouns.validateSlug('customer')      // true
   * nouns.validateSlug('customer-type') // true
   * nouns.validateSlug('Customer')      // false (uppercase)
   * nouns.validateSlug('123customer')   // false (starts with number)
   * ```
   */
  validateSlug(slug: string): boolean {
    // TODO: Implement slug validation regex
    const slugRegex = /^[a-z][a-z0-9-]{0,62}[a-z0-9]?$/
    return slugRegex.test(slug) && !slug.includes('--')
  }

  /**
   * Get all nouns that have schemas with relation fields
   *
   * @returns Nouns with cascade relation operators in their schemas
   *
   * @description
   * Useful for building relationship graphs and understanding
   * entity dependencies.
   *
   * @example
   * ```typescript
   * const relationalNouns = await nouns.getWithRelations()
   * for (const noun of relationalNouns) {
   *   console.log(`${noun.name} has relations:`, noun.schema)
   * }
   * ```
   */
  async getWithRelations(): Promise<Noun[]> {
    // TODO: Filter nouns where schema contains ->, ~>, <-, or <~
    throw new Error('Not implemented')
  }

  /**
   * Export all nouns as a schema registry
   *
   * @returns Map of slug to schema for all nouns
   *
   * @example
   * ```typescript
   * const registry = await nouns.exportRegistry()
   * // { customer: { name: 'string', ... }, order: { ... } }
   * ```
   */
  async exportRegistry(): Promise<Record<string, Record<string, unknown>>> {
    // TODO: Build slug -> schema map
    throw new Error('Not implemented')
  }
}

export default NounCollection
