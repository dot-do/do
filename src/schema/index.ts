/**
 * @dotdo/do - Schema Validation Module
 *
 * Type-safe schema validation system for runtime data validation.
 */

export { $ } from './$'
export { BaseType, StringType, NumberType, BooleanType, DateType, ArrayType, ObjectType, SchemaType, RefType } from './types'
export type {
  ValidationError,
  ValidationResult,
  AIMetadata,
  JSONSchema,
  ReferenceMode,
  ReferenceDirection,
  RefOperator,
  RefObject,
} from './types'

// Schema Registry
export { SchemaRegistry, defaultRegistry } from './registry'

// AI Generator
export { createAIGenerator, getCascadeFields, generateCascade } from './ai-generator'
export type { AIGenerator, GeneratorProvider, GenerateOptions, CascadeOptions, CascadeField, CascadeResult } from './ai-generator'
