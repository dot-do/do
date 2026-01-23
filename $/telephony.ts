/**
 * Telephony Context Implementation
 *
 * Provides phone call and voice AI operations.
 * Abstracts over telephony providers (Twilio, Telnyx, etc.) and
 * voice AI platforms (Vapi, LiveKit, etc.).
 *
 * @example
 * ```typescript
 * // Make a call
 * await $.call('+1234567890')`discuss ${topic} and schedule follow-up`
 *
 * // Create a voice agent
 * const agent = await $.voice.agent`sales assistant for ${product}`
 *
 * // Run an outbound campaign
 * const campaign = await $.voice.campaign(contacts, agent.agentId)
 * ```
 *
 * @module context/telephony
 */

import type {
  CallContext,
  VoiceContext,
  TaggedTemplate,
} from '../types/context'
import type { DOEnvironment } from './index'
import { interpolateTemplate } from './proxy'

/**
 * Internal context state
 */
interface ContextState {
  env: DOEnvironment
}

/**
 * Call result
 */
interface CallResult {
  callId: string
}

/**
 * Voice agent result
 */
interface VoiceAgentResult {
  agentId: string
  phone?: string
}

/**
 * Voice session result
 */
interface VoiceSessionResult {
  sessionId: string
  token: string
}

/**
 * Campaign result
 */
interface CampaignResult {
  campaignId: string
}

// =============================================================================
// Call Context
// =============================================================================

/**
 * Make an outbound phone call
 *
 * @param state - Context state
 * @param to - Phone number (E.164)
 * @param context - Call context/script
 * @returns Call result
 */
async function makeCall(
  state: ContextState,
  to: string,
  context: string
): Promise<CallResult> {
  // TODO: Implement actual call via Twilio/Telnyx
  console.log(`[Call] Calling ${to}: ${context}`)
  return { callId: `call-${Date.now()}` }
}

/**
 * Make an outbound call with explicit options
 *
 * @param state - Context state
 * @param options - Call options
 * @returns Call result
 */
async function makeCallWithOptions(
  state: ContextState,
  options: { from: string; to: string; twiml?: string }
): Promise<CallResult> {
  // TODO: Implement actual call
  console.log(`[Call] Calling ${options.to} from ${options.from}`)
  if (options.twiml) {
    console.log(`[Call] TwiML: ${options.twiml}`)
  }
  return { callId: `call-${Date.now()}` }
}

/**
 * Create the Call Context
 *
 * @param state - Internal context state
 * @returns CallContext implementation
 */
export function createCallContext(state: ContextState): CallContext {
  /**
   * Main call function - returns tagged template for context
   * Usage: $.call('+1234567890')`discuss ${topic}`
   */
  const call = ((phone: string): TaggedTemplate<CallResult> => {
    return ((strings: TemplateStringsArray, ...values: unknown[]): Promise<CallResult> => {
      const context = interpolateTemplate(strings, values)
      return makeCall(state, phone, context)
    }) as TaggedTemplate<CallResult>
  }) as CallContext

  /**
   * Make call with explicit options
   * Usage: $.call.make({ from: '+1...', to: '+1...', twiml: '...' })
   */
  call.make = (options: { from: string; to: string; twiml?: string }): Promise<CallResult> => {
    return makeCallWithOptions(state, options)
  }

  return call
}

// =============================================================================
// Voice Context
// =============================================================================

/**
 * Create a voice AI agent
 *
 * @param state - Context state
 * @param description - Agent description/prompt
 * @returns Voice agent result
 */
async function createVoiceAgent(
  state: ContextState,
  description: string
): Promise<VoiceAgentResult> {
  // TODO: Implement voice agent creation via Vapi/LiveKit
  console.log(`[Voice] Creating agent: ${description}`)
  return {
    agentId: `agent-${Date.now()}`,
    phone: '+1234567890', // Provisioned number
  }
}

/**
 * Start a voice session
 *
 * @param state - Context state
 * @param agentId - Agent ID
 * @returns Session result
 */
async function startVoiceSession(
  state: ContextState,
  agentId: string
): Promise<VoiceSessionResult> {
  // TODO: Implement voice session start
  console.log(`[Voice] Starting session for agent ${agentId}`)
  return {
    sessionId: `session-${Date.now()}`,
    token: `token-${Date.now()}`,
  }
}

/**
 * Start an outbound voice campaign
 *
 * @param state - Context state
 * @param contacts - Array of phone numbers
 * @param agentId - Agent ID
 * @returns Campaign result
 */
async function startCampaign(
  state: ContextState,
  contacts: string[],
  agentId: string
): Promise<CampaignResult> {
  // TODO: Implement campaign creation
  console.log(`[Voice] Creating campaign for ${contacts.length} contacts with agent ${agentId}`)
  return { campaignId: `campaign-${Date.now()}` }
}

/**
 * Create the Voice Context
 *
 * @param state - Internal context state
 * @returns VoiceContext implementation
 */
export function createVoiceContext(state: ContextState): VoiceContext {
  return {
    /**
     * Create voice agent with tagged template
     * Usage: $.voice.agent`sales assistant for ${product}`
     */
    agent: ((strings: TemplateStringsArray, ...values: unknown[]): Promise<VoiceAgentResult> => {
      const description = interpolateTemplate(strings, values)
      return createVoiceAgent(state, description)
    }) as TaggedTemplate<VoiceAgentResult>,

    /**
     * Start a voice session
     * Usage: $.voice.session(agentId)
     */
    session: (agentId: string): Promise<VoiceSessionResult> => {
      return startVoiceSession(state, agentId)
    },

    /**
     * Start an outbound campaign
     * Usage: $.voice.campaign(contacts, agentId)
     */
    campaign: (contacts: string[], agentId: string): Promise<CampaignResult> => {
      return startCampaign(state, contacts, agentId)
    },
  }
}

// =============================================================================
// Telephony Utilities
// =============================================================================

/**
 * Validate phone number (E.164 format)
 *
 * @param phone - Phone number to validate
 * @returns Whether the phone number is valid
 */
export function isValidPhoneNumber(phone: string): boolean {
  // E.164: + followed by 1-15 digits
  return /^\+[1-9]\d{1,14}$/.test(phone)
}

/**
 * Format phone number to E.164
 *
 * @param phone - Phone number to format
 * @param defaultCountryCode - Default country code (e.g., '1' for US)
 * @returns Formatted phone number or null if invalid
 */
export function formatPhoneNumber(phone: string, defaultCountryCode = '1'): string | null {
  // Remove all non-digits except leading +
  const cleaned = phone.replace(/[^\d+]/g, '')

  // If already in E.164 format
  if (cleaned.startsWith('+')) {
    return isValidPhoneNumber(cleaned) ? cleaned : null
  }

  // Add default country code
  const withCountry = `+${defaultCountryCode}${cleaned}`
  return isValidPhoneNumber(withCountry) ? withCountry : null
}

/**
 * Common voice IDs for TTS
 */
export const VOICE_IDS = {
  // ElevenLabs voices
  elevenlabs: {
    rachel: '21m00Tcm4TlvDq8ikWAM',
    adam: 'pNInz6obpgDQGcFmaJgB',
    sam: 'yoZ06aMxZJJ28mfd3POQ',
    emily: 'LcfcDJNUP1GQjkzn1xUU',
    elli: 'MF3mGyEYCl7XYWbV9V6O',
  },
  // OpenAI voices
  openai: {
    alloy: 'alloy',
    echo: 'echo',
    fable: 'fable',
    onyx: 'onyx',
    nova: 'nova',
    shimmer: 'shimmer',
  },
} as const
