import { describe, it, expect, beforeEach } from 'vitest'
import {
  VectorSearchProvider,
  MemoryVectorProvider,
  registerVectorProvider,
  getVectorProvider,
  listVectorProviders,
  setDefaultVectorProvider,
  clearVectorProviders,
  cosineSimilarity,
  normalizeVector,
  type VectorSearchResult,
} from '../../src/search/vector'

/**
 * GREEN Phase Tests for VectorSearchProvider Interface
 *
 * These tests verify the implementation of vector search providers
 * that will be used in hybrid search alongside FTS.
 *
 * The VectorSearchProvider interface enables:
 * 1. Text embedding generation
 * 2. Vector similarity search
 * 3. Provider registration and retrieval
 */

describe('VectorSearchProvider Interface', () => {
  describe('VectorSearchResult type', () => {
    it('has required id property (string)', () => {
      const result: VectorSearchResult = { id: 'test-123', score: 0.95 }
      expect(result.id).toBe('test-123')
      expect(typeof result.id).toBe('string')
    })

    it('has required score property (number between 0 and 1)', () => {
      const result: VectorSearchResult = { id: 'test', score: 0.75 }
      expect(result.score).toBe(0.75)
      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThanOrEqual(1)
    })

    it('has optional data property (unknown)', () => {
      const result: VectorSearchResult = {
        id: 'test',
        score: 0.5,
        data: { title: 'Hello', count: 42 },
      }
      expect(result.data).toEqual({ title: 'Hello', count: 42 })
    })

    it('has optional embedding property (number[])', () => {
      const result: VectorSearchResult = {
        id: 'test',
        score: 0.5,
        embedding: [0.1, 0.2, 0.3],
      }
      expect(result.embedding).toEqual([0.1, 0.2, 0.3])
    })
  })

  describe('VectorSearchProvider interface definition', () => {
    let provider: MemoryVectorProvider

    beforeEach(() => {
      provider = new MemoryVectorProvider('test', 384)
    })

    it('has a name property (string)', () => {
      expect(provider.name).toBe('test')
      expect(typeof provider.name).toBe('string')
    })

    it('has a dimensions property (number)', () => {
      expect(provider.dimensions).toBe(384)
      expect(typeof provider.dimensions).toBe('number')
    })

    it('has an embed method', () => {
      expect(typeof provider.embed).toBe('function')
    })

    it('has a search method', () => {
      expect(typeof provider.search).toBe('function')
    })

    it('optionally has an embedBatch method for efficiency', () => {
      expect(typeof provider.embedBatch).toBe('function')
    })
  })
})

describe('VectorSearchProvider.embed()', () => {
  let provider: MemoryVectorProvider

  beforeEach(() => {
    provider = new MemoryVectorProvider('test', 384)
  })

  describe('basic embedding generation', () => {
    it('accepts a text string and returns Promise<number[]>', async () => {
      const embedding = await provider.embed('hello world')
      expect(Array.isArray(embedding)).toBe(true)
      expect(embedding.every((n) => typeof n === 'number')).toBe(true)
    })

    it('returns an embedding array with correct dimensions', async () => {
      const embedding = await provider.embed('test text')
      expect(embedding.length).toBe(384)
    })

    it('returns normalized vectors (magnitude close to 1)', async () => {
      const embedding = await provider.embed('test normalization')
      const magnitude = Math.sqrt(
        embedding.reduce((sum, x) => sum + x * x, 0)
      )
      expect(magnitude).toBeCloseTo(1, 5)
    })
  })

  describe('edge cases', () => {
    it('handles empty string input', async () => {
      const embedding = await provider.embed('')
      expect(embedding.length).toBe(384)
    })

    it('handles very long text input', async () => {
      const longText = 'a'.repeat(10000)
      const embedding = await provider.embed(longText)
      expect(embedding.length).toBe(384)
    })

    it('handles special characters and unicode', async () => {
      const embedding = await provider.embed('Hello, World! ')
      expect(embedding.length).toBe(384)
    })

    it('throws error for null/undefined input', async () => {
      await expect(provider.embed(null as any)).rejects.toThrow()
      await expect(provider.embed(undefined as any)).rejects.toThrow()
    })
  })

  describe('consistency', () => {
    it('returns same embedding for identical text', async () => {
      const embedding1 = await provider.embed('identical text')
      const embedding2 = await provider.embed('identical text')
      expect(embedding1).toEqual(embedding2)
    })

    it('returns similar embeddings for semantically similar text', async () => {
      // With hash-based embeddings, similar character sequences produce similar vectors
      const embedding1 = await provider.embed('hello world')
      const embedding2 = await provider.embed('hello world!')
      const similarity = cosineSimilarity(embedding1, embedding2)
      // Should be fairly similar (>0.8) due to shared characters
      expect(similarity).toBeGreaterThan(0.8)
    })

    it('returns different embeddings for unrelated text', async () => {
      const embedding1 = await provider.embed('hello')
      const embedding2 = await provider.embed('xyz123')
      expect(embedding1).not.toEqual(embedding2)
    })
  })
})

