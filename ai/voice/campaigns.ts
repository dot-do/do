/**
 * Outbound Campaign Management
 *
 * Manages automated outbound calling campaigns with
 * scheduling, contact management, and real-time statistics.
 *
 * @module ai/voice/campaigns
 */

import type {
  OutboundCampaign,
  CampaignContact,
  CampaignSchedule,
  CampaignSettings,
  CampaignStats,
} from '../../types/voice-ai'
import { VoiceSessionManager } from './sessions'
import { VoiceAgentManager } from './agents'

// =============================================================================
// Types
// =============================================================================

/**
 * Options for creating a campaign
 */
export interface CreateCampaignOptions {
  /** Campaign name */
  name: string
  /** Voice agent ID to use for calls */
  agentId: string
  /** Contacts to call */
  contacts: Omit<CampaignContact, 'id' | 'status'>[]
  /** Schedule configuration */
  schedule?: CampaignSchedule
  /** Campaign settings */
  settings: Omit<CampaignSettings, 'callerId'> & { callerId: string }
}

/**
 * Options for updating a campaign
 */
export interface UpdateCampaignOptions {
  /** Campaign name */
  name?: string
  /** Schedule configuration */
  schedule?: Partial<CampaignSchedule>
  /** Campaign settings */
  settings?: Partial<CampaignSettings>
}

/**
 * Options for listing campaigns
 */
export interface ListCampaignsOptions {
  /** Filter by status */
  status?: OutboundCampaign['status']
  /** Filter by agent ID */
  agentId?: string
  /** Limit results */
  limit?: number
  /** Offset for pagination */
  offset?: number
}

/**
 * Result of listing campaigns
 */
export interface ListCampaignsResult {
  /** Campaigns */
  items: OutboundCampaign[]
  /** Total count */
  total: number
  /** Has more results */
  hasMore: boolean
}

/**
 * Campaign event types
 */
export type CampaignEventType =
  | 'started'
  | 'paused'
  | 'resumed'
  | 'completed'
  | 'contact_called'
  | 'contact_completed'
  | 'contact_failed'
  | 'stats_updated'

/**
 * Campaign event handler
 */
export type CampaignEventHandler<T = unknown> = (data: T) => void | Promise<void>

// =============================================================================
// Campaign Manager
// =============================================================================

/**
 * Outbound campaign manager
 *
 * Manages automated outbound calling campaigns with scheduling,
 * contact list management, retry logic, and statistics.
 *
 * @example
 * ```typescript
 * const manager = new VoiceCampaignManager(storage, sessionManager, agentManager)
 *
 * // Create a campaign
 * const campaign = await manager.create({
 *   name: 'Q4 Follow-up',
 *   agentId: 'vagent_sales',
 *   contacts: [
 *     { phone: '+1-555-0001', name: 'Alice' },
 *     { phone: '+1-555-0002', name: 'Bob' },
 *   ],
 *   schedule: {
 *     startDate: Date.now(),
 *     callingHours: { start: '09:00', end: '17:00' },
 *     daysOfWeek: [1, 2, 3, 4, 5],
 *     timezone: 'America/New_York',
 *     maxConcurrent: 5,
 *   },
 *   settings: {
 *     maxAttempts: 3,
 *     retryDelay: 60,
 *     voicemailDetection: true,
 *     callerId: '+1-555-0100',
 *   },
 * })
 *
 * // Start the campaign
 * await manager.start(campaign.id)
 *
 * // Monitor stats
 * const stats = await manager.getStats(campaign.id)
 * ```
 */
export class VoiceCampaignManager {
  private eventHandlers = new Map<string, Set<CampaignEventHandler>>()

  /**
   * Create a campaign manager
   *
   * @param storage - DO storage interface
   * @param sessionManager - Voice session manager
   * @param agentManager - Voice agent manager
   */
  constructor(
    private storage: DurableObjectStorage,
    private sessionManager: VoiceSessionManager,
    private agentManager: VoiceAgentManager
  ) {}

