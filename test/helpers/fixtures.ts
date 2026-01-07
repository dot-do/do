/**
 * @dotdo/do - Test Fixtures Factory
 *
 * Standard test data factories for creating valid test data with sensible defaults.
 * Each factory supports partial overrides for customization.
 */

import type { Thing, Relationship, Event, Action, ActionStatus } from '../../src/types'

// ============================================================================
// Counter for generating unique IDs
// ============================================================================

let fixtureCounter = 0

/**
 * Generate a unique ID for fixtures
 */
function generateId(prefix: string): string {
  fixtureCounter++
  return `${prefix}-${Date.now()}-${fixtureCounter}`
}

/**
 * Reset the fixture counter (useful for deterministic tests)
 */
export function resetFixtureCounter(): void {
  fixtureCounter = 0
}

// ============================================================================
// User Fixture
// ============================================================================

/**
 * User data structure for tests
 */
export interface UserFixture {
  id: string
  email: string
  name: string
  role: 'admin' | 'user' | 'guest'
  createdAt: Date
  updatedAt: Date
  metadata?: Record<string, unknown>
}

/**
 * Options for creating a user fixture
 */
export type CreateUserFixtureOptions = Partial<UserFixture>

/**
 * Create a user fixture with sensible defaults
 *
 * @param overrides - Partial user data to override defaults
 * @returns A complete UserFixture object
 */
export function createUserFixture(overrides?: CreateUserFixtureOptions): UserFixture {
  const id = overrides?.id ?? generateId('user')
  const now = new Date()

  return {
    id,
    email: overrides?.email ?? `${id}@test.example.com`,
    name: overrides?.name ?? `Test User ${id}`,
    role: overrides?.role ?? 'user',
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    ...(overrides?.metadata !== undefined && { metadata: overrides.metadata }),
  }
}

// ============================================================================
// Thing Fixture
// ============================================================================

/**
 * Options for creating a thing fixture
 */
export type CreateThingFixtureOptions<T extends Record<string, unknown> = Record<string, unknown>> = Partial<Thing<T>>

/**
 * Create a thing fixture with sensible defaults
 *
 * @param overrides - Partial thing data to override defaults
 * @returns A complete Thing object
 */
export function createThingFixture<T extends Record<string, unknown> = Record<string, unknown>>(
  overrides?: CreateThingFixtureOptions<T>
): Thing<T> {
  const id = overrides?.id ?? generateId('thing')
  const ns = overrides?.ns ?? 'test.example.com'
  const type = overrides?.type ?? 'item'
  const now = new Date()

  return {
    ns,
    type,
    id,
    url: overrides?.url ?? `https://${ns}/${type}/${id}`,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    data: (overrides?.data ?? {}) as T,
    ...(overrides?.['@context'] !== undefined && { '@context': overrides['@context'] }),
  }
}

// ============================================================================
// Relationship Fixture
// ============================================================================

/**
 * Options for creating a relationship fixture
 */
export type CreateRelationshipFixtureOptions<T extends Record<string, unknown> = Record<string, unknown>> = Partial<Relationship<T>>

/**
 * Create a relationship fixture with sensible defaults
 *
 * @param overrides - Partial relationship data to override defaults
 * @returns A complete Relationship object
 */
export function createRelationshipFixture<T extends Record<string, unknown> = Record<string, unknown>>(
  overrides?: CreateRelationshipFixtureOptions<T>
): Relationship<T> {
  const id = overrides?.id ?? generateId('rel')
  const now = new Date()

  return {
    id,
    type: overrides?.type ?? 'related',
    from: overrides?.from ?? `https://test.example.com/thing/source-${id}`,
    to: overrides?.to ?? `https://test.example.com/thing/target-${id}`,
    createdAt: overrides?.createdAt ?? now,
    ...(overrides?.data !== undefined && { data: overrides.data }),
  }
}

// ============================================================================
// Event Fixture
// ============================================================================

/**
 * Options for creating an event fixture
 */
export type CreateEventFixtureOptions<T extends Record<string, unknown> = Record<string, unknown>> = Partial<Event<T>>

/**
 * Create an event fixture with sensible defaults
 *
 * @param overrides - Partial event data to override defaults
 * @returns A complete Event object
 */
export function createEventFixture<T extends Record<string, unknown> = Record<string, unknown>>(
  overrides?: CreateEventFixtureOptions<T>
): Event<T> {
  const id = overrides?.id ?? generateId('event')
  const now = new Date()

  return {
    id,
    type: overrides?.type ?? 'test.event',
    timestamp: overrides?.timestamp ?? now,
    source: overrides?.source ?? 'test',
    data: (overrides?.data ?? {}) as T,
    ...(overrides?.correlationId !== undefined && { correlationId: overrides.correlationId }),
    ...(overrides?.causationId !== undefined && { causationId: overrides.causationId }),
  }
}

