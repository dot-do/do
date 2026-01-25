/**
 * Collection Types for Digital Objects
 *
 * Every DO can contain these collections:
 * - Data: Databases, Nouns, Verbs, Things, Actions, Relationships
 * - Execution: Functions, Workflows, Actions (durable)
 * - Events: Events (immutable), Experiments, Analytics
 * - External: Integrations, Webhooks
 * - Identity: Orgs, Roles, Users, Agents
 */

// =============================================================================
// Linguistic Pattern (from digital-objects)
// =============================================================================

/**
 * Noun - defines an entity type
 */
export interface Noun {
  id: string
  name: string
  singular: string
  plural: string
  slug: string
  schema?: Record<string, unknown>
  description?: string
}

/**
 * Verb - defines an action type with all grammatical forms
 *
 * Every verb has:
 * - action: create (imperative)
 * - activity: creating (present participle)
 * - event: created (past tense - what happened)
 * - reverse: createdBy (passive - who/what did it)
 * - inverse: delete (opposite action)
 *
 * Example: create → creating → created → createdBy → delete
 */
export interface Verb {
  id: string
  name: string

  /** Imperative form: create, update, delete */
  action: string

  /** Short form: act */
  act: string

  /** Present participle: creating, updating, deleting */
  activity: string

  /** Past tense (event): created, updated, deleted */
  event: string

  /** Passive form: createdBy, updatedBy, deletedBy */
  reverse: string

  /** Opposite action: create ↔ delete, start ↔ stop */
  inverse?: string

  description?: string
}

/**
 * Actor - who initiated an action
 */
export type ActorType = 'User' | 'Agent' | 'Service' | 'System'

export interface Actor {
  /** Actor type */
  type: ActorType
  /** Actor ID (user ID, agent ID, service name) */
  id: string
  /** Display name */
  name?: string
}

/**
 * Thing - an instance of a Noun
 *
 * Supports two MDXLD formats:
 * - Expanded: { $id, $type, $content, $code, ...data }
 * - Compact: { id, type, data, content, code }
 *
 * DUAL NATURE: A Thing can also BE its own DO via $ref.
 * Example: `headless.ly` is a Thing in `startups.studio` BUT ALSO
 * its own DO with $context pointing back to startups.studio.
 */
export interface ThingExpanded {
  /** Entity ID (JSON-LD @id) */
  $id: string
  /** Entity type (JSON-LD @type, replaces noun) */
  $type: string
  /**
   * URL reference to this Thing's own DO (if it has one)
   * Creates the Parent→Child side of the dual nature pattern.
   * The child DO's $context creates the Child→Parent side.
   * Example: 'https://headless.ly'
   */
  $ref?: string
  /** MDX content (markdown + JSX) */
  $content?: string
  /** Executable code */
  $code?: string
  /** Version */
  $version?: number
  /** Created timestamp */
  $createdAt?: number
  /** Updated timestamp */
  $updatedAt?: number
  /** Data fields spread at root level */
  [key: string]: unknown
}

export interface ThingCompact<T = unknown> {
  /** Entity ID */
  id: string
  /** Entity type (replaces noun) */
  type: string
  /** Entity data */
  data: T
  /**
   * URL reference to this Thing's own DO (if it has one)
   * Creates the Parent→Child side of the dual nature pattern.
   * Example: 'https://headless.ly'
   */
  ref?: string
  /** MDX content */
  content?: string
  /** Executable code */
  code?: string
  /** Version */
  version?: number
  /** Created timestamp */
  createdAt?: number
  /** Updated timestamp */
  updatedAt?: number
}

/**
 * Thing - union of both formats
 * Use ThingExpanded for MDXLD-style documents
 * Use ThingCompact for traditional data structures
 */
export type Thing<T = unknown> = ThingExpanded | ThingCompact<T>

/**
 * Type guard for expanded format
 */