  /**
   * Create a new campaign
   *
   * @param options - Campaign options
   * @returns Created campaign
   */
  async create(options: CreateCampaignOptions): Promise<OutboundCampaign> {
    // Validate agent exists
    const agent = await this.agentManager.get(options.agentId)
    if (!agent) {
      throw new Error(`Voice agent not found: ${options.agentId}`)
    }

    const campaignId = `vcamp_${generateId()}`
    const now = Date.now()

    // Process contacts
    const contacts: CampaignContact[] = options.contacts.map((c, index) => ({
      id: `contact_${generateId()}`,
      phone: c.phone,
      name: c.name,
      context: c.context,
      status: 'Pending' as const,
    }))

    const campaign: OutboundCampaign = {
      id: campaignId,
      name: options.name,
      agentId: options.agentId,
      contacts,
      schedule: options.schedule,
      status: 'Draft',
      settings: options.settings,
      stats: {
        totalContacts: contacts.length,
        called: 0,
        completed: 0,
        transferred: 0,
        voicemail: 0,
        noAnswer: 0,
        failed: 0,
        avgDuration: 0,
        totalCost: 0,
      },
      createdAt: now,
    }

    await this.storage.put(`voice_campaign:${campaignId}`, campaign)

    return campaign
  }

  /**
   * Get a campaign by ID
   *
   * @param id - Campaign ID
   * @returns Campaign or null if not found
   */
  async get(id: string): Promise<OutboundCampaign | null> {
    const result = await this.storage.get<OutboundCampaign>(`voice_campaign:${id}`)
    return result ?? null
  }

  /**
   * Update a campaign
   *
   * Can only update draft or paused campaigns.
   *
   * @param id - Campaign ID
   * @param options - Fields to update
   * @returns Updated campaign
   */
  async update(id: string, options: UpdateCampaignOptions): Promise<OutboundCampaign> {
    const campaign = await this.get(id)
    if (!campaign) {
      throw new Error(`Campaign not found: ${id}`)
    }

    if (campaign.status === 'Running' || campaign.status === 'Completed') {
      throw new Error(`Cannot update campaign in status: ${campaign.status}`)
    }

    const updated: OutboundCampaign = {
      ...campaign,
      name: options.name ?? campaign.name,
      schedule: options.schedule ? { ...campaign.schedule, ...options.schedule } as CampaignSchedule : campaign.schedule,
      settings: options.settings ? { ...campaign.settings, ...options.settings } : campaign.settings,
    }

    await this.storage.put(`voice_campaign:${id}`, updated)

    return updated
  }

  /**
   * Add contacts to a campaign
   *
   * Can only add contacts to draft or paused campaigns.
   *
   * @param id - Campaign ID
   * @param contacts - Contacts to add
   * @returns Updated campaign
   */
  async addContacts(
    id: string,
    contacts: Omit<CampaignContact, 'id' | 'status'>[]
  ): Promise<OutboundCampaign> {
    const campaign = await this.get(id)
    if (!campaign) {
      throw new Error(`Campaign not found: ${id}`)
    }

    if (campaign.status === 'Running' || campaign.status === 'Completed') {
      throw new Error(`Cannot add contacts to campaign in status: ${campaign.status}`)
    }

    const newContacts: CampaignContact[] = contacts.map((c) => ({
      id: `contact_${generateId()}`,
      phone: c.phone,
      name: c.name,
      context: c.context,
      status: 'Pending' as const,
    }))

    const updated: OutboundCampaign = {
      ...campaign,
      contacts: [...campaign.contacts, ...newContacts],
      stats: campaign.stats ? {
        ...campaign.stats,
        totalContacts: campaign.contacts.length + newContacts.length,
      } : undefined,
    }

    await this.storage.put(`voice_campaign:${id}`, updated)

    return updated
  }

