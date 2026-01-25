/**
 * Default Nouns and Verbs Registration
 *
 * @module collections/defaults
 *
 * @description
 * Provides default nouns and verbs for Digital Objects. These define the
 * core entity types and action types available in every DO.
 *
 * Default Nouns cover:
 * - Identity: User, Org, Role, Permission
 * - AI: Agent
 * - Execution: Function, Workflow, Event, Experiment
 * - Core: Thing, Action, Relationship
 * - Integrations: Integration, Webhook
 * - Content: Page, Post, Doc
 *
 * Default Verbs cover:
 * - CRUD: create, read, update, delete
 * - Workflow: start, stop, approve, reject, submit, complete, cancel
 * - Relationship: owns, memberOf, belongsTo, contains, references
 *
 * @example
 * ```typescript
 * import { registerDefaults, areDefaultsRegistered } from './defaults'
 *
 * // Check if defaults are registered
 * if (!await areDefaultsRegistered(nouns, verbs)) {
 *   const result = await registerDefaults(nouns, verbs)
 *   console.log(`Registered ${result.nouns.length} nouns and ${result.verbs.length} verbs`)
 * }
 * ```
 */

import type { Noun, Verb } from '../../types/collections'
import type { NounCollection, CreateNounOptions } from './nouns'
import type { VerbCollection, CreateVerbOptions } from './verbs'
import { CRUD_VERBS, WORKFLOW_VERBS } from './verbs'

/**
 * Default noun definitions for Digital Objects
 *
 * @description
 * These nouns represent the core entity types available in every DO:
 *
 * Identity:
 * - User: Human users with authentication
 * - Org: Organizations/groups of users
 * - Role: Permission groups
 * - Permission: Individual access rights
 *
 * AI:
 * - Agent: Autonomous AI agents
 *
 * Execution:
 * - Function: Executable units (code, generative, agentic, human)
 * - Workflow: Durable execution flows
 * - Event: Immutable event records
 * - Experiment: A/B testing and feature flags
 *
 * Core Collections:
 * - Thing: Generic entity instances
 * - Action: Durable action instances
 * - Relationship: Connections between entities
 *
 * Integrations:
 * - Integration: External service connections
 * - Webhook: Outbound event notifications
 *
 * Content:
 * - Page: Static pages
 * - Post: Blog posts/articles
 * - Doc: Documentation
 */
export const DEFAULT_NOUNS: CreateNounOptions[] = [
  // Identity nouns
  {
    name: 'User',
    singular: 'user',
    plural: 'users',
    slug: 'user',
    description: 'Human user with authentication',
  },
  {
    name: 'Org',
    singular: 'org',
    plural: 'orgs',
    slug: 'org',
    description: 'Organization or group of users',
  },
  {
    name: 'Role',
    singular: 'role',
    plural: 'roles',
    slug: 'role',
    description: 'Permission group for access control',
  },
  {
    name: 'Permission',
    singular: 'permission',
    plural: 'permissions',
    slug: 'permission',
    description: 'Individual access right',
  },

  // AI nouns
  {
    name: 'Agent',
    singular: 'agent',
    plural: 'agents',
    slug: 'agent',
    description: 'Autonomous AI agent',
  },

  // Execution nouns
  {
    name: 'Function',
    singular: 'function',
    plural: 'functions',
    slug: 'function',
    description: 'Executable unit (code, generative, agentic, human)',
  },
  {
    name: 'Workflow',
    singular: 'workflow',
    plural: 'workflows',
    slug: 'workflow',
    description: 'Durable execution flow',
  },
  {
    name: 'Event',
    singular: 'event',
    plural: 'events',
    slug: 'event',
    description: 'Immutable event record',
  },
  {
    name: 'Experiment',
    singular: 'experiment',
    plural: 'experiments',
    slug: 'experiment',
    description: 'A/B testing and feature flags',
  },

  // Core collection nouns
  {
    name: 'Thing',
    singular: 'thing',
    plural: 'things',
    slug: 'thing',
    description: 'Generic entity instance',
  },
  {
    name: 'Action',
    singular: 'action',
    plural: 'actions',
    slug: 'action',
    description: 'Durable action instance',
  },
  {
    name: 'Relationship',
    singular: 'relationship',
    plural: 'relationships',
    slug: 'relationship',
    description: 'Connection between entities',
  },

  // Integration nouns
  {
    name: 'Integration',
    singular: 'integration',
    plural: 'integrations',
    slug: 'integration',
    description: 'External service connection',
  },
  {
    name: 'Webhook',
    singular: 'webhook',
    plural: 'webhooks',
    slug: 'webhook',
    description: 'Outbound event notification',
  },

  // Content nouns
  {
    name: 'Page',
    singular: 'page',
    plural: 'pages',
    slug: 'page',
    description: 'Static page',
  },
  {
    name: 'Post',
    singular: 'post',
    plural: 'posts',
    slug: 'post',
    description: 'Blog post or article',
  },
  {
    name: 'Doc',
    singular: 'doc',
    plural: 'docs',
    slug: 'doc',
    description: 'Documentation',
  },
]

