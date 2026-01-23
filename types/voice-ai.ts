/**
 * Voice AI Types - Conversational Voice Agents
 *
 * Abstraction over voice AI platforms:
 * - Vapi - Voice AI platform for building voice agents
 * - LiveKit - Real-time voice/video infrastructure
 * - Daily - WebRTC platform
 * - Retell AI - Voice agent platform
 * - Bland AI - Phone calling AI
 *
 * Enables:
 * - AI-powered phone agents
 * - Real-time voice transcription
 * - Voice-based workflows
 * - Human handoff
 */

import type { DigitalObjectRef } from './identity'

// =============================================================================
// Voice AI Providers
// =============================================================================

/**
 * Voice AI provider
 */
export type VoiceAIProvider =
  | 'vapi'        // Vapi - Voice AI agents
  | 'livekit'     // LiveKit - Real-time infrastructure
  | 'retell'      // Retell AI - Voice agents
  | 'bland'       // Bland AI - Phone AI
  | 'daily'       // Daily - WebRTC platform
  | 'elevenlabs'  // ElevenLabs - Voice synthesis
  | 'deepgram'    // Deepgram - Speech recognition

/**
 * Provider configuration
 */
export interface VoiceAIProviderConfig {
  provider: VoiceAIProvider
  apiKey: string
  /** Provider-specific configuration */
  config?: Record<string, unknown>
}

// =============================================================================
// Voice Agent Definition
// =============================================================================

/**
 * Voice agent configuration
 */
export interface VoiceAgent {
  id: string
  /** Agent name */
  name: string
  /** Provider */
  provider: VoiceAIProvider
  /** Voice configuration */
  voice: VoiceConfig
  /** Conversation configuration */
  conversation: ConversationConfig
  /** Phone integration */
  phone?: PhoneIntegration
  /** Webhook endpoints */
  webhooks?: VoiceAgentWebhooks
  /** Owner DO */
  ownerRef: DigitalObjectRef
  /** Status */
  status: 'Active' | 'Inactive' | 'Error'
  /** Created timestamp */
  createdAt: number
  /** Updated timestamp */
  updatedAt: number
}

/**
 * Voice configuration
 */
export interface VoiceConfig {
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
  /** Similarity boost (for ElevenLabs) */
  similarityBoost?: number
  /** Language */
  language?: string
  /** Custom voice model ID */
  modelId?: string
}

/**
 * Conversation configuration
 */
export interface ConversationConfig {
  /** System prompt */
  systemPrompt: string
  /** First message (agent speaks first) */
  firstMessage?: string
  /** Model for conversation */
  model: string
  /** Model provider */
  modelProvider: 'openai' | 'anthropic' | 'azure' | 'groq' | 'together'
  /** Temperature */
  temperature?: number
  /** Max tokens per response */
  maxTokens?: number
  /** Interruption handling */
  interruptionHandling?: 'Allow' | 'Wait' | 'Ignore'
  /** End call phrases */
  endCallPhrases?: string[]
  /** Tools available to agent */
  tools?: VoiceAgentTool[]
  /** Knowledge base */
  knowledgeBase?: KnowledgeBaseConfig
  /** Context window size */
  contextWindow?: number
}

/**
 * Voice agent tool (function calling)
 */
export interface VoiceAgentTool {
  /** Tool name */
  name: string
  /** Description */
  description: string
  /** Parameters schema (JSON Schema) */
  parameters: Record<string, unknown>
  /** Server URL for tool execution */
  serverUrl?: string
  /** Whether this tool can end the call */
  canEndCall?: boolean
}

/**
 * Knowledge base configuration
 */
export interface KnowledgeBaseConfig {
  /** Knowledge base ID (from provider) */
  id?: string
  /** Documents to include */
  documents?: KnowledgeDocument[]
  /** Search settings */
  searchSettings?: {
    topK?: number
    scoreThreshold?: number
  }
}

export interface KnowledgeDocument {
  id: string
  name: string
  type: 'pdf' | 'text' | 'url' | 'html'
  content?: string
  url?: string
}

/**
 * Phone integration
 */
export interface PhoneIntegration {
  /** Enabled */
  enabled: boolean
  /** Inbound number */
  inboundNumber?: string
  /** Outbound caller ID */
  outboundCallerId?: string
  /** Provider for phone */
  phoneProvider?: 'twilio' | 'telnyx' | 'vonage'
  /** Max call duration (seconds) */
  maxDuration?: number
  /** Recording enabled */
  recordCalls?: boolean
  /** Transfer settings */
  transfer?: TransferConfig
}

