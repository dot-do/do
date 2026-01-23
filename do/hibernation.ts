/**
 * Hibernation Support for Digital Objects
 *
 * Implements the Cloudflare Agents SDK hibernation pattern for efficient
 * resource usage. DOs can hibernate when idle, reducing costs by ~95%.
 *
 * Features:
 * - Automatic idle detection and hibernation
 * - WebSocket connection preservation during hibernation
 * - Alarm-based wake-up for scheduled tasks
 * - State persistence across hibernation cycles
 *
 * @example Basic hibernation
 * ```typescript
 * const hibernation = new HibernationManager(ctx, {
 *   idleTimeout: 10_000, // Hibernate after 10s idle
 * })
 *
 * // Touch on activity to reset idle timer
 * hibernation.touch()
 *
 * // Check if hibernating
 * if (hibernation.isHibernating()) {
 *   // Handle wake-up
 * }
 * ```
 *
 * @example WebSocket with hibernation
 * ```typescript
 * // Accept WebSocket with hibernation support
 * const response = await hibernation.acceptWebSocket(request)
 *
 * // WebSocket survives hibernation and reconnects automatically
 * ```
 *
 * @module do/hibernation
 */

import type { DurableObjectState } from '@cloudflare/workers-types'

/**
 * Configuration for hibernation behavior
 *
 * @interface HibernationConfig
 */
export interface HibernationConfig {
  /**
   * Time in milliseconds before hibernating after last activity
   * @default 10000 (10 seconds)
   */
  idleTimeout: number

  /**
   * Maximum time in milliseconds a DO can stay hibernated
   * After this time, the DO will be woken to check for work
   * @default 86400000 (24 hours)
   */
  maxHibernationDuration: number

  /**
   * Whether to preserve WebSocket connections during hibernation
   * When true, WebSockets will hibernate and wake automatically
   * @default true
   */
  preserveWebSockets: boolean

  /**
   * Hook called just before hibernation
   * Use this to clean up resources or persist state
   */
  onHibernate?: () => Promise<void>

  /**
   * Hook called just after waking from hibernation
   * Use this to restore state or reinitialize connections
   */
  onWake?: () => Promise<void>
}

/**
 * State of a hibernatable WebSocket connection
 *
 * @interface WebSocketState
 */
export interface WebSocketState {
  /** Unique connection ID */
  id: string
  /** Connection status */
  status: 'connecting' | 'open' | 'hibernating' | 'closing' | 'closed'
  /** Timestamp when the connection was established */
  connectedAt: number
  /** Timestamp when hibernation started (if hibernating) */
  hibernatedAt?: number
  /** Timestamp of last message sent or received */
  lastMessageAt: number
  /** Custom data attached to this connection */
  data?: Record<string, unknown>
  /** Subscriptions this connection has */
  subscriptions: string[]
}

/**
 * Alarm configuration
 *
 * @interface AlarmConfig
 */
export interface AlarmConfig {
  /** Alarm type for handling different alarm purposes */
  type: 'hibernation' | 'scheduled' | 'retry' | 'custom'
  /** Scheduled time for the alarm */
  scheduledTime: number
  /** Custom payload for the alarm */
  payload?: unknown
}

/**
 * Hibernation manager for Digital Objects
 *
 * Manages the sleep/wake lifecycle of a DO, including:
 * - Idle detection and automatic hibernation
 * - WebSocket hibernation
 * - Alarm scheduling for wake-up
 *
 * @class HibernationManager
 *
 * @example
 * ```typescript
 * class MyDO implements DurableObject {
 *   private hibernation: HibernationManager
 *
 *   constructor(ctx: DurableObjectState) {
 *     this.hibernation = new HibernationManager(ctx, {
 *       idleTimeout: 30_000,
 *       onHibernate: () => this.cleanup(),
 *       onWake: () => this.restore()
 *     })
 *   }
 *
 *   async fetch(request: Request) {
 *     this.hibernation.touch()
 *     // Handle request...
 *   }
 * }
 * ```
 */