export function isThingExpanded<T>(thing: Thing<T>): thing is ThingExpanded {
  return '$id' in thing && '$type' in thing
}

/**
 * Type guard for compact format
 */
export function isThingCompact<T>(thing: Thing<T>): thing is ThingCompact<T> {
  return 'id' in thing && 'type' in thing && 'data' in thing
}

/**
 * Action - an instance of a Verb (durable action)
 *
 * Every action has:
 * - actor: who initiated (User, Agent, Service)
 * - timestamp: when it happened
 * - request: the request that initiated it
 * - input/object: what it operates on
 * - config/options: settings for the action
 * - output/results: what it produced
 * - state/status: current state
 */
export interface Action<TInput = unknown, TOutput = unknown, TConfig = unknown> {
  /** Action ID */
  $id: string

  /** Verb reference (action type) */
  verb: string

  /** Subject (what performed the action, if not actor) */
  subject?: string

  /** Object/Input (what the action operates on) */
  object?: string
  input?: TInput

  /** Config/Options/Settings for the action */
  config?: TConfig

  /** Output/Results of the action */
  output?: TOutput

  /** Current state/status */
  status: ActionStatus

  /** Actor - who initiated this action */
  actor: Actor

  /** Request that initiated this action */
  request?: ActionRequest

  /** Timestamps */
  createdAt: number
  startedAt?: number
  completedAt?: number
  updatedAt?: number

  /** Error if failed */
  error?: ActionError

  /** Metadata */
  metadata?: Record<string, unknown>
}

export type ActionStatus =
  | 'pending'    // Waiting to start
  | 'running'    // Currently executing
  | 'completed'  // Successfully finished
  | 'failed'     // Failed with error
  | 'cancelled'  // Cancelled before completion
  | 'retrying'   // Failed, will retry
  | 'blocked'    // Waiting on dependency

/**
 * Request that initiated an action
 */
export interface ActionRequest {
  /** Request ID */
  id: string
  /** Request method */
  method?: string
  /** Request path/URL */
  path?: string
  /** Request timestamp */
  timestamp: number
  /** Trace/correlation ID */
  traceId?: string
}

/**
 * Error from a failed action
 */
export interface ActionError {
  /** Error code */
  code: string
  /** Error message */
  message: string
  /** Stack trace */
  stack?: string
  /** Retry count */
  retryCount?: number
  /** Is retryable */
  retryable?: boolean
}

/**
 * Relationship - connection between Things
 */
export interface Relationship {
  id: string
  from: string
  to: string
  type: string
  data?: Record<string, unknown>
  createdAt: number
}

// =============================================================================
// Functions (4 tiers from ai-workflows cascade)
// =============================================================================

export type FunctionType = 'code' | 'generative' | 'agentic' | 'human'

/**
 * Function - executable unit with 4 tiers
 * - code: Pure code execution
 * - generative: AI model call
 * - agentic: Autonomous agent
 * - human: Human-in-the-loop
 */
export interface Function {
  id: string
  name: string
  type: FunctionType
  definition: FunctionDefinition
  description?: string
  inputs?: SchemaDefinition
  outputs?: SchemaDefinition
  timeout?: number
}

export type FunctionDefinition =
  | { type: 'code'; code: string; runtime?: string }
  | { type: 'generative'; model: string; prompt: string; schema?: Record<string, unknown> }
  | { type: 'agentic'; agent: string; goal: string }
  | { type: 'human'; assignee?: string; instructions: string }

export interface SchemaDefinition {
  type: string
  properties?: Record<string, SchemaDefinition>
  required?: string[]
  items?: SchemaDefinition
  [key: string]: unknown
}

// =============================================================================
// Workflows - Durable Execution + State Machines
// =============================================================================

/**
 * Workflows can be:
 * 1. Durable code functions responding to events or time intervals
 * 2. XState-based state machines
 *
 * Both are durably executed and survive hibernation.
 */

export type WorkflowType = 'code' | 'state-machine'

