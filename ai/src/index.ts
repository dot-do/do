/**
 * ai.do - Unified AI Gateway Worker
 *
 * Handles all AI generation with:
 * - Cloudflare AI Gateway (mdxai) for OpenAI, Anthropic, Google, Bedrock via BYOK
 * - Workers AI for Cloudflare models (including GPT-OSS Responses API)
 * - Model routing by characteristic (best, fast, cost, reasoning)
 *
 * BYOK (Bring Your Own Key): API keys are stored in AI Gateway dashboard.
 * The gateway injects keys at runtime - we don't pass any in code.
 *
 * When using Worker bindings (env.AI.gateway), requests are pre-authenticated
 * within the Cloudflare account - no cf-aig-authorization header needed.
 */

import { generateText, generateObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

// AI Gateway configuration
const AI_GATEWAY_ACCOUNT_ID = 'b6641681fe423910342b9ffa1364c76d'
const AI_GATEWAY_NAME = 'mdxai'

interface Env {
  AI: Ai // Workers AI binding with gateway support
  CLOUDFLARE_AI_GATEWAY_TOKEN?: string // Required for gateway authentication
}

/**
 * Model aliases - map characteristics to provider/model
 * Frontier models go through AI Gateway (mdxai) with BYOK
 * cf-* models use Workers AI directly
 *
 * Model names should match what the provider API expects
 * NOT the marketing names (e.g., "gpt-4o-mini" not "gpt-5 nano")
 */
const MODEL_ALIASES: Record<string, string> = {
  // Characteristics - frontier models via gateway
  best: 'anthropic/claude-sonnet-4-20250514',
  fast: 'openai/gpt-4o-mini', // Fast and cheap
  cost: 'openrouter/google/gemini-2.0-flash-001', // Very cheap via OpenRouter
  reasoning: 'openai/o3-mini', // Best reasoning
  code: 'anthropic/claude-sonnet-4-20250514',

  // Anthropic (via AI Gateway)
  opus: 'anthropic/claude-opus-4-20250514',
  sonnet: 'anthropic/claude-sonnet-4-20250514',
  haiku: 'anthropic/claude-3-5-haiku-20241022',

  // OpenAI (via AI Gateway)
  'gpt-4o': 'openai/gpt-4o',
  'gpt-4o-mini': 'openai/gpt-4o-mini',
  'gpt-4.1': 'openai/gpt-4.1',
  'gpt-4.1-mini': 'openai/gpt-4.1-mini',
  'o3-mini': 'openai/o3-mini',
  'o3': 'openai/o3',
  'o1': 'openai/o1',
  'o1-mini': 'openai/o1-mini',

  // Google (via OpenRouter - more reliable than direct gateway)
  gemini: 'openrouter/google/gemini-2.0-flash-001',
  'gemini-flash': 'openrouter/google/gemini-2.0-flash-001',
  'gemini-pro': 'openrouter/google/gemini-pro-1.5',

  // OpenRouter (via AI Gateway) - access to many models
  deepseek: 'openrouter/deepseek/deepseek-chat',
  'deepseek-r1': 'openrouter/deepseek/deepseek-r1',
  qwen: 'openrouter/qwen/qwen-2.5-72b-instruct',

  // Workers AI models (direct, not through gateway)
  // Model names don't include @cf/ prefix - that's added in generateWithWorkersAI
  'cf-fast': 'cf/meta/llama-3.3-70b-instruct-fp8-fast',
  'cf-best': 'cf/meta/llama-3.3-70b-instruct-fp8-fast',
  'cf-llama': 'cf/meta/llama-3.3-70b-instruct-fp8-fast',
}

/**
 * Parse provider/model from alias or full ID
 */
function parseModel(modelArg: string): { provider: string; model: string } {
  const resolved = MODEL_ALIASES[modelArg] || modelArg
  const [provider, ...rest] = resolved.split('/')
  return { provider, model: rest.join('/') }
}

/**
 * Get AI Gateway base URL for a provider
 * Try Worker binding first (pre-authenticated), fall back to direct URL
 */
async function getGatewayUrl(env: Env, provider: string): Promise<string> {
  // Try to use the AI binding's gateway method for pre-authenticated access
  try {
    const ai = env.AI as any
    if (ai?.gateway) {
      const gateway = ai.gateway(AI_GATEWAY_NAME)
      return await gateway.getUrl(provider)
    }
  } catch {
    // Binding method not available, fall back to direct URL
  }

  // Fall back to constructing the URL directly
  // This requires cf-aig-authorization header for authentication
  return `https://gateway.ai.cloudflare.com/v1/${AI_GATEWAY_ACCOUNT_ID}/${AI_GATEWAY_NAME}/${provider}`
}

/**
 * Custom fetch that strips the Authorization header for BYOK
 * The AI SDK adds Authorization header even with empty apiKey
 * BYOK gateway injects the real key, so we need to remove the empty one
 */
function createByokFetch(gatewayToken?: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)

    // Remove the empty Authorization header that SDK adds
    // BYOK will inject the real provider API key
    headers.delete('Authorization')
    headers.delete('x-api-key') // Anthropic uses this

    // Add gateway authentication
    if (gatewayToken) {
      headers.set('cf-aig-authorization', `Bearer ${gatewayToken}`)
    }

    return fetch(input, { ...init, headers })
  }
}

