/**
 * Cascade Operators: Post-Generation Entity Linking
 *
 * DO supports four relation operators for linking entities after AI generation:
 *
 * | Operator | Type             | Action                                    |
 * |----------|------------------|-------------------------------------------|
 * | `->`     | Forward Insert   | Create entity, link TO it                 |
 * | `~>`     | Forward Search   | Vector search existing, link TO it        |
 * | `<-`     | Backward Insert  | Create entity, link FROM it (it owns us)  |
 * | `<~`     | Backward Search  | Vector search existing, link FROM it      |
 */

import type {
  RelationOperator,
  RelationDirection,
  RelationMethod,
  RelationFieldDefinition,
  StoredRelation,
  CascadeResult,
  CascadeFieldResult,
  CascadeError,
  CascadeConfig,
  EntitySchema,
  parseRelationOperator,
  parseRelationField,
  isRelationField,
} from '../types'

// =============================================================================
// Relation Operators Explained
// =============================================================================

/**
 * Forward Insert: ->
 * Create a new entity and link TO it from the current entity.
 *
 * Example: A Startup creates Founder entities
 * startup.founders = ['->Founder']
 */
const forwardInsert: RelationOperator = '->'

/**
 * Forward Search: ~>
 * Vector search for an existing entity and link TO it.
 *
 * Example: A Customer links to an existing Industry
 * customer.industry = '~>Industry'
 */
const forwardSearch: RelationOperator = '~>'

/**
 * Backward Insert: <-
 * Create a new entity that links FROM it (the new entity owns us).
 *
 * Example: A Startup is owned by an Idea
 * startup.idea = 'What is the core idea? <-Idea'
 */
const backwardInsert: RelationOperator = '<-'

/**
 * Backward Search: <~
 * Vector search for an existing entity that links FROM it.
 *
 * Example: A Person links from an existing Occupation
 * person.occupation = 'What do they do? <~Occupation|Role|JobType'
 */
const backwardSearch: RelationOperator = '<~'

// =============================================================================
// Parsing Relation Operators
// =============================================================================

/**
 * Parse an operator into its components
 */
function demonstrateOperatorParsing() {
  const operators: RelationOperator[] = ['->', '~>', '<-', '<~']

  for (const op of operators) {
    const parsed = parseRelationOperator(op)
    console.log(`Operator ${op}:`)
    console.log(`  Direction: ${parsed.direction}`)
    console.log(`  Method: ${parsed.method}`)
  }
}

demonstrateOperatorParsing()

// =============================================================================
// Parsing Relation Fields
// =============================================================================

/**
 * Parse relation field definitions from schema strings
 */
function demonstrateFieldParsing() {
  const fieldDefinitions = [
    // Simple forward insert
    '->Founder',
    // Array of forward inserts
    // Note: In schema, this would be ['->Founder']

    // Forward search with prompt
    'Which company? ~>Company',

    // Backward insert with prompt
    'What is the core idea? <-Idea',

    // Backward search with fallback types
    'What do they do? <~Occupation|Role|JobType',

    // Optional forward search
    '~>Company?',

    // Array notation (parsed from the field, not the string)
    '->Contact[]',
  ]

  for (const field of fieldDefinitions) {
    const parsed = parseRelationField(field)
    if (parsed) {
      console.log(`\nField: "${field}"`)
      console.log(`  Prompt: ${parsed.prompt || '(none)'}`)
      console.log(`  Operator: ${parsed.operator}`)
      console.log(`  Targets: ${parsed.targets.join(', ')}`)
      console.log(`  isArray: ${parsed.isArray}`)
      console.log(`  isOptional: ${parsed.isOptional}`)
    }
  }
}

demonstrateFieldParsing()

// =============================================================================
// Entity Schemas with Cascade Relations
// =============================================================================

/**
 * Customer schema with cascade relations
 */
const CustomerSchema: EntitySchema = {
  // Regular fields
  name: 'string',
  email: 'string',

  // Forward search: Link to existing Company
  company: '~>Company',

  // Backward search: Search Industry, fallback to Sector
  industry: '<~Industry|Sector',

  // Forward insert array: Create Contact entities
  contacts: ['->Contact'],

  // Backward insert: SalesRep owns this Customer
  owner: '<-SalesRep',
}

/**
 * Startup schema with cascade relations (from sb)
 */
const StartupSchema: EntitySchema = {
  name: 'string',
  tagline: 'What is the tagline?',

  // Backward insert: Idea entity owns this Startup
  idea: 'What is the idea? <-Idea',

  // Forward insert array: Create Founder entities
  founders: ['Who are the founders? ->Founder'],

  // Forward search: Find matching ICP
  customer: '~>IdealCustomerProfile',

  // Backward search: Find existing Industry classification
  industry: 'What industry? <~Industry|Sector|Market',

  // Forward insert: Create Problem entity
  problem: 'What problem does it solve? ->Problem',

  // Forward insert: Create Solution entity
  solution: 'How does it solve it? ->Solution',
}

console.log('\nStartup Schema Relations:')
for (const [field, def] of Object.entries(StartupSchema)) {
  if (isRelationField(def)) {
    console.log(`  ${field}: ${def}`)
  }
}

// =============================================================================
// Stored Relations
// =============================================================================

/**
 * After cascade processing, relations are stored in _rels table
 */
