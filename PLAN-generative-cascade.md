# Plan: Generative Functions & Cascading Generation

## Overview

Integrate two key capabilities from ai-functions and ai-database into DigitalObject:

1. **Generative Functions** - Functions with `tier: 'generative'` that use AI to generate content
2. **Cascading Generation** - Depth-limited recursive entity creation through relationships

## Current State

- `StoredFunction` already has `tier: 'code' | 'generative' | 'agentic' | 'human'`
- Functions execute via `ai-evaluate` service binding (V8 isolate sandbox)
- CDC events emit for function mutations (`Function.created`, `Function.executed`)
- Relationships exist with simple predicates (`from --[predicate]--> to`)

## Part 1: Generative Functions

### Problem

Currently all functions execute as code via ai-evaluate. Generative functions should:
- Treat the stored code as a **prompt template**
- Use AI to generate structured output based on the prompt
- Support template variables from function arguments
- Emit generation-specific CDC events

### Design

#### 1.1 Extend StoredFunction Interface

```typescript
export interface StoredFunction extends Record<string, unknown> {
  id: string
  name: string
  code: string  // For generative: prompt template
  version: number
  tier: 'code' | 'generative' | 'agentic' | 'human'

  // NEW: Generative function fields
  schema?: Record<string, unknown>  // Output schema (simplified syntax)
  model?: string                     // 'best' | 'fast' | 'cost' | 'reasoning'

  args?: Record<string, string>
  returns?: string
  description?: string
  createdAt: string
  updatedAt: string
}
```

#### 1.2 Add AI Service Binding

In `wrangler.jsonc`:
```jsonc
"services": [
  { "binding": "CTX", "service": "ctx" },
  { "binding": "EVAL", "service": "evaluate-do" },
  { "binding": "AI", "service": "ai-gateway" }  // NEW
]
```

#### 1.3 Generative Execution Path

In `core/src/functions.ts`:

```typescript
async function executeGenerative(fn: StoredFunction, args: unknown[]): Promise<unknown> {
  // 1. Template substitution
  const prompt = substituteTemplate(fn.code, args, fn.args)

  // 2. Schema conversion (simplified -> zod-compatible)
  const schema = fn.schema ? convertSchema(fn.schema) : undefined

  // 3. Call AI service
  const response = await aiService.generate({
    prompt,
    schema,
    model: fn.model || 'best',
  })

  // 4. Return structured result
  return response.value
}

function substituteTemplate(template: string, args: unknown[], argDefs?: Record<string, string>): string {
  // Replace {{argName}} with actual values
  // Convert objects to YAML for readability
  let result = template
  const argNames = Object.keys(argDefs || {})
  argNames.forEach((name, i) => {
    const value = args[i]
    const formatted = typeof value === 'object' ? toYaml(value) : String(value)
    result = result.replace(new RegExp(`{{${name}}}`, 'g'), formatted)
  })
  return result
}
```

#### 1.4 Simplified Schema Syntax

Following ai-functions pattern:
```typescript
// User provides:
const schema = {
  name: 'Product name',
  price: 'Price in dollars (number)',
  tags: ['List of tags'],
  category: 'electronics | clothing | food',
}

// Converts to generateObject-compatible schema
```

#### 1.5 CDC Events for Generation

```typescript
// Before generation
cdc.emit('Generation', 'started', {
  function: fn.name,
  version: fn.version,
  model: fn.model,
  args,
}, {
  subject_type: 'Function',
  predicate_type: 'generate',
})

// After success
cdc.emit('Generation', 'completed', {
  function: fn.name,
  version: fn.version,
  result,
  tokens: { input: inputTokens, output: outputTokens },
  duration,
}, {
  subject_type: 'Function',
  predicate_type: 'generate',
})

// On failure
cdc.emit('Generation', 'failed', {
  function: fn.name,
  version: fn.version,
  error: error.message,
  duration,
}, {
  subject_type: 'Function',
  predicate_type: 'generate',
})
```

### Implementation Tasks

1. **Red**: Write failing tests for generative function execution
2. **Green**: Implement generative execution path with template substitution
3. **Green**: Add AI service binding and integration
4. **Green**: Implement schema conversion
5. **Refactor**: Clean up and optimize

---

## Part 2: Cascading Generation

### Problem

When creating an entity that has relationships, we want to automatically generate related entities up to a configurable depth. This enables creating entire entity graphs in one operation.

### Design

#### 2.1 Cascade Operators

Extend relationships with cascade semantics:

