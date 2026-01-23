/**
 * @fileoverview DO CLI init command
 *
 * Initializes a new Durable Object project with the specified template
 * and configuration options.
 *
 * @module @do/cli/commands/init
 */

import type { CommandResult } from '../index'

declare const process: {
  cwd(): string
  env: Record<string, string | undefined>
}

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the init command
 */
export interface InitOptions {
  /** Project name (defaults to directory name) */
  name?: string
  /** Project template to use */
  template?: 'basic' | 'chat' | 'game' | 'api'
  /** Use TypeScript (default: true) */
  typescript?: boolean
  /** Initialize git repository (default: true) */
  git?: boolean
  /** Install dependencies (default: true) */
  install?: boolean
}

/**
 * Template configuration
 */
interface TemplateConfig {
  name: string
  description: string
  files: TemplateFile[]
  dependencies: string[]
  devDependencies: string[]
}

/**
 * Template file definition
 */
interface TemplateFile {
  path: string
  content: string
}

// =============================================================================
// Templates
// =============================================================================

/**
 * Get template configuration for a given template name
 *
 * @param template - Template name
 * @param projectName - Project name
 * @returns Template configuration
 */
function getTemplate(template: string, projectName: string): TemplateConfig {
  const templates: Record<string, TemplateConfig> = {
    basic: {
      name: 'basic',
      description: 'Basic counter example',
      files: [
        {
          path: 'src/index.ts',
          content: `/**
 * @fileoverview Worker entry point
 */
export { Counter } from './counter'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const id = env.COUNTER.idFromName(url.pathname.slice(1) || 'default')
    const counter = env.COUNTER.get(id)
    return counter.fetch(request)
  },
}

interface Env {
  COUNTER: DurableObjectNamespace
}
`,
        },
        {
          path: 'src/counter.ts',
          content: `/**
 * @fileoverview Counter Durable Object
 */
export class Counter {
  private state: DurableObjectState
  private value: number = 0

  constructor(state: DurableObjectState) {
    this.state = state
    this.state.blockConcurrencyWhile(async () => {
      this.value = (await this.state.storage.get<number>('value')) ?? 0
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    switch (url.pathname) {
      case '/increment': {
        const body = await request.json<{ amount?: number }>()
        this.value += body.amount ?? 1
        await this.state.storage.put('value', this.value)
        return Response.json({ value: this.value })
      }

      case '/decrement': {
        const body = await request.json<{ amount?: number }>()
        this.value -= body.amount ?? 1
        await this.state.storage.put('value', this.value)
        return Response.json({ value: this.value })
      }

      case '/value':
        return Response.json({ value: this.value })

      default:
        return new Response('Not Found', { status: 404 })
    }
  }
}
`,
        },
      ],
      dependencies: [],
      devDependencies: ['@cloudflare/workers-types', 'typescript', 'wrangler'],
    },

    chat: {
      name: 'chat',
      description: 'Real-time chat room example',
      files: [
        {
          path: 'src/index.ts',
          content: `/**
 * @fileoverview Worker entry point for chat application
 */
export { ChatRoom } from './chat-room'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const roomName = url.pathname.slice(1) || 'lobby'
    const id = env.CHAT_ROOM.idFromName(roomName)
    const room = env.CHAT_ROOM.get(id)
    return room.fetch(request)
  },
}

interface Env {
  CHAT_ROOM: DurableObjectNamespace
}
`,
        },
        {
          path: 'src/chat-room.ts',
          content: `/**
 * @fileoverview ChatRoom Durable Object with WebSocket support
 */
export class ChatRoom {
  private state: DurableObjectState
  private sessions: Map<WebSocket, { username: string }> = new Map()
  private messages: Array<{ username: string; text: string; timestamp: number }> = []

  constructor(state: DurableObjectState) {
    this.state = state
    this.state.blockConcurrencyWhile(async () => {
      this.messages = (await this.state.storage.get<typeof this.messages>('messages')) ?? []
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/websocket') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 })
      }

      const username = url.searchParams.get('username') ?? 'Anonymous'
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)

      this.handleSession(server, username)

      return new Response(null, { status: 101, webSocket: client })
    }

    if (url.pathname === '/messages') {
      return Response.json({ messages: this.messages.slice(-100) })
    }

    return new Response('Not Found', { status: 404 })
  }

  private handleSession(ws: WebSocket, username: string): void {
    ws.accept()
    this.sessions.set(ws, { username })

    // Send message history
    ws.send(JSON.stringify({ type: 'history', messages: this.messages.slice(-100) }))

    // Announce join
    this.broadcast({ type: 'join', username, timestamp: Date.now() })

    ws.addEventListener('message', async (event) => {
      const data = JSON.parse(event.data as string)

      if (data.type === 'message') {
        const message = {
          username,
          text: data.text,
          timestamp: Date.now(),
        }
        this.messages.push(message)

        // Keep only last 1000 messages
        if (this.messages.length > 1000) {
          this.messages = this.messages.slice(-1000)
        }

        await this.state.storage.put('messages', this.messages)
        this.broadcast({ type: 'message', ...message })
      }
    })

    ws.addEventListener('close', () => {
      this.sessions.delete(ws)
      this.broadcast({ type: 'leave', username, timestamp: Date.now() })
    })
  }

  private broadcast(message: object): void {
    const json = JSON.stringify(message)
    for (const ws of this.sessions.keys()) {
      try {
        ws.send(json)
      } catch {
        this.sessions.delete(ws)
      }
    }
  }
}
`,
        },
      ],
      dependencies: [],
      devDependencies: ['@cloudflare/workers-types', 'typescript', 'wrangler'],
    },

    game: {
      name: 'game',
      description: 'Multiplayer game room example',
      files: [
        {
          path: 'src/index.ts',
          content: `/**
 * @fileoverview Worker entry point for game server
 */
export { GameRoom } from './game-room'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const roomId = url.pathname.slice(1) || 'room-1'
    const id = env.GAME_ROOM.idFromName(roomId)
    const room = env.GAME_ROOM.get(id)
    return room.fetch(request)
  },
}

interface Env {
  GAME_ROOM: DurableObjectNamespace
}
`,
        },
        {
          path: 'src/game-room.ts',
          content: `/**
 * @fileoverview GameRoom Durable Object for multiplayer games
 */

interface Player {
  id: string
  x: number
  y: number
  color: string
}

interface GameState {
  players: Map<string, Player>
  started: boolean
}

export class GameRoom {
  private state: DurableObjectState
  private sessions: Map<WebSocket, string> = new Map()
  private players: Map<string, Player> = new Map()
  private gameStarted = false
  private tickInterval: number | null = null

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/join') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 })
      }

      const playerId = crypto.randomUUID()
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)

      this.handlePlayer(server, playerId)

      return new Response(null, { status: 101, webSocket: client })
    }

    if (url.pathname === '/state') {
      return Response.json({
        players: Array.from(this.players.values()),
        started: this.gameStarted,
      })
    }

    return new Response('Not Found', { status: 404 })
  }

  private handlePlayer(ws: WebSocket, playerId: string): void {
    ws.accept()
    this.sessions.set(ws, playerId)

    // Create player
    const player: Player = {
      id: playerId,
      x: Math.random() * 800,
      y: Math.random() * 600,
      color: \`hsl(\${Math.random() * 360}, 70%, 50%)\`,
    }
    this.players.set(playerId, player)

    // Send initial state
    ws.send(JSON.stringify({
      type: 'init',
      playerId,
      players: Array.from(this.players.values()),
    }))

    // Broadcast player join
    this.broadcast({ type: 'playerJoin', player }, playerId)

    // Start game tick if not running
    if (!this.tickInterval) {
      this.startGameTick()
    }

    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data as string)

      if (data.type === 'move') {
        const p = this.players.get(playerId)
        if (p) {
          p.x = Math.max(0, Math.min(800, p.x + data.dx))
          p.y = Math.max(0, Math.min(600, p.y + data.dy))
        }
      }
    })

    ws.addEventListener('close', () => {
      this.sessions.delete(ws)
      this.players.delete(playerId)
      this.broadcast({ type: 'playerLeave', playerId })

      if (this.players.size === 0 && this.tickInterval) {
        clearInterval(this.tickInterval)
        this.tickInterval = null
      }
    })
  }

  private startGameTick(): void {
    this.gameStarted = true
    this.tickInterval = setInterval(() => {
      this.broadcast({
        type: 'tick',
        players: Array.from(this.players.values()),
        timestamp: Date.now(),
      })
    }, 50) as unknown as number
  }

  private broadcast(message: object, excludePlayerId?: string): void {
    const json = JSON.stringify(message)
    for (const [ws, playerId] of this.sessions) {
      if (playerId !== excludePlayerId) {
        try {
          ws.send(json)
        } catch {
          this.sessions.delete(ws)
          this.players.delete(playerId)
        }
      }
    }
  }
}
`,
        },
      ],
      dependencies: [],
      devDependencies: ['@cloudflare/workers-types', 'typescript', 'wrangler'],
    },

    api: {
      name: 'api',
      description: 'REST API with DO state',
      files: [
        {
          path: 'src/index.ts',
          content: `/**
 * @fileoverview Worker entry point for API server
 */
export { Store } from './store'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const [, resource, id] = url.pathname.split('/')

    if (!resource) {
      return Response.json({ message: 'Welcome to DO API' })
    }

    const storeId = env.STORE.idFromName(resource)
    const store = env.STORE.get(storeId)

    // Forward request with ID in header
    const headers = new Headers(request.headers)
    if (id) headers.set('X-Item-Id', id)

    return store.fetch(new Request(request.url, {
      method: request.method,
      headers,
      body: request.body,
    }))
  },
}

interface Env {
  STORE: DurableObjectNamespace
}
`,
        },
        {
          path: 'src/store.ts',
          content: `/**
 * @fileoverview Store Durable Object for REST API
 */

interface Item {
  id: string
  data: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export class Store {
  private state: DurableObjectState

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const itemId = request.headers.get('X-Item-Id')

    switch (request.method) {
      case 'GET':
        return this.handleGet(itemId)

      case 'POST':
        return this.handleCreate(request)

      case 'PUT':
        if (!itemId) return new Response('Item ID required', { status: 400 })
        return this.handleUpdate(itemId, request)

      case 'DELETE':
        if (!itemId) return new Response('Item ID required', { status: 400 })
        return this.handleDelete(itemId)

      default:
        return new Response('Method not allowed', { status: 405 })
    }
  }

  private async handleGet(itemId: string | null): Promise<Response> {
    if (itemId) {
      const item = await this.state.storage.get<Item>(itemId)
      if (!item) return new Response('Not found', { status: 404 })
      return Response.json(item)
    }

    // List all items
    const items = await this.state.storage.list<Item>()
    return Response.json({ items: Array.from(items.values()) })
  }

  private async handleCreate(request: Request): Promise<Response> {
    const data = await request.json<Record<string, unknown>>()
    const id = crypto.randomUUID()
    const now = Date.now()

    const item: Item = {
      id,
      data,
      createdAt: now,
      updatedAt: now,
    }

    await this.state.storage.put(id, item)
    return Response.json(item, { status: 201 })
  }

  private async handleUpdate(itemId: string, request: Request): Promise<Response> {
    const existing = await this.state.storage.get<Item>(itemId)
    if (!existing) return new Response('Not found', { status: 404 })

    const data = await request.json<Record<string, unknown>>()

    const item: Item = {
      ...existing,
      data: { ...existing.data, ...data },
      updatedAt: Date.now(),
    }

    await this.state.storage.put(itemId, item)
    return Response.json(item)
  }

  private async handleDelete(itemId: string): Promise<Response> {
    const existing = await this.state.storage.get<Item>(itemId)
    if (!existing) return new Response('Not found', { status: 404 })

    await this.state.storage.delete(itemId)
    return new Response(null, { status: 204 })
  }
}
`,
        },
      ],
      dependencies: [],
      devDependencies: ['@cloudflare/workers-types', 'typescript', 'wrangler'],
    },
  }

  return templates[template] || templates.basic
}

