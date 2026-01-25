/**
 * Defaults Registration Tests
 *
 * @description
 * Tests for the default nouns and verbs registration system.
 * This module provides:
 * - DEFAULT_NOUNS: Core entity types for Digital Objects
 * - DEFAULT_VERBS: Combines CRUD, WORKFLOW, and RELATIONSHIP verbs
 * - registerDefaults(): Function to register all defaults with collections
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
 * @see /db/collections/defaults.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_NOUNS,
  DEFAULT_VERBS,
  RELATIONSHIP_VERBS,
  registerDefaults,
  areDefaultsRegistered,
} from './defaults'
import { NounCollection, CreateNounOptions } from './nouns'
import { VerbCollection, CreateVerbOptions, CRUD_VERBS, WORKFLOW_VERBS } from './verbs'
import { DOStorage } from './base'

/**
 * Mock storage for testing
 */
class MockStorage implements DOStorage {
  private data: Map<string, unknown> = new Map()

  async sql<T>(query: string, ...params: unknown[]): Promise<T[]> {
    return []
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value)
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key)
  }

  async list<T>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>> {
    const result = new Map<string, T>()
    for (const [key, value] of this.data) {
      if (!options?.prefix || key.startsWith(options.prefix)) {
        result.set(key, value as T)
        if (options?.limit && result.size >= options.limit) break
      }
    }
    return result
  }

  clear() {
    this.data.clear()
  }
}