describe('VectorSearchProvider.embedBatch()', () => {
  let provider: MemoryVectorProvider

  beforeEach(() => {
    provider = new MemoryVectorProvider('test', 384)
  })

  describe('batch embedding generation', () => {
    it('accepts an array of strings and returns Promise<number[][]>', async () => {
      const embeddings = await provider.embedBatch(['hello', 'world'])
      expect(Array.isArray(embeddings)).toBe(true)
      expect(embeddings.length).toBe(2)
      expect(embeddings.every((e) => Array.isArray(e))).toBe(true)
    })

    it('returns embeddings in same order as input', async () => {
      const texts = ['first', 'second', 'third']
      const embeddings = await provider.embedBatch(texts)

      // Each should match individual embed call
      for (let i = 0; i < texts.length; i++) {
        const individual = await provider.embed(texts[i])
        expect(embeddings[i]).toEqual(individual)
      }
    })

    it('handles empty array input', async () => {
      const embeddings = await provider.embedBatch([])
      expect(embeddings).toEqual([])
    })
  })

  describe('performance', () => {
    // This test is marked as .todo() because performance comparison is meaningless
    // for in-memory mocks - both operations complete in <1ms, making timing unreliable.
    // For real embedding providers (API-based), batch operations would be more efficient.
    it.todo('is more efficient than calling embed() multiple times')

    it('handles large batches without timeout', async () => {
      const texts = Array.from({ length: 1000 }, (_, i) => `document ${i}`)
      const embeddings = await provider.embedBatch(texts)
      expect(embeddings.length).toBe(1000)
    })
  })
})

