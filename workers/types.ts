/**
 * Digital Worker Types
 *
 * Unified interface for humans and agents. Both can have communication channels
 * (email, phone, slack, etc.) and capabilities. The digital-worker pattern
 * treats humans and AI agents as interchangeable workers in workflows.
 *
 * @module workers/types
 */

// =============================================================================
// Worker Identity
// =============================================================================

/**
 * Worker type
 */
export type WorkerType = 'human' | 'agent'

/**
 * Base worker interface - shared by humans and agents
 */
export interface DigitalWorker {
  /** Unique worker identifier */
  id: string
  /** Worker type */
  type: WorkerType
  /** Display name */
  name: string
  /** Description or bio */
  description?: string
  /** Avatar URL */
  avatar?: string
  /** Worker status */
  status: WorkerStatus
  /** Communication channels this worker can use */
  channels: WorkerChannels
  /** Capabilities and skills */
  capabilities: WorkerCapabilities
  /** Tools this worker can use */
  tools: WorkerTool[]
  /** Timezone (for humans, scheduling) */
  timezone?: string
  /** Created timestamp */
  createdAt: Date
  /** Updated timestamp */
  updatedAt: Date
  /** Custom metadata */
  metadata?: Record<string, unknown>
}

/**
 * Worker status
 */
export type WorkerStatus = 'active' | 'inactive' | 'busy' | 'away' | 'offline'

// =============================================================================
// Communication Channels
// =============================================================================

/**
 * Communication channels a worker can use
 */
export interface WorkerChannels {
  /** Email address */
  email?: string
  /** Phone number (E.164 format) */
  phone?: string
  /** Slack account */
  slack?: SlackAccount
  /** Discord account */
  discord?: DiscordAccount
  /** Microsoft Teams account */
  teams?: TeamsAccount
  /** GitHub account */
  github?: GitHubAccount
  /** Additional custom channels */
  custom?: Record<string, unknown>
}

/**
 * Slack account connection
 */
export interface SlackAccount {
  /** Slack user ID */
  userId: string
  /** Slack workspace ID */
  teamId: string
  /** Workspace name */
  teamName?: string
  /** Bot token (for agents) */
  botToken?: string
}

/**
 * Discord account connection
 */
export interface DiscordAccount {
  /** Discord user ID */
  userId: string
  /** Guild ID */
  guildId: string
  /** Guild name */
  guildName?: string
  /** Bot token (for agents) */
  botToken?: string
}

/**
 * Microsoft Teams account connection
 */
export interface TeamsAccount {
  /** Teams user ID */
  userId: string
  /** Tenant ID */
  tenantId: string
  /** Team ID */
  teamId?: string
}

/**
 * GitHub account connection
 */
export interface GitHubAccount {
  /** GitHub username */
  username: string
  /** GitHub user ID */
  userId?: number
  /** Access token */
  accessToken?: string
}

// =============================================================================
// Capabilities
// =============================================================================

/**
 * Worker capabilities
 */
export interface WorkerCapabilities {
  /** Capability tier (1=code, 2=generative, 3=agentic, 4=human) */
  tier: CapabilityTier
  /** Specific skills/capabilities */
  skills: string[]
  /** Languages the worker can communicate in */
  languages?: string[]
  /** Domain expertise */
  domains?: string[]
  /** Maximum concurrent tasks */
  maxConcurrency?: number
  /** Average response time */
  avgResponseTime?: number
  /** Cost per task (for agents, in credits/tokens) */
  costPerTask?: number
}

/**
 * Capability tier (from CLAUDE.md)
 */
export type CapabilityTier =
  | 1 // code - pure computation
  | 2 // generative - AI model calls
  | 3 // agentic - autonomous agent
  | 4 // human - human-in-the-loop

// =============================================================================
// Tools
// =============================================================================

/**
 * Tools available to a worker
 */
export type WorkerTool =
  | 'browser'
  | 'computer'
  | 'search'
  | 'code'
  | 'file'
  | 'database'
  | 'api'
  | string

// =============================================================================
// Human Worker
// =============================================================================

/**
 * Human worker - extends DigitalWorker with human-specific fields
 */
export interface Human extends DigitalWorker {
  type: 'human'
  /** Work schedule/availability */
  availability?: WorkSchedule
  /** Manager (another worker ID) */
  managerId?: string
  /** Team membership */
  teams?: string[]
  /** Job title */
  title?: string
  /** Department */
  department?: string
  /** Location */
  location?: string
}

