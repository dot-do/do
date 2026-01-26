/**
 * objects.do Types - Universal DO Runtime Types
 *
 * Every DO is data. These types define the structure of a DO definition
 * that can be stored, loaded, and executed by the GenericDO runtime.
 */

// =============================================================================
// Core DO Definition
// =============================================================================

/**
 * DODefinition - the complete data structure that defines a Digital Object
 *
 * A DO definition is pure data (JSON-serializable) that describes:
 * - Identity ($id, $type, $context)
 * - API methods (stringified functions)
 * - Event handlers (stringified functions)
 * - Scheduled tasks (cron/interval -> stringified functions)
 * - Site pages (MDX content)
 * - App pages (MDX content)
 * - Agent configuration (if this DO is an AI agent)
 * - Custom config
 *
 * @example
 * ```typescript
 * const definition: DODefinition = {
 *   $id: 'crm.acme.com',
 *   $type: 'SaaS',
 *
 *   api: {
 *     ping: 'async () => "pong"',
 *     customers: {
 *       list: 'async () => $.db.Customer.list()',
 *       get: 'async (id) => $.db.Customer.get(id)',
 *     }
 *   },
 *
 *   events: {
 *     'Customer.created': 'async (customer) => $.slack`#sales New: ${customer.name}`'
 *   },
 *
 *   schedules: {
 *     'every.day.at9am': 'async () => $.slack`#metrics Daily report`'
 *   },
 *
 *   site: {
 *     '/': '# Welcome\n\n<Hero />'
 *   }
 * }
 * ```
 */
export interface DODefinition {
  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  /**
   * Unique identifier - domain or domain/path
   * Examples: 'crm.acme.com', 'startup.do/tenant-123'
   */
  $id: string

  /**
   * DO type - resolves to a schema URL
   * Examples: 'SaaS', 'Startup', 'Agent', 'https://schema.org.ai/Agent'
   */
  $type?: string

  /**
   * Parent DO URL - enables CDC bubbling up the hierarchy
   * Example: 'https://startups.studio'
   */
  $context?: string

  /**
   * Version identifier - semver or git commit
   * Examples: '1.0.0', 'abc123', 'latest'
   */
  $version?: string

  // -------------------------------------------------------------------------
  // API (RPC Methods)
  // -------------------------------------------------------------------------

  /**
   * API methods exposed via RPC
   *
   * Can be:
   * - String: stringified async function
   * - APIMethodDefinition: detailed method with params/returns
   * - Nested namespace object
   *
   * @example
   * ```typescript
   * api: {
   *   ping: 'async () => "pong"',
   *   users: {
   *     list: 'async () => $.db.User.list()',
   *     get: { code: 'async (id) => $.db.User.get(id)', params: ['id'] }
   *   }
   * }
   * ```
   */
  api?: APIDefinition

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  /**
   * Event handlers - pattern -> handler
   *
   * Pattern format: 'Noun.event' or 'Namespace.Noun.event'
   * Handler: stringified async function receiving (data, $)
   *
   * @example
   * ```typescript
   * events: {
   *   'Customer.created': 'async (customer) => $.email`Welcome ${customer.name}`',
   *   'stripe.payment_failed': 'async (event) => $.slack`Payment failed!`'
   * }
   * ```
   */
  events?: Record<string, string>

  // -------------------------------------------------------------------------
  // Schedules
  // -------------------------------------------------------------------------

  /**
   * Scheduled tasks - schedule pattern -> handler
   *
   * Pattern formats:
   * - Interval: 'every.hour', 'every.5.minutes'
   * - Daily: 'every.day.at9am', 'every.day.atmidnight'
   * - Weekly: 'every.Monday.at9am', 'every.weekday.at6pm'
   * - Monthly: 'every.month.on1st', 'every.month.onLast'
   *
   * @example
   * ```typescript
   * schedules: {
   *   'every.hour': 'async () => $.db.Metrics.snapshot()',
   *   'every.Monday.at9am': 'async () => $.slack`#team Weekly standup!`'
   * }
   * ```
   */
  schedules?: Record<string, string>

  // -------------------------------------------------------------------------
  // Site (Public Pages)
  // -------------------------------------------------------------------------

