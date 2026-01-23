/**
 * Working with Collections: Things, Actions, and Relationships
 *
 * Every DO contains these core collection types:
 * - Nouns: Entity type definitions
 * - Verbs: Action type definitions
 * - Things: Entity instances
 * - Actions: Durable action instances
 * - Relationships: Links between Things
 */

import type {
  Noun,
  Verb,
  Thing,
  ThingExpanded,
  ThingCompact,
  Action,
  ActionStatus,
  Relationship,
  Actor,
  CollectionMethods,
  ListOptions,
  FilterExpression,
  isThingExpanded,
  isThingCompact,
} from '../types'

// =============================================================================
// Nouns: Entity Type Definitions
// =============================================================================

/**
 * Define a Noun (entity type) for Customers
 */
const customerNoun: Noun = {
  id: 'noun_customer',
  name: 'Customer',
  singular: 'customer',
  plural: 'customers',
  slug: 'customer',
  description: 'A customer who purchases products or services',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      tier: { type: 'string', enum: ['free', 'pro', 'enterprise'] },
      mrr: { type: 'number' },
    },
    required: ['name', 'email'],
  },
}

/**
 * Define a Noun for Orders
 */
const orderNoun: Noun = {
  id: 'noun_order',
  name: 'Order',
  singular: 'order',
  plural: 'orders',
  slug: 'order',
  description: 'A purchase order from a customer',
  schema: {
    type: 'object',
    properties: {
      customerId: { type: 'string' },
      items: { type: 'array' },
      total: { type: 'number' },
      status: { type: 'string', enum: ['pending', 'processing', 'shipped', 'delivered'] },
    },
    required: ['customerId', 'items', 'total'],
  },
}

console.log('Nouns defined:', customerNoun.name, orderNoun.name)

// =============================================================================
// Verbs: Action Type Definitions
// =============================================================================

/**
 * Define a Verb with all grammatical forms
 *
 * Every verb has:
 * - action: imperative form (create)
 * - activity: present participle (creating)
 * - event: past tense (created)
 * - reverse: passive form (createdBy)
 * - inverse: opposite action (delete)
 */
const createVerb: Verb = {
  id: 'verb_create',
  name: 'Create',
  action: 'create',
  act: 'new',
  activity: 'creating',
  event: 'created',
  reverse: 'createdBy',
  inverse: 'delete',
  description: 'Create a new entity',
}

const purchaseVerb: Verb = {
  id: 'verb_purchase',
  name: 'Purchase',
  action: 'purchase',
  act: 'buy',
  activity: 'purchasing',
  event: 'purchased',
  reverse: 'purchasedBy',
  inverse: 'refund',
  description: 'Complete a purchase transaction',
}

console.log(`Verb: ${purchaseVerb.action} -> ${purchaseVerb.activity} -> ${purchaseVerb.event}`)

// =============================================================================
// Things: Entity Instances
// =============================================================================

/**
 * Thing in EXPANDED format (MDXLD style)
 * Properties are spread at root level with $ prefixes for metadata
 */
const customerExpanded: ThingExpanded = {
  $id: 'customer_acme',
  $type: 'Customer',
  $version: 1,
  $createdAt: Date.now(),
  $updatedAt: Date.now(),
  // Data fields at root level
  name: 'Acme Corp',
  email: 'contact@acme.com',
  tier: 'enterprise',
  mrr: 5000,
  // Optional MDX content
  $content: `
# Acme Corporation

Our largest enterprise customer since 2023.

## Key Contacts
- CEO: John Smith
- CTO: Jane Doe
  `,
  // Optional $ref to this Thing's own DO
  $ref: 'https://acme.customers.do',
}

/**
 * Thing in COMPACT format (traditional data structure)
 * Data is nested under the 'data' property
 */
interface CustomerData {
  name: string
  email: string
  tier: 'free' | 'pro' | 'enterprise'
  mrr: number
}

const customerCompact: ThingCompact<CustomerData> = {
  id: 'customer_acme',
  type: 'Customer',
  data: {
    name: 'Acme Corp',
    email: 'contact@acme.com',
    tier: 'enterprise',
    mrr: 5000,
  },
  version: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  content: '# Acme Corporation\n\nOur largest enterprise customer.',
  ref: 'https://acme.customers.do',
}

/**
 * Type guards to distinguish formats
 */
function processThings(things: Thing[]) {
  for (const thing of things) {
    if (isThingExpanded(thing)) {
      // Access expanded format: thing.$id, thing.$type, thing.name
      console.log(`Expanded: ${thing.$id} (${thing.$type})`)
    } else if (isThingCompact(thing)) {
      // Access compact format: thing.id, thing.type, thing.data.name
      console.log(`Compact: ${thing.id} (${thing.type})`)
    }
  }
}

processThings([customerExpanded, customerCompact])

// =============================================================================
// Actions: Durable Action Instances
// =============================================================================

/**
 * Create an Actor (who initiated the action)
 */
const systemActor: Actor = {
  type: 'System',
  id: 'system',
  name: 'System Process',
}

const userActor: Actor = {
  type: 'User',
  id: 'user_123',
  name: 'Alice Smith',
}

