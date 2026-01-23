/**
 * AI Types - Unified Generative AI Abstraction
 *
 * Multi-modal AI capabilities:
 * - Text LLM (via OpenRouter / Vercel AI SDK / Cloudflare AI Gateway)
 * - Voice (synthesis + transcription)
 * - Embeddings (vector representations)
 * - Image (generation + analysis)
 * - Video (generation)
 *
 * Routing through Cloudflare AI Gateway for:
 * - Rate limiting
 * - Caching
 * - Cost tracking
 * - Observability
 */

// =============================================================================
// AI Providers
// =============================================================================

/**
 * Text LLM providers
 */
export type TextLLMProvider =
  | 'openai'        // GPT-4, GPT-4o, o1, o3
  | 'anthropic'     // Claude 3.5, Claude Opus 4, Haiku
  | 'google'        // Gemini 1.5, Gemini 2.0
  | 'groq'          // Fast inference
  | 'mistral'       // Mistral Large, Codestral
  | 'perplexity'    // Search-augmented
  | 'deepseek'      // DeepSeek
  | 'cerebras'      // Cerebras
  | 'fireworks'     // Fireworks AI
  | 'together'      // Together AI
  | 'xai'           // xAI Grok
  | 'cohere'        // Cohere
  | 'bedrock'       // AWS Bedrock
  | 'azure'         // Azure OpenAI
  | 'cloudflare'    // Workers AI
  | 'openrouter'    // Multi-provider routing
  | 'ollama'        // Local models

/**
 * Embedding providers
 */
export type EmbeddingProvider =
  | 'openai'        // text-embedding-3-small/large, ada-002
  | 'cohere'        // embed-v3
  | 'mistral'       // mistral-embed
  | 'google'        // text-embedding-004
  | 'voyage'        // voyage-3
  | 'cloudflare'    // bge-* models

/**
 * Image generation providers
 */
export type ImageProvider =
  | 'openai'        // DALL-E 3
  | 'stability'     // Stable Diffusion
  | 'midjourney'    // Midjourney
  | 'replicate'     // Various models
  | 'fal'           // FAL AI
  | 'leonardo'      // Leonardo AI
  | 'ideogram'      // Ideogram
  | 'flux'          // Flux models

/**
 * Video generation providers
 */
export type VideoProvider =
  | 'luma'          // Luma Dream Machine
  | 'runway'        // Runway Gen-3
  | 'pika'          // Pika Labs
  | 'replicate'     // Various video models
  | 'heygen'        // Avatar videos

/**
 * Voice synthesis providers
 */
export type VoiceSynthesisProvider =
  | 'elevenlabs'    // Industry-leading quality
  | 'playht'        // PlayHT
  | 'azure'         // Azure Speech
  | 'google'        // Google TTS
  | 'openai'        // OpenAI TTS
  | 'deepgram'      // Deepgram Aura
  | 'cartesia'      // Cartesia

/**
 * Speech recognition providers
 */
export type SpeechRecognitionProvider =
  | 'deepgram'      // Real-time + batch
  | 'assemblyai'    // AssemblyAI
  | 'whisper'       // OpenAI Whisper
  | 'google'        // Google STT
  | 'azure'         // Azure Speech

// =============================================================================
// Model Configuration
// =============================================================================

/**
 * Model capability flags
 */
export interface ModelCapabilities {
  /** Supports function/tool calling */
  functionCalling: boolean
  /** Supports vision/image input */
  vision: boolean
  /** Supports JSON mode output */
  jsonMode: boolean
  /** Supports streaming */
  streaming: boolean
  /** Supports system messages */
  systemMessages: boolean
  /** Context window size (tokens) */
  contextWindow: number
  /** Max output tokens */
  maxOutput: number
}

/**
 * Model cost tier (for routing decisions)
 */
export type ModelCostTier = 'Free' | 'Cheap' | 'Standard' | 'Premium' | 'Expensive'

/**
 * Model speed tier
 */
