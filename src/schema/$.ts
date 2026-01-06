/**
 * @dotdo/do - Schema Builder ($)
 *
 * The main entry point for creating schema validators.
 * Similar to Zod's z.* pattern, using $ for brevity.
 */

import { StringType, NumberType, BooleanType, DateType, RefType, ArrayType, ObjectType, SchemaType, BaseType } from './types'

/**
 * Schema builder object.
 * Use this to create type validators.
 *
 * @example
 * ```typescript
 * const stringSchema = $.string()
 * const result = stringSchema.validate('hello')
 * // { success: true, data: 'hello' }
 *
 * const numberSchema = $.number()
 * const numResult = numberSchema.validate(42)
 * // { success: true, data: 42 }
 *
 * const boolSchema = $.boolean()
 * const boolResult = boolSchema.validate(true)
 * // { success: true, data: true }
 *
 * const dateSchema = $.date()
 * const dateResult = dateSchema.validate('2024-01-15')
 * // { success: true, data: Date }
 * ```
 */
export const $ = {
  /**
   * Creates a string validator.
   * @returns A StringType validator instance
   */
  string: () => new StringType(),

  /**
   * Creates a number validator.
   * Validates numeric values, rejecting NaN but accepting Infinity.
   * @returns A NumberType validator instance
   */
  number: () => new NumberType(),

  /**
   * Creates a boolean validator.
   * Validates true/false values only, no coercion.
   * @returns A BooleanType validator instance
   */
  boolean: () => new BooleanType(),

  /**
   * Creates a date validator.
   * Validates Date objects and coerces ISO date strings.
   * @returns A DateType validator instance
   */
  date: () => new DateType(),

  /**
   * Creates a reference validator.
   * Validates objects with a $ref property pointing to another resource.
   * Supports exact (strict) and fuzzy (loose) matching modes.
   *
   * @param typeName - The name of the referenced type (e.g., 'User', 'Document')
   * @returns A RefType validator instance
   *
   * @example
   * ```typescript
   * const userRef = $.ref('User')
   * userRef.validate({ $ref: 'https://example.com/user/123' })
   * // { success: true, data: { $ref: '...' } }
   *
   * // Fuzzy mode allows additional properties
   * $.ref('User').fuzzy().validate({ $ref: '...', hint: 'metadata' })
   * ```
   */
  ref: (typeName: string) => new RefType(typeName),

  /**
   * Creates an array validator.
   * Validates arrays where each item matches the provided schema.
   *
   * @typeParam T - The type of items in the array
   * @param itemType - The schema for validating array items
   * @returns An ArrayType validator instance
   *
   * @example
   * ```typescript
   * const stringArray = $.array($.string())
   * stringArray.validate(['a', 'b', 'c'])
   * // { success: true, data: ['a', 'b', 'c'] }
   *
   * stringArray.validate([1, 2, 3])
   * // { success: false, errors: [...] }
   * ```
   */
  array: <T>(itemType: BaseType<T>) => new ArrayType(itemType),

  /**
   * Creates an object validator.
   * Validates objects matching the provided shape schema.
   * Unknown properties are stripped from the output.
   *
   * @typeParam T - The shape of the object
   * @param shape - An object mapping property names to their schemas
   * @returns An ObjectType validator instance
   *
   * @example
   * ```typescript
   * const userSchema = $.object({
   *   name: $.string(),
   *   age: $.number()
   * })
   * userSchema.validate({ name: 'John', age: 30 })
   * // { success: true, data: { name: 'John', age: 30 } }
   * ```
   */
  object: <T extends Record<string, unknown>>(shape: { [K in keyof T]: BaseType<T[K]> }) =>
    new ObjectType(shape),

  /**
   * Creates a schema validator with fluent builder API.
   * Supports methods like strict(), passthrough(), partial(), pick(), omit(),
   * extend(), merge(), and required() for composing schemas.
   *
   * @typeParam T - The shape of the object
   * @param shape - An object mapping property names to their schemas
   * @returns A SchemaType validator instance with fluent API
   *
   * @example
   * ```typescript
   * const userSchema = $.schema({
   *   name: $.string(),
   *   email: $.string(),
   * })
   *
   * // Validate with all fields required
   * userSchema.validate({ name: 'John', email: 'john@example.com' })
   * // { success: true, data: { name: 'John', email: 'john@example.com' } }
   *
   * // Make all fields optional with partial()
   * userSchema.partial().validate({})
   * // { success: true, data: {} }
   *
   * // Reject extra properties with strict()
   * userSchema.strict().validate({ name: 'John', email: '...', extra: 'value' })
   * // { success: false, errors: [{ code: 'unrecognized_keys', ... }] }
   * ```
   */
  schema: <T extends Record<string, unknown>>(shape: { [K in keyof T]: BaseType<T[K]> }) =>
    new SchemaType(shape),
}
