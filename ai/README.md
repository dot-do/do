# AI Layer

Unified AI abstraction layer for multi-modal generative AI capabilities.

## Overview

The AI layer provides a unified interface for working with multiple AI providers through Cloudflare AI Gateway. It supports:

- **Text Generation** - Chat, completion, and streaming
- **Embeddings** - Vector representations for semantic search
- **Image Generation** - Create images from text prompts
- **Voice** - Text-to-speech (TTS) and speech-to-text (STT)

## Cloudflare AI Gateway Integration

All AI requests are routed through [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/) for:

- **Rate Limiting** - Control request throughput per user/tenant
- **Caching** - Cache identical requests to reduce costs
- **Cost Tracking** - Monitor token usage and costs per provider
- **Observability** - Log and trace all AI operations
- **Fallbacks** - Automatic failover between providers

### Configuration

```typescript
import { setGateway } from './gateway'

setGateway({
  gatewayId: 'my-gateway',
  accountId: 'cf-account-id',
  cacheEnabled: true,
  cacheTtl: 3600, // 1 hour
  rateLimit: {
    requestsPerMinute: 60,
    tokensPerMinute: 100000
  },
  logRequests: true,
  retryOnError: true,
  fallbackProviders: ['anthropic', 'openai', 'groq']
})
```

## Multi-Provider Support

### Text LLM Providers

| Provider | Models | Best For |
|----------|--------|----------|
| `openai` | GPT-4, GPT-4o, o1, o3 | General purpose, vision |
| `anthropic` | Claude 3.5, Claude Opus 4, Haiku | Long context, reasoning |
| `google` | Gemini 1.5, Gemini 2.0 | Multimodal, long context |
| `groq` | Llama, Mixtral | Fast inference |
| `mistral` | Mistral Large, Codestral | Code generation |
| `perplexity` | Sonar | Search-augmented |
| `deepseek` | DeepSeek V3, R1 | Reasoning, code |
| `xai` | Grok | General purpose |
| `cloudflare` | Workers AI models | Edge inference |
| `openrouter` | All of the above | Multi-provider routing |
| `ollama` | Local models | Privacy, offline |

### Embedding Providers

| Provider | Models | Dimensions |
|----------|--------|------------|
| `openai` | text-embedding-3-small/large | 256-3072 |
| `cohere` | embed-v3 | 1024 |
| `voyage` | voyage-3 | 1024 |
| `cloudflare` | bge-* | 384-1024 |

### Image Providers

| Provider | Models |
|----------|--------|
| `openai` | DALL-E 3 |
| `stability` | Stable Diffusion 3 |
| `fal` | Flux models |
| `replicate` | Various |

### Voice Providers

| Provider | TTS | STT |
|----------|-----|-----|
| `elevenlabs` | Yes | - |
| `openai` | Yes | Yes (Whisper) |
| `deepgram` | Yes | Yes |
| `google` | Yes | Yes |

## Model Selection

### Characteristics

Select models by characteristic rather than specific model IDs:

| Characteristic | Description | Example Models |
|----------------|-------------|----------------|
| `fast` | Lowest latency | Groq Llama, GPT-4o-mini |
| `cost` | Cheapest option | Haiku, DeepSeek |
| `best` | Highest quality | Claude Opus 4, GPT-4o |
| `reasoning` | Best for reasoning | o1, DeepSeek R1 |
| `vision` | Best vision model | GPT-4o, Claude 3.5 |
| `code` | Best for code | Codestral, DeepSeek |
| `long` | Longest context | Gemini 1.5 Pro (2M) |

### Single Characteristic

```typescript
import { generate } from './text'

// Use the fastest available model
const result = await generate('Hello world', { model: 'fast' })

// Use the best quality model
const result = await generate('Explain quantum computing', { model: 'best' })

// Use the cheapest model
const result = await generate('Summarize this', { model: 'cost' })
```

### Combo Priorities

Combine characteristics with comma-separated priorities:

```typescript
// Fastest model that's also high quality
const result = await generate(prompt, { model: 'fast,best' })

// Best quality without crazy expense
const result = await generate(prompt, { model: 'best,cost' })

// Best code model with low latency
const result = await generate(prompt, { model: 'code,fast' })

// Best reasoning with cost consideration
const result = await generate(prompt, { model: 'reasoning,cost' })
```

### Constraints

For fine-grained control, use constraints:

```typescript
const result = await generate(prompt, {
  model: 'best',
  constraints: {
    maxLatency: 2000,          // Max 2 seconds
    maxCost: 10,               // Max $10 per 1M tokens
    minQuality: 0.9,           // High quality threshold
    requires: ['functionCalling', 'vision']
  }
})
```

## Text Generation

### Simple Generation

```typescript
import { generate, chat, streamGenerate } from './text'

// Simple prompt
const result = await generate('Write a haiku about coding')
console.log(result.text)

// With options
const result = await generate('Explain AI', {
  model: 'best',
  temperature: 0.7,
  maxTokens: 500
})
```

### Chat Completion

```typescript
const result = await chat([
  { role: 'system', content: 'You are a helpful assistant' },
  { role: 'user', content: 'What is TypeScript?' }
], {
  model: 'fast,best'
})
```

### Streaming

```typescript
// Stream text generation
for await (const chunk of streamGenerate('Write a story')) {
  process.stdout.write(chunk)
}

// Stream chat
for await (const chunk of streamChat(messages)) {
  process.stdout.write(chunk)
}
```

### Structured Output

```typescript
import { generateObject, extractData } from './text'

// Generate structured data
const schema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' }
  }
}

const person = await generateObject('Generate a random person', schema)

// Extract data from text
const data = await extractData(
  'John is 30 years old and works as an engineer',
  schema
)
```

## Embeddings

```typescript
import { embed, embedBatch } from './embeddings'

// Single embedding
const result = await embed('Hello world')
console.log(result.embedding) // number[]

// Batch embeddings
const results = await embedBatch([
  'First document',
  'Second document',
  'Third document'
])

// With options
const result = await embed('Hello', {
  provider: 'openai',
  model: 'text-embedding-3-large',
  dimensions: 1024
})
```

## Image Generation

```typescript
import { generateImage, analyzeImage } from './image'

// Generate image
const result = await generateImage('A sunset over mountains', {
  size: '1024x1024',
  quality: 'hd',
  style: 'vivid'
})
console.log(result.images[0].url)

// Analyze image (vision)
const description = await analyzeImage(
  { url: 'https://example.com/image.jpg' },
  'Describe this image in detail'
)
```

## Voice

### Text-to-Speech

```typescript
import { synthesize } from './voice'

const result = await synthesize('Hello, how are you?', {
  provider: 'elevenlabs',
  voice: 'rachel',
  format: 'mp3'
})

// result.audio is ArrayBuffer
```

### Speech-to-Text

```typescript
import { transcribe, transcribeStream } from './voice'

// Batch transcription
const result = await transcribe(audioBuffer, {
  provider: 'deepgram',
  language: 'en',
  punctuate: true,
  diarize: true
})

console.log(result.text)
console.log(result.words)    // Word-level timestamps
console.log(result.speakers) // Speaker segments

// Real-time streaming
for await (const partial of transcribeStream(audioStream)) {
  console.log(partial.text)
}
```

## Architecture

```
src/ai/
  gateway.ts     - AI Gateway client, routing, caching
  text.ts        - Text generation (chat, complete, stream)
  embeddings.ts  - Vector embeddings
  image.ts       - Image generation and analysis
  voice.ts       - TTS and STT
  models.ts      - Model selection logic
  __tests__/     - Test files
```

## Events

The AI layer emits events for observability:

| Event | Description |
|-------|-------------|
| `ai:generationStarted` | Text generation began |
| `ai:generationCompleted` | Text generation finished |
| `ai:generationError` | Text generation failed |
| `ai:embeddingCreated` | Embedding created |
| `ai:imageGenerated` | Image generated |
| `ai:voiceSynthesized` | TTS completed |
| `ai:speechTranscribed` | STT completed |
| `ai:rateLimitHit` | Rate limit exceeded |
| `ai:fallbackUsed` | Switched to fallback provider |

## Error Handling

```typescript
import { generate } from './text'

try {
  const result = await generate(prompt)
} catch (error) {
  if (error.code === 'RATE_LIMIT') {
    // Wait and retry
  } else if (error.code === 'CONTEXT_LENGTH') {
    // Reduce input size
  } else if (error.code === 'PROVIDER_ERROR') {
    // Provider-specific error
  }
}
```

## Cost Management

```typescript
import { getUsage } from './gateway'

// Get usage for time period
const usage = await getUsage(
  Date.now() - 86400000, // Last 24 hours
  Date.now()
)

const totalCost = usage.reduce((sum, u) => sum + u.cost, 0)
const totalTokens = usage.reduce((sum, u) => sum + u.inputTokens + u.outputTokens, 0)
```