export interface TransferConfig {
  /** Enable human transfer */
  enabled: boolean
  /** Transfer number */
  number?: string
  /** Transfer message */
  message?: string
  /** Transfer conditions */
  conditions?: string[]
}

/**
 * Voice agent webhooks
 */
export interface VoiceAgentWebhooks {
  /** Call started */
  onCallStart?: string
  /** Call ended */
  onCallEnd?: string
  /** Transcription available */
  onTranscript?: string
  /** Tool call */
  onToolCall?: string
  /** Transfer requested */
  onTransfer?: string
  /** Error occurred */
  onError?: string
}

// =============================================================================
// Voice Calls / Sessions
// =============================================================================

/**
 * Voice session (active call with AI)
 */
export interface VoiceSession {
  id: string
  /** Agent ID */
  agentId: string
  /** Provider session/call ID */
  providerSessionId: string
  /** Call type */
  type: 'Inbound' | 'Outbound' | 'Web'
  /** Customer phone (for phone calls) */
  customerPhone?: string
  /** Agent phone (for phone calls) */
  agentPhone?: string
  /** Status */
  status: VoiceSessionStatus
  /** Start time */
  startTime: number
  /** End time */
  endTime?: number
  /** Duration (seconds) */
  duration?: number
  /** Transcript */
  transcript?: TranscriptEntry[]
  /** Recording URL */
  recordingUrl?: string
  /** Summary (AI-generated) */
  summary?: string
  /** Sentiment analysis */
  sentiment?: SentimentAnalysis
  /** Tool calls made */
  toolCalls?: ToolCallRecord[]
  /** Outcome */
  outcome?: CallOutcome
  /** Cost */
  cost?: CallCost
  /** Custom metadata */
  metadata?: Record<string, unknown>
}

export type VoiceSessionStatus =
  | 'Initializing'
  | 'Ringing'
  | 'InProgress'
  | 'Transferring'
  | 'Completed'
  | 'Failed'
  | 'NoAnswer'

/**
 * Transcript entry
 */
export interface TranscriptEntry {
  /** Speaker */
  speaker: 'Agent' | 'Customer' | 'System'
  /** Text */
  text: string
  /** Start time (ms from call start) */
  startTime: number
  /** End time */
  endTime: number
  /** Confidence score */
  confidence?: number
  /** Emotion detected */
  emotion?: string
}

/**
 * Sentiment analysis
 */
export interface SentimentAnalysis {
  /** Overall sentiment */
  overall: 'Positive' | 'Neutral' | 'Negative'
  /** Sentiment score (-1 to 1) */
  score: number
  /** Key moments */
  keyMoments?: Array<{
    time: number
    sentiment: string
    text: string
  }>
}

/**
 * Tool call record
 */
export interface ToolCallRecord {
  id: string
  /** Tool name */
  toolName: string
  /** Arguments */
  arguments: Record<string, unknown>
  /** Result */
  result?: unknown
  /** Start time */
  startTime: number
  /** End time */
  endTime?: number
  /** Success */
  success: boolean
  /** Error */
  error?: string
}

/**
 * Call outcome
 */
export interface CallOutcome {
  /** Outcome type */
  type: 'Completed' | 'Transferred' | 'Voicemail' | 'NoAnswer' | 'Busy' | 'Failed'
  /** Reason */
  reason?: string
  /** Goal achieved */
  goalAchieved?: boolean
  /** Follow-up required */
  followUpRequired?: boolean
  /** Follow-up notes */
  followUpNotes?: string
}

/**
 * Call cost breakdown
 */
export interface CallCost {
  /** Total cost (cents) */
  total: number
  /** Voice synthesis cost */
  voiceCost?: number
  /** STT cost */
  sttCost?: number
  /** LLM cost */
  llmCost?: number
  /** Phone cost */
  phoneCost?: number
  /** Provider cost */
  providerCost?: number
}

// =============================================================================
// Outbound Campaigns
// =============================================================================

/**
 * Outbound calling campaign
 */
export interface OutboundCampaign {
  id: string
  /** Campaign name */
  name: string
  /** Agent ID */
  agentId: string
  /** Contacts to call */
  contacts: CampaignContact[]
  /** Schedule */
  schedule?: CampaignSchedule
  /** Status */
  status: 'Draft' | 'Scheduled' | 'Running' | 'Paused' | 'Completed'
  /** Settings */
  settings: CampaignSettings
  /** Stats */
  stats?: CampaignStats
  /** Created timestamp */
  createdAt: number
  /** Started timestamp */
  startedAt?: number
  /** Completed timestamp */
  completedAt?: number
}

