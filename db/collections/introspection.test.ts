/**
 * Introspection Tests - Type introspection/self-reflection for Digital Objects
 *
 * @description
 * Tests for the DO introspection API which provides schema reflection capabilities:
 * - getSchema(): Returns all registered nouns with their schemas
 * - getVerbs(): Returns all registered verbs with grammatical forms
 * - getStats(): Returns counts for things, actions, relationships
 * - getRelationshipTypes(): Returns all relationship types in use
 * - Full introspection response for RPC serialization
 *
 * These tests are part of the RED phase - they should FAIL because
 * introspection.ts has not been implemented yet.
 *
 * @see /db/collections/introspection.ts (to be created in GREEN phase)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { DOStorage } from './base'
import type { Noun, Verb, Relationship } from '../../types/collections'
import type { RelationOperator } from '../../types/cascade'

// Import the module under test - this will fail initially as the file doesn't exist
import {
  Introspection,
  getSchema,
  getVerbs,
  getStats,
  getRelationshipTypes,
  type IntrospectionResult,
  type NounSchema,
  type VerbForms,
  type CollectionStats,
  type CascadeAnnotation,
} from './introspection'

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

  // Helper to seed test data
  seed(prefix: string, items: Array<{ id: string; [key: string]: unknown }>) {
    for (const item of items) {
      this.data.set(`${prefix}:${item.id}`, item)
    }
  }
}

describe('Introspection', () => {
  let storage: MockStorage
  let introspection: Introspection

  beforeEach(() => {
    storage = new MockStorage()
    introspection = new Introspection(storage)
  })

  // ===========================================================================
  // getSchema() - Returns all nouns with their schemas
  // ===========================================================================

  describe('getSchema()', () => {
    it('should return all registered nouns with their schemas', async () => {
      // Seed test nouns
      storage.seed('nouns', [
        {
          id: 'noun_customer',
          name: 'Customer',
          singular: 'customer',
          plural: 'customers',
          slug: 'customer',
          schema: {
            name: 'string',
            email: 'string',
            company: '~>Company',
          },
        },
        {
          id: 'noun_order',
          name: 'Order',
          singular: 'order',
          plural: 'orders',
          slug: 'order',
          schema: {
            customer: '->Customer',
            items: ['->OrderItem'],
            total: 'number',
          },
        },
      ])

      const schemas = await introspection.getSchema()

      expect(schemas).toHaveLength(2)
      expect(schemas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Customer',
            slug: 'customer',
            schema: expect.objectContaining({
              name: 'string',
              email: 'string',
            }),
          }),
          expect.objectContaining({
            name: 'Order',
            slug: 'order',
          }),
        ])
      )
    })

    it('should return empty array when no nouns are registered', async () => {
      const schemas = await introspection.getSchema()

      expect(schemas).toEqual([])
    })

    it('should include cascade operator annotations in schema', async () => {
      storage.seed('nouns', [
        {
          id: 'noun_startup',
          name: 'Startup',
          singular: 'startup',
          plural: 'startups',
          slug: 'startup',
          schema: {
            idea: '<-Idea', // Backward insert
            founders: ['->Founder'], // Forward insert array
            industry: '~>Industry', // Forward search
            investors: ['<~Investor'], // Backward search array
          },
        },
      ])

      const schemas = await introspection.getSchema()

      expect(schemas[0]).toMatchObject({
        name: 'Startup',
        cascadeAnnotations: expect.arrayContaining([
          expect.objectContaining({
            field: 'idea',
            operator: '<-',
            targetType: 'Idea',
            direction: 'backward',
            method: 'insert',
          }),
          expect.objectContaining({
            field: 'founders',
            operator: '->',
            targetType: 'Founder',
            isArray: true,
            direction: 'forward',
            method: 'insert',
          }),
          expect.objectContaining({
            field: 'industry',
            operator: '~>',
            targetType: 'Industry',
            direction: 'forward',
            method: 'search',
          }),
          expect.objectContaining({
            field: 'investors',
            operator: '<~',
            targetType: 'Investor',
            isArray: true,
            direction: 'backward',
            method: 'search',
          }),
        ]),
      })
    })

    it('should filter schema by noun name', async () => {
      storage.seed('nouns', [
        {
          id: 'noun_customer',
          name: 'Customer',
          singular: 'customer',
          plural: 'customers',
          slug: 'customer',
          schema: { name: 'string' },
        },
        {
          id: 'noun_order',
          name: 'Order',
          singular: 'order',
          plural: 'orders',
          slug: 'order',
          schema: { total: 'number' },
        },
      ])

      const schemas = await introspection.getSchema('Customer')

      expect(schemas).toHaveLength(1)
      expect(schemas[0].name).toBe('Customer')
    })

    it('should return empty array when filtering by non-existent noun name', async () => {
      storage.seed('nouns', [
        {
          id: 'noun_customer',
          name: 'Customer',
          singular: 'customer',
          plural: 'customers',
          slug: 'customer',
          schema: { name: 'string' },
        },
      ])

      const schemas = await introspection.getSchema('NonExistent')

      expect(schemas).toEqual([])
    })

    it('should return schema for single noun lookup', async () => {
      storage.seed('nouns', [
        {
          id: 'noun_customer',
          name: 'Customer',
          singular: 'customer',
          plural: 'customers',
          slug: 'customer',
          schema: { name: 'string', email: 'string' },
          description: 'A business customer',
        },
      ])

      const schema = await introspection.getNounSchema('customer')

      expect(schema).not.toBeNull()
      expect(schema).toMatchObject({
        name: 'Customer',
        slug: 'customer',
        singular: 'customer',
        plural: 'customers',
        description: 'A business customer',
        schema: { name: 'string', email: 'string' },
      })
    })

    it('should return null for non-existent noun slug lookup', async () => {
      const schema = await introspection.getNounSchema('nonexistent')

      expect(schema).toBeNull()
    })
  })

  // ===========================================================================
  // getVerbs() - Returns all verbs with grammatical forms
  // ===========================================================================

  describe('getVerbs()', () => {
    it('should return all registered verbs with their forms', async () => {
      storage.seed('verbs', [
        {
          id: 'verb_create',
          name: 'Create',
          action: 'create',
          act: 'new',
          activity: 'creating',
          event: 'created',
          reverse: 'createdBy',
          inverse: 'delete',
        },
        {
          id: 'verb_update',
          name: 'Update',
          action: 'update',
          act: 'set',
          activity: 'updating',
          event: 'updated',
          reverse: 'updatedBy',
        },
      ])

      const verbs = await introspection.getVerbs()

      expect(verbs).toHaveLength(2)
      expect(verbs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'create',
            activity: 'creating',
            event: 'created',
            reverse: 'createdBy',
            inverse: 'delete',
          }),
          expect.objectContaining({
            action: 'update',
            activity: 'updating',
            event: 'updated',
            reverse: 'updatedBy',
          }),
        ])
      )
    })

    it('should return empty array when no verbs are registered', async () => {
      const verbs = await introspection.getVerbs()

      expect(verbs).toEqual([])
    })

    it('should filter verbs by action name', async () => {
      storage.seed('verbs', [
        {
          id: 'verb_create',
          name: 'Create',
          action: 'create',
          act: 'new',
          activity: 'creating',
          event: 'created',
          reverse: 'createdBy',
        },
        {
          id: 'verb_delete',
          name: 'Delete',
          action: 'delete',
          act: 'del',
          activity: 'deleting',
          event: 'deleted',
          reverse: 'deletedBy',
        },
      ])

      const verbs = await introspection.getVerbs('create')

      expect(verbs).toHaveLength(1)
      expect(verbs[0].action).toBe('create')
    })

    it('should include all grammatical forms for each verb', async () => {
      storage.seed('verbs', [
        {
          id: 'verb_subscribe',
          name: 'Subscribe',
          action: 'subscribe',
          act: 'sub',
          activity: 'subscribing',
          event: 'subscribed',
          reverse: 'subscribedBy',
          inverse: 'unsubscribe',
          description: 'Subscribe to a service',
        },
      ])

      const verbs = await introspection.getVerbs()

      expect(verbs[0]).toMatchObject({
        name: 'Subscribe',
        action: 'subscribe',
        act: 'sub',
        activity: 'subscribing',
        event: 'subscribed',
        reverse: 'subscribedBy',
        inverse: 'unsubscribe',
        description: 'Subscribe to a service',
      })
    })

    it('should return single verb by action lookup', async () => {
      storage.seed('verbs', [
        {
          id: 'verb_approve',
          name: 'Approve',
          action: 'approve',
          act: 'ok',
          activity: 'approving',
          event: 'approved',
          reverse: 'approvedBy',
          inverse: 'reject',
        },
      ])

      const verb = await introspection.getVerbByAction('approve')

      expect(verb).not.toBeNull()
      expect(verb).toMatchObject({
        action: 'approve',
        event: 'approved',
        inverse: 'reject',
      })
    })

    it('should return null for non-existent verb action lookup', async () => {
      const verb = await introspection.getVerbByAction('nonexistent')

      expect(verb).toBeNull()
    })
  })

  // ===========================================================================
  // getStats() - Returns counts for things, actions, relationships
  // ===========================================================================

  describe('getStats()', () => {
    it('should return counts for things, actions, and relationships', async () => {
      // Seed things
      storage.seed('things', [
        { id: 'thing_1', $type: 'Customer', $id: 'thing_1' },
        { id: 'thing_2', $type: 'Customer', $id: 'thing_2' },
        { id: 'thing_3', $type: 'Order', $id: 'thing_3' },
      ])

      // Seed actions
      storage.seed('actions', [
        { id: 'action_1', verb: 'create', status: 'completed' },
        { id: 'action_2', verb: 'update', status: 'running' },
      ])

      // Seed relationships
      storage.seed('relationships', [
        { id: 'rel_1', from: 'thing_1', to: 'thing_3', type: 'hasOrder' },
      ])

      const stats = await introspection.getStats()

      expect(stats).toMatchObject({
        things: {
          total: 3,
          byType: {
            Customer: 2,
            Order: 1,
          },
        },
        actions: {
          total: 2,
          byStatus: {
            completed: 1,
            running: 1,
          },
        },
        relationships: {
          total: 1,
        },
      })
    })

    it('should return zero counts when collections are empty', async () => {
      const stats = await introspection.getStats()

      expect(stats).toMatchObject({
        things: {
          total: 0,
          byType: {},
        },
        actions: {
          total: 0,
          byStatus: {},
        },
        relationships: {
          total: 0,
        },
      })
    })

    it('should include noun and verb counts in stats', async () => {
      storage.seed('nouns', [
        { id: 'noun_1', name: 'Customer', slug: 'customer' },
        { id: 'noun_2', name: 'Order', slug: 'order' },
      ])

      storage.seed('verbs', [
        { id: 'verb_1', action: 'create' },
        { id: 'verb_2', action: 'update' },
        { id: 'verb_3', action: 'delete' },
      ])

      const stats = await introspection.getStats()

      expect(stats.nouns).toBe(2)
      expect(stats.verbs).toBe(3)
    })

    it('should count things by type correctly', async () => {
      storage.seed('things', [
        { id: 'thing_1', $type: 'User', $id: 'thing_1' },
        { id: 'thing_2', $type: 'User', $id: 'thing_2' },
        { id: 'thing_3', $type: 'User', $id: 'thing_3' },
        { id: 'thing_4', $type: 'Agent', $id: 'thing_4' },
        { id: 'thing_5', $type: 'Product', $id: 'thing_5' },
        { id: 'thing_6', $type: 'Product', $id: 'thing_6' },
      ])

      const stats = await introspection.getStats()

      expect(stats.things.byType).toEqual({
        User: 3,
        Agent: 1,
        Product: 2,
      })
    })

    it('should count actions by status correctly', async () => {
      storage.seed('actions', [
        { id: 'a1', verb: 'create', status: 'pending' },
        { id: 'a2', verb: 'update', status: 'pending' },
        { id: 'a3', verb: 'process', status: 'running' },
        { id: 'a4', verb: 'notify', status: 'completed' },
        { id: 'a5', verb: 'sync', status: 'completed' },
        { id: 'a6', verb: 'validate', status: 'completed' },
        { id: 'a7', verb: 'send', status: 'failed' },
      ])

      const stats = await introspection.getStats()

      expect(stats.actions.byStatus).toEqual({
        pending: 2,
        running: 1,
        completed: 3,
        failed: 1,
      })
    })
  })

  // ===========================================================================
  // getRelationshipTypes() - Returns all relationship types in use
  // ===========================================================================

  describe('getRelationshipTypes()', () => {
    it('should return all unique relationship types', async () => {
      storage.seed('relationships', [
        { id: 'rel_1', from: 'a', to: 'b', type: 'hasOrder' },
        { id: 'rel_2', from: 'b', to: 'c', type: 'belongsTo' },
        { id: 'rel_3', from: 'c', to: 'd', type: 'hasOrder' },
        { id: 'rel_4', from: 'd', to: 'e', type: 'manages' },
      ])

      const types = await introspection.getRelationshipTypes()

      expect(types).toHaveLength(3)
      expect(types).toEqual(expect.arrayContaining(['hasOrder', 'belongsTo', 'manages']))
    })

    it('should return empty array when no relationships exist', async () => {
      const types = await introspection.getRelationshipTypes()

      expect(types).toEqual([])
    })

    it('should return types with usage count', async () => {
      storage.seed('relationships', [
        { id: 'rel_1', from: 'a', to: 'b', type: 'hasChild' },
        { id: 'rel_2', from: 'b', to: 'c', type: 'hasChild' },
        { id: 'rel_3', from: 'c', to: 'd', type: 'hasChild' },
        { id: 'rel_4', from: 'a', to: 'x', type: 'belongsTo' },
      ])

      const typesWithCounts = await introspection.getRelationshipTypesWithCounts()

      expect(typesWithCounts).toEqual(
        expect.arrayContaining([
          { type: 'hasChild', count: 3 },
          { type: 'belongsTo', count: 1 },
        ])
      )
    })

    it('should sort relationship types by count descending', async () => {
      storage.seed('relationships', [
        { id: 'rel_1', from: 'a', to: 'b', type: 'rare' },
        { id: 'rel_2', from: 'b', to: 'c', type: 'common' },
        { id: 'rel_3', from: 'c', to: 'd', type: 'common' },
        { id: 'rel_4', from: 'd', to: 'e', type: 'common' },
        { id: 'rel_5', from: 'e', to: 'f', type: 'medium' },
        { id: 'rel_6', from: 'f', to: 'g', type: 'medium' },
      ])

      const typesWithCounts = await introspection.getRelationshipTypesWithCounts()

      expect(typesWithCounts[0].type).toBe('common')
      expect(typesWithCounts[0].count).toBe(3)
      expect(typesWithCounts[1].type).toBe('medium')
      expect(typesWithCounts[1].count).toBe(2)
      expect(typesWithCounts[2].type).toBe('rare')
      expect(typesWithCounts[2].count).toBe(1)
    })
  })

  // ===========================================================================
  // Available Cascade Operators
  // ===========================================================================

  describe('getCascadeOperators()', () => {
    it('should return all available cascade operators with descriptions', async () => {
      const operators = await introspection.getCascadeOperators()

      expect(operators).toEqual([
        {
          operator: '->',
          name: 'ForwardInsert',
          description: 'Create entity, link TO it',
          direction: 'forward',
          method: 'insert',
        },
        {
          operator: '~>',
          name: 'ForwardSearch',
          description: 'Vector search existing, link TO it',
          direction: 'forward',
          method: 'search',
        },
        {
          operator: '<-',
          name: 'BackwardInsert',
          description: 'Create entity, link FROM it (it owns us)',
          direction: 'backward',
          method: 'insert',
        },
        {
          operator: '<~',
          name: 'BackwardSearch',
          description: 'Vector search existing, link FROM it',
          direction: 'backward',
          method: 'search',
        },
      ])
    })

    it('should return operators used in current schemas', async () => {
      storage.seed('nouns', [
        {
          id: 'noun_startup',
          name: 'Startup',
          slug: 'startup',
          schema: {
            idea: '<-Idea',
            founders: ['->Founder'],
          },
        },
        {
          id: 'noun_customer',
          name: 'Customer',
          slug: 'customer',
          schema: {
            company: '~>Company',
          },
        },
      ])

      const usedOperators = await introspection.getUsedCascadeOperators()

      expect(usedOperators).toHaveLength(3)
      expect(usedOperators).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ operator: '->' }),
          expect.objectContaining({ operator: '<-' }),
          expect.objectContaining({ operator: '~>' }),
        ])
      )
    })
  })

  // ===========================================================================
  // Full Introspection Response (JSON-serializable for RPC)
  // ===========================================================================

  describe('introspect()', () => {
    it('should return full introspection response', async () => {
      // Seed test data
      storage.seed('nouns', [
        {
          id: 'noun_customer',
          name: 'Customer',
          singular: 'customer',
          plural: 'customers',
          slug: 'customer',
          schema: { name: 'string', company: '~>Company' },
        },
      ])

      storage.seed('verbs', [
        {
          id: 'verb_create',
          name: 'Create',
          action: 'create',
          act: 'new',
          activity: 'creating',
          event: 'created',
          reverse: 'createdBy',
        },
      ])

      storage.seed('things', [
        { id: 'thing_1', $type: 'Customer', $id: 'thing_1' },
      ])

      storage.seed('relationships', [
        { id: 'rel_1', from: 'thing_1', to: 'thing_2', type: 'belongsTo' },
      ])

      const result = await introspection.introspect()

      expect(result).toMatchObject({
        version: 1,
        nouns: expect.arrayContaining([
          expect.objectContaining({ name: 'Customer' }),
        ]),
        verbs: expect.arrayContaining([
          expect.objectContaining({ action: 'create' }),
        ]),
        stats: expect.objectContaining({
          things: expect.objectContaining({ total: 1 }),
          relationships: expect.objectContaining({ total: 1 }),
        }),
        relationshipTypes: expect.arrayContaining(['belongsTo']),
        cascadeOperators: expect.arrayContaining([
          expect.objectContaining({ operator: '->' }),
        ]),
      })
    })

    it('should be JSON serializable for RPC transport', async () => {
      storage.seed('nouns', [
        {
          id: 'noun_1',
          name: 'Test',
          slug: 'test',
          schema: { field: 'string' },
        },
      ])

      const result = await introspection.introspect()

      // Should be serializable to JSON and back without data loss
      const serialized = JSON.stringify(result)
      const deserialized = JSON.parse(serialized)

      expect(deserialized).toEqual(result)
    })

    it('should include timestamp in introspection result', async () => {
      const before = Date.now()
      const result = await introspection.introspect()
      const after = Date.now()

      expect(result.timestamp).toBeGreaterThanOrEqual(before)
      expect(result.timestamp).toBeLessThanOrEqual(after)
    })

    it('should handle empty collections gracefully', async () => {
      const result = await introspection.introspect()

      expect(result).toMatchObject({
        version: 1,
        nouns: [],
        verbs: [],
        stats: {
          nouns: 0,
          verbs: 0,
          things: { total: 0, byType: {} },
          actions: { total: 0, byStatus: {} },
          relationships: { total: 0 },
        },
        relationshipTypes: [],
      })
    })
  })

  // ===========================================================================
  // Schema with Cascade Operators
  // ===========================================================================

  describe('schema cascade annotations', () => {
    it('should extract cascade operator from forward insert field', async () => {
      storage.seed('nouns', [
        {
          id: 'noun_1',
          name: 'Parent',
          slug: 'parent',
          schema: {
            children: '->Child',
          },
        },
      ])

      const schemas = await introspection.getSchema()

      expect(schemas[0].cascadeAnnotations).toContainEqual({
        field: 'children',
        operator: '->',
        targetType: 'Child',
        isArray: false,
        isOptional: false,
        direction: 'forward',
        method: 'insert',
      })
    })

    it('should extract cascade operator from forward search field', async () => {
      storage.seed('nouns', [
        {
          id: 'noun_1',
          name: 'Customer',
          slug: 'customer',
          schema: {
            industry: '~>Industry',
          },
        },
      ])

      const schemas = await introspection.getSchema()

      expect(schemas[0].cascadeAnnotations).toContainEqual({
        field: 'industry',
        operator: '~>',
        targetType: 'Industry',
        isArray: false,
        isOptional: false,
        direction: 'forward',
        method: 'search',
      })
    })

    it('should extract cascade operator from backward insert field', async () => {
      storage.seed('nouns', [
        {
          id: 'noun_1',
          name: 'Startup',
          slug: 'startup',
          schema: {
            idea: '<-Idea',
          },
        },
      ])

      const schemas = await introspection.getSchema()

      expect(schemas[0].cascadeAnnotations).toContainEqual({
        field: 'idea',
        operator: '<-',
        targetType: 'Idea',
        isArray: false,
        isOptional: false,
        direction: 'backward',
        method: 'insert',
      })
    })

    it('should extract cascade operator from backward search field', async () => {
      storage.seed('nouns', [
        {
          id: 'noun_1',
          name: 'Product',
          slug: 'product',
          schema: {
            category: '<~Category',
          },
        },
      ])

      const schemas = await introspection.getSchema()

      expect(schemas[0].cascadeAnnotations).toContainEqual({
        field: 'category',
        operator: '<~',
        targetType: 'Category',
        isArray: false,
        isOptional: false,
        direction: 'backward',
        method: 'search',
      })
    })

    it('should handle array cascade fields', async () => {
      storage.seed('nouns', [
        {
          id: 'noun_1',
          name: 'Team',
          slug: 'team',
          schema: {
            members: ['->Member'],
          },
        },
      ])

      const schemas = await introspection.getSchema()

      expect(schemas[0].cascadeAnnotations).toContainEqual({
        field: 'members',
        operator: '->',
        targetType: 'Member',
        isArray: true,
        isOptional: false,
        direction: 'forward',
        method: 'insert',
      })
    })

    it('should handle optional cascade fields', async () => {
      storage.seed('nouns', [
        {
          id: 'noun_1',
          name: 'User',
          slug: 'user',
          schema: {
            manager: '~>Manager?',
          },
        },
      ])

      const schemas = await introspection.getSchema()

      expect(schemas[0].cascadeAnnotations).toContainEqual({
        field: 'manager',
        operator: '~>',
        targetType: 'Manager',
        isArray: false,
        isOptional: true,
        direction: 'forward',
        method: 'search',
      })
    })

    it('should handle fields with prompts and cascade operators', async () => {
      storage.seed('nouns', [
        {
          id: 'noun_1',
          name: 'Startup',
          slug: 'startup',
          schema: {
            founders: 'Who are the founders? ->Founder[]',
          },
        },
      ])

      const schemas = await introspection.getSchema()

      expect(schemas[0].cascadeAnnotations).toContainEqual({
        field: 'founders',
        operator: '->',
        targetType: 'Founder',
        isArray: true,
        isOptional: false,
        direction: 'forward',
        method: 'insert',
        prompt: 'Who are the founders?',
      })
    })

    it('should handle cascade fields with fallback types', async () => {
      storage.seed('nouns', [
        {
          id: 'noun_1',
          name: 'Employee',
          slug: 'employee',
          schema: {
            occupation: '<~Occupation|Role|JobType',
          },
        },
      ])

      const schemas = await introspection.getSchema()

      expect(schemas[0].cascadeAnnotations).toContainEqual({
        field: 'occupation',
        operator: '<~',
        targetType: 'Occupation',
        fallbackTypes: ['Role', 'JobType'],
        isArray: false,
        isOptional: false,
        direction: 'backward',
        method: 'search',
      })
    })

    it('should ignore non-cascade schema fields', async () => {
      storage.seed('nouns', [
        {
          id: 'noun_1',
          name: 'Product',
          slug: 'product',
          schema: {
            name: 'string',
            price: 'number',
            active: 'boolean',
            category: '~>Category', // Only this is a cascade field
          },
        },
      ])

      const schemas = await introspection.getSchema()

      expect(schemas[0].cascadeAnnotations).toHaveLength(1)
      expect(schemas[0].cascadeAnnotations[0].field).toBe('category')
    })
  })

  // ===========================================================================
  // Type Exports and Interfaces
  // ===========================================================================

  describe('type exports', () => {
    it('should export IntrospectionResult type', () => {
      const result: IntrospectionResult = {
        version: 1,
        timestamp: Date.now(),
        nouns: [],
        verbs: [],
        stats: {
          nouns: 0,
          verbs: 0,
          things: { total: 0, byType: {} },
          actions: { total: 0, byStatus: {} },
          relationships: { total: 0 },
        },
        relationshipTypes: [],
        cascadeOperators: [],
      }

      expect(result.version).toBe(1)
    })

    it('should export NounSchema type', () => {
      const schema: NounSchema = {
        id: 'noun_1',
        name: 'Test',
        singular: 'test',
        plural: 'tests',
        slug: 'test',
        schema: {},
        cascadeAnnotations: [],
      }

      expect(schema.name).toBe('Test')
    })

    it('should export VerbForms type', () => {
      const verb: VerbForms = {
        id: 'verb_1',
        name: 'Create',
        action: 'create',
        act: 'new',
        activity: 'creating',
        event: 'created',
        reverse: 'createdBy',
      }

      expect(verb.action).toBe('create')
    })

    it('should export CollectionStats type', () => {
      const stats: CollectionStats = {
        nouns: 0,
        verbs: 0,
        things: { total: 0, byType: {} },
        actions: { total: 0, byStatus: {} },
        relationships: { total: 0 },
      }

      expect(stats.things.total).toBe(0)
    })

    it('should export CascadeAnnotation type', () => {
      const annotation: CascadeAnnotation = {
        field: 'parent',
        operator: '->',
        targetType: 'Parent',
        isArray: false,
        isOptional: false,
        direction: 'forward',
        method: 'insert',
      }

      expect(annotation.operator).toBe('->')
    })
  })

  // ===========================================================================
  // Standalone Functions (for convenience)
  // ===========================================================================

  describe('standalone functions', () => {
    it('should provide getSchema as standalone function', async () => {
      storage.seed('nouns', [
        {
          id: 'noun_1',
          name: 'Test',
          slug: 'test',
          schema: {},
        },
      ])

      const schemas = await getSchema(storage)

      expect(schemas).toHaveLength(1)
    })

    it('should provide getVerbs as standalone function', async () => {
      storage.seed('verbs', [
        {
          id: 'verb_1',
          action: 'test',
          act: 't',
          activity: 'testing',
          event: 'tested',
          reverse: 'testedBy',
        },
      ])

      const verbs = await getVerbs(storage)

      expect(verbs).toHaveLength(1)
    })

    it('should provide getStats as standalone function', async () => {
      const stats = await getStats(storage)

      expect(stats).toMatchObject({
        things: { total: 0 },
      })
    })

    it('should provide getRelationshipTypes as standalone function', async () => {
      storage.seed('relationships', [
        { id: 'rel_1', from: 'a', to: 'b', type: 'owns' },
      ])

      const types = await getRelationshipTypes(storage)

      expect(types).toContain('owns')
    })
  })
})