| Operator | Direction | Match | Cascade Behavior |
|----------|-----------|-------|------------------|
| `->` | Forward | Exact | Create child entity |
| `~>` | Forward | Fuzzy | Search existing or create |
| `<-` | Backward | Exact | Aggregate (no cascade) |
| `<~` | Backward | Fuzzy | Ground to reference data |

#### 2.2 CascadeOptions Interface

```typescript
interface CascadeOptions {
  maxDepth?: number        // Default: 0 (no cascade)
  cascadeTypes?: string[]  // Filter which types to cascade
  stopOnError?: boolean    // Halt or continue on error
  onProgress?: (event: CascadeProgressEvent) => void
}

interface CascadeProgressEvent {
  phase: 'generating' | 'complete'
  depth: number
  currentType: string
  entityId: string
  totalCreated: number
}
```

#### 2.3 GenerationContext

Track state during cascade:

```typescript
interface GenerationContext {
  // Parent chain tracking
  parentStack: EntityRef[]
  pushParent(ref: EntityRef): void
  popParent(): void
  getParent(depth?: number): EntityRef | undefined
  getParentChain(): EntityRef[]

  // Generated entity accumulation
  generated: Map<string, unknown[]>  // type -> entities
  addGenerated(type: string, entity: unknown): void
  getByType(type: string): unknown[]

  // Array generation context
  arrayContext: Map<string, unknown[]>
  startArrayGeneration(field: string): void
  addToArray(field: string, item: unknown): void
  getPreviousInArray(field: string): unknown[]

  // Cascade state
  state: CascadeState
}

interface CascadeState {
  totalEntitiesCreated: number
  initialMaxDepth: number
  currentDepth: number
}
```

#### 2.4 Cascade-Aware Collection Methods

Extend `ChainableCollection`:

```typescript
class ChainableCollection<T> {
  // Existing methods...

  /**
   * Create entity with optional cascade generation
   */
  async create(data: Partial<T>, options?: CascadeOptions): Promise<T & { _cascaded?: unknown[] }> {
    // 1. Create the primary entity
    const entity = this.put(generateId(), data as T)

    if (!options?.maxDepth || options.maxDepth === 0) {
      return entity
    }

    // 2. Initialize cascade context
    const ctx = createGenerationContext({
      initialMaxDepth: options.maxDepth,
    })

    // 3. Process forward relationships
    const cascaded = await this.cascadeForward(entity, ctx, options)

    return { ...entity, _cascaded: cascaded }
  }

  private async cascadeForward(
    entity: T,
    ctx: GenerationContext,
    options: CascadeOptions
  ): Promise<unknown[]> {
    const cascaded: unknown[] = []

    // Get forward relationships for this entity type
    const forwardRels = this.getForwardRelationships(entity)

    for (const rel of forwardRels) {
      if (rel.operator === '->' || rel.operator === '~>') {
        // Generate related entity
        const related = await this.generateRelated(rel, entity, ctx, options)
        cascaded.push(related)

        // Recursively cascade if depth allows
        if (ctx.state.currentDepth < ctx.state.initialMaxDepth) {
          ctx.state.currentDepth++
          ctx.pushParent({ type: this.name!, id: entity.id })

          const childCascaded = await this.cascadeForward(related, ctx, options)
          cascaded.push(...childCascaded)

          ctx.popParent()
          ctx.state.currentDepth--
        }
      }
    }

    return cascaded
  }
}
```

#### 2.5 Relationship Schema Definition

Allow defining cascade relationships in collection schema:

```typescript
// Define collection with cascade relationships
const Blog = collection<BlogEntity>('blogs', {
  schema: {
    title: 'string',
    author: '->User',           // Forward exact: creates/links User
    topics: ['->Topic'],        // Forward exact array: creates Topics
    relatedPosts: ['~>Post'],   // Forward fuzzy: searches existing Posts
    comments: ['<-Comment'],    // Backward: aggregates Comments
  }
})
```

#### 2.6 CDC Events for Cascade

```typescript
// Cascade started
cdc.emit('Cascade', 'started', {
  rootType: collectionName,
  rootId: entity.id,
  maxDepth: options.maxDepth,
}, {
  subject_type: collectionName,
  predicate_type: 'cascade',
})

// Each step
cdc.emit('Cascade', 'stepCompleted', {
  depth: ctx.state.currentDepth,
  type: relatedType,
  entityId: related.id,
  parentId: ctx.getParent()?.id,
  totalCreated: ctx.state.totalEntitiesCreated,
}, {
  subject_type: relatedType,
  predicate_type: 'generate',
})

// Cascade completed
cdc.emit('Cascade', 'completed', {
  rootType: collectionName,
  rootId: entity.id,
  totalCreated: ctx.state.totalEntitiesCreated,
  duration,
}, {
  subject_type: collectionName,
  predicate_type: 'cascade',
})
```

