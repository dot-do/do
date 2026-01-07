/**
 * @dotdo/search/vector - Vector Search Provider Interface
 *
 * Provides a unified interface for vector-based semantic search
 * that can be used alongside FTS for hybrid search.
 *
 * Features:
 * - VectorSearchProvider interface for any embedding backend
 * - MemoryVectorProvider for in-memory vector storage
 * - Provider registration and retrieval system
 * - Cosine similarity for vector search
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Result from vector similarity search
 */
export interface VectorSearchResult {
  /** Unique identifier of the matched document */
  id: string
  /** Similarity score between 0 and 1 (higher is more similar) */
  score: number
  /** Optional associated data */
  data?: unknown
  /** Optional embedding vector */
  embedding?: number[]
}

/**
 * Options for vector search queries
 */
export interface VectorSearchOptions {
  /** Minimum similarity score threshold (0-1) */
  minScore?: number
  /** Namespace/collection filter */
  namespace?: string
  /** Metadata filter */
  metadata?: Record<string, unknown>
  /** Whether to include the embedding in results */
  includeEmbedding?: boolean
}

/**
 * Interface for vector search providers
 *
 * Any vector database or embedding service can implement this interface
 * to integrate with the hybrid search system.
 */
export interface VectorSearchProvider {
  /** Provider name (unique identifier) */
  readonly name: string

  /** Dimension of the embedding vectors */
  readonly dimensions: number

  /**
   * Generate an embedding for a single text string
   *
   * @param text - The text to embed
   * @returns Promise resolving to an embedding vector
   */
  embed(text: string): Promise<number[]>

  /**
   * Search for similar vectors
   *
   * @param embedding - The query embedding vector
   * @param limit - Maximum number of results to return
   * @param options - Search options
   * @returns Promise resolving to search results sorted by similarity
   */
  search(
    embedding: number[],
    limit: number,
    options?: VectorSearchOptions
  ): Promise<VectorSearchResult[]>

  /**
   * Optional batch embedding for efficiency
   *
   * @param texts - Array of texts to embed
   * @returns Promise resolving to array of embeddings in same order as input
   */
  embedBatch?(texts: string[]): Promise<number[][]>
}

// ============================================================================
// Vector Math Utilities
// ============================================================================

/**
 * Calculate the dot product of two vectors
 */
function dotProduct(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i]
  }
  return sum
}

/**
 * Calculate the magnitude (L2 norm) of a vector
 */
function magnitude(v: number[]): number {
  let sum = 0
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i]
  }
  return Math.sqrt(sum)
}

/**
 * Calculate cosine similarity between two vectors
 * Returns a value between -1 and 1, normalized to 0-1
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    )
  }

  const magA = magnitude(a)
  const magB = magnitude(b)

  // Handle zero vectors
  if (magA === 0 || magB === 0) {
    return 0
  }

  const similarity = dotProduct(a, b) / (magA * magB)
  // Normalize from [-1, 1] to [0, 1]
  return (similarity + 1) / 2
}

/**
 * Normalize a vector to unit length (magnitude 1)
 */
export function normalizeVector(v: number[]): number[] {
  const mag = magnitude(v)
  if (mag === 0) {
    return v.slice() // Return copy of zero vector
  }
  return v.map((x) => x / mag)
}

// ============================================================================
// Memory Vector Provider
// ============================================================================

/**
 * Stored vector entry in MemoryVectorProvider
 */
interface VectorEntry {
  id: string
  embedding: number[]
  data?: unknown
  namespace?: string
  metadata?: Record<string, unknown>
}

/**
 * Options for adding vectors to MemoryVectorProvider
 */
export interface MemoryVectorAddOptions {
  /** Optional namespace/collection */
  namespace?: string
  /** Optional metadata for filtering */
  metadata?: Record<string, unknown>
}

/**
 * In-memory vector search provider
 *
 * Stores vectors in memory with cosine similarity search.
 * Useful for testing, development, and small-scale applications.
 *
 * @example
 * const provider = new MemoryVectorProvider('test', 384)
 * await provider.add('doc1', [0.1, 0.2, ...], { title: 'Hello' })
 * const results = await provider.search([0.1, 0.2, ...], 10)
 */
export class MemoryVectorProvider implements VectorSearchProvider {
  readonly name: string
  readonly dimensions: number
  private vectors: Map<string, VectorEntry> = new Map()

