/**
 * CDC (Change Data Capture) Event Streaming with $context
 *
 * CDC enables real-time event streaming with hierarchical bubbling:
 * - Every data change emits a CDC event
 * - Events bubble up through the $context chain
 * - Parent DOs can observe/aggregate child events
 * - Cold storage (R2/Iceberg) for historical analytics
 *
 * Hierarchy Example:
 * https://crm.headless.ly/acme (Tenant)
 *   └─ $context: https://crm.headless.ly (App)
 *        └─ $context: https://headless.ly (Startup)
 *             └─ $context: https://startups.studio (Business)
 *                  └─ CDC events → R2/Iceberg
 */

import type {
  CDCEvent,
  CDCOperation,
  CDCCursor,
  CDCOptions,
  CDCBatch,
  CDCSubscription,
  StorageTier,
  SyncState,
  SyncResult,
  DOContext,
} from '../types'

// =============================================================================
// CDC Events
// =============================================================================

/**
 * CDC event structure
 */
interface CustomerData {
  name: string
  email: string
  tier: string
  mrr: number
}

const insertEvent: CDCEvent<CustomerData> = {
  id: 'cdc_001',
  operation: 'INSERT',
  collection: 'Customer',
  documentId: 'customer_acme',
  timestamp: Date.now(),
  sequence: 1001,
  // No 'before' for INSERT
  after: {
    name: 'Acme Corp',
    email: 'contact@acme.com',
    tier: 'enterprise',
    mrr: 5000,
  },
  source: 'https://crm.headless.ly/acme',
  correlationId: 'req_xyz123',
}

const updateEvent: CDCEvent<CustomerData> = {
  id: 'cdc_002',
  operation: 'UPDATE',
  collection: 'Customer',
  documentId: 'customer_acme',
  timestamp: Date.now(),
  sequence: 1002,
  before: {
    name: 'Acme Corp',
    email: 'contact@acme.com',
    tier: 'enterprise',
    mrr: 5000,
  },
  after: {
    name: 'Acme Corp',
    email: 'contact@acme.com',
    tier: 'enterprise',
    mrr: 7500, // MRR increased
  },
  changedFields: ['mrr'],
  source: 'https://crm.headless.ly/acme',
  correlationId: 'req_xyz124',
}

const deleteEvent: CDCEvent<CustomerData> = {
  id: 'cdc_003',
  operation: 'DELETE',
  collection: 'Customer',
  documentId: 'customer_old',
  timestamp: Date.now(),
  sequence: 1003,
  before: {
    name: 'Old Customer',
    email: 'old@customer.com',
    tier: 'free',
    mrr: 0,
  },
  // No 'after' for DELETE
  source: 'https://crm.headless.ly/acme',
}

console.log('CDC Events:')
console.log(`  INSERT: ${insertEvent.collection}#${insertEvent.documentId}`)
console.log(`  UPDATE: ${updateEvent.collection}#${updateEvent.documentId} changed: ${updateEvent.changedFields?.join(', ')}`)
console.log(`  DELETE: ${deleteEvent.collection}#${deleteEvent.documentId}`)

// =============================================================================
// CDC Subscriptions
// =============================================================================

/**
 * Subscribe to CDC events with filtering
 */
const subscriptionOptions: CDCOptions = {
  // Filter by collections (empty = all)
  collections: ['Customer', 'Order', 'Invoice'],

  // Filter by operations (empty = all)
  operations: ['INSERT', 'UPDATE'],

  // Start from a specific cursor (for replay)
  fromCursor: {
    sequence: 1000,
    timestamp: Date.now() - 3600000, // 1 hour ago
  },

  // Include full document snapshots
  includeDocuments: true,

  // Batch settings
  batchSize: 100,
  batchTimeout: 1000, // 1 second
}

/**
 * Subscription state
 */
const subscription: CDCSubscription = {
  id: 'sub_001',
  options: subscriptionOptions,
  cursor: {
    sequence: 1050,
    timestamp: Date.now(),
  },
  status: 'active',
  createdAt: Date.now(),
}

console.log('\nCDC Subscription:')
console.log(`  ID: ${subscription.id}`)
console.log(`  Collections: ${subscription.options.collections?.join(', ')}`)
console.log(`  Status: ${subscription.status}`)

// =============================================================================
// Using CDC in DO Context
// =============================================================================

/**
 * Handle CDC events in a DO using the $ context
 */
