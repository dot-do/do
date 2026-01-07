/**
 * @dotdo/do - enrichBatch() Implementation
 *
 * Batch processing with concurrency control, progress reporting,
 * and configurable error handling.
 */

/**
 * Options for enrichBatch processing
 */
export interface EnrichBatchOptions<T, R> {
  /** Maximum concurrent operations (default: 5) */
  concurrency?: number
  /** Progress callback called after each item completes */
  onProgress?: (progress: EnrichProgress<T, R>) => void
  /** Whether to continue on error or fail-fast (default: 'continue') */
  errorHandling?: 'continue' | 'fail-fast'
}

/**
 * Progress information passed to onProgress callback
 */
export interface EnrichProgress<T, R> {
  /** Index of the completed item */
  index: number
  /** Total number of items */
  total: number
  /** The original item */
  item: T
  /** The enriched result (if successful) */
  result?: R
  /** The error (if failed) */
  error?: Error
  /** Whether this item succeeded */
  success: boolean
}

/**
 * Result for each item in the batch
 */
export interface EnrichResult<T, R> {
  /** The original item */
  item: T
  /** The enriched result (if successful) */
  result?: R
  /** The error (if failed) */
  error?: Error
  /** Whether this item succeeded */
  success: boolean
}

/**
 * Process items in batches with concurrency control.
 *
 * @param items - Array of items to process
 * @param enrichFn - Async function to apply to each item
 * @param options - Processing options
 * @returns Array of results in original item order
 *
 * @example
 * ```ts
 * const results = await enrichBatch(
 *   users,
 *   async (user) => fetchUserDetails(user.id),
 *   { concurrency: 10, onProgress: (p) => console.log(`${p.index + 1}/${p.total}`) }
 * )
 * ```
 */
export async function enrichBatch<T, R>(
  items: T[],
  enrichFn: (item: T) => Promise<R>,
  options: EnrichBatchOptions<T, R> = {}
): Promise<EnrichResult<T, R>[]> {
  const { concurrency = 5, onProgress, errorHandling = 'continue' } = options

  if (items.length === 0) {
    return []
  }

  // Pre-allocate results array to maintain order
  const results: EnrichResult<T, R>[] = new Array(items.length)

  // Track completion for fail-fast mode
  let shouldStop = false
  let firstError: Error | null = null

  // Create a queue of pending work
  let nextIndex = 0
  const total = items.length

  // Process a single item and return when done
  const processItem = async (index: number): Promise<void> => {
    if (shouldStop) return

    const item = items[index]

    try {
      const result = await enrichFn(item)

      if (shouldStop) return

      const enrichResult: EnrichResult<T, R> = {
        item,
        result,
        success: true,
      }
      results[index] = enrichResult

      onProgress?.({
        index,
        total,
        item,
        result,
        success: true,
      })
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))

      if (errorHandling === 'fail-fast') {
        shouldStop = true
        if (!firstError) {
          firstError = error
        }
        return
      }

      const enrichResult: EnrichResult<T, R> = {
        item,
        error,
        success: false,
      }
      results[index] = enrichResult

      onProgress?.({
        index,
        total,
        item,
        error,
        success: false,
      })
    }
  }

  // Worker function that picks up work from the queue
  const worker = async (): Promise<void> => {
    while (!shouldStop) {
      const index = nextIndex++
      if (index >= items.length) break
      await processItem(index)
    }
  }

  // Start concurrent workers
  const workerCount = Math.min(concurrency, items.length)
  const workers: Promise<void>[] = []

  for (let i = 0; i < workerCount; i++) {
    workers.push(worker())
  }

  // Wait for all workers to complete
  await Promise.all(workers)

  // In fail-fast mode, throw the first error encountered
  if (firstError) {
    throw firstError
  }

  return results
}
