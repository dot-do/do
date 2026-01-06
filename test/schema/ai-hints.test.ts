/**
 * @dotdo/do - Schema AI Hints Tests (TDD)
 *
 * Tests for AI generation hints on schema types.
 * Following TDD methodology: RED -> GREEN -> REFACTOR
 */

import { describe, it, expect } from 'vitest'
import { $ } from '../../src/schema/$'

// =============================================================================
// RED Phase 1: .ai() hint method on schema types
// =============================================================================

describe('AI Hints', () => {
  describe('.ai() method', () => {
    it('adds AI hints to string type', () => {
      const schema = $.string().ai({ description: 'Full name', examples: ['John Doe'] })
      expect(schema).toBeDefined()
      expect(typeof schema.validate).toBe('function')
    })

    it('returns the same type after .ai()', () => {
      const schema = $.string().ai({ description: 'A name' })
      const result = schema.validate('test')
      expect(result.success).toBe(true)
      expect(result.data).toBe('test')
    })

    it('adds AI hints to number type', () => {
      const schema = $.number().ai({ description: 'Age in years', min: 0, max: 150 })
      expect(schema).toBeDefined()
      const result = schema.validate(25)
      expect(result.success).toBe(true)
    })

    it('adds AI hints to boolean type', () => {
      const schema = $.boolean().ai({ description: 'Whether the user is active' })
      expect(schema).toBeDefined()
      const result = schema.validate(true)
      expect(result.success).toBe(true)
    })

    it('adds AI hints to array type', () => {
      const schema = $.array($.string()).ai({ generate: true, count: 5 })
      expect(schema).toBeDefined()
      const result = schema.validate(['a', 'b'])
      expect(result.success).toBe(true)
    })

    it('adds AI hints to object type', () => {
      const schema = $.object({ name: $.string() }).ai({ description: 'A user object' })
      expect(schema).toBeDefined()
      const result = schema.validate({ name: 'test' })
      expect(result.success).toBe(true)
    })

    it('adds AI hints to schema type', () => {
      const schema = $.schema({ name: $.string() }).ai({ description: 'User schema' })
      expect(schema).toBeDefined()
      const result = schema.validate({ name: 'test' })
      expect(result.success).toBe(true)
    })

    it('supports generate flag', () => {
      const schema = $.string().ai({ generate: true, maxLength: 500 })
      expect(schema).toBeDefined()
    })

    it('supports multiple chained calls', () => {
      const schema = $.string()
        .ai({ description: 'First hint' })
        .ai({ examples: ['example1'] })
      expect(schema).toBeDefined()
    })
  })

  // ===========================================================================
  // RED Phase 2: getAIHints() method
  // ===========================================================================

  describe('.getAIHints()', () => {
    it('returns undefined when no hints are set', () => {
      const schema = $.string()
      expect(schema.getAIHints()).toBeUndefined()
    })

    it('returns hints when set via .ai()', () => {
      const schema = $.string().ai({ description: 'Full name' })
      const hints = schema.getAIHints()
      expect(hints).toBeDefined()
      expect(hints?.description).toBe('Full name')
    })

    it('returns all hint properties', () => {
      const schema = $.string().ai({
        description: 'User bio',
        generate: true,
        maxLength: 500,
        examples: ['Example bio'],
      })
      const hints = schema.getAIHints()
      expect(hints?.description).toBe('User bio')
      expect(hints?.generate).toBe(true)
      expect(hints?.maxLength).toBe(500)
      expect(hints?.examples).toEqual(['Example bio'])
    })

    it('merges hints from multiple .ai() calls', () => {
      const schema = $.string()
        .ai({ description: 'Name' })
        .ai({ examples: ['John', 'Jane'] })
      const hints = schema.getAIHints()
      expect(hints?.description).toBe('Name')
      expect(hints?.examples).toEqual(['John', 'Jane'])
    })

    it('later .ai() calls override earlier values', () => {
      const schema = $.string()
        .ai({ description: 'First' })
        .ai({ description: 'Second' })
      const hints = schema.getAIHints()
      expect(hints?.description).toBe('Second')
    })

    it('works on array types', () => {
      const schema = $.array($.string()).ai({ count: 5, generate: true })
      const hints = schema.getAIHints()
      expect(hints?.count).toBe(5)
      expect(hints?.generate).toBe(true)
    })

    it('works on object types', () => {
      const schema = $.object({ name: $.string() }).ai({ description: 'User object' })
      const hints = schema.getAIHints()
      expect(hints?.description).toBe('User object')
    })
  })

  // ===========================================================================
  // RED Phase 3: AIMetadata type structure
  // ===========================================================================

  describe('AIMetadata type', () => {
    it('supports description property', () => {
      const schema = $.string().ai({ description: 'A description' })
      expect(schema.getAIHints()?.description).toBe('A description')
    })

    it('supports examples array', () => {
      const schema = $.string().ai({ examples: ['example1', 'example2'] })
      expect(schema.getAIHints()?.examples).toEqual(['example1', 'example2'])
    })

    it('supports generate boolean', () => {
      const schema = $.string().ai({ generate: true })
      expect(schema.getAIHints()?.generate).toBe(true)
    })

    it('supports maxLength number', () => {
      const schema = $.string().ai({ maxLength: 100 })
      expect(schema.getAIHints()?.maxLength).toBe(100)
    })

    it('supports minLength number', () => {
      const schema = $.string().ai({ minLength: 10 })
      expect(schema.getAIHints()?.minLength).toBe(10)
    })

    it('supports count for arrays', () => {
      const schema = $.array($.string()).ai({ count: 3 })
      expect(schema.getAIHints()?.count).toBe(3)
    })

    it('supports min/max for numbers', () => {
      const schema = $.number().ai({ min: 0, max: 100 })
      const hints = schema.getAIHints()
      expect(hints?.min).toBe(0)
      expect(hints?.max).toBe(100)
    })

    it('supports prompt for custom generation instructions', () => {
      const schema = $.string().ai({ prompt: 'Generate a creative bio' })
      expect(schema.getAIHints()?.prompt).toBe('Generate a creative bio')
    })

    it('supports format for structured output', () => {
      const schema = $.string().ai({ format: 'email' })
      expect(schema.getAIHints()?.format).toBe('email')
    })
  })

  // ===========================================================================
  // RED Phase 4: toJSONSchema() includes AI hints in $comment
  // ===========================================================================

  describe('toJSONSchema() with AI hints', () => {
    it('includes AI hints in $comment for string field', () => {
      const schema = $.schema({
        name: $.string().ai({ description: 'Full name', examples: ['John Doe'] }),
      })
      const jsonSchema = schema.toJSONSchema()
      expect(jsonSchema.properties?.name).toHaveProperty('$comment')
      const comment = JSON.parse(jsonSchema.properties!.name.$comment!)
      expect(comment.ai).toBeDefined()
      expect(comment.ai.description).toBe('Full name')
    })

    it('includes AI hints in nested object fields', () => {
      const schema = $.schema({
        user: $.object({
          bio: $.string().ai({ generate: true, maxLength: 500 }),
        }),
      })
      const jsonSchema = schema.toJSONSchema()
      const userSchema = jsonSchema.properties?.user
      const bioSchema = userSchema?.properties?.bio
      expect(bioSchema).toHaveProperty('$comment')
      const comment = JSON.parse(bioSchema!.$comment!)
      expect(comment.ai.generate).toBe(true)
      expect(comment.ai.maxLength).toBe(500)
    })

    it('omits $comment when no AI hints', () => {
      const schema = $.schema({
        name: $.string(),
      })
      const jsonSchema = schema.toJSONSchema()
      expect(jsonSchema.properties?.name).not.toHaveProperty('$comment')
    })

    it('includes all hint properties in $comment', () => {
      const schema = $.schema({
        bio: $.string().ai({
          description: 'User biography',
          generate: true,
          maxLength: 500,
          prompt: 'Write a professional bio',
          examples: ['Experienced developer...'],
        }),
      })
      const jsonSchema = schema.toJSONSchema()
      const comment = JSON.parse(jsonSchema.properties!.bio.$comment!)
      expect(comment.ai.description).toBe('User biography')
      expect(comment.ai.generate).toBe(true)
      expect(comment.ai.maxLength).toBe(500)
      expect(comment.ai.prompt).toBe('Write a professional bio')
      expect(comment.ai.examples).toEqual(['Experienced developer...'])
    })

    it('includes array AI hints', () => {
      const schema = $.schema({
        interests: $.array($.string()).ai({ generate: true, count: 5 }),
      })
      const jsonSchema = schema.toJSONSchema()
      const comment = JSON.parse(jsonSchema.properties!.interests.$comment!)
      expect(comment.ai.generate).toBe(true)
      expect(comment.ai.count).toBe(5)
    })
  })
})