async function handleCDCEvents($: DOContext) {
  // Subscribe to specific entity events
  $.on.Customer.created(async (customer, context) => {
    console.log('Customer created:', customer)

    // Send welcome email
    await context.email.to(customer.email)`Welcome to our platform!`

    // Track in analytics
    await context.send('analytics.customer.created', {
      customerId: customer.id,
      tier: customer.tier,
      timestamp: Date.now(),
    })
  })

  $.on.Customer.updated(async (customer, context) => {
    console.log('Customer updated:', customer)

    // Check for tier upgrade
    if (customer.changes?.includes('tier')) {
      await context.slack`#sales Customer ${customer.name} upgraded to ${customer.tier}!`
    }
  })

  $.on.Customer.deleted(async (customer, context) => {
    console.log('Customer deleted:', customer.id)

    // Clean up related data
    await context.db.collection('CustomerNotes').delete({ customerId: customer.id })
  })

  // Subscribe to Order events
  $.on.Order.placed(async (order, context) => {
    console.log('Order placed:', order.id)

    // Start fulfillment workflow
    const workflow = await context.db.collection('Workflow').create({
      type: 'OrderFulfillment',
      orderId: order.id,
      status: 'pending',
    })

    // Notify warehouse
    await context.send('warehouse.order.received', {
      orderId: order.id,
      items: order.items,
    })
  })

  // Generic event handler for any collection
  $.on['*'].created(async (entity, context) => {
    console.log(`Entity created in ${entity.$type}:`, entity.$id)
  })
}

// =============================================================================
// Hierarchical CDC Bubbling
// =============================================================================

/**
 * CDC events bubble up through the $context chain.
 * Each level can observe, filter, and aggregate events.
 *
 * Example hierarchy:
 *
 * Tenant DO (https://crm.headless.ly/acme)
 *   - Emits: Customer.created, Order.placed
 *   - $context: https://crm.headless.ly
 *
 * App DO (https://crm.headless.ly)
 *   - Receives: all tenant events
 *   - Aggregates: total customers, MRR
 *   - $context: https://headless.ly
 *
 * Startup DO (https://headless.ly)
 *   - Receives: aggregated app events
 *   - Tracks: product metrics
 *   - $context: https://startups.studio
 *
 * Business DO (https://startups.studio)
 *   - Receives: all startup events
 *   - Archives: to R2/Iceberg for analytics
 */

interface CDCHierarchy {
  source: string
  target: string
  eventTypes: string[]
  aggregations?: string[]
}

const cdcHierarchy: CDCHierarchy[] = [
  {
    source: 'https://crm.headless.ly/acme',
    target: 'https://crm.headless.ly',
    eventTypes: ['Customer.*', 'Order.*', 'Invoice.*'],
  },
  {
    source: 'https://crm.headless.ly',
    target: 'https://headless.ly',
    eventTypes: ['Tenant.created', 'metrics.*'],
    aggregations: ['totalTenants', 'totalMRR'],
  },
  {
    source: 'https://headless.ly',
    target: 'https://startups.studio',
    eventTypes: ['Startup.metrics', 'Startup.milestone'],
    aggregations: ['portfolioMRR', 'activeStartups'],
  },
  {
    source: 'https://startups.studio',
    target: 'r2://startups-events',
    eventTypes: ['*'],
    aggregations: ['archive'],
  },
]

console.log('\nCDC Hierarchy:')
for (const level of cdcHierarchy) {
  console.log(`  ${level.source} -> ${level.target}`)
  console.log(`    Events: ${level.eventTypes.join(', ')}`)
  if (level.aggregations) {
    console.log(`    Aggregations: ${level.aggregations.join(', ')}`)
  }
}

// =============================================================================
// CDC Aggregation at Parent Level
// =============================================================================

/**
 * Parent DO aggregates events from children
 */
