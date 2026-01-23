/**
 * AI Operations with Model Selection
 *
 * DO provides unified AI capabilities with:
 * - Multi-provider support (OpenAI, Anthropic, Google, etc.)
 * - Model selection by characteristic (fast, best, cost)
 * - Cloudflare AI Gateway for routing, caching, observability
 * - Multi-modal: text, image, video, voice
 */

import type {
  AIContext,
  AIOperations,
  TextGenerationOptions,
  TextGenerationResult,
  ChatMessage,
  EmbeddingOptions,
  EmbeddingResult,
  ImageGenerationOptions,
  VideoGenerationOptions,
  VoiceSynthesisOptions,
  SpeechRecognitionOptions,
  ModelSelector,
  ModelCharacteristic,
  ModelConstraints,
  ModelInfo,
  AIGatewayConfig,
  DOContext,
} from '../types'

// =============================================================================
// Model Selection
// =============================================================================

/**
 * Model selectors - single characteristic or priority combo
 *
 * Single characteristic:
 * - "fast" - lowest latency model
 * - "best" - highest quality model
 * - "cost" - cheapest option
 * - "reasoning" - best for complex reasoning
 * - "vision" - best vision model
 * - "code" - best for code generation
 * - "long" - longest context window
 *
 * Priority combos (primary,fallback):
 * - "fast,best" - fastest high-quality model
 * - "best,cost" - best quality without crazy expense
 * - "code,fast" - best code model with low latency
 */
const modelSelectors: ModelSelector[] = [
  'fast',           // GPT-4o-mini, Claude Haiku
  'best',           // Claude Opus 4, GPT-4o
  'cost',           // Cheapest available
  'reasoning',      // o1, Claude Opus 4
  'vision',         // GPT-4o, Claude Opus 4
  'code',           // Codestral, Claude Opus 4
  'long',           // Gemini 1.5 Pro (1M tokens)
  'fast,best',      // Fast but still high quality
  'best,cost',      // Best without being expensive
]

/**
 * Model constraints for fine-grained control
 */
const modelConstraints: ModelConstraints = {
  maxLatency: 2000,           // Max 2 second response time
  maxCost: 10,                // Max $10 per 1M tokens
  minQuality: 0.8,            // Minimum quality score
  requires: ['functionCalling', 'jsonMode'],
}

// =============================================================================
// AI Context ($ai) Usage
// =============================================================================

/**
 * Using AI operations with the $ context
 */
async function demonstrateAIContext($: DOContext) {
  // ==========================================================================
  // Text Generation
  // ==========================================================================

  // Simple generation with tagged template
  const tagline = await $.ai`Generate a catchy tagline for a developer tools company`
  console.log('Tagline:', tagline)

  // Generate with model selection
  const ideas = await $.ai`5 startup ideas for AI-powered B2B tools`
  console.log('Ideas:', ideas)

  // ==========================================================================
  // Specialized AI Methods
  // ==========================================================================

  // Generate a list
  const features = await $.ai.list`Key features for a headless CMS`
  console.log('Features:', features) // ['API-first', 'GraphQL support', ...]

  // Boolean check
  const isValid = await $.ai.is`"${tagline}" would appeal to developers`
  console.log('Is valid:', isValid) // true/false

  // Generate written content
  const blogPost = await $.ai.write`A blog post about the future of AI in SaaS`
  console.log('Blog post length:', blogPost.length)

  // Execute a task (returns structured output)
  const analysis = await $.ai.do`Analyze the market for developer tools`
  console.log('Analysis:', analysis.summary)
  console.log('Actions:', analysis.actions)

  // Generate code
  const code = await $.ai.code`A TypeScript function to validate email addresses`
  console.log('Generated code:', code)

  // Summarize content
  const summary = await $.ai.summarize`${blogPost}`
  console.log('Summary:', summary)

  // Extract structured data
  interface Person {
    name: string
    email: string
    role: string
  }

  const text = 'Contact John Smith (john@example.com), our CEO, for more info.'
  const people = await $.ai.extract<Person>`Extract people from: ${text}`
  console.log('Extracted:', people) // [{ name: 'John Smith', email: 'john@example.com', role: 'CEO' }]

  // ==========================================================================
  // Embeddings
  // ==========================================================================

  // Create embedding for vector search
  const embedding = await $.ai.embed('headless CMS for developers')
  console.log('Embedding dimensions:', embedding.length) // 1536 or 3072

  // ==========================================================================
  // Image Generation
  // ==========================================================================

  const image = await $.ai.image`A futuristic office with developers working on AI`
  console.log('Image URL:', image.url)

  // ==========================================================================
  // Voice Operations
  // ==========================================================================

  // Text to speech
  const audio = await $.ai.speak`Welcome to our platform. Let me show you around.`
  console.log('Audio bytes:', audio.byteLength)

  // Speech to text
  // const transcript = await $.ai.transcribe(audioBuffer)
}

// =============================================================================
// Direct AI Operations Interface
// =============================================================================

/**
 * Using the AIOperations interface directly
 */
