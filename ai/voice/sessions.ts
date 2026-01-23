/**
 * Voice Session Management
 *
 * Manages the lifecycle of voice calls including outbound calls,
 * inbound calls, and WebRTC sessions.
 *
 * @module ai/voice/sessions
 */

import type {
  VoiceSession,
  VoiceSessionStatus,
  TranscriptEntry,
  ToolCallRecord,
  CallOutcome,
  CallCost,
  SentimentAnalysis,
} from '../../types/voice-ai'
import { VoiceProviderFactory } from './providers'
import { VoiceAgentManager } from './agents'

// =============================================================================
// Types
// =============================================================================

/**
 * Options for starting an outbound call
 */
export interface StartOutboundCallOptions {
  /** Voice agent ID */
  agentId: string
  /** Phone number to call */
  phone: string
  /** Context to pass to the agent */
  context?: Record<string, unknown>
  /** Metadata to attach to session */
  metadata?: Record<string, unknown>
}

/**
 * Options for listing sessions
 */
export interface ListSessionsOptions {
  /** Filter by agent ID */
  agentId?: string
  /** Filter by status */
  status?: VoiceSessionStatus
  /** Filter by type */
  type?: 'inbound' | 'outbound' | 'web'
  /** Start time range (unix ms) */
  startTimeFrom?: number
  /** Start time range (unix ms) */
  startTimeTo?: number
  /** Limit results */
  limit?: number
  /** Offset for pagination */
  offset?: number
  /** Order by field */
  orderBy?: 'startTime' | 'duration' | 'cost'
  /** Order direction */
  orderDir?: 'asc' | 'desc'
}

/**
 * Result of listing sessions
 */
export interface ListSessionsResult {
  /** Sessions */
  items: VoiceSession[]
  /** Total count */
  total: number
  /** Has more results */
  hasMore: boolean
}

/**
 * Session event types
 */
export type SessionEventType =
  | 'started'
  | 'ringing'
  | 'answered'
  | 'transcript'
  | 'toolCall'
  | 'toolResult'
  | 'transferring'
  | 'ended'
  | 'error'

/**
 * Session event handler
 */
export type SessionEventHandler<T = unknown> = (data: T) => void | Promise<void>

/**
 * Session update from provider webhook
 */
export interface SessionUpdate {
  /** Update type */
  type: SessionEventType
  /** Session ID */
  sessionId: string
  /** Update data */
  data: Record<string, unknown>
}

// =============================================================================
// Voice Session Manager
// =============================================================================

/**
 * Voice session manager
 *
 * Manages voice call sessions including lifecycle, transcripts,
 * tool calls, and recordings.
 *
 * @example
 * ```typescript
 * const manager = new VoiceSessionManager(storage, agentManager)
 *
 * // Start an outbound call
 * const session = await manager.startOutbound({
 *   agentId: 'vagent_123',
 *   phone: '+1-555-0123',
 *   context: { customerName: 'John' },
 * })
 *
 * // Get session status
 * const status = await manager.get(session.id)
 *
 * // List recent sessions
 * const sessions = await manager.list({ agentId: 'vagent_123', limit: 10 })
 * ```
 */
export class VoiceSessionManager {
  private eventHandlers = new Map<string, Set<SessionEventHandler>>()

  /**
   * Create a new session manager
   *
   * @param storage - DO storage interface
   * @param agentManager - Voice agent manager
   */
  constructor(
    private storage: DurableObjectStorage,
    private agentManager: VoiceAgentManager
  ) {}

  /**
   * Start an outbound call
   *
   * @param options - Call options
   * @returns Created session
   */
  async startOutbound(options: StartOutboundCallOptions): Promise<VoiceSession> {
    const { agentId, phone, context, metadata } = options

    // Get agent
    const agent = await this.agentManager.get(agentId)
    if (!agent) {
      throw new Error(`Voice agent not found: ${agentId}`)
    }

    // Validate phone number
    if (!isValidPhoneNumber(phone)) {
      throw new Error(`Invalid phone number: ${phone}`)
    }

    // Start call via provider
    const adapter = VoiceProviderFactory.get(agent.provider)
    const agentData = await this.storage.get<{ providerAgentId: string }>(`voice_agent:${agentId}`)
    if (!agentData?.providerAgentId) {
      throw new Error(`Provider agent ID not found for: ${agentId}`)
    }

    const providerCallId = await adapter.startCall(
      agentData.providerAgentId,
      phone,
      context
    )

    // Create session record
    const sessionId = `vsess_${generateId()}`
    const now = Date.now()

    const session: VoiceSession = {
      id: sessionId,
      agentId,
      providerSessionId: providerCallId,
      type: 'Outbound',
      customerPhone: phone,
      status: 'Initializing',
      startTime: now,
      transcript: [],
      toolCalls: [],
      metadata,
    }

    await this.storage.put(`voice_session:${sessionId}`, session)

    // Index by provider session ID
    await this.storage.put(`voice_session_provider:${providerCallId}`, sessionId)

    return session
  }

