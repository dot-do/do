/**
 * @dotdo/do - AI Generator Module
 *
 * Provides AI-assisted generation of data based on schema definitions.
 * Supports pluggable providers and cascade generation for related entities.
 */

import {
  BaseType,
  StringType,
  NumberType,
  BooleanType,
  ArrayType,
  ObjectType,
  SchemaType,
  RefType,
  AIMetadata,
} from './types'

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Options for AI generation.
 */
export interface GenerateOptions {
  /** Type of the schema field */
  type?: string
  /** Field name being generated */
  fieldName?: string
  /** AI hints from the schema */
  hints?: AIMetadata
  /** Additional context for generation */
  context?: Record<string, unknown>
}

/**
 * A pluggable AI provider for generating content.
 */
export interface GeneratorProvider {
  /** Provider name */
  name: string
  /** Generate content based on a prompt and options */
  generate(prompt: string, options?: GenerateOptions): Promise<string>
}

/**
 * Options for cascade generation.
 */
export interface CascadeOptions {
  /** Maximum depth of nested generation (default: 3) */
  maxDepth?: number
  /** Additional context for generation */
  context?: Record<string, unknown>
}

/**
 * Information about a cascade field.
 */
export interface CascadeField {
  /** Field name */
  field: string
  /** Referenced type name */
  type: string
  /** Whether it's an array of references */
  isArray: boolean
  /** Number of items to generate for arrays */
  count?: number
}

/**
 * Result of cascade generation.
 */
export interface CascadeResult {
  /** The parent entity */
  parent: Record<string, unknown>
  /** Child entities grouped by type */
  children: Record<string, Record<string, unknown>[]>
  /** All generated entities in a flat array */
  all: Record<string, unknown>[]
}

/**
 * AI Generator interface.
 */
export interface AIGenerator {
  /** Generate a value based on schema */
  generate<T>(schema: BaseType<T>, options?: GenerateOptions): Promise<T>
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets the type string for a BaseType.
 */
function getTypeString(type: BaseType<unknown>): string {
  if (type instanceof StringType) return 'string'
  if (type instanceof NumberType) return 'number'
  if (type instanceof BooleanType) return 'boolean'
  if (type instanceof ArrayType) return 'array'
  if (type instanceof RefType) return 'ref'
  if (type instanceof ObjectType || type instanceof SchemaType) return 'object'
  return 'unknown'
}

/**
 * Gets the item type from an ArrayType.
 */
function getArrayItemType(type: ArrayType<unknown>): BaseType<unknown> | undefined {
  // Access the private itemType field
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (type as any).itemType
}

/**
 * Gets the shape from an ObjectType or SchemaType.
 */
function getShape(type: BaseType<unknown>): Record<string, BaseType<unknown>> | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (type as any).shape
}

/**
 * Builds a generation prompt from schema hints.
 */
function buildPrompt(fieldName: string, typeStr: string, hints?: AIMetadata): string {
  const parts: string[] = []

  if (hints?.prompt) {
    parts.push(hints.prompt)
  } else {
    parts.push(`Generate a ${typeStr} value`)
    if (fieldName) {
      parts.push(`for the field "${fieldName}"`)
    }
  }

  if (hints?.description) {
    parts.push(`Description: ${hints.description}`)
  }

  if (hints?.examples && hints.examples.length > 0) {
    parts.push(`Examples: ${hints.examples.join(', ')}`)
  }

  if (hints?.format) {
    parts.push(`Format: ${hints.format}`)
  }

  if (typeStr === 'string') {
    if (hints?.maxLength) {
      parts.push(`Maximum length: ${hints.maxLength} characters`)
    }
    if (hints?.minLength) {
      parts.push(`Minimum length: ${hints.minLength} characters`)
    }
  }

  if (typeStr === 'number') {
    if (hints?.min !== undefined) {
      parts.push(`Minimum value: ${hints.min}`)
    }
    if (hints?.max !== undefined) {
      parts.push(`Maximum value: ${hints.max}`)
    }
  }

  if (typeStr === 'array' && hints?.count) {
    parts.push(`Generate ${hints.count} items`)
  }

  return parts.join('. ')
}

/**
 * Generates a unique ID.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

// =============================================================================
// AI Generator Implementation
// =============================================================================

/**
 * Creates an AI generator with the given provider.
 */
