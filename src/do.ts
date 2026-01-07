/**
 * @dotdo/do - Core DO Base Class
 *
 * An agentic database that can DO anything.
 *
 * Extends Cloudflare's Agent class with:
 * - RpcTarget implementation (capnweb style)
 * - Multi-transport support (Workers RPC, HTTP, WebSocket, MCP)
 * - Simple CRUD operations (ai-database compatible)
 * - MCP tools (search, fetch, do)
 * - WebSocket hibernation
 * - HATEOAS REST API
 * - Monaco Editor UI
 *
 * This class delegates to focused modules in ./do/ for clean separation of concerns.
 */

import { DurableObject } from 'cloudflare:workers'

// Import from modular implementations
import {
  initSchema as initSqliteSchema,
} from './sqlite'

import type {
  ListOptions,
  Document,
  SearchOptions,
  SearchResult,
  FetchOptions,
  FetchResult,
  DoOptions,
  DoResult,
  Thing,
  CreateOptions,
  UpdateOptions,
  Action,
  CreateActionOptions,
  ActionQueryOptions,
  Relationship,
  RelateOptions,
  Event,
  CreateEventOptions,
  EventQueryOptions,
  Artifact,
  ArtifactType,
  StoreArtifactOptions,
  WorkflowContext,
  WorkflowState,
  ScheduleInterval,
  EventHandler,
  ScheduleHandler,
  AuthContext,
  TransportContext,
} from './types'

// Import module functions
import * as crud from './do/crud'
import * as things from './do/things'
import * as events from './do/events'
import * as actions from './do/actions'
import * as relationshipsModule from './do/relationships'
import * as artifacts from './do/artifacts'
import * as workflow from './do/workflow'
import * as auth from './do/auth'
import * as websocket from './do/websocket'
import * as router from './do/router'
import * as mcpTools from './do/mcp-tools'

import type {
  DurableObjectState,
  ConnectionInfo,
  ConnectionCloseEvent,
  ConnectionEventHandler,
  DOContext,
} from './do/types'

/**
 * DO - Core Durable Object Base Class
 *
 * The foundational layer for all .do workers.
 * An agentic database that can DO anything - providing:
 * - Multi-transport RPC (Workers RPC, HTTP, WebSocket, MCP)
 * - Simple CRUD operations
 * - MCP tools for AI integration
 */
export class DO<Env = unknown> extends DurableObject<Env> implements DOContext<Env> {
  // ctx and env are provided by DurableObject base class
  private schemaInitialized = false

  // Workflow handlers stored in memory (registered via registerWorkflowHandler)
  workflowHandlers: Map<string, EventHandler> = new Map()
  // Workflow schedules stored in memory (registered via registerSchedule)
  workflowSchedules: Array<{ interval: ScheduleInterval; handler: ScheduleHandler }> = []

  // WebSocket connection tracking (public for access by tests and subclasses)
  connections: Map<WebSocket, ConnectionInfo> = new Map()
  // Topic -> Set of subscribed WebSockets
  subscribers: Map<string, Set<WebSocket>> = new Map()

  // Auth context for the current request
  currentAuthContext: AuthContext | null = null
  // WebSocket auth contexts (per-connection)
  wsAuthContexts: Map<WebSocket, AuthContext> = new Map()
  // WebSocket attachment storage (for hibernation persistence)
  private wsAttachments: Map<WebSocket, { auth?: AuthContext; metadata?: Record<string, unknown> }> = new Map()
  // Current transport context
  private _currentTransportContext: TransportContext | null = null

  // Event handlers for connection events
  eventHandlers: Map<string, Set<ConnectionEventHandler>> = new Map()

  // Cached Hono router instance - created once and reused across requests
  private _router = this.createRouter()

