import { describe, it, expect } from 'vitest'
import { rrfMerge, type SearchResult } from '../../src/search/rrf'

describe('rrfMerge', () => {
  it('combines results from two sources', () => {
    const ftsResults: SearchResult[] = [
      { id: 'doc1', score: 0.9 },
      { id: 'doc2', score: 0.8 },
      { id: 'doc3', score: 0.7 },
    ]
    const vectorResults: SearchResult[] = [
      { id: 'doc2', score: 0.95 },
      { id: 'doc4', score: 0.85 },
      { id: 'doc1', score: 0.75 },
    ]

    const merged = rrfMerge(ftsResults, vectorResults)

    // doc2 appears in both at good ranks, should be first
    expect(merged[0].id).toBe('doc2')
    // doc1 also in both
    expect(merged[1].id).toBe('doc1')
    // All unique docs should be present
    expect(merged.map(r => r.id).sort()).toEqual(['doc1', 'doc2', 'doc3', 'doc4'])
  })

  it('calculates correct RRF scores with default k=60', () => {
    const ftsResults: SearchResult[] = [{ id: 'doc1', score: 1.0 }]
    const vectorResults: SearchResult[] = [{ id: 'doc1', score: 1.0 }]

    const merged = rrfMerge(ftsResults, vectorResults)

    // Score should be 1/(60+0) + 1/(60+0) = 2/60 ≈ 0.0333
    expect(merged[0].score).toBeCloseTo(2 / 60, 4)
  })

  it('handles custom k parameter', () => {
    const ftsResults: SearchResult[] = [{ id: 'doc1', score: 1.0 }]
    const vectorResults: SearchResult[] = [{ id: 'doc1', score: 1.0 }]

    const merged = rrfMerge(ftsResults, vectorResults, { k: 10 })

    // Score should be 1/(10+0) + 1/(10+0) = 2/10 = 0.2
    expect(merged[0].score).toBeCloseTo(0.2, 4)
  })

  it('handles empty arrays', () => {
    expect(rrfMerge([], [])).toEqual([])
    expect(rrfMerge([{ id: 'a', score: 1 }], [])).toHaveLength(1)
    expect(rrfMerge([], [{ id: 'a', score: 1 }])).toHaveLength(1)
  })

  it('sorts by RRF score descending', () => {
    const fts: SearchResult[] = [
      { id: 'a', score: 0.9 },
      { id: 'b', score: 0.5 },
    ]
    const vector: SearchResult[] = [
      { id: 'b', score: 0.9 },
      { id: 'c', score: 0.5 },
    ]

    const merged = rrfMerge(fts, vector)

    // b appears in both lists
    expect(merged[0].id).toBe('b')
    // Verify descending order
    for (let i = 1; i < merged.length; i++) {
      expect(merged[i].score).toBeLessThanOrEqual(merged[i - 1].score)
    }
  })

  it('preserves original data in results', () => {
    const fts: SearchResult[] = [
      { id: 'doc1', score: 1.0, data: { title: 'Test' } },
    ]

    const merged = rrfMerge(fts, [])

    expect(merged[0].data).toEqual({ title: 'Test' })
  })
})
