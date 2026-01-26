/**
 * mdx.do - MDX compilation and rendering as an RPC service
 *
 * Heavy dependency (@mdx-js/mdx) isolated as a service.
 *
 * Usage via do binding:
 *   const compiled = await env.do.mdx.compile(mdxSource)
 *   const rendered = await env.do.mdx.render(compiled, { props })
 *   const evaluated = await env.do.mdx.evaluate(mdxSource, { components })
 */

import { RPC } from '../../src/index.js'
import { compile, run, evaluate } from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'

interface CompileOptions {
  jsx?: boolean
  format?: 'mdx' | 'md'
  development?: boolean
  remarkPlugins?: string[]
  rehypePlugins?: string[]
}

interface RenderOptions {
  props?: Record<string, unknown>
  components?: Record<string, string>
}

interface EvaluateOptions extends CompileOptions, RenderOptions {}

export default RPC({
  /**
   * Compile MDX source to JavaScript
   *
   * @example
   * const compiled = await env.do.mdx.compile('# Hello\n\n<Button />')
   * // Returns: { code: 'function MDXContent(props) {...}', ... }
   */
  async compile(source: string, options: CompileOptions = {}) {
    const result = await compile(source, {
      jsx: options.jsx ?? false,
      format: options.format ?? 'mdx',
      development: options.development ?? false,
      outputFormat: 'function-body',
    })

    return {
      code: String(result),
      matter: result.data?.matter,
    }
  },

  /**
   * Evaluate MDX source and return the rendered content
   *
   * @example
   * const { default: Content } = await env.do.mdx.evaluate('# Hello {name}', {
   *   props: { name: 'World' }
   * })
   */
  async evaluate(source: string, options: EvaluateOptions = {}) {
    const { default: MDXContent, ...exports } = await evaluate(source, {
      ...runtime,
      development: options.development ?? false,
    })

    // Note: In a real implementation, we'd need to handle React rendering
    // For now, return the compiled function and exports
    return {
      exports: Object.keys(exports),
      // The actual rendering would happen client-side or via ai-evaluate
    }
  },

  /**
   * Transform MDX to HTML (server-side rendering)
   *
   * Uses ai-evaluate for safe execution of the compiled MDX
   */
  async render(source: string, options: RenderOptions = {}) {
    // Compile the MDX
    const compiled = await compile(source, {
      outputFormat: 'function-body',
      development: false,
    })

    // In production, this would use ai-evaluate for safe execution
    // For now, return the compiled code
    return {
      code: String(compiled),
      props: options.props,
    }
  },

  /**
   * Parse frontmatter from MDX
   */
  async frontmatter(source: string) {
    // Simple frontmatter extraction
    const match = source.match(/^---\n([\s\S]*?)\n---/)
    if (!match) return {}

    const lines = match[1].split('\n')
    const data: Record<string, string> = {}

    for (const line of lines) {
      const [key, ...valueParts] = line.split(':')
      if (key && valueParts.length) {
        data[key.trim()] = valueParts.join(':').trim()
      }
    }

    return data
  },

  /**
   * Lint MDX source for errors
   */
  async lint(source: string) {
    try {
      await compile(source, { development: true })
      return { valid: true, errors: [] }
    } catch (err: any) {
      return {
        valid: false,
        errors: [{
          message: err.message,
          line: err.line,
          column: err.column,
        }]
      }
    }
  },
})