  /**
   * Allowlist of methods that can be invoked via RPC.
   * Prevents invocation of inherited methods like constructor, __proto__, etc.
   */
  allowedMethods = new Set([
    // CRUD operations
    'get',
    'list',
    'create',
    'update',
    'delete',
    // MCP tools
    'search',
    'fetch',
    'do',
    // Thing operations
    'createThing',
    'getThing',
    'getThingById',
    'setThing',
    'deleteThing',
    // Action operations
    'send',
    'doAction',
    'tryAction',
    'getAction',
    'queryActions',
    'startAction',
    'completeAction',
    'failAction',
    'cancelAction',
    'retryAction',
    'getNextRetryDelay',
    'resetAction',
    // Event operations
    'track',
    'getEvent',
    'queryEvents',
    // Relationship operations
    'relate',
    'unrelate',
    'related',
    'relationships',
    'references',
    // Artifact operations
    'storeArtifact',
    'getArtifact',
    'getArtifactBySource',
    'deleteArtifact',
    'cleanExpiredArtifacts',
    // Workflow operations
    'createWorkflowContext',
    'getWorkflowState',
    'saveWorkflowState',
    'registerWorkflowHandler',
    'registerSchedule',
    'getWorkflowHandlers',
    'getSchedules',
  ])

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  /**
   * Initialize the SQLite schema if needed
   * Uses the extracted initSqliteSchema function from @dotdo/sqlite
   */
  initSchema(): void {
    if (this.schemaInitialized) return
    initSqliteSchema(this.ctx.storage.sql)
    this.schemaInitialized = true
  }

  /**
   * Generate a unique ID
   */
  generateId(): string {
    return crypto.randomUUID()
  }

  // ============================================
  // RpcTarget Implementation
  // ============================================

  /**
   * Check if a method is allowed to be invoked via RPC
   */
  hasMethod(name: string): boolean {
    return this.allowedMethods.has(name)
  }

  /**
   * Invoke a method by name with optional auth context
   */
  async invoke(method: string, params: unknown[], authContext?: AuthContext): Promise<unknown> {
    if (!this.allowedMethods.has(method)) {
      throw new Error(`Method not allowed: ${method}`)
    }

    // Set auth context for this invocation
    const previousAuth = this.currentAuthContext
    if (authContext !== undefined) {
      this.currentAuthContext = authContext
    }

    // Set transport context for workers-rpc if not already set
    const previousTransport = this._currentTransportContext
    if (!this._currentTransportContext) {
      this._currentTransportContext = { type: 'workers-rpc' }
    }

    try {
      // Use indexed access on the class prototype chain
      // Safe because we've verified the method is in our allowedMethods set
      const target = this as Record<string, unknown>
      const fn = target[method]
      if (typeof fn !== 'function') {
        throw new Error(`Method not found: ${method}`)
      }

      return await fn.apply(this, params)
    } finally {
      // Restore previous auth context
      this.currentAuthContext = previousAuth
      // Restore previous transport context
      this._currentTransportContext = previousTransport
    }
  }

  // ============================================
  // Auth Context Methods (delegated to auth module)
  // ============================================

  getAuthContext(): AuthContext | null {
    return auth.getAuthContext(this)
  }

  setAuthContext(authContext: AuthContext | null): void {
    auth.setAuthContext(this, authContext)
  }

  checkPermission(permission: string): boolean {
    return auth.checkPermission(this, permission)
  }

  requirePermission(permission: string): void {
    auth.requirePermission(this, permission)
  }

  getAuthMetadata(key: string): unknown {
    return auth.getAuthMetadata(this, key)
  }

  // Store the "current" WebSocket for auth context tracking
  private _currentWebSocket: WebSocket | null = null

  getWebSocketAuth(ws?: WebSocket): AuthContext | undefined {
    if (ws) {
      return auth.getWebSocketAuth(this, ws)
    }
    // If no ws specified, return auth for current WebSocket or the last stored one
    if (this._currentWebSocket) {
      return this.wsAuthContexts.get(this._currentWebSocket)
    }
    // Return the most recently stored WebSocket auth
    const entries = Array.from(this.wsAuthContexts.entries())
    if (entries.length > 0) {
      return entries[entries.length - 1][1]
    }
    // Fall back to currentAuthContext if set via setWebSocketAuth(auth)
    if (this.currentAuthContext) {
      return this.currentAuthContext
    }
    return undefined
  }

  setWebSocketAuth(authOrWs?: WebSocket | AuthContext, authContext?: AuthContext): void {
    // Support two signatures:
    // 1. setWebSocketAuth(authContext) - set for "current" context or as default WS auth
    // 2. setWebSocketAuth(ws, authContext) - set for specific WebSocket
    if (authOrWs && typeof (authOrWs as WebSocket).send === 'function') {
      // First param is a WebSocket
      auth.setWebSocketAuth(this, authOrWs as WebSocket, authContext!)
      this._currentWebSocket = authOrWs as WebSocket
    } else if (authOrWs && typeof authOrWs === 'object') {
      // First param is an AuthContext - store it both as currentAuthContext and for a synthetic key
      const authCtx = authOrWs as AuthContext
      this.currentAuthContext = authCtx
      // Store with a placeholder WebSocket for retrieval
      // Use a symbol or synthetic key pattern
      if (this._currentWebSocket) {
        this.wsAuthContexts.set(this._currentWebSocket, authCtx)
      }
    }
  }

