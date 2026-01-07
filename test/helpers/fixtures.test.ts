/**
 * @dotdo/do - Test Fixtures Factory Tests
 *
 * Tests for the test fixtures factory functions that create
 * standard test data with sensible defaults and override support.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createUserFixture,
  createThingFixture,
  createRelationshipFixture,
  createEventFixture,
  createActionFixture,
  createUserFixtures,
  createThingFixtures,
  createRelationshipFixtures,
  createEventFixtures,
  createActionFixtures,
  resetFixtureCounter,
  type UserFixture,
} from './fixtures'
import type { Thing, Relationship, Event, Action } from '../../src/types'

describe('Test Fixtures Factory', () => {
  beforeEach(() => {
    resetFixtureCounter()
  })

  describe('createUserFixture()', () => {
    it('should create a user with default values', () => {
      const user = createUserFixture()

      expect(user.id).toBeDefined()
      expect(user.id).toContain('user-')
      expect(user.email).toContain('@test.example.com')
      expect(user.name).toContain('Test User')
      expect(user.role).toBe('user')
      expect(user.createdAt).toBeInstanceOf(Date)
      expect(user.updatedAt).toBeInstanceOf(Date)
    })

    it('should generate unique IDs for each user', () => {
      const user1 = createUserFixture()
      const user2 = createUserFixture()

      expect(user1.id).not.toBe(user2.id)
    })

    it('should allow overriding id', () => {
      const user = createUserFixture({ id: 'custom-id' })

      expect(user.id).toBe('custom-id')
    })

    it('should allow overriding email', () => {
      const user = createUserFixture({ email: 'custom@example.com' })

      expect(user.email).toBe('custom@example.com')
    })

    it('should allow overriding name', () => {
      const user = createUserFixture({ name: 'Alice Smith' })

      expect(user.name).toBe('Alice Smith')
    })

    it('should allow overriding role', () => {
      const admin = createUserFixture({ role: 'admin' })
      const guest = createUserFixture({ role: 'guest' })

      expect(admin.role).toBe('admin')
      expect(guest.role).toBe('guest')
    })

    it('should allow overriding createdAt and updatedAt', () => {
      const pastDate = new Date('2023-01-01T00:00:00Z')
      const user = createUserFixture({
        createdAt: pastDate,
        updatedAt: pastDate,
      })

      expect(user.createdAt).toEqual(pastDate)
      expect(user.updatedAt).toEqual(pastDate)
    })

    it('should allow setting metadata', () => {
      const user = createUserFixture({
        metadata: { preferences: { theme: 'dark' } },
      })

      expect(user.metadata).toEqual({ preferences: { theme: 'dark' } })
    })

    it('should not include metadata when not provided', () => {
      const user = createUserFixture()

      expect('metadata' in user).toBe(false)
    })

    it('should allow multiple overrides at once', () => {
      const user = createUserFixture({
        id: 'multi-override',
        email: 'multi@test.com',
        name: 'Multi Override User',
        role: 'admin',
      })

      expect(user.id).toBe('multi-override')
      expect(user.email).toBe('multi@test.com')
      expect(user.name).toBe('Multi Override User')
      expect(user.role).toBe('admin')
    })
  })

  describe('createThingFixture()', () => {
    it('should create a thing with default values', () => {
      const thing = createThingFixture()

      expect(thing.id).toBeDefined()
      expect(thing.id).toContain('thing-')
      expect(thing.ns).toBe('test.example.com')
      expect(thing.type).toBe('item')
      expect(thing.url).toContain('https://test.example.com/')
      expect(thing.createdAt).toBeInstanceOf(Date)
      expect(thing.updatedAt).toBeInstanceOf(Date)
      expect(thing.data).toEqual({})
    })

    it('should generate unique IDs for each thing', () => {
      const thing1 = createThingFixture()
      const thing2 = createThingFixture()

      expect(thing1.id).not.toBe(thing2.id)
    })

    it('should allow overriding ns', () => {
      const thing = createThingFixture({ ns: 'custom.domain.com' })

      expect(thing.ns).toBe('custom.domain.com')
    })

    it('should allow overriding type', () => {
      const thing = createThingFixture({ type: 'product' })

      expect(thing.type).toBe('product')
    })

    it('should allow overriding id', () => {
      const thing = createThingFixture({ id: 'custom-thing-id' })

      expect(thing.id).toBe('custom-thing-id')
    })

    it('should allow overriding url', () => {
      const thing = createThingFixture({ url: 'https://custom.url/thing/123' })

      expect(thing.url).toBe('https://custom.url/thing/123')
    })

    it('should allow overriding data', () => {
      const thing = createThingFixture({
        data: { name: 'Test Thing', value: 42 },
      })

      expect(thing.data).toEqual({ name: 'Test Thing', value: 42 })
    })

    it('should support typed data', () => {
      interface ProductData {
        name: string
        price: number
      }

      const thing = createThingFixture<ProductData>({
        data: { name: 'Widget', price: 19.99 },
      })

      expect(thing.data.name).toBe('Widget')
      expect(thing.data.price).toBe(19.99)
    })

    it('should allow setting @context', () => {
      const thing = createThingFixture({
        '@context': 'https://schema.org/',
      })

      expect(thing['@context']).toBe('https://schema.org/')
    })

    it('should not include @context when not provided', () => {
      const thing = createThingFixture()

      expect('@context' in thing).toBe(false)
    })

    it('should construct URL from ns, type, and id by default', () => {
      const thing = createThingFixture({
        ns: 'api.example.com',
        type: 'user',
        id: 'user-123',
      })

      expect(thing.url).toBe('https://api.example.com/user/user-123')
    })
  })

  describe('createRelationshipFixture()', () => {
    it('should create a relationship with default values', () => {
      const rel = createRelationshipFixture()

      expect(rel.id).toBeDefined()
      expect(rel.id).toContain('rel-')
      expect(rel.type).toBe('related')
      expect(rel.from).toContain('https://test.example.com/thing/source-')
      expect(rel.to).toContain('https://test.example.com/thing/target-')
      expect(rel.createdAt).toBeInstanceOf(Date)
    })

    it('should generate unique IDs for each relationship', () => {
      const rel1 = createRelationshipFixture()
      const rel2 = createRelationshipFixture()

      expect(rel1.id).not.toBe(rel2.id)
    })

    it('should allow overriding type', () => {
      const rel = createRelationshipFixture({ type: 'follows' })

      expect(rel.type).toBe('follows')
    })

    it('should allow overriding from', () => {
      const rel = createRelationshipFixture({
        from: 'https://example.com/user/alice',
      })

      expect(rel.from).toBe('https://example.com/user/alice')
    })

    it('should allow overriding to', () => {
      const rel = createRelationshipFixture({
        to: 'https://example.com/user/bob',
      })

      expect(rel.to).toBe('https://example.com/user/bob')
    })

    it('should allow setting data', () => {
      const rel = createRelationshipFixture({
        data: { weight: 0.8, reason: 'mutual friends' },
      })

      expect(rel.data).toEqual({ weight: 0.8, reason: 'mutual friends' })
    })

    it('should not include data when not provided', () => {
      const rel = createRelationshipFixture()

      expect('data' in rel).toBe(false)
    })

    it('should support typed data', () => {
      interface FollowData {
        followedAt: string
        notifications: boolean
      }

      const rel = createRelationshipFixture<FollowData>({
        type: 'follows',
        data: { followedAt: '2024-01-01', notifications: true },
      })

      expect(rel.data?.followedAt).toBe('2024-01-01')
      expect(rel.data?.notifications).toBe(true)
    })
  })

  describe('createEventFixture()', () => {
    it('should create an event with default values', () => {
      const event = createEventFixture()

      expect(event.id).toBeDefined()
      expect(event.id).toContain('event-')
      expect(event.type).toBe('test.event')
      expect(event.timestamp).toBeInstanceOf(Date)
      expect(event.source).toBe('test')
      expect(event.data).toEqual({})
    })

    it('should generate unique IDs for each event', () => {
      const event1 = createEventFixture()
      const event2 = createEventFixture()

      expect(event1.id).not.toBe(event2.id)
    })

    it('should allow overriding type', () => {
      const event = createEventFixture({ type: 'user.created' })

      expect(event.type).toBe('user.created')
    })

    it('should allow overriding timestamp', () => {
      const timestamp = new Date('2024-06-15T12:00:00Z')
      const event = createEventFixture({ timestamp })

      expect(event.timestamp).toEqual(timestamp)
    })

    it('should allow overriding source', () => {
      const event = createEventFixture({ source: 'auth-service' })

      expect(event.source).toBe('auth-service')
    })

    it('should allow overriding data', () => {
      const event = createEventFixture({
        data: { userId: 'user-123', action: 'login' },
      })

      expect(event.data).toEqual({ userId: 'user-123', action: 'login' })
    })

    it('should allow setting correlationId', () => {
      const event = createEventFixture({ correlationId: 'corr-123' })

      expect(event.correlationId).toBe('corr-123')
    })

    it('should not include correlationId when not provided', () => {
      const event = createEventFixture()

      expect('correlationId' in event).toBe(false)
    })

    it('should allow setting causationId', () => {
      const event = createEventFixture({ causationId: 'cause-456' })

      expect(event.causationId).toBe('cause-456')
    })

    it('should not include causationId when not provided', () => {
      const event = createEventFixture()

      expect('causationId' in event).toBe(false)
    })

    it('should support typed data', () => {
      interface OrderEventData {
        orderId: string
        amount: number
        currency: string
      }

      const event = createEventFixture<OrderEventData>({
        type: 'order.placed',
        data: { orderId: 'order-789', amount: 99.99, currency: 'USD' },
      })

      expect(event.data.orderId).toBe('order-789')
      expect(event.data.amount).toBe(99.99)
      expect(event.data.currency).toBe('USD')
    })
  })

  describe('createActionFixture()', () => {
    it('should create an action with default values', () => {
      const action = createActionFixture()

      expect(action.id).toBeDefined()
      expect(action.id).toContain('action-')
      expect(action.actor).toContain('user:')
      expect(action.object).toContain('object:')
      expect(action.action).toBe('process')
      expect(action.status).toBe('pending')
      expect(action.createdAt).toBeInstanceOf(Date)
      expect(action.updatedAt).toBeInstanceOf(Date)
    })

    it('should generate unique IDs for each action', () => {
      const action1 = createActionFixture()
      const action2 = createActionFixture()

      expect(action1.id).not.toBe(action2.id)
    })

    it('should allow overriding actor', () => {
      const action = createActionFixture({ actor: 'system:cron' })

      expect(action.actor).toBe('system:cron')
    })

    it('should allow overriding object', () => {
      const action = createActionFixture({ object: 'order:123' })

      expect(action.object).toBe('order:123')
    })

    it('should allow overriding action name', () => {
      const action = createActionFixture({ action: 'approve' })

      expect(action.action).toBe('approve')
    })

    it('should allow overriding status', () => {
      const activeAction = createActionFixture({ status: 'active' })
      const completedAction = createActionFixture({ status: 'completed' })
      const failedAction = createActionFixture({ status: 'failed' })
      const cancelledAction = createActionFixture({ status: 'cancelled' })

      expect(activeAction.status).toBe('active')
      expect(completedAction.status).toBe('completed')
      expect(failedAction.status).toBe('failed')
      expect(cancelledAction.status).toBe('cancelled')
    })

    it('should set startedAt for active actions', () => {
      const action = createActionFixture({ status: 'active' })

      expect(action.startedAt).toBeInstanceOf(Date)
    })

    it('should set completedAt for completed actions', () => {
      const action = createActionFixture({ status: 'completed' })

      expect(action.completedAt).toBeInstanceOf(Date)
    })

    it('should set error for failed actions', () => {
      const action = createActionFixture({ status: 'failed' })

      expect(action.error).toBe('Test failure')
    })

    it('should allow overriding error for failed actions', () => {
      const action = createActionFixture({
        status: 'failed',
        error: 'Custom error message',
      })

      expect(action.error).toBe('Custom error message')
    })

    it('should allow setting result', () => {
      const action = createActionFixture({
        status: 'completed',
        result: { success: true, data: { processedItems: 42 } },
      })

      expect(action.result).toEqual({ success: true, data: { processedItems: 42 } })
    })

    it('should allow setting metadata', () => {
      const action = createActionFixture({
        metadata: { priority: 'high', retryCount: 0 },
      })

      expect(action.metadata).toEqual({ priority: 'high', retryCount: 0 })
    })

    it('should not include optional fields when not provided and status is pending', () => {
      const action = createActionFixture({ status: 'pending' })

      expect('startedAt' in action).toBe(false)
      expect('completedAt' in action).toBe(false)
      expect('result' in action).toBe(false)
      expect('error' in action).toBe(false)
      expect('metadata' in action).toBe(false)
    })

    it('should support typed metadata', () => {
      interface ProcessMetadata {
        batchId: string
        itemCount: number
      }

      const action = createActionFixture<ProcessMetadata>({
        metadata: { batchId: 'batch-001', itemCount: 100 },
      })

      expect(action.metadata?.batchId).toBe('batch-001')
      expect(action.metadata?.itemCount).toBe(100)
    })
  })

  describe('Batch Fixture Creators', () => {
    describe('createUserFixtures()', () => {
      it('should create multiple user fixtures', () => {
        const users = createUserFixtures(3)

        expect(users).toHaveLength(3)
        expect(users[0].id).not.toBe(users[1].id)
        expect(users[1].id).not.toBe(users[2].id)
      })

      it('should apply base overrides to all fixtures', () => {
        const users = createUserFixtures(3, { role: 'admin' })

        expect(users[0].role).toBe('admin')
        expect(users[1].role).toBe('admin')
        expect(users[2].role).toBe('admin')
      })

      it('should suffix IDs when base id is provided', () => {
        const users = createUserFixtures(3, { id: 'test-user' })

        expect(users[0].id).toBe('test-user-1')
        expect(users[1].id).toBe('test-user-2')
        expect(users[2].id).toBe('test-user-3')
      })

      it('should create zero fixtures when count is zero', () => {
        const users = createUserFixtures(0)

        expect(users).toHaveLength(0)
      })
    })

    describe('createThingFixtures()', () => {
      it('should create multiple thing fixtures', () => {
        const things = createThingFixtures(5)

        expect(things).toHaveLength(5)
        const ids = things.map((t) => t.id)
        expect(new Set(ids).size).toBe(5)
      })

      it('should apply base overrides to all fixtures', () => {
        const things = createThingFixtures(3, { type: 'product', ns: 'shop.example.com' })

        expect(things[0].type).toBe('product')
        expect(things[0].ns).toBe('shop.example.com')
        expect(things[2].type).toBe('product')
        expect(things[2].ns).toBe('shop.example.com')
      })
    })

    describe('createRelationshipFixtures()', () => {
      it('should create multiple relationship fixtures', () => {
        const rels = createRelationshipFixtures(4)

        expect(rels).toHaveLength(4)
        const ids = rels.map((r) => r.id)
        expect(new Set(ids).size).toBe(4)
      })

      it('should apply base overrides to all fixtures', () => {
        const rels = createRelationshipFixtures(2, { type: 'likes' })

        expect(rels[0].type).toBe('likes')
        expect(rels[1].type).toBe('likes')
      })
    })

    describe('createEventFixtures()', () => {
      it('should create multiple event fixtures', () => {
        const events = createEventFixtures(10)

        expect(events).toHaveLength(10)
        const ids = events.map((e) => e.id)
        expect(new Set(ids).size).toBe(10)
      })

      it('should apply base overrides to all fixtures', () => {
        const events = createEventFixtures(3, { type: 'user.login', source: 'auth' })

        expect(events[0].type).toBe('user.login')
        expect(events[0].source).toBe('auth')
        expect(events[2].type).toBe('user.login')
        expect(events[2].source).toBe('auth')
      })
    })

    describe('createActionFixtures()', () => {
      it('should create multiple action fixtures', () => {
        const actions = createActionFixtures(7)

        expect(actions).toHaveLength(7)
        const ids = actions.map((a) => a.id)
        expect(new Set(ids).size).toBe(7)
      })

      it('should apply base overrides to all fixtures', () => {
        const actions = createActionFixtures(3, { status: 'active', action: 'approve' })

        expect(actions[0].status).toBe('active')
        expect(actions[0].action).toBe('approve')
        expect(actions[2].status).toBe('active')
        expect(actions[2].action).toBe('approve')
      })
    })
  })

  describe('resetFixtureCounter()', () => {
    it('should reset the counter for deterministic tests', () => {
      // Create some fixtures to increment counter
      createUserFixture()
      createUserFixture()

      // Reset
      resetFixtureCounter()

      // Create new fixtures - IDs should be based on reset counter
      const user1 = createUserFixture()
      const user2 = createUserFixture()

      // The counter portion should start fresh (though timestamp makes it unique)
      expect(user1.id).toContain('user-')
      expect(user2.id).toContain('user-')
    })
  })

  describe('Type Safety', () => {
    it('should enforce correct types for overrides', () => {
      // These should compile without errors
      const user: UserFixture = createUserFixture({ role: 'admin' })
      const thing: Thing = createThingFixture({ ns: 'example.com' })
      const rel: Relationship = createRelationshipFixture({ type: 'follows' })
      const event: Event = createEventFixture({ type: 'test' })
      const action: Action = createActionFixture({ status: 'pending' })

      expect(user).toBeDefined()
      expect(thing).toBeDefined()
      expect(rel).toBeDefined()
      expect(event).toBeDefined()
      expect(action).toBeDefined()
    })
  })
})