  /**
   * Site pages - public-facing content (marketing, docs, blog)
   *
   * Can be:
   * - String: root page MDX content
   * - Record: path -> MDX content mapping
   *
   * @example
   * ```typescript
   * // Simple root page
   * site: '# Welcome\n\nWelcome to our site.'
   *
   * // Multiple pages
   * site: {
   *   '/': '# Home\n\n<Hero />',
   *   '/pricing': '# Pricing\n\n<PricingTable />',
   *   '/docs': '# Docs\n\n<DocsNav />'
   * }
   * ```
   */
  site?: Record<string, string> | string

  // -------------------------------------------------------------------------
  // App (Authenticated Pages)
  // -------------------------------------------------------------------------

  /**
   * App pages - authenticated application UI
   *
   * @example
   * ```typescript
   * app: {
   *   '/dashboard': '<Dashboard stats={$.db.Stats.current()} />',
   *   '/customers': '<CustomerList customers={$.db.Customer.list()} />',
   *   '/settings': '<Settings config={$.config} />'
   * }
   * ```
   */
  app?: Record<string, string>

  // -------------------------------------------------------------------------
  // Agent
  // -------------------------------------------------------------------------

  /**
   * Agent configuration - if this DO is an AI agent
   */
  agent?: AgentDefinition

  // -------------------------------------------------------------------------
  // Config
  // -------------------------------------------------------------------------

  /**
   * Custom configuration data
   */
  config?: Record<string, unknown>
}

// =============================================================================
// API Definition Types
// =============================================================================

/**
 * API nested namespace - record of methods or nested namespaces
 */
export interface APINamespace {
  [key: string]: string | APIMethodDefinition | APINamespace
}

/**
 * API method or namespace - can nest arbitrarily deep
 */
export type APIMethodOrNamespace =
  | string                    // Stringified function
  | APIMethodDefinition       // Detailed method definition
  | APINamespace              // Nested namespace

/**
 * API definition - methods and nested namespaces
 */
export type APIDefinition = Record<string, APIMethodOrNamespace>

/**
 * Detailed API method definition
 */
export interface APIMethodDefinition {
  /**
   * Stringified function code
   * Example: 'async (id) => $.db.User.get(id)'
   */
  code: string

  /**
   * Parameter names (for documentation/validation)
   */
  params?: string[]

  /**
   * Return type description
   */
  returns?: string

  /**
   * Method description
   */
  description?: string

  /**
   * Whether this method requires authentication
   */
  auth?: boolean

  /**
   * Rate limit (requests per minute)
   */
  rateLimit?: number

  /**
   * Timeout in milliseconds
   */
  timeout?: number
}

// =============================================================================
// Agent Definition Types
// =============================================================================

/**
 * Model selector - characteristic-based, not model-name-based
 *
 * Single characteristic or comma-separated priority
 * The runtime selects the best model based on current data
 */
export type ModelSelector =
  | 'best'      // Highest quality
  | 'fast'      // Lowest latency
  | 'cost'      // Cheapest option
  | 'reasoning' // Best for reasoning tasks
  | 'vision'    // Best vision model
  | 'code'      // Best for code generation
  | 'long'      // Longest context window
  | `${ModelCharacteristic},${ModelCharacteristic}`  // Priority combo

type ModelCharacteristic = 'best' | 'fast' | 'cost' | 'reasoning' | 'vision' | 'code' | 'long'

/**
 * Agent definition - AI agent configuration
 */
export interface AgentDefinition {
  /**
   * Model selector - characteristic-based selection
   * Runtime selects the best model based on current data from OpenRouter
   */
  model?: ModelSelector

  /**
   * System prompt - agent personality and instructions
   */
  systemPrompt: string

  /**
   * Available tools - tool names the agent can use
   */
  tools?: string[]

  /**
   * Voice configuration (if agent has voice modality)
   */
  voice?: AgentVoiceConfig

  /**
   * Temperature for responses (0-2)
   */
  temperature?: number

  /**
   * Maximum tokens per response
   */
  maxTokens?: number

  /**
   * Maximum iterations for autonomous tasks
   */
  maxIterations?: number
}

/**
 * Agent voice configuration
 */
export interface AgentVoiceConfig {
  /**
   * Voice provider
   */
  provider: 'elevenlabs' | 'playht' | 'azure' | 'google' | 'openai' | 'deepgram' | 'vapi' | 'livekit' | 'retell' | 'bland'

  /**
   * Voice ID from the provider
   */
  voiceId: string

