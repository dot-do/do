# Functions

You write pseudo-code. DO makes it real.

```typescript
// This doesn't exist yet...
const result = await $.fizzBuzz(100)

// ...but now it does.
```

When you call a function that doesn't exist, DO's AI:
1. Recognizes what you want
2. Generates the function, types, tests
3. Tests it
4. Auto-versions with `@dotdo/esm` and gitx
5. A/B tests with experiments
6. Returns the result

That's the power of generative functions.

## Defining Functions

### Schema-Based AI (Primary Pattern)

```typescript
import { AI } from 'do/functions'

const ai = AI({
  // Function name -> natural language schema
  storyBrand: {
    hero: 'Who is the customer?',
    problem: {
      internal: 'What internal problem do they face?',
      external: 'What external challenge exists?',
      philosophical: 'Why is this wrong?',
    },
    guide: 'Who helps them? (the brand)',
    plan: ['What are the steps to success?'],
    callToAction: 'What should they do?',
    success: 'What does success look like?',
    failure: 'What happens if they fail?',
  },

  leanCanvas: {
    problem: ['Top 3 problems'],
    solution: ['Top 3 solutions'],
    uniqueValue: 'Single clear message',
    unfairAdvantage: 'Something not easily copied',
    customerSegments: ['Target customers'],
    keyMetrics: ['Key activities you measure'],
    channels: ['Path to customers'],
    costStructure: ['Customer acquisition costs', 'Distribution costs'],
    revenueStreams: ['Revenue model', 'Pricing'],
  },

  landingPageHero: {
    headline: 'Main headline (string)',
    subheadline: 'Supporting text',
    cta: 'Call to action button text',
    image: 'Hero image description',
  },
})

// Fully typed results
const brand = await ai.storyBrand('Acme Corp sells widgets to developers')
const canvas = await ai.leanCanvas('AI-powered code review startup')
const hero = await ai.landingPageHero('SaaS for restaurant reservations')
```

### Direct Assignment ($.fn Pattern)

```typescript
// Define as property assignment
$.fizzBuzz = (n: number) => {
  return Array.from({ length: n }, (_, i) => {
    const n = i + 1
    if (n % 15 === 0) return 'FizzBuzz'
    if (n % 3 === 0) return 'Fizz'
    if (n % 5 === 0) return 'Buzz'
    return String(n)
  })
}

// Use it
const result = $.fizzBuzz(100)
```

### Explicit Definition

```typescript
import { defineFunction } from 'do/functions'

const summarize = defineFunction({
  type: 'generative',
  name: 'summarize',
  args: {
    text: 'Text to summarize',
    maxLength: 'Max words (number)'
  },
  output: 'string',
  promptTemplate: 'Summarize in {{maxLength}} words:\n\n{{text}}',
  model: 'fast',
  temperature: 0.5,
})

const summary = await summarize.call({ text: article, maxLength: 100 })
```

## Function Types

Every function in DO is one of four types:

| Type | Symbol | Latency | Who/What | Example |
|------|--------|---------|----------|---------|
| **Code** | `{}` | <10ms | Pure TypeScript | `$.fizzBuzz(100)` |
| **Generative** | `✨` | 100-2000ms | AI model | `ai.storyBrand(company)` |
| **Agentic** | `🤖` | 1-60s | Autonomous agent | `$.research(topic)` |
| **Human** | `👤` | minutes-days | Human approval | `$.approve(proposal)` |

### Code Functions

Pure TypeScript/JavaScript. Fastest execution.

```typescript
const generateTax = defineFunction({
  type: 'code',
  name: 'calculateTax',
  language: 'typescript',
  args: {
    amount: 'The amount to calculate tax on (number)',
    rate: 'Tax rate as decimal (number)',
  },
  returnType: 'The calculated tax amount (number)',
  instructions: 'Handle edge cases and validate inputs',
})

// Returns the generated code
const code = await generateTax.call({ amount: 100, rate: 0.08 })
```

### Generative Functions

AI model calls. Returns structured output.

```typescript
const analyze = defineFunction({
  type: 'generative',
  name: 'analyze',
  args: { article: 'Article text to analyze' },
  output: {
    summary: 'Brief summary',
    sentiment: 'positive | negative | neutral',
    keyPoints: ['Main points from the article'],
    entities: ['Named entities mentioned'],
  },
  model: 'best',
  temperature: 0.3,
})

const result = await analyze.call({ article: articleText })
// { summary: '...', sentiment: 'positive', keyPoints: [...], entities: [...] }
```

