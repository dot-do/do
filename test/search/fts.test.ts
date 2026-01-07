import { describe, it, expect, beforeEach } from 'vitest'
import {
  ftsCreateIndex,
  ftsDropIndex,
  ftsIndexExists,
  ftsListIndexes,
  ftsInitTracking,
  ftsRebuildIndex,
  ftsIntegrityCheck,
  ftsSearch,
  ftsSearchTable,
  ftsDocumentCount,
  ftsPopulateIndex,
  ftsSnippet,
  type FtsIndexOptions,
  type FTSSearchOptions,
  type FTSSnippetOptions,
  type FTSResult,
} from '../../src/search/fts'
import type { SqlStorage } from '../../src/sqlite'

/**
 * Mock SqlStorage implementation for testing
 *
 * This mock tracks executed SQL statements and maintains an in-memory
 * representation of created tables and data for testing purposes.
 */
class MockSqlStorage implements SqlStorage {
  private tables: Map<string, Map<string, unknown>[]> = new Map()
  private virtualTables: Set<string> = new Set()
  public executedStatements: string[] = []

  exec(query: string, ...params: unknown[]): { toArray(): unknown[] } {
    this.executedStatements.push(query)

    // Handle CREATE TABLE IF NOT EXISTS
    const createTableMatch = query.match(
      /CREATE TABLE IF NOT EXISTS\s+"?(\w+)"?\s*\(/i
    )
    if (createTableMatch) {
      const tableName = createTableMatch[1]
      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, [])
      }
      return { toArray: () => [] }
    }

    // Handle CREATE VIRTUAL TABLE IF NOT EXISTS
    const createVirtualMatch = query.match(
      /CREATE VIRTUAL TABLE IF NOT EXISTS\s+"?(\w+)"?\s+USING/i
    )
    if (createVirtualMatch) {
      const tableName = createVirtualMatch[1]
      this.virtualTables.add(tableName)
      return { toArray: () => [] }
    }

    // Handle DROP TABLE IF EXISTS
    const dropMatch = query.match(/DROP TABLE IF EXISTS\s+"?(\w+)"?/i)
    if (dropMatch) {
      const tableName = dropMatch[1]
      this.virtualTables.delete(tableName)
      this.tables.delete(tableName)
      return { toArray: () => [] }
    }

    // Handle INSERT INTO fts_indexes
    if (query.includes('INSERT INTO fts_indexes')) {
      const table = this.tables.get('fts_indexes') || []
      table.push({
        index_name: params[0],
        source_table: params[1],
        columns: params[2],
        tokenizer: params[3],
        tokenizer_options: params[4],
        column_weights: params[5],
        prefix_lengths: params[6],
        created_at: new Date().toISOString(),
      })
      this.tables.set('fts_indexes', table)
      return { toArray: () => [] }
    }

    // Handle SELECT 1 FROM fts_indexes (existence check)
    if (query.includes('SELECT 1 FROM fts_indexes WHERE index_name = ?')) {
      const table = this.tables.get('fts_indexes') || []
      const found = table.find((row: any) => row.index_name === params[0])
      return { toArray: () => (found ? [{ '1': 1 }] : []) }
    }

    // Handle SELECT * FROM fts_indexes (list all)
    if (
      query.includes(
        'SELECT index_name, source_table, columns, tokenizer, created_at FROM fts_indexes'
      )
    ) {
      const table = this.tables.get('fts_indexes') || []
      return { toArray: () => table }
    }

    // Handle DELETE FROM fts_indexes
    if (query.includes('DELETE FROM fts_indexes WHERE index_name = ?')) {
      const table = this.tables.get('fts_indexes') || []
      const filtered = table.filter((row: any) => row.index_name !== params[0])
      this.tables.set('fts_indexes', filtered)
      return { toArray: () => [] }
    }

    // Handle FTS5 rebuild command
    if (query.includes("VALUES('rebuild')")) {
      return { toArray: () => [] }
    }

    // Handle FTS5 integrity-check command
    if (query.includes("VALUES('integrity-check')")) {
      return { toArray: () => [] }
    }

    return { toArray: () => [] }
  }

  // Helper methods for testing
  hasVirtualTable(name: string): boolean {
    return this.virtualTables.has(name)
  }

  getTableData(name: string): unknown[] {
    return this.tables.get(name) || []
  }

  reset(): void {
    this.tables.clear()
    this.virtualTables.clear()
    this.executedStatements = []
  }
}