export interface CampaignContact {
  id: string
  /** Phone number */
  phone: string
  /** Name */
  name?: string
  /** Custom context for this call */
  context?: Record<string, unknown>
  /** Status */
  status: 'Pending' | 'Calling' | 'Completed' | 'Failed' | 'Skipped'
  /** Call ID (if called) */
  sessionId?: string
}

export interface CampaignSchedule {
  /** Start date */
  startDate: number
  /** End date */
  endDate?: number
  /** Calling hours (HH:MM format) */
  callingHours: {
    start: string
    end: string
  }
  /** Days of week (0=Sunday) */
  daysOfWeek: number[]
  /** Timezone */
  timezone: string
  /** Max concurrent calls */
  maxConcurrent: number
}

export interface CampaignSettings {
  /** Max attempts per contact */
  maxAttempts: number
  /** Retry delay (minutes) */
  retryDelay: number
  /** Voicemail detection */
  voicemailDetection: boolean
  /** Leave voicemail */
  leaveVoicemail?: boolean
  /** Voicemail message */
  voicemailMessage?: string
  /** Caller ID */
  callerId: string
}

export interface CampaignStats {
  totalContacts: number
  called: number
  completed: number
  transferred: number
  voicemail: number
  noAnswer: number
  failed: number
  avgDuration: number
  totalCost: number
}

// =============================================================================
// Real-time Voice (WebRTC)
// =============================================================================

/**
 * WebRTC session configuration
 */
export interface WebRTCConfig {
  /** Provider */
  provider: 'livekit' | 'daily' | 'twilio'
  /** Room name */
  roomName: string
  /** Participant identity */
  identity: string
  /** Audio-only mode */
  audioOnly?: boolean
  /** Auto-connect */
  autoConnect?: boolean
  /** Token (for joining) */
  token?: string
}

/**
 * Real-time transcription config
 */
export interface RealtimeTranscriptionConfig {
  /** Provider */
  provider: 'deepgram' | 'assemblyai' | 'whisper' | 'google'
  /** Language */
  language?: string
  /** Model */
  model?: string
  /** Interim results */
  interimResults?: boolean
  /** Punctuation */
  punctuate?: boolean
  /** Profanity filter */
  profanityFilter?: boolean
  /** Custom vocabulary */
  keywords?: string[]
}

// =============================================================================
// Voice AI Operations Interface
// =============================================================================

/**
 * Voice AI operations for a DO
 */
export interface VoiceAIOperations {
  // Provider configuration
  setProvider(config: VoiceAIProviderConfig): Promise<void>

  // Agent management
  createAgent(agent: Omit<VoiceAgent, 'id' | 'createdAt' | 'updatedAt'>): Promise<VoiceAgent>
  updateAgent(agentId: string, updates: Partial<VoiceAgent>): Promise<VoiceAgent>
  deleteAgent(agentId: string): Promise<boolean>
  listAgents(): Promise<VoiceAgent[]>

  // Calls
  startOutboundCall(agentId: string, phone: string, context?: Record<string, unknown>): Promise<VoiceSession>
  getSession(sessionId: string): Promise<VoiceSession | null>
  endSession(sessionId: string): Promise<boolean>
  listSessions(options?: { agentId?: string; status?: VoiceSessionStatus; limit?: number }): Promise<VoiceSession[]>

  // WebRTC
  createWebRTCSession(agentId: string, config?: Partial<WebRTCConfig>): Promise<{ token: string; roomUrl: string }>

  // Campaigns
  createCampaign(campaign: Omit<OutboundCampaign, 'id' | 'createdAt' | 'stats'>): Promise<OutboundCampaign>
  startCampaign(campaignId: string): Promise<OutboundCampaign>
  pauseCampaign(campaignId: string): Promise<OutboundCampaign>
  getCampaignStats(campaignId: string): Promise<CampaignStats>

  // Event handlers
  onSessionStart(handler: (session: VoiceSession) => Promise<void>): void
  onSessionEnd(handler: (session: VoiceSession) => Promise<void>): void
  onToolCall(handler: (sessionId: string, tool: ToolCallRecord) => Promise<unknown>): void
  onTransferRequested(handler: (session: VoiceSession) => Promise<TransferConfig | null>): void
}

// =============================================================================
// Note: Voice is a MODALITY, not an entity type
// =============================================================================
//
// Events for voice sessions are part of the Agent domain:
// - Agent.Session.started (with modality: 'voice')
// - Agent.Session.ended
// - Agent.Tool.called
//
// Telephony events are in observability.ts:
// - Telephony.Call.started
// - Telephony.Call.ended
//
// See types/observability.ts for the full event taxonomy
