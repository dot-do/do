/**
 * @dotdo/search/fts - FTS5 Full-Text Search utilities
 *
 * Provides SQLite FTS5 (Full-Text Search 5) integration for
 * efficient text searching across documents and things.
 *
 * Features:
 * - FTS5 virtual table creation with configurable tokenizers
 * - Content table linking for external content storage
 * - Index tracking to prevent duplicate creation
 * - Support for porter stemming and unicode61 tokenization
 */

import type { SqlStorage } from '../sqlite'

// ============================================================================
// Types
// ============================================================================

/**
 * Supported FTS5 tokenizers
 *
 * - 'unicode61': Unicode-aware tokenizer (default), good for international text
 * - 'porter': Porter stemmer for English, reduces words to stems (e.g., 'running' -> 'run')
 * - 'ascii': Simple ASCII tokenizer, fastest but limited to ASCII text
 * - 'trigram': Character trigram tokenizer for substring matching
 */
export type FtsTokenizer = 'unicode61' | 'porter' | 'ascii' | 'trigram'

/**
 * Options for creating an FTS5 index
 */
export interface FtsIndexOptions {
  /**
   * Name of the FTS5 virtual table to create
   */
  indexName: string

  /**
   * Name of the source table containing the content
   * The FTS5 table will reference this table for content
   */
  sourceTable: string

  /**
   * Columns from the source table to include in the FTS index
   * These columns will be searchable via full-text search
   */
  columns: string[]

  /**
   * Name of the column in the source table that serves as the row ID
   * This is used for content table linking
   * @default 'rowid'
   */
  contentRowId?: string

  /**
   * Tokenizer to use for text processing
   * @default 'unicode61'
   */
  tokenizer?: FtsTokenizer

  /**
   * Additional tokenizer options (e.g., 'remove_diacritics 1')
   */
  tokenizerOptions?: string[]

  /**
   * Column weights for ranking (higher = more important)
   * Keys are column names, values are weight multipliers
   * @example { title: 10, content: 1 }
   */
  columnWeights?: Record<string, number>

  /**
   * Prefix index sizes for faster prefix queries
   * @example [2, 3] creates indexes for 2 and 3 character prefixes
   */
  prefixLengths?: number[]
}

/**
 * Result of FTS5 index creation
 */
export interface FtsIndexResult {
  /**
   * Name of the created FTS5 virtual table
   */
  indexName: string

  /**
   * Whether the index was newly created (true) or already existed (false)
   */
  created: boolean

  /**
   * SQL statement that was executed (or would have been)
   */
  sql: string
}

/**
 * FTS5 index metadata stored in tracking table
 */
export interface FtsIndexMetadata {
  indexName: string
  sourceTable: string
  columns: string
  tokenizer: string
  createdAt: string
}

// ============================================================================
// SQL Templates
// ============================================================================

/**
 * SQL to create the FTS index tracking table
 */