// ============================================================================
// Action Fixture
// ============================================================================

/**
 * Options for creating an action fixture
 */
export type CreateActionFixtureOptions<T extends Record<string, unknown> = Record<string, unknown>> = Partial<Action<T>>

/**
 * Create an action fixture with sensible defaults
 *
 * @param overrides - Partial action data to override defaults
 * @returns A complete Action object
 */
export function createActionFixture<T extends Record<string, unknown> = Record<string, unknown>>(
  overrides?: CreateActionFixtureOptions<T>
): Action<T> {
  const id = overrides?.id ?? generateId('action')
  const now = new Date()
  const status: ActionStatus = overrides?.status ?? 'pending'

  const action: Action<T> = {
    id,
    actor: overrides?.actor ?? `user:${id}`,
    object: overrides?.object ?? `object:${id}`,
    action: overrides?.action ?? 'process',
    status,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
  }

  // Add optional fields based on status
  if (overrides?.startedAt !== undefined) {
    action.startedAt = overrides.startedAt
  } else if (status === 'active' || status === 'completed' || status === 'failed') {
    action.startedAt = now
  }

  if (overrides?.completedAt !== undefined) {
    action.completedAt = overrides.completedAt
  } else if (status === 'completed' || status === 'failed') {
    action.completedAt = now
  }

  if (overrides?.result !== undefined) {
    action.result = overrides.result
  }

  if (overrides?.error !== undefined) {
    action.error = overrides.error
  } else if (status === 'failed' && overrides?.error === undefined) {
    action.error = 'Test failure'
  }

  if (overrides?.metadata !== undefined) {
    action.metadata = overrides.metadata
  }

  return action
}

// ============================================================================
// Batch Fixture Creators
// ============================================================================

/**
 * Create multiple user fixtures
 *
 * @param count - Number of fixtures to create
 * @param baseOverrides - Base overrides applied to all fixtures
 * @returns Array of UserFixture objects
 */
export function createUserFixtures(count: number, baseOverrides?: CreateUserFixtureOptions): UserFixture[] {
  return Array.from({ length: count }, (_, i) =>
    createUserFixture({
      ...baseOverrides,
      id: baseOverrides?.id ? `${baseOverrides.id}-${i + 1}` : undefined,
    })
  )
}

/**
 * Create multiple thing fixtures
 *
 * @param count - Number of fixtures to create
 * @param baseOverrides - Base overrides applied to all fixtures
 * @returns Array of Thing objects
 */
export function createThingFixtures<T extends Record<string, unknown> = Record<string, unknown>>(
  count: number,
  baseOverrides?: CreateThingFixtureOptions<T>
): Thing<T>[] {
  return Array.from({ length: count }, (_, i) =>
    createThingFixture<T>({
      ...baseOverrides,
      id: baseOverrides?.id ? `${baseOverrides.id}-${i + 1}` : undefined,
    })
  )
}

/**
 * Create multiple relationship fixtures
 *
 * @param count - Number of fixtures to create
 * @param baseOverrides - Base overrides applied to all fixtures
 * @returns Array of Relationship objects
 */
export function createRelationshipFixtures<T extends Record<string, unknown> = Record<string, unknown>>(
  count: number,
  baseOverrides?: CreateRelationshipFixtureOptions<T>
): Relationship<T>[] {
  return Array.from({ length: count }, (_, i) =>
    createRelationshipFixture<T>({
      ...baseOverrides,
      id: baseOverrides?.id ? `${baseOverrides.id}-${i + 1}` : undefined,
    })
  )
}

/**
 * Create multiple event fixtures
 *
 * @param count - Number of fixtures to create
 * @param baseOverrides - Base overrides applied to all fixtures
 * @returns Array of Event objects
 */
export function createEventFixtures<T extends Record<string, unknown> = Record<string, unknown>>(
  count: number,
  baseOverrides?: CreateEventFixtureOptions<T>
): Event<T>[] {
  return Array.from({ length: count }, (_, i) =>
    createEventFixture<T>({
      ...baseOverrides,
      id: baseOverrides?.id ? `${baseOverrides.id}-${i + 1}` : undefined,
    })
  )
}

/**
 * Create multiple action fixtures
 *
 * @param count - Number of fixtures to create
 * @param baseOverrides - Base overrides applied to all fixtures
 * @returns Array of Action objects
 */
export function createActionFixtures<T extends Record<string, unknown> = Record<string, unknown>>(
  count: number,
  baseOverrides?: CreateActionFixtureOptions<T>
): Action<T>[] {
  return Array.from({ length: count }, (_, i) =>
    createActionFixture<T>({
      ...baseOverrides,
      id: baseOverrides?.id ? `${baseOverrides.id}-${i + 1}` : undefined,
    })
  )
}