  /**
   * Remove a contact from a campaign
   *
   * @param id - Campaign ID
   * @param contactId - Contact ID
   * @returns Updated campaign
   */
  async removeContact(id: string, contactId: string): Promise<OutboundCampaign> {
    const campaign = await this.get(id)
    if (!campaign) {
      throw new Error(`Campaign not found: ${id}`)
    }

    if (campaign.status === 'Running' || campaign.status === 'Completed') {
      throw new Error(`Cannot remove contacts from campaign in status: ${campaign.status}`)
    }

    const updated: OutboundCampaign = {
      ...campaign,
      contacts: campaign.contacts.filter((c) => c.id !== contactId),
      stats: campaign.stats ? {
        ...campaign.stats,
        totalContacts: campaign.contacts.length - 1,
      } : undefined,
    }

    await this.storage.put(`voice_campaign:${id}`, updated)

    return updated
  }

  /**
   * Start a campaign
   *
   * @param id - Campaign ID
   * @returns Updated campaign
   */
  async start(id: string): Promise<OutboundCampaign> {
    const campaign = await this.get(id)
    if (!campaign) {
      throw new Error(`Campaign not found: ${id}`)
    }

    if (campaign.status !== 'Draft' && campaign.status !== 'Scheduled' && campaign.status !== 'Paused') {
      throw new Error(`Cannot start campaign in status: ${campaign.status}`)
    }

    const updated: OutboundCampaign = {
      ...campaign,
      status: 'Running',
      startedAt: campaign.startedAt ?? Date.now(),
    }

    await this.storage.put(`voice_campaign:${id}`, updated)

    // Emit started event
    await this.emit(id, 'started', { campaignId: id })

    // Schedule first batch of calls
    await this.scheduleNextBatch(id)

    return updated
  }

  /**
   * Pause a running campaign
   *
   * @param id - Campaign ID
   * @returns Updated campaign
   */
  async pause(id: string): Promise<OutboundCampaign> {
    const campaign = await this.get(id)
    if (!campaign) {
      throw new Error(`Campaign not found: ${id}`)
    }

    if (campaign.status !== 'Running') {
      throw new Error(`Cannot pause campaign in status: ${campaign.status}`)
    }

    const updated: OutboundCampaign = {
      ...campaign,
      status: 'Paused',
    }

    await this.storage.put(`voice_campaign:${id}`, updated)

    await this.emit(id, 'paused', { campaignId: id })

    return updated
  }

  /**
   * Resume a paused campaign
   *
   * @param id - Campaign ID
   * @returns Updated campaign
   */
  async resume(id: string): Promise<OutboundCampaign> {
    const campaign = await this.get(id)
    if (!campaign) {
      throw new Error(`Campaign not found: ${id}`)
    }

    if (campaign.status !== 'Paused') {
      throw new Error(`Cannot resume campaign in status: ${campaign.status}`)
    }

    const updated: OutboundCampaign = {
      ...campaign,
      status: 'Running',
    }

    await this.storage.put(`voice_campaign:${id}`, updated)

    await this.emit(id, 'resumed', { campaignId: id })

    // Resume calling
    await this.scheduleNextBatch(id)

    return updated
  }

  /**
   * Stop a campaign (mark as completed)
   *
   * @param id - Campaign ID
   * @returns Updated campaign
   */
  async stop(id: string): Promise<OutboundCampaign> {
    const campaign = await this.get(id)
    if (!campaign) {
      throw new Error(`Campaign not found: ${id}`)
    }

    const updated: OutboundCampaign = {
      ...campaign,
      status: 'Completed',
      completedAt: Date.now(),
    }

    await this.storage.put(`voice_campaign:${id}`, updated)

    await this.emit(id, 'completed', { campaignId: id })

    return updated
  }

  /**
   * Delete a campaign
   *
   * @param id - Campaign ID
   * @returns True if deleted
   */
  async delete(id: string): Promise<boolean> {
    const campaign = await this.get(id)
    if (!campaign) {
      return false
    }

    if (campaign.status === 'Running') {
      throw new Error('Cannot delete a running campaign')
    }

    await this.storage.delete(`voice_campaign:${id}`)
    return true
  }