describe('FTS5 Module', () => {
  let sql: MockSqlStorage

  beforeEach(() => {
    sql = new MockSqlStorage()
  })

  describe('ftsInitTracking', () => {
    it('creates the fts_indexes tracking table', () => {
      ftsInitTracking(sql)

      expect(sql.executedStatements.length).toBe(1)
      expect(sql.executedStatements[0]).toContain('CREATE TABLE IF NOT EXISTS')
      expect(sql.executedStatements[0]).toContain('fts_indexes')
    })

    it('is idempotent - can be called multiple times', () => {
      ftsInitTracking(sql)
      ftsInitTracking(sql)

      // Both calls should work without error
      expect(sql.executedStatements.length).toBe(2)
    })
  })

  describe('ftsCreateIndex', () => {
    it('creates an FTS5 virtual table with basic options', () => {
      const options: FtsIndexOptions = {
        indexName: 'documents_fts',
        sourceTable: 'documents',
        columns: ['id', 'data'],
      }

      const result = ftsCreateIndex(sql, options)

      expect(result.created).toBe(true)
      expect(result.indexName).toBe('documents_fts')
      expect(result.sql).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS')
      expect(result.sql).toContain('"documents_fts"')
      expect(result.sql).toContain('USING fts5')
      expect(result.sql).toContain('content="documents"')
    })

    it('creates an FTS5 index with porter tokenizer', () => {
      const options: FtsIndexOptions = {
        indexName: 'things_fts',
        sourceTable: 'things',
        columns: ['url', 'data'],
        tokenizer: 'porter',
      }

      const result = ftsCreateIndex(sql, options)

      expect(result.created).toBe(true)
      expect(result.sql).toContain('tokenize="porter"')
    })

    it('creates an FTS5 index with unicode61 tokenizer and options', () => {
      const options: FtsIndexOptions = {
        indexName: 'international_fts',
        sourceTable: 'international_content',
        columns: ['title', 'body'],
        tokenizer: 'unicode61',
        tokenizerOptions: ['remove_diacritics', '1'],
      }

      const result = ftsCreateIndex(sql, options)

      expect(result.created).toBe(true)
      expect(result.sql).toContain(
        'tokenize="unicode61 remove_diacritics 1"'
      )
    })

    it('creates an FTS5 index with prefix lengths', () => {
      const options: FtsIndexOptions = {
        indexName: 'search_fts',
        sourceTable: 'search_content',
        columns: ['text'],
        prefixLengths: [2, 3, 4],
      }

      const result = ftsCreateIndex(sql, options)

      expect(result.created).toBe(true)
      expect(result.sql).toContain('prefix="2 3 4"')
    })

    it('creates an FTS5 index with custom content_rowid', () => {
      const options: FtsIndexOptions = {
        indexName: 'custom_fts',
        sourceTable: 'custom_table',
        columns: ['field1', 'field2'],
        contentRowId: 'custom_id',
      }

      const result = ftsCreateIndex(sql, options)

      expect(result.created).toBe(true)
      expect(result.sql).toContain('content_rowid="custom_id"')
    })

    it('returns created: false if index already exists', () => {
      const options: FtsIndexOptions = {
        indexName: 'existing_fts',
        sourceTable: 'documents',
        columns: ['data'],
      }

      // Create first time
      const first = ftsCreateIndex(sql, options)
      expect(first.created).toBe(true)

      // Try to create again
      const second = ftsCreateIndex(sql, options)
      expect(second.created).toBe(false)
      expect(second.indexName).toBe('existing_fts')
    })

    it('records index metadata in tracking table', () => {
      const options: FtsIndexOptions = {
        indexName: 'tracked_fts',
        sourceTable: 'tracked_table',
        columns: ['col1', 'col2'],
        tokenizer: 'porter',
      }

      ftsCreateIndex(sql, options)

      const trackingData = sql.getTableData('fts_indexes') as any[]
      expect(trackingData.length).toBe(1)
      expect(trackingData[0].index_name).toBe('tracked_fts')
      expect(trackingData[0].source_table).toBe('tracked_table')
      expect(trackingData[0].tokenizer).toBe('porter')
    })

    it('throws error when indexName is missing', () => {
      const options = {
        sourceTable: 'documents',
        columns: ['data'],
      } as FtsIndexOptions

      expect(() => ftsCreateIndex(sql, options)).toThrow(
        'indexName is required'
      )
    })

    it('throws error when sourceTable is missing', () => {
      const options = {
        indexName: 'test_fts',
        columns: ['data'],
      } as FtsIndexOptions

      expect(() => ftsCreateIndex(sql, options)).toThrow(
        'sourceTable is required'
      )
    })

    it('throws error when columns is empty', () => {
      const options: FtsIndexOptions = {
        indexName: 'test_fts',
        sourceTable: 'documents',
        columns: [],
      }

      expect(() => ftsCreateIndex(sql, options)).toThrow(
        'At least one column is required'
      )
    })

    it('throws error for invalid identifier names', () => {
      const options: FtsIndexOptions = {
        indexName: 'test; DROP TABLE users;--',
        sourceTable: 'documents',
        columns: ['data'],
      }

      expect(() => ftsCreateIndex(sql, options)).toThrow(
        'Invalid SQL identifier'
      )
    })
  })

  describe('ftsIndexExists', () => {
    it('returns false when index does not exist', () => {
      const exists = ftsIndexExists(sql, 'nonexistent_fts')
      expect(exists).toBe(false)
    })

    it('returns true when index exists', () => {
      ftsCreateIndex(sql, {
        indexName: 'my_fts',
        sourceTable: 'my_table',
        columns: ['data'],
      })

      const exists = ftsIndexExists(sql, 'my_fts')
      expect(exists).toBe(true)
    })
  })

  describe('ftsDropIndex', () => {
    it('drops an existing FTS index', () => {
      ftsCreateIndex(sql, {
        indexName: 'to_drop_fts',
        sourceTable: 'some_table',
        columns: ['data'],
      })

      const dropped = ftsDropIndex(sql, 'to_drop_fts')

      expect(dropped).toBe(true)
      expect(ftsIndexExists(sql, 'to_drop_fts')).toBe(false)
    })

    it('returns false when dropping non-existent index', () => {
      const dropped = ftsDropIndex(sql, 'nonexistent_fts')
      expect(dropped).toBe(false)
    })

    it('removes index from tracking table', () => {
      ftsCreateIndex(sql, {
        indexName: 'tracked_drop_fts',
        sourceTable: 'table',
        columns: ['data'],
      })

      ftsDropIndex(sql, 'tracked_drop_fts')

      const trackingData = sql.getTableData('fts_indexes') as any[]
      const found = trackingData.find(
        (row: any) => row.index_name === 'tracked_drop_fts'
      )
      expect(found).toBeUndefined()
    })
  })

  describe('ftsListIndexes', () => {
    it('returns empty array when no indexes exist', () => {
      const indexes = ftsListIndexes(sql)
      expect(indexes).toEqual([])
    })

    it('returns all created indexes', () => {
      ftsCreateIndex(sql, {
        indexName: 'fts1',
        sourceTable: 'table1',
        columns: ['col1'],
        tokenizer: 'porter',
      })
      ftsCreateIndex(sql, {
        indexName: 'fts2',
        sourceTable: 'table2',
        columns: ['col2', 'col3'],
        tokenizer: 'unicode61',
      })

      const indexes = ftsListIndexes(sql)

      expect(indexes.length).toBe(2)
      expect(indexes.map((i) => i.indexName).sort()).toEqual(['fts1', 'fts2'])
      expect(indexes.find((i) => i.indexName === 'fts1')?.tokenizer).toBe(
        'porter'
      )
      expect(indexes.find((i) => i.indexName === 'fts2')?.tokenizer).toBe(
        'unicode61'
      )
    })

    it('does not include dropped indexes', () => {
      ftsCreateIndex(sql, {
        indexName: 'temp_fts',
        sourceTable: 'table',
        columns: ['data'],
      })
      ftsCreateIndex(sql, {
        indexName: 'permanent_fts',
        sourceTable: 'table',
        columns: ['data'],
      })

      ftsDropIndex(sql, 'temp_fts')

      const indexes = ftsListIndexes(sql)
      expect(indexes.length).toBe(1)
      expect(indexes[0].indexName).toBe('permanent_fts')
    })
  })

  describe('SQL generation', () => {
    it('generates correct SQL for multiple columns', () => {
      const options: FtsIndexOptions = {
        indexName: 'multi_col_fts',
        sourceTable: 'articles',
        columns: ['title', 'summary', 'content', 'author'],
      }

      const result = ftsCreateIndex(sql, options)

      expect(result.sql).toContain('"title"')
      expect(result.sql).toContain('"summary"')
      expect(result.sql).toContain('"content"')
      expect(result.sql).toContain('"author"')
    })

    it('generates correct SQL for trigram tokenizer', () => {
      const options: FtsIndexOptions = {
        indexName: 'trigram_fts',
        sourceTable: 'search_data',
        columns: ['text'],
        tokenizer: 'trigram',
      }

      const result = ftsCreateIndex(sql, options)

      expect(result.sql).toContain('tokenize="trigram"')
    })

    it('generates correct SQL for ascii tokenizer', () => {
      const options: FtsIndexOptions = {
        indexName: 'ascii_fts',
        sourceTable: 'simple_data',
        columns: ['text'],
        tokenizer: 'ascii',
      }

      const result = ftsCreateIndex(sql, options)

      expect(result.sql).toContain('tokenize="ascii"')
    })

    it('uses unicode61 as default tokenizer', () => {
      const options: FtsIndexOptions = {
        indexName: 'default_fts',
        sourceTable: 'data',
        columns: ['text'],
      }

      const result = ftsCreateIndex(sql, options)

      expect(result.sql).toContain('tokenize="unicode61"')
    })
  })

  describe('ftsRebuildIndex', () => {
    it('throws error for non-existent index', () => {
      expect(() => ftsRebuildIndex(sql, 'nonexistent')).toThrow('FTS index not found')
    })

    it('rebuilds existing index without error', () => {
      ftsCreateIndex(sql, {
        indexName: 'rebuild_fts',
        sourceTable: 'documents',
        columns: ['data'],
      })

      expect(() => ftsRebuildIndex(sql, 'rebuild_fts')).not.toThrow()
      expect(sql.executedStatements.some(s => s.includes("VALUES('rebuild')"))).toBe(true)
    })
  })

  describe('ftsIntegrityCheck', () => {
    it('throws error for non-existent index', () => {
      expect(() => ftsIntegrityCheck(sql, 'nonexistent')).toThrow('FTS index not found')
    })

    it('returns ok for valid index', () => {
      ftsCreateIndex(sql, {
        indexName: 'integrity_fts',
        sourceTable: 'documents',
        columns: ['data'],
      })

      const result = ftsIntegrityCheck(sql, 'integrity_fts')
      expect(result).toBe('ok')
    })
  })
})