export const FTS_INDEX_TRACKING_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS fts_indexes (
    index_name TEXT PRIMARY KEY,
    source_table TEXT NOT NULL,
    columns TEXT NOT NULL,
    tokenizer TEXT NOT NULL,
    tokenizer_options TEXT,
    column_weights TEXT,
    prefix_lengths TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Escape a SQL identifier (table/column name)
 * Prevents SQL injection in dynamic identifiers
 */
function escapeIdentifier(name: string): string {
  // Validate the identifier contains only safe characters
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`)
  }
  return `"${name}"`
}

/**
 * Build the tokenizer clause for FTS5
 */
function buildTokenizerClause(
  tokenizer: FtsTokenizer,
  options?: string[]
): string {
  const parts = [tokenizer]
  if (options && options.length > 0) {
    parts.push(...options)
  }
  return parts.join(' ')
}

/**
 * Build the CREATE VIRTUAL TABLE statement for FTS5
 */
function buildFtsCreateStatement(options: FtsIndexOptions): string {
  const indexName = escapeIdentifier(options.indexName)
  const columns = options.columns.map(escapeIdentifier).join(', ')
  const sourceTable = escapeIdentifier(options.sourceTable)
  const contentRowId = options.contentRowId || 'rowid'

  const ftsOptions: string[] = []

  // Add content table reference
  ftsOptions.push(`content=${sourceTable}`)
  ftsOptions.push(`content_rowid=${escapeIdentifier(contentRowId)}`)

  // Add tokenizer configuration
  const tokenizer = options.tokenizer || 'unicode61'
  const tokenizerClause = buildTokenizerClause(
    tokenizer,
    options.tokenizerOptions
  )
  ftsOptions.push(`tokenize="${tokenizerClause}"`)

  // Add prefix indexes if specified
  if (options.prefixLengths && options.prefixLengths.length > 0) {
    const prefixes = options.prefixLengths.join(' ')
    ftsOptions.push(`prefix="${prefixes}"`)
  }

  // Add column definitions - for content tables we list column names
  // FTS5 requires column names to match the source table
  const columnDefs = options.columns.map(escapeIdentifier).join(', ')

  return `CREATE VIRTUAL TABLE IF NOT EXISTS ${indexName} USING fts5(${columnDefs}, ${ftsOptions.join(', ')})`
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Initialize the FTS index tracking table
 *
 * Call this once to set up the metadata table that tracks created FTS indexes.
 *
 * @param sql - SQL storage interface
 *
 * @example
 * ftsInitTracking(ctx.storage.sql)
 */
export function ftsInitTracking(sql: SqlStorage): void {
  sql.exec(FTS_INDEX_TRACKING_TABLE_SQL)
}

/**
 * Check if an FTS index already exists
 *
 * @param sql - SQL storage interface
 * @param indexName - Name of the index to check
 * @returns true if the index exists, false otherwise
 */
export function ftsIndexExists(sql: SqlStorage, indexName: string): boolean {
  ftsInitTracking(sql)

  const result = sql
    .exec('SELECT 1 FROM fts_indexes WHERE index_name = ?', indexName)
    .toArray()

  return result.length > 0
}

/**
 * Create an FTS5 virtual table for full-text search
 *
 * Creates an FTS5 index linked to a source table, enabling efficient
 * full-text search across specified columns. The index is tracked to
 * prevent duplicate creation.
 *
 * @param sql - SQL storage interface
 * @param options - FTS5 index configuration options
 * @returns Result indicating whether the index was created or already existed
 *
 * @example
 * // Create an FTS5 index on documents with porter stemming
 * const result = ftsCreateIndex(ctx.storage.sql, {
 *   indexName: 'documents_fts',
 *   sourceTable: 'documents',
 *   columns: ['id', 'data'],
 *   tokenizer: 'porter',
 *   prefixLengths: [2, 3],
 * })
 *
 * @example
 * // Create an FTS5 index on things with unicode support
 * const result = ftsCreateIndex(ctx.storage.sql, {
 *   indexName: 'things_fts',
 *   sourceTable: 'things',
 *   columns: ['url', 'data'],
 *   tokenizer: 'unicode61',
 *   tokenizerOptions: ['remove_diacritics', '1'],
 * })
 */
export function ftsCreateIndex(
  sql: SqlStorage,
  options: FtsIndexOptions
): FtsIndexResult {
  // Validate required options
  if (!options.indexName) {
    throw new Error('indexName is required')
  }
  if (!options.sourceTable) {
    throw new Error('sourceTable is required')
  }
  if (!options.columns || options.columns.length === 0) {
    throw new Error('At least one column is required')
  }

  // Initialize tracking table
  ftsInitTracking(sql)

  // Check if index already exists
  if (ftsIndexExists(sql, options.indexName)) {
    const createSql = buildFtsCreateStatement(options)
    return {
      indexName: options.indexName,
      created: false,
      sql: createSql,
    }
  }

  // Build and execute the CREATE VIRTUAL TABLE statement
  const createSql = buildFtsCreateStatement(options)
  sql.exec(createSql)

  // Record the index in the tracking table
  const tokenizer = options.tokenizer || 'unicode61'
  sql.exec(
    `INSERT INTO fts_indexes (index_name, source_table, columns, tokenizer, tokenizer_options, column_weights, prefix_lengths)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    options.indexName,
    options.sourceTable,
    JSON.stringify(options.columns),
    tokenizer,
    options.tokenizerOptions ? JSON.stringify(options.tokenizerOptions) : null,
    options.columnWeights ? JSON.stringify(options.columnWeights) : null,
    options.prefixLengths ? JSON.stringify(options.prefixLengths) : null
  )

  return {
    indexName: options.indexName,
    created: true,
    sql: createSql,
  }
}