describe('DEFAULT_NOUNS constant', () => {
  describe('identity nouns', () => {
    it('should include User noun', () => {
      const user = DEFAULT_NOUNS.find((n) => n.name === 'User')
      expect(user).toBeDefined()
      expect(user?.singular).toBe('user')
      expect(user?.plural).toBe('users')
      expect(user?.slug).toBe('user')
    })

    it('should include Org noun', () => {
      const org = DEFAULT_NOUNS.find((n) => n.name === 'Org')
      expect(org).toBeDefined()
      expect(org?.singular).toBe('org')
      expect(org?.plural).toBe('orgs')
      expect(org?.slug).toBe('org')
    })

    it('should include Role noun', () => {
      const role = DEFAULT_NOUNS.find((n) => n.name === 'Role')
      expect(role).toBeDefined()
      expect(role?.singular).toBe('role')
      expect(role?.plural).toBe('roles')
      expect(role?.slug).toBe('role')
    })

    it('should include Permission noun', () => {
      const permission = DEFAULT_NOUNS.find((n) => n.name === 'Permission')
      expect(permission).toBeDefined()
      expect(permission?.singular).toBe('permission')
      expect(permission?.plural).toBe('permissions')
      expect(permission?.slug).toBe('permission')
    })
  })

  describe('AI nouns', () => {
    it('should include Agent noun', () => {
      const agent = DEFAULT_NOUNS.find((n) => n.name === 'Agent')
      expect(agent).toBeDefined()
      expect(agent?.singular).toBe('agent')
      expect(agent?.plural).toBe('agents')
      expect(agent?.slug).toBe('agent')
    })
  })

  describe('execution nouns', () => {
    it('should include Function noun', () => {
      const fn = DEFAULT_NOUNS.find((n) => n.name === 'Function')
      expect(fn).toBeDefined()
      expect(fn?.singular).toBe('function')
      expect(fn?.plural).toBe('functions')
      expect(fn?.slug).toBe('function')
    })

    it('should include Workflow noun', () => {
      const workflow = DEFAULT_NOUNS.find((n) => n.name === 'Workflow')
      expect(workflow).toBeDefined()
      expect(workflow?.singular).toBe('workflow')
      expect(workflow?.plural).toBe('workflows')
      expect(workflow?.slug).toBe('workflow')
    })

    it('should include Event noun', () => {
      const event = DEFAULT_NOUNS.find((n) => n.name === 'Event')
      expect(event).toBeDefined()
      expect(event?.singular).toBe('event')
      expect(event?.plural).toBe('events')
      expect(event?.slug).toBe('event')
    })

    it('should include Experiment noun', () => {
      const experiment = DEFAULT_NOUNS.find((n) => n.name === 'Experiment')
      expect(experiment).toBeDefined()
      expect(experiment?.singular).toBe('experiment')
      expect(experiment?.plural).toBe('experiments')
      expect(experiment?.slug).toBe('experiment')
    })
  })

  describe('core collection nouns', () => {
    it('should include Thing noun', () => {
      const thing = DEFAULT_NOUNS.find((n) => n.name === 'Thing')
      expect(thing).toBeDefined()
      expect(thing?.singular).toBe('thing')
      expect(thing?.plural).toBe('things')
      expect(thing?.slug).toBe('thing')
    })

    it('should include Action noun', () => {
      const action = DEFAULT_NOUNS.find((n) => n.name === 'Action')
      expect(action).toBeDefined()
      expect(action?.singular).toBe('action')
      expect(action?.plural).toBe('actions')
      expect(action?.slug).toBe('action')
    })

    it('should include Relationship noun', () => {
      const relationship = DEFAULT_NOUNS.find((n) => n.name === 'Relationship')
      expect(relationship).toBeDefined()
      expect(relationship?.singular).toBe('relationship')
      expect(relationship?.plural).toBe('relationships')
      expect(relationship?.slug).toBe('relationship')
    })
  })

  describe('integration nouns', () => {
    it('should include Integration noun', () => {
      const integration = DEFAULT_NOUNS.find((n) => n.name === 'Integration')
      expect(integration).toBeDefined()
      expect(integration?.singular).toBe('integration')
      expect(integration?.plural).toBe('integrations')
      expect(integration?.slug).toBe('integration')
    })

    it('should include Webhook noun', () => {
      const webhook = DEFAULT_NOUNS.find((n) => n.name === 'Webhook')
      expect(webhook).toBeDefined()
      expect(webhook?.singular).toBe('webhook')
      expect(webhook?.plural).toBe('webhooks')
      expect(webhook?.slug).toBe('webhook')
    })
  })

  describe('content nouns', () => {
    it('should include Page noun', () => {
      const page = DEFAULT_NOUNS.find((n) => n.name === 'Page')
      expect(page).toBeDefined()
      expect(page?.singular).toBe('page')
      expect(page?.plural).toBe('pages')
      expect(page?.slug).toBe('page')
    })

    it('should include Post noun', () => {
      const post = DEFAULT_NOUNS.find((n) => n.name === 'Post')
      expect(post).toBeDefined()
      expect(post?.singular).toBe('post')
      expect(post?.plural).toBe('posts')
      expect(post?.slug).toBe('post')
    })

    it('should include Doc noun', () => {
      const doc = DEFAULT_NOUNS.find((n) => n.name === 'Doc')
      expect(doc).toBeDefined()
      expect(doc?.singular).toBe('doc')
      expect(doc?.plural).toBe('docs')
      expect(doc?.slug).toBe('doc')
    })
  })

  describe('noun format validation', () => {
    it('should have all required fields for every noun', () => {
      for (const noun of DEFAULT_NOUNS) {
        expect(noun.name).toBeDefined()
        expect(noun.singular).toBeDefined()
        expect(noun.plural).toBeDefined()
        expect(noun.slug).toBeDefined()
        expect(typeof noun.name).toBe('string')
        expect(typeof noun.singular).toBe('string')
        expect(typeof noun.plural).toBe('string')
        expect(typeof noun.slug).toBe('string')
      }
    })

    it('should have unique slugs', () => {
      const slugs = DEFAULT_NOUNS.map((n) => n.slug)
      const uniqueSlugs = new Set(slugs)
      expect(slugs.length).toBe(uniqueSlugs.size)
    })

    it('should have unique names', () => {
      const names = DEFAULT_NOUNS.map((n) => n.name)
      const uniqueNames = new Set(names)
      expect(names.length).toBe(uniqueNames.size)
    })

    it('should have lowercase slugs', () => {
      for (const noun of DEFAULT_NOUNS) {
        expect(noun.slug).toBe(noun.slug.toLowerCase())
      }
    })

    it('should have lowercase singular forms', () => {
      for (const noun of DEFAULT_NOUNS) {
        expect(noun.singular).toBe(noun.singular.toLowerCase())
      }
    })

    it('should have lowercase plural forms', () => {
      for (const noun of DEFAULT_NOUNS) {
        expect(noun.plural).toBe(noun.plural.toLowerCase())
      }
    })
  })

  describe('expected noun count', () => {
    it('should have at least 15 default nouns', () => {
      // User, Org, Role, Permission, Agent, Function, Workflow, Event, Experiment,
      // Thing, Action, Relationship, Integration, Webhook, Page, Post, Doc
      expect(DEFAULT_NOUNS.length).toBeGreaterThanOrEqual(15)
    })
  })
})