describe('VectorSearchProvider.search()', () => {
  let provider: MemoryVectorProvider

  beforeEach(async () => {
    provider = new MemoryVectorProvider('test', 384)
    // Add some test vectors
    const embedding1 = await provider.embed('hello world')
    const embedding2 = await provider.embed('goodbye world')
    const embedding3 = await provider.embed('completely different')
    await provider.add('doc1', embedding1, { title: 'Hello' })
    await provider.add('doc2', embedding2, { title: 'Goodbye' })
    await provider.add('doc3', embedding3, { title: 'Different' })
  })

  describe('basic search', () => {
    it('accepts embedding array and limit, returns Promise<VectorSearchResult[]>', async () => {
      const queryEmbedding = await provider.embed('hello')
      const results = await provider.search(queryEmbedding, 10)
      expect(Array.isArray(results)).toBe(true)
      results.forEach((r) => {
        expect(typeof r.id).toBe('string')
        expect(typeof r.score).toBe('number')
      })
    })

    it('returns results sorted by similarity score (descending)', async () => {
      const queryEmbedding = await provider.embed('hello world test')
      const results = await provider.search(queryEmbedding, 10)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
      }
    })

    it('returns at most limit results', async () => {
      const queryEmbedding = await provider.embed('test')
      const results = await provider.search(queryEmbedding, 2)
      expect(results.length).toBeLessThanOrEqual(2)
    })

    it('returns empty array when no similar results exist', async () => {
      await provider.clear()
      const queryEmbedding = await provider.embed('test')
      const results = await provider.search(queryEmbedding, 10)
      expect(results).toEqual([])
    })
  })

  describe('result quality', () => {
    it('returns highest scoring results first', async () => {
      const queryEmbedding = await provider.embed('hello world')
      const results = await provider.search(queryEmbedding, 3)
      // doc1 should be first since it's identical
      expect(results[0].id).toBe('doc1')
    })

    it('score is between 0 and 1 (normalized)', async () => {
      const queryEmbedding = await provider.embed('test')
      const results = await provider.search(queryEmbedding, 10)
      results.forEach((r) => {
        expect(r.score).toBeGreaterThanOrEqual(0)
        expect(r.score).toBeLessThanOrEqual(1)
      })
    })

    it('includes id for each result', async () => {
      const queryEmbedding = await provider.embed('hello')
      const results = await provider.search(queryEmbedding, 10)
      results.forEach((r) => {
        expect(r.id).toBeDefined()
        expect(typeof r.id).toBe('string')
      })
    })

    it('optionally includes original data', async () => {
      const queryEmbedding = await provider.embed('hello')
      const results = await provider.search(queryEmbedding, 10)
      const doc1Result = results.find((r) => r.id === 'doc1')
      expect(doc1Result?.data).toEqual({ title: 'Hello' })
    })
  })

  describe('search options', () => {
    it('supports minScore threshold filter', async () => {
      const queryEmbedding = await provider.embed('hello world')
      const results = await provider.search(queryEmbedding, 10, {
        minScore: 0.9,
      })
      results.forEach((r) => {
        expect(r.score).toBeGreaterThanOrEqual(0.9)
      })
    })

    it('supports namespace/collection filter', async () => {
      // Add vectors with namespaces
      const embedding = await provider.embed('namespaced doc')
      await provider.add('ns-doc1', embedding, { title: 'NS1' }, { namespace: 'collection1' })
      await provider.add('ns-doc2', embedding, { title: 'NS2' }, { namespace: 'collection2' })

      const results = await provider.search(embedding, 10, {
        namespace: 'collection1',
      })
      expect(results.every((r) => r.id === 'ns-doc1' || !r.id.startsWith('ns-'))).toBe(true)
    })

    it('supports metadata filter', async () => {
      // Add vectors with metadata
      const embedding = await provider.embed('metadata doc')
      await provider.add('meta-doc1', embedding, null, { metadata: { type: 'article' } })
      await provider.add('meta-doc2', embedding, null, { metadata: { type: 'video' } })

      const results = await provider.search(embedding, 10, {
        metadata: { type: 'article' },
      })
      expect(results.find((r) => r.id === 'meta-doc1')).toBeDefined()
      expect(results.find((r) => r.id === 'meta-doc2')).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('handles zero vector input', async () => {
      const zeroVector = new Array(384).fill(0)
      const results = await provider.search(zeroVector, 10)
      // Zero vectors should return results with score 0
      results.forEach((r) => {
        expect(r.score).toBe(0)
      })
    })

    it('handles limit of 0', async () => {
      const queryEmbedding = await provider.embed('test')
      const results = await provider.search(queryEmbedding, 0)
      expect(results).toEqual([])
    })

    it('handles very large limit', async () => {
      const queryEmbedding = await provider.embed('test')
      const results = await provider.search(queryEmbedding, 1000000)
      // Should return all available results
      expect(results.length).toBeLessThanOrEqual(3)
    })

    it('throws error for mismatched dimensions', async () => {
      const wrongDimensions = [0.1, 0.2, 0.3] // Only 3 dimensions
      await expect(provider.search(wrongDimensions, 10)).rejects.toThrow(
        /dimension mismatch/i
      )
    })
  })
})

describe('Provider Registration', () => {
  beforeEach(() => {
    clearVectorProviders()
  })

  describe('registerVectorProvider()', () => {
    it('registers a provider with a unique name', () => {
      const provider = new MemoryVectorProvider('unique-provider', 384)
      registerVectorProvider(provider)
      expect(getVectorProvider('unique-provider')).toBe(provider)
    })

    it('throws error if provider with same name already exists', () => {
      const provider1 = new MemoryVectorProvider('duplicate', 384)
      const provider2 = new MemoryVectorProvider('duplicate', 384)
      registerVectorProvider(provider1)
      expect(() => registerVectorProvider(provider2)).toThrow(/already registered/)
    })

    it('allows overwrite with force option', () => {
      const provider1 = new MemoryVectorProvider('force-test', 384)
      const provider2 = new MemoryVectorProvider('force-test', 512)
      registerVectorProvider(provider1)
      registerVectorProvider(provider2, { force: true })
      expect(getVectorProvider('force-test')?.dimensions).toBe(512)
    })

    it('validates provider implements required interface', () => {
      // Missing name
      expect(() =>
        registerVectorProvider({ dimensions: 384, embed: async () => [], search: async () => [] } as any)
      ).toThrow(/name/)

      // Invalid dimensions
      expect(() =>
        registerVectorProvider({ name: 'test', dimensions: 0, embed: async () => [], search: async () => [] } as any)
      ).toThrow(/dimensions/)

      // Missing embed
      expect(() =>
        registerVectorProvider({ name: 'test', dimensions: 384, search: async () => [] } as any)
      ).toThrow(/embed/)

      // Missing search
      expect(() =>
        registerVectorProvider({ name: 'test', dimensions: 384, embed: async () => [] } as any)
      ).toThrow(/search/)
    })
  })

  describe('getVectorProvider()', () => {
    it('retrieves a registered provider by name', () => {
      const provider = new MemoryVectorProvider('get-test', 384)
      registerVectorProvider(provider)
      expect(getVectorProvider('get-test')).toBe(provider)
    })

    it('returns undefined for non-existent provider', () => {
      expect(getVectorProvider('non-existent')).toBeUndefined()
    })

    it('returns default provider when name not specified', () => {
      const provider = new MemoryVectorProvider('default-test', 384)
      registerVectorProvider(provider)
      expect(getVectorProvider()).toBe(provider)
    })
  })

  describe('listVectorProviders()', () => {
    it('returns array of registered provider names', () => {
      registerVectorProvider(new MemoryVectorProvider('list-a', 384))
      registerVectorProvider(new MemoryVectorProvider('list-b', 384))
      const names = listVectorProviders()
      expect(names).toContain('list-a')
      expect(names).toContain('list-b')
    })

    it('returns empty array when no providers registered', () => {
      expect(listVectorProviders()).toEqual([])
    })
  })

  describe('setDefaultVectorProvider()', () => {
    it('sets the default provider', () => {
      const provider1 = new MemoryVectorProvider('first', 384)
      const provider2 = new MemoryVectorProvider('second', 384)
      registerVectorProvider(provider1)
      registerVectorProvider(provider2)
      setDefaultVectorProvider('second')
      expect(getVectorProvider()).toBe(provider2)
    })

    it('throws error if provider not registered', () => {
      expect(() => setDefaultVectorProvider('not-registered')).toThrow(
        /not registered/
      )
    })

    it('default provider is used when none specified', () => {
      const provider = new MemoryVectorProvider('auto-default', 384)
      registerVectorProvider(provider)
      // First registered provider becomes default
      expect(getVectorProvider()).toBe(provider)
    })
  })
})

describe('Built-in Providers', () => {
  describe('MemoryVectorProvider', () => {
    let provider: MemoryVectorProvider

    beforeEach(() => {
      provider = new MemoryVectorProvider('memory-test', 384)
    })

    it('implements VectorSearchProvider interface', () => {
      // Check all required properties and methods
      expect(typeof provider.name).toBe('string')
      expect(typeof provider.dimensions).toBe('number')
      expect(typeof provider.embed).toBe('function')
      expect(typeof provider.search).toBe('function')
    })

    it('stores vectors in memory', async () => {
      const embedding = await provider.embed('test')
      await provider.add('mem-test', embedding, { data: 'value' })
      expect(provider.size()).toBe(1)
      expect(provider.has('mem-test')).toBe(true)
    })

    it('supports add() to insert vectors', async () => {
      const embedding = await provider.embed('test')
      await provider.add('add-test', embedding, { title: 'Test Doc' })
      const entry = provider.get('add-test')
      expect(entry?.id).toBe('add-test')
      expect(entry?.data).toEqual({ title: 'Test Doc' })
    })

    it('supports delete() to remove vectors', async () => {
      const embedding = await provider.embed('test')
      await provider.add('del-test', embedding)
      expect(provider.has('del-test')).toBe(true)
      const deleted = await provider.delete('del-test')
      expect(deleted).toBe(true)
      expect(provider.has('del-test')).toBe(false)
    })

    it('supports clear() to remove all vectors', async () => {
      const embedding = await provider.embed('test')
      await provider.add('clear1', embedding)
      await provider.add('clear2', embedding)
      expect(provider.size()).toBe(2)
      await provider.clear()
      expect(provider.size()).toBe(0)
    })

    it('uses cosine similarity for search', async () => {
      // Create two orthogonal vectors (cosine similarity should be 0.5 after normalization to 0-1)
      const v1 = new Array(384).fill(0)
      const v2 = new Array(384).fill(0)
      v1[0] = 1
      v2[1] = 1

      await provider.add('ortho1', v1)
      const results = await provider.search(v2, 1)
      // Cosine similarity of orthogonal vectors is 0, normalized to 0.5
      expect(results[0].score).toBeCloseTo(0.5, 1)
    })
  })

  describe.todo('CloudflareVectorizeProvider', () => {
    // These tests are marked as todo since CloudflareVectorizeProvider
    // requires Cloudflare bindings and will be implemented separately
    it.todo('implements VectorSearchProvider interface')
    it.todo('integrates with Cloudflare Vectorize')
    it.todo('supports namespace configuration')
    it.todo('handles rate limiting gracefully')
  })
})

describe('Integration with Hybrid Search', () => {
  describe('VectorSearchProvider with RRF', () => {
    it('vector results can be merged with FTS results using rrfMerge', async () => {
      // Import rrfMerge
      const { rrfMerge } = await import('../../src/search/rrf')

      const ftsResults = [
        { id: 'doc1', score: 10 },
        { id: 'doc2', score: 5 },
      ]

      const vectorResults = [
        { id: 'doc2', score: 0.9 },
        { id: 'doc3', score: 0.8 },
      ]

      const merged = rrfMerge(ftsResults, vectorResults)
      expect(merged.length).toBe(3)
      // doc2 should rank highest since it appears in both
      expect(merged[0].id).toBe('doc2')
    })

    it('scores are normalized for fair RRF combination', async () => {
      const provider = new MemoryVectorProvider('rrf-test', 384)
      const embedding = await provider.embed('test')
      await provider.add('rrf-doc', embedding)

      const results = await provider.search(embedding, 1)
      // Scores should be between 0 and 1
      expect(results[0].score).toBeGreaterThanOrEqual(0)
      expect(results[0].score).toBeLessThanOrEqual(1)
    })
  })

  describe('Hybrid search workflow', () => {
    it('embed query text first', async () => {
      const provider = new MemoryVectorProvider('workflow', 384)
      const queryEmbedding = await provider.embed('search query')
      expect(queryEmbedding.length).toBe(384)
    })

    it('search vector index with embedding', async () => {
      const provider = new MemoryVectorProvider('workflow', 384)
      const docEmbedding = await provider.embed('document content')
      await provider.add('doc1', docEmbedding, { content: 'document content' })

      const queryEmbedding = await provider.embed('document')
      const results = await provider.search(queryEmbedding, 10)
      expect(results.length).toBeGreaterThan(0)
    })

    it.todo('search FTS index with query text')

    it('merge results with RRF', async () => {
      const { rrfMerge } = await import('../../src/search/rrf')

      // Simulate vector search results
      const vectorResults = [
        { id: 'v1', score: 0.95 },
        { id: 'v2', score: 0.85 },
      ]

      // Simulate FTS results
      const ftsResults = [
        { id: 'f1', score: 15 },
        { id: 'v1', score: 10 },
      ]

      const merged = rrfMerge(ftsResults, vectorResults)
      expect(merged).toBeDefined()
      expect(merged.find((r) => r.id === 'v1')).toBeDefined()
    })
  })
})

describe('Vector Math Utilities', () => {
  describe('cosineSimilarity()', () => {
    it('returns 1 for identical vectors', () => {
      const v = [1, 0, 0]
      const sim = cosineSimilarity(v, v)
      expect(sim).toBe(1)
    })

    it('returns 0.5 for orthogonal vectors', () => {
      const v1 = [1, 0]
      const v2 = [0, 1]
      const sim = cosineSimilarity(v1, v2)
      expect(sim).toBeCloseTo(0.5, 5)
    })

    it('returns 0 for opposite vectors', () => {
      const v1 = [1, 0]
      const v2 = [-1, 0]
      const sim = cosineSimilarity(v1, v2)
      expect(sim).toBeCloseTo(0, 5)
    })

    it('throws for mismatched dimensions', () => {
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/dimension mismatch/)
    })
  })

  describe('normalizeVector()', () => {
    it('returns unit vector with magnitude 1', () => {
      const v = [3, 4]
      const normalized = normalizeVector(v)
      const mag = Math.sqrt(normalized[0] ** 2 + normalized[1] ** 2)
      expect(mag).toBeCloseTo(1, 5)
    })

    it('handles zero vector', () => {
      const v = [0, 0, 0]
      const normalized = normalizeVector(v)
      expect(normalized).toEqual([0, 0, 0])
    })
  })
})