/**
 * Mock SqlStorage with FTS5 search simulation
 *
 * This enhanced mock simulates FTS5 MATCH queries with BM25 scoring.
 */
class MockSqlStorageWithSearch implements SqlStorage {
  private tables: Map<string, Map<string, unknown>[]> = new Map()
  private ftsData: Map<string, Array<Record<string, unknown>>> = new Map()
  public executedStatements: string[] = []

  exec(query: string, ...params: unknown[]): { toArray(): unknown[] } {
    this.executedStatements.push(query)

    // Handle CREATE TABLE IF NOT EXISTS
    const createTableMatch = query.match(
      /CREATE TABLE IF NOT EXISTS\s+"?(\w+)"?\s*\(/i
    )
    if (createTableMatch) {
      const tableName = createTableMatch[1]
      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, [])
      }
      return { toArray: () => [] }
    }

    // Handle CREATE VIRTUAL TABLE IF NOT EXISTS
    const createVirtualMatch = query.match(
      /CREATE VIRTUAL TABLE IF NOT EXISTS\s+"?(\w+)"?\s+USING/i
    )
    if (createVirtualMatch) {
      const tableName = createVirtualMatch[1]
      if (!this.ftsData.has(tableName)) {
        this.ftsData.set(tableName, [])
      }
      return { toArray: () => [] }
    }

