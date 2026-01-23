/**
 * Voice AI Module
 *
 * Unified voice layer for Digital Object agents providing:
 * - Text-to-Speech (TTS) and Speech-to-Text (STT)
 * - Voice AI agents (Vapi, LiveKit, Retell, Bland)
 * - Voice sessions and call management
 * - Outbound calling campaigns
 * - WebRTC browser-based calls
 * - Mid-conversation tool calling
 *
 * @module ai/voice
 */

// =============================================================================
// TTS/STT (Text-to-Speech / Speech-to-Text)
// =============================================================================

export {
  synthesize,
  synthesizeStream,
  transcribe,
  transcribeStream,
  transcribeUrl,
  listVoices,
  cloneVoice,
} from './tts'

// =============================================================================
// Provider Abstraction
// =============================================================================

export {
  VoiceProviderFactory,
  VoiceProvider,
  VapiAdapter,
  LiveKitAdapter,
  RetellAdapter,
  BlandAdapter,
  type VoiceProviderAdapter,
  type ProviderAgentConfig,
  type ProviderAgentResult,
  type ProviderCallStatus,
  type WebhookEventType,
  type WebhookResult,
  type VoiceUseCase,
} from './providers'

// =============================================================================
// Voice Agents
// =============================================================================

export {
  VoiceAgentManager,
  VoiceAgents,
  type CreateVoiceAgentOptions,
  type UpdateVoiceAgentOptions,
  type ListVoiceAgentsOptions,
  type ListVoiceAgentsResult,
} from './agents'

// =============================================================================
// Voice Sessions
// =============================================================================

export {
  VoiceSessionManager,
  VoiceSessions,
  type StartOutboundCallOptions,
  type ListSessionsOptions,
  type ListSessionsResult,
  type SessionEventType,
  type SessionEventHandler,
  type SessionUpdate,
} from './sessions'

// =============================================================================
// Voice Tools
// =============================================================================

export {
  VoiceToolRegistry,
  VoiceTools,
  createLookupTool,
  createActionTool,
  createTransferTool,
  createEndCallTool,
  type ToolContext,
  type ToolHandler,
  type RegisterToolOptions,
  type ToolExecutionResult,
  type TransferResult,
} from './tools'

// =============================================================================
// Outbound Campaigns
// =============================================================================

export {
  VoiceCampaignManager,
  VoiceCampaigns,
  type CreateCampaignOptions,
  type UpdateCampaignOptions,
  type ListCampaignsOptions,
  type ListCampaignsResult,
  type CampaignEventType,
  type CampaignEventHandler,
} from './campaigns'

// =============================================================================
// WebRTC Sessions
// =============================================================================

export {
  WebRTCSessionManager,
  WebRTCSession,
  type CreateWebRTCSessionOptions,
  type WebRTCSessionResult,
  type WebRTCRoom,
  type WebRTCParticipant,
  type WebRTCEventType,
} from './webrtc'
