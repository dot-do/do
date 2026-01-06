/**
 * @dotdo/do - WALManager Tests (RED Phase)
 *
 * These tests define the expected behavior of the WALManager class.
 * They should FAIL initially (RED) because the implementation doesn't exist yet.
 *
 * WALManager operations:
 * - append() - append a WAL entry to the log
 * - recover() - recover all uncommitted entries from the log
 *
 * WAL (Write-Ahead Log) is used for:
 * - Durability: ensuring writes survive crashes
 * - Recovery: replaying uncommitted operations after restart
 * - Atomicity: grouping multiple operations into transactions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WALManager } from '../src/wal/manager'
import type { WALEntry, WALEntryType } from '../src/wal/types'

/**
 * WAL entry row interface for mock storage
 */
interface MockWALRow {
  id: string
  type: string
  collection: string
  document_id: string
  timestamp: number
  data: string | null
  transaction_id: string | null
  savepoint_name: string | null
}

/**
 * Create a mock SQL storage for testing WALManager
 * This provides an in-memory implementation that mimics SQLite behavior
 */
function createMockSqlStorage() {
  const walTable: MockWALRow[] = []

  return {
    exec(query: string, ...params: unknown[]) {
      const normalizedQuery = query.trim().toUpperCase()
      let results: unknown[] = []

      if (normalizedQuery.startsWith('CREATE TABLE') || normalizedQuery.startsWith('CREATE INDEX')) {
        // Table/index creation - no-op for mock
      } else if (normalizedQuery.includes('INSERT INTO _WAL')) {
        // Handle different INSERT formats:
        // 1. Full params: VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        // 2. Partial params with literals: VALUES (?, 'type', 'collection', 'doc_id', ?, NULL, ?, NULL)

        // Extract VALUES clause to determine format
        const valuesMatch = query.match(/VALUES\s*\(([^)]+)\)/i)
        let row: MockWALRow

        if (valuesMatch) {
          const valuesStr = valuesMatch[1]
          const valueParts = valuesStr.split(',').map(v => v.trim())

          // Parse each value part and map to row
          let paramIndex = 0
          const getValue = (part: string): string | number | null => {
            if (part === '?') {
              return params[paramIndex++] as string | number | null
            } else if (part === 'NULL') {
              return null
            } else if (part.startsWith("'") && part.endsWith("'")) {
              return part.slice(1, -1)
            }
            return params[paramIndex++] as string | number | null
          }

          row = {
            id: getValue(valueParts[0]) as string,
            type: getValue(valueParts[1]) as string,
            collection: getValue(valueParts[2]) as string,
            document_id: getValue(valueParts[3]) as string,
            timestamp: getValue(valueParts[4]) as number,
            data: getValue(valueParts[5]) as string | null,
            transaction_id: getValue(valueParts[6]) as string | null,
            savepoint_name: getValue(valueParts[7]) as string | null,
          }
        } else {
          // Fallback - assume all params
          row = {
            id: params[0] as string,
            type: params[1] as string,
            collection: params[2] as string,
            document_id: params[3] as string,
            timestamp: params[4] as number,
            data: params[5] as string | null,
            transaction_id: params[6] as string | null,
            savepoint_name: params[7] as string | null,
          }
        }
        walTable.push(row)
      } else if (normalizedQuery.includes('SELECT') && normalizedQuery.includes('MAX')) {
        // SELECT MAX(CAST(id AS INTEGER)) as max_lsn FROM _wal
        if (walTable.length === 0) {
          results = [{ max_lsn: null }]
        } else {
          const maxLsn = Math.max(...walTable.map(r => parseInt(r.id)))
          results = [{ max_lsn: maxLsn }]
        }
      } else if (normalizedQuery.includes('SELECT DISTINCT TRANSACTION_ID') && normalizedQuery.includes("TYPE = 'BEGIN'")) {
        // SELECT DISTINCT transaction_id FROM _wal WHERE type = 'begin' AND transaction_id IS NOT NULL
        const txIds = new Set<string>()
        for (const row of walTable) {
          if (row.type === 'begin' && row.transaction_id !== null) {
            txIds.add(row.transaction_id)
          }
        }
        results = Array.from(txIds).map(id => ({ transaction_id: id }))
      } else if (normalizedQuery.includes('SELECT') && normalizedQuery.includes("TYPE = 'COMMIT'") && normalizedQuery.includes('TRANSACTION_ID =')) {
        // SELECT id FROM _wal WHERE type = 'commit' AND transaction_id = ?
        const txId = params[0] as string
        results = walTable.filter(r => r.type === 'commit' && r.transaction_id === txId).map(r => ({ id: r.id }))
      } else if (normalizedQuery.includes('SELECT') && normalizedQuery.includes("TYPE = 'ROLLBACK'") && normalizedQuery.includes('TRANSACTION_ID =') && !normalizedQuery.includes('ROLLBACK_TO_SAVEPOINT')) {
        // SELECT id FROM _wal WHERE type = 'rollback' AND transaction_id = ?
        const txId = params[0] as string
        results = walTable.filter(r => r.type === 'rollback' && r.transaction_id === txId).map(r => ({ id: r.id }))
      } else if (normalizedQuery.includes('SELECT') && normalizedQuery.includes('SAVEPOINT_NAME') && normalizedQuery.includes("TYPE = 'ROLLBACK_TO_SAVEPOINT'")) {
        // SELECT savepoint_name, CAST(id AS INTEGER) as lsn FROM _wal WHERE type = 'rollback_to_savepoint' AND transaction_id = ?
        const txId = params[0] as string
        results = walTable
          .filter(r => r.type === 'rollback_to_savepoint' && r.transaction_id === txId)
          .map(r => ({ savepoint_name: r.savepoint_name, lsn: parseInt(r.id) }))
          .sort((a, b) => a.lsn - b.lsn)
      } else if (normalizedQuery.includes('SELECT') && normalizedQuery.includes('SAVEPOINT_NAME') && normalizedQuery.includes("TYPE = 'SAVEPOINT'")) {
        // SELECT savepoint_name, CAST(id AS INTEGER) as lsn FROM _wal WHERE type = 'savepoint' AND transaction_id = ?
        const txId = params[0] as string
        results = walTable
          .filter(r => r.type === 'savepoint' && r.transaction_id === txId)
          .map(r => ({ savepoint_name: r.savepoint_name, lsn: parseInt(r.id) }))
      } else if (normalizedQuery.includes('SELECT * FROM _WAL')) {
        // Complex SELECT query with WHERE clause
        let filteredRows = [...walTable]

        // Parse parameters based on query structure
        let paramIndex = 0

        // Filter by afterLSN
        if (normalizedQuery.includes('CAST(ID AS INTEGER) > CAST(? AS INTEGER)')) {
          const afterLSN = params[paramIndex++] as string
          filteredRows = filteredRows.filter(r => parseInt(r.id) > parseInt(afterLSN))
        }

        // Handle special case: AND 1=0 means return empty results
        if (normalizedQuery.includes('AND 1=0')) {
          filteredRows = []
        }

        // Filter by transactionId
        if (normalizedQuery.includes('TRANSACTION_ID = ?') && !normalizedQuery.includes('TRANSACTION_ID IN')) {
          const txId = params[paramIndex++] as string
          filteredRows = filteredRows.filter(r => r.transaction_id === txId)
        }

        // Filter by multiple transaction IDs (uncommittedOnly)
        if (normalizedQuery.includes('TRANSACTION_ID IN')) {
          const txIdCount = (normalizedQuery.match(/\?/g) || []).length - paramIndex
          const txIds = params.slice(paramIndex, paramIndex + txIdCount) as string[]
          paramIndex += txIdCount
          filteredRows = filteredRows.filter(r => r.transaction_id !== null && txIds.includes(r.transaction_id))
        }

        // Filter out marker types based on query
        if (normalizedQuery.includes("TYPE NOT IN")) {
          // Extract the types from the NOT IN clause
          const notInMatch = normalizedQuery.match(/TYPE NOT IN \(([^)]+)\)/)
          if (notInMatch) {
            const typesStr = notInMatch[1]
            // Parse individual type strings like 'BEGIN', 'COMMIT', etc.
            const excludeTypes = typesStr.split(',').map(t => {
              const match = t.trim().match(/'([^']+)'/)
              return match ? match[1].toLowerCase() : ''
            }).filter(t => t !== '')

            filteredRows = filteredRows.filter(r => !excludeTypes.includes(r.type))
          }
        }

        // Order by LSN
        filteredRows.sort((a, b) => parseInt(a.id) - parseInt(b.id))

        results = filteredRows
      }

      return {
        toArray() {
          return results
        },
      }
    },
  }
}