/**
 * Work schedule
 */
export interface WorkSchedule {
  /** Working hours by day (0=Sunday) */
  hours?: Record<number, { start: string; end: string }>
  /** Timezone */
  timezone: string
  /** Days off */
  daysOff?: number[]
  /** Out of office periods */
  outOfOffice?: Array<{ start: Date; end: Date; reason?: string }>
}

// =============================================================================
// Agent Worker
// =============================================================================

/**
 * Agent worker - extends DigitalWorker with AI-specific fields
 */
export interface Agent extends DigitalWorker {
  type: 'agent'
  /** Model selection characteristics */
  model: ModelSelection
  /** System prompt defining the agent's personality/behavior */
  systemPrompt: string
  /** Voice modality configuration (optional) */
  voice?: VoiceModality
  /** Temperature for generation */
  temperature?: number
  /** Maximum tokens per response */
  maxTokens?: number
  /** Knowledge base IDs */
  knowledgeBases?: string[]
  /** Tool configurations */
  toolConfigs?: Record<string, unknown>
  /** Guardrails/safety settings */
  guardrails?: AgentGuardrails
}

/**
 * Model selection (characteristics, not specific models)
 */
export type ModelSelection =
  | 'best' // Quality/accuracy optimized
  | 'fast' // Latency optimized
  | 'cost' // Cost optimized
  | 'reasoning' // Complex reasoning tasks
  | 'code' // Code generation/analysis
  | 'vision' // Image understanding
  | 'long' // Long context
  | string // Combo like 'fast,best' or 'code,fast'

/**
 * Voice modality configuration
 */
export interface VoiceModality {
  /** Voice is enabled */
  enabled: boolean
  /** Voice provider */
  provider?: 'vapi' | 'livekit' | 'retell' | 'bland'
  /** Voice configuration */
  config?: {
    /** Voice ID */
    voiceId?: string
    /** Voice provider (elevenlabs, etc.) */
    voiceProvider?: string
    /** Speaking speed */
    speed?: number
    /** Language */
    language?: string
  }
  /** Phone integration */
  phone?: {
    /** Inbound number */
    inboundNumber?: string
    /** Outbound caller ID */
    outboundCallerId?: string
    /** Max call duration */
    maxDuration?: number
    /** Record calls */
    recordCalls?: boolean
  }
}

/**
 * Agent guardrails
 */
export interface AgentGuardrails {
  /** Topics to avoid */
  blockedTopics?: string[]
  /** Required disclosures */
  disclosures?: string[]
  /** Content filters */
  contentFilters?: string[]
  /** Maximum spend per task */
  maxSpendPerTask?: number
  /** Require human approval for certain actions */
  requireApproval?: string[]
}

// =============================================================================
// Worker Operations
// =============================================================================

/**
 * Worker assignment
 */
export interface WorkerAssignment {
  /** Assignment ID */
  id: string
  /** Worker ID */
  workerId: string
  /** Task ID */
  taskId: string
  /** Assignment status */
  status: 'assigned' | 'accepted' | 'in_progress' | 'completed' | 'rejected'
  /** Assigned at */
  assignedAt: Date
  /** Accepted at */
  acceptedAt?: Date
  /** Completed at */
  completedAt?: Date
  /** Result/output */
  result?: unknown
}

/**
 * Worker message
 */
export interface WorkerMessage {
  /** Message ID */
  id: string
  /** From worker ID */
  from: string
  /** To worker ID */
  to: string
  /** Channel used */
  channel: keyof WorkerChannels | 'internal'
  /** Message content */
  content: string
  /** Attachments */
  attachments?: Array<{ name: string; url: string; type: string }>
  /** Sent at */
  sentAt: Date
  /** Read at */
  readAt?: Date
}

// =============================================================================
// Worker Registry
// =============================================================================

/**
 * Worker query options
 */
export interface WorkerQueryOptions {
  /** Filter by type */
  type?: WorkerType
  /** Filter by status */
  status?: WorkerStatus
  /** Filter by capability tier */
  tier?: CapabilityTier
  /** Filter by skills */
  skills?: string[]
  /** Filter by channel availability */
  channel?: keyof WorkerChannels
  /** Pagination */
  limit?: number
  offset?: number
}