describe('RELATIONSHIP_VERBS constant', () => {
  it('should include owns verb', () => {
    const owns = RELATIONSHIP_VERBS.find((v) => v.action === 'owns')
    expect(owns).toBeDefined()
    expect(owns?.name).toBe('Owns')
    expect(owns?.activity).toBe('owning')
    expect(owns?.event).toBe('owned')
    expect(owns?.reverse).toBe('ownedBy')
  })

  it('should include memberOf verb', () => {
    const memberOf = RELATIONSHIP_VERBS.find((v) => v.action === 'memberOf')
    expect(memberOf).toBeDefined()
    expect(memberOf?.name).toBe('MemberOf')
    expect(memberOf?.activity).toBe('joining')
    expect(memberOf?.event).toBe('joined')
    expect(memberOf?.reverse).toBe('hasMember')
  })

  it('should include belongsTo verb', () => {
    const belongsTo = RELATIONSHIP_VERBS.find((v) => v.action === 'belongsTo')
    expect(belongsTo).toBeDefined()
    expect(belongsTo?.name).toBe('BelongsTo')
    expect(belongsTo?.activity).toBe('belonging')
    expect(belongsTo?.event).toBe('belonged')
    expect(belongsTo?.reverse).toBe('has')
  })

  it('should include contains verb', () => {
    const contains = RELATIONSHIP_VERBS.find((v) => v.action === 'contains')
    expect(contains).toBeDefined()
    expect(contains?.name).toBe('Contains')
    expect(contains?.activity).toBe('containing')
    expect(contains?.event).toBe('contained')
    expect(contains?.reverse).toBe('containedBy')
  })

  it('should include references verb', () => {
    const references = RELATIONSHIP_VERBS.find((v) => v.action === 'references')
    expect(references).toBeDefined()
    expect(references?.name).toBe('References')
    expect(references?.activity).toBe('referencing')
    expect(references?.event).toBe('referenced')
    expect(references?.reverse).toBe('referencedBy')
  })

  it('should have all grammatical forms for each verb', () => {
    for (const verb of RELATIONSHIP_VERBS) {
      expect(verb.name).toBeDefined()
      expect(verb.action).toBeDefined()
      expect(verb.act).toBeDefined()
      expect(verb.activity).toBeDefined()
      expect(verb.event).toBeDefined()
      expect(verb.reverse).toBeDefined()
    }
  })

  it('should have at least 5 relationship verbs', () => {
    // owns, memberOf, belongsTo, contains, references
    expect(RELATIONSHIP_VERBS.length).toBeGreaterThanOrEqual(5)
  })
})

describe('DEFAULT_VERBS constant', () => {
  it('should include all CRUD verbs', () => {
    for (const crudVerb of CRUD_VERBS) {
      const found = DEFAULT_VERBS.find((v) => v.action === crudVerb.action)
      expect(found).toBeDefined()
    }
  })

  it('should include all workflow verbs', () => {
    for (const workflowVerb of WORKFLOW_VERBS) {
      const found = DEFAULT_VERBS.find((v) => v.action === workflowVerb.action)
      expect(found).toBeDefined()
    }
  })

  it('should include all relationship verbs', () => {
    for (const relationshipVerb of RELATIONSHIP_VERBS) {
      const found = DEFAULT_VERBS.find((v) => v.action === relationshipVerb.action)
      expect(found).toBeDefined()
    }
  })

  it('should have unique actions', () => {
    const actions = DEFAULT_VERBS.map((v) => v.action)
    const uniqueActions = new Set(actions)
    expect(actions.length).toBe(uniqueActions.size)
  })

  it('should have at least 16 default verbs', () => {
    // 4 CRUD + 7 workflow + 5 relationship = 16
    expect(DEFAULT_VERBS.length).toBeGreaterThanOrEqual(16)
  })
})