/**
 * Create provider instance based on provider name
 * Uses AI Gateway BYOK - gateway injects API keys at runtime
 *
 * Supported providers:
 * - openai: OpenAI models (GPT-4o, o1, o3, etc.)
 * - anthropic: Anthropic models (Claude)
 * - openrouter: Access to many models (Google Gemini, DeepSeek, Qwen, etc.)
 */
async function getProvider(provider: string, env: Env) {
  const byokFetch = createByokFetch(env.CLOUDFLARE_AI_GATEWAY_TOKEN)

  switch (provider) {
    case 'openai':
      return createOpenAI({
        baseURL: await getGatewayUrl(env, 'openai'),
        apiKey: 'BYOK',
        fetch: byokFetch,
      })
    case 'anthropic':
      return createAnthropic({
        baseURL: await getGatewayUrl(env, 'anthropic'),
        apiKey: 'BYOK',
        fetch: byokFetch,
      })
    case 'openrouter':
      return createOpenAI({
        baseURL: await getGatewayUrl(env, 'openrouter'),
        apiKey: 'BYOK',
        fetch: byokFetch,
      })
    case 'cf':
      return null // Workers AI handled separately
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

/**
 * Convert description-first schema to Zod schema
 * 'A description' → z.string()
 * 'Score (number)' → z.number()
 * ['Items'] → z.array(z.string())
 * 'a | b | c' → z.enum(['a', 'b', 'c'])
 */
function schemaToZod(schema: Record<string, unknown>): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const [key, value] of Object.entries(schema)) {
    if (typeof value === 'string') {
      // Check for enum pattern: "option1 | option2 | option3"
      if (value.includes(' | ')) {
        const options = value.split(' | ').map((s) => s.trim())
        shape[key] = z.enum(options as [string, ...string[]])
      }
      // Check for type suffix: "(number)", "(date)", "(boolean)"
      else if (value.endsWith('(number)')) {
        shape[key] = z.number().describe(value.replace('(number)', '').trim())
      } else if (value.endsWith('(date)')) {
        shape[key] = z.string().describe(value.replace('(date)', '').trim())
      } else if (value.endsWith('(boolean)')) {
        shape[key] = z.boolean().describe(value.replace('(boolean)', '').trim())
      } else {
        shape[key] = z.string().describe(value)
      }
    } else if (Array.isArray(value)) {
      // Array of strings with description
      const desc = value[0] as string
      shape[key] = z.array(z.string()).describe(desc)
    } else if (typeof value === 'object' && value !== null) {
      // Nested object
      shape[key] = schemaToZod(value as Record<string, unknown>)
    }
  }

  return z.object(shape)
}

/**
 * Generate with Workers AI (including GPT-OSS Responses API)
 */
async function generateWithWorkersAI(
  ai: Ai,
  model: string,
  prompt: string,
  systemPrompt?: string,
  schema?: Record<string, unknown>
): Promise<{ value: unknown; tokens?: { input: number; output: number }; error?: string }> {
  const fullModel = `@cf/${model}`

  // GPT-OSS models use Responses API
  if (model.startsWith('openai/gpt-oss')) {
    // TODO: Implement Responses API when available
    // For now, fall back to standard API
  }

  // Build messages
  const messages: Array<{ role: 'system' | 'user'; content: string }> = []
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  // Add schema instructions if provided
  if (schema) {
    const schemaPrompt = `Respond with valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}\n\nRespond ONLY with JSON, no markdown.`
    if (messages[0]?.role === 'system') {
      messages[0].content += '\n\n' + schemaPrompt
    } else {
      messages.unshift({ role: 'system', content: schemaPrompt })
    }
  }

  try {
    const result = await ai.run(fullModel as any, { messages })

    // Extract value from various response formats
    let value: unknown
    const r = result as any

    // OpenAI-compatible format (choices[0].message.content)
    if (r.choices?.[0]?.message?.content) {
      value = r.choices[0].message.content
    }
    // Direct response format
    else if (r.response) {
      value = r.response
    }
    // Other formats
    else if (r.text || r.content || r.output) {
      value = r.text || r.content || r.output
    }
    // Fallback to raw result
    else {
      value = result
    }

    // Extract tokens if available
    const tokens = r.usage ? { input: r.usage.prompt_tokens, output: r.usage.completion_tokens } : undefined

    // Parse JSON if schema was provided
    if (schema && typeof value === 'string') {
      try {
        const jsonMatch = value.match(/```(?:json)?\s*([\s\S]*?)```/) || value.match(/(\{[\s\S]*\})/)
        const jsonStr = jsonMatch ? jsonMatch[1].trim() : value.trim()
        value = JSON.parse(jsonStr)
      } catch {
        // Return raw if parsing fails
      }
    }

    return { value, tokens }
  } catch (error) {
    return { value: null, error: `Workers AI error (${fullModel}): ${error instanceof Error ? error.message : String(error)}` }
  }
}