async function aggregateTenantMetrics($: DOContext) {
  // Listen for tenant CDC events
  $.on.Tenant.Customer.created(async (event, context) => {
    // Update aggregate counts
    const stats = await context.db.collection('TenantStats').get(event.tenantId)
    await context.db.collection('TenantStats').update(event.tenantId, {
      customerCount: (stats?.customerCount ?? 0) + 1,
      updatedAt: Date.now(),
    })
  })

  $.on.Tenant.Order.placed(async (event, context) => {
    // Update revenue metrics
    const stats = await context.db.collection('TenantStats').get(event.tenantId)
    await context.db.collection('TenantStats').update(event.tenantId, {
      totalOrders: (stats?.totalOrders ?? 0) + 1,
      totalRevenue: (stats?.totalRevenue ?? 0) + event.total,
      updatedAt: Date.now(),
    })
  })

  // Scheduled aggregation rollup
  $.every.hour(async () => {
    // Compute hourly metrics
    const tenants = await $.db.collection('Tenant').list()
    let totalMRR = 0

    for (const tenant of tenants) {
      totalMRR += tenant.mrr ?? 0
    }

    // Emit aggregated metric
    await $.send('metrics.app.mrr', {
      totalMRR,
      tenantCount: tenants.length,
      timestamp: Date.now(),
    })
  })
}

// =============================================================================
// Pull-Based CDC (for batch processing)
// =============================================================================

/**
 * Pull CDC changes in batches
 */
async function pullCDCChanges($: DOContext) {
  // Get current cursor
  const cursor: CDCCursor = {
    sequence: 0,
    timestamp: Date.now() - 86400000, // 24 hours ago
  }

  // Pull changes in batches
  let hasMore = true
  let currentCursor = cursor

  while (hasMore) {
    // Simulated RPC call
    const batch: CDCBatch = {
      events: [insertEvent, updateEvent], // Would come from actual call
      cursor: {
        sequence: currentCursor.sequence + 100,
        timestamp: Date.now(),
      },
      hasMore: false,
    }

    console.log(`\nProcessing batch: ${batch.events.length} events`)

    for (const event of batch.events) {
      console.log(`  ${event.operation} ${event.collection}#${event.documentId}`)

      // Process event based on operation
      switch (event.operation) {
        case 'INSERT':
          await processInsert(event)
          break
        case 'UPDATE':
          await processUpdate(event)
          break
        case 'DELETE':
          await processDelete(event)
          break
      }
    }

    currentCursor = batch.cursor
    hasMore = batch.hasMore
  }

  console.log('CDC sync complete, cursor:', currentCursor)
}

async function processInsert(event: CDCEvent) {
  console.log(`    Insert: ${JSON.stringify(event.after)}`)
}

async function processUpdate(event: CDCEvent) {
  console.log(`    Update: ${event.changedFields?.join(', ')}`)
}

async function processDelete(event: CDCEvent) {
  console.log(`    Delete: was ${JSON.stringify(event.before)}`)
}

// =============================================================================
// Storage Tier Sync
// =============================================================================

/**
 * CDC events sync through storage tiers:
 * - Hot: DO SQLite + Vortex (real-time)
 * - Warm: Edge Cache API (10ms)
 * - Cold: R2 + Iceberg (archival)
 */
const syncState: SyncState = {
  doId: 'https://crm.headless.ly/acme',
  lastHotSequence: 1050,
  lastWarmSequence: 1000,
  lastColdSequence: 950,
  lastSyncTimestamp: Date.now(),
  pendingChanges: 50,
}

console.log('\nStorage Sync State:')
console.log(`  Hot (SQLite): seq ${syncState.lastHotSequence}`)
console.log(`  Warm (Cache): seq ${syncState.lastWarmSequence}`)
console.log(`  Cold (R2): seq ${syncState.lastColdSequence}`)
console.log(`  Pending: ${syncState.pendingChanges} changes`)

/**
 * Sync to cold storage (R2/Iceberg)
 */
async function syncToColdStorage(): Promise<SyncResult> {
  // Simulated sync result
  return {
    success: true,
    changesSynced: 50,
    bytesWritten: 125000,
    duration: 230,
    newCursor: {
      sequence: 1050,
      timestamp: Date.now(),
    },
  }
}

// =============================================================================
// Real-Time Event Stream (WebSocket)
// =============================================================================

/**
 * Subscribe to real-time CDC stream via WebSocket
 */
function subscribeToRealTimeEvents(ws: WebSocket, options: CDCOptions) {
  // Send subscription message
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'cdc',
    options,
  }))

  // Handle incoming events
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)

    if (message.type === 'cdc') {
      const cdcEvent: CDCEvent = message.payload
      console.log(`CDC: ${cdcEvent.operation} ${cdcEvent.collection}#${cdcEvent.documentId}`)

      // Process event...
    }
  }
}

console.log('\nCDC Streaming example complete')