  /**
   * Voice name (for reference)
   */
  voiceName?: string

  /**
   * Speaking rate (0.5-2.0)
   */
  speed?: number

  /**
   * Stability (for ElevenLabs)
   */
  stability?: number
}

// =============================================================================
// DOContext Interface (the $ object)
// =============================================================================

/**
 * DOContext - the $ object available in all DO functions
 *
 * Provides access to:
 * - Identity ($id, $type, $context)
 * - AI operations ($.ai)
 * - Database operations ($.db)
 * - Communication ($.email, $.slack, $.sms)
 * - File system ($.fsx)
 * - Git operations ($.gitx)
 * - Shell commands ($.bashx)
 * - Events ($.emit)
 * - Child DOs ($.child, $.spawn)
 * - Config ($.config)
 * - Logging ($.log)
 */
export interface DOContext {
  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  /** DO identifier */
  $id: string

  /** DO type */
  $type: string

  /** Parent DO URL */
  $context?: string

  // -------------------------------------------------------------------------
  // AI Operations
  // -------------------------------------------------------------------------

  /**
   * AI operations - text generation, embeddings, images, etc.
   *
   * @example
   * ```typescript
   * const ideas = await $.ai`5 startup ideas for ${industry}`
   * const isViable = await $.ai.is`${idea} is technically feasible`
   * const summary = await $.ai.summarize`${document}`
   * ```
   */
  ai: AIContext

  // -------------------------------------------------------------------------
  // Database Operations
  // -------------------------------------------------------------------------

  /**
   * Database operations - DB4.AI with 4 paradigms
   *
   * @example
   * ```typescript
   * const users = await $.db.User.list()
   * const user = await $.db.User.get(id)
   * const stuck = await $.db.Order`what's stuck in processing?`
   * ```
   */
  db: DBContext

  // -------------------------------------------------------------------------
  // Communication
  // -------------------------------------------------------------------------

  /**
   * Email operations
   *
   * @example
   * ```typescript
   * await $.email`Welcome ${name} to ${email}`
   * await $.email.to(email)`Your order ${orderId} has shipped`
   * ```
   */
  email: TaggedTemplate<{ messageId: string }>

  /**
   * Slack operations
   *
   * @example
   * ```typescript
   * await $.slack`#general New customer: ${name}`
   * await $.slack.channel('C123')`Important update`
   * ```
   */
  slack: TaggedTemplate<{ ts: string }>

  /**
   * SMS operations
   *
   * @example
   * ```typescript
   * await $.sms`${phone} Your code is ${code}`
   * await $.sms.to(phone)`Your order has shipped`
   * ```
   */
  sms: TaggedTemplate<{ messageId: string }>

  // -------------------------------------------------------------------------
  // File System
  // -------------------------------------------------------------------------

  /**
   * File system operations
   *
   * @example
   * ```typescript
   * const content = await $.fsx.read('/data/config.json')
   * await $.fsx.write('/data/output.json', JSON.stringify(data))
   * const files = await $.fsx.list('*.md')
   * ```
   */
  fsx: FSXContext

  // -------------------------------------------------------------------------
  // Git Operations
  // -------------------------------------------------------------------------

  /**
   * Git operations for versioning
   *
   * @example
   * ```typescript
   * const sha = await $.gitx.commit('Update config')
   * const history = await $.gitx.history()
   * await $.gitx.checkout('v1.0.0')
   * ```
   */
  gitx: GitXContext

  // -------------------------------------------------------------------------
  // Shell Commands
  // -------------------------------------------------------------------------

  /**
   * Shell command execution
   *
   * @example
   * ```typescript
   * const result = await $.bashx.exec('ls -la')
   * console.log(result.stdout)
   * ```
   */
  bashx: BashXContext

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  /**
   * Emit an event that bubbles up the $context chain
   *
   * @example
   * ```typescript
   * await $.emit('Customer.created', customer)
   * await $.emit('Order.shipped', { orderId, trackingNumber })
   * ```
   */
  emit(event: string, data: unknown): Promise<void>

  // -------------------------------------------------------------------------
  // Child DOs
  // -------------------------------------------------------------------------

  /**
   * Get a child DO reference
   *
   * @example
   * ```typescript
   * const tenant = $.child('Tenant', 'acme')
   * const users = await tenant.db.User.list()
   * ```
   */
  child(type: string, name: string): DOContext