### Agentic Functions

Autonomous agents that can use tools, iterate, and reason.

```typescript
const research = defineFunction({
  type: 'agentic',
  name: 'research',
  args: { topic: 'The topic to research' },
  instructions: 'Research thoroughly using available tools.',
  tools: ['search', 'fetch', 'summarize'],
  maxIterations: 10,
  model: 'best',
})

const result = await research.call({ topic: 'quantum computing trends 2026' })
// { findings: [...], sources: [...], summary: '...' }
```

### Human Functions

Human-in-the-loop for approvals, reviews, or manual tasks.

```typescript
const approve = defineFunction({
  type: 'human',
  name: 'approveExpense',
  args: {
    amount: 'Expense amount (number)',
    description: 'What the expense is for',
    submitter: 'Who submitted it',
  },
  returnType: {
    approved: 'Whether approved (boolean)',
    notes: 'Approver notes',
  },
  channel: 'slack',  // slack | email | web | sms
  instructions: 'Review and approve or reject the expense.',
})

const result = await approve.call({ amount: 500, description: '...', submitter: 'john' })
```

## Schema Language

Natural language descriptions become prompts:

```typescript
// String fields
{ name: 'Recipe name' }

// Numbers with type hint
{ servings: 'How many servings? (number)' }

// Booleans
{ isVegan: 'Is this recipe vegan? (boolean)' }

// Dates
{ startDate: 'Event date (date)' }

// Arrays (single-element)
{ ingredients: ['List all ingredients'] }

// Enums
{ type: 'food | drink | dessert' }

// Nested objects
{
  problem: {
    internal: 'Internal struggle',
    external: 'External challenge',
    philosophical: 'Why is this wrong?',
  }
}
```

## Auto-Discovery: The Magic

Call any function that doesn't exist:

```typescript
const result = await $.fizzBuzz(100)
```

DO's AI:

1. **Classifies**: "This is a code function - pure algorithm"
2. **Generates**: Function, types, tests, examples
3. **Tests**: Runs generated tests
4. **Versions**: Auto-commits to `@dotdo/esm` via gitx
5. **Experiments**: A/B tests with baseline
6. **Caches**: Stores for future calls
7. **Executes**: Runs and returns result

### Classification Heuristics

| Signal | Classification |
|--------|---------------|
| Pure computation, no external data | `code` |
| Natural language output needed | `generative` |
| Multi-step reasoning, tool use | `agentic` |
| Approval, sensitive operation | `human` |

## Experiments & A/B Testing

Every generated function is automatically A/B tested:

```typescript
import { Experiment, createVariantsFromGrid } from 'do/functions'

// Compare prompt variations
const results = await Experiment({
  id: 'storybrand-prompts',
  name: 'StoryBrand Prompt Comparison',

  variants: [
    {
      id: 'baseline',
      name: 'Simple Prompt',
      config: { prompt: 'Generate a StoryBrand for this company.' },
    },
    {
      id: 'detailed',
      name: 'Detailed Prompt',
      config: { prompt: 'Generate a comprehensive StoryBrand framework...' },
    },
  ],

  execute: async (config) => {
    return await ai.storyBrand(company, config)
  },

  // Metric function - return numeric score
  metric: async (result) => {
    // Use real-world data:
    // - Conversion data from landing page
    // - Human feedback scores
    // - LLM-as-judge evaluation
    return await evaluateStoryBrand(result)
  },
})

console.log('Best variant:', results.bestVariant)
// { variantId: 'detailed', variantName: '...', metricValue: 0.92 }
```

### Cartesian Grid for Multi-Parameter Testing

```typescript
const variants = createVariantsFromGrid({
  temperature: [0.3, 0.7, 1.0],
  model: ['fast', 'best'],
  maxTokens: [500, 1000],
})
// Returns 12 variants (3 × 2 × 2 combinations)
```

### Evaluation Sources

| Source | Use Case |
|--------|----------|
| **Conversion Data** | Landing pages, ads, CTAs |
| **Human Feedback** | Quality ratings, preferences |
| **LLM-as-Judge** | Automated quality scoring |
| **A/B Test Results** | Real user behavior |