export class HibernationManager {
  /**
   * Current hibernation state
   */
  private state: 'active' | 'hibernating' = 'active'

  /**
   * Timestamp of last activity
   */
  private lastActivity: number = Date.now()

  /**
   * Map of active WebSocket connections by ID
   */
  private webSockets: Map<string, WebSocket> = new Map()

  /**
   * WebSocket metadata storage
   */
  private webSocketStates: Map<string, WebSocketState> = new Map()

  /**
   * Counter for generating unique WebSocket IDs
   */
  private wsIdCounter = 0

  /**
   * Configuration with defaults applied
   */
  private config: HibernationConfig

  /**
   * Timer for idle detection (only in non-hibernating mode)
   */
  private idleTimer?: ReturnType<typeof setTimeout>

  /**
   * Create a new HibernationManager
   *
   * @param ctx - Durable Object state from Cloudflare runtime
   * @param config - Hibernation configuration options
   */
  constructor(
    private ctx: DurableObjectState,
    config: Partial<HibernationConfig> = {}
  ) {
    this.config = {
      idleTimeout: 10_000,
      maxHibernationDuration: 24 * 60 * 60 * 1000,
      preserveWebSockets: true,
      ...config,
    }

    // Schedule initial idle check
    this.scheduleIdleCheck()
  }

  /**
   * Record activity to reset the idle timer
   *
   * Call this method whenever the DO processes a request,
   * message, or any other activity.
   *
   * @example
   * ```typescript
   * async fetch(request: Request) {
   *   this.hibernation.touch()
   *   // Process request...
   * }
   * ```
   */
  touch(): void {
    this.lastActivity = Date.now()

    // If we were hibernating, wake up
    if (this.state === 'hibernating') {
      this.wake()
    }

    // Reset idle timer
    this.scheduleIdleCheck()
  }

  /**
   * Check if the DO is currently hibernating
   *
   * @returns True if hibernating, false if active
   */
  isHibernating(): boolean {
    return this.state === 'hibernating'
  }

  /**
   * Check if the DO is idle (no recent activity)
   *
   * @returns True if idle for longer than idleTimeout
   */
  isIdle(): boolean {
    return Date.now() - this.lastActivity > this.config.idleTimeout
  }

  /**
   * Get the time since last activity in milliseconds
   *
   * @returns Milliseconds since last activity
   */
  getIdleTime(): number {
    return Date.now() - this.lastActivity
  }

  /**
   * Get the current hibernation state
   *
   * @returns Current state ('active' or 'hibernating')
   */
  getState(): 'active' | 'hibernating' {
    return this.state
  }

  /**
   * Get statistics about WebSocket connections
   *
   * @returns WebSocket connection statistics
   */
  getWebSocketStats(): {
    total: number
    active: number
    hibernating: number
  } {
    let active = 0
    let hibernating = 0

    for (const state of this.webSocketStates.values()) {
      if (state.status === 'hibernating') {
        hibernating++
      } else if (state.status === 'open') {
        active++
      }
    }

    return {
      total: this.webSocketStates.size,
      active,
      hibernating,
    }
  }

  /**
   * Accept a WebSocket connection with hibernation support
   *
   * This method upgrades the HTTP request to a WebSocket connection
   * that supports hibernation. The connection will survive hibernation
   * and automatically reconnect when the DO wakes.
   *
   * @param request - The HTTP upgrade request
   * @param data - Optional custom data to attach to the connection
   * @returns HTTP response with WebSocket upgrade
   *
   * @example
   * ```typescript
   * async handleWebSocket(request: Request) {
   *   const response = await this.hibernation.acceptWebSocket(request, {
   *     userId: '123'
   *   })
   *   return response
   * }
   * ```
   */
  async acceptWebSocket(
    request: Request,
    data?: Record<string, unknown>
  ): Promise<Response> {
    // Verify upgrade header
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    // Create WebSocket pair
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]

    // Generate unique ID
    const wsId = this.generateWebSocketId()