  /**
   * Spawn a new child DO
   *
   * @example
   * ```typescript
   * const newTenant = await $.spawn('Tenant', 'newcorp')
   * await newTenant.db.User.create({ name: 'Admin' })
   * ```
   */
  spawn(type: string, name: string): Promise<DOContext>

  // -------------------------------------------------------------------------
  // Config & Logging
  // -------------------------------------------------------------------------

  /**
   * DO configuration (from DODefinition.config)
   */
  config: Record<string, unknown>

  /**
   * Logging
   *
   * @example
   * ```typescript
   * $.log('Processing order', orderId)
   * $.log.error('Failed to process', error)
   * ```
   */
  log: LogContext

  // -------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------

  /**
   * Stripe operations (via stripe.do service)
   */
  stripe: StripeContext

  // -------------------------------------------------------------------------
  // Service Bindings (via RPC)
  // -------------------------------------------------------------------------

  /**
   * MDX compilation & rendering (via mdx.do service)
   *
   * @example
   * ```typescript
   * const compiled = await $.mdx.compile('# Hello {name}')
   * const html = await $.mdx.render(source, { props: { name: 'World' } })
   * const valid = await $.mdx.lint(source)
   * ```
   */
  mdx: MDXService

  /**
   * Auth operations (via auth.do service)
   *
   * @example
   * ```typescript
   * const session = await $.auth.verify(token)
   * const user = await $.auth.getUser(userId)
   * ```
   */
  auth: AuthService

  /**
   * OAuth operations (via oauth.do service)
   *
   * @example
   * ```typescript
   * const url = await $.oauth.authorize('github', { scopes: ['repo'] })
   * const tokens = await $.oauth.callback('github', code)
   * ```
   */
  oauth: OAuthService

  /**
   * GitHub operations (via github.do service)
   *
   * @example
   * ```typescript
   * const repos = await $.github.repos.list()
   * const pr = await $.github.pulls.create({ owner, repo, title, body })
   * ```
   */
  github: GitHubService

  /**
   * ESBuild operations (via esbuild.do service)
   *
   * @example
   * ```typescript
   * const result = await $.esbuild.build({ entryPoints: ['app.ts'] })
   * const transformed = await $.esbuild.transform(code, { loader: 'ts' })
   * ```
   */
  esbuild: ESBuildService

  /**
   * MCP operations (via mcp.do service)
   *
   * @example
   * ```typescript
   * const tools = await $.mcp.tools.list()
   * const result = await $.mcp.tools.call('search', { query: '...' })
   * ```
   */
  mcp: MCPService
}

// =============================================================================
// Context Sub-Interfaces
// =============================================================================

/**
 * Tagged template function signature
 */
export interface TaggedTemplate<T> {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<T>
}

/**
 * AI context - text generation, embeddings, images, etc.
 */
export interface AIContext {
  /** Generate text/structured output */
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<string>

  /** Generate a list */
  list: TaggedTemplate<string[]>

  /** Boolean check */
  is: TaggedTemplate<boolean>

  /** Generate text content */
  write: TaggedTemplate<string>

  /** Summarize content */
  summarize: TaggedTemplate<string>

  /** Generate code */
  code: TaggedTemplate<string>

  /** Extract structured data */
  extract: <T>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>

  /** Embed text for vector search */
  embed: (text: string) => Promise<number[]>

  /** Generate image */
  image: TaggedTemplate<{ url: string }>

  /** Synthesize speech */
  speak: TaggedTemplate<ArrayBuffer>

  /** Transcribe audio */
  transcribe: (audio: ArrayBuffer) => Promise<string>

  /** Simple text generation */
  generate: (prompt: string) => Promise<string>
}

/**
 * Database collection interface
 */
export interface DBCollection<T = unknown> {
  /** Natural language query */
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>

  /** Get by ID */
  get(id: string): Promise<T | null>

  /** List all */
  list(options?: ListOptions): Promise<T[]>

  /** Find by filter */
  find(filter: Record<string, unknown>): Promise<T[]>

  /** Full-text search */
  search(query: string): Promise<T[]>

  /** Create new */
  create(data: Partial<T>): Promise<T>

  /** Update existing */
  update(id: string, data: Partial<T>): Promise<T>

  /** Delete by ID */
  delete(id: string): Promise<boolean>

  /** Count */
  count(filter?: Record<string, unknown>): Promise<number>
}

