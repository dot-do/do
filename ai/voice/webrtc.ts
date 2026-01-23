/**
 * WebRTC Session Handling
 *
 * Manages browser-based voice calls using WebRTC.
 * Supports multiple providers (LiveKit, Daily, Twilio).
 *
 * @module ai/voice/webrtc
 */

import type {
  WebRTCConfig,
  RealtimeTranscriptionConfig,
  VoiceAIProvider,
} from '../../types/voice-ai'
import { VoiceProviderFactory } from './providers'
import { VoiceAgentManager } from './agents'
import { VoiceSessionManager } from './sessions'

// =============================================================================
// Types
// =============================================================================

/**
 * Options for creating a WebRTC session
 */
export interface CreateWebRTCSessionOptions {
  /** Voice agent ID */
  agentId: string
  /** Participant identity */
  identity: string
  /** Display name */
  displayName?: string
  /** Audio-only mode (no video) */
  audioOnly?: boolean
  /** Auto-connect when joining */
  autoConnect?: boolean
  /** Session metadata */
  metadata?: Record<string, unknown>
  /** Real-time transcription config */
  transcription?: RealtimeTranscriptionConfig
}

/**
 * Result of creating a WebRTC session
 */
export interface WebRTCSessionResult {
  /** Session ID (for tracking) */
  sessionId: string
  /** Room name */
  roomName: string
  /** Room URL (for client connection) */
  roomUrl: string
  /** Access token (for authentication) */
  token: string
  /** WebRTC config */
  config: WebRTCConfig
}

/**
 * WebRTC room information
 */
export interface WebRTCRoom {
  /** Room name */
  name: string
  /** Room URL */
  url: string
  /** Session ID */
  sessionId: string
  /** Agent ID */
  agentId: string
  /** Provider */
  provider: VoiceAIProvider
  /** Current participants */
  participants: WebRTCParticipant[]
  /** Created timestamp */
  createdAt: number
  /** Room status */
  status: 'active' | 'closed'
}

/**
 * WebRTC participant
 */
export interface WebRTCParticipant {
  /** Participant identity */
  identity: string
  /** Display name */
  displayName?: string
  /** Is AI agent */
  isAgent: boolean
  /** Joined timestamp */
  joinedAt: number
  /** Connection state */
  connectionState: 'connecting' | 'connected' | 'disconnected'
}

/**
 * WebRTC event types
 */
export type WebRTCEventType =
  | 'room_created'
  | 'participant_joined'
  | 'participant_left'
  | 'track_subscribed'
  | 'track_unsubscribed'
  | 'room_closed'

// =============================================================================
// WebRTC Session Manager
// =============================================================================

/**
 * WebRTC session manager
 *
 * Creates and manages WebRTC sessions for browser-based voice calls.
 * Works with LiveKit, Daily, or other WebRTC providers.
 *
 * @example
 * ```typescript
 * const manager = new WebRTCSessionManager(storage, agentManager, sessionManager)
 *
 * // Create a session for a user
 * const { sessionId, roomUrl, token } = await manager.create({
 *   agentId: 'vagent_support',
 *   identity: 'user_123',
 *   displayName: 'John Doe',
 *   audioOnly: true,
 * })
 *
 * // Client uses token to connect
 * // const room = await LivekitClient.connect(roomUrl, token)
 *
 * // Get room info
 * const room = await manager.getRoom(sessionId)
 * ```
 */
export class WebRTCSessionManager {
  /**
   * Create a WebRTC session manager
   *
   * @param storage - DO storage interface
   * @param agentManager - Voice agent manager
   * @param sessionManager - Voice session manager
   */
  constructor(
    private storage: DurableObjectStorage,
    private agentManager: VoiceAgentManager,
    private sessionManager: VoiceSessionManager
  ) {}