export type WorkflowExecutionState =
  | 'Idle'        // Not started
  | 'Running'     // Currently executing
  | 'Paused'      // Paused, waiting for resume
  | 'Waiting'     // Waiting for event/timer
  | 'Completed'   // Successfully finished
  | 'Failed'      // Failed with error

/**
 * Workflow - unified interface for both types
 */
export interface Workflow<TContext = Record<string, unknown>> {
  id: string
  name: string
  type: WorkflowType
  definition: WorkflowDefinition | StateMachineDefinition
  executionState: WorkflowExecutionState
  context: TContext
  /** Current state (for state machines) or current step (for code workflows) */
  currentState?: string
  /** History of state transitions */
  history?: WorkflowHistoryEntry[]
  /** Actor who started the workflow */
  actor?: Actor
  /** Timestamps */
  createdAt: number
  startedAt?: number
  completedAt?: number
  updatedAt?: number
  /** Error if failed */
  error?: ActionError
}

// =============================================================================
// Code Workflows (Durable Functions)
// =============================================================================

/**
 * Code workflow definition - durable functions triggered by events or time
 */
export interface WorkflowDefinition {
  type: 'code'
  steps: WorkflowStep[]
  initialContext?: Record<string, unknown>
  /** Event triggers */
  triggers?: WorkflowTrigger[]
  /** Error handling */
  onError?: 'stop' | 'continue' | 'retry'
  retryPolicy?: RetryPolicy
}

export interface WorkflowStep {
  id: string
  name: string
  /** Function to execute */
  function: string
  /** Input mapping from context */
  inputs?: Record<string, unknown>
  /** Condition to execute (expression) */
  condition?: string
  /** Next step(s) */
  next?: string | string[]
  /** Error handling for this step */
  onError?: 'stop' | 'continue' | 'retry' | 'goto'
  errorTarget?: string
  /** Timeout for this step in ms */
  timeout?: number
}

export interface WorkflowTrigger {
  type: 'event' | 'schedule' | 'webhook'
  /** Event pattern: NS.Object.event (e.g., Order.Payment.completed) */
  event?: string
  /** Schedule: cron expression or interval */
  schedule?: string
  /** Webhook path */
  webhook?: string
  /** Condition to trigger */
  condition?: string
}

export interface RetryPolicy {
  maxAttempts: number
  initialDelay: number
  maxDelay: number
  backoffMultiplier: number
}

// =============================================================================
// State Machine Workflows (XState-compatible)
// =============================================================================

/**
 * State machine definition - XState-compatible
 *
 * Based on XState v5 machine config format
 */
export interface StateMachineDefinition {
  type: 'state-machine'
  /** Machine ID */
  id: string
  /** Initial state */
  initial: string
  /** Initial context */
  context?: Record<string, unknown>
  /** State definitions */
  states: Record<string, StateNode>
  /** Machine-level event handlers */
  on?: Record<string, Transition | Transition[]>
}

export interface StateNode {
  /** State type */
  type?: 'atomic' | 'compound' | 'parallel' | 'final' | 'history'
  /** Entry actions */
  entry?: StateAction | StateAction[]
  /** Exit actions */
  exit?: StateAction | StateAction[]
  /** Event handlers */
  on?: Record<string, Transition | Transition[]>
  /** Invoked services/actors */
  invoke?: InvokeConfig | InvokeConfig[]
  /** Nested states (for compound/parallel) */
  states?: Record<string, StateNode>
  /** Initial nested state (for compound) */
  initial?: string
  /** After delays */
  after?: Record<string | number, Transition | Transition[]>
  /** Always transitions (eventless) */
  always?: Transition | Transition[]
  /** Tags for state */
  tags?: string[]
  /** Meta information */
  meta?: Record<string, unknown>
}