  /**
   * Create a session for an inbound call (called from webhook)
   *
   * @param agentId - Voice agent ID
   * @param providerCallId - Provider's call ID
   * @param customerPhone - Customer's phone number
   * @returns Created session
   */
  async createInbound(
    agentId: string,
    providerCallId: string,
    customerPhone: string
  ): Promise<VoiceSession> {
    const sessionId = `vsess_${generateId()}`
    const now = Date.now()

    const session: VoiceSession = {
      id: sessionId,
      agentId,
      providerSessionId: providerCallId,
      type: 'Inbound',
      customerPhone,
      status: 'Ringing',
      startTime: now,
      transcript: [],
      toolCalls: [],
    }

    await this.storage.put(`voice_session:${sessionId}`, session)
    await this.storage.put(`voice_session_provider:${providerCallId}`, sessionId)

    return session
  }

  /**
   * Get a session by ID
   *
   * @param id - Session ID
   * @returns Session or null if not found
   */
  async get(id: string): Promise<VoiceSession | null> {
    const session = await this.storage.get<VoiceSession>(`voice_session:${id}`)
    return session ?? null
  }

  /**
   * Get a session by provider session ID
   *
   * @param providerSessionId - Provider's session ID
   * @returns Session or null if not found
   */
  async getByProviderSessionId(providerSessionId: string): Promise<VoiceSession | null> {
    const id = await this.storage.get<string>(`voice_session_provider:${providerSessionId}`)
    if (!id) return null
    return this.get(id)
  }

  /**
   * Update session status
   *
   * @param id - Session ID
   * @param status - New status
   * @param outcome - Call outcome (if completed/failed)
   */
  async updateStatus(
    id: string,
    status: VoiceSessionStatus,
    outcome?: CallOutcome
  ): Promise<VoiceSession> {
    const session = await this.get(id)
    if (!session) {
      throw new Error(`Session not found: ${id}`)
    }

    const updates: Partial<VoiceSession> = { status }

    if (status === 'Completed' || status === 'Failed') {
      updates.endTime = Date.now()
      updates.duration = Math.floor((updates.endTime - session.startTime) / 1000)
      if (outcome) {
        updates.outcome = outcome
      }
    }

    const updated = { ...session, ...updates }
    await this.storage.put(`voice_session:${id}`, updated)

    // Emit event - map session status to valid event type
    const eventType = this.statusToEventType(status)
    await this.emit(id, eventType, {
      status,
      outcome,
    })

    return updated
  }

  /**
   * Append a transcript entry
   *
   * @param id - Session ID
   * @param entry - Transcript entry
   */
  async appendTranscript(id: string, entry: TranscriptEntry): Promise<void> {
    const session = await this.get(id)
    if (!session) {
      throw new Error(`Session not found: ${id}`)
    }

    const transcript = [...(session.transcript || []), entry]
    await this.storage.put(`voice_session:${id}`, { ...session, transcript })

    // Emit event
    await this.emit(id, 'transcript', entry)
  }

  /**
   * Record a tool call
   *
   * @param id - Session ID
   * @param toolCall - Tool call record
   */
  async recordToolCall(id: string, toolCall: ToolCallRecord): Promise<void> {
    const session = await this.get(id)
    if (!session) {
      throw new Error(`Session not found: ${id}`)
    }

    const toolCalls = [...(session.toolCalls || []), toolCall]
    await this.storage.put(`voice_session:${id}`, { ...session, toolCalls })

    // Emit event
    await this.emit(id, toolCall.endTime ? 'toolResult' : 'toolCall', toolCall)
  }

  /**
   * Set recording URL
   *
   * @param id - Session ID
   * @param recordingUrl - URL of the recording
   */
  async setRecordingUrl(id: string, recordingUrl: string): Promise<void> {
    const session = await this.get(id)
    if (!session) {
      throw new Error(`Session not found: ${id}`)
    }

    await this.storage.put(`voice_session:${id}`, { ...session, recordingUrl })
  }