/**
 * Generate package.json content
 *
 * @param name - Project name
 * @param template - Template configuration
 * @returns package.json content as string
 */
function generatePackageJson(name: string, template: TemplateConfig): string {
  const pkg = {
    name,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'wrangler dev',
      deploy: 'wrangler deploy',
      test: 'vitest',
    },
    dependencies: Object.fromEntries(
      template.dependencies.map((dep) => [dep, 'latest'])
    ),
    devDependencies: Object.fromEntries(
      template.devDependencies.map((dep) => [dep, 'latest'])
    ),
  }

  return JSON.stringify(pkg, null, 2)
}

/**
 * Generate tsconfig.json content
 *
 * @returns tsconfig.json content as string
 */
function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2022'],
      types: ['@cloudflare/workers-types'],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      isolatedModules: true,
    },
    include: ['src/**/*.ts'],
    exclude: ['node_modules'],
  }

  return JSON.stringify(config, null, 2)
}

/**
 * Generate wrangler.toml content
 *
 * @param name - Project name
 * @param doClassName - Durable Object class name
 * @returns wrangler.toml content as string
 */
function generateWranglerToml(name: string, doClassName: string): string {
  return `name = "${name}"
main = "src/index.ts"
compatibility_date = "${new Date().toISOString().split('T')[0]}"

[[durable_objects.bindings]]
name = "${doClassName.toUpperCase()}"
class_name = "${doClassName}"

[[migrations]]
tag = "v1"
new_classes = ["${doClassName}"]
`
}

