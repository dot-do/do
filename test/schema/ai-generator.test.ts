/**
 * @dotdo/do - AI Generator Tests (TDD)
 *
 * Tests for AI generation functionality.
 * Following TDD methodology: RED -> GREEN -> REFACTOR
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { $ } from '../../src/schema/$'
import type { AIGenerator, GeneratorProvider, GenerateOptions } from '../../src/schema/ai-generator'
import { createAIGenerator, getCascadeFields, generateCascade } from '../../src/schema/ai-generator'

// =============================================================================
// RED Phase 5: AIGenerator.generate() interface
// =============================================================================

describe('AIGenerator', () => {
  // Mock provider for testing
  const mockProvider: GeneratorProvider = {
    name: 'mock',
    generate: vi.fn(async (prompt: string, options?: GenerateOptions) => {
      // Return mock data based on hints in the prompt
      if (prompt.includes('name')) return 'John Doe'
      if (prompt.includes('bio')) return 'A passionate developer with 10 years of experience.'
      if (prompt.includes('interests')) return JSON.stringify(['coding', 'reading', 'hiking'])
      if (prompt.includes('age')) return '30'
      return 'Generated content'
    }),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('.generate() interface', () => {
    it('generates string value based on schema', async () => {
      const generator = createAIGenerator(mockProvider)
      const schema = $.string().ai({ description: 'Full name', examples: ['John Doe'] })
      const result = await generator.generate(schema)
      expect(typeof result).toBe('string')
      expect(mockProvider.generate).toHaveBeenCalled()
    })

    it('generates number value based on schema', async () => {
      const generator = createAIGenerator(mockProvider)
      const schema = $.number().ai({ description: 'Age in years', min: 18, max: 100 })
      const result = await generator.generate(schema)
      expect(typeof result).toBe('number')
    })

    it('generates array values based on schema', async () => {
      const generator = createAIGenerator(mockProvider)
      const schema = $.array($.string()).ai({ generate: true, count: 3, description: 'interests' })
      const result = await generator.generate(schema)
      expect(Array.isArray(result)).toBe(true)
    })

    it('generates object values based on schema', async () => {
      const generator = createAIGenerator(mockProvider)
      const schema = $.schema({
        name: $.string().ai({ description: 'name', generate: true }),
        bio: $.string().ai({ description: 'bio', generate: true }),
      })
      const result = await generator.generate(schema)
      expect(typeof result).toBe('object')
      expect(result).toHaveProperty('name')
      expect(result).toHaveProperty('bio')
    })

    it('skips fields without generate: true', async () => {
      const generator = createAIGenerator(mockProvider)
      const schema = $.schema({
        name: $.string().ai({ description: 'name' }), // no generate: true
        bio: $.string().ai({ description: 'bio', generate: true }),
      })
      const result = await generator.generate(schema)
      expect(result).not.toHaveProperty('name')
      expect(result).toHaveProperty('bio')
    })

    it('respects maxLength hint for strings', async () => {
      const provider: GeneratorProvider = {
        name: 'length-aware',
        generate: vi.fn(async () => 'A'.repeat(1000)),
      }
      const generator = createAIGenerator(provider)
      const schema = $.string().ai({ generate: true, maxLength: 100 })
      const result = await generator.generate(schema)
      expect(result.length).toBeLessThanOrEqual(100)
    })

    it('respects count hint for arrays', async () => {
      const provider: GeneratorProvider = {
        name: 'array-aware',
        generate: vi.fn(async () => JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'])),
      }
      const generator = createAIGenerator(provider)
      const schema = $.array($.string()).ai({ generate: true, count: 5 })
      const result = await generator.generate(schema)
      expect(result.length).toBe(5)
    })

    it('passes context to provider', async () => {
      const generator = createAIGenerator(mockProvider)
      const schema = $.string().ai({ generate: true, description: 'name' })
      const context = { userId: '123', sessionId: 'abc' }
      await generator.generate(schema, { context })
      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ context })
      )
    })

    it('includes examples in prompt', async () => {
      const generator = createAIGenerator(mockProvider)
      const schema = $.string().ai({
        generate: true,
        description: 'name',
        examples: ['John Doe', 'Jane Smith'],
      })
      await generator.generate(schema)
      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.stringContaining('John Doe'),
        expect.any(Object)
      )
    })

    it('includes custom prompt in generation request', async () => {
      const generator = createAIGenerator(mockProvider)
      const schema = $.string().ai({
        generate: true,
        prompt: 'Generate a creative username',
      })
      await generator.generate(schema)
      expect(mockProvider.generate).toHaveBeenCalledWith(
        expect.stringContaining('Generate a creative username'),
        expect.any(Object)
      )
    })
  })

  // ===========================================================================
  // RED Phase 6: getCascadeFields() detects ->Type[] relationships
  // ===========================================================================

  describe('getCascadeFields()', () => {
    it('returns empty array when no cascade fields', () => {
      const schema = $.schema({
        name: $.string(),
        email: $.string(),
      })
      const cascadeFields = getCascadeFields(schema)
      expect(cascadeFields).toEqual([])
    })

    it('detects array of references as cascade fields', () => {
      const schema = $.schema({
        name: $.string(),
        posts: $.array($.ref('Post')).ai({ cascade: true }),
      })
      const cascadeFields = getCascadeFields(schema)
      expect(cascadeFields).toContainEqual({
        field: 'posts',
        type: 'Post',
        isArray: true,
      })
    })

    it('detects single reference as cascade field', () => {
      const schema = $.schema({
        name: $.string(),
        author: $.ref('User').ai({ cascade: true }),
      })
      const cascadeFields = getCascadeFields(schema)
      expect(cascadeFields).toContainEqual({
        field: 'author',
        type: 'User',
        isArray: false,
      })
    })

    it('ignores references without cascade: true', () => {
      const schema = $.schema({
        name: $.string(),
        author: $.ref('User'), // no cascade
        posts: $.array($.ref('Post')), // no cascade
      })
      const cascadeFields = getCascadeFields(schema)
      expect(cascadeFields).toEqual([])
    })

    it('detects multiple cascade fields', () => {
      const schema = $.schema({
        name: $.string(),
        posts: $.array($.ref('Post')).ai({ cascade: true }),
        comments: $.array($.ref('Comment')).ai({ cascade: true }),
        profile: $.ref('Profile').ai({ cascade: true }),
      })
      const cascadeFields = getCascadeFields(schema)
      expect(cascadeFields).toHaveLength(3)
    })

    it('extracts count from array cascade hints', () => {
      const schema = $.schema({
        posts: $.array($.ref('Post')).ai({ cascade: true, count: 3 }),
      })
      const cascadeFields = getCascadeFields(schema)
      expect(cascadeFields[0]).toMatchObject({
        field: 'posts',
        count: 3,
      })
    })
  })

  // ===========================================================================
  // RED Phase 7: generateCascade() creates parent then children
  // ===========================================================================

  describe('generateCascade()', () => {
    const schemas = {
      User: $.schema({
        name: $.string().ai({ generate: true, description: 'name' }),
        posts: $.array($.ref('Post')).ai({ cascade: true, count: 2 }),
      }),
      Post: $.schema({
        title: $.string().ai({ generate: true, description: 'post title' }),
        content: $.string().ai({ generate: true, description: 'post content' }),
        comments: $.array($.ref('Comment')).ai({ cascade: true, count: 3 }),
      }),
      Comment: $.schema({
        text: $.string().ai({ generate: true, description: 'comment text' }),
      }),
    }

    it('generates parent entity', async () => {
      const generator = createAIGenerator(mockProvider)
      const result = await generateCascade(generator, schemas, 'User')
      expect(result.parent).toBeDefined()
      expect(result.parent).toHaveProperty('name')
    })

    it('generates child entities', async () => {
      const generator = createAIGenerator(mockProvider)
      const result = await generateCascade(generator, schemas, 'User')
      expect(result.children).toBeDefined()
      expect(result.children.Post).toBeDefined()
      expect(Array.isArray(result.children.Post)).toBe(true)
    })

    it('respects count hint for array children', async () => {
      const generator = createAIGenerator(mockProvider)
      const result = await generateCascade(generator, schemas, 'User')
      expect(result.children.Post).toHaveLength(2)
    })

    it('links children to parent via $ref', async () => {
      const generator = createAIGenerator(mockProvider)
      const result = await generateCascade(generator, schemas, 'User')
      const posts = result.children.Post
      for (const post of posts) {
        expect(post).toHaveProperty('$parentRef')
        expect(post.$parentRef).toBe(result.parent.$id)
      }
    })

    it('generates nested cascade (grandchildren)', async () => {
      const generator = createAIGenerator(mockProvider)
      const result = await generateCascade(generator, schemas, 'User', { maxDepth: 3 })
      // User -> Post -> Comment
      expect(result.children.Comment).toBeDefined()
      expect(Array.isArray(result.children.Comment)).toBe(true)
    })

    it('respects maxDepth option', async () => {
      const generator = createAIGenerator(mockProvider)
      const result = await generateCascade(generator, schemas, 'User', { maxDepth: 1 })
      // Should only generate User, not Posts
      expect(result.children.Post).toBeUndefined()
    })

    it('maxDepth: 2 generates parent and direct children only', async () => {
      const generator = createAIGenerator(mockProvider)
      const result = await generateCascade(generator, schemas, 'User', { maxDepth: 2 })
      // Should generate User and Posts, but not Comments
      expect(result.children.Post).toBeDefined()
      expect(result.children.Comment).toBeUndefined()
    })

    it('returns flat array of all generated entities', async () => {
      const generator = createAIGenerator(mockProvider)
      const result = await generateCascade(generator, schemas, 'User', { maxDepth: 3 })
      expect(result.all).toBeDefined()
      expect(Array.isArray(result.all)).toBe(true)
      // Should include User + 2 Posts + 6 Comments (2 * 3)
      expect(result.all.length).toBeGreaterThan(0)
    })

    it('assigns unique $id to each generated entity', async () => {
      const generator = createAIGenerator(mockProvider)
      const result = await generateCascade(generator, schemas, 'User', { maxDepth: 2 })
      const ids = result.all.map((e) => e.$id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })

    it('assigns $type to each generated entity', async () => {
      const generator = createAIGenerator(mockProvider)
      const result = await generateCascade(generator, schemas, 'User', { maxDepth: 2 })
      for (const entity of result.all) {
        expect(entity.$type).toBeDefined()
        expect(['User', 'Post', 'Comment']).toContain(entity.$type)
      }
    })
  })

  // ===========================================================================
  // RED Phase 8: Pluggable generator providers
  // ===========================================================================

  describe('Pluggable providers', () => {
    it('accepts custom provider', () => {
      const customProvider: GeneratorProvider = {
        name: 'custom',
        generate: async () => 'custom result',
      }
      const generator = createAIGenerator(customProvider)
      expect(generator).toBeDefined()
    })

    it('provider receives schema info', async () => {
      const spyProvider: GeneratorProvider = {
        name: 'spy',
        generate: vi.fn(async () => 'result'),
      }
      const generator = createAIGenerator(spyProvider)
      const schema = $.string().ai({ description: 'test', generate: true })
      await generator.generate(schema)
      expect(spyProvider.generate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'string',
        })
      )
    })

    it('provider receives AI hints', async () => {
      const spyProvider: GeneratorProvider = {
        name: 'spy',
        generate: vi.fn(async () => 'result'),
      }
      const generator = createAIGenerator(spyProvider)
      const schema = $.string().ai({
        description: 'Test description',
        generate: true,
        maxLength: 100,
      })
      await generator.generate(schema)
      expect(spyProvider.generate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          hints: expect.objectContaining({
            description: 'Test description',
            maxLength: 100,
          }),
        })
      )
    })

    it('supports async provider', async () => {
      const asyncProvider: GeneratorProvider = {
        name: 'async',
        generate: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return 'async result'
        },
      }
      const generator = createAIGenerator(asyncProvider)
      const schema = $.string().ai({ generate: true })
      const result = await generator.generate(schema)
      expect(result).toBe('async result')
    })

    it('handles provider errors gracefully', async () => {
      const errorProvider: GeneratorProvider = {
        name: 'error',
        generate: async () => {
          throw new Error('Provider failed')
        },
      }
      const generator = createAIGenerator(errorProvider)
      const schema = $.string().ai({ generate: true })
      await expect(generator.generate(schema)).rejects.toThrow('Provider failed')
    })

    it('allows provider to access field name', async () => {
      const spyProvider: GeneratorProvider = {
        name: 'spy',
        generate: vi.fn(async () => 'result'),
      }
      const generator = createAIGenerator(spyProvider)
      const schema = $.schema({
        username: $.string().ai({ generate: true }),
      })
      await generator.generate(schema)
      expect(spyProvider.generate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          fieldName: 'username',
        })
      )
    })
  })
})