/**
 * Drop an FTS5 index and remove it from tracking
 *
 * @param sql - SQL storage interface
 * @param indexName - Name of the FTS5 index to drop
 * @returns true if the index was dropped, false if it didn't exist
 */
export function ftsDropIndex(sql: SqlStorage, indexName: string): boolean {
  ftsInitTracking(sql)

  // Check if index exists
  if (!ftsIndexExists(sql, indexName)) {
    return false
  }

  // Drop the FTS5 virtual table
  const escapedName = escapeIdentifier(indexName)
  sql.exec(`DROP TABLE IF EXISTS ${escapedName}`)

  // Remove from tracking table
  sql.exec('DELETE FROM fts_indexes WHERE index_name = ?', indexName)

  return true
}

/**
 * List all tracked FTS indexes
 *
 * @param sql - SQL storage interface
 * @returns Array of FTS index metadata
 */
export function ftsListIndexes(sql: SqlStorage): FtsIndexMetadata[] {
  ftsInitTracking(sql)

  const results = sql
    .exec(
      'SELECT index_name, source_table, columns, tokenizer, created_at FROM fts_indexes'
    )
    .toArray() as Array<{
    index_name: string
    source_table: string
    columns: string
    tokenizer: string
    created_at: string
  }>

  return results.map((row) => ({
    indexName: row.index_name,
    sourceTable: row.source_table,
    columns: row.columns,
    tokenizer: row.tokenizer,
    createdAt: row.created_at,
  }))
}

/**
 * Rebuild an FTS5 index (useful after bulk data changes)
 *
 * @param sql - SQL storage interface
 * @param indexName - Name of the FTS5 index to rebuild
 */
export function ftsRebuildIndex(sql: SqlStorage, indexName: string): void {
  if (!ftsIndexExists(sql, indexName)) {
    throw new Error(`FTS index not found: ${indexName}`)
  }

  const escapedName = escapeIdentifier(indexName)
  sql.exec(`INSERT INTO ${escapedName}(${escapedName}) VALUES('rebuild')`)
}

/**
 * Get the integrity check status of an FTS5 index
 *
 * @param sql - SQL storage interface
 * @param indexName - Name of the FTS5 index to check
 * @returns 'ok' if the index is valid
 */
export function ftsIntegrityCheck(sql: SqlStorage, indexName: string): string {
  if (!ftsIndexExists(sql, indexName)) {
    throw new Error(`FTS index not found: ${indexName}`)
  }

  const escapedName = escapeIdentifier(indexName)
  const result = sql
    .exec(`INSERT INTO ${escapedName}(${escapedName}) VALUES('integrity-check')`)
    .toArray()

  // If no error is thrown, the index is valid
  return 'ok'
}

// ============================================================================
// FTS Search Types
// ============================================================================

/**
 * Result from FTS5 search with BM25 relevance scoring
 */
export interface FTSResult {
  /** Unique identifier of the matched document */
  id: string
  /** BM25 relevance score (higher is more relevant) */
  score: number
  /** Optional snippet of matching text with highlights */
  snippet?: string
  /** The FTS index/table the result came from */
  table: string
  /** Additional data from the matched row */
  data?: Record<string, unknown>
}

/**
 * Options for snippet extraction in FTS search results
 */
export interface FTSSnippetOptions {
  /** Marker to place before matching text (default: '<mark>') */
  startMarker?: string
  /** Marker to place after matching text (default: '</mark>') */
  endMarker?: string
  /** Text to use as ellipsis between non-contiguous snippets (default: '...') */
  ellipsis?: string
  /** Number of tokens to include around match (default: 10) */
  tokens?: number
  /** Column index to extract snippet from (-1 for best match across all columns) (default: -1) */
  column?: number
}