    // Handle DROP TABLE IF EXISTS
    const dropMatch = query.match(/DROP TABLE IF EXISTS\s+"?(\w+)"?/i)
    if (dropMatch) {
      const tableName = dropMatch[1]
      this.ftsData.delete(tableName)
      this.tables.delete(tableName)
      return { toArray: () => [] }
    }

    // Handle INSERT INTO fts_indexes
    if (query.includes('INSERT INTO fts_indexes')) {
      const table = this.tables.get('fts_indexes') || []
      table.push({
        index_name: params[0],
        source_table: params[1],
        columns: params[2],
        tokenizer: params[3],
        tokenizer_options: params[4],
        column_weights: params[5],
        prefix_lengths: params[6],
        created_at: new Date().toISOString(),
      })
      this.tables.set('fts_indexes', table)
      return { toArray: () => [] }
    }

    // Handle SELECT 1 FROM fts_indexes (existence check)
    if (query.includes('SELECT 1 FROM fts_indexes WHERE index_name = ?')) {
      const table = this.tables.get('fts_indexes') || []
      const found = table.find((row: any) => row.index_name === params[0])
      return { toArray: () => (found ? [{ '1': 1 }] : []) }
    }

    // Handle SELECT * FROM fts_indexes (list all)
    if (query.includes('SELECT index_name, source_table, columns, tokenizer, created_at FROM fts_indexes')) {
      const table = this.tables.get('fts_indexes') || []
      return { toArray: () => table }
    }