  /**
   * Simple hash-based embedding generator for testing
   * In production, use a real embedding model
   */
  private hashEmbed(text: string): number[] {
    const embedding = new Array(this.dimensions).fill(0)

    // Simple hash-based embedding for testing/demo purposes
    // This creates deterministic embeddings based on character codes
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i)
      const idx = (i + charCode) % this.dimensions
      embedding[idx] += charCode / 1000
    }

    // Normalize the embedding
    return normalizeVector(embedding)
  }

  constructor(name: string, dimensions: number = 384) {
    this.name = name
    this.dimensions = dimensions
  }

  /**
   * Generate an embedding for text
   * Uses simple hash-based embedding for testing
   */
  async embed(text: string): Promise<number[]> {
    if (text === null || text === undefined) {
      throw new Error('Input text cannot be null or undefined')
    }
    return this.hashEmbed(text)
  }

  /**
   * Generate embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.hashEmbed(text))
  }

  /**
   * Search for similar vectors using cosine similarity
   */
  async search(
    embedding: number[],
    limit: number,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    if (embedding.length !== this.dimensions) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.dimensions}, got ${embedding.length}`
      )
    }

    if (limit <= 0) {
      return []
    }

    const results: VectorSearchResult[] = []

    for (const entry of this.vectors.values()) {
      // Apply namespace filter
      if (options.namespace && entry.namespace !== options.namespace) {
        continue
      }

      // Apply metadata filter
      if (options.metadata) {
        let matches = true
        for (const [key, value] of Object.entries(options.metadata)) {
          if (entry.metadata?.[key] !== value) {
            matches = false
            break
          }
        }
        if (!matches) continue
      }

      const score = cosineSimilarity(embedding, entry.embedding)

      // Apply minimum score filter
      if (options.minScore !== undefined && score < options.minScore) {
        continue
      }

      results.push({
        id: entry.id,
        score,
        data: entry.data,
        embedding: options.includeEmbedding ? entry.embedding : undefined,
      })
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score)

    // Return top results
    return results.slice(0, limit)
  }

  /**
   * Add a vector to the index
   */
  async add(
    id: string,
    embedding: number[],
    data?: unknown,
    options: MemoryVectorAddOptions = {}
  ): Promise<void> {
    if (embedding.length !== this.dimensions) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.dimensions}, got ${embedding.length}`
      )
    }

    this.vectors.set(id, {
      id,
      embedding: normalizeVector(embedding),
      data,
      namespace: options.namespace,
      metadata: options.metadata,
    })
  }

  /**
   * Delete a vector from the index
   */
  async delete(id: string): Promise<boolean> {
    return this.vectors.delete(id)
  }

  /**
   * Clear all vectors from the index
   */
  async clear(): Promise<void> {
    this.vectors.clear()
  }

  /**
   * Get the number of vectors in the index
   */
  size(): number {
    return this.vectors.size
  }

  /**
   * Check if a vector exists
   */
  has(id: string): boolean {
    return this.vectors.has(id)
  }

  /**
   * Get a vector by ID
   */
  get(id: string): VectorEntry | undefined {
    return this.vectors.get(id)
  }
}

// ============================================================================
// Provider Registry
// ============================================================================

/** Registry of vector search providers */
const providerRegistry = new Map<string, VectorSearchProvider>()

/** Default provider name */
let defaultProviderName: string | undefined

/**
 * Register a vector search provider
 *
 * @param provider - The provider to register
 * @param options - Registration options
 * @throws Error if provider with same name already exists (unless force is true)
 *
 * @example
 * registerVectorProvider(new MemoryVectorProvider('memory', 384))
 */
export function registerVectorProvider(
  provider: VectorSearchProvider,
  options: { force?: boolean } = {}
): void {
  // Validate provider implements required interface
  if (!provider.name || typeof provider.name !== 'string') {
    throw new Error('Provider must have a name property')
  }
  if (typeof provider.dimensions !== 'number' || provider.dimensions <= 0) {
    throw new Error('Provider must have a positive dimensions property')
  }
  if (typeof provider.embed !== 'function') {
    throw new Error('Provider must implement embed() method')
  }
  if (typeof provider.search !== 'function') {
    throw new Error('Provider must implement search() method')
  }

  if (providerRegistry.has(provider.name) && !options.force) {
    throw new Error(
      `Vector provider '${provider.name}' already registered. Use force: true to overwrite.`
    )
  }

  providerRegistry.set(provider.name, provider)

  // Set as default if this is the first provider
  if (!defaultProviderName) {
    defaultProviderName = provider.name
  }
}

/**
 * Get a registered vector search provider
 *
 * @param name - Provider name (optional, returns default if not specified)
 * @returns The provider or undefined if not found
 *
 * @example
 * const provider = getVectorProvider('memory')
 * const defaultProvider = getVectorProvider()
 */
export function getVectorProvider(
  name?: string
): VectorSearchProvider | undefined {
  if (name) {
    return providerRegistry.get(name)
  }
  // Return default provider
  if (defaultProviderName) {
    return providerRegistry.get(defaultProviderName)
  }
  return undefined
}

/**
 * List all registered vector provider names
 *
 * @returns Array of provider names
 */
export function listVectorProviders(): string[] {
  return Array.from(providerRegistry.keys())
}

/**
 * Set the default vector provider
 *
 * @param name - Name of the provider to set as default
 * @throws Error if provider is not registered
 */
export function setDefaultVectorProvider(name: string): void {
  if (!providerRegistry.has(name)) {
    throw new Error(`Vector provider '${name}' is not registered`)
  }
  defaultProviderName = name
}

/**
 * Clear all registered providers (useful for testing)
 */
export function clearVectorProviders(): void {
  providerRegistry.clear()
  defaultProviderName = undefined
}
