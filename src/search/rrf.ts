export interface SearchResult {
  id: string
  score: number
  data?: unknown
}

export interface RRFOptions {
  /** RRF constant k (default: 60) */
  k?: number
}

/**
 * Merge search results using Reciprocal Rank Fusion
 *
 * RRF combines results from multiple retrieval systems by calculating:
 * score = Σ(1 / (k + rank_i)) for each source i
 *
 * This gives higher scores to items that appear in multiple lists
 * and at higher ranks.
 */
export function rrfMerge(
  ftsResults: SearchResult[],
  vectorResults: SearchResult[],
  options: RRFOptions = {}
): SearchResult[] {
  const k = options.k ?? 60

  // Map to accumulate RRF scores by id
  const scoreMap = new Map<string, { score: number; data?: unknown }>()

  // Process FTS results
  ftsResults.forEach((result, rank) => {
    const rrfScore = 1 / (k + rank)
    const existing = scoreMap.get(result.id)
    if (existing) {
      existing.score += rrfScore
    } else {
      scoreMap.set(result.id, { score: rrfScore, data: result.data })
    }
  })

  // Process vector results
  vectorResults.forEach((result, rank) => {
    const rrfScore = 1 / (k + rank)
    const existing = scoreMap.get(result.id)
    if (existing) {
      existing.score += rrfScore
      // Keep data from first source if not already present
      if (!existing.data && result.data) {
        existing.data = result.data
      }
    } else {
      scoreMap.set(result.id, { score: rrfScore, data: result.data })
    }
  })

  // Convert to array and sort by score descending
  return Array.from(scoreMap.entries())
    .map(([id, { score, data }]) => ({ id, score, data }))
    .sort((a, b) => b.score - a.score)
}