export function createAIGenerator(provider: GeneratorProvider): AIGenerator {
  return {
    async generate<T>(schema: BaseType<T>, options?: GenerateOptions): Promise<T> {
      const typeStr = getTypeString(schema)
      const hints = schema.getAIHints()

      // For objects/schemas, generate each field
      if (typeStr === 'object') {
        const shape = getShape(schema)
        if (!shape) {
          return {} as T
        }

        const result: Record<string, unknown> = {}

        for (const [fieldName, fieldSchema] of Object.entries(shape)) {
          const fieldHints = fieldSchema.getAIHints()

          // Only generate fields with generate: true
          if (!fieldHints?.generate) {
            continue
          }

          const fieldType = getTypeString(fieldSchema)
          const prompt = buildPrompt(fieldName, fieldType, fieldHints)

          const generated = await provider.generate(prompt, {
            type: fieldType,
            fieldName,
            hints: fieldHints,
            context: options?.context,
          })

          // Parse and convert the generated value
          result[fieldName] = parseGeneratedValue(generated, fieldType, fieldHints)
        }

        return result as T
      }

      // For non-object types
      const prompt = buildPrompt(options?.fieldName || '', typeStr, hints)
      const generated = await provider.generate(prompt, {
        type: typeStr,
        fieldName: options?.fieldName,
        hints,
        context: options?.context,
      })

      return parseGeneratedValue(generated, typeStr, hints) as T
    },
  }
}

/**
 * Parses a generated string value into the appropriate type.
 */
function parseGeneratedValue(
  value: string,
  typeStr: string,
  hints?: AIMetadata
): unknown {
  switch (typeStr) {
    case 'number': {
      const num = parseFloat(value)
      return isNaN(num) ? 0 : num
    }
    case 'boolean':
      return value.toLowerCase() === 'true'
    case 'array': {
      try {
        const arr = JSON.parse(value)
        if (Array.isArray(arr)) {
          // Respect count hint
          if (hints?.count && arr.length > hints.count) {
            return arr.slice(0, hints.count)
          }
          return arr
        }
      } catch {
        // If parsing fails, return empty array
      }
      return []
    }
    case 'string':
    default: {
      // Respect maxLength hint
      if (hints?.maxLength && value.length > hints.maxLength) {
        return value.slice(0, hints.maxLength)
      }
      return value
    }
  }
}

// =============================================================================
// Cascade Generation
// =============================================================================

/**
 * Detects cascade fields in a schema.
 * Cascade fields are references (single or array) with cascade: true in AI hints.
 */
export function getCascadeFields(schema: BaseType<unknown>): CascadeField[] {
  const shape = getShape(schema)
  if (!shape) {
    return []
  }

  const cascadeFields: CascadeField[] = []

  for (const [fieldName, fieldSchema] of Object.entries(shape)) {
    const hints = fieldSchema.getAIHints()

    // Skip fields without cascade: true
    if (!hints?.cascade) {
      continue
    }

    // Check if it's an array of refs
    if (fieldSchema instanceof ArrayType) {
      const itemType = getArrayItemType(fieldSchema)
      if (itemType instanceof RefType) {
        cascadeFields.push({
          field: fieldName,
          type: itemType.getTypeName(),
          isArray: true,
          count: hints.count,
        })
      }
    }

    // Check if it's a single ref
    if (fieldSchema instanceof RefType) {
      cascadeFields.push({
        field: fieldName,
        type: fieldSchema.getTypeName(),
        isArray: false,
      })
    }
  }

  return cascadeFields
}

/**
 * Generates an entity and its cascade children.
 */
export async function generateCascade(
  generator: AIGenerator,
  schemas: Record<string, BaseType<unknown>>,
  typeName: string,
  options?: CascadeOptions
): Promise<CascadeResult> {
  const maxDepth = options?.maxDepth ?? 3
  const context = options?.context ?? {}

  const all: Record<string, unknown>[] = []
  const children: Record<string, Record<string, unknown>[]> = {}

  // Generate the parent entity
  const parentSchema = schemas[typeName]
  if (!parentSchema) {
    throw new Error(`Schema not found for type: ${typeName}`)
  }

  const parent = (await generator.generate(parentSchema, { context })) as Record<string, unknown>
  parent.$id = generateId()
  parent.$type = typeName
  all.push(parent)

  // If we're at max depth, don't generate children
  if (maxDepth <= 1) {
    return { parent, children, all }
  }

  // Find cascade fields and generate children
  const cascadeFields = getCascadeFields(parentSchema)

  for (const cascadeField of cascadeFields) {
    const childSchema = schemas[cascadeField.type]
    if (!childSchema) {
      continue
    }

    const childCount = cascadeField.isArray ? (cascadeField.count ?? 1) : 1

    if (!children[cascadeField.type]) {
      children[cascadeField.type] = []
    }

    for (let i = 0; i < childCount; i++) {
      // Recursively generate child and its descendants
      const childResult = await generateCascade(generator, schemas, cascadeField.type, {
        maxDepth: maxDepth - 1,
        context,
      })

      // Add parent reference to child
      childResult.parent.$parentRef = parent.$id as string

      // Add to children collection
      children[cascadeField.type].push(childResult.parent)

      // Merge grandchildren
      for (const [grandchildType, grandchildren] of Object.entries(childResult.children)) {
        if (!children[grandchildType]) {
          children[grandchildType] = []
        }
        children[grandchildType].push(...grandchildren)
      }

      // Add all descendants to the flat array
      all.push(...childResult.all)
    }
  }

  return { parent, children, all }
}