    // Store WebSocket and state
    this.webSockets.set(wsId, server)
    this.webSocketStates.set(wsId, {
      id: wsId,
      status: 'open',
      connectedAt: Date.now(),
      lastMessageAt: Date.now(),
      data,
      subscriptions: [],
    })

    // Accept the WebSocket connection with hibernation support
    // Using Durable Object's hibernatable WebSocket API
    this.ctx.acceptWebSocket(server, [wsId])

    // Record activity
    this.touch()

    // Return the client WebSocket to the caller
    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  /**
   * Send a message to a specific WebSocket connection
   *
   * @param wsId - The WebSocket connection ID
   * @param message - The message to send
   * @returns True if the message was sent, false if connection not found
   */
  sendToWebSocket(wsId: string, message: string | ArrayBuffer): boolean {
    const ws = this.webSockets.get(wsId)
    if (!ws) return false

    try {
      ws.send(message)

      // Update last message time
      const state = this.webSocketStates.get(wsId)
      if (state) {
        state.lastMessageAt = Date.now()
      }

      return true
    } catch (error) {
      console.error(`Failed to send to WebSocket ${wsId}:`, error)
      this.handleWebSocketClose(ws)
      return false
    }
  }

  /**
   * Broadcast a message to all connected WebSockets
   *
   * @param message - The message to broadcast
   * @param filter - Optional filter function to select recipients
   * @returns Number of WebSockets that received the message
   */
  broadcast(
    message: string | ArrayBuffer,
    filter?: (state: WebSocketState) => boolean
  ): number {
    let sent = 0

    for (const [wsId, state] of this.webSocketStates) {
      if (state.status !== 'open') continue
      if (filter && !filter(state)) continue

      if (this.sendToWebSocket(wsId, message)) {
        sent++
      }
    }

    return sent
  }

  /**
   * Get the state of a WebSocket connection
   *
   * @param wsId - The WebSocket connection ID
   * @returns WebSocket state or undefined if not found
   */
  getWebSocketState(wsId: string): WebSocketState | undefined {
    return this.webSocketStates.get(wsId)
  }

  /**
   * Get all WebSocket states
   *
   * @returns Iterator of all WebSocket states
   */
  getAllWebSocketStates(): IterableIterator<WebSocketState> {
    return this.webSocketStates.values()
  }

  /**
   * Update custom data for a WebSocket connection
   *
   * @param wsId - The WebSocket connection ID
   * @param data - The data to merge with existing data
   */
  updateWebSocketData(wsId: string, data: Record<string, unknown>): void {
    const state = this.webSocketStates.get(wsId)
    if (state) {
      state.data = { ...state.data, ...data }
    }
  }

  /**
   * Subscribe a WebSocket to a topic
   *
   * @param wsId - The WebSocket connection ID
   * @param topic - The topic to subscribe to
   */
  subscribe(wsId: string, topic: string): void {
    const state = this.webSocketStates.get(wsId)
    if (state && !state.subscriptions.includes(topic)) {
      state.subscriptions.push(topic)
    }
  }

  /**
   * Unsubscribe a WebSocket from a topic
   *
   * @param wsId - The WebSocket connection ID
   * @param topic - The topic to unsubscribe from
   */
  unsubscribe(wsId: string, topic: string): void {
    const state = this.webSocketStates.get(wsId)
    if (state) {
      state.subscriptions = state.subscriptions.filter(t => t !== topic)
    }
  }

  /**
   * Publish a message to all subscribers of a topic
   *
   * @param topic - The topic to publish to
   * @param message - The message to publish
   * @returns Number of subscribers that received the message
   */
  publish(topic: string, message: string | ArrayBuffer): number {
    return this.broadcast(message, state =>
      state.subscriptions.includes(topic)
    )
  }

  /**
   * Handle WebSocket close event
   *
   * Called when a WebSocket connection is closed.
   * Cleans up state and removes the connection.
   *
   * @param ws - The WebSocket that was closed
   */
  handleWebSocketClose(ws: WebSocket): void {
    // Find the WebSocket ID
    for (const [wsId, storedWs] of this.webSockets) {
      if (storedWs === ws) {
        this.webSockets.delete(wsId)
        const state = this.webSocketStates.get(wsId)
        if (state) {
          state.status = 'closed'
        }
        this.webSocketStates.delete(wsId)
        break
      }
    }
  }