  /**
   * List campaigns
   *
   * @param options - Filter and pagination options
   * @returns List of campaigns
   */
  async list(options: ListCampaignsOptions = {}): Promise<ListCampaignsResult> {
    const { status, agentId, limit = 50, offset = 0 } = options

    const allCampaigns = await this.storage.list<OutboundCampaign>({ prefix: 'voice_campaign:' })

    let items: OutboundCampaign[] = []
    for (const [, campaign] of allCampaigns) {
      if (status && campaign.status !== status) continue
      if (agentId && campaign.agentId !== agentId) continue
      items.push(campaign)
    }

    // Sort by createdAt descending
    items.sort((a, b) => b.createdAt - a.createdAt)

    const total = items.length
    items = items.slice(offset, offset + limit)

    return {
      items,
      total,
      hasMore: offset + items.length < total,
    }
  }

  /**
   * Get campaign statistics
   *
   * @param id - Campaign ID
   * @returns Campaign statistics
   */
  async getStats(id: string): Promise<CampaignStats> {
    const campaign = await this.get(id)
    if (!campaign) {
      throw new Error(`Campaign not found: ${id}`)
    }

    // Recalculate stats from contacts
    const stats: CampaignStats = {
      totalContacts: campaign.contacts.length,
      called: 0,
      completed: 0,
      transferred: 0,
      voicemail: 0,
      noAnswer: 0,
      failed: 0,
      avgDuration: 0,
      totalCost: 0,
    }

    let totalDuration = 0
    let callsWithDuration = 0

    for (const contact of campaign.contacts) {
      if (contact.status === 'Completed' || contact.status === 'Failed') {
        stats.called++
      }
      if (contact.status === 'Completed') {
        stats.completed++
        // Get session for duration/cost
        if (contact.sessionId) {
          const session = await this.sessionManager.get(contact.sessionId)
          if (session) {
            if (session.duration) {
              totalDuration += session.duration
              callsWithDuration++
            }
            if (session.cost) {
              stats.totalCost += session.cost.total
            }
            if (session.outcome?.type === 'Transferred') {
              stats.transferred++
            }
            if (session.outcome?.type === 'Voicemail') {
              stats.voicemail++
            }
            if (session.outcome?.type === 'NoAnswer') {
              stats.noAnswer++
            }
          }
        }
      }
      if (contact.status === 'Failed') {
        stats.failed++
      }
    }

    stats.avgDuration = callsWithDuration > 0 ? totalDuration / callsWithDuration : 0

    return stats
  }

  /**
   * Schedule the next batch of calls
   *
   * @param id - Campaign ID
   */
  async scheduleNextBatch(id: string): Promise<void> {
    const campaign = await this.get(id)
    if (!campaign || campaign.status !== 'Running') {
      return
    }

    // Check calling hours
    if (campaign.schedule && !isWithinCallingHours(campaign.schedule)) {
      // Schedule alarm for next calling window
      const nextWindow = getNextCallingWindow(campaign.schedule)
      // TODO: Set DO alarm
      // await this.ctx.storage.setAlarm(nextWindow)
      return
    }

    // Get pending contacts up to maxConcurrent
    const maxConcurrent = campaign.schedule?.maxConcurrent ?? 1
    const pendingContacts = campaign.contacts
      .filter((c) => c.status === 'Pending')
      .slice(0, maxConcurrent)

    if (pendingContacts.length === 0) {
      // No more contacts, mark as completed
      await this.stop(id)
      return
    }

    // Start calls for each contact
    for (const contact of pendingContacts) {
      await this.startContactCall(id, contact)
    }
  }