/**
 * Options for FTS search queries
 */
export interface FTSSearchOptions {
  /** Maximum number of results to return (default: 100) */
  limit?: number
  /** Number of results to skip for pagination (default: 0) */
  offset?: number
  /** FTS tables to search in (if not specified, uses all tracked indexes) */
  tables?: string[]
  /** Minimum BM25 score threshold - results below this are excluded */
  minScore?: number
  /** Include snippet with highlighted matches (default: false) */
  includeSnippet?: boolean
  /** Number of tokens before/after match in snippet (default: 10) */
  snippetTokens?: number
  /** Column to use for snippet extraction (-1 for all columns) */
  snippetColumn?: number
  /** Custom weights for BM25 scoring (per column) */
  bm25Weights?: number[]
  /**
   * Advanced snippet options for customizing extraction
   * When provided, overrides snippetTokens and snippetColumn
   */
  snippet?: FTSSnippetOptions
}

// ============================================================================
// FTS Search Implementation
// ============================================================================

/**
 * Escape a search query for FTS5 MATCH syntax
 *
 * Handles special FTS5 operators and prevents injection.
 * Supports basic query syntax like:
 * - Simple terms: "hello world"
 * - Phrases: '"hello world"'
 * - Prefix: "hel*"
 * - OR: "hello OR world"
 * - NOT: "hello NOT world"
 */