// Provider instance type
type ProviderInstance = ReturnType<typeof createOpenAI> | ReturnType<typeof createAnthropic> | null

/**
 * Generate with AI SDK providers via AI Gateway
 */
async function generateWithSDK(
  providerInstance: ProviderInstance,
  model: string,
  prompt: string,
  systemPrompt?: string,
  schema?: Record<string, unknown>
): Promise<{ value: unknown; tokens?: { input: number; output: number }; error?: string }> {
  if (!providerInstance) {
    return { value: null, error: 'Provider not available' }
  }

  try {
    const provider = providerInstance as ReturnType<typeof createOpenAI>

    if (schema) {
      const zodSchema = schemaToZod(schema)
      const result = await generateObject({
        model: provider(model),
        schema: zodSchema,
        system: systemPrompt,
        prompt,
      })
      return {
        value: result.object,
        tokens: { input: result.usage.promptTokens, output: result.usage.completionTokens },
      }
    } else {
      const result = await generateText({
        model: provider(model),
        system: systemPrompt,
        prompt,
      })
      return {
        value: result.text,
        tokens: { input: result.usage.promptTokens, output: result.usage.completionTokens },
      }
    }
  } catch (error) {
    return {
      value: null,
      error: `AI SDK error: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Main generate function
 */
async function generate(
  env: Env,
  options: {
    prompt: string
    system?: string
    schema?: Record<string, unknown>
    model?: string
  }
): Promise<{ value: unknown; tokens?: { input: number; output: number }; error?: string }> {
  try {
    const { provider, model } = parseModel(options.model || 'fast')

    if (provider === 'cf') {
      return generateWithWorkersAI(env.AI, model, options.prompt, options.system, options.schema)
    }

    const providerInstance = await getProvider(provider, env)
    if (providerInstance === null) {
      return { value: null, error: `Provider ${provider} not available` }
    }

    return generateWithSDK(providerInstance, model, options.prompt, options.system, options.schema)
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * RPC handler
 */
async function handleRPC(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  // Parse RPC call from path: /$generate(...)
  const match = url.pathname.match(/^\/\$(\w+)(?:\((.*)\))?$/)
  if (!match) {
    return Response.json({ error: 'Invalid RPC path' }, { status: 400 })
  }

  const [, method, argsStr] = match
  let args: unknown[] = []

  // Parse args from URL or body
  if (request.method === 'POST') {
    args = await request.json()
  } else if (argsStr) {
    try {
      args = JSON.parse(`[${argsStr}]`)
    } catch {
      args = [argsStr]
    }
  }

  // Route to method
  switch (method) {
    case 'generate': {
      const [options] = args as [{ prompt: string; system?: string; schema?: Record<string, unknown>; model?: string }]
      const result = await generate(env, options)
      return Response.json(result)
    }
    case 'ping':
      return Response.json({ pong: true, time: Date.now() })
    case 'models':
      return Response.json(MODEL_ALIASES)
    default:
      return Response.json({ error: `Unknown method: ${method}` }, { status: 400 })
  }
}

/**
 * API discovery
 */
function handleDiscovery(): Response {
  return Response.json({
    api: {
      name: 'ai.do',
      description: 'Unified AI Gateway - OpenAI, Anthropic, Google, Workers AI',
      url: 'https://ai.do',
    },
    methods: {
      generate: 'Generate text or structured objects',
      models: 'List available model aliases',
      ping: 'Health check',
    },
    examples: {
      text: 'https://ai.do/$generate({"prompt":"Hello","model":"fast"})',
      object: 'https://ai.do/$generate({"prompt":"Summarize X","schema":{"summary":"..."},"model":"best"})',
    },
    models: Object.keys(MODEL_ALIASES),
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // API discovery
    if (url.pathname === '/') {
      return handleDiscovery()
    }

    // RPC calls
    if (url.pathname.startsWith('/$')) {
      return handleRPC(request, env)
    }

    return Response.json({ error: 'Not found' }, { status: 404 })
  },
}