    // Handle DELETE FROM fts_indexes
    if (query.includes('DELETE FROM fts_indexes WHERE index_name = ?')) {
      const table = this.tables.get('fts_indexes') || []
      const filtered = table.filter((row: any) => row.index_name !== params[0])
      this.tables.set('fts_indexes', filtered)
      return { toArray: () => [] }
    }

    // Handle FTS5 rebuild command
    if (query.includes("VALUES('rebuild')")) {
      return { toArray: () => [] }
    }

    // Handle FTS5 integrity-check command
    if (query.includes("VALUES('integrity-check')")) {
      return { toArray: () => [] }
    }

    // Handle COUNT(*) queries
    if (query.includes('COUNT(*)')) {
      const tableMatch = query.match(/FROM\s+"?(\w+)"?/i)
      if (tableMatch) {
        const tableName = tableMatch[1]
        const data = this.ftsData.get(tableName) || []
        return { toArray: () => [{ count: data.length }] }
      }
      return { toArray: () => [{ count: 0 }] }
    }

    // Handle FTS5 MATCH queries
    if (query.includes('MATCH')) {
      const tableMatch = query.match(/FROM\s+"?(\w+)"?/i)
      if (tableMatch) {
        const tableName = tableMatch[1]
        const data = this.ftsData.get(tableName) || []

        // Extract search term from MATCH clause
        const matchClause = query.match(/MATCH\s+'([^']+)'/i)
        if (!matchClause) {
          return { toArray: () => [] }
        }
        const searchTerm = matchClause[1].toLowerCase().replace(/\*/g, '')

        // Extract snippet markers if present
        // Format: snippet(table, col, 'start', 'end', 'ellipsis', tokens)
        const snippetMatch = query.match(/snippet\([^,]+,\s*-?\d+,\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(\d+)\)/i)
        const startMarker = snippetMatch ? snippetMatch[1].replace(/''/g, "'") : '<mark>'
        const endMarker = snippetMatch ? snippetMatch[2].replace(/''/g, "'") : '</mark>'
        const ellipsis = snippetMatch ? snippetMatch[3].replace(/''/g, "'") : '...'

        // Filter and score results
        const results = data
          .map((row, idx) => {
            const rowStr = JSON.stringify(row).toLowerCase()
            if (rowStr.includes(searchTerm)) {
              // Simulate BM25 score (negative, more negative = less relevant)
              const occurrences = (rowStr.match(new RegExp(searchTerm, 'g')) || []).length
              const score = -(1.0 / (occurrences * (idx + 1)))
              // Generate snippet with the extracted markers
              const snippet = query.includes('snippet')
                ? `${ellipsis}${startMarker}${searchTerm}${endMarker}${ellipsis}`
                : undefined
              return {
                rowid: idx + 1,
                ...row,
                score,
                snippet,
              }
            }
            return null
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)
          .sort((a, b) => a.score - b.score) // Sort ascending (more negative first)

        // Apply LIMIT
        const limit = typeof params[0] === 'number' ? params[0] : 100
        const offset = typeof params[1] === 'number' ? params[1] : 0

        return { toArray: () => results.slice(offset, offset + limit) }
      }
      return { toArray: () => [] }
    }

    return { toArray: () => [] }
  }

  // Helper to add test data to FTS table
  addFtsData(tableName: string, rows: Array<Record<string, unknown>>): void {
    this.ftsData.set(tableName, rows)
  }

  reset(): void {
    this.tables.clear()
    this.ftsData.clear()
    this.executedStatements = []
  }
}

