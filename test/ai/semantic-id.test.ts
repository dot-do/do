import { describe, it, expect } from 'vitest'
import { toSemanticId, SemanticIdGenerator } from '../../src/ai/semantic-id'

describe('toSemanticId', () => {
  it('converts simple phrases', () => {
    expect(toSemanticId('AI Research Lab')).toBe('ai-research-lab')
    expect(toSemanticId('Prompt Engineering')).toBe('prompt-engineering')
  })

  it('handles special characters', () => {
    expect(toSemanticId("O'Reilly Media")).toBe('oreilly-media')
    expect(toSemanticId('C++ Programming')).toBe('c-programming')
    expect(toSemanticId('Node.js')).toBe('nodejs')
  })

  it('handles multiple spaces', () => {
    expect(toSemanticId('AI  Research   Lab')).toBe('ai-research-lab')
  })

  it('trims leading/trailing spaces', () => {
    expect(toSemanticId('  AI Research  ')).toBe('ai-research')
  })

  it('handles numbers', () => {
    expect(toSemanticId('Web 3.0')).toBe('web-30')
    expect(toSemanticId('24/7 Support')).toBe('247-support')
  })

  it('handles empty or whitespace strings', () => {
    expect(toSemanticId('')).toBe('')
    expect(toSemanticId('   ')).toBe('')
  })

  it('handles unicode', () => {
    expect(toSemanticId('Cafe')).toBe('cafe')
    expect(toSemanticId('naive')).toBe('naive')
  })

  it('limits length', () => {
    const long = 'This is a very long company name that should be truncated'
    const result = toSemanticId(long, { maxLength: 30 })
    expect(result.length).toBeLessThanOrEqual(30)
    expect(result).not.toMatch(/-$/)
  })
})

describe('SemanticIdGenerator', () => {
  it('generates unique IDs for duplicates', () => {
    const generator = new SemanticIdGenerator()

    const id1 = generator.generate('AI Research')
    const id2 = generator.generate('AI Research')
    const id3 = generator.generate('AI Research')

    expect(id1).toBe('ai-research')
    expect(id2).toBe('ai-research-1')
    expect(id3).toBe('ai-research-2')
  })

  it('tracks IDs across different bases', () => {
    const generator = new SemanticIdGenerator()

    expect(generator.generate('Test')).toBe('test')
    expect(generator.generate('Other')).toBe('other')
    expect(generator.generate('Test')).toBe('test-1')
  })

  it('can be initialized with existing IDs', () => {
    const generator = new SemanticIdGenerator(['ai-research', 'ai-research-1'])

    expect(generator.generate('AI Research')).toBe('ai-research-2')
  })

  it('can check if ID exists', () => {
    const generator = new SemanticIdGenerator()
    generator.generate('Test')

    expect(generator.exists('test')).toBe(true)
    expect(generator.exists('other')).toBe(false)
  })
})