async function demonstrateAIOperations(ai: AIOperations) {
  // ==========================================================================
  // Text Generation with Options
  // ==========================================================================

  // Simple generation
  const simple = await ai.generate('Explain quantum computing in one sentence')
  console.log('Result:', simple.text)
  console.log('Model:', simple.model)
  console.log('Tokens:', simple.usage.totalTokens)
  console.log('Latency:', simple.latencyMs, 'ms')

  // Generation with model selection
  const fast = await ai.generate('What is 2+2?', {
    model: 'fast',
    maxTokens: 100,
  })
  console.log('Fast result:', fast.text)

  // Generation with the best model
  const best = await ai.generate('Explain the implications of AGI on society', {
    model: 'best',
    temperature: 0.7,
    maxTokens: 2000,
  })
  console.log('Best result:', best.text)

  // Generation with constraints
  const constrained = await ai.generate('Write a haiku about coding', {
    model: 'best,cost',
    constraints: {
      maxLatency: 1000,
      maxCost: 5,
    },
    temperature: 0.9,
  })
  console.log('Constrained result:', constrained.text)

  // ==========================================================================
  // Chat Completion
  // ==========================================================================

  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are a helpful assistant for developers.' },
    { role: 'user', content: 'How do I create a REST API?' },
  ]

  const chatResult = await ai.chat(messages, {
    model: 'best',
    temperature: 0.7,
  })
  console.log('Chat response:', chatResult.text)

  // Multi-turn conversation
  messages.push({ role: 'assistant', content: chatResult.text })
  messages.push({ role: 'user', content: 'Show me an example in TypeScript' })

  const followUp = await ai.chat(messages, {
    model: 'code',
  })
  console.log('Follow-up:', followUp.text)

  // ==========================================================================
  // Streaming
  // ==========================================================================

  // Stream text generation
  console.log('Streaming response:')
  for await (const chunk of ai.streamGenerate('Tell me a short story', {
    model: 'fast',
  })) {
    process.stdout.write(chunk)
  }
  console.log('\n')

  // Stream chat
  for await (const chunk of ai.streamChat(messages, {
    model: 'best',
  })) {
    process.stdout.write(chunk)
  }
  console.log('\n')

  // ==========================================================================
  // Structured Output
  // ==========================================================================

  interface StartupIdea {
    name: string
    tagline: string
    targetMarket: string
    revenueModel: string
    techStack: string[]
  }

  const ideaSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      tagline: { type: 'string' },
      targetMarket: { type: 'string' },
      revenueModel: { type: 'string' },
      techStack: { type: 'array', items: { type: 'string' } },
    },
    required: ['name', 'tagline', 'targetMarket', 'revenueModel', 'techStack'],
  }

  const idea = await ai.generateObject<StartupIdea>(
    'Generate a B2B SaaS startup idea',
    ideaSchema,
    { model: 'best' }
  )
  console.log('Startup idea:', idea.name)
  console.log('Tagline:', idea.tagline)
  console.log('Tech stack:', idea.techStack.join(', '))

  // ==========================================================================
  // Function Calling (Tool Use)
  // ==========================================================================

  const withTools = await ai.generate('What is the weather in San Francisco?', {
    model: 'best',
    tools: [
      {
        name: 'get_weather',
        description: 'Get the current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name' },
            units: { type: 'string', enum: ['celsius', 'fahrenheit'] },
          },
          required: ['location'],
        },
      },
    ],
  })

  if (withTools.toolCalls) {
    for (const call of withTools.toolCalls) {
      console.log('Tool call:', call.name, call.arguments)
    }
  }

  // ==========================================================================
  // Embeddings
  // ==========================================================================

  const singleEmbed = await ai.embed('headless CMS for developers', {
    model: 'text-embedding-3-small',
    dimensions: 512,
  })
  console.log('Embedding dimensions:', singleEmbed.dimensions)

  const batchEmbed = await ai.embedBatch([
    'content management system',
    'API-first design',
    'developer experience',
  ])
  console.log('Batch embeddings:', batchEmbed.embeddings.length)

  // ==========================================================================
  // Image Generation
  // ==========================================================================

  const image = await ai.generateImage('A minimalist logo for a tech startup', {
    provider: 'openai',
    size: '1024x1024',
    quality: 'hd',
    style: 'natural',
  })
  console.log('Image URL:', image.images[0].url)

  // Image analysis (vision)
  const analysis = await ai.analyzeImage(
    { url: image.images[0].url! },
    'Describe this logo and suggest improvements',
    { model: 'gpt-4o' }
  )
  console.log('Image analysis:', analysis)

  // ==========================================================================
  // Video Generation
  // ==========================================================================

  const video = await ai.generateVideo('A product demo showing a dashboard', {
    provider: 'luma',
    duration: 5,
    aspectRatio: '16:9',
    resolution: '1080p',
  })
  console.log('Video URL:', video.url)

  // ==========================================================================
  // Voice Synthesis (TTS)
  // ==========================================================================

  const speech = await ai.synthesize('Welcome to our platform!', {
    provider: 'elevenlabs',
    voice: 'rachel',
    speed: 1.0,
    format: 'mp3',
  })
  console.log('Speech duration:', speech.duration, 'seconds')

  // ==========================================================================
  // Speech Recognition (STT)
  // ==========================================================================

  // const audioBuffer = await fetchAudio('path/to/audio.mp3')
  // const transcript = await ai.transcribe(audioBuffer, {
  //   provider: 'deepgram',
  //   language: 'en-US',
  //   punctuate: true,
  //   diarize: true,
  // })
  // console.log('Transcript:', transcript.text)
  // console.log('Speakers:', transcript.speakers?.length)
}