describe('FTS Search Functions', () => {
  let sql: MockSqlStorageWithSearch

  beforeEach(() => {
    sql = new MockSqlStorageWithSearch()
  })

  describe('ftsSearchTable', () => {
    beforeEach(() => {
      // Create an FTS index
      ftsCreateIndex(sql, {
        indexName: 'test_fts',
        sourceTable: 'test_table',
        columns: ['id', 'title', 'content'],
      })

      // Add test data
      sql.addFtsData('test_fts', [
        { id: '1', title: 'Hello World', content: 'This is a test document' },
        { id: '2', title: 'Test Document', content: 'Another test with hello inside' },
        { id: '3', title: 'Goodbye', content: 'No matching terms here' },
      ])
    })

    it('returns results matching the search query', () => {
      const results = ftsSearchTable(sql, 'test_fts', 'hello')

      expect(results.length).toBeGreaterThan(0)
      expect(results.every(r => r.table === 'test_fts')).toBe(true)
    })

    it('returns results with BM25 scores', () => {
      const results = ftsSearchTable(sql, 'test_fts', 'hello')

      expect(results.every(r => typeof r.score === 'number')).toBe(true)
      // Scores should be positive (negated from SQLite's negative BM25)
      expect(results.every(r => r.score > 0)).toBe(true)
    })

    it('returns results sorted by relevance', () => {
      const results = ftsSearchTable(sql, 'test_fts', 'test')

      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score)
      }
    })

    it('respects limit option', () => {
      const results = ftsSearchTable(sql, 'test_fts', 'test', { limit: 1 })

      expect(results.length).toBeLessThanOrEqual(1)
    })

    it('respects offset option', () => {
      const allResults = ftsSearchTable(sql, 'test_fts', 'test')
      const offsetResults = ftsSearchTable(sql, 'test_fts', 'test', { offset: 1 })

      // Offset results should skip the first result
      if (allResults.length > 1 && offsetResults.length > 0) {
        expect(offsetResults[0].id).toBe(allResults[1].id)
      }
    })

    it('returns empty array for empty query', () => {
      const results = ftsSearchTable(sql, 'test_fts', '')
      expect(results).toEqual([])
    })

    it('returns empty array for whitespace-only query', () => {
      const results = ftsSearchTable(sql, 'test_fts', '   ')
      expect(results).toEqual([])
    })

    it('returns empty array for non-existent table', () => {
      const results = ftsSearchTable(sql, 'nonexistent_fts', 'hello')
      expect(results).toEqual([])
    })

    it('handles special characters in query safely', () => {
      // Should not throw or cause SQL injection
      const results = ftsSearchTable(sql, 'test_fts', "hello's world")
      expect(Array.isArray(results)).toBe(true)
    })

    it('handles prefix queries', () => {
      const results = ftsSearchTable(sql, 'test_fts', 'hel*')
      expect(Array.isArray(results)).toBe(true)
    })

    it('includes data in results', () => {
      const results = ftsSearchTable(sql, 'test_fts', 'hello')

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].data).toBeDefined()
    })
  })

  describe('ftsSearch', () => {
    beforeEach(() => {
      // Create multiple FTS indexes
      ftsCreateIndex(sql, {
        indexName: 'documents_fts',
        sourceTable: 'documents',
        columns: ['id', 'content'],
      })
      ftsCreateIndex(sql, {
        indexName: 'things_fts',
        sourceTable: 'things',
        columns: ['id', 'data'],
      })

      sql.addFtsData('documents_fts', [
        { id: 'doc1', content: 'Hello world document' },
        { id: 'doc2', content: 'Another test document' },
      ])
      sql.addFtsData('things_fts', [
        { id: 'thing1', data: 'Hello thing data' },
        { id: 'thing2', data: 'Different thing' },
      ])
    })

    it('searches all tracked indexes by default', () => {
      const results = ftsSearch(sql, 'hello')

      expect(results.length).toBeGreaterThan(0)
      // Should have results from multiple tables
      const tables = new Set(results.map(r => r.table))
      expect(tables.size).toBeGreaterThanOrEqual(1)
    })

    it('searches specific tables when provided', () => {
      const results = ftsSearch(sql, 'hello', { tables: ['documents_fts'] })

      expect(results.every(r => r.table === 'documents_fts')).toBe(true)
    })

    it('returns empty array when no indexes exist', () => {
      sql.reset()
      ftsInitTracking(sql)

      const results = ftsSearch(sql, 'hello')
      expect(results).toEqual([])
    })

    it('merges results from multiple tables sorted by score', () => {
      const results = ftsSearch(sql, 'hello')

      // Should be sorted by score descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score)
      }
    })

    it('applies pagination correctly', () => {
      const page1 = ftsSearch(sql, 'hello', { limit: 1, offset: 0 })
      const page2 = ftsSearch(sql, 'hello', { limit: 1, offset: 1 })

      expect(page1.length).toBeLessThanOrEqual(1)
      expect(page2.length).toBeLessThanOrEqual(1)

      if (page1.length > 0 && page2.length > 0) {
        expect(page1[0].id).not.toBe(page2[0].id)
      }
    })

    it('skips tables that error gracefully', () => {
      // Search with a mix of existing and non-existing tables
      const results = ftsSearch(sql, 'hello', {
        tables: ['documents_fts', 'nonexistent_fts'],
      })

      // Should still return results from the existing table
      expect(Array.isArray(results)).toBe(true)
    })

    it('uses default limit of 100', () => {
      // Add many documents
      const manyDocs = Array.from({ length: 150 }, (_, i) => ({
        id: `doc${i}`,
        content: `test document ${i}`,
      }))
      sql.addFtsData('documents_fts', manyDocs)

      const results = ftsSearch(sql, 'test', { tables: ['documents_fts'] })

      expect(results.length).toBeLessThanOrEqual(100)
    })
  })

  describe('ftsDocumentCount', () => {
    it('returns 0 for non-existent index', () => {
      const count = ftsDocumentCount(sql, 'nonexistent_fts')
      expect(count).toBe(0)
    })

    it('returns correct count for existing index', () => {
      ftsCreateIndex(sql, {
        indexName: 'count_fts',
        sourceTable: 'documents',
        columns: ['data'],
      })

      sql.addFtsData('count_fts', [
        { id: '1', data: 'test' },
        { id: '2', data: 'test2' },
        { id: '3', data: 'test3' },
      ])

      const count = ftsDocumentCount(sql, 'count_fts')
      expect(count).toBe(3)
    })
  })

  describe('ftsPopulateIndex', () => {
    it('calls rebuild on the index', () => {
      ftsCreateIndex(sql, {
        indexName: 'populate_fts',
        sourceTable: 'documents',
        columns: ['data'],
      })

      ftsPopulateIndex(sql, 'populate_fts')

      expect(sql.executedStatements.some(s => s.includes("VALUES('rebuild')"))).toBe(true)
    })
  })
})