export type ModelSpeedTier = 'Instant' | 'Fast' | 'Standard' | 'Slow'

/**
 * Model metadata
 */
export interface ModelInfo {
  id: string
  provider: TextLLMProvider
  name: string
  capabilities: ModelCapabilities
  costTier: ModelCostTier
  speedTier: ModelSpeedTier
  inputCostPer1k?: number   // Cost per 1K input tokens
  outputCostPer1k?: number  // Cost per 1K output tokens
}

/**
 * Model characteristic for selection
 * Single characteristic or comma-separated priority (e.g., "fast,best" or "best,cost")
 */
export type ModelCharacteristic =
  | 'fast'          // Fastest available
  | 'cost'          // Cheapest option
  | 'best'          // Highest quality
  | 'reasoning'     // Best for reasoning tasks
  | 'vision'        // Best vision model
  | 'code'          // Best for code generation
  | 'long'          // Longest context window

/**
 * Model selection - single characteristic or priority combo
 *
 * Examples:
 * - "best" - highest quality model
 * - "fast" - lowest latency
 * - "cost" - cheapest option
 * - "fast,best" - fastest model that's also high quality
 * - "best,cost" - best quality without crazy expense
 * - "code,fast" - best code model with lowest latency
 */
export type ModelSelector = ModelCharacteristic | `${ModelCharacteristic},${ModelCharacteristic}`

/**
 * Model constraints for fine-grained control
 */
export interface ModelConstraints {
  /** Maximum latency in milliseconds */
  maxLatency?: number
  /** Maximum cost per 1M tokens (input + output) */
  maxCost?: number
  /** Minimum quality score (0-1) */
  minQuality?: number
  /** Required capabilities */
  requires?: (keyof ModelCapabilities)[]
}

// =============================================================================
// Text Generation
// =============================================================================

/**
 * Text generation options
 */
export interface TextGenerationOptions {
  /** Model selector - characteristic, priority combo, or specific model ID */
  model?: ModelSelector | string
  /** Additional constraints for model selection */
  constraints?: ModelConstraints
  /** Temperature (0-2) */
  temperature?: number
  /** Max tokens to generate */
  maxTokens?: number
  /** Top P sampling */
  topP?: number
  /** Top K sampling */
  topK?: number
  /** Frequency penalty */
  frequencyPenalty?: number
  /** Presence penalty */
  presencePenalty?: number
  /** Stop sequences */
  stop?: string[]
  /** JSON mode */
  jsonMode?: boolean
  /** Stream response */
  stream?: boolean
  /** Tools/functions available */
  tools?: AITool[]
  /** System prompt */
  system?: string
  /** Seed for reproducibility */
  seed?: number
}

/**
 * AI tool/function definition
 */
export interface AITool {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema
}

/**
 * Chat message
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ContentPart[]
  name?: string
  toolCallId?: string
  toolCalls?: ToolCall[]
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string }
  | { type: 'image'; base64: string; mediaType: string }

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

/**
 * Text generation result
 */
export interface TextGenerationResult {
  text: string
  finishReason: 'Stop' | 'Length' | 'ToolCalls' | 'ContentFilter'
  toolCalls?: ToolCall[]
  usage: TokenUsage
  model: string
  latencyMs: number
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

// =============================================================================
// Embeddings
// =============================================================================

/**
 * Embedding options
 */
export interface EmbeddingOptions {
  /** Model ID */
  model?: string
  /** Provider */
  provider?: EmbeddingProvider
  /** Dimensions (for models that support it) */
  dimensions?: number
  /** Encoding format */
  encodingFormat?: 'float' | 'base64'
}

/**
 * Embedding result
 */
export interface EmbeddingResult {
  /** Vector embedding */
  embedding: number[]
  /** Index in batch */
  index: number
  /** Model used */
  model: string
  /** Dimensions */
  dimensions: number
}

/**
 * Batch embedding result
 */
export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[]
  usage: { totalTokens: number }
  model: string
}