  /**
   * Handle alarm callback
   *
   * Called when an alarm fires. This may be for hibernation,
   * scheduled tasks, or other purposes.
   *
   * @returns Promise that resolves when alarm is handled
   */
  async handleAlarm(): Promise<void> {
    // Check if this is an idle timeout alarm
    if (this.isIdle() && this.state === 'active') {
      await this.hibernate()
    }
  }

  /**
   * Schedule an alarm at a specific time
   *
   * @param time - The time to trigger the alarm (Date or milliseconds)
   * @param config - Optional alarm configuration
   */
  async scheduleAlarm(
    time: Date | number,
    config?: Partial<AlarmConfig>
  ): Promise<void> {
    const scheduledTime = time instanceof Date ? time.getTime() : time
    await this.ctx.storage.setAlarm(scheduledTime)
  }

  /**
   * Cancel all scheduled alarms
   */
  async cancelAlarms(): Promise<void> {
    await this.ctx.storage.deleteAlarm()
  }

  /**
   * Force immediate hibernation
   *
   * @returns Promise that resolves when hibernation is complete
   */
  async forceHibernate(): Promise<void> {
    await this.hibernate()
  }

  /**
   * Force immediate wake from hibernation
   *
   * @returns Promise that resolves when wake is complete
   */
  async forceWake(): Promise<void> {
    await this.wake()
  }

  /**
   * Enter hibernation state
   *
   * @internal
   */
  private async hibernate(): Promise<void> {
    if (this.state === 'hibernating') return

    // Call pre-hibernation hook
    if (this.config.onHibernate) {
      await this.config.onHibernate()
    }

    // Mark WebSockets as hibernating
    if (this.config.preserveWebSockets) {
      for (const state of this.webSocketStates.values()) {
        if (state.status === 'open') {
          state.status = 'hibernating'
          state.hibernatedAt = Date.now()
        }
      }
    }

    this.state = 'hibernating'

    // Schedule wake-up alarm at max hibernation duration
    await this.scheduleAlarm(Date.now() + this.config.maxHibernationDuration)

    // Clear idle timer
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = undefined
    }
  }

  /**
   * Wake from hibernation state
   *
   * @internal
   */
  private async wake(): Promise<void> {
    if (this.state === 'active') return

    this.state = 'active'

    // Mark WebSockets as active
    for (const state of this.webSocketStates.values()) {
      if (state.status === 'hibernating') {
        state.status = 'open'
        state.hibernatedAt = undefined
      }
    }

    // Call post-wake hook
    if (this.config.onWake) {
      await this.config.onWake()
    }

    // Schedule idle check
    this.scheduleIdleCheck()
  }

  /**
   * Schedule idle check via alarm
   *
   * @internal
   */
  private scheduleIdleCheck(): void {
    // Clear existing timer
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
    }

    // Schedule alarm for idle timeout
    const alarmTime = this.lastActivity + this.config.idleTimeout
    this.ctx.storage.setAlarm(alarmTime).catch(error => {
      console.error('Failed to set hibernation alarm:', error)
    })
  }

  /**
   * Generate a unique WebSocket ID
   *
   * @internal
   */
  private generateWebSocketId(): string {
    return `ws_${Date.now()}_${++this.wsIdCounter}`
  }
}

/**
 * Create a HibernationManager instance
 *
 * @param ctx - Durable Object state
 * @param config - Configuration options
 * @returns HibernationManager instance
 *
 * @example
 * ```typescript
 * const hibernation = createHibernationManager(ctx, {
 *   idleTimeout: 30_000
 * })
 * ```
 */
export function createHibernationManager(
  ctx: DurableObjectState,
  config?: Partial<HibernationConfig>
): HibernationManager {
  return new HibernationManager(ctx, config)
}

export default HibernationManager