#### 2.7 Generative Content in Cascade

When cascading generates new entities, use generative functions:

```typescript
async function generateRelated(
  rel: RelationshipDef,
  parent: unknown,
  ctx: GenerationContext,
  options: CascadeOptions
): Promise<unknown> {
  // Build context from parent chain
  const prompt = buildGenerationPrompt(rel, parent, ctx)

  // Use generative function to create content
  const generated = await $.generate({
    prompt,
    schema: rel.targetSchema,
    context: {
      parent: parent,
      parentChain: ctx.getParentChain(),
      previousSiblings: ctx.getPreviousInArray(rel.field),
    }
  })

  // Store in target collection
  const targetCollection = this.getCollection(rel.targetType)
  return targetCollection.put(generateId(), generated)
}
```

### Implementation Tasks

1. **Red**: Write failing tests for cascade relationships definition
2. **Red**: Write failing tests for single-level cascade
3. **Red**: Write failing tests for multi-level cascade with maxDepth
4. **Green**: Implement CascadeOptions and GenerationContext
5. **Green**: Implement cascade-aware create method
6. **Green**: Implement forward relationship detection and traversal
7. **Green**: Integrate with generative functions for content generation
8. **Green**: Add CDC events for cascade tracking
9. **Refactor**: Optimize and clean up

---

## Integration Points

### DigitalObject API

```typescript
class DigitalObject {
  // Existing...

  /**
   * Define a generative function
   */
  defineGenerative(
    name: string,
    prompt: string,
    options: {
      schema?: Record<string, unknown>
      model?: string
      args?: Record<string, string>
    }
  ): StoredFunction {
    return this._functionRegistry.defineFromCode(name, prompt, {
      tier: 'generative',
      ...options,
    })
  }

  /**
   * Create entity with cascade
   */
  async createWithCascade<T>(
    collection: string,
    data: Partial<T>,
    cascadeOptions?: CascadeOptions
  ): Promise<T & { _cascaded?: unknown[] }> {
    return this.collection<T>(collection).create(data, cascadeOptions)
  }
}
```

### Usage Examples

```typescript
// 1. Define a generative function
$.summarize = `Summarize the following text in {{style}} style:

{{text}}

Output a concise summary.`
$.summarize._schema = { summary: 'string', keyPoints: ['string'] }
$.summarize._tier = 'generative'

const result = await $.summarize({ text: article, style: 'bullet' })
// → { summary: '...', keyPoints: ['...', '...'] }

// 2. Create with cascade
const blog = await do.createWithCascade('blogs', {
  title: 'AI-First Development',
}, { maxDepth: 2 })
// Automatically generates:
// - Author (User)
// - Topics (Topic[])
// - Each Topic generates related content
```

---

## File Changes

| File | Change |
|------|--------|
| `core/src/functions.ts` | Add generative execution path, template substitution |
| `core/src/index.ts` | Add AI binding, defineGenerative method, createWithCascade |
| `core/src/cascade.ts` | NEW: CascadeOptions, GenerationContext, cascade logic |
| `core/src/schema.ts` | NEW: Simplified schema conversion |
| `wrangler.jsonc` | Add AI service binding |
| `tests/functions.test.ts` | Generative function tests |
| `tests/cascade.test.ts` | Cascade generation tests |

---

## Dependencies

- `ai-gateway` service for AI generation (or workers-ai binding)
- May need to expose ai-functions primitives via service binding

---

## Phase Breakdown (TDD)

### Phase 1: Generative Functions
1. `do-gen.1` Red: Tests for generative function definition
2. `do-gen.2` Red: Tests for template substitution
3. `do-gen.3` Red: Tests for generative execution
4. `do-gen.4` Green: Implement generative execution
5. `do-gen.5` Refactor: Clean up

### Phase 2: Cascading Generation
1. `do-cascade.1` Red: Tests for CascadeOptions
2. `do-cascade.2` Red: Tests for GenerationContext
3. `do-cascade.3` Red: Tests for single-level cascade
4. `do-cascade.4` Red: Tests for multi-level cascade
5. `do-cascade.5` Green: Implement cascade system
6. `do-cascade.6` Refactor: Optimize

### Phase 3: Integration
1. `do-int.1` Integration tests for gen + cascade together
2. `do-int.2` E2E tests for full cascade flows
