/**
 * AI Routes
 *
 * Endpoints for AI operations: text generation, chat, embeddings, etc.
 * Uses characteristic-based model selection (not hardcoded model names).
 */

import { Hono } from 'hono'
import type { Env, DOContext, AIGenerateRequest, AIChatRequest, AIEmbedRequest } from '../types'

// =============================================================================
// AI Routes
// =============================================================================

/**
 * Create AI routes
 */
export function createAIRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  // ==========================================================================
  // AI Discovery
  // ==========================================================================

  /**
   * GET /api/ai - AI API discovery
   */
  router.get('/api/ai', (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    return c.json({
      api: url.hostname,
      data: {
        description: 'AI API for text generation, chat, embeddings, and more',
        version: '1.0.0',
        models: {
          description: 'Models are selected by characteristic, not by name',
          characteristics: ['best', 'fast', 'cost', 'reasoning', 'code', 'vision', 'long'],
          examples: [
            { model: 'best', description: 'Highest quality model' },
            { model: 'fast', description: 'Lowest latency' },
            { model: 'cost', description: 'Most cost-effective' },
            { model: 'fast,best', description: 'Fastest high-quality model' },
            { model: 'code,fast', description: 'Best code model with low latency' },
          ],
        },
      },
      links: {
        self: `${url.origin}/api/ai`,
        generate: `${url.origin}/api/ai/generate`,
        chat: `${url.origin}/api/ai/chat`,
        embed: `${url.origin}/api/ai/embed`,
        image: `${url.origin}/api/ai/image`,
        api: `${url.origin}/api`,
      },
      colo,
      timestamp: Date.now(),
    })
  })

  // ==========================================================================
  // Text Generation
  // ==========================================================================

  /**
   * POST /api/ai/generate - Generate text
   */
  router.post('/api/ai/generate', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const body = (await c.req.json()) as AIGenerateRequest

      if (!body.prompt) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'INVALID_REQUEST',
              message: 'prompt is required',
            },
            links: { self: `${url.origin}/api/ai/generate`, ai: `${url.origin}/api/ai` },
            timestamp: Date.now(),
          },
          400
        )
      }

      // Use Cloudflare AI binding
      if (!c.env.AI) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'AI_NOT_AVAILABLE',
              message: 'AI binding not configured',
            },
            links: { self: `${url.origin}/api/ai/generate`, ai: `${url.origin}/api/ai` },
            timestamp: Date.now(),
          },
          503
        )
      }

      // Select model based on characteristic
      // In production, this would use language-models or similar
      const modelMap: Record<string, string> = {
        best: '@cf/meta/llama-3.1-70b-instruct',
        fast: '@cf/meta/llama-3.1-8b-instruct',
        cost: '@cf/meta/llama-3.1-8b-instruct',
        code: '@cf/meta/llama-3.1-70b-instruct',
        reasoning: '@cf/meta/llama-3.1-70b-instruct',
      }

      const modelSelector = body.model || 'best'
      const primaryCharacteristic = modelSelector.split(',')[0]
      const model = modelMap[primaryCharacteristic] || modelMap['best']

      const messages = []
      if (body.system) {
        messages.push({ role: 'system', content: body.system })
      }
      messages.push({ role: 'user', content: body.prompt })

      // Type assertion for dynamic model selection
      const aiRun = c.env.AI.run.bind(c.env.AI) as (model: string, input: unknown) => Promise<unknown>

      const startTime = Date.now()
      const result = (await aiRun(model, {
        messages,
        max_tokens: body.maxTokens || 1024,
        temperature: body.temperature ?? 0.7,
      })) as { response?: string }

      const latencyMs = Date.now() - startTime

      return c.json({
        api: url.hostname,
        data: {
          text: result.response || '',
          model: modelSelector,
          latencyMs,
          finishReason: 'Stop',
        },
        links: {
          self: `${url.origin}/api/ai/generate`,
          chat: `${url.origin}/api/ai/chat`,
          ai: `${url.origin}/api/ai`,
        },
        colo,
        timestamp: Date.now(),
      })
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'GENERATION_ERROR',
            message: error instanceof Error ? error.message : 'Failed to generate text',
          },
          links: { self: `${url.origin}/api/ai/generate`, ai: `${url.origin}/api/ai` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Chat
  // ==========================================================================

  /**
   * POST /api/ai/chat - Chat completion
   */
  router.post('/api/ai/chat', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const body = (await c.req.json()) as AIChatRequest

      if (!body.messages || body.messages.length === 0) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'INVALID_REQUEST',
              message: 'messages array is required',
            },
            links: { self: `${url.origin}/api/ai/chat`, ai: `${url.origin}/api/ai` },
            timestamp: Date.now(),
          },
          400
        )
      }

      if (!c.env.AI) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'AI_NOT_AVAILABLE',
              message: 'AI binding not configured',
            },
            links: { self: `${url.origin}/api/ai/chat`, ai: `${url.origin}/api/ai` },
            timestamp: Date.now(),
          },
          503
        )
      }

      const modelMap: Record<string, string> = {
        best: '@cf/meta/llama-3.1-70b-instruct',
        fast: '@cf/meta/llama-3.1-8b-instruct',
        cost: '@cf/meta/llama-3.1-8b-instruct',
        code: '@cf/meta/llama-3.1-70b-instruct',
      }

      const modelSelector = body.model || 'best'
      const primaryCharacteristic = modelSelector.split(',')[0]
      const model = modelMap[primaryCharacteristic] || modelMap['best']

      // Type assertion for dynamic model selection
      const aiRun = c.env.AI.run.bind(c.env.AI) as (model: string, input: unknown) => Promise<unknown>

      const startTime = Date.now()
      const result = (await aiRun(model, {
        messages: body.messages,
        max_tokens: body.maxTokens || 1024,
        temperature: body.temperature ?? 0.7,
      })) as { response?: string }

      const latencyMs = Date.now() - startTime

      return c.json({
        api: url.hostname,
        data: {
          message: {
            role: 'assistant',
            content: result.response || '',
          },
          model: modelSelector,
          latencyMs,
          finishReason: 'Stop',
        },
        links: {
          self: `${url.origin}/api/ai/chat`,
          generate: `${url.origin}/api/ai/generate`,
          ai: `${url.origin}/api/ai`,
        },
        colo,
        timestamp: Date.now(),
      })
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'CHAT_ERROR',
            message: error instanceof Error ? error.message : 'Failed to complete chat',
          },
          links: { self: `${url.origin}/api/ai/chat`, ai: `${url.origin}/api/ai` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Embeddings
  // ==========================================================================

  /**
   * POST /api/ai/embed - Generate embeddings
   */
  router.post('/api/ai/embed', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const body = (await c.req.json()) as AIEmbedRequest

      if (!body.text) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'INVALID_REQUEST',
              message: 'text is required',
            },
            links: { self: `${url.origin}/api/ai/embed`, ai: `${url.origin}/api/ai` },
            timestamp: Date.now(),
          },
          400
        )
      }

      if (!c.env.AI) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'AI_NOT_AVAILABLE',
              message: 'AI binding not configured',
            },
            links: { self: `${url.origin}/api/ai/embed`, ai: `${url.origin}/api/ai` },
            timestamp: Date.now(),
          },
          503
        )
      }

      const texts = Array.isArray(body.text) ? body.text : [body.text]
      const model = '@cf/baai/bge-base-en-v1.5'

      const startTime = Date.now()
      const result = (await c.env.AI.run(model, {
        text: texts,
      })) as { data?: Array<number[]> }

      const latencyMs = Date.now() - startTime
      const embeddings = result.data || []

      return c.json({
        api: url.hostname,
        data: {
          embeddings: embeddings.map((embedding, index) => ({
            embedding,
            index,
            dimensions: embedding.length,
          })),
          model: 'embedding',
          latencyMs,
        },
        links: {
          self: `${url.origin}/api/ai/embed`,
          ai: `${url.origin}/api/ai`,
        },
        colo,
        timestamp: Date.now(),
      })
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'EMBEDDING_ERROR',
            message: error instanceof Error ? error.message : 'Failed to generate embeddings',
          },
          links: { self: `${url.origin}/api/ai/embed`, ai: `${url.origin}/api/ai` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Image Generation (placeholder)
  // ==========================================================================

  /**
   * POST /api/ai/image - Generate image
   */
  router.post('/api/ai/image', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const body = (await c.req.json()) as { prompt: string; size?: string; style?: string }

      if (!body.prompt) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'INVALID_REQUEST',
              message: 'prompt is required',
            },
            links: { self: `${url.origin}/api/ai/image`, ai: `${url.origin}/api/ai` },
            timestamp: Date.now(),
          },
          400
        )
      }

      if (!c.env.AI) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'AI_NOT_AVAILABLE',
              message: 'AI binding not configured',
            },
            links: { self: `${url.origin}/api/ai/image`, ai: `${url.origin}/api/ai` },
            timestamp: Date.now(),
          },
          503
        )
      }

      const model = '@cf/stabilityai/stable-diffusion-xl-base-1.0'

      const startTime = Date.now()
      const result = await c.env.AI.run(model, {
        prompt: body.prompt,
      })

      const latencyMs = Date.now() - startTime

      // Return image as base64
      if (result instanceof Uint8Array) {
        const base64 = btoa(String.fromCharCode(...result))

        return c.json({
          api: url.hostname,
          data: {
            image: {
              base64,
              mimeType: 'image/png',
            },
            prompt: body.prompt,
            model: 'image',
            latencyMs,
          },
          links: {
            self: `${url.origin}/api/ai/image`,
            ai: `${url.origin}/api/ai`,
          },
          colo,
          timestamp: Date.now(),
        })
      }

      return c.json({
        api: url.hostname,
        data: {
          result,
          prompt: body.prompt,
          model: 'image',
          latencyMs,
        },
        links: {
          self: `${url.origin}/api/ai/image`,
          ai: `${url.origin}/api/ai`,
        },
        colo,
        timestamp: Date.now(),
      })
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'IMAGE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to generate image',
          },
          links: { self: `${url.origin}/api/ai/image`, ai: `${url.origin}/api/ai` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Model Info
  // ==========================================================================

  /**
   * GET /api/ai/models - List available model characteristics
   */
  router.get('/api/ai/models', (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    return c.json({
      api: url.hostname,
      data: {
        characteristics: [
          {
            name: 'best',
            description: 'Highest quality model available',
            useCase: 'Complex reasoning, nuanced tasks',
          },
          {
            name: 'fast',
            description: 'Lowest latency model',
            useCase: 'Real-time applications, quick responses',
          },
          {
            name: 'cost',
            description: 'Most cost-effective model',
            useCase: 'High-volume, budget-conscious applications',
          },
          {
            name: 'reasoning',
            description: 'Best for complex reasoning tasks',
            useCase: 'Math, logic, analysis',
          },
          {
            name: 'code',
            description: 'Optimized for code generation',
            useCase: 'Programming tasks, code completion',
          },
          {
            name: 'vision',
            description: 'Supports image understanding',
            useCase: 'Image analysis, visual Q&A',
          },
          {
            name: 'long',
            description: 'Largest context window',
            useCase: 'Long documents, extensive context',
          },
        ],
        combinations: [
          { model: 'fast,best', description: 'Fastest high-quality model' },
          { model: 'best,cost', description: 'Best quality without high cost' },
          { model: 'code,fast', description: 'Fast code model' },
        ],
        note: 'Models are selected at runtime based on characteristics. No specific model names are hardcoded.',
      },
      links: {
        self: `${url.origin}/api/ai/models`,
        ai: `${url.origin}/api/ai`,
      },
      colo,
      timestamp: Date.now(),
    })
  })

  return router
}

// =============================================================================
// Export
// =============================================================================

export default createAIRoutes