const exampleRelation: StoredRelation = {
  id: 'rel_001',
  relType: 'forward',           // forward, backward, fuzzyForward, fuzzyBackward
  relName: 'founders',          // Field name from schema
  fromCollection: 'Startup',
  fromId: 'startup_headless',
  toCollection: 'Founder',
  toId: 'founder_001',
  label: 'Nathan Clevenger',    // Human-readable (usually target's title)
  ordinal: 0,                   // For ordered relations
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

const backwardRelation: StoredRelation = {
  id: 'rel_002',
  relType: 'backward',          // Idea owns Startup
  relName: 'idea',
  fromCollection: 'Idea',       // Note: FROM is the owner
  fromId: 'idea_001',
  toCollection: 'Startup',      // TO is the owned entity
  toId: 'startup_headless',
  label: 'Headless CMS for developers',
  ordinal: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

console.log('\nStored Relations:')
console.log(`  ${exampleRelation.fromCollection}#${exampleRelation.fromId} --[${exampleRelation.relName}]--> ${exampleRelation.toCollection}#${exampleRelation.toId}`)
console.log(`  ${backwardRelation.fromCollection}#${backwardRelation.fromId} --[owns/${backwardRelation.relName}]--> ${backwardRelation.toCollection}#${backwardRelation.toId}`)

// =============================================================================
// Cascade Processing
// =============================================================================

/**
 * Cascade configuration for processing
 */
const cascadeConfig: CascadeConfig = {
  // Maximum depth for recursive cascades
  maxDepth: 5,

  // Parallel processing
  concurrency: 3,

  // Retry policy
  retryPolicy: {
    maxAttempts: 3,
    backoff: 'exponential',
    initialDelay: 100,
  },

  // Rate limiting (for AI calls)
  rateLimit: {
    requestsPerMinute: 60,
    tokensPerMinute: 100000,
  },

  // Vector search options
  vectorSearch: {
    topK: 5,
    scoreThreshold: 0.7,
  },

  // Checkpoint during long cascades
  checkpoint: true,
  checkpointInterval: 10, // Every 10 entities
}

/**
 * Example cascade result after processing a Startup
 */
const exampleCascadeResult: CascadeResult = {
  // Entities created during cascade
  created: [
    { type: 'Idea', id: 'idea_001', data: { title: 'Headless CMS for developers' } },
    { type: 'Founder', id: 'founder_001', data: { name: 'Nathan Clevenger' } },
    { type: 'Founder', id: 'founder_002', data: { name: 'Co-founder Name' } },
    { type: 'Problem', id: 'problem_001', data: { description: 'Content management is too complex' } },
    { type: 'Solution', id: 'solution_001', data: { description: 'API-first headless architecture' } },
  ],

  // Relations created
  relations: [
    {
      id: 'rel_001',
      relType: 'backward',
      relName: 'idea',
      fromCollection: 'Idea',
      fromId: 'idea_001',
      toCollection: 'Startup',
      toId: 'startup_headless',
      ordinal: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'rel_002',
      relType: 'forward',
      relName: 'founders',
      fromCollection: 'Startup',
      fromId: 'startup_headless',
      toCollection: 'Founder',
      toId: 'founder_001',
      ordinal: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    // ... more relations
  ],

  // Any errors encountered
  errors: [],
}

console.log('\nCascade Result:')
console.log(`  Created ${exampleCascadeResult.created.length} entities`)
console.log(`  Created ${exampleCascadeResult.relations.length} relations`)
console.log(`  Errors: ${exampleCascadeResult.errors.length}`)

/**
 * Example field result for a vector search that didn't find a match
 */
const searchMissResult: CascadeFieldResult = {
  error: {
    field: 'customer',
    message: 'No matching IdealCustomerProfile found above threshold 0.7',
    targetType: 'IdealCustomerProfile',
    code: 'notFound',
  },
}

/**
 * Example field result for a successful vector search
 */
const searchHitResult: CascadeFieldResult = {
  matched: {
    type: 'Industry',
    id: 'industry_saas',
    score: 0.92,
  },
  relation: {
    id: 'rel_003',
    relType: 'fuzzyBackward',
    relName: 'industry',
    fromCollection: 'Industry',
    fromId: 'industry_saas',
    toCollection: 'Startup',
    toId: 'startup_headless',
    label: 'Software as a Service (SaaS)',
    ordinal: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
}

console.log('\nVector Search Results:')
console.log(`  Miss: ${searchMissResult.error?.message}`)
console.log(`  Hit: ${searchHitResult.matched?.type}#${searchHitResult.matched?.id} (score: ${searchHitResult.matched?.score})`)

// =============================================================================
// Using Cascade in Practice
// =============================================================================

/**
 * In a real DO, cascade processing happens automatically when you create
 * entities with cascade schemas. Here's how it would work:
 */
async function demonstrateCascadeUsage() {
  // Simulated DO context
  const $ = {
    db: {
      Startup: {
        async create(data: Record<string, unknown>, options?: { cascade?: boolean }) {
          console.log('\nCreating Startup with cascade:', options?.cascade)
          console.log('Input data:', JSON.stringify(data, null, 2))

          // When cascade: true, the DO runtime will:
          // 1. Parse the schema for relation fields
          // 2. Generate AI content for prompts
          // 3. For -> operators: Create new entities
          // 4. For ~> operators: Vector search and link
          // 5. For <- operators: Create entities that own this one
          // 6. For <~ operators: Search for entities that should own this one
          // 7. Store all relations in _rels table

          return { id: 'startup_001', ...data }
        },
      },
    },
  }

  // Create a startup with cascade enabled
  const startup = await $.db.Startup.create(
    {
      name: 'Headless CMS',
      tagline: 'The developer-first content platform',
      // Cascade fields will be processed automatically:
      // - idea will create an Idea entity that owns this Startup
      // - founders will create Founder entities linked from this Startup
      // - customer will search for matching ICP
      // - industry will search for matching Industry
    },
    { cascade: true }
  )

  console.log('Created startup:', startup.id)
}

demonstrateCascadeUsage()