export interface Transition {
  /** Target state */
  target?: string
  /** Guard condition */
  guard?: string | GuardConfig
  /** Actions to execute */
  actions?: StateAction | StateAction[]
  /** Description */
  description?: string
  /** Reenter the same state */
  reenter?: boolean
}

export interface GuardConfig {
  type: string
  params?: Record<string, unknown>
}

export type StateAction =
  | string
  | { type: string; params?: Record<string, unknown> }
  | { type: 'assign'; assignment: Record<string, unknown> | string }
  | { type: 'raise'; event: string | { type: string } }
  | { type: 'sendTo'; to: string; event: string | { type: string }; delay?: number }
  | { type: 'emit'; event: string; data?: unknown }
  | { type: 'log'; message?: string }

export interface InvokeConfig {
  /** Invoked service ID */
  id?: string
  /** Service source (function name or actor) */
  src: string | { type: string; input?: unknown }
  /** Input for the service */
  input?: unknown
  /** Events to send on done/error */
  onDone?: Transition | Transition[]
  onError?: Transition | Transition[]
  /** onSnapshot for actors */
  onSnapshot?: Transition | Transition[]
}

// =============================================================================
// Workflow History
// =============================================================================

export interface WorkflowHistoryEntry {
  timestamp: number
  event: string
  previousState: string
  currentState: string
  context?: Record<string, unknown>
  actor?: Actor
}

// =============================================================================
// Events (immutable)
// =============================================================================

/**
 * Event - immutable record of something that happened
 */
export interface Event<T = unknown> {
  id: string
  type: string
  payload: T
  source: string
  timestamp: number
  correlationId?: string
  causationId?: string
  metadata?: Record<string, unknown>
}

// =============================================================================
// Experiments (A/B testing)
// =============================================================================

export type ExperimentStatus = 'Draft' | 'Running' | 'Paused' | 'Concluded'

/**
 * Experiment - A/B testing and feature flags
 */
export interface Experiment {
  id: string
  name: string
  description?: string
  variants: Variant[]
  allocation: AllocationStrategy
  status: ExperimentStatus
  metrics?: string[]
  startedAt?: number
  concludedAt?: number
  results?: ExperimentResults
}

export interface Variant {
  id: string
  name: string
  weight: number
  config?: Record<string, unknown>
}

export interface AllocationStrategy {
  type: 'random' | 'sticky' | 'deterministic'
  seed?: string
  stickyKey?: string
}

export interface ExperimentResults {
  winner?: string
  confidence?: number
  metrics: Record<string, VariantMetrics>
}

export interface VariantMetrics {
  participants: number
  conversions?: number
  values?: number[]
  mean?: number
  variance?: number
}

// =============================================================================
// RBAC/FGA (inspired by WorkOS)
// =============================================================================

/**
 * Organization - group of users
 */
export interface Org {
  id: string
  name: string
  parentId?: string
  metadata?: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

/**
 * Role - set of permissions
 */
export interface Role {
  id: string
  name: string
  description?: string
  permissions: Permission[]
  orgId?: string
}

export interface Permission {
  resource: string
  action: string
  condition?: string
}

/**
 * User - human identity
 */
export interface User {
  id: string
  email: string
  name?: string
  roles: string[]
  orgId?: string
  metadata?: Record<string, unknown>
  createdAt: number
  updatedAt: number
  lastLoginAt?: number
}

// =============================================================================
// Agents (from autonomous-agents)
// =============================================================================

export type AgentStatus = 'Idle' | 'Working' | 'Blocked' | 'Paused' | 'Stopped'

/**
 * Agent modality - how the agent communicates
 *
 * Voice is a MODALITY, not an entity type.
 * An agent has personality + capabilities + modalities.
 */
export type AgentModality = 'text' | 'voice' | 'video' | 'multimodal'

/**
 * Agent personality - who the agent is
 */
export interface AgentPersonality {
  /** Personality name */
  name: string
  /** Persona description */
  description?: string
  /** Voice/tone characteristics */
  tone?: string
  /** Communication style */
  style?: 'formal' | 'casual' | 'professional' | 'friendly'
  /** Language */
  language?: string
  /** Custom traits */
  traits?: string[]
}

/**
 * Agent voice configuration (when modality includes voice)
 */
export interface AgentVoiceConfig {
  /** Voice provider */
  provider: 'elevenlabs' | 'playht' | 'azure' | 'google' | 'openai' | 'deepgram'
  /** Voice ID */
  voiceId: string
  /** Voice name (for reference) */
  voiceName?: string
  /** Speaking rate (0.5-2.0) */
  speed?: number
  /** Stability (for ElevenLabs) */
  stability?: number
}

/**
 * Agent - autonomous agent with personality and modalities
 *
 * Agents are distinct from their modalities:
 * - Personality: Who they are (tone, style, traits)
 * - Capabilities: What they can do (tools, skills)
 * - Modalities: How they communicate (text, voice, video)
 */
export interface Agent {
  id: string
  name: string
  type: string
  description?: string