  /**
   * Get WebSocket attachment data (for hibernation persistence)
   */
  getWebSocketAttachment(ws?: WebSocket): { auth?: AuthContext; metadata?: Record<string, unknown> } | undefined {
    if (ws) {
      return this.wsAttachments.get(ws)
    }
    // Return the latest attachment if no ws specified
    const entries = Array.from(this.wsAttachments.entries())
    if (entries.length > 0) {
      return entries[entries.length - 1][1]
    }
    return undefined
  }

  /**
   * Set WebSocket attachment data (for hibernation persistence)
   */
  setWebSocketAttachment(ws: WebSocket, attachment: { auth?: AuthContext; metadata?: Record<string, unknown> }): void {
    this.wsAttachments.set(ws, attachment)
    // Also update wsAuthContexts if auth is provided
    if (attachment.auth) {
      this.wsAuthContexts.set(ws, attachment.auth)
    }
  }

  /**
   * Get the current transport context
   */
  getCurrentTransportContext(): TransportContext | null {
    return this._currentTransportContext
  }

  /**
   * Set the current transport context
   */
  setTransportContext(ctx: TransportContext | null): void {
    this._currentTransportContext = ctx
  }

  /**
   * Create a scoped proxy with fixed auth context
   */
  withAuth(authContext: AuthContext): DO<Env> {
    const self = this
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop === 'getAuthContext') {
          return () => authContext
        }
        const value = Reflect.get(target, prop, receiver)
        if (typeof value === 'function' && prop !== 'constructor') {
          return async function (...args: unknown[]) {
            const previousAuth = self.currentAuthContext
            self.currentAuthContext = authContext
            try {
              return await value.apply(target, args)
            } finally {
              self.currentAuthContext = previousAuth
            }
          }
        }
        return value
      },
    }) as DO<Env>
  }

  // ============================================
  // Simple CRUD Operations (delegated to crud module)
  // ============================================

  async get<T extends Document>(collection: string, id: string): Promise<T | null> {
    return crud.get<T>(this, collection, id)
  }

  async list<T extends Document>(collection: string, options?: ListOptions): Promise<T[]> {
    return crud.list<T>(this, collection, options)
  }

  async create<T extends Document>(collection: string, doc: Omit<T, 'id'> | T): Promise<T> {
    return crud.create<T>(this, collection, doc)
  }

  async update<T extends Document>(
    collection: string,
    id: string,
    updates: Partial<T>
  ): Promise<T | null> {
    return crud.update<T>(this, collection, id, updates)
  }

  async delete(collection: string, id: string): Promise<boolean> {
    return crud.del(this, collection, id)
  }

  // ============================================
  // MCP Tools (delegated to mcp-tools module)
  // ============================================

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    return mcpTools.search(this, query, options)
  }

  /**
   * Fetch method with two signatures:
   * 1. fetch(request: Request) - Cloudflare Workers DO fetch handler
   * 2. fetch(target: string, options?: FetchOptions) - MCP tool for fetching URLs
   */
  async fetch(requestOrTarget: Request | string, options?: FetchOptions): Promise<Response | FetchResult> {
    if (requestOrTarget instanceof Request) {
      return this.handleRequest(requestOrTarget)
    }
    return mcpTools.fetchUrl(requestOrTarget, options)
  }

  async do(code: string, options?: DoOptions): Promise<DoResult> {
    return mcpTools.doCode(code, options)
  }

  // ============================================
  // Thing Operations (delegated to things module)
  // ============================================

  async createThing<T extends Record<string, unknown>>(options: CreateOptions<T>): Promise<Thing<T>> {
    return things.createThing(this, options)
  }

  async getThing<T extends Record<string, unknown>>(url: string): Promise<Thing<T> | null> {
    return things.getThing(this, url)
  }

  async getThingById<T extends Record<string, unknown>>(
    ns: string,
    type: string,
    id: string
  ): Promise<Thing<T> | null> {
    return things.getThingById(this, ns, type, id)
  }

  async setThing<T extends Record<string, unknown>>(url: string, data: T): Promise<Thing<T>> {
    return things.setThing(this, url, data)
  }

  async deleteThing(url: string): Promise<boolean> {
    return things.deleteThing(this, url)
  }

  async listThings<T extends Record<string, unknown>>(options?: ListOptions): Promise<Thing<T>[]> {
    return things.listThings(this, options)
  }

  async findThings<T extends Record<string, unknown>>(options: ListOptions): Promise<Thing<T>[]> {
    return things.findThings(this, options)
  }

  async updateThing<T extends Record<string, unknown>>(
    url: string,
    options: UpdateOptions<T>
  ): Promise<Thing<T> | null> {
    return things.updateThing(this, url, options)
  }

  async upsertThing<T extends Record<string, unknown>>(options: CreateOptions<T>): Promise<Thing<T>> {
    return things.upsertThing(this, options)
  }

  /**
   * Thing namespace for fluent API access
   */
  Thing = things.createThingNamespace(this as DOContext)

  // ============================================
  // Event Operations (delegated to events module)
  // ============================================

  async track<T extends Record<string, unknown>>(options: CreateEventOptions<T>): Promise<Event<T>> {
    return events.track(this, options)
  }

  async getEvent(id: string): Promise<Event | null> {
    return events.getEvent(this, id)
  }

  async queryEvents(options?: EventQueryOptions): Promise<Event[]> {
    return events.queryEvents(this, options)
  }

  // ============================================
  // Relationship Operations (delegated to relationships module)
  // ============================================

  async relate<T extends Record<string, unknown> = Record<string, unknown>>(
    options: RelateOptions<T>
  ): Promise<Relationship<T>> {
    return relationshipsModule.relate(this, options)
  }

  async unrelate(from: string, type: string, to: string): Promise<boolean> {
    return relationshipsModule.unrelate(this, from, type, to)
  }

  async related(
    url: string,
    type?: string,
    direction: 'from' | 'to' | 'both' = 'from'
  ): Promise<string[]> {
    return relationshipsModule.related(this, url, type, direction)
  }

  async relationships(
    url: string,
    type?: string,
    direction: 'from' | 'to' | 'both' = 'from'
  ): Promise<Relationship[]> {
    return relationshipsModule.relationships(this, url, type, direction)
  }

  async references(url: string, type?: string): Promise<string[]> {
    return relationshipsModule.references(this, url, type)
  }

  // ============================================
  // Action Operations (delegated to actions module)
  // ============================================

  async send<T extends Record<string, unknown> = Record<string, unknown>>(
    options: CreateActionOptions<T>
  ): Promise<Action<T>> {
    return actions.send(this, options)
  }

  async doAction<T extends Record<string, unknown> = Record<string, unknown>>(
    options: CreateActionOptions<T>
  ): Promise<Action<T>> {
    return actions.doAction(this, options)
  }

  async tryAction<T extends Record<string, unknown> = Record<string, unknown>>(
    options: CreateActionOptions<T>,
    fn: () => Promise<unknown>
  ): Promise<Action<T>> {
    return actions.tryAction(this, options, fn)
  }

  async getAction<T extends Record<string, unknown> = Record<string, unknown>>(
    id: string
  ): Promise<Action<T> | null> {
    return actions.getAction(this, id)
  }

  async queryActions<T extends Record<string, unknown> = Record<string, unknown>>(
    options?: ActionQueryOptions
  ): Promise<Action<T>[]> {
    return actions.queryActions(this, options)
  }

  async startAction<T extends Record<string, unknown> = Record<string, unknown>>(
    id: string
  ): Promise<Action<T>> {
    return actions.startAction(this, id)
  }

  async completeAction<T extends Record<string, unknown> = Record<string, unknown>>(
    id: string,
    result?: unknown
  ): Promise<Action<T>> {
    return actions.completeAction(this, id, result)
  }

  async failAction<T extends Record<string, unknown> = Record<string, unknown>>(
    id: string,
    error: string
  ): Promise<Action<T>> {
    return actions.failAction(this, id, error)
  }

  async cancelAction<T extends Record<string, unknown> = Record<string, unknown>>(
    id: string
  ): Promise<Action<T>> {
    return actions.cancelAction(this, id)
  }

  async retryAction<T extends Record<string, unknown> = Record<string, unknown>>(
    id: string
  ): Promise<Action<T>> {
    return actions.retryAction(this, id)
  }

  async getNextRetryDelay(id: string): Promise<number> {
    return actions.getNextRetryDelay(this, id)
  }

  async resetAction<T extends Record<string, unknown> = Record<string, unknown>>(
    id: string
  ): Promise<Action<T>> {
    return actions.resetAction(this, id)
  }

  // ============================================
  // Artifact Operations (delegated to artifacts module)
  // ============================================

  async storeArtifact<T>(options: StoreArtifactOptions<T>): Promise<Artifact<T>> {
    return artifacts.storeArtifact(this, options)
  }

  async getArtifact<T = unknown>(key: string): Promise<Artifact<T> | null> {
    return artifacts.getArtifact(this, key)
  }

  async getArtifactBySource(source: string, type: ArtifactType): Promise<Artifact | null> {
    return artifacts.getArtifactBySource(this, source, type)
  }

  async deleteArtifact(key: string): Promise<boolean> {
    return artifacts.deleteArtifact(this, key)
  }

  async cleanExpiredArtifacts(): Promise<number> {
    return artifacts.cleanExpiredArtifacts(this)
  }

  // ============================================
  // Workflow Operations (delegated to workflow module)
  // ============================================

  async getWorkflowState(workflowId = 'default'): Promise<WorkflowState> {
    return workflow.getWorkflowState(this, workflowId)
  }

  async saveWorkflowState(state: WorkflowState, workflowId = 'default'): Promise<void> {
    return workflow.saveWorkflowState(this, state, workflowId)
  }

  registerWorkflowHandler<T = unknown, R = unknown>(
    eventPattern: string,
    handler: EventHandler<T, R>
  ): void {
    workflow.registerWorkflowHandler(this, eventPattern, handler)
  }

  async getWorkflowHandlers(eventPattern: string): Promise<EventHandler[]> {
    return workflow.getWorkflowHandlers(this, eventPattern)
  }

  registerSchedule(interval: ScheduleInterval, handler: ScheduleHandler): void {
    workflow.registerSchedule(this, interval, handler)
  }

  async getSchedules(): Promise<ScheduleInterval[]> {
    return workflow.getSchedules(this)
  }

  async createWorkflowContext(workflowId = 'default'): Promise<WorkflowContext> {
    return workflow.createWorkflowContext(this, workflowId)
  }

  // ============================================
  // WebSocket Hibernation (delegated to websocket module)
  // ============================================

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    return websocket.webSocketMessage(
      this,
      ws,
      message,
      (method, params) => this.invoke(method, params)
    )
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    return websocket.webSocketClose(this, ws, code, reason, wasClean)
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    return websocket.webSocketError(ws, error)
  }

  // ============================================
  // Connection Management API (delegated to websocket module)
  // ============================================

  async registerConnection(ws: WebSocket, metadata: Record<string, unknown> = {}): Promise<void> {
    return websocket.registerConnection(this, ws, metadata)
  }

  getConnectionMetadata(ws: WebSocket): Record<string, unknown> | undefined {
    return websocket.getConnectionMetadata(this, ws)
  }

  updateConnectionMetadata(ws: WebSocket, metadata: Record<string, unknown>): void {
    websocket.updateConnectionMetadata(this, ws, metadata)
  }

  getActiveConnections(): WebSocket[] {
    return websocket.getActiveConnections(this)
  }

  getConnectionCount(): number {
    return websocket.getConnectionCount(this)
  }

  findConnectionsByMetadata(filter: Record<string, unknown>): WebSocket[] {
    return websocket.findConnectionsByMetadata(this, filter)
  }

  broadcast(message: string, filter?: Record<string, unknown>): void {
    websocket.broadcast(this, message, filter)
  }

  async destroyAllConnections(): Promise<void> {
    return websocket.destroyAllConnections(this)
  }

  // ============================================
  // Event Emitter API (delegated to websocket module)
  // ============================================

  on(event: string, handler: ConnectionEventHandler): void {
    websocket.on(this, event, handler)
  }

  off(event: string, handler: ConnectionEventHandler): void {
    websocket.off(this, event, handler)
  }

  // ============================================
  // Multi-Transport fetch (delegated to router module)
  // ============================================

  /**
   * Create Hono router with all routes.
   * Called once during construction and cached in _router property.
   */
  createRouter() {
    return router.createRouter(this, this)
  }

  async handleRequest(request: Request): Promise<Response> {
    return router.handleRequest(this, this, request, this._router)
  }
}
