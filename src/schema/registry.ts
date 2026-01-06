/**
 * @dotdo/do - Schema Registry
 *
 * Central registry for collection schemas.
 * Used to validate documents before insertion and export JSON schemas.
 */

import type { JSONSchema, SchemaType, ValidationResult } from './types'

/**
 * Schema Registry for managing collection schemas.
 *
 * Provides:
 * - Schema registration per collection
 * - Validation against registered schemas
 * - JSON Schema export
 *
 * @example
 * ```typescript
 * const registry = new SchemaRegistry()
 *
 * // Register schema for 'users' collection
 * registry.register('users', $.schema({
 *   name: $.string(),
 *   email: $.string(),
 *   age: $.number().optional()
 * }))
 *
 * // Validate before insert
 * const result = registry.validate('users', { name: 'John', email: 'john@example.com' })
 * if (!result.success) {
 *   throw new Error(result.errors[0].message)
 * }
 *
 * // Export JSON schema for documentation
 * const jsonSchema = registry.toJSONSchema('users')
 * ```
 */
export class SchemaRegistry {
  private schemas: Map<string, SchemaType<Record<string, unknown>>> = new Map()

  /**
   * Register a schema for a collection.
   *
   * @param collection - The collection name
   * @param schema - The schema to register
   */
  register<T extends Record<string, unknown>>(collection: string, schema: SchemaType<T>): void {
    this.schemas.set(collection, schema as SchemaType<Record<string, unknown>>)
  }

  /**
   * Get the schema for a collection.
   *
   * @param collection - The collection name
   * @returns The schema, or undefined if not registered
   */
  get<T extends Record<string, unknown>>(collection: string): SchemaType<T> | undefined {
    return this.schemas.get(collection) as SchemaType<T> | undefined
  }

  /**
   * Check if a collection has a registered schema.
   *
   * @param collection - The collection name
   * @returns true if a schema is registered
   */
  has(collection: string): boolean {
    return this.schemas.has(collection)
  }

  /**
   * List all registered collection names.
   *
   * @returns Array of collection names
   */
  listCollections(): string[] {
    return Array.from(this.schemas.keys())
  }

  /**
   * Validate data against the schema for a collection.
   *
   * If no schema is registered for the collection, validation always passes.
   *
   * @param collection - The collection name
   * @param data - The data to validate
   * @returns Validation result with success status, data, and errors
   */
  validate<T extends Record<string, unknown>>(
    collection: string,
    data: unknown
  ): ValidationResult<T> {
    const schema = this.schemas.get(collection)

    // No schema registered - pass through
    if (!schema) {
      return { success: true, data: data as T }
    }

    return schema.validate(data) as ValidationResult<T>
  }

  /**
   * Export the JSON Schema for a collection.
   *
   * @param collection - The collection name
   * @returns The JSON Schema, or undefined if not registered
   */
  toJSONSchema(collection: string): JSONSchema | undefined {
    const schema = this.schemas.get(collection)
    if (!schema) {
      return undefined
    }
    return schema.toJSONSchema()
  }

  /**
   * Export all schemas as JSON Schemas.
   *
   * @returns Object mapping collection names to JSON Schemas
   */
  toJSONSchemas(): Record<string, JSONSchema> {
    const result: Record<string, JSONSchema> = {}
    for (const [collection, schema] of this.schemas.entries()) {
      result[collection] = schema.toJSONSchema()
    }
    return result
  }

  /**
   * Remove a schema registration.
   *
   * @param collection - The collection name
   * @returns true if a schema was removed
   */
  unregister(collection: string): boolean {
    return this.schemas.delete(collection)
  }

  /**
   * Clear all registered schemas.
   */
  clear(): void {
    this.schemas.clear()
  }
}

/**
 * Default global schema registry instance.
 * Used by DO classes when no custom registry is provided.
 */
export const defaultRegistry = new SchemaRegistry()