  /** Agent personality */
  personality?: AgentPersonality

  /** Supported modalities */
  modalities: AgentModality[]

  /** Voice configuration (if voice modality enabled) */
  voiceConfig?: AgentVoiceConfig

  /** Capabilities/skills */
  capabilities: string[]

  /** Current status */
  status: AgentStatus

  /** Current task */
  currentTask?: string

  /** Agent memory */
  memory?: Record<string, unknown>

  /** Agent configuration */
  config?: AgentConfig

  /** Timestamps */
  createdAt: number
  updatedAt: number
}

export interface AgentConfig {
  model?: string
  maxIterations?: number
  timeout?: number
  tools?: string[]
  systemPrompt?: string
  /** Temperature for AI responses */
  temperature?: number
  /** Maximum tokens per response */
  maxTokens?: number
}

// =============================================================================
// Integrations & Webhooks
// =============================================================================

export type IntegrationStatus = 'Active' | 'Inactive' | 'Error' | 'Pending'

/**
 * Integration - external service connection
 */
export interface Integration {
  id: string
  type: string
  name?: string
  config: Record<string, unknown>
  credentials?: IntegrationCredentials
  status: IntegrationStatus
  lastSyncAt?: number
  error?: string
  createdAt: number
  updatedAt: number
}

export interface IntegrationCredentials {
  type: 'oauth' | 'api_key' | 'basic' | 'bearer' | 'custom'
  data: Record<string, unknown>
  expiresAt?: number
}

/**
 * Webhook - outbound event notification
 */
export interface Webhook {
  id: string
  url: string
  events: string[]
  secret?: string
  headers?: Record<string, string>
  enabled: boolean
  retryPolicy?: RetryPolicy
  lastTriggeredAt?: number
  failureCount?: number
  createdAt: number
  updatedAt: number
}

// =============================================================================
// Collection Methods (generic CRUD)
// =============================================================================

/**
 * Standard collection methods for any collection type
 */
export interface CollectionMethods<T> {
  list(options?: ListOptions): Promise<ListResult<T>>
  get(id: string): Promise<T | null>
  create(data: Omit<T, 'id'>): Promise<T>
  update(id: string, data: Partial<T>): Promise<T>
  delete(id: string): Promise<void>
  count(filter?: FilterExpression): Promise<number>
  find(filter: FilterExpression): Promise<T[]>
}

export interface ListOptions {
  limit?: number
  offset?: number
  cursor?: string
  orderBy?: string
  orderDir?: 'asc' | 'desc'
  filter?: FilterExpression
}

export interface ListResult<T> {
  items: T[]
  total?: number
  cursor?: string
  hasMore: boolean
}

export type FilterExpression =
  | { field: string; op: FilterOp; value: unknown }
  | { and: FilterExpression[] }
  | { or: FilterExpression[] }
  | { not: FilterExpression }

export type FilterOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'startsWith' | 'endsWith'