```typescript
// LLM-as-judge evaluation
async function evaluateStoryBrand(result: StoryBrand): Promise<number> {
  const judge = await ai.evaluate({
    content: result,
    criteria: [
      'Is the hero clearly defined?',
      'Is the problem compelling?',
      'Is the guide trustworthy?',
      'Is the call to action clear?',
    ],
  })
  return judge.score // 0-1
}
```

## Versioning with @dotdo/esm

Generated functions are auto-versioned:

```typescript
// Auto-commit to git
await gitx.commit({
  message: `feat(functions): Add ${functionName}`,
  files: [
    `functions/${functionName}/index.ts`,
    `functions/${functionName}/types.ts`,
    `functions/${functionName}/test.ts`,
  ],
})

// Publish to @dotdo/esm
await esm.publish({
  name: functionName,
  version: semver.inc(current, 'patch'),
  code: generatedCode,
  types: generatedTypes,
})
```

### Version History

```typescript
// Get function versions
const versions = await $.functions.versions('storyBrand')
// ['1.0.0', '1.0.1', '1.1.0', ...]

// Use specific version
const v1 = await $.functions.get('storyBrand@1.0.0')

// Compare versions
const comparison = await $.functions.compare('storyBrand@1.0.0', 'storyBrand@1.1.0')
```

## Cascade Execution

Functions can cascade through tiers:

```typescript
import { CascadeExecutor } from 'do/functions'

const processRefund = new CascadeExecutor({
  cascadeName: 'refund-processor',

  tiers: {
    // Tier 1: Try rules first
    code: {
      name: 'rule-based',
      execute: async (request) => {
        if (request.amount < 50) return { approved: true }
        throw new Error('Rules inconclusive')  // Escalate
      },
    },

    // Tier 2: AI analysis
    generative: {
      name: 'ai-analysis',
      execute: async (request) => {
        const analysis = await ai.analyzeRefund(request)
        if (analysis.confidence > 0.9) return analysis
        throw new Error('Confidence too low')  // Escalate
      },
    },

    // Tier 3: Agent with tools
    agentic: {
      name: 'refund-agent',
      execute: async (request) => {
        return await refundAgent.process(request)
      },
    },

    // Tier 4: Human review
    human: {
      name: 'human-review',
      execute: async (request) => {
        return await createHumanTask({
          type: 'refund-review',
          data: request,
        })
      },
    },
  },
})

const result = await processRefund.execute(refundRequest)
console.log(`Resolved by ${result.tier} in ${result.metrics.totalDuration}ms`)
```

## Execution Tiers

Once classified, code runs on the appropriate tier:

| Tier | Latency | Environment | Use Case |
|------|---------|-------------|----------|
| 1 | <1ms | Native in-worker | Built-in operations |
| 2 | <5ms | RPC service | External DO calls |
| 3 | <10ms | Dynamic ESM | Generated modules |
| 4 | 2-3s | Linux sandbox | Complex execution |

See [execution/README.md](./execution/README.md) for details.

## Template Literals

For quick AI operations:

```typescript
import { write, list, is, code, decide } from 'do/functions'

// Generate text
const poem = await write`a haiku about TypeScript`

// Generate lists
const ideas = await list`10 startup ideas in healthcare`

// Boolean questions
const valid = await is`"john@example" is a valid email`

// Code generation
const query = await code`SQL query to fetch active users`

// Decisions
const choice = await decide(
  ['Option A', 'Option B', 'Option C'],
  'Pick the best startup idea'
)
```

## Configuration

```typescript
// In your DO configuration
export default {
  functions: {
    // Auto-generate missing functions
    autoGenerate: true,

    // Model for function generation
    generationModel: 'code',

    // Require tests to pass before caching
    requireTests: true,

    // Auto-version with gitx
    autoVersion: true,

    // A/B test all generated functions
    experimentAll: true,

    // Function timeout defaults
    timeouts: {
      code: 10_000,       // 10s
      generative: 30_000, // 30s
      agentic: 300_000,   // 5min
      human: 86_400_000,  // 24h
    },
  },
}
```

## Security

- **Code functions**: Run in V8 isolate (ai-evaluate/codex)
- **Generative functions**: Model guardrails apply
- **Agentic functions**: Tool permissions enforced
- **Human functions**: Auth required for assignees

All generated code is:
1. Sandboxed before execution
2. Tested before caching
3. Versioned for rollback
4. Logged for audit