/**
 * Relationship verb definitions
 *
 * @description
 * These verbs define the standard relationship types between entities:
 *
 * - owns: Ownership relationship (e.g., User owns Document)
 * - memberOf: Membership relationship (e.g., User memberOf Org)
 * - belongsTo: Belonging relationship (e.g., Post belongsTo Blog)
 * - contains: Container relationship (e.g., Folder contains File)
 * - references: Reference relationship (e.g., Comment references Issue)
 */
export const RELATIONSHIP_VERBS: CreateVerbOptions[] = [
  {
    name: 'Owns',
    action: 'owns',
    act: 'own',
    activity: 'owning',
    event: 'owned',
    reverse: 'ownedBy',
    description: 'Ownership relationship',
  },
  {
    name: 'MemberOf',
    action: 'memberOf',
    act: 'join',
    activity: 'joining',
    event: 'joined',
    reverse: 'hasMember',
    description: 'Membership relationship',
  },
  {
    name: 'BelongsTo',
    action: 'belongsTo',
    act: 'belong',
    activity: 'belonging',
    event: 'belonged',
    reverse: 'has',
    description: 'Belonging relationship',
  },
  {
    name: 'Contains',
    action: 'contains',
    act: 'contain',
    activity: 'containing',
    event: 'contained',
    reverse: 'containedBy',
    description: 'Container relationship',
  },
  {
    name: 'References',
    action: 'references',
    act: 'ref',
    activity: 'referencing',
    event: 'referenced',
    reverse: 'referencedBy',
    description: 'Reference relationship',
  },
]

/**
 * All default verbs combining CRUD, workflow, and relationship verbs
 *
 * @description
 * This combines:
 * - CRUD_VERBS: create, read, update, delete
 * - WORKFLOW_VERBS: start, stop, approve, reject, submit, complete, cancel
 * - RELATIONSHIP_VERBS: owns, memberOf, belongsTo, contains, references
 */
export const DEFAULT_VERBS: CreateVerbOptions[] = [...CRUD_VERBS, ...WORKFLOW_VERBS, ...RELATIONSHIP_VERBS]

/**
 * Result of registering defaults
 */
export interface RegisterDefaultsResult {
  /** Newly created nouns */
  nouns: Noun[]
  /** Newly created verbs */
  verbs: Verb[]
}

/**
 * Register all default nouns and verbs
 *
 * @param nouns - NounCollection to register nouns in
 * @param verbs - VerbCollection to register verbs in
 * @returns Object containing arrays of newly created nouns and verbs
 *
 * @description
 * Registers all DEFAULT_NOUNS and DEFAULT_VERBS with the provided collections.
 * Skips any nouns/verbs that already exist (idempotent operation).
 *
 * @example
 * ```typescript
 * const result = await registerDefaults(nouns, verbs)
 * console.log(`Registered ${result.nouns.length} nouns`)
 * console.log(`Registered ${result.verbs.length} verbs`)
 * ```
 */
export async function registerDefaults(nouns: NounCollection, verbs: VerbCollection): Promise<RegisterDefaultsResult> {
  const createdNouns: Noun[] = []
  const createdVerbs: Verb[] = []

  // Register nouns, skipping existing ones
  for (const nounData of DEFAULT_NOUNS) {
    const existing = await nouns.getBySlug(nounData.slug)
    if (!existing) {
      const created = await nouns.create(nounData)
      createdNouns.push(created)
    }
  }

  // Register verbs, skipping existing ones
  for (const verbData of DEFAULT_VERBS) {
    const existing = await verbs.getByAction(verbData.action)
    if (!existing) {
      const created = await verbs.create(verbData)
      createdVerbs.push(created)
    }
  }

  return {
    nouns: createdNouns,
    verbs: createdVerbs,
  }
}

/**
 * Check if all default nouns and verbs are registered
 *
 * @param nouns - NounCollection to check
 * @param verbs - VerbCollection to check
 * @returns True if all defaults are registered
 *
 * @description
 * Verifies that all DEFAULT_NOUNS and DEFAULT_VERBS exist in the collections.
 * Returns false if any are missing.
 *
 * @example
 * ```typescript
 * if (!await areDefaultsRegistered(nouns, verbs)) {
 *   await registerDefaults(nouns, verbs)
 * }
 * ```
 */
export async function areDefaultsRegistered(nouns: NounCollection, verbs: VerbCollection): Promise<boolean> {
  // Check all nouns exist
  for (const nounData of DEFAULT_NOUNS) {
    const existing = await nouns.getBySlug(nounData.slug)
    if (!existing) {
      return false
    }
  }

  // Check all verbs exist
  for (const verbData of DEFAULT_VERBS) {
    const existing = await verbs.getByAction(verbData.action)
    if (!existing) {
      return false
    }
  }

  return true
}
