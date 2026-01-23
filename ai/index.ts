/**
 * AI Layer Module (Epic 6)
 *
 * Unified generative AI abstraction supporting:
 * - Code: Pure code execution
 * - Generative: AI model calls
 * - Agentic: Autonomous agents
 * - Human: Human-in-the-loop
 */

import type {
  FunctionDefinition,
  TextLLMProvider,
} from '../types'

/** AI provider type alias */
export type AIProviderType = TextLLMProvider

/** AI request type */
export interface AIRequest {
  model: string
  provider: AIProviderType
  prompt: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  schema?: Record<string, unknown>
}

/** AI response type */
export interface AIResponse {
  content: string
  model: string
  provider: AIProviderType
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * AI Provider interface
 */
export interface AIProvider {
  /** Provider type */
  type: AIProviderType
  /** Generate a response */
  generate(request: AIRequest): Promise<AIResponse>
  /** Stream a response */
  stream(request: AIRequest): AsyncIterableIterator<AIResponse>
}

/**
 * AI Service options
 */
export interface AIServiceOptions {
  /** Default model */
  defaultModel?: string
  /** Default provider */
  defaultProvider?: AIProviderType
  /** API keys by provider */
  apiKeys?: Partial<Record<AIProviderType, string>>
  /** Default temperature */
  temperature?: number
  /** Default max tokens */
  maxTokens?: number
}

/**
 * AI Service - unified interface for AI operations
 */
export class AIService {
  private options: AIServiceOptions
  private providers: Map<AIProviderType, AIProvider> = new Map()

  constructor(options: AIServiceOptions = {}) {
    this.options = {
      defaultModel: 'best',
      defaultProvider: 'openai',
      temperature: 0.7,
      maxTokens: 4096,
      ...options,
    }
  }

  /**
   * Register an AI provider
   */
  registerProvider(provider: AIProvider): void {
    this.providers.set(provider.type, provider)
  }

  /**
   * Generate a response from an AI model
   */
  async generate(request: Partial<AIRequest> & { prompt: string }): Promise<AIResponse> {
    const fullRequest: AIRequest = {
      model: request.model ?? this.options.defaultModel!,
      provider: request.provider ?? this.options.defaultProvider!,
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      temperature: request.temperature ?? this.options.temperature,
      maxTokens: request.maxTokens ?? this.options.maxTokens,
      schema: request.schema,
    }

    const provider = this.providers.get(fullRequest.provider)
    if (!provider) {
      // Return a placeholder response for now
      return {
        content: `[AI Response placeholder for: ${fullRequest.prompt}]`,
        model: fullRequest.model,
        provider: fullRequest.provider,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      }
    }

    return provider.generate(fullRequest)
  }

  /**
   * Stream a response from an AI model
   */
  async *stream(
    request: Partial<AIRequest> & { prompt: string }
  ): AsyncIterableIterator<AIResponse> {
    const fullRequest: AIRequest = {
      model: request.model ?? this.options.defaultModel!,
      provider: request.provider ?? this.options.defaultProvider!,
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      temperature: request.temperature ?? this.options.temperature,
      maxTokens: request.maxTokens ?? this.options.maxTokens,
      schema: request.schema,
    }

    const provider = this.providers.get(fullRequest.provider)
    if (!provider) {
      yield {
        content: `[AI Streaming placeholder for: ${fullRequest.prompt}]`,
        model: fullRequest.model,
        provider: fullRequest.provider,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      }
      return
    }

    yield* provider.stream(fullRequest)
  }

  /**
   * Execute a function definition
   */
  async executeFunction<TInput, TOutput>(
    definition: FunctionDefinition,
    input: TInput
  ): Promise<TOutput> {
    switch (definition.type) {
      case 'code':
        return this.executeCode<TInput, TOutput>(definition.code, input)

      case 'generative':
        return this.executeGenerative<TInput, TOutput>(definition, input)

      case 'agentic':
        return this.executeAgentic<TInput, TOutput>(definition, input)

      case 'human':
        return this.executeHuman<TInput, TOutput>(definition, input)

      default:
        throw new Error(`Unknown function type: ${(definition as FunctionDefinition).type}`)
    }
  }

  private async executeCode<TInput, TOutput>(
    code: string,
    input: TInput
  ): Promise<TOutput> {
    // In a real implementation, this would use a sandboxed execution environment
    const fn = new globalThis.Function('input', code)
    return fn(input) as TOutput
  }

  private async executeGenerative<TInput, TOutput>(
    definition: Extract<FunctionDefinition, { type: 'generative' }>,
    input: TInput
  ): Promise<TOutput> {
    const prompt = definition.prompt.replace(
      /\{\{(\w+)\}\}/g,
      (_, key) => String((input as Record<string, unknown>)[key] ?? '')
    )

    const response = await this.generate({
      model: definition.model,
      prompt,
      schema: definition.schema,
    })

    // Parse structured output if schema provided
    if (definition.schema) {
      try {
        return JSON.parse(response.content) as TOutput
      } catch {
        return response.content as unknown as TOutput
      }
    }

    return response.content as unknown as TOutput
  }