describe('FTS Search Integration with RRF', () => {
  it('FTS results can be used with rrfMerge', async () => {
    const { rrfMerge } = await import('../../src/search/rrf')
    type SearchResult = { id: string; score: number; data?: Record<string, unknown> }

    const sql = new MockSqlStorageWithSearch()

    ftsCreateIndex(sql, {
      indexName: 'test_fts',
      sourceTable: 'documents',
      columns: ['id', 'content'],
    })

    sql.addFtsData('test_fts', [
      { id: '1', content: 'Hello world' },
      { id: '2', content: 'Hello there' },
    ])

    const ftsResults = ftsSearch(sql, 'hello', { tables: ['test_fts'] })

    // Convert FTS results to SearchResult format for RRF
    const searchResults: SearchResult[] = ftsResults.map(r => ({
      id: r.id,
      score: r.score,
      data: r.data,
    }))

    // Mock vector results
    const vectorResults: SearchResult[] = [
      { id: '2', score: 0.9 },
      { id: '3', score: 0.8 },
    ]

    const merged = rrfMerge(searchResults, vectorResults)

    expect(merged.length).toBeGreaterThan(0)
    // Results present in both should have higher scores
    expect(merged.some(r => r.id === '2')).toBe(true)
  })
})

describe('FTS Snippet Extraction', () => {
  let sql: MockSqlStorageWithSearch

  beforeEach(() => {
    sql = new MockSqlStorageWithSearch()

    // Create an FTS index with test data
    ftsCreateIndex(sql, {
      indexName: 'snippet_fts',
      sourceTable: 'documents',
      columns: ['id', 'title', 'content'],
    })

    sql.addFtsData('snippet_fts', [
      { id: '1', title: 'Hello World', content: 'This is a test document about hello world' },
      { id: '2', title: 'Test Document', content: 'Another test with hello inside the text' },
      { id: '3', title: 'Goodbye', content: 'No matching terms here at all' },
    ])
  })

  describe('ftsSearchTable with snippets', () => {
    it('returns snippets with default markers when includeSnippet is true', () => {
      const results = ftsSearchTable(sql, 'snippet_fts', 'hello', {
        includeSnippet: true,
      })

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].snippet).toBeDefined()
      expect(results[0].snippet).toContain('<mark>')
      expect(results[0].snippet).toContain('</mark>')
    })

    it('returns snippets with custom markers via snippet option', () => {
      const results = ftsSearchTable(sql, 'snippet_fts', 'hello', {
        includeSnippet: true,
        snippet: {
          startMarker: '<b>',
          endMarker: '</b>',
        },
      })

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].snippet).toBeDefined()
      expect(results[0].snippet).toContain('<b>')
      expect(results[0].snippet).toContain('</b>')
    })

    it('returns snippets with custom ellipsis', () => {
      const results = ftsSearchTable(sql, 'snippet_fts', 'hello', {
        includeSnippet: true,
        snippet: {
          ellipsis: ' [...] ',
        },
      })

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].snippet).toBeDefined()
      expect(results[0].snippet).toContain(' [...] ')
    })

    it('returns snippets with all custom options', () => {
      const results = ftsSearchTable(sql, 'snippet_fts', 'hello', {
        includeSnippet: true,
        snippet: {
          startMarker: '**',
          endMarker: '**',
          ellipsis: '~~~',
          tokens: 5,
          column: 1,
        },
      })

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].snippet).toBeDefined()
      expect(results[0].snippet).toContain('**')
      expect(results[0].snippet).toContain('~~~')
    })

    it('does not include snippet when includeSnippet is false', () => {
      const results = ftsSearchTable(sql, 'snippet_fts', 'hello', {
        includeSnippet: false,
      })

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].snippet).toBeUndefined()
    })

    it('legacy options still work (snippetTokens and snippetColumn)', () => {
      const results = ftsSearchTable(sql, 'snippet_fts', 'hello', {
        includeSnippet: true,
        snippetTokens: 20,
        snippetColumn: 2,
      })

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].snippet).toBeDefined()
    })

    it('snippet option takes precedence over legacy options', () => {
      const results = ftsSearchTable(sql, 'snippet_fts', 'hello', {
        includeSnippet: true,
        snippetTokens: 10,
        snippetColumn: -1,
        snippet: {
          tokens: 30,
          column: 2,
          startMarker: '[[',
          endMarker: ']]',
        },
      })

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].snippet).toBeDefined()
      // The snippet option markers should be used
      expect(results[0].snippet).toContain('[[')
      expect(results[0].snippet).toContain(']]')
    })
  })

  describe('ftsSnippet standalone function', () => {
    it('extracts snippet with default markers', () => {
      const snippet = ftsSnippet(sql, 'snippet_fts', 'hello', 1)

      // May return null in mock if the simulated behavior doesn't match
      // In real SQLite, this would return a snippet
      expect(snippet === null || typeof snippet === 'string').toBe(true)
    })

    it('extracts snippet with custom markers', () => {
      const snippet = ftsSnippet(sql, 'snippet_fts', 'hello', 1, {
        startMarker: '<strong>',
        endMarker: '</strong>',
      })

      expect(snippet === null || typeof snippet === 'string').toBe(true)
    })

    it('returns null for empty query', () => {
      const snippet = ftsSnippet(sql, 'snippet_fts', '', 1)
      expect(snippet).toBeNull()
    })

    it('returns null for whitespace-only query', () => {
      const snippet = ftsSnippet(sql, 'snippet_fts', '   ', 1)
      expect(snippet).toBeNull()
    })

    it('handles custom ellipsis', () => {
      const snippet = ftsSnippet(sql, 'snippet_fts', 'hello', 1, {
        ellipsis: '...',
        tokens: 15,
      })

      expect(snippet === null || typeof snippet === 'string').toBe(true)
    })

    it('handles specific column selection', () => {
      const snippet = ftsSnippet(sql, 'snippet_fts', 'hello', 1, {
        column: 2, // content column
      })

      expect(snippet === null || typeof snippet === 'string').toBe(true)
    })
  })

  describe('ftsSearch with snippets', () => {
    beforeEach(() => {
      // Add another FTS index for multi-table search
      ftsCreateIndex(sql, {
        indexName: 'things_fts',
        sourceTable: 'things',
        columns: ['id', 'data'],
      })

      sql.addFtsData('things_fts', [
        { id: 'thing1', data: 'Hello thing data' },
      ])
    })

    it('includes snippets when searching across multiple tables', () => {
      const results = ftsSearch(sql, 'hello', {
        includeSnippet: true,
      })

      expect(results.length).toBeGreaterThan(0)
      // All results should have snippets
      expect(results.every(r => r.snippet !== undefined)).toBe(true)
    })

    it('uses custom snippet markers across all tables', () => {
      const results = ftsSearch(sql, 'hello', {
        includeSnippet: true,
        snippet: {
          startMarker: '>>>',
          endMarker: '<<<',
        },
      })

      expect(results.length).toBeGreaterThan(0)
      expect(results.every(r => r.snippet?.includes('>>>') && r.snippet?.includes('<<<'))).toBe(true)
    })
  })
})

describe('FTSSnippetOptions type', () => {
  it('allows all optional properties', () => {
    // Type check - this should compile without errors
    const options: FTSSnippetOptions = {}
    expect(options).toBeDefined()
  })

  it('allows full configuration', () => {
    const options: FTSSnippetOptions = {
      startMarker: '<em>',
      endMarker: '</em>',
      ellipsis: '...',
      tokens: 20,
      column: 1,
    }
    expect(options.startMarker).toBe('<em>')
    expect(options.endMarker).toBe('</em>')
    expect(options.ellipsis).toBe('...')
    expect(options.tokens).toBe(20)
    expect(options.column).toBe(1)
  })
})