/**
 * List options
 */
export interface ListOptions {
  limit?: number
  offset?: number
  orderBy?: string
  orderDir?: 'asc' | 'desc'
  filter?: Record<string, unknown>
}

/**
 * Database context base interface (static methods)
 */
export interface DBContextBase {
  /** SQL query */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>

  /** Get collection by name */
  collection<T = unknown>(name: string): DBCollection<T>
}

/**
 * Dynamic collection accessor (for $.db.User, $.db.Order, etc.)
 */
export interface DBCollectionAccessor {
  [collectionName: string]: DBCollection
}

/**
 * Database context - combines static methods with dynamic collection access
 *
 * Usage:
 * - $.db.query('SELECT * FROM users')
 * - $.db.collection<User>('users')
 * - $.db.User.list()  // via Proxy
 */
export type DBContext = DBContextBase & DBCollectionAccessor

/**
 * File system context
 */
export interface FSXContext {
  /** Read file contents */
  read(path: string): Promise<string>

  /** Write file contents */
  write(path: string, content: string): Promise<void>

  /** List files matching pattern */
  list(pattern: string): Promise<string[]>

  /** Delete file */
  delete(path: string): Promise<void>

  /** Check if file exists */
  exists(path: string): Promise<boolean>

  /** Create directory */
  mkdir(path: string): Promise<void>
}

/**
 * Git context
 */
export interface GitXContext {
  /** Create a commit */
  commit(message: string): Promise<string>

  /** Get commit history */
  history(): Promise<GitCommit[]>

  /** Checkout a ref */
  checkout(ref: string): Promise<void>

  /** Get current status */
  status(): Promise<GitStatus>

  /** Get diff */
  diff(options?: { staged?: boolean }): Promise<string>
}

/**
 * Git commit
 */
export interface GitCommit {
  sha: string
  message: string
  author: { name: string; email: string }
  timestamp: number
}

/**
 * Git status
 */
export interface GitStatus {
  branch: string
  staged: string[]
  unstaged: string[]
  untracked: string[]
}

/**
 * Bash context
 */
export interface BashXContext {
  /** Execute a shell command */
  exec(command: string): Promise<BashResult>
}

/**
 * Bash result
 */
export interface BashResult {
  success: boolean
  exitCode: number
  stdout: string
  stderr: string
  duration: number
}

/**
 * Log context
 */
export interface LogContext {
  (...args: unknown[]): void
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/**
 * Stripe context (via stripe.do service)
 */
export interface StripeContext {
  /** Customer operations */
  customers: {
    create(data: Record<string, unknown>): Promise<StripeCustomer>
    get(id: string): Promise<StripeCustomer>
    list(): Promise<StripeCustomer[]>
  }

  /** Subscription operations */
  subscriptions: {
    create(data: Record<string, unknown>): Promise<StripeSubscription>
    cancel(id: string): Promise<StripeSubscription>
  }

  /** Payment intent operations */
  paymentIntents: {
    create(data: Record<string, unknown>): Promise<StripePaymentIntent>
    confirm(id: string): Promise<StripePaymentIntent>
  }

  /** Checkout session */
  checkout: {
    create(data: Record<string, unknown>): Promise<{ url: string }>
  }
}

/**
 * Stripe customer
 */
export interface StripeCustomer {
  id: string
  email: string
  name?: string
  metadata?: Record<string, string>
}

/**
 * Stripe subscription
 */
export interface StripeSubscription {
  id: string
  status: string
  customerId: string
  priceId: string
  currentPeriodEnd: number
}

/**
 * Stripe payment intent
 */
export interface StripePaymentIntent {
  id: string
  status: string
  amount: number
  currency: string
  customerId?: string
}

// =============================================================================
// Service Interfaces (RPC to external workers)
// =============================================================================

/**
 * MDX service interface (mdx.do)
 */
export interface MDXService {
  /** Compile MDX to JavaScript */
  compile(source: string, options?: MDXCompileOptions): Promise<{ code: string; matter?: Record<string, unknown> }>

  /** Evaluate MDX and return exports */
  evaluate(source: string, options?: MDXEvaluateOptions): Promise<{ exports: string[] }>

  /** Render MDX to HTML (server-side) */
  render(source: string, options?: MDXRenderOptions): Promise<{ code: string; props?: Record<string, unknown> }>