// =============================================================================
// Image Generation
// =============================================================================

/**
 * Image generation options
 */
export interface ImageGenerationOptions {
  /** Model/provider */
  model?: string
  provider?: ImageProvider
  /** Image size */
  size?: '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024'
  /** Quality */
  quality?: 'Standard' | 'HD'
  /** Style */
  style?: 'Vivid' | 'Natural'
  /** Number of images */
  n?: number
  /** Response format */
  responseFormat?: 'url' | 'base64Json'
  /** Negative prompt */
  negativePrompt?: string
  /** Seed */
  seed?: number
}

/**
 * Generated image
 */
export interface GeneratedImage {
  url?: string
  base64?: string
  revisedPrompt?: string
}

/**
 * Image generation result
 */
export interface ImageGenerationResult {
  images: GeneratedImage[]
  model: string
  latencyMs: number
}

// =============================================================================
// Image Analysis (Vision)
// =============================================================================

/**
 * Image analysis options
 */
export interface ImageAnalysisOptions {
  /** Model */
  model?: string
  /** Detail level */
  detail?: 'Low' | 'High' | 'Auto'
  /** Max tokens for response */
  maxTokens?: number
}

/**
 * Image input
 */
export type ImageInput =
  | { url: string }
  | { base64: string; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' }

// =============================================================================
// Video Generation
// =============================================================================

/**
 * Video generation options
 */
export interface VideoGenerationOptions {
  /** Model/provider */
  model?: string
  provider?: VideoProvider
  /** Duration in seconds */
  duration?: number
  /** Aspect ratio */
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3'
  /** Resolution */
  resolution?: '720p' | '1080p' | '4k'
  /** FPS */
  fps?: number
  /** Style preset */
  style?: string
  /** Negative prompt */
  negativePrompt?: string
  /** Seed */
  seed?: number
  /** Starting image */
  startImage?: ImageInput
  /** Ending image */
  endImage?: ImageInput
}

/**
 * Video generation result
 */
export interface VideoGenerationResult {
  url: string
  duration: number
  width: number
  height: number
  model: string
  latencyMs: number
}

// =============================================================================
// Voice Synthesis (TTS)
// =============================================================================

/**
 * Voice synthesis options
 */
export interface VoiceSynthesisOptions {
  /** Provider */
  provider?: VoiceSynthesisProvider
  /** Voice ID */
  voice: string
  /** Model */
  model?: string
  /** Speed (0.5-2.0) */
  speed?: number
  /** Pitch adjustment */
  pitch?: number
  /** Output format */
  format?: 'mp3' | 'wav' | 'ogg' | 'pcm'
  /** Sample rate */
  sampleRate?: number
  /** Stability (ElevenLabs) */
  stability?: number
  /** Similarity boost (ElevenLabs) */
  similarityBoost?: number
}

/**
 * Voice synthesis result
 */
export interface VoiceSynthesisResult {
  audio: ArrayBuffer
  format: string
  duration: number
  characters: number
  model: string
}

// =============================================================================
// Speech Recognition (STT)
// =============================================================================

/**
 * Speech recognition options
 */
export interface SpeechRecognitionOptions {
  /** Provider */
  provider?: SpeechRecognitionProvider
  /** Model */
  model?: string
  /** Language (BCP-47) */
  language?: string
  /** Enable punctuation */
  punctuate?: boolean
  /** Enable profanity filter */
  profanityFilter?: boolean
  /** Enable diarization (speaker detection) */
  diarize?: boolean
  /** Custom vocabulary */
  keywords?: string[]
  /** Return interim results (streaming) */
  interimResults?: boolean
}

/**
 * Transcription result
 */
export interface TranscriptionResult {
  text: string
  words?: TranscriptionWord[]
  confidence: number
  duration: number
  language?: string
  speakers?: SpeakerSegment[]
}

export interface TranscriptionWord {
  word: string
  start: number
  end: number
  confidence: number
  speaker?: number
}

export interface SpeakerSegment {
  speaker: number
  start: number
  end: number
  text: string
}

// =============================================================================
// Cloudflare AI Gateway
// =============================================================================

/**
 * AI Gateway configuration
 */
export interface AIGatewayConfig {
  /** Gateway ID */
  gatewayId: string
  /** Account ID */
  accountId: string
  /** Enable caching */
  cacheEnabled?: boolean
  /** Cache TTL */
  cacheTtl?: number
  /** Rate limiting */
  rateLimit?: {
    requestsPerMinute: number
    tokensPerMinute?: number
  }
  /** Log requests */
  logRequests?: boolean
  /** Retry on error */
  retryOnError?: boolean
  /** Fallback providers */
  fallbackProviders?: TextLLMProvider[]
}

/**
 * AI Gateway usage tracking
 */
export interface AIGatewayUsage {
  requestId: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  cached: boolean
  cost: number
  timestamp: number
}

// =============================================================================
// AI Operations Interface
// =============================================================================

/**
 * Unified AI operations for a DO
 */
export interface AIOperations {
  // Text generation
  generate(prompt: string, options?: TextGenerationOptions): Promise<TextGenerationResult>
  chat(messages: ChatMessage[], options?: TextGenerationOptions): Promise<TextGenerationResult>
  streamGenerate(prompt: string, options?: TextGenerationOptions): AsyncIterable<string>
  streamChat(messages: ChatMessage[], options?: TextGenerationOptions): AsyncIterable<string>

  // Structured output
  generateObject<T>(prompt: string, schema: unknown, options?: TextGenerationOptions): Promise<T>
  extractData<T>(text: string, schema: unknown, options?: TextGenerationOptions): Promise<T>

  // Embeddings
  embed(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult>
  embedBatch(texts: string[], options?: EmbeddingOptions): Promise<BatchEmbeddingResult>

  // Image
  generateImage(prompt: string, options?: ImageGenerationOptions): Promise<ImageGenerationResult>
  analyzeImage(image: ImageInput, prompt: string, options?: ImageAnalysisOptions): Promise<string>

  // Video
  generateVideo(prompt: string, options?: VideoGenerationOptions): Promise<VideoGenerationResult>

  // Voice
  synthesize(text: string, options: VoiceSynthesisOptions): Promise<VoiceSynthesisResult>
  transcribe(audio: ArrayBuffer, options?: SpeechRecognitionOptions): Promise<TranscriptionResult>
  transcribeStream(audioStream: ReadableStream, options?: SpeechRecognitionOptions): AsyncIterable<TranscriptionResult>

  // Configuration
  setGateway(config: AIGatewayConfig): void
  getUsage(startDate?: number, endDate?: number): Promise<AIGatewayUsage[]>
}

// =============================================================================
// AI Events (Observability)
// =============================================================================

/**
 * AI events for observability
 */
export type AIEvent =
  | { type: 'ai:generationStarted'; payload: { model: string; promptTokens: number } }
  | { type: 'ai:generationCompleted'; payload: { model: string; totalTokens: number; latencyMs: number; cached: boolean } }
  | { type: 'ai:generationError'; payload: { model: string; error: string } }
  | { type: 'ai:embeddingCreated'; payload: { model: string; dimensions: number; count: number } }
  | { type: 'ai:imageGenerated'; payload: { model: string; count: number; latencyMs: number } }
  | { type: 'ai:videoGenerated'; payload: { model: string; duration: number; latencyMs: number } }
  | { type: 'ai:voiceSynthesized'; payload: { provider: string; characters: number; duration: number } }
  | { type: 'ai:speechTranscribed'; payload: { provider: string; duration: number; words: number } }
  | { type: 'ai:rateLimitHit'; payload: { provider: string; retryAfter: number } }
  | { type: 'ai:fallbackUsed'; payload: { primaryProvider: string; fallbackProvider: string } }