  /**
   * Start a call for a campaign contact
   *
   * @param campaignId - Campaign ID
   * @param contact - Contact to call
   */
  private async startContactCall(campaignId: string, contact: CampaignContact): Promise<void> {
    const campaign = await this.get(campaignId)
    if (!campaign) return

    try {
      // Update contact status
      await this.updateContactStatus(campaignId, contact.id, 'Calling')

      // Start the call
      const session = await this.sessionManager.startOutbound({
        agentId: campaign.agentId,
        phone: contact.phone,
        context: {
          campaignId,
          contactId: contact.id,
          contactName: contact.name,
          ...contact.context,
        },
        metadata: {
          campaignId,
          contactId: contact.id,
        },
      })

      // Update contact with session ID
      await this.updateContactSession(campaignId, contact.id, session.id)

      await this.emit(campaignId, 'contact_called', {
        campaignId,
        contactId: contact.id,
        sessionId: session.id,
      })
    } catch (error) {
      // Mark contact as failed
      await this.updateContactStatus(campaignId, contact.id, 'Failed')

      await this.emit(campaignId, 'contact_failed', {
        campaignId,
        contactId: contact.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Update contact status
   */
  private async updateContactStatus(
    campaignId: string,
    contactId: string,
    status: CampaignContact['status']
  ): Promise<void> {
    const campaign = await this.get(campaignId)
    if (!campaign) return

    const updated: OutboundCampaign = {
      ...campaign,
      contacts: campaign.contacts.map((c) =>
        c.id === contactId ? { ...c, status } : c
      ),
    }

    await this.storage.put(`voice_campaign:${campaignId}`, updated)
  }

  /**
   * Update contact with session ID
   */
  private async updateContactSession(
    campaignId: string,
    contactId: string,
    sessionId: string
  ): Promise<void> {
    const campaign = await this.get(campaignId)
    if (!campaign) return

    const updated: OutboundCampaign = {
      ...campaign,
      contacts: campaign.contacts.map((c) =>
        c.id === contactId ? { ...c, sessionId } : c
      ),
    }

    await this.storage.put(`voice_campaign:${campaignId}`, updated)
  }

  /**
   * Handle session completion (called from webhook processor)
   *
   * @param campaignId - Campaign ID
   * @param contactId - Contact ID
   * @param outcome - Call outcome
   */
  async handleSessionComplete(
    campaignId: string,
    contactId: string,
    outcome: 'Completed' | 'Failed'
  ): Promise<void> {
    await this.updateContactStatus(campaignId, contactId, outcome)

    await this.emit(campaignId, outcome === 'Completed' ? 'contact_completed' : 'contact_failed', {
      campaignId,
      contactId,
    })

    // Update stats
    await this.emit(campaignId, 'stats_updated', await this.getStats(campaignId))

    // Schedule next batch
    await this.scheduleNextBatch(campaignId)
  }

  /**
   * Subscribe to campaign events
   *
   * @param campaignId - Campaign ID
   * @param event - Event type
   * @param handler - Event handler
   * @returns Unsubscribe function
   */
  on(campaignId: string, event: CampaignEventType, handler: CampaignEventHandler): () => void {
    const key = `${campaignId}:${event}`
    if (!this.eventHandlers.has(key)) {
      this.eventHandlers.set(key, new Set())
    }
    this.eventHandlers.get(key)!.add(handler)

    return () => {
      this.eventHandlers.get(key)?.delete(handler)
    }
  }

  /**
   * Watch campaign stats (returns async iterator)
   *
   * @param campaignId - Campaign ID
   * @returns Async iterator of stats updates
   */
  async *watchStats(campaignId: string): AsyncGenerator<CampaignStats> {
    // Initial stats
    yield await this.getStats(campaignId)

    // Create a channel for stats updates
    const queue: CampaignStats[] = []
    let resolve: (() => void) | null = null

    const unsubscribe = this.on(campaignId, 'stats_updated', (stats) => {
      queue.push(stats as CampaignStats)
      if (resolve) {
        resolve()
        resolve = null
      }
    })

    try {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!
        } else {
          // Wait for next update
          await new Promise<void>((r) => { resolve = r })
        }

        // Check if campaign is still running
        const campaign = await this.get(campaignId)
        if (!campaign || campaign.status === 'Completed') {
          break
        }
      }
    } finally {
      unsubscribe()
    }
  }

  /**
   * Emit a campaign event
   */
  private async emit(campaignId: string, event: CampaignEventType, data: unknown): Promise<void> {
    const key = `${campaignId}:${event}`
    const handlers = this.eventHandlers.get(key)
    if (handlers) {
      for (const handler of handlers) {
        await handler(data)
      }
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a random ID
 */
function generateId(): string {
  // TODO: Use nanoid
  return Math.random().toString(36).substring(2, 15)
}

/**
 * Check if current time is within calling hours
 */
function isWithinCallingHours(schedule: CampaignSchedule): boolean {
  const now = new Date()

  // Check day of week
  const dayOfWeek = now.getDay()
  if (!schedule.daysOfWeek.includes(dayOfWeek)) {
    return false
  }

  // Parse calling hours
  const [startHour, startMin] = schedule.callingHours.start.split(':').map(Number)
  const [endHour, endMin] = schedule.callingHours.end.split(':').map(Number)

  // Get current time in campaign timezone (simplified - should use proper timezone lib)
  const currentHour = now.getHours()
  const currentMin = now.getMinutes()

  const currentMinutes = currentHour * 60 + currentMin
  const startMinutes = startHour * 60 + startMin
  const endMinutes = endHour * 60 + endMin

  return currentMinutes >= startMinutes && currentMinutes < endMinutes
}

/**
 * Get next calling window start time
 */
function getNextCallingWindow(schedule: CampaignSchedule): number {
  const now = new Date()

  // Find next valid day
  for (let i = 0; i < 7; i++) {
    const checkDate = new Date(now.getTime() + i * 24 * 60 * 60 * 1000)
    const dayOfWeek = checkDate.getDay()

    if (schedule.daysOfWeek.includes(dayOfWeek)) {
      // Set to start of calling hours
      const [startHour, startMin] = schedule.callingHours.start.split(':').map(Number)
      checkDate.setHours(startHour, startMin, 0, 0)

      // If today and past calling hours, skip to next valid day
      if (i === 0 && checkDate.getTime() < now.getTime()) {
        continue
      }

      return checkDate.getTime()
    }
  }

  // Fallback to tomorrow
  return now.getTime() + 24 * 60 * 60 * 1000
}

// =============================================================================
// Singleton Access
// =============================================================================

let defaultManager: VoiceCampaignManager | null = null

/**
 * Voice campaigns singleton access
 */
export const VoiceCampaigns = {
  /**
   * Initialize with dependencies
   */
  init(
    storage: DurableObjectStorage,
    sessionManager: VoiceSessionManager,
    agentManager: VoiceAgentManager
  ): void {
    defaultManager = new VoiceCampaignManager(storage, sessionManager, agentManager)
  },

  /**
   * Create a campaign
   */
  async create(options: CreateCampaignOptions): Promise<OutboundCampaign> {
    if (!defaultManager) throw new Error('VoiceCampaigns not initialized')
    return defaultManager.create(options)
  },

  /**
   * Get a campaign
   */
  async get(id: string): Promise<OutboundCampaign | null> {
    if (!defaultManager) throw new Error('VoiceCampaigns not initialized')
    return defaultManager.get(id)
  },

  /**
   * Start a campaign
   */
  async start(id: string): Promise<OutboundCampaign> {
    if (!defaultManager) throw new Error('VoiceCampaigns not initialized')
    return defaultManager.start(id)
  },

  /**
   * Pause a campaign
   */
  async pause(id: string): Promise<OutboundCampaign> {
    if (!defaultManager) throw new Error('VoiceCampaigns not initialized')
    return defaultManager.pause(id)
  },

  /**
   * Resume a campaign
   */
  async resume(id: string): Promise<OutboundCampaign> {
    if (!defaultManager) throw new Error('VoiceCampaigns not initialized')
    return defaultManager.resume(id)
  },

  /**
   * Get campaign stats
   */
  async getStats(id: string): Promise<CampaignStats> {
    if (!defaultManager) throw new Error('VoiceCampaigns not initialized')
    return defaultManager.getStats(id)
  },

  /**
   * List campaigns
   */
  async list(options?: ListCampaignsOptions): Promise<ListCampaignsResult> {
    if (!defaultManager) throw new Error('VoiceCampaigns not initialized')
    return defaultManager.list(options)
  },

  /**
   * Watch campaign stats
   */
  watchStats(id: string): AsyncGenerator<CampaignStats> {
    if (!defaultManager) throw new Error('VoiceCampaigns not initialized')
    return defaultManager.watchStats(id)
  },
}

// =============================================================================
// Type Exports
// =============================================================================

// Note: DurableObjectStorage is a Cloudflare Workers type, imported at runtime