  /**
   * Create a new WebRTC session
   *
   * Creates a room and generates an access token for the participant.
   *
   * @param options - Session options
   * @returns Session details including token and room URL
   */
  async create(options: CreateWebRTCSessionOptions): Promise<WebRTCSessionResult> {
    const { agentId, identity, displayName, audioOnly, autoConnect, metadata, transcription } = options

    // Get agent
    const agent = await this.agentManager.get(agentId)
    if (!agent) {
      throw new Error(`Voice agent not found: ${agentId}`)
    }

    // Get provider adapter
    const adapter = VoiceProviderFactory.get(agent.provider)
    if (!adapter.createRoom) {
      throw new Error(`Provider ${agent.provider} does not support WebRTC`)
    }

    // Get provider agent ID
    const agentData = await this.storage.get<{ providerAgentId: string }>(`voice_agent:${agentId}`)
    if (!agentData?.providerAgentId) {
      throw new Error(`Provider agent ID not found for: ${agentId}`)
    }

    // Create room via provider
    const { token, roomUrl } = await adapter.createRoom(agentData.providerAgentId, identity)

    // Extract room name from URL
    const roomName = extractRoomName(roomUrl)

    // Create voice session to track the call
    const session = await this.sessionManager.createInbound(agentId, roomName, identity)

    // Create config
    const config: WebRTCConfig = {
      provider: agent.provider as 'livekit' | 'daily' | 'twilio',
      roomName,
      identity,
      audioOnly: audioOnly ?? true,
      autoConnect: autoConnect ?? true,
      token,
    }

    // Store room info
    const room: WebRTCRoom = {
      name: roomName,
      url: roomUrl,
      sessionId: session.id,
      agentId,
      provider: agent.provider,
      participants: [
        {
          identity,
          displayName,
          isAgent: false,
          joinedAt: Date.now(),
          connectionState: 'connecting',
        },
      ],
      createdAt: Date.now(),
      status: 'active',
    }

    await this.storage.put(`webrtc_room:${roomName}`, room)
    await this.storage.put(`webrtc_session:${session.id}`, roomName)

    return {
      sessionId: session.id,
      roomName,
      roomUrl,
      token,
      config,
    }
  }

  /**
   * Get room information
   *
   * @param sessionId - Voice session ID
   * @returns Room info or null if not found
   */
  async getRoom(sessionId: string): Promise<WebRTCRoom | null> {
    const roomName = await this.storage.get<string>(`webrtc_session:${sessionId}`)
    if (!roomName) return null

    const room = await this.storage.get<WebRTCRoom>(`webrtc_room:${roomName}`)
    return room ?? null
  }

  /**
   * Get room by name
   *
   * @param roomName - Room name
   * @returns Room info or null if not found
   */
  async getRoomByName(roomName: string): Promise<WebRTCRoom | null> {
    const room = await this.storage.get<WebRTCRoom>(`webrtc_room:${roomName}`)
    return room ?? null
  }

  /**
   * Generate a new token for an existing room
   *
   * Useful when a participant needs to reconnect.
   *
   * @param sessionId - Voice session ID
   * @param identity - Participant identity
   * @returns New access token
   */
  async generateToken(sessionId: string, identity: string): Promise<string> {
    const room = await this.getRoom(sessionId)
    if (!room) {
      throw new Error(`Room not found for session: ${sessionId}`)
    }

    const agent = await this.agentManager.get(room.agentId)
    if (!agent) {
      throw new Error(`Voice agent not found: ${room.agentId}`)
    }

    const adapter = VoiceProviderFactory.get(agent.provider)
    if (!adapter.createRoom) {
      throw new Error(`Provider ${agent.provider} does not support WebRTC`)
    }

    const agentData = await this.storage.get<{ providerAgentId: string }>(`voice_agent:${room.agentId}`)
    if (!agentData?.providerAgentId) {
      throw new Error(`Provider agent ID not found for: ${room.agentId}`)
    }

    // Create room returns new token (most providers allow re-joining existing rooms)
    const { token } = await adapter.createRoom(agentData.providerAgentId, identity)

    return token
  }

  /**
   * Update participant connection state
   *
   * Called from webhook when participant joins/leaves.
   *
   * @param roomName - Room name
   * @param identity - Participant identity
   * @param state - Connection state
   */
  async updateParticipantState(
    roomName: string,
    identity: string,
    state: WebRTCParticipant['connectionState']
  ): Promise<void> {
    const room = await this.getRoomByName(roomName)
    if (!room) return

    const updated: WebRTCRoom = {
      ...room,
      participants: room.participants.map((p) =>
        p.identity === identity ? { ...p, connectionState: state } : p
      ),
    }

    await this.storage.put(`webrtc_room:${roomName}`, updated)
  }

  /**
   * Add a participant to a room
   *
   * @param roomName - Room name
   * @param participant - Participant info
   */
  async addParticipant(roomName: string, participant: WebRTCParticipant): Promise<void> {
    const room = await this.getRoomByName(roomName)
    if (!room) return

    const exists = room.participants.some((p) => p.identity === participant.identity)
    if (exists) {
      // Update existing participant
      await this.updateParticipantState(roomName, participant.identity, participant.connectionState)
      return
    }

    const updated: WebRTCRoom = {
      ...room,
      participants: [...room.participants, participant],
    }

    await this.storage.put(`webrtc_room:${roomName}`, updated)
  }