/**
 * Create a mock context with SQLite storage
 */
function createMockCtx() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    storage: {
      sql: createMockSqlStorage(),
    },
  }
}

describe('WALManager', () => {
  describe('Class Structure', () => {
    it('should be a class that can be instantiated with storage', () => {
      const mockCtx = createMockCtx()
      const wal = new WALManager(mockCtx.storage.sql)
      expect(wal).toBeDefined()
      expect(wal).toBeInstanceOf(WALManager)
    })

    it('should have append method', () => {
      const mockCtx = createMockCtx()
      const wal = new WALManager(mockCtx.storage.sql)
      expect(wal.append).toBeDefined()
      expect(typeof wal.append).toBe('function')
    })

    it('should have recover method', () => {
      const mockCtx = createMockCtx()
      const wal = new WALManager(mockCtx.storage.sql)
      expect(wal.recover).toBeDefined()
      expect(typeof wal.recover).toBe('function')
    })
  })

  describe('append()', () => {
    let wal: WALManager

    beforeEach(() => {
      const mockCtx = createMockCtx()
      wal = new WALManager(mockCtx.storage.sql)
    })

    it('should append a write entry to the WAL', async () => {
      const entry: Omit<WALEntry, 'id' | 'timestamp'> = {
        type: 'write',
        collection: 'users',
        documentId: 'user-123',
        data: JSON.stringify({ name: 'John', email: 'john@example.com' }),
      }

      const result = await wal.append(entry)

      expect(result).toBeDefined()
      expect(result.id).toBeDefined()
      expect(typeof result.id).toBe('string')
      expect(result.timestamp).toBeDefined()
      expect(result.timestamp).toBeInstanceOf(Date)
      expect(result.type).toBe('write')
      expect(result.collection).toBe('users')
      expect(result.documentId).toBe('user-123')
    })

    it('should append a delete entry to the WAL', async () => {
      const entry: Omit<WALEntry, 'id' | 'timestamp'> = {
        type: 'delete',
        collection: 'users',
        documentId: 'user-123',
      }

      const result = await wal.append(entry)

      expect(result).toBeDefined()
      expect(result.id).toBeDefined()
      expect(result.type).toBe('delete')
      expect(result.collection).toBe('users')
      expect(result.documentId).toBe('user-123')
      expect(result.data).toBeUndefined()
    })

    it('should generate unique sequential IDs for entries', async () => {
      const entry1 = await wal.append({
        type: 'write',
        collection: 'users',
        documentId: 'user-1',
        data: '{}',
      })

      const entry2 = await wal.append({
        type: 'write',
        collection: 'users',
        documentId: 'user-2',
        data: '{}',
      })

      expect(entry1.id).not.toBe(entry2.id)
      // LSN (Log Sequence Number) should be sequential
      expect(BigInt(entry2.id)).toBeGreaterThan(BigInt(entry1.id))
    })

    it('should store entries with increasing timestamps', async () => {
      const entry1 = await wal.append({
        type: 'write',
        collection: 'users',
        documentId: 'user-1',
        data: '{}',
      })

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 1))

      const entry2 = await wal.append({
        type: 'write',
        collection: 'users',
        documentId: 'user-2',
        data: '{}',
      })

      expect(entry2.timestamp.getTime()).toBeGreaterThanOrEqual(entry1.timestamp.getTime())
    })

    it('should support optional transactionId for grouping entries', async () => {
      const txId = 'tx-abc-123'

      const entry = await wal.append({
        type: 'write',
        collection: 'users',
        documentId: 'user-1',
        data: '{}',
        transactionId: txId,
      })

      expect(entry.transactionId).toBe(txId)
    })

    it('should support checkpoint entry type', async () => {
      const entry = await wal.append({
        type: 'checkpoint',
        collection: '_system',
        documentId: '_checkpoint',
      })

      expect(entry.type).toBe('checkpoint')
    })
  })

  describe('recover()', () => {
    let wal: WALManager

    beforeEach(() => {
      const mockCtx = createMockCtx()
      wal = new WALManager(mockCtx.storage.sql)
    })

    it('should return empty array when no entries exist', async () => {
      const entries = await wal.recover()

      expect(Array.isArray(entries)).toBe(true)
      expect(entries.length).toBe(0)
    })

    it('should recover all uncommitted entries in order', async () => {
      // Append entries
      await wal.append({
        type: 'write',
        collection: 'users',
        documentId: 'user-1',
        data: JSON.stringify({ name: 'Alice' }),
      })

      await wal.append({
        type: 'write',
        collection: 'users',
        documentId: 'user-2',
        data: JSON.stringify({ name: 'Bob' }),
      })

      await wal.append({
        type: 'delete',
        collection: 'posts',
        documentId: 'post-1',
      })

      // Recover entries
      const entries = await wal.recover()

      expect(entries.length).toBe(3)
      expect(entries[0].documentId).toBe('user-1')
      expect(entries[1].documentId).toBe('user-2')
      expect(entries[2].documentId).toBe('post-1')
      expect(entries[2].type).toBe('delete')
    })

    it('should return entries in LSN order (oldest first)', async () => {
      await wal.append({
        type: 'write',
        collection: 'a',
        documentId: 'first',
        data: '{}',
      })

      await wal.append({
        type: 'write',
        collection: 'b',
        documentId: 'second',
        data: '{}',
      })

      await wal.append({
        type: 'write',
        collection: 'c',
        documentId: 'third',
        data: '{}',
      })

      const entries = await wal.recover()

      expect(entries[0].documentId).toBe('first')
      expect(entries[1].documentId).toBe('second')
      expect(entries[2].documentId).toBe('third')
    })

    it('should recover entries with their full data', async () => {
      const testData = { name: 'Test User', email: 'test@example.com', count: 42 }

      await wal.append({
        type: 'write',
        collection: 'users',
        documentId: 'user-1',
        data: JSON.stringify(testData),
      })

      const entries = await wal.recover()

      expect(entries.length).toBe(1)
      expect(entries[0].data).toBe(JSON.stringify(testData))
      expect(JSON.parse(entries[0].data!)).toEqual(testData)
    })

    it('should support recovering from a specific LSN', async () => {
      const entry1 = await wal.append({
        type: 'write',
        collection: 'users',
        documentId: 'user-1',
        data: '{}',
      })

      await wal.append({
        type: 'write',
        collection: 'users',
        documentId: 'user-2',
        data: '{}',
      })

      await wal.append({
        type: 'write',
        collection: 'users',
        documentId: 'user-3',
        data: '{}',
      })

      // Recover only entries after the first one
      const entries = await wal.recover({ afterLSN: entry1.id })

      expect(entries.length).toBe(2)
      expect(entries[0].documentId).toBe('user-2')
      expect(entries[1].documentId).toBe('user-3')
    })

    it('should support recovering entries for a specific transaction', async () => {
      const txId = 'tx-123'

      await wal.append({
        type: 'write',
        collection: 'users',
        documentId: 'user-1',
        data: '{}',
        transactionId: txId,
      })

      await wal.append({
        type: 'write',
        collection: 'users',
        documentId: 'user-2',
        data: '{}',
        // No transaction ID - not part of transaction
      })

      await wal.append({
        type: 'write',
        collection: 'users',
        documentId: 'user-3',
        data: '{}',
        transactionId: txId,
      })

      // Recover only entries from specific transaction
      const entries = await wal.recover({ transactionId: txId })

      expect(entries.length).toBe(2)
      expect(entries[0].documentId).toBe('user-1')
      expect(entries[1].documentId).toBe('user-3')
    })
  })

  describe('WALEntry Types', () => {
    it('should define WALEntry interface with required fields', () => {
      // Type assertion test - if this compiles, the types exist
      const entry: WALEntry = {
        id: '1',
        type: 'write',
        collection: 'test',
        documentId: 'doc-1',
        timestamp: new Date(),
        data: '{}',
      }

      expect(entry.id).toBe('1')
      expect(entry.type).toBe('write')
    })

    it('should define WALEntryType union type', () => {
      // Type assertion test
      const writeType: WALEntryType = 'write'
      const deleteType: WALEntryType = 'delete'
      const checkpointType: WALEntryType = 'checkpoint'

      expect(writeType).toBe('write')
      expect(deleteType).toBe('delete')
      expect(checkpointType).toBe('checkpoint')
    })
  })

  describe('Transaction Support', () => {
    describe('Class Structure', () => {
      it('should have begin method', () => {
        const mockCtx = createMockCtx()
        const wal = new WALManager(mockCtx.storage.sql)
        expect(wal.begin).toBeDefined()
        expect(typeof wal.begin).toBe('function')
      })

      it('should have commit method', () => {
        const mockCtx = createMockCtx()
        const wal = new WALManager(mockCtx.storage.sql)
        expect(wal.commit).toBeDefined()
        expect(typeof wal.commit).toBe('function')
      })

      it('should have rollback method', () => {
        const mockCtx = createMockCtx()
        const wal = new WALManager(mockCtx.storage.sql)
        expect(wal.rollback).toBeDefined()
        expect(typeof wal.rollback).toBe('function')
      })
    })

    describe('begin()', () => {
      let wal: WALManager

      beforeEach(() => {
        const mockCtx = createMockCtx()
        wal = new WALManager(mockCtx.storage.sql)
      })

      it('should return a unique transaction ID', async () => {
        const txId = await wal.begin()

        expect(txId).toBeDefined()
        expect(typeof txId).toBe('string')
        expect(txId.length).toBeGreaterThan(0)
      })

      it('should generate unique transaction IDs for each call', async () => {
        const txId1 = await wal.begin()
        const txId2 = await wal.begin()
        const txId3 = await wal.begin()

        expect(txId1).not.toBe(txId2)
        expect(txId2).not.toBe(txId3)
        expect(txId1).not.toBe(txId3)
      })

      it('should create a transaction that can be used for grouping entries', async () => {
        const txId = await wal.begin()

        const entry = await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{}',
          transactionId: txId,
        })

        expect(entry.transactionId).toBe(txId)
      })

      it('should support multiple concurrent transactions', async () => {
        const txId1 = await wal.begin()
        const txId2 = await wal.begin()

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{"tx": 1}',
          transactionId: txId1,
        })

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-2',
          data: '{"tx": 2}',
          transactionId: txId2,
        })

        const tx1Entries = await wal.recover({ transactionId: txId1 })
        const tx2Entries = await wal.recover({ transactionId: txId2 })

        expect(tx1Entries.length).toBe(1)
        expect(tx2Entries.length).toBe(1)
        expect(tx1Entries[0].documentId).toBe('user-1')
        expect(tx2Entries[0].documentId).toBe('user-2')
      })
    })

    describe('commit()', () => {
      let wal: WALManager

      beforeEach(() => {
        const mockCtx = createMockCtx()
        wal = new WALManager(mockCtx.storage.sql)
      })

      it('should commit a transaction by ID', async () => {
        const txId = await wal.begin()

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{}',
          transactionId: txId,
        })

        await expect(wal.commit(txId)).resolves.not.toThrow()
      })

      it('should mark all entries in the transaction as committed', async () => {
        const txId = await wal.begin()

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{}',
          transactionId: txId,
        })

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-2',
          data: '{}',
          transactionId: txId,
        })

        await wal.commit(txId)

        // After commit, entries should not appear in uncommitted recovery
        const uncommittedEntries = await wal.recover({ uncommittedOnly: true })
        const txEntries = uncommittedEntries.filter((e) => e.transactionId === txId)
        expect(txEntries.length).toBe(0)
      })

      it('should throw error when committing non-existent transaction', async () => {
        await expect(wal.commit('non-existent-tx')).rejects.toThrow()
      })

      it('should throw error when committing already committed transaction', async () => {
        const txId = await wal.begin()

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{}',
          transactionId: txId,
        })

        await wal.commit(txId)

        await expect(wal.commit(txId)).rejects.toThrow()
      })

      it('should write a commit marker entry to the WAL', async () => {
        const txId = await wal.begin()

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{}',
          transactionId: txId,
        })

        await wal.commit(txId)

        // Recover all entries to verify commit marker
        const allEntries = await wal.recover({ includeCommitMarkers: true })
        const commitMarker = allEntries.find(
          (e) => e.type === 'commit' && e.transactionId === txId
        )
        expect(commitMarker).toBeDefined()
        expect(commitMarker?.type).toBe('commit')
      })

      it('should not affect entries from other transactions', async () => {
        const txId1 = await wal.begin()
        const txId2 = await wal.begin()

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{}',
          transactionId: txId1,
        })

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-2',
          data: '{}',
          transactionId: txId2,
        })

        await wal.commit(txId1)

        // tx2 entries should still be uncommitted
        const uncommittedEntries = await wal.recover({ uncommittedOnly: true })
        const tx2Entries = uncommittedEntries.filter((e) => e.transactionId === txId2)
        expect(tx2Entries.length).toBe(1)
      })
    })

    describe('rollback()', () => {
      let wal: WALManager

      beforeEach(() => {
        const mockCtx = createMockCtx()
        wal = new WALManager(mockCtx.storage.sql)
      })

      it('should rollback a transaction by ID', async () => {
        const txId = await wal.begin()

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{}',
          transactionId: txId,
        })

        await expect(wal.rollback(txId)).resolves.not.toThrow()
      })

      it('should remove all entries from the rolled back transaction', async () => {
        const txId = await wal.begin()

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{}',
          transactionId: txId,
        })

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-2',
          data: '{}',
          transactionId: txId,
        })

        await wal.rollback(txId)

        // After rollback, entries should not appear in recovery
        const entries = await wal.recover({ transactionId: txId })
        expect(entries.length).toBe(0)
      })

      it('should throw error when rolling back non-existent transaction', async () => {
        await expect(wal.rollback('non-existent-tx')).rejects.toThrow()
      })

      it('should throw error when rolling back already committed transaction', async () => {
        const txId = await wal.begin()

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{}',
          transactionId: txId,
        })

        await wal.commit(txId)

        await expect(wal.rollback(txId)).rejects.toThrow()
      })

      it('should throw error when rolling back already rolled back transaction', async () => {
        const txId = await wal.begin()

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{}',
          transactionId: txId,
        })

        await wal.rollback(txId)

        await expect(wal.rollback(txId)).rejects.toThrow()
      })

      it('should write a rollback marker entry to the WAL', async () => {
        const txId = await wal.begin()

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{}',
          transactionId: txId,
        })

        await wal.rollback(txId)

        // Recover all entries to verify rollback marker
        const allEntries = await wal.recover({ includeRollbackMarkers: true })
        const rollbackMarker = allEntries.find(
          (e) => e.type === 'rollback' && e.transactionId === txId
        )
        expect(rollbackMarker).toBeDefined()
        expect(rollbackMarker?.type).toBe('rollback')
      })

      it('should not affect entries from other transactions', async () => {
        const txId1 = await wal.begin()
        const txId2 = await wal.begin()

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{}',
          transactionId: txId1,
        })

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-2',
          data: '{}',
          transactionId: txId2,
        })

        await wal.rollback(txId1)

        // tx2 entries should still exist
        const tx2Entries = await wal.recover({ transactionId: txId2 })
        expect(tx2Entries.length).toBe(1)
        expect(tx2Entries[0].documentId).toBe('user-2')
      })

      it('should support partial rollback with savepoints (optional)', async () => {
        const txId = await wal.begin()

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{}',
          transactionId: txId,
        })

        // Create a savepoint
        const savepoint = await wal.savepoint(txId, 'before-update')

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-2',
          data: '{}',
          transactionId: txId,
        })

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-3',
          data: '{}',
          transactionId: txId,
        })

        // Rollback to savepoint
        await wal.rollbackToSavepoint(txId, savepoint)

        // Only entries after savepoint should be removed
        const entries = await wal.recover({ transactionId: txId })
        expect(entries.length).toBe(1)
        expect(entries[0].documentId).toBe('user-1')
      })
    })

    describe('Transaction Recovery', () => {
      // For crash recovery tests, we need to share the same SQL storage
      // to simulate SQLite persistence across WALManager instances
      let sqlStorage: ReturnType<typeof createMockSqlStorage>
      let wal: WALManager

      beforeEach(() => {
        sqlStorage = createMockSqlStorage()
        wal = new WALManager(sqlStorage)
      })

      it('should recover uncommitted transactions after crash', async () => {
        const txId = await wal.begin()

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{}',
          transactionId: txId,
        })

        // Simulate crash - create new WAL manager instance with SAME storage
        const newWal = new WALManager(sqlStorage)

        // Get uncommitted transactions
        const uncommittedTxs = await newWal.getUncommittedTransactions()

        expect(uncommittedTxs).toContain(txId)
      })

      it('should not include committed transactions in uncommitted list', async () => {
        const txId1 = await wal.begin()
        const txId2 = await wal.begin()

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{}',
          transactionId: txId1,
        })

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-2',
          data: '{}',
          transactionId: txId2,
        })

        await wal.commit(txId1)

        // Simulate crash - create new WAL manager instance with SAME storage
        const newWal = new WALManager(sqlStorage)

        const uncommittedTxs = await newWal.getUncommittedTransactions()

        expect(uncommittedTxs).not.toContain(txId1)
        expect(uncommittedTxs).toContain(txId2)
      })

      it('should support automatic rollback of uncommitted transactions on recovery', async () => {
        const txId = await wal.begin()

        await wal.append({
          type: 'write',
          collection: 'users',
          documentId: 'user-1',
          data: '{}',
          transactionId: txId,
        })

        // Simulate crash - create new WAL manager with auto-rollback enabled and SAME storage
        const newWal = new WALManager(sqlStorage, { autoRollbackOnRecovery: true })

        // After auto-rollback, no uncommitted transactions should exist
        const uncommittedTxs = await newWal.getUncommittedTransactions()

        expect(uncommittedTxs.length).toBe(0)
      })
    })
  })
})
