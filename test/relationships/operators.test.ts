import { describe, it, expect } from 'vitest'
import { parseOperator, splitChainedOperators, RelationshipDirection, RelationshipMode } from '../../src/relationships/operators'

describe('parseOperator', () => {
  describe('-> forward exact', () => {
    it('parses simple type reference', () => {
      const result = parseOperator('->User')
      expect(result).toEqual({
        direction: 'forward',
        mode: 'exact',
        type: 'User',
        isArray: false,
      })
    })

    it('parses array type reference', () => {
      const result = parseOperator('->Post[]')
      expect(result).toEqual({
        direction: 'forward',
        mode: 'exact',
        type: 'Post',
        isArray: true,
      })
    })

    it('parses type with numbers', () => {
      const result = parseOperator('->User123')
      expect(result).toEqual({
        direction: 'forward',
        mode: 'exact',
        type: 'User123',
        isArray: false,
      })
    })
  })

  describe('~> forward fuzzy', () => {
    it('parses fuzzy forward reference', () => {
      const result = parseOperator('~>Tag')
      expect(result).toEqual({
        direction: 'forward',
        mode: 'fuzzy',
        type: 'Tag',
        isArray: false,
      })
    })

    it('parses fuzzy forward array reference', () => {
      const result = parseOperator('~>Category[]')
      expect(result).toEqual({
        direction: 'forward',
        mode: 'fuzzy',
        type: 'Category',
        isArray: true,
      })
    })
  })

  describe('<- backward exact', () => {
    it('parses backward exact reference', () => {
      const result = parseOperator('<-Post')
      expect(result).toEqual({
        direction: 'backward',
        mode: 'exact',
        type: 'Post',
        isArray: false,
      })
    })

    it('parses backward exact array reference', () => {
      const result = parseOperator('<-Comment[]')
      expect(result).toEqual({
        direction: 'backward',
        mode: 'exact',
        type: 'Comment',
        isArray: true,
      })
    })
  })

  describe('<~ backward fuzzy', () => {
    it('parses backward fuzzy reference', () => {
      const result = parseOperator('<~Article')
      expect(result).toEqual({
        direction: 'backward',
        mode: 'fuzzy',
        type: 'Article',
        isArray: false,
      })
    })

    it('parses backward fuzzy array reference', () => {
      const result = parseOperator('<~RelatedPost[]')
      expect(result).toEqual({
        direction: 'backward',
        mode: 'fuzzy',
        type: 'RelatedPost',
        isArray: true,
      })
    })
  })

  describe('error handling', () => {
    it('throws OperatorParseError on invalid operator', () => {
      expect(() => parseOperator('>>User')).toThrow(/Invalid operator format/)
    })

    it('throws on empty string', () => {
      expect(() => parseOperator('')).toThrow(/cannot be empty/)
    })

    it('throws on missing type', () => {
      expect(() => parseOperator('->')).toThrow(/Invalid operator format/)
    })

    it('allows lowercase type names for relationship types', () => {
      const result = parseOperator('->user')
      expect(result.type).toBe('user')
      expect(result.direction).toBe('forward')
      expect(result.mode).toBe('exact')
    })

    it('throws on type starting with number', () => {
      expect(() => parseOperator('->123User')).toThrow(/Invalid operator format/)
    })

    it('throws on whitespace in operator', () => {
      expect(() => parseOperator('-> User')).toThrow(/Invalid operator format/)
    })

    it('allows underscores in type names for relationship types', () => {
      // Underscores are allowed to support relationship types like 'works_at'
      const result = parseOperator('->works_at')
      expect(result.type).toBe('works_at')
      expect(result.direction).toBe('forward')
      expect(result.mode).toBe('exact')
    })

    it('throws on invalid characters in type', () => {
      // Hyphens and other special characters are not allowed
      expect(() => parseOperator('->User-Name')).toThrow(/Invalid operator format/)
    })

    it('includes operator string in error', () => {
      try {
        parseOperator('>>Invalid')
        expect.fail('Should have thrown')
      } catch (error) {
        // Check error properties instead of instanceof (doesn't work across RPC boundaries)
        // Custom properties like 'operator' don't survive RPC serialization, but the operator
        // string is included in the message, so verify it there
        expect(error).toHaveProperty('name', 'OperatorParseError')
        const message = (error as Error).message
        expect(message).toContain('Invalid operator format')
        expect(message).toContain('>>Invalid')
      }
    })
  })

  describe('type assertions', () => {
    it('returns correct RelationshipDirection type', () => {
      const result = parseOperator('->User')
      const direction: RelationshipDirection = result.direction
      expect(direction).toBe('forward')
    })

    it('returns correct RelationshipMode type', () => {
      const result = parseOperator('~>Tag')
      const mode: RelationshipMode = result.mode
      expect(mode).toBe('fuzzy')
    })
  })

  describe('<-> bidirectional', () => {
    it('parses bidirectional reference', () => {
      const result = parseOperator('<->friend')
      expect(result).toEqual({
        direction: 'bidirectional',
        mode: 'exact',
        type: 'friend',
        isArray: false,
      })
    })

    it('parses bidirectional array reference', () => {
      const result = parseOperator('<->connection[]')
      expect(result).toEqual({
        direction: 'bidirectional',
        mode: 'exact',
        type: 'connection',
        isArray: true,
      })
    })

    it('parses bidirectional with PascalCase type', () => {
      const result = parseOperator('<->Friend')
      expect(result).toEqual({
        direction: 'bidirectional',
        mode: 'exact',
        type: 'Friend',
        isArray: false,
      })
    })
  })
})

describe('splitChainedOperators', () => {
  describe('single operators', () => {
    it('returns single element array for simple operator', () => {
      const result = splitChainedOperators('->knows')
      expect(result).toEqual(['->knows'])
    })

    it('returns single element array for bidirectional operator', () => {
      const result = splitChainedOperators('<->friend')
      expect(result).toEqual(['<->friend'])
    })

    it('returns single element array for backward operator', () => {
      const result = splitChainedOperators('<-follows')
      expect(result).toEqual(['<-follows'])
    })

    it('returns single element array for fuzzy operator', () => {
      const result = splitChainedOperators('~>similar')
      expect(result).toEqual(['~>similar'])
    })
  })

  describe('chained operators', () => {
    it('splits two chained forward operators', () => {
      const result = splitChainedOperators('->knows->works_at')
      expect(result).toEqual(['->knows', '->works_at'])
    })

    it('splits three chained operators', () => {
      const result = splitChainedOperators('->user->posts->comments')
      expect(result).toEqual(['->user', '->posts', '->comments'])
    })

    it('splits mixed direction operators', () => {
      const result = splitChainedOperators('->authored<-comments')
      expect(result).toEqual(['->authored', '<-comments'])
    })

    it('splits operators with bidirectional', () => {
      const result = splitChainedOperators('<->friend->employer')
      expect(result).toEqual(['<->friend', '->employer'])
    })

    it('splits operators with fuzzy', () => {
      const result = splitChainedOperators('->type~>similar')
      expect(result).toEqual(['->type', '~>similar'])
    })
  })

  describe('error handling', () => {
    it('throws on empty string', () => {
      expect(() => splitChainedOperators('')).toThrow(/cannot be empty/)
    })

    it('throws on invalid operator format', () => {
      expect(() => splitChainedOperators('>>invalid')).toThrow(/Invalid operator format/)
    })
  })
})
