/**
 * ai.do - AI models as an RPC service
 *
 * Usage via do.do:
 *   await env.DO.ai.generate(prompt)
 *   await env.DO.ai.embed(text)
 *   await env.DO.ai.chat([{ role: 'user', content: '...' }])
 */

import { RPC } from '../../src/rpc-wrapper'

interface Env {
  AI: Ai  // Cloudflare Workers AI binding
}

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// AI service exposes simplified interfaces
export default RPC((env: Env) => ({
  /**
   * Generate text from a prompt
   */
  async generate(prompt: string, options?: { model?: string; maxTokens?: number }) {
    const model = options?.model || '@cf/meta/llama-3.1-8b-instruct'
    const response = await env.AI.run(model, {
      prompt,
      max_tokens: options?.maxTokens || 1024
    })
    return response
  },

  /**
   * Chat completion
   */
  async chat(messages: Message[], options?: { model?: string }) {
    const model = options?.model || '@cf/meta/llama-3.1-8b-instruct'
    const response = await env.AI.run(model, { messages })
    return response
  },

  /**
   * Generate embeddings
   */
  async embed(text: string | string[], options?: { model?: string }) {
    const model = options?.model || '@cf/baai/bge-base-en-v1.5'
    const input = Array.isArray(text) ? text : [text]
    const response = await env.AI.run(model, { text: input })
    return response
  },

  /**
   * Image generation
   */
  async image(prompt: string, options?: { model?: string }) {
    const model = options?.model || '@cf/stabilityai/stable-diffusion-xl-base-1.0'
    const response = await env.AI.run(model, { prompt })
    return response
  }
}))