function escapeSearchQuery(query: string): string {
  // Escape double quotes by doubling them
  let escaped = query.replace(/"/g, '""')

  // Remove any characters that could cause FTS5 syntax errors
  // but preserve basic operators (OR, AND, NOT, *, ")
  escaped = escaped.replace(/[^\w\s"*-]/g, ' ')

  return escaped
}

/**
 * Execute an FTS5 search query against a single table
 *
 * @param sql - SQL storage interface
 * @param tableName - Name of the FTS5 table to search
 * @param query - Search query (supports FTS5 query syntax)
 * @param options - Search options
 * @returns Array of search results with BM25 scores
 *
 * @example
 * // Simple search
 * const results = ftsSearchTable(sql, 'documents_fts', 'hello world')
 *
 * @example
 * // With basic snippet options
 * const results = ftsSearchTable(sql, 'documents_fts', 'hello*', {
 *   limit: 10,
 *   includeSnippet: true,
 *   snippetTokens: 20,
 * })
 *
 * @example
 * // With custom snippet markers (e.g., for HTML bold tags)
 * const results = ftsSearchTable(sql, 'documents_fts', 'hello', {
 *   includeSnippet: true,
 *   snippet: {
 *     startMarker: '<b>',
 *     endMarker: '</b>',
 *     ellipsis: ' [...] ',
 *     tokens: 15,
 *   },
 * })
 */
export function ftsSearchTable(
  sql: SqlStorage,
  tableName: string,
  query: string,
  options: FTSSearchOptions = {}
): FTSResult[] {
  const limit = options.limit ?? 100
  const offset = options.offset ?? 0
  const includeSnippet = options.includeSnippet ?? false

  // Resolve snippet options - new `snippet` object takes precedence over legacy options
  const snippetOpts = options.snippet ?? {}
  const snippetTokens = snippetOpts.tokens ?? options.snippetTokens ?? 10
  const snippetColumn = snippetOpts.column ?? options.snippetColumn ?? -1
  const snippetStartMarker = snippetOpts.startMarker ?? '<mark>'
  const snippetEndMarker = snippetOpts.endMarker ?? '</mark>'
  const snippetEllipsis = snippetOpts.ellipsis ?? '...'

  // Escape the query for safe use in MATCH
  const escapedQuery = escapeSearchQuery(query)
  if (!escapedQuery.trim()) {
    return []
  }

  // Build the SELECT clause
  const escapedTableName = escapeIdentifier(tableName)
  let selectClause = `rowid, *, bm25(${escapedTableName}`

  // Add custom BM25 weights if provided
  if (options.bm25Weights && options.bm25Weights.length > 0) {
    selectClause += `, ${options.bm25Weights.join(', ')}`
  }
  selectClause += `) as score`

  if (includeSnippet) {
    // Escape snippet markers for SQL - single quotes need to be doubled
    const escapedStartMarker = snippetStartMarker.replace(/'/g, "''")
    const escapedEndMarker = snippetEndMarker.replace(/'/g, "''")
    const escapedEllipsis = snippetEllipsis.replace(/'/g, "''")
    selectClause += `, snippet(${escapedTableName}, ${snippetColumn}, '${escapedStartMarker}', '${escapedEndMarker}', '${escapedEllipsis}', ${snippetTokens}) as snippet`
  }

  // Build the WHERE clause
  let whereClause = `${escapedTableName} MATCH '${escapedQuery}'`
  if (options.minScore !== undefined) {
    // BM25 scores in SQLite are negative (more negative = less relevant)
    // Convert to positive threshold for comparison
    whereClause += ` AND bm25(${escapedTableName}) >= ${-Math.abs(options.minScore)}`
  }

  // Execute the query
  // ORDER BY score (bm25 returns negative values, so ascending order = best first)
  const sqlQuery = `
    SELECT ${selectClause}
    FROM ${escapedTableName}
    WHERE ${whereClause}
    ORDER BY score
    LIMIT ? OFFSET ?
  `

  try {
    const results = sql.exec(sqlQuery, limit, offset).toArray() as Array<{
      rowid: number
      id?: string
      score: number
      snippet?: string
      [key: string]: unknown
    }>

    return results.map((row) => {
      const { rowid, score, snippet, ...rest } = row
      return {
        id: row.id ?? String(rowid),
        // Negate the score so higher = better (BM25 returns negative values)
        score: -score,
        snippet: includeSnippet ? snippet : undefined,
        table: tableName,
        data: rest as Record<string, unknown>,
      }
    })
  } catch (error) {
    // If FTS table doesn't exist or query fails, return empty array
    if (error instanceof Error) {
      if (
        error.message.includes('no such table') ||
        error.message.includes('no such column') ||
        error.message.includes('syntax error')
      ) {
        return []
      }
    }
    throw error
  }
}

/**
 * Execute an FTS5 search across multiple tables
 *
 * Searches all specified FTS tables (or all tracked indexes) and merges
 * results by BM25 score. Results are sorted by relevance with the most
 * relevant documents first.
 *
 * @param sql - SQL storage interface
 * @param query - Search query (supports FTS5 query syntax)
 * @param options - Search options
 * @returns Array of search results with BM25 scores, merged from all tables
 *
 * @example
 * // Search all indexed tables
 * const results = ftsSearch(sql, 'hello world')
 *
 * @example
 * // Search specific tables with pagination
 * const results = ftsSearch(sql, 'hello*', {
 *   tables: ['documents_fts', 'things_fts'],
 *   limit: 20,
 *   offset: 0,
 *   includeSnippet: true,
 * })
 *
 * @example
 * // Search with minimum score threshold
 * const results = ftsSearch(sql, 'important document', {
 *   minScore: 0.5,  // Only return results with score >= 0.5
 * })
 */
export function ftsSearch(
  sql: SqlStorage,
  query: string,
  options: FTSSearchOptions = {}
): FTSResult[] {
  // Get tables to search
  let tables = options.tables

  // If no tables specified, get all tracked FTS indexes
  if (!tables || tables.length === 0) {
    const indexes = ftsListIndexes(sql)
    tables = indexes.map((idx) => idx.indexName)
  }

  // If still no tables, return empty
  if (tables.length === 0) {
    return []
  }

  const limit = options.limit ?? 100

  // Search each table and collect results
  const allResults: FTSResult[] = []

  for (const tableName of tables) {
    try {
      const tableResults = ftsSearchTable(sql, tableName, query, {
        ...options,
        // Get more results per table since we'll merge and re-limit
        limit: limit * 2,
        offset: 0,
      })
      allResults.push(...tableResults)
    } catch {
      // Skip tables that have errors - they may not exist or be misconfigured
      continue
    }
  }

  // Sort by score descending (higher = more relevant)
  allResults.sort((a, b) => b.score - a.score)

  // Apply final pagination
  const offset = options.offset ?? 0
  return allResults.slice(offset, offset + limit)
}

/**
 * Populate an FTS5 index with data from its source table
 *
 * This is useful when you have existing data in a table and want to
 * create an FTS index on it. The 'rebuild' command repopulates the
 * index from the content table.
 *
 * @param sql - SQL storage interface
 * @param indexName - Name of the FTS5 index to populate
 *
 * @example
 * // Create index and populate with existing data
 * ftsCreateIndex(sql, {
 *   indexName: 'documents_fts',
 *   sourceTable: 'documents',
 *   columns: ['id', 'data'],
 * })
 * ftsPopulateIndex(sql, 'documents_fts')
 */
export function ftsPopulateIndex(sql: SqlStorage, indexName: string): void {
  ftsRebuildIndex(sql, indexName)
}

/**
 * Get the total number of documents in an FTS5 index
 *
 * @param sql - SQL storage interface
 * @param indexName - Name of the FTS5 index
 * @returns Number of documents in the index
 */
export function ftsDocumentCount(sql: SqlStorage, indexName: string): number {
  if (!ftsIndexExists(sql, indexName)) {
    return 0
  }

  const escapedName = escapeIdentifier(indexName)
  const result = sql
    .exec(`SELECT COUNT(*) as count FROM ${escapedName}`)
    .toArray() as Array<{ count: number }>

  return result[0]?.count ?? 0
}

/**
 * Extract a snippet from a document by rowid using FTS5's snippet() function
 *
 * This function extracts a highlighted snippet from a specific document
 * in an FTS5 index, showing the matching text with configurable markers.
 *
 * @param sql - SQL storage interface
 * @param tableName - Name of the FTS5 table
 * @param query - Search query to highlight matches for
 * @param rowid - The rowid of the document to extract snippet from
 * @param options - Snippet extraction options
 * @returns The highlighted snippet string, or null if not found
 *
 * @example
 * // Extract snippet with default markers (<mark>...</mark>)
 * const snippet = ftsSnippet(sql, 'documents_fts', 'hello', 42)
 *
 * @example
 * // Extract snippet with custom markers
 * const snippet = ftsSnippet(sql, 'documents_fts', 'hello', 42, {
 *   startMarker: '<b>',
 *   endMarker: '</b>',
 *   ellipsis: '...',
 *   tokens: 20,
 *   column: 1,  // Extract from second column
 * })
 */
export function ftsSnippet(
  sql: SqlStorage,
  tableName: string,
  query: string,
  rowid: number,
  options: FTSSnippetOptions = {}
): string | null {
  const {
    startMarker = '<mark>',
    endMarker = '</mark>',
    ellipsis = '...',
    tokens = 10,
    column = -1,
  } = options

  // Escape the query for safe use in MATCH
  const escapedQuery = escapeSearchQuery(query)
  if (!escapedQuery.trim()) {
    return null
  }

  const escapedTableName = escapeIdentifier(tableName)

  // Escape snippet markers for SQL - single quotes need to be doubled
  const escapedStartMarker = startMarker.replace(/'/g, "''")
  const escapedEndMarker = endMarker.replace(/'/g, "''")
  const escapedEllipsis = ellipsis.replace(/'/g, "''")

  const sqlQuery = `
    SELECT snippet(${escapedTableName}, ${column}, '${escapedStartMarker}', '${escapedEndMarker}', '${escapedEllipsis}', ${tokens}) as snippet
    FROM ${escapedTableName}
    WHERE rowid = ? AND ${escapedTableName} MATCH '${escapedQuery}'
  `

  try {
    const results = sql.exec(sqlQuery, rowid).toArray() as Array<{
      snippet: string
    }>

    return results[0]?.snippet ?? null
  } catch {
    return null
  }
}