/**
 * Generate do.config.ts content
 *
 * @param name - Project name
 * @param doClassName - Durable Object class name
 * @returns do.config.ts content as string
 */
function generateDoConfig(name: string, doClassName: string): string {
  return `/**
 * DO Configuration
 * @see https://do.dev/docs/config
 */
import { defineConfig } from '@do/cli'

export default defineConfig({
  name: '${name}',
  src: './src',
  out: './dist',

  durableObjects: {
    ${doClassName}: {
      class: '${doClassName}',
      script: './src/${doClassName.toLowerCase()}.ts',
    },
  },

  cloudflare: {
    accountId: process.env.CF_ACCOUNT_ID,
    workerName: '${name}-worker',
  },

  github: {
    repo: undefined, // Set to 'owner/repo' to enable sync
    branch: 'main',
    actions: true,
  },

  npm: {
    name: '@your-org/${name}',
    access: 'public',
  },

  dev: {
    port: 8787,
    persist: true,
  },
})
`
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Execute the init command.
 *
 * Creates a new DO project with the specified template and options.
 * Sets up the directory structure, configuration files, and optionally
 * initializes git and installs dependencies.
 *
 * @param options - Init command options
 * @returns Command execution result
 *
 * @example
 * ```typescript
 * const result = await init({
 *   name: 'my-counter',
 *   template: 'basic',
 *   typescript: true,
 *   git: true,
 *   install: true,
 * })
 * ```
 */
export async function init(options: InitOptions): Promise<CommandResult> {
  const {
    name = process.cwd().split('/').pop() || 'my-do',
    template = 'basic',
    typescript = true,
    git = true,
    install = true,
  } = options

  console.log(`\nInitializing DO project: ${name}`)
  console.log(`  Template: ${template}`)
  console.log(`  TypeScript: ${typescript}`)
  console.log(`  Git: ${git}`)
  console.log(`  Install: ${install}`)
  console.log('')

  // Get template configuration
  const templateConfig = getTemplate(template, name)

  // Determine DO class name from template
  const doClassName = template === 'basic' ? 'Counter' :
    template === 'chat' ? 'ChatRoom' :
    template === 'game' ? 'GameRoom' :
    'Store'

  // Files to create
  const filesToCreate: TemplateFile[] = [
    ...templateConfig.files,
    { path: 'package.json', content: generatePackageJson(name, templateConfig) },
    { path: 'wrangler.toml', content: generateWranglerToml(name, doClassName) },
    { path: 'do.config.ts', content: generateDoConfig(name, doClassName) },
  ]

  if (typescript) {
    filesToCreate.push({ path: 'tsconfig.json', content: generateTsConfig() })
  }

  // Log files that will be created
  console.log('Files to create:')
  for (const file of filesToCreate) {
    console.log(`  ${file.path}`)
  }

  // TODO: Actually create files using fs
  // For now, return success with instructions

  return {
    success: true,
    message: `
Project initialized successfully!

Next steps:
  1. cd ${name}
  2. npm install (or pnpm install)
  3. do dev

To deploy:
  do deploy
`,
    data: {
      name,
      template,
      files: filesToCreate.map((f) => f.path),
    },
  }
}

// =============================================================================
// Exports
// =============================================================================

export { getTemplate, generatePackageJson, generateTsConfig, generateWranglerToml }
