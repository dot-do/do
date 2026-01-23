/**
 * Relationships Collection Tests - RED Phase
 *
 * @description
 * Tests for RelationshipCollection covering:
 * - Forward insert (->) operator
 * - Forward search (~>) operator
 * - Backward insert (<-) operator
 * - Backward search (<~) operator
 * - Bidirectional relations
 * - Relation traversal
 * - Cascade processing
 *
 * These tests should FAIL initially (Red phase) until implementation is complete.
 *
 * @see /src/collections/relationships.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { Relationship } from '../../types/collections'
import type {
  RelationOperator,
  RelationFieldDefinition,
} from '../../types/cascade'
import {
  RelationshipCollection,
  CreateRelationshipOptions,
  RelationshipQueryOptions,
  TraversalResult,
} from './relationships'
import { DOStorage } from './base'

/**
 * Mock storage implementation
 */
class MockStorage implements DOStorage {
  private data: Map<string, unknown> = new Map()

  async sql<T>(_query: string, ..._params: unknown[]): Promise<T[]> {
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

describe('RelationshipCollection', () => {
  let storage: MockStorage
  let relationships: RelationshipCollection

  beforeEach(() => {
    storage = new MockStorage()
    relationships = new RelationshipCollection(storage)
  })

  // ===========================================================================
  // FORWARD INSERT: -> (Create entity, link TO it)
  // ===========================================================================

  describe('Forward Insert (->)', () => {
    it('should parse -> operator correctly', () => {
      const parsed = relationships['parseOperator']('->')

      expect(parsed.direction).toBe('forward')
      expect(parsed.method).toBe('insert')
    })

    it('should create forward relationship', async () => {
      const rel = await relationships.create({
        from: 'customer-1',
        to: 'contact-1',
        type: 'hasContact',
      })

      expect(rel.id).toBeDefined()
      expect(rel.from).toBe('customer-1')
      expect(rel.to).toBe('contact-1')
      expect(rel.type).toBe('hasContact')
    })

    it('should create relationship with cascade operator', async () => {
      const rel = await relationships.createWithOperator(
        'customer-1',
        '->',
        'Contact',
        'contact-1',
        'primaryContact'
      )

      expect(rel.from).toBe('customer-1')
      expect(rel.to).toBe('contact-1')
      expect(rel.data?.relType).toBe('forward')
    })

    it('should support relationship data', async () => {
      const rel = await relationships.create({
        from: 'customer-1',
        to: 'contact-1',
        type: 'hasContact',
        data: {
          isPrimary: true,
          createdBy: 'user-1',
        },
      })

      expect(rel.data?.isPrimary).toBe(true)
      expect(rel.data?.createdBy).toBe('user-1')
    })
  })

  // ===========================================================================
  // FORWARD SEARCH: ~> (Vector search existing, link TO it)
  // ===========================================================================

  describe('Forward Search (~>)', () => {
    it('should parse ~> operator correctly', () => {
      const parsed = relationships['parseOperator']('~>')

      expect(parsed.direction).toBe('forward')
      expect(parsed.method).toBe('search')
    })

    it('should create fuzzy forward relationship', async () => {
      const rel = await relationships.createWithOperator(
        'customer-1',
        '~>',
        'Company',
        'company-1',
        'company'
      )

      expect(rel.from).toBe('customer-1')
      expect(rel.to).toBe('company-1')
      expect(rel.data?.relType).toBe('fuzzyForward')
    })

    it('should store match metadata for fuzzy relations', async () => {
      const rel = await relationships.create({
        from: 'customer-1',
        to: 'company-1',
        type: 'company',
        data: {
          relType: 'fuzzyForward',
          matchScore: 0.92,
          matchedBy: 'vector-search',
        },
      })

      expect(rel.data?.matchScore).toBe(0.92)
    })
  })

  // ===========================================================================
  // BACKWARD INSERT: <- (Create entity, link FROM it - it owns us)
  // ===========================================================================

  describe('Backward Insert (<-)', () => {
    it('should parse <- operator correctly', () => {
      const parsed = relationships['parseOperator']('<-')

      expect(parsed.direction).toBe('backward')
      expect(parsed.method).toBe('insert')
    })

    it('should create backward relationship (target owns source)', async () => {
      const rel = await relationships.createWithOperator(
        'startup-1',
        '<-',
        'Idea',
        'idea-1',
        'idea'
      )

      // For backward: the Idea (target) owns the Startup (source)
      expect(rel.from).toBe('idea-1')
      expect(rel.to).toBe('startup-1')
      expect(rel.data?.relType).toBe('backward')
    })

    it('should support SalesRep owning Customer pattern', async () => {
      const rel = await relationships.createWithOperator(
        'customer-1',
        '<-',
        'SalesRep',
        'rep-1',
        'owner'
      )

      // SalesRep owns Customer
      expect(rel.from).toBe('rep-1')
      expect(rel.to).toBe('customer-1')
    })
  })

  // ===========================================================================
  // BACKWARD SEARCH: <~ (Vector search existing, link FROM it)
  // ===========================================================================

  describe('Backward Search (<~)', () => {
    it('should parse <~ operator correctly', () => {
      const parsed = relationships['parseOperator']('<~')

      expect(parsed.direction).toBe('backward')
      expect(parsed.method).toBe('search')
    })

    it('should create fuzzy backward relationship', async () => {
      const rel = await relationships.createWithOperator(
        'customer-1',
        '<~',
        'Industry',
        'industry-1',
        'industry'
      )

      // Industry owns Customer (backward)
      expect(rel.from).toBe('industry-1')
      expect(rel.to).toBe('customer-1')
      expect(rel.data?.relType).toBe('fuzzyBackward')
    })
  })

  // ===========================================================================
  // BIDIRECTIONAL RELATIONS
  // ===========================================================================

  describe('Bidirectional Relations', () => {
    it('should create bidirectional relationship pair', async () => {
      const [forward, inverse] = await relationships.createBidirectional(
        {
          from: 'manager-1',
          to: 'employee-1',
          type: 'manages',
        },
        'managedBy'
      )

      expect(forward.from).toBe('manager-1')
      expect(forward.to).toBe('employee-1')
      expect(forward.type).toBe('manages')

      expect(inverse.from).toBe('employee-1')
      expect(inverse.to).toBe('manager-1')
      expect(inverse.type).toBe('managedBy')
    })

    it('should support symmetric bidirectional (friendship)', async () => {
      const [rel1, rel2] = await relationships.createBidirectional(
        {
          from: 'person-1',
          to: 'person-2',
          type: 'friendsWith',
        },
        'friendsWith'
      )

      expect(rel1.type).toBe('friendsWith')
      expect(rel2.type).toBe('friendsWith')
      expect(rel1.from).toBe('person-1')
      expect(rel2.from).toBe('person-2')
    })

    it('should support parent-child bidirectional', async () => {
      const [hasChild, hasParent] = await relationships.createBidirectional(
        {
          from: 'org-parent',
          to: 'org-child',
          type: 'children',
        },
        'parent'
      )

      expect(hasChild.type).toBe('children')
      expect(hasParent.type).toBe('parent')
    })
  })

  // ===========================================================================
  // RELATION TRAVERSAL
  // ===========================================================================

  describe('Relation Traversal', () => {
    beforeEach(async () => {
      // Create a graph:
      // Company -> Department -> Team -> Employee
      await relationships.create({
        from: 'company-1',
        to: 'dept-1',
        type: 'hasDepartment',
      })
      await relationships.create({
        from: 'company-1',
        to: 'dept-2',
        type: 'hasDepartment',
      })
      await relationships.create({
        from: 'dept-1',
        to: 'team-1',
        type: 'hasTeam',
      })
      await relationships.create({
        from: 'team-1',
        to: 'emp-1',
        type: 'hasMember',
      })
      await relationships.create({
        from: 'team-1',
        to: 'emp-2',
        type: 'hasMember',
      })
    })

    it('should get outgoing relations (findFrom)', async () => {
      const outgoing = await relationships.findFrom('company-1')

      expect(outgoing.length).toBe(2)
      expect(outgoing.every(r => r.from === 'company-1')).toBe(true)
    })

    it('should get outgoing relations by type', async () => {
      const departments = await relationships.findFrom('company-1', 'hasDepartment')

      expect(departments.length).toBe(2)
      expect(departments.every(r => r.type === 'hasDepartment')).toBe(true)
    })

    it('should get incoming relations (findTo)', async () => {
      const incoming = await relationships.findTo('dept-1')

      expect(incoming.length).toBe(1)
      expect(incoming[0].from).toBe('company-1')
    })

    it('should get all relations for entity', async () => {
      const all = await relationships.findAll('dept-1')

      // Should include incoming from company and outgoing to team
      expect(all.length).toBe(2)
    })

    it('should traverse with depth limit', async () => {
      const result = await relationships.traverse('company-1', null, 2)

      // Should reach departments and teams, but not employees
      expect(result.some(r => r.id === 'dept-1')).toBe(true)
      expect(result.some(r => r.id === 'team-1')).toBe(true)
    })

    it('should traverse outgoing only', async () => {
      const result = await relationships.traverse('company-1', null, 3, 'outgoing')

      // Should reach all levels going down
      expect(result.some(r => r.id === 'emp-1')).toBe(true)
    })

    it('should traverse by relationship type', async () => {
      const result = await relationships.traverse('company-1', 'hasDepartment', 1)

      expect(result.length).toBe(2)
      expect(result.every(r => r.id.startsWith('dept-'))).toBe(true)
    })

    it('should include path in traversal result', async () => {
      const result = await relationships.traverse('company-1', null, 3)

      const employee = result.find(r => r.id === 'emp-1')
      expect(employee?.path).toContain('company-1')
      expect(employee?.path).toContain('dept-1')
      expect(employee?.path).toContain('team-1')
    })

    it('should include depth in traversal result', async () => {
      const result = await relationships.traverse('company-1', null, 3)

      const dept = result.find(r => r.id === 'dept-1')
      const team = result.find(r => r.id === 'team-1')
      const emp = result.find(r => r.id === 'emp-1')

      expect(dept?.depth).toBe(1)
      expect(team?.depth).toBe(2)
      expect(emp?.depth).toBe(3)
    })
  })

  // ===========================================================================
  // CASCADE PROCESSING
  // ===========================================================================

  describe('Cascade Processing', () => {
    it('should process cascade schema', async () => {
      const schema = {
        contacts: '->Contact[]',
        company: '~>Company',
        owner: '<-SalesRep',
      }

      const generatedData = {
        contacts: [
          { name: 'Contact 1' },
          { name: 'Contact 2' },
        ],
        company: 'Acme Corporation',
        owner: { name: 'Jane Sales' },
      }

      const result = await relationships.processCascade(
        'Customer',
        'customer-1',
        generatedData,
        schema
      )

      expect(result.created).toBeDefined()
      expect(result.relations).toBeDefined()
      expect(result.errors).toBeDefined()
    })

    it('should handle cascade errors', async () => {
      const result = await relationships.processCascade(
        'Customer',
        'customer-1',
        { industry: 'NonExistentIndustry' },
        { industry: '~>Industry' }
      )

      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should process single cascade field', async () => {
      const fieldDef: RelationFieldDefinition = {
        operator: '->',
        targets: ['Contact'],
        isArray: false,
        isOptional: false,
      }

      const result = await relationships.processCascadeField(
        'Customer',
        'customer-1',
        'contact',
        { name: 'John Doe' },
        fieldDef
      )

      expect(result).toBeDefined()
    })
  })

  // ===========================================================================
  // RELATIONSHIP MANAGEMENT
  // ===========================================================================

  describe('Relationship Management', () => {
    it('should check if relationship exists', async () => {
      await relationships.create({
        from: 'a-1',
        to: 'b-1',
        type: 'test',
      })

      const exists = await relationships.exists('a-1', 'b-1', 'test')
      const notExists = await relationships.exists('a-1', 'b-2', 'test')

      expect(exists).toBe(true)
      expect(notExists).toBe(false)
    })

    it('should delete relationship by id', async () => {
      const rel = await relationships.create({
        from: 'a-1',
        to: 'b-1',
        type: 'test',
      })

      await relationships.delete(rel.id)

      const exists = await relationships.exists('a-1', 'b-1', 'test')
      expect(exists).toBe(false)
    })

    it('should delete specific relationship by from/to/type', async () => {
      await relationships.create({
        from: 'a-1',
        to: 'b-1',
        type: 'test',
      })

      const deleted = await relationships.deleteRelation('a-1', 'b-1', 'test')

      expect(deleted).toBe(true)
    })

    it('should delete all relationships for entity', async () => {
      await relationships.create({ from: 'a-1', to: 'b-1', type: 'out1' })
      await relationships.create({ from: 'a-1', to: 'c-1', type: 'out2' })
      await relationships.create({ from: 'd-1', to: 'a-1', type: 'in1' })

      const count = await relationships.deleteAll('a-1')

      expect(count).toBe(3)
    })

    it('should update relationship data', async () => {
      const rel = await relationships.create({
        from: 'a-1',
        to: 'b-1',
        type: 'test',
      })

      const updated = await relationships.updateData(rel.id, {
        weight: 0.8,
        notes: 'Important',
      })

      expect(updated.data?.weight).toBe(0.8)
      expect(updated.data?.notes).toBe('Important')
    })

    it('should count relationships for entity', async () => {
      await relationships.create({ from: 'a-1', to: 'b-1', type: 'out' })
      await relationships.create({ from: 'a-1', to: 'c-1', type: 'out' })
      await relationships.create({ from: 'd-1', to: 'a-1', type: 'in' })

      const total = await relationships.countFor('a-1')
      const outgoing = await relationships.countFor('a-1', 'outgoing')
      const incoming = await relationships.countFor('a-1', 'incoming')

      expect(total).toBe(3)
      expect(outgoing).toBe(2)
      expect(incoming).toBe(1)
    })

    it('should get relationship types for entity', async () => {
      await relationships.create({ from: 'a-1', to: 'b-1', type: 'manages' })
      await relationships.create({ from: 'a-1', to: 'c-1', type: 'owns' })
      await relationships.create({ from: 'a-1', to: 'd-1', type: 'manages' })

      const types = await relationships.getTypesFor('a-1')

      expect(types).toContain('manages')
      expect(types).toContain('owns')
      expect(types.length).toBe(2) // unique
    })
  })

  // ===========================================================================
  // PATH FINDING
  // ===========================================================================

  describe('Path Finding', () => {
    beforeEach(async () => {
      // Create a network
      await relationships.create({ from: 'a', to: 'b', type: 'connected' })
      await relationships.create({ from: 'b', to: 'c', type: 'connected' })
      await relationships.create({ from: 'c', to: 'd', type: 'connected' })
      await relationships.create({ from: 'a', to: 'e', type: 'connected' })
      await relationships.create({ from: 'e', to: 'd', type: 'connected' })
    })

    it('should find shortest path between entities', async () => {
      const path = await relationships.findPath('a', 'd', 5)

      expect(path).not.toBeNull()
      // a -> e -> d is shorter than a -> b -> c -> d
      expect(path?.length).toBeLessThanOrEqual(2)
    })

    it('should return null for disconnected entities', async () => {
      await relationships.create({ from: 'isolated', to: 'island', type: 'connected' })

      const path = await relationships.findPath('a', 'island', 5)

      expect(path).toBeNull()
    })

    it('should respect max depth', async () => {
      const path = await relationships.findPath('a', 'd', 1)

      // Can't reach d in 1 hop
      expect(path).toBeNull()
    })
  })

  // ===========================================================================
  // ORDERING
  // ===========================================================================

  describe('Ordering', () => {
    it('should update ordinal', async () => {
      const rel = await relationships.create({
        from: 'a-1',
        to: 'b-1',
        type: 'test',
      })

      const updated = await relationships.updateOrdinal(rel.id, 5)

      expect(updated.data?.ordinal ?? 0).toBe(5)
    })

    it('should reorder relationships', async () => {
      const rel1 = await relationships.create({ from: 'a', to: 'b', type: 'ordered' })
      const rel2 = await relationships.create({ from: 'a', to: 'c', type: 'ordered' })
      const rel3 = await relationships.create({ from: 'a', to: 'd', type: 'ordered' })

      // Reorder: c, a, b (rel2, rel1, rel3 is wrong, should be: rel2, rel3, rel1)
      await relationships.reorder('a', 'ordered', [rel2.id, rel3.id, rel1.id])

      const ordered = await relationships.findFrom('a', 'ordered')

      // Verify order by ordinal
      expect(ordered[0].id).toBe(rel2.id)
      expect(ordered[1].id).toBe(rel3.id)
      expect(ordered[2].id).toBe(rel1.id)
    })
  })

  // ===========================================================================
  // STORED RELATION FORMAT
  // ===========================================================================

  describe('StoredRelation Format', () => {
    it('should convert to StoredRelation format', () => {
      const rel: Relationship = {
        id: 'rel-1',
        from: 'a-1',
        to: 'b-1',
        type: 'test',
        createdAt: 1000,
      }

      const stored = relationships.toStoredRelation(rel, {
        relType: 'forward',
        relName: 'contacts',
        fromCollection: 'Customer',
        toCollection: 'Contact',
        ordinal: 0,
      })

      expect(stored.id).toBe('rel-1')
      expect(stored.relType).toBe('forward')
      expect(stored.relName).toBe('contacts')
      expect(stored.fromCollection).toBe('Customer')
      expect(stored.fromId).toBe('a-1')
      expect(stored.toCollection).toBe('Contact')
      expect(stored.toId).toBe('b-1')
    })

    it('should get outgoing relations in StoredRelation format', async () => {
      await relationships.create({ from: 'a-1', to: 'b-1', type: 'test' })

      const stored = await relationships.getOutgoing('Customer', 'a-1')

      expect(Array.isArray(stored)).toBe(true)
    })

    it('should get incoming relations in StoredRelation format', async () => {
      await relationships.create({ from: 'a-1', to: 'b-1', type: 'test' })

      const stored = await relationships.getIncoming('Contact', 'b-1')

      expect(Array.isArray(stored)).toBe(true)
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle self-referential relations', async () => {
      const rel = await relationships.create({
        from: 'cat-parent',
        to: 'cat-child',
        type: 'parentOf',
      })

      expect(rel.from).toBe('cat-parent')
      expect(rel.to).toBe('cat-child')
    })

    it('should prevent duplicate relations', async () => {
      await relationships.create({
        from: 'user-1',
        to: 'user-2',
        type: 'follows',
      })

      await expect(
        relationships.create({
          from: 'user-1',
          to: 'user-2',
          type: 'follows',
        })
      ).rejects.toThrow()
    })

    it('should return false for deleting non-existent relation', async () => {
      const deleted = await relationships.deleteRelation('x', 'y', 'z')
      expect(deleted).toBe(false)
    })

    it('should handle special characters in IDs', async () => {
      const rel = await relationships.create({
        from: 'id-with-dashes_and_underscores',
        to: 'id/with/slashes',
        type: 'Type:With:Colons',
      })

      expect(rel.from).toBe('id-with-dashes_and_underscores')
      expect(rel.to).toBe('id/with/slashes')
      expect(rel.type).toBe('Type:With:Colons')
    })

    it('should set createdAt timestamp', async () => {
      const before = Date.now()
      const rel = await relationships.create({
        from: 'a',
        to: 'b',
        type: 'test',
      })
      const after = Date.now()

      expect(rel.createdAt).toBeGreaterThanOrEqual(before)
      expect(rel.createdAt).toBeLessThanOrEqual(after)
    })

    it('should generate unique IDs', async () => {
      const rels = await Promise.all([
        relationships.create({ from: 'a', to: 'b1', type: 't' }),
        relationships.create({ from: 'a', to: 'b2', type: 't' }),
        relationships.create({ from: 'a', to: 'b3', type: 't' }),
      ])

      const ids = rels.map(r => r.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(3)
    })

    it('should use rel_ prefix for IDs', async () => {
      const rel = await relationships.create({
        from: 'a',
        to: 'b',
        type: 'test',
      })

      expect(rel.id.startsWith('rel_')).toBe(true)
    })
  })
})