  /**
   * Set call summary
   *
   * @param id - Session ID
   * @param summary - AI-generated summary
   */
  async setSummary(id: string, summary: string): Promise<void> {
    const session = await this.get(id)
    if (!session) {
      throw new Error(`Session not found: ${id}`)
    }

    await this.storage.put(`voice_session:${id}`, { ...session, summary })
  }

  /**
   * Set sentiment analysis
   *
   * @param id - Session ID
   * @param sentiment - Sentiment analysis
   */
  async setSentiment(id: string, sentiment: SentimentAnalysis): Promise<void> {
    const session = await this.get(id)
    if (!session) {
      throw new Error(`Session not found: ${id}`)
    }

    await this.storage.put(`voice_session:${id}`, { ...session, sentiment })
  }

  /**
   * Set call cost
   *
   * @param id - Session ID
   * @param cost - Cost breakdown
   */
  async setCost(id: string, cost: CallCost): Promise<void> {
    const session = await this.get(id)
    if (!session) {
      throw new Error(`Session not found: ${id}`)
    }

    await this.storage.put(`voice_session:${id}`, { ...session, cost })
  }

  /**
   * End a session
   *
   * @param id - Session ID
   * @returns True if ended, false if already ended or not found
   */
  async end(id: string): Promise<boolean> {
    const session = await this.get(id)
    if (!session) {
      return false
    }

    if (session.status === 'Completed' || session.status === 'Failed') {
      return false
    }

    // End call via provider
    const agent = await this.agentManager.get(session.agentId)
    if (agent) {
      const adapter = VoiceProviderFactory.get(agent.provider)
      await adapter.endCall(session.providerSessionId)
    }

    await this.updateStatus(id, 'Completed', {
      type: 'Completed',
      reason: 'ended_by_system',
    })

    return true
  }

  /**
   * List sessions
   *
   * @param options - Filter and pagination options
   * @returns List of sessions
   */
  async list(options: ListSessionsOptions = {}): Promise<ListSessionsResult> {
    const {
      agentId,
      status,
      type,
      startTimeFrom,
      startTimeTo,
      limit = 50,
      offset = 0,
      orderBy = 'startTime',
      orderDir = 'desc',
    } = options

    // Get all sessions (in production, use SQL with proper filtering)
    const allSessions = await this.storage.list<VoiceSession>({ prefix: 'voice_session:' })

    let items: VoiceSession[] = []
    for (const [key, session] of allSessions) {
      // Skip provider index entries
      if (key.startsWith('voice_session_provider:')) continue

      // Apply filters
      if (agentId && session.agentId !== agentId) continue
      if (status && session.status !== status) continue
      const typeMatch = type ? (type === 'inbound' ? 'Inbound' : type === 'outbound' ? 'Outbound' : 'Web') : null
      if (typeMatch && session.type !== typeMatch) continue
      if (startTimeFrom && session.startTime < startTimeFrom) continue
      if (startTimeTo && session.startTime > startTimeTo) continue

      items.push(session)
    }

    // Sort
    items.sort((a, b) => {
      let aVal: number
      let bVal: number

      if (orderBy === 'cost') {
        aVal = a.cost?.total ?? 0
        bVal = b.cost?.total ?? 0
      } else {
        aVal = a[orderBy] ?? 0
        bVal = b[orderBy] ?? 0
      }

      return orderDir === 'desc' ? bVal - aVal : aVal - bVal
    })

    const total = items.length
    items = items.slice(offset, offset + limit)

    return {
      items,
      total,
      hasMore: offset + items.length < total,
    }
  }

  /**
   * Get full transcript for a session
   *
   * @param id - Session ID
   * @returns Transcript entries or null if session not found
   */
  async getTranscript(id: string): Promise<TranscriptEntry[] | null> {
    const session = await this.get(id)
    return session?.transcript ?? null
  }

  /**
   * Get recording URL for a session
   *
   * @param id - Session ID
   * @returns Recording URL or null if not available
   */
  async getRecording(id: string): Promise<string | null> {
    const session = await this.get(id)
    return session?.recordingUrl ?? null
  }