// =============================================================================
// AI Gateway Configuration
// =============================================================================

/**
 * Configure Cloudflare AI Gateway for routing and observability
 */
const gatewayConfig: AIGatewayConfig = {
  gatewayId: 'my-gateway',
  accountId: 'cf-account-id',

  // Enable caching for repeated requests
  cacheEnabled: true,
  cacheTtl: 3600, // 1 hour

  // Rate limiting
  rateLimit: {
    requestsPerMinute: 60,
    tokensPerMinute: 100000,
  },

  // Log all requests for observability
  logRequests: true,

  // Retry on transient errors
  retryOnError: true,

  // Fallback providers if primary fails
  fallbackProviders: ['anthropic', 'google', 'groq'],
}

/**
 * Model routing based on characteristics
 */
const modelRouting: Record<ModelCharacteristic, ModelInfo[]> = {
  fast: [
    {
      id: 'gpt-4o-mini',
      provider: 'openai',
      name: 'GPT-4o Mini',
      capabilities: {
        functionCalling: true,
        vision: true,
        jsonMode: true,
        streaming: true,
        systemMessages: true,
        contextWindow: 128000,
        maxOutput: 16384,
      },
      costTier: 'cheap',
      speedTier: 'instant',
    },
    {
      id: 'claude-3-5-haiku-latest',
      provider: 'anthropic',
      name: 'Claude 3.5 Haiku',
      capabilities: {
        functionCalling: true,
        vision: true,
        jsonMode: true,
        streaming: true,
        systemMessages: true,
        contextWindow: 200000,
        maxOutput: 8192,
      },
      costTier: 'cheap',
      speedTier: 'instant',
    },
  ],
  best: [
    {
      id: 'claude-opus-4-5-20251101',
      provider: 'anthropic',
      name: 'Claude Opus 4.5',
      capabilities: {
        functionCalling: true,
        vision: true,
        jsonMode: true,
        streaming: true,
        systemMessages: true,
        contextWindow: 200000,
        maxOutput: 32768,
      },
      costTier: 'expensive',
      speedTier: 'standard',
    },
    {
      id: 'gpt-4o',
      provider: 'openai',
      name: 'GPT-4o',
      capabilities: {
        functionCalling: true,
        vision: true,
        jsonMode: true,
        streaming: true,
        systemMessages: true,
        contextWindow: 128000,
        maxOutput: 16384,
      },
      costTier: 'premium',
      speedTier: 'fast',
    },
  ],
  cost: [
    {
      id: 'gemini-1.5-flash',
      provider: 'google',
      name: 'Gemini 1.5 Flash',
      capabilities: {
        functionCalling: true,
        vision: true,
        jsonMode: true,
        streaming: true,
        systemMessages: true,
        contextWindow: 1000000,
        maxOutput: 8192,
      },
      costTier: 'free',
      speedTier: 'instant',
    },
  ],
  reasoning: [
    {
      id: 'o1',
      provider: 'openai',
      name: 'o1',
      capabilities: {
        functionCalling: false,
        vision: true,
        jsonMode: true,
        streaming: false,
        systemMessages: false,
        contextWindow: 200000,
        maxOutput: 100000,
      },
      costTier: 'expensive',
      speedTier: 'slow',
    },
  ],
  vision: [
    {
      id: 'gpt-4o',
      provider: 'openai',
      name: 'GPT-4o',
      capabilities: {
        functionCalling: true,
        vision: true,
        jsonMode: true,
        streaming: true,
        systemMessages: true,
        contextWindow: 128000,
        maxOutput: 16384,
      },
      costTier: 'premium',
      speedTier: 'fast',
    },
  ],
  code: [
    {
      id: 'codestral-latest',
      provider: 'mistral',
      name: 'Codestral',
      capabilities: {
        functionCalling: true,
        vision: false,
        jsonMode: true,
        streaming: true,
        systemMessages: true,
        contextWindow: 32000,
        maxOutput: 32000,
      },
      costTier: 'standard',
      speedTier: 'fast',
    },
  ],
  long: [
    {
      id: 'gemini-1.5-pro',
      provider: 'google',
      name: 'Gemini 1.5 Pro',
      capabilities: {
        functionCalling: true,
        vision: true,
        jsonMode: true,
        streaming: true,
        systemMessages: true,
        contextWindow: 2000000,
        maxOutput: 8192,
      },
      costTier: 'premium',
      speedTier: 'standard',
    },
  ],
}

console.log('AI Operations example ready')
console.log('Available model characteristics:', Object.keys(modelRouting).join(', '))