  private async executeAgentic<TInput, TOutput>(
    definition: Extract<FunctionDefinition, { type: 'agentic' }>,
    input: TInput
  ): Promise<TOutput> {
    // In a real implementation, this would invoke an autonomous agent
    return {
      agent: definition.agent,
      goal: definition.goal,
      input,
      status: 'pending',
    } as unknown as TOutput
  }

  private async executeHuman<TInput, TOutput>(
    definition: Extract<FunctionDefinition, { type: 'human' }>,
    input: TInput
  ): Promise<TOutput> {
    // In a real implementation, this would create a human task
    return {
      assignee: definition.assignee,
      instructions: definition.instructions,
      input,
      status: 'pending',
    } as unknown as TOutput
  }
}

/**
 * Create an AI service
 */
export function createAIService(options?: AIServiceOptions): AIService {
  return new AIService(options)
}

// Re-export types from types/ai for convenience
export type {
  TextLLMProvider,
  EmbeddingProvider,
  ImageProvider,
  VideoProvider,
  VoiceSynthesisProvider,
  SpeechRecognitionProvider,
  ModelCapabilities,
  ModelCostTier,
  ModelSpeedTier,
  ModelInfo,
  ModelCharacteristic,
  ModelSelector,
  ModelConstraints,
  TextGenerationOptions,
  TextGenerationResult,
  ChatMessage,
  AITool,
  ToolCall,
  TokenUsage,
  EmbeddingOptions,
  EmbeddingResult,
  BatchEmbeddingResult,
  ImageGenerationOptions,
  ImageGenerationResult,
  VideoGenerationOptions,
  VideoGenerationResult,
  VoiceSynthesisOptions,
  VoiceSynthesisResult,
  SpeechRecognitionOptions,
  TranscriptionResult,
  AIGatewayConfig,
  AIGatewayUsage,
  AIOperations,
  AIEvent,
} from '../types/ai'

// =============================================================================
// Voice AI Module (TTS/STT and Voice Agents)
// =============================================================================

export {
  // TTS/STT
  synthesize,
  synthesizeStream,
  transcribe,
  transcribeStream,
  transcribeUrl,
  listVoices,
  cloneVoice,

  // Provider Abstraction
  VoiceProviderFactory,
  VoiceProvider,
  VapiAdapter,
  LiveKitAdapter,
  RetellAdapter,
  BlandAdapter,

  // Voice Agents
  VoiceAgentManager,
  VoiceAgents,

  // Voice Sessions
  VoiceSessionManager,
  VoiceSessions,

  // Voice Tools
  VoiceToolRegistry,
  VoiceTools,
  createLookupTool,
  createActionTool,
  createTransferTool,
  createEndCallTool,

  // Outbound Campaigns
  VoiceCampaignManager,
  VoiceCampaigns,

  // WebRTC Sessions
  WebRTCSessionManager,
  WebRTCSession,

  // Types
  type VoiceProviderAdapter,
  type ProviderAgentConfig,
  type ProviderAgentResult,
  type ProviderCallStatus,
  type WebhookEventType,
  type WebhookResult,
  type VoiceUseCase,
  type CreateVoiceAgentOptions,
  type UpdateVoiceAgentOptions,
  type ListVoiceAgentsOptions,
  type ListVoiceAgentsResult,
  type StartOutboundCallOptions,
  type ListSessionsOptions,
  type ListSessionsResult,
  type SessionEventType,
  type SessionEventHandler,
  type SessionUpdate,
  type ToolContext,
  type ToolHandler,
  type RegisterToolOptions,
  type ToolExecutionResult,
  type TransferResult,
  type CreateCampaignOptions,
  type UpdateCampaignOptions,
  type ListCampaignsOptions,
  type ListCampaignsResult,
  type CampaignEventType,
  type CampaignEventHandler,
  type CreateWebRTCSessionOptions,
  type WebRTCSessionResult,
  type WebRTCRoom,
  type WebRTCParticipant,
  type WebRTCEventType,
} from './voice'

// =============================================================================
// Agents Module - Excluded from 0.0.1 (depends on workers module)
// =============================================================================

// export {
//   // Agent Registry
//   AgentRegistry,
//
//   // Voice Functions
//   enableVoice,
//   hasVoice,
//   getVoiceProvider,
//   getAgentPhone,
//
//   // Agent Templates
//   createSupportAgent,
//   createSalesAgent,
//   createSchedulingAgent,
//
//   // Voice Provider Factory
//   VoiceProviderFactory,
//
//   // Re-exports from workers
//   createAgent,
//   defineAgent,
//   AgentBuilder,
//   AgentManager,
//   getAgentManager,
//
//   // Types
//   type Agent,
//   type ModelSelection,
//   type VoiceModality,
//   type AgentGuardrails,
//   type WorkerChannels,
//   type SlackAccount,
//   type DiscordAccount,
//   type TeamsAccount,
//   type GitHubAccount,
//   type WorkerCapabilities,
//   type CapabilityTier,
//   type WorkerTool,
//   type WorkerStatus,
//   type CreateAgentOptions,
//   type VoiceProviderAdapter,
//   type ProviderAgentConfig,
//   type ProviderAgentResult,
//   type ProviderCallStatus,
//   type WebhookEventType,
//   type WebhookResult,
//   type VoiceUseCase,
// } from './agents'
