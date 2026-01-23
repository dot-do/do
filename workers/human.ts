/**
 * Human Worker
 *
 * Human workers in the digital-worker pattern. Humans can have
 * communication channels (email, phone, slack) and are assigned
 * tasks just like AI agents.
 *
 * @module workers/human
 */

import type { Human, WorkerChannels, WorkerCapabilities, WorkSchedule, WorkerStatus } from './types'

// =============================================================================
// Human Worker Creation
// =============================================================================

/**
 * Options for creating a human worker
 */
export interface CreateHumanOptions {
  /** Display name */
  name: string
  /** Description or bio */
  description?: string
  /** Avatar URL */
  avatar?: string
  /** Communication channels */
  channels?: Partial<WorkerChannels>
  /** Capabilities */
  capabilities?: Partial<WorkerCapabilities>
  /** Timezone */
  timezone?: string
  /** Work schedule */
  availability?: WorkSchedule
  /** Job title */
  title?: string
  /** Department */
  department?: string
  /** Location */
  location?: string
  /** Manager ID */
  managerId?: string
  /** Team IDs */
  teams?: string[]
  /** Custom metadata */
  metadata?: Record<string, unknown>
}

/**
 * Create a human worker
 *
 * @param options - Human worker options
 * @returns Human worker instance
 *
 * @example
 * ```typescript
 * const priya = createHuman({
 *   name: 'Priya Sharma',
 *   title: 'Product Manager',
 *   channels: {
 *     email: 'priya@example.com',
 *     slack: { userId: 'U123', teamId: 'T456' },
 *   },
 *   timezone: 'America/Los_Angeles',
 *   availability: {
 *     timezone: 'America/Los_Angeles',
 *     hours: {
 *       1: { start: '09:00', end: '17:00' },
 *       2: { start: '09:00', end: '17:00' },
 *       3: { start: '09:00', end: '17:00' },
 *       4: { start: '09:00', end: '17:00' },
 *       5: { start: '09:00', end: '17:00' },
 *     },
 *   },
 * })
 * ```
 */
export function createHuman(options: CreateHumanOptions): Human {
  const now = new Date()
  const id = `human_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  return {
    id,
    type: 'human',
    name: options.name,
    description: options.description,
    avatar: options.avatar,
    status: 'active',
    channels: options.channels || {},
    capabilities: {
      tier: 4, // Human tier
      skills: [],
      ...options.capabilities,
    },
    tools: ['browser', 'computer', 'search'], // Humans can use all tools
    timezone: options.timezone,
    availability: options.availability,
    title: options.title,
    department: options.department,
    location: options.location,
    managerId: options.managerId,
    teams: options.teams,
    createdAt: now,
    updatedAt: now,
    metadata: options.metadata,
  }
}

// =============================================================================
// Human Worker Manager
// =============================================================================

/**
 * Human worker manager for CRUD operations
 */
export class HumanManager {
  private storage: Map<string, Human> = new Map()

  /**
   * Create a new human worker
   */
  async create(options: CreateHumanOptions): Promise<Human> {
    const human = createHuman(options)
    this.storage.set(human.id, human)
    return human
  }

  /**
   * Get a human worker by ID
   */
  async get(id: string): Promise<Human | null> {
    return this.storage.get(id) || null
  }

  /**
   * Update a human worker
   */
  async update(id: string, updates: Partial<CreateHumanOptions>): Promise<Human | null> {
    const human = this.storage.get(id)
    if (!human) return null

    const updated: Human = {
      ...human,
      ...updates,
      channels: { ...human.channels, ...updates.channels },
      capabilities: { ...human.capabilities, ...updates.capabilities },
      updatedAt: new Date(),
    }

    this.storage.set(id, updated)
    return updated
  }

  /**
   * Delete a human worker
   */
  async delete(id: string): Promise<boolean> {
    return this.storage.delete(id)
  }

  /**
   * List human workers
   */
  async list(options?: {
    status?: WorkerStatus
    team?: string
    department?: string
    limit?: number
    offset?: number
  }): Promise<Human[]> {
    let humans = Array.from(this.storage.values())

    if (options?.status) {
      humans = humans.filter((h) => h.status === options.status)
    }
    if (options?.team) {
      humans = humans.filter((h) => h.teams?.includes(options.team!))
    }
    if (options?.department) {
      humans = humans.filter((h) => h.department === options.department)
    }

    const offset = options?.offset || 0
    const limit = options?.limit || 100

    return humans.slice(offset, offset + limit)
  }

  /**
   * Update human status
   */
  async setStatus(id: string, status: WorkerStatus): Promise<Human | null> {
    const human = this.storage.get(id)
    if (!human) return null

    human.status = status
    human.updatedAt = new Date()
    return human
  }

  /**
   * Check if human is available
   */
  async isAvailable(id: string): Promise<boolean> {
    const human = this.storage.get(id)
    if (!human) return false

    // Check status
    if (human.status !== 'active') return false

    // Check schedule
    if (human.availability) {
      const now = new Date()
      const day = now.getDay()
      const hours = human.availability.hours?.[day]

      if (!hours) return false

      // Check if out of office
      const ooo = human.availability.outOfOffice?.find(
        (period) => now >= period.start && now <= period.end
      )
      if (ooo) return false

      // Check working hours
      const currentTime = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        timeZone: human.availability.timezone,
      })

      return currentTime >= hours.start && currentTime <= hours.end
    }

    return true
  }
}

// =============================================================================
// Global Human Manager
// =============================================================================

let globalHumanManager: HumanManager | null = null

/**
 * Get the global human manager instance
 */
export function getHumanManager(): HumanManager {
  if (!globalHumanManager) {
    globalHumanManager = new HumanManager()
  }
  return globalHumanManager
}