  /** Parse frontmatter from MDX */
  frontmatter(source: string): Promise<Record<string, string>>

  /** Lint MDX source for errors */
  lint(source: string): Promise<{ valid: boolean; errors: Array<{ message: string; line?: number; column?: number }> }>
}

export interface MDXCompileOptions {
  jsx?: boolean
  format?: 'mdx' | 'md'
  development?: boolean
}

export interface MDXEvaluateOptions extends MDXCompileOptions {
  props?: Record<string, unknown>
}

export interface MDXRenderOptions {
  props?: Record<string, unknown>
  components?: Record<string, string>
}

/**
 * Auth service interface (auth.do)
 */
export interface AuthService {
  /** Verify a session token */
  verify(token: string): Promise<{ valid: boolean; userId?: string; sessionId?: string }>

  /** Get user by ID */
  getUser(id: string): Promise<{ id: string; email?: string; name?: string } | null>

  /** Create a new session */
  createSession(userId: string): Promise<{ token: string; expiresAt: number }>

  /** Revoke a session */
  revokeSession(token: string): Promise<{ success: boolean }>
}

/**
 * OAuth service interface (oauth.do)
 */
export interface OAuthService {
  /** Get authorization URL for a provider */
  authorize(provider: string, options?: { scopes?: string[]; state?: string }): Promise<{ url: string }>

  /** Handle OAuth callback */
  callback(provider: string, code: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: number }>

  /** Refresh tokens */
  refresh(provider: string, refreshToken: string): Promise<{ accessToken: string; expiresAt?: number }>

  /** Get provider tokens for a user */
  getTokens(provider: string, userId: string): Promise<{ accessToken: string; expiresAt?: number } | null>
}

/**
 * GitHub service interface (github.do)
 */
export interface GitHubService {
  repos: {
    list(): Promise<Array<{ id: number; name: string; fullName: string }>>
    get(owner: string, repo: string): Promise<{ id: number; name: string; fullName: string; defaultBranch: string }>
    create(data: { name: string; private?: boolean; description?: string }): Promise<{ id: number; name: string }>
  }
  pulls: {
    list(owner: string, repo: string): Promise<Array<{ id: number; number: number; title: string; state: string }>>
    get(owner: string, repo: string, number: number): Promise<{ id: number; number: number; title: string; body: string }>
    create(data: { owner: string; repo: string; title: string; body: string; head: string; base: string }): Promise<{ id: number; number: number; url: string }>
  }
  issues: {
    list(owner: string, repo: string): Promise<Array<{ id: number; number: number; title: string; state: string }>>
    create(data: { owner: string; repo: string; title: string; body?: string }): Promise<{ id: number; number: number; url: string }>
  }
}

/**
 * ESBuild service interface (esbuild.do)
 */
export interface ESBuildService {
  /** Build a bundle */
  build(options: ESBuildBuildOptions): Promise<{ outputFiles: Array<{ path: string; contents: string }> }>

  /** Transform code */
  transform(code: string, options?: ESBuildTransformOptions): Promise<{ code: string; map?: string }>

  /** Analyze a bundle */
  analyze(options: ESBuildBuildOptions): Promise<{ metafile: Record<string, unknown> }>
}

export interface ESBuildBuildOptions {
  entryPoints?: string[]
  stdin?: { contents: string; loader?: string }
  bundle?: boolean
  minify?: boolean
  format?: 'esm' | 'cjs' | 'iife'
  target?: string
  platform?: 'browser' | 'node' | 'neutral'
}

export interface ESBuildTransformOptions {
  loader?: 'ts' | 'tsx' | 'js' | 'jsx' | 'json' | 'css'
  minify?: boolean
  target?: string
}

/**
 * MCP service interface (mcp.do)
 */
export interface MCPService {
  tools: {
    /** List available tools */
    list(): Promise<Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>>

    /** Call a tool */
    call(name: string, args: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>
  }
  resources: {
    /** List available resources */
    list(): Promise<Array<{ uri: string; name: string; mimeType?: string }>>

    /** Read a resource */
    read(uri: string): Promise<{ contents: Array<{ uri: string; text: string; mimeType?: string }> }>
  }
}

// =============================================================================
// Execution Result Types
// =============================================================================

/**
 * Function execution result
 */
export interface ExecutionResult<T = unknown> {
  /** Whether execution succeeded */
  success: boolean

