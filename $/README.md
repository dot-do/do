# DO Context ($) Runtime

The `$` context is the main runtime interface for Digital Objects. Every DO operation flows through `$`, providing a unified API for AI, database, events, scheduling, communication, and more.

## Overview

```typescript
import { createContext } from './index'

// Create a context for a DO
const $ = createContext({
  $id: 'https://example.do',
  $type: 'Business'
})

// Or use the DO factory
export default DO($ => {
  // AI operations
  const ideas = await $.ai`5 startup ideas for ${industry}`

  // Database operations
  const users = await $.db.User.list()

  // Event handlers
  $.on.Customer.created(async (customer) => {
    await $.email`welcome ${customer.name} to ${customer.email}`
  })

  // Scheduled tasks
  $.every.Monday.at9am(async () => {
    const report = await $.ai`generate weekly report`
    await $.slack`#metrics ${report}`
  })
})
```

## Context Properties

### $.ai - AI Operations

Tagged template interface for AI operations with natural language.

```typescript
// Basic generation
const ideas = await $.ai`5 startup ideas for ${industry}`

// Boolean check
const viable = await $.ai.is`${idea} is technically feasible`

// List generation (chainable)
const tasks = await $.ai.list`tasks to launch ${product}`
  .map(task => $.ai`expand on ${task}`)

// Writing/summarizing
const summary = await $.ai.summarize`${longDocument}`
const copy = await $.ai.write`marketing copy for ${product}`

// Code generation
const code = await $.ai.code`function to ${description}`

// Extraction
const entities = await $.ai.extract`named entities from ${text}`

// Embeddings
const vector = await $.ai.embed('text to embed')

// Multi-modal
const image = await $.ai.image`hero image for ${product}`
const video = await $.ai.video`explainer video for ${feature}`
const audio = await $.ai.speak`${text}`
const text = await $.ai.transcribe(audioBuffer)
```

### $.db - Database Operations

Unified database access with natural language queries.

```typescript
// Natural language queries
const stuck = await $.db.Order`what's stuck in processing?`

// Collection access (via Proxy)
const users = await $.db.User.list()
const user = await $.db.User.get('user-123')

// CRUD operations
await $.db.Customer.create({ name: 'Acme Corp' })
await $.db.Customer.update('cust-123', { status: 'active' })
await $.db.Customer.delete('cust-123')

// Search and filter
const results = await $.db.Product.search('enterprise')
const filtered = await $.db.Order.find({ status: 'pending' })

// Batch processing
await $.db.User.forEach(
  async (user) => sendWelcomeEmail(user),
  { concurrency: 10 }
)

// SQL queries
const custom = await $.db.query('SELECT * FROM orders WHERE total > ?', [1000])

// Document operations
const docs = await $.db.documents.find({
  collection: 'orders',
  filter: { status: 'pending' }
})

// Graph operations
const related = await $.db.graph.traverse({
  startNode: 'user-123',
  edges: ['owns', 'manages']
})

// Analytics
const stats = await $.db.analytics.query({
  select: ['count(*)', 'sum(total)'],
  from: 'orders',
  groupBy: ['status']
})
```

### $.on - Event Handlers

Register handlers for DO events with noun.verb pattern.

```typescript
// Entity lifecycle events
$.on.Customer.created(async (customer, $) => {
  await $.email.to(customer.email)`Welcome to our platform!`
})

$.on.Order.updated(async (order, $) => {
  if (order.status === 'shipped') {
    await $.sms.to(order.phone)`Your order has shipped!`
  }
})

$.on.User.deleted(async (user, $) => {
  await $.ai`cleanup resources for ${user.id}`
})

// Custom events
$.on.Payment.received(async (payment, $) => {
  await $.slack`#sales Payment of $${payment.amount} received`
})
```

### $.every - Scheduled Tasks

Define recurring tasks with natural time expressions.

```typescript
// Simple intervals
$.every.hour(async ($) => {
  await $.db.Cache.refresh()
})

$.every.day(async ($) => {
  const report = await $.ai`daily summary report`
  await $.email`${report} to team@example.com`
})

// Specific times
$.every.Monday.at9am(async ($) => {
  await $.slack`#team Weekly standup time!`
})

$.every.weekday.at6pm(async ($) => {
  const metrics = await $.db.analytics.query({
    select: ['count(*)'],
    from: 'orders'
  })
  await $.slack`#metrics Daily orders: ${metrics[0].count}`
})

// Custom intervals
$.every.minutes(15)(async ($) => {
  await checkExternalServices()
})

$.every.hours(4)(async ($) => {
  await syncInventory()
})
```

### $.email - Email Communication

Send emails with tagged template syntax.

```typescript
// Simple send (parses template for to/subject/body)
await $.email`welcome ${user.name} to ${user.email}`