  /**
   * Remove a participant from a room
   *
   * @param roomName - Room name
   * @param identity - Participant identity
   */
  async removeParticipant(roomName: string, identity: string): Promise<void> {
    const room = await this.getRoomByName(roomName)
    if (!room) return

    const updated: WebRTCRoom = {
      ...room,
      participants: room.participants.filter((p) => p.identity !== identity),
    }

    await this.storage.put(`webrtc_room:${roomName}`, updated)

    // If no human participants left, close the room
    const humanParticipants = updated.participants.filter((p) => !p.isAgent)
    if (humanParticipants.length === 0) {
      await this.closeRoom(roomName)
    }
  }

  /**
   * Close a room
   *
   * @param roomName - Room name
   */
  async closeRoom(roomName: string): Promise<void> {
    const room = await this.getRoomByName(roomName)
    if (!room) return

    // Update room status
    const updated: WebRTCRoom = {
      ...room,
      status: 'closed',
    }
    await this.storage.put(`webrtc_room:${roomName}`, updated)

    // End the voice session
    await this.sessionManager.end(room.sessionId)
  }

  /**
   * List active rooms
   *
   * @param agentId - Optional filter by agent
   * @returns List of active rooms
   */
  async listActiveRooms(agentId?: string): Promise<WebRTCRoom[]> {
    const allRooms = await this.storage.list<WebRTCRoom>({ prefix: 'webrtc_room:' })

    const rooms: WebRTCRoom[] = []
    for (const [, room] of allRooms) {
      if (room.status !== 'active') continue
      if (agentId && room.agentId !== agentId) continue
      rooms.push(room)
    }

    return rooms
  }

  /**
   * Clean up old/stale rooms
   *
   * Should be called periodically to clean up rooms that weren't
   * properly closed.
   *
   * @param maxAge - Maximum age in milliseconds (default: 24 hours)
   */
  async cleanup(maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - maxAge
    const allRooms = await this.storage.list<WebRTCRoom>({ prefix: 'webrtc_room:' })

    let cleaned = 0
    for (const [key, room] of allRooms) {
      if (room.createdAt < cutoff) {
        await this.storage.delete(key)
        await this.storage.delete(`webrtc_session:${room.sessionId}`)
        cleaned++
      }
    }

    return cleaned
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract room name from room URL
 */
function extractRoomName(roomUrl: string): string {
  try {
    const url = new URL(roomUrl)
    // Most providers use the last path segment as room name
    const parts = url.pathname.split('/').filter(Boolean)
    return parts[parts.length - 1] || `room_${generateId()}`
  } catch {
    // If not a valid URL, use as-is or generate
    return roomUrl || `room_${generateId()}`
  }
}

/**
 * Generate a random ID
 */
function generateId(): string {
  // TODO: Use nanoid
  return Math.random().toString(36).substring(2, 15)
}

// =============================================================================
// Singleton Access
// =============================================================================

let defaultManager: WebRTCSessionManager | null = null

/**
 * WebRTC session singleton access
 */
export const WebRTCSession = {
  /**
   * Initialize with dependencies
   */
  init(
    storage: DurableObjectStorage,
    agentManager: VoiceAgentManager,
    sessionManager: VoiceSessionManager
  ): void {
    defaultManager = new WebRTCSessionManager(storage, agentManager, sessionManager)
  },

  /**
   * Create a WebRTC session
   */
  async create(options: CreateWebRTCSessionOptions): Promise<WebRTCSessionResult> {
    if (!defaultManager) throw new Error('WebRTCSession not initialized')
    return defaultManager.create(options)
  },

  /**
   * Get room info
   */
  async getRoom(sessionId: string): Promise<WebRTCRoom | null> {
    if (!defaultManager) throw new Error('WebRTCSession not initialized')
    return defaultManager.getRoom(sessionId)
  },

  /**
   * Generate new token
   */
  async generateToken(sessionId: string, identity: string): Promise<string> {
    if (!defaultManager) throw new Error('WebRTCSession not initialized')
    return defaultManager.generateToken(sessionId, identity)
  },

  /**
   * List active rooms
   */
  async listActiveRooms(agentId?: string): Promise<WebRTCRoom[]> {
    if (!defaultManager) throw new Error('WebRTCSession not initialized')
    return defaultManager.listActiveRooms(agentId)
  },
}

// =============================================================================
// Type Exports
// =============================================================================

// Note: DurableObjectStorage is a Cloudflare Workers type, imported at runtime