  /**
   * Subscribe to session events
   *
   * @param sessionId - Session ID
   * @param event - Event type
   * @param handler - Event handler
   * @returns Unsubscribe function
   */
  on(sessionId: string, event: SessionEventType, handler: SessionEventHandler): () => void {
    const key = `${sessionId}:${event}`
    if (!this.eventHandlers.has(key)) {
      this.eventHandlers.set(key, new Set())
    }
    this.eventHandlers.get(key)!.add(handler)

    return () => {
      this.eventHandlers.get(key)?.delete(handler)
    }
  }

  /**
   * Map session status to event type
   *
   * @param status - Session status
   * @returns Corresponding event type
   */
  private statusToEventType(status: VoiceSessionStatus): SessionEventType {
    switch (status) {
      case 'Initializing':
        return 'started'
      case 'Ringing':
        return 'ringing'
      case 'InProgress':
        return 'answered'
      case 'Transferring':
        return 'transferring'
      case 'Completed':
      case 'Failed':
      case 'NoAnswer':
        return 'ended'
      default:
        return 'ended'
    }
  }

  /**
   * Emit a session event
   *
   * @param sessionId - Session ID
   * @param event - Event type
   * @param data - Event data
   */
  private async emit(sessionId: string, event: SessionEventType, data: unknown): Promise<void> {
    const key = `${sessionId}:${event}`
    const handlers = this.eventHandlers.get(key)
    if (handlers) {
      for (const handler of handlers) {
        await handler(data)
      }
    }
  }

  /**
   * Get session statistics
   *
   * @param agentId - Optional agent ID to filter
   * @param startTime - Start of time range
   * @param endTime - End of time range
   * @returns Session statistics
   */
  async getStats(
    agentId?: string,
    startTime?: number,
    endTime?: number
  ): Promise<{
    totalCalls: number
    completedCalls: number
    failedCalls: number
    avgDuration: number
    totalDuration: number
    totalCost: number
  }> {
    const sessions = await this.list({
      agentId,
      startTimeFrom: startTime,
      startTimeTo: endTime,
      limit: 10000,
    })

    let totalDuration = 0
    let totalCost = 0
    let completedCalls = 0
    let failedCalls = 0

    for (const session of sessions.items) {
      if (session.duration) totalDuration += session.duration
      if (session.cost) totalCost += session.cost.total
      if (session.status === 'Completed') completedCalls++
      if (session.status === 'Failed') failedCalls++
    }

    return {
      totalCalls: sessions.total,
      completedCalls,
      failedCalls,
      avgDuration: sessions.total > 0 ? totalDuration / sessions.total : 0,
      totalDuration,
      totalCost,
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
 * Validate phone number format
 */
function isValidPhoneNumber(phone: string): boolean {
  // Basic validation - E.164 format
  return /^\+?[1-9]\d{1,14}$/.test(phone.replace(/[\s\-\(\)]/g, ''))
}

// =============================================================================
// Singleton Access
// =============================================================================

let defaultManager: VoiceSessionManager | null = null

/**
 * Voice sessions singleton access
 */
export const VoiceSessions = {
  /**
   * Initialize with storage and agent manager
   */
  init(storage: DurableObjectStorage, agentManager: VoiceAgentManager): void {
    defaultManager = new VoiceSessionManager(storage, agentManager)
  },

  /**
   * Start an outbound call
   */
  async startOutbound(options: StartOutboundCallOptions): Promise<VoiceSession> {
    if (!defaultManager) throw new Error('VoiceSessions not initialized')
    return defaultManager.startOutbound(options)
  },

  /**
   * Get a session
   */
  async get(id: string): Promise<VoiceSession | null> {
    if (!defaultManager) throw new Error('VoiceSessions not initialized')
    return defaultManager.get(id)
  },

  /**
   * List sessions
   */
  async list(options?: ListSessionsOptions): Promise<ListSessionsResult> {
    if (!defaultManager) throw new Error('VoiceSessions not initialized')
    return defaultManager.list(options)
  },

  /**
   * End a session
   */
  async end(id: string): Promise<boolean> {
    if (!defaultManager) throw new Error('VoiceSessions not initialized')
    return defaultManager.end(id)
  },

  /**
   * Get transcript
   */
  async getTranscript(id: string): Promise<TranscriptEntry[] | null> {
    if (!defaultManager) throw new Error('VoiceSessions not initialized')
    return defaultManager.getTranscript(id)
  },

  /**
   * Get recording
   */
  async getRecording(id: string): Promise<string | null> {
    if (!defaultManager) throw new Error('VoiceSessions not initialized')
    return defaultManager.getRecording(id)
  },
}