describe('registerDefaults', () => {
  let storage: MockStorage
  let nouns: NounCollection
  let verbs: VerbCollection

  beforeEach(() => {
    storage = new MockStorage()
    nouns = new NounCollection(storage)
    verbs = new VerbCollection(storage)
  })

  it('should register all default nouns', async () => {
    const result = await registerDefaults(nouns, verbs)

    expect(result.nouns).toHaveLength(DEFAULT_NOUNS.length)
    for (const defaultNoun of DEFAULT_NOUNS) {
      const registeredNoun = await nouns.getBySlug(defaultNoun.slug)
      expect(registeredNoun).toBeDefined()
      expect(registeredNoun?.name).toBe(defaultNoun.name)
    }
  })

  it('should register all default verbs', async () => {
    const result = await registerDefaults(nouns, verbs)

    expect(result.verbs).toHaveLength(DEFAULT_VERBS.length)
    for (const defaultVerb of DEFAULT_VERBS) {
      const registeredVerb = await verbs.getByAction(defaultVerb.action)
      expect(registeredVerb).toBeDefined()
      expect(registeredVerb?.name).toBe(defaultVerb.name)
    }
  })

  it('should return created nouns and verbs', async () => {
    const result = await registerDefaults(nouns, verbs)

    expect(result).toHaveProperty('nouns')
    expect(result).toHaveProperty('verbs')
    expect(Array.isArray(result.nouns)).toBe(true)
    expect(Array.isArray(result.verbs)).toBe(true)
  })

  it('should not duplicate when called twice', async () => {
    await registerDefaults(nouns, verbs)
    const secondResult = await registerDefaults(nouns, verbs)

    // Second call should return empty arrays since all already registered
    expect(secondResult.nouns).toHaveLength(0)
    expect(secondResult.verbs).toHaveLength(0)
  })

  it('should skip already registered nouns', async () => {
    // Register one noun first
    const userNoun = DEFAULT_NOUNS.find((n) => n.name === 'User')!
    await nouns.create(userNoun)

    const result = await registerDefaults(nouns, verbs)

    // Should register all others but skip User
    expect(result.nouns).toHaveLength(DEFAULT_NOUNS.length - 1)
    const userInResult = result.nouns.find((n) => n.name === 'User')
    expect(userInResult).toBeUndefined()
  })

  it('should skip already registered verbs', async () => {
    // Register one verb first
    const createVerb = DEFAULT_VERBS.find((v) => v.action === 'create')!
    await verbs.create(createVerb)

    const result = await registerDefaults(nouns, verbs)

    // Should register all others but skip create
    expect(result.verbs).toHaveLength(DEFAULT_VERBS.length - 1)
    const createInResult = result.verbs.find((v) => v.action === 'create')
    expect(createInResult).toBeUndefined()
  })

  it('should register nouns with correct singular/plural/slug', async () => {
    await registerDefaults(nouns, verbs)

    const user = await nouns.getBySlug('user')
    expect(user?.singular).toBe('user')
    expect(user?.plural).toBe('users')
    expect(user?.slug).toBe('user')

    const agent = await nouns.getBySlug('agent')
    expect(agent?.singular).toBe('agent')
    expect(agent?.plural).toBe('agents')
    expect(agent?.slug).toBe('agent')

    const workflow = await nouns.getBySlug('workflow')
    expect(workflow?.singular).toBe('workflow')
    expect(workflow?.plural).toBe('workflows')
    expect(workflow?.slug).toBe('workflow')
  })

  it('should register verbs with all grammatical forms', async () => {
    await registerDefaults(nouns, verbs)

    const create = await verbs.getByAction('create')
    expect(create?.action).toBe('create')
    expect(create?.activity).toBe('creating')
    expect(create?.event).toBe('created')
    expect(create?.reverse).toBe('createdBy')
    expect(create?.inverse).toBe('delete')

    const approve = await verbs.getByAction('approve')
    expect(approve?.action).toBe('approve')
    expect(approve?.activity).toBe('approving')
    expect(approve?.event).toBe('approved')
    expect(approve?.reverse).toBe('approvedBy')
    expect(approve?.inverse).toBe('reject')

    const owns = await verbs.getByAction('owns')
    expect(owns?.action).toBe('owns')
    expect(owns?.activity).toBe('owning')
    expect(owns?.event).toBe('owned')
    expect(owns?.reverse).toBe('ownedBy')
  })
})

describe('areDefaultsRegistered', () => {
  let storage: MockStorage
  let nouns: NounCollection
  let verbs: VerbCollection

  beforeEach(() => {
    storage = new MockStorage()
    nouns = new NounCollection(storage)
    verbs = new VerbCollection(storage)
  })

  it('should return false when no defaults are registered', async () => {
    const result = await areDefaultsRegistered(nouns, verbs)
    expect(result).toBe(false)
  })

  it('should return false when only some nouns are registered', async () => {
    const userNoun = DEFAULT_NOUNS.find((n) => n.name === 'User')!
    await nouns.create(userNoun)

    const result = await areDefaultsRegistered(nouns, verbs)
    expect(result).toBe(false)
  })

  it('should return false when only some verbs are registered', async () => {
    const createVerb = DEFAULT_VERBS.find((v) => v.action === 'create')!
    await verbs.create(createVerb)

    const result = await areDefaultsRegistered(nouns, verbs)
    expect(result).toBe(false)
  })

  it('should return true when all defaults are registered', async () => {
    await registerDefaults(nouns, verbs)

    const result = await areDefaultsRegistered(nouns, verbs)
    expect(result).toBe(true)
  })

  it('should check for specific core nouns', async () => {
    // Register all verbs
    for (const verb of DEFAULT_VERBS) {
      await verbs.create(verb)
    }

    // Register some but not all nouns
    const someNouns = DEFAULT_NOUNS.slice(0, 5)
    for (const noun of someNouns) {
      await nouns.create(noun)
    }

    const result = await areDefaultsRegistered(nouns, verbs)
    expect(result).toBe(false)
  })

  it('should check for specific core verbs', async () => {
    // Register all nouns
    for (const noun of DEFAULT_NOUNS) {
      await nouns.create(noun)
    }

    // Register some but not all verbs
    const someVerbs = DEFAULT_VERBS.slice(0, 5)
    for (const verb of someVerbs) {
      await verbs.create(verb)
    }

    const result = await areDefaultsRegistered(nouns, verbs)
    expect(result).toBe(false)
  })
})
