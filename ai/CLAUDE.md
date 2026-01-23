# AI Layer - Implementation Guidelines

## Overview

This directory contains the AI abstraction layer for multi-modal generative AI.

## File Structure

```
src/ai/
  gateway.ts     - Cloudflare AI Gateway client
  text.ts        - Text generation (chat, complete, stream)
  embeddings.ts  - Vector embeddings
  image.ts       - Image generation and analysis
  voice.ts       - Text-to-speech and speech-to-text
  models.ts      - Model selection and routing logic
  __tests__/     - Test files
```

## Types

All types are defined in `/types/ai.ts`. Import from there:

```typescript
import type {
  TextGenerationOptions,
  TextGenerationResult,
  ModelSelector,
  AIGatewayConfig,
  // etc.
} from '../../types/ai'
```

## Implementation Patterns

### Gateway Integration

All AI requests MUST route through Cloudflare AI Gateway:

1. Construct gateway URL: `https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayId}/{provider}`
2. Include authentication headers per provider
3. Handle caching headers for cache-eligible requests
4. Log usage for cost tracking

### Model Selection Algorithm

The `selectModel()` function in `models.ts` should:

1. Parse the selector (single characteristic or combo)
2. Filter models by required capabilities
3. Sort by primary characteristic
4. Apply secondary characteristic as tiebreaker
5. Return the best matching model

Example for `fast,best`:
- Filter to fast models (instant or fast tier)
- Sort by quality score
- Return highest quality fast model

### Provider Abstraction

Each provider needs an adapter that normalizes:
- Request format (messages, tools, etc.)
- Response format (text, tool calls, usage)
- Error codes and messages
- Streaming chunk format

### Streaming Implementation

Use async generators for streaming:

```typescript
async function* streamGenerate(
  prompt: string,
  options?: TextGenerationOptions
): AsyncIterable<string> {
  const response = await fetch(url, { ... })
  const reader = response.body?.getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    yield parseSSEChunk(value)
  }
}
```

### Error Handling

Wrap all provider calls with error normalization:

```typescript
try {
  return await providerCall()
} catch (error) {
  throw normalizeError(error, provider)
}
```

Standard error codes:
- `RATE_LIMIT` - Rate limit exceeded
- `CONTEXT_LENGTH` - Input too long
- `CONTENT_FILTER` - Content blocked
- `PROVIDER_ERROR` - Provider-specific error
- `NETWORK_ERROR` - Connection failed
- `TIMEOUT` - Request timed out

### Caching Strategy

Cache-eligible requests:
- Embeddings (same text + model = same result)
- Deterministic generations (temperature=0, same seed)

Cache key format: `ai:{provider}:{model}:{hash(input)}`

### Cost Tracking

Track every request:

```typescript
interface UsageRecord {
  requestId: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  cost: number
  latencyMs: number
  cached: boolean
  timestamp: number
}
```

### Testing

Each module should have corresponding tests in `__tests__/`:

1. Unit tests for pure functions (model selection, parsing)
2. Integration tests with mocked providers
3. Use MSW or similar for HTTP mocking

## Key Implementation Notes

### gateway.ts

- Singleton gateway config
- URL construction for each provider
- Request/response interceptors
- Retry logic with exponential backoff
- Fallback provider chain

### text.ts

- `generate()` - Simple text completion
- `chat()` - Multi-turn conversation
- `streamGenerate()` / `streamChat()` - Streaming variants
- `generateObject()` - Structured output with JSON schema
- Tool/function calling support

### embeddings.ts

- `embed()` - Single text embedding
- `embedBatch()` - Batch processing (respect provider limits)
- Dimension normalization
- Provider-specific model mapping

### image.ts

- `generateImage()` - Text to image
- `analyzeImage()` - Vision/image understanding
- Size/format normalization
- Base64/URL handling

### voice.ts

- `synthesize()` - Text to speech
- `transcribe()` - Audio to text
- `transcribeStream()` - Real-time transcription
- Audio format conversion
- Word-level timestamps

### models.ts

- Model registry with metadata
- `selectModel()` - Core selection algorithm
- Capability matching
- Cost/quality/speed scoring
- Provider availability checking

## Dependencies

- Vercel AI SDK (optional, for standardized streaming)
- Provider SDKs (optional, for type safety)

## Environment Variables

```
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_AI_GATEWAY_ID
OPENAI_API_KEY
ANTHROPIC_API_KEY
GOOGLE_AI_API_KEY
GROQ_API_KEY
MISTRAL_API_KEY
ELEVENLABS_API_KEY
DEEPGRAM_API_KEY
```

## Performance Considerations

1. Connection pooling for HTTP clients
2. Request batching where supported
3. Parallel requests for independent operations
4. Streaming for long generations
5. Caching for repeated requests