  /** Result value (if success) */
  result?: T

  /** Error details (if failed) */
  error?: ExecutionError

  /** Execution duration in milliseconds */
  duration: number

  /** Logs produced during execution */
  logs?: LogEntry[]
}

/**
 * Execution error
 */
export interface ExecutionError {
  /** Error code */
  code: string

  /** Error message */
  message: string

  /** Stack trace */
  stack?: string

  /** Additional details */
  details?: Record<string, unknown>
}

/**
 * Log entry
 */
export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  timestamp: number
  data?: Record<string, unknown>
}

// =============================================================================
// RPC Types
// =============================================================================

/**
 * RPC request body
 */
export interface RPCRequest {
  /** Method name (e.g., 'users.get', 'ping') */
  method: string

  /** Method parameters */
  params?: unknown[]

  /** Request ID for correlation */
  id?: string | number
}

/**
 * RPC response body
 */
export interface RPCResponse<T = unknown> {
  /** Result value (if success) */
  result?: T

  /** Error details (if failed) */
  error?: RPCError

  /** Request ID for correlation */
  id?: string | number
}

/**
 * RPC error
 */
export interface RPCError {
  /** Error code */
  code: number

  /** Error message */
  message: string

  /** Additional data */
  data?: unknown
}

// =============================================================================
// Registry Types
// =============================================================================

/**
 * Registry entry - stored DO definition with metadata
 */
export interface RegistryEntry {
  /** DO definition */
  definition: DODefinition

  /** Creation timestamp */
  createdAt: number

  /** Last update timestamp */
  updatedAt: number

  /** Owner (user/org ID) */
  owner?: string

  /** Access control */
  acl?: AccessControl

  /** Usage metrics */
  metrics?: RegistryMetrics
}

/**
 * Access control
 */
export interface AccessControl {
  /** Public read access */
  public?: boolean

  /** Allowed readers */
  readers?: string[]

  /** Allowed writers */
  writers?: string[]

  /** Admin users */
  admins?: string[]
}

/**
 * Registry metrics
 */
export interface RegistryMetrics {
  /** Number of invocations */
  invocations: number

  /** Last invocation timestamp */
  lastInvokedAt?: number

  /** Total execution time (ms) */
  totalExecutionTime: number

  /** Error count */
  errors: number
}

// =============================================================================
// Worker Environment Types
// =============================================================================

/**
 * Worker environment bindings
 */
export interface Env {
  /** Registry R2 bucket */
  REGISTRY: R2Bucket

  /** Generic DO namespace (optional - may not be needed for all operations) */
  OBJECTS?: DurableObjectNamespace

  /** esbuild.do service */
  ESBUILD: Fetcher

  /** stripe.do service */
  STRIPE: Fetcher

  /** ai.do service */
  AI: Fetcher

  /** mdx.do service */
  MDX: Fetcher

  /** auth.do service */
  AUTH: Fetcher

  /** oauth.do service */
  OAUTH: Fetcher

  /** github.do service */
  GITHUB: Fetcher

  /** mcp.do service */
  MCP: Fetcher
}

/**
 * R2 bucket interface (subset)
 */
export interface R2Bucket {
  get(key: string): Promise<R2Object | null>
  put(key: string, value: string | ArrayBuffer | ReadableStream): Promise<R2Object>
  delete(key: string): Promise<void>
  list(options?: R2ListOptions): Promise<R2Objects>
}

/**
 * R2 object
 */
export interface R2Object {
  key: string
  size: number
  etag: string
  uploaded: Date
  body: ReadableStream
  text(): Promise<string>
  json<T = unknown>(): Promise<T>
}

/**
 * R2 list options
 */
export interface R2ListOptions {
  prefix?: string
  limit?: number
  cursor?: string
}

/**
 * R2 list result
 */
export interface R2Objects {
  objects: R2Object[]
  truncated: boolean
  cursor?: string
}

/**
 * Durable Object namespace
 */
export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  idFromString(id: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
}

/**
 * Durable Object ID
 */
export interface DurableObjectId {
  toString(): string
  name?: string
}

/**
 * Durable Object stub
 */
export interface DurableObjectStub {
  fetch(request: Request | string): Promise<Response>
}

/**
 * Service fetcher
 */
export interface Fetcher {
  fetch(request: Request | string, init?: RequestInit): Promise<Response>
}
