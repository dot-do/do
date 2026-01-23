/**
 * Basic DO Creation and Usage
 *
 * This example shows how to create and configure a Digital Object
 * using the DO factory function with the $ context.
 */

import type {
  DOContext,
  DOFactory,
  DigitalObjectIdentity,
  DOType,
} from '../types'

// =============================================================================
// DO Factory Pattern
// =============================================================================

/**
 * The DO factory creates a Digital Object with the $ context.
 * All operations flow through $ - the runtime context accessor.
 */
declare const DO: DOFactory

// Create a basic DO that handles HTTP requests
export default DO(async ($: DOContext) => {
  // ==========================================================================
  // Identity
  // ==========================================================================

  // Every DO has identity properties
  console.log('DO ID:', $.$id)           // e.g., 'https://myapp.do'
  console.log('DO Type:', $.$type)       // e.g., 'SaaS'
  console.log('Parent:', $.$context)     // e.g., 'https://parent.do' or undefined

  // ==========================================================================
  // AI Operations
  // ==========================================================================

  // Generate content with tagged template syntax
  const tagline = await $.ai`Generate a catchy tagline for a SaaS product`
  console.log('Tagline:', tagline)

  // Check a condition with AI
  const isGood = await $.ai.is`"${tagline}" is a good marketing tagline`
  console.log('Is good:', isGood)

  // Generate a list
  const features = await $.ai.list`5 key features for a SaaS dashboard`
  console.log('Features:', features)

  // ==========================================================================
  // Database Operations
  // ==========================================================================

  // Create a user in the Users collection
  const user = await $.db.collection<User>('Users').create({
    email: 'alice@example.com',
    name: 'Alice',
    roles: ['user'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
  console.log('Created user:', user.id)

  // List users with filtering
  const activeUsers = await $.db.collection<User>('Users').list({
    filter: { status: 'active' },
    limit: 10,
  })
  console.log('Active users:', activeUsers.length)

  // Natural language database query
  const recentUsers = await $.db.collection<User>('Users')`users created in the last 7 days`
  console.log('Recent users:', recentUsers)

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  // Handle user creation events
  $.on.User.created(async (user, context) => {
    console.log('New user created:', user)

    // Send welcome email
    await context.email.to(user.email)`Welcome to our platform, ${user.name}!`
  })

  // Handle user deletion
  $.on.User.deleted(async (user) => {
    console.log('User deleted:', user.id)
  })

  // ==========================================================================
  // Scheduled Tasks
  // ==========================================================================

  // Run every hour
  $.every.hour(async () => {
    console.log('Hourly task running...')
  })

  // Run every Monday at 9am
  $.every.Monday.at9am(async () => {
    const report = await $.ai`Generate a weekly activity summary`
    await $.slack`#team ${report}`
  })

  // Run every 5 minutes
  $.every.minutes(5)(async () => {
    console.log('Health check...')
  })

  // ==========================================================================
  // Logging
  // ==========================================================================

  $.log('DO initialized successfully')
})

// =============================================================================
// Helper Types
// =============================================================================

interface User {
  id: string
  email: string
  name: string
  roles: string[]
  status?: 'active' | 'inactive'
  createdAt: number
  updatedAt: number
}

// =============================================================================
// Direct DO Configuration (Alternative Pattern)
// =============================================================================

/**
 * You can also configure a DO directly with identity properties
 */
const myDOConfig: DigitalObjectIdentity = {
  $id: 'https://myapp.do',
  $type: 'SaaS',
  $context: 'https://startups.studio',
  $version: 1,
  $createdAt: Date.now(),
  $updatedAt: Date.now(),
}

console.log('DO Config:', myDOConfig)