const agentActor: Actor = {
  type: 'Agent',
  id: 'agent_sales',
  name: 'Sales Agent',
}

/**
 * Create an Action with full tracking
 */
interface OrderInput {
  customerId: string
  items: Array<{ productId: string; quantity: number; price: number }>
}

interface OrderOutput {
  orderId: string
  total: number
  status: string
}

const createOrderAction: Action<OrderInput, OrderOutput> = {
  $id: 'action_order_123',
  verb: 'create',
  object: 'Order',
  status: 'pending',
  actor: userActor,
  input: {
    customerId: 'customer_acme',
    items: [
      { productId: 'prod_1', quantity: 2, price: 99 },
      { productId: 'prod_2', quantity: 1, price: 199 },
    ],
  },
  request: {
    id: 'req_abc123',
    method: 'POST',
    path: '/api/orders',
    timestamp: Date.now(),
    traceId: 'trace_xyz',
  },
  createdAt: Date.now(),
  metadata: {
    source: 'web',
    campaign: 'summer_sale',
  },
}

/**
 * Action status lifecycle
 */
const actionStatuses: ActionStatus[] = [
  'pending',    // Waiting to start
  'running',    // Currently executing
  'completed',  // Successfully finished
  'failed',     // Failed with error
  'cancelled',  // Cancelled before completion
  'retrying',   // Failed, will retry
  'blocked',    // Waiting on dependency
]

/**
 * Update action to running state
 */
function startAction(action: Action): Action {
  return {
    ...action,
    status: 'running',
    startedAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/**
 * Complete action with output
 */
function completeAction<I, O>(action: Action<I, O>, output: O): Action<I, O> {
  return {
    ...action,
    status: 'completed',
    output,
    completedAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/**
 * Fail action with error
 */
function failAction(action: Action, error: string): Action {
  return {
    ...action,
    status: 'failed',
    error: {
      code: 'ACTION_FAILED',
      message: error,
      retryable: true,
      retryCount: (action.error?.retryCount ?? 0) + 1,
    },
    updatedAt: Date.now(),
  }
}

// Simulate action lifecycle
let orderAction = createOrderAction
console.log('Action created:', orderAction.status)

orderAction = startAction(orderAction)
console.log('Action started:', orderAction.status)

orderAction = completeAction(orderAction, {
  orderId: 'order_456',
  total: 397,
  status: 'created',
})
console.log('Action completed:', orderAction.status, orderAction.output)

// =============================================================================
// Relationships: Links Between Things
// =============================================================================

/**
 * Create relationships between entities
 */
const customerOrderRelationship: Relationship = {
  id: 'rel_customer_order_1',
  from: 'customer_acme',        // Customer ID
  to: 'order_456',              // Order ID
  type: 'placed',               // Relationship type: Customer placed Order
  data: {
    placedAt: Date.now(),
    channel: 'web',
  },
  createdAt: Date.now(),
}

const orderProductRelationship: Relationship = {
  id: 'rel_order_product_1',
  from: 'order_456',            // Order ID
  to: 'prod_1',                 // Product ID
  type: 'contains',             // Relationship type: Order contains Product
  data: {
    quantity: 2,
    unitPrice: 99,
  },
  createdAt: Date.now(),
}

console.log(`Relationship: ${customerOrderRelationship.from} --[${customerOrderRelationship.type}]--> ${customerOrderRelationship.to}`)

// =============================================================================
// Collection Methods: CRUD Operations
// =============================================================================

/**
 * Example of using collection methods (would be provided by DO runtime)
 */
async function demonstrateCollectionMethods(
  customers: CollectionMethods<ThingCompact<CustomerData>>
) {
  // Create
  const newCustomer = await customers.create({
    id: 'customer_new',
    type: 'Customer',
    data: {
      name: 'New Corp',
      email: 'hello@newcorp.com',
      tier: 'free',
      mrr: 0,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  // Get by ID
  const customer = await customers.get('customer_acme')
  console.log('Found customer:', customer?.data.name)

  // List with options
  const listOptions: ListOptions = {
    limit: 10,
    offset: 0,
    orderBy: 'createdAt',
    orderDir: 'desc',
    filter: {
      field: 'data.tier',
      op: 'eq',
      value: 'enterprise',
    },
  }

  const result = await customers.list(listOptions)
  console.log(`Found ${result.items.length} customers, hasMore: ${result.hasMore}`)

  // Complex filter
  const complexFilter: FilterExpression = {
    and: [
      { field: 'data.tier', op: 'in', value: ['pro', 'enterprise'] },
      { field: 'data.mrr', op: 'gte', value: 100 },
    ],
  }

  const premiumCustomers = await customers.find(complexFilter)
  console.log('Premium customers:', premiumCustomers.length)

  // Update
  const updatedCustomer = await customers.update('customer_new', {
    data: { ...newCustomer.data, tier: 'pro', mrr: 99 },
    updatedAt: Date.now(),
  })

  // Delete
  await customers.delete('customer_new')
  console.log('Customer deleted')

  // Count
  const count = await customers.count({ field: 'data.tier', op: 'eq', value: 'enterprise' })
  console.log('Enterprise customers:', count)
}

console.log('Collections example complete')