// Explicit recipient
await $.email.to(user.email)`Welcome to ${product}!`

// Using templates
await $.email.template('welcome', user.email, {
  name: user.name,
  product: product.name
})
```

### $.slack - Slack Integration

Post messages to Slack channels.

```typescript
// Post to channel (parsed from template)
await $.slack`#general New feature launched: ${feature.name}`

// Explicit channel
await $.slack.channel('C12345')`Deployment complete for ${version}`
```

### $.sms - SMS Messaging

Send SMS messages.

```typescript
// Send to number (parsed from template)
await $.sms`${phone} Your order has shipped!`

// Explicit recipient
await $.sms.to('+1234567890')`Reminder: ${appointment.title} at ${appointment.time}`
```

### $.call - Telephony

Make phone calls with AI-powered conversations.

```typescript
// Make a call with context
await $.call('+1234567890')`discuss ${topic} and schedule follow-up`

// Programmatic call
await $.call.make({
  from: '+1987654321',
  to: '+1234567890',
  twiml: '<Response><Say>Hello!</Say></Response>'
})
```

### $.voice - Voice AI

Create and manage AI voice agents.

```typescript
// Create a voice agent
const agent = await $.voice.agent`sales assistant for ${product}`

// Start a session
const session = await $.voice.session(agent.agentId)

// Run an outbound campaign
const campaign = await $.voice.campaign(
  ['+1234567890', '+0987654321'],
  agent.agentId
)
```

### $.pay - Financial Operations

Handle payments, transfers, and accounting.

```typescript
// Charge with tagged template
await $.pay`charge ${customer.id} $${amount}`

// Explicit operations
await $.pay.charge(customer.id, 9900, 'usd')
await $.pay.transfer(destination, 5000)
await $.pay.payout(1000, 'bank_account_123')

// Accounting
await $.pay.journal({
  debit: [{ account: 'revenue', amount: 1000 }],
  credit: [{ account: 'receivables', amount: 1000 }]
})

// Reports
const pnl = await $.pay.pnl('monthly')
const metrics = await $.pay.mrr()
```

### $.domain - Domain Management

Claim and manage subdomains.

```typescript
// Claim a subdomain
const { $id } = await $.domain`acme.saas.group`

// Explicit claim
const result = await $.domain.claim('acme', 'saas.group')

// Check availability
const status = await $.domain.check('acme', 'saas.group')

// List owned domains
const domains = await $.domain.list()

// Release a domain
await $.domain.release('acme', 'saas.group')
```

### $.cascade - Cascade Execution

Execute operations with fallback tiers: code -> generative -> agentic -> human.

```typescript
const { result, tier } = await $.cascade({
  // Try deterministic code first
  code: () => lookupInCache(query),

  // Fall back to AI generation
  generative: () => $.ai`answer ${query}`,

  // Use agent for complex tasks
  agentic: () => $.ai.do`research and answer ${query}`,

  // Final fallback to human
  human: () => requestHumanHelp(query)
})

console.log(`Resolved at tier: ${tier}`)
```

### $.log - Logging

Structured logging for observability.

```typescript
$.log('Processing order', { orderId: order.id })
$.log('Error occurred', { error: err.message })
```

### $.child / $.spawn - Child DOs

Access and create child Digital Objects.

```typescript
// Get existing child
const child = $.child('Service', 'api')

// Create new child
const newChild = await $.spawn('Agent', 'sales-bot')
```

## Tagged Template Syntax

The `$` context uses tagged templates for natural, readable code:

```typescript
// The template string is parsed to extract intent and parameters
await $.ai`summarize ${document}`

// Equivalent to:
await $.ai.generate({ prompt: 'summarize', input: document })
```

Tagged templates can also be chained with options:

```typescript
await $.ai`5 ideas for ${topic}`({ model: 'best', temperature: 0.7 })
```

## Architecture

```
src/context/
  index.ts          # Main context factory (createContext, DO)
  ai.ts             # AIContext implementation
  db.ts             # DBContext implementation
  events.ts         # OnContext implementation
  schedule.ts       # EveryContext implementation
  communication.ts  # Email, Slack, SMS contexts
  telephony.ts      # Call, Voice contexts
  financial.ts      # Pay context
  domain.ts         # Domain context
  cascade.ts        # Cascade execution
  proxy.ts          # Proxy helpers for dynamic access
  __tests__/        # Test files
```

## Implementation Notes

- All context properties are lazily initialized
- Proxy objects enable dynamic access patterns ($.db.User, $.on.Customer.created)
- Tagged templates parse the template string to extract intent
- Event handlers and schedules are registered but executed by the DO runtime
- Communication contexts abstract over multiple providers

See `CLAUDE.md` for implementation guidelines.
