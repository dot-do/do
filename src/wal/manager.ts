/**
 * WALManager - Write-Ahead Log Manager
 *
 * Provides durability and recovery for database operations using SQLite.
 * Supports transactions with begin, commit, rollback, and savepoints.
 */

import type { WALEntry, WALRecoverOptions, WALManagerOptions, WALEntryType } from './types'

/**
 * SQL storage interface compatible with Durable Object SQLite storage
 */
interface SqlStorage {
  exec(query: string, ...params: unknown[]): {
    toArray(): unknown[]
  }
}

/**
 * Internal representation of a WAL entry row from SQLite
 */
interface WALEntryRow {
  id: string
  type: WALEntryType
  collection: string
  document_id: string
  timestamp: number
  data: string | null
  transaction_id: string | null
  savepoint_name: string | null
}

/**
 * Transaction state tracking
 */
type TransactionState = 'active' | 'committed' | 'rolledback'

/**
 * WALManager handles Write-Ahead Log operations for durability and recovery.
 */
export class WALManager {
  private sql: SqlStorage
  private lsnCounter: bigint = 0n
  private initialized: boolean = false
  private transactions: Map<string, TransactionState> = new Map()
  private savepoints: Map<string, Map<string, string>> = new Map() // txId -> Map<savepointName, lsn>
  private options: WALManagerOptions

  constructor(sql: SqlStorage, options: WALManagerOptions = {}) {
    this.sql = sql
    this.options = options
    this.initialize()
  }

  /**
   * Initialize the WAL table and recover state
   */
  private initialize(): void {
    if (this.initialized) return

    // Create WAL table if not exists
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS _wal (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        collection TEXT NOT NULL,
        document_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        data TEXT,
        transaction_id TEXT,
        savepoint_name TEXT
      )
    `)

    // Create index for faster transaction queries
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_wal_transaction_id ON _wal(transaction_id)
    `)

    // Recover LSN counter from existing entries
    const result = this.sql.exec(`
      SELECT MAX(CAST(id AS INTEGER)) as max_lsn FROM _wal
    `).toArray() as Array<{ max_lsn: number | null }>

    if (result.length > 0 && result[0].max_lsn !== null) {
      this.lsnCounter = BigInt(result[0].max_lsn)
    }

    // Recover transaction states
    this.recoverTransactionStates()

    // Auto-rollback uncommitted transactions if enabled
    if (this.options.autoRollbackOnRecovery) {
      this.autoRollbackUncommitted()
    }

    this.initialized = true
  }

  /**
   * Recover transaction states from WAL
   */
  private recoverTransactionStates(): void {
    // Find all begin entries
    const beginEntries = this.sql.exec(`
      SELECT DISTINCT transaction_id FROM _wal WHERE type = 'begin' AND transaction_id IS NOT NULL
    `).toArray() as Array<{ transaction_id: string }>

    for (const entry of beginEntries) {
      const txId = entry.transaction_id

      // Check if committed
      const commitResult = this.sql.exec(`
        SELECT id FROM _wal WHERE type = 'commit' AND transaction_id = ?
      `, txId).toArray()

      if (commitResult.length > 0) {
        this.transactions.set(txId, 'committed')
        continue
      }

      // Check if rolled back
      const rollbackResult = this.sql.exec(`
        SELECT id FROM _wal WHERE type = 'rollback' AND transaction_id = ?
      `, txId).toArray()

      if (rollbackResult.length > 0) {
        this.transactions.set(txId, 'rolledback')
        continue
      }

      // Transaction is still active (uncommitted)
      this.transactions.set(txId, 'active')
    }
  }

  /**
   * Auto-rollback all uncommitted transactions
   */
  private autoRollbackUncommitted(): void {
    for (const [txId, state] of this.transactions.entries()) {
      if (state === 'active') {
        // Perform silent rollback
        this.lsnCounter++
        const lsn = this.lsnCounter.toString()
        const timestamp = Date.now()

        this.sql.exec(`
          INSERT INTO _wal (id, type, collection, document_id, timestamp, data, transaction_id, savepoint_name)
          VALUES (?, 'rollback', '_system', '_rollback', ?, NULL, ?, NULL)
        `, lsn, timestamp, txId)

        this.transactions.set(txId, 'rolledback')
      }
    }
  }

  /**
   * Generate the next LSN
   */
  private nextLSN(): string {
    this.lsnCounter++
    return this.lsnCounter.toString()
  }

  /**
   * Generate a unique transaction ID
   */
  private generateTransactionId(): string {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 10)
    return `tx-${timestamp}-${random}`
  }

  /**
   * Append an entry to the WAL
   */
  async append(entry: Omit<WALEntry, 'id' | 'timestamp'>): Promise<WALEntry> {
    const id = this.nextLSN()
    const timestamp = new Date()

    this.sql.exec(`
      INSERT INTO _wal (id, type, collection, document_id, timestamp, data, transaction_id, savepoint_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id,
      entry.type,
      entry.collection,
      entry.documentId,
      timestamp.getTime(),
      entry.data ?? null,
      entry.transactionId ?? null,
      null
    )

    return {
      id,
      type: entry.type,
      collection: entry.collection,
      documentId: entry.documentId,
      timestamp,
      data: entry.data,
      transactionId: entry.transactionId,
    }
  }

  /**
   * Recover entries from the WAL
   */
  async recover(options?: WALRecoverOptions): Promise<WALEntry[]> {
    let query = 'SELECT * FROM _wal WHERE 1=1'
    const params: unknown[] = []

    // Filter by afterLSN
    if (options?.afterLSN) {
      query += ' AND CAST(id AS INTEGER) > CAST(? AS INTEGER)'
      params.push(options.afterLSN)
    }

    // Filter by transactionId
    if (options?.transactionId) {
      query += ' AND transaction_id = ?'
      params.push(options.transactionId)

      // Check if transaction was rolled back - if so, return empty
      const state = this.transactions.get(options.transactionId)
      if (state === 'rolledback') {
        // Check for rollback_to_savepoint entries to filter properly
        const rollbackToSavepointEntries = this.sql.exec(`
          SELECT savepoint_name, CAST(id AS INTEGER) as lsn FROM _wal
          WHERE type = 'rollback_to_savepoint' AND transaction_id = ?
          ORDER BY CAST(id AS INTEGER) DESC
        `, options.transactionId).toArray() as Array<{ savepoint_name: string, lsn: number }>

        if (rollbackToSavepointEntries.length === 0) {
          // Full rollback, return empty
          return []
        }
      }
    }

    // Filter uncommitted only
    if (options?.uncommittedOnly) {
      // Only include entries from active transactions
      const activeTransactions = Array.from(this.transactions.entries())
        .filter(([_, state]) => state === 'active')
        .map(([txId, _]) => txId)

      if (activeTransactions.length === 0) {
        // No uncommitted transactions
        query += ' AND transaction_id IS NOT NULL AND 1=0'
      } else {
        query += ` AND transaction_id IN (${activeTransactions.map(() => '?').join(', ')})`
        params.push(...activeTransactions)
      }
    }

    // Exclude commit/rollback markers by default
    // Build exclusion list based on options
    const excludeTypes: string[] = ['begin', 'savepoint', 'rollback_to_savepoint']
    if (!options?.includeCommitMarkers) {
      excludeTypes.push('commit')
    }
    if (!options?.includeRollbackMarkers) {
      excludeTypes.push('rollback')
    }
    query += ` AND type NOT IN (${excludeTypes.map(t => `'${t}'`).join(', ')})`

    // Order by LSN
    query += ' ORDER BY CAST(id AS INTEGER) ASC'

    const rows = this.sql.exec(query, ...params).toArray() as WALEntryRow[]

    // Post-process for rollback_to_savepoint filtering
    let filteredRows = rows
    if (options?.transactionId) {
      const txId = options.transactionId
      filteredRows = this.filterByRollbackToSavepoint(rows, txId)
    }

    return filteredRows.map((row) => ({
      id: row.id,
      type: row.type,
      collection: row.collection,
      documentId: row.document_id,
      timestamp: new Date(row.timestamp),
      data: row.data ?? undefined,
      transactionId: row.transaction_id ?? undefined,
      savepointName: row.savepoint_name ?? undefined,
    }))
  }

  /**
   * Filter rows by rollback_to_savepoint operations
   */
  private filterByRollbackToSavepoint(rows: WALEntryRow[], txId: string): WALEntryRow[] {
    // Get all rollback_to_savepoint entries for this transaction
    const rollbackToSavepointEntries = this.sql.exec(`
      SELECT savepoint_name, CAST(id AS INTEGER) as lsn FROM _wal
      WHERE type = 'rollback_to_savepoint' AND transaction_id = ?
      ORDER BY CAST(id AS INTEGER) ASC
    `, txId).toArray() as Array<{ savepoint_name: string, lsn: number }>

    if (rollbackToSavepointEntries.length === 0) {
      return rows
    }

    // Get savepoint LSNs
    const savepointLSNs = this.sql.exec(`
      SELECT savepoint_name, CAST(id AS INTEGER) as lsn FROM _wal
      WHERE type = 'savepoint' AND transaction_id = ?
    `, txId).toArray() as Array<{ savepoint_name: string, lsn: number }>

    const savepointMap = new Map<string, number>()
    for (const sp of savepointLSNs) {
      savepointMap.set(sp.savepoint_name, sp.lsn)
    }

    // Process rollbacks to determine valid ranges
    let excludeAfterLSN: number | null = null
    for (const rb of rollbackToSavepointEntries) {
      const savepointLSN = savepointMap.get(rb.savepoint_name)
      if (savepointLSN !== undefined) {
        // Entries after savepoint and before rollback_to_savepoint are excluded
        excludeAfterLSN = savepointLSN
      }
    }

    if (excludeAfterLSN !== null) {
      return rows.filter(row => parseInt(row.id) <= excludeAfterLSN!)
    }

    return rows
  }

  /**
   * Begin a new transaction
   */
  async begin(): Promise<string> {
    const txId = this.generateTransactionId()

    // Record begin entry in WAL
    const id = this.nextLSN()
    const timestamp = Date.now()

    this.sql.exec(`
      INSERT INTO _wal (id, type, collection, document_id, timestamp, data, transaction_id, savepoint_name)
      VALUES (?, 'begin', '_system', '_begin', ?, NULL, ?, NULL)
    `, id, timestamp, txId)

    this.transactions.set(txId, 'active')
    this.savepoints.set(txId, new Map())

    return txId
  }

  /**
   * Commit a transaction
   */
  async commit(txId: string): Promise<void> {
    const state = this.transactions.get(txId)

    if (state === undefined) {
      throw new Error(`Transaction ${txId} does not exist`)
    }

    if (state === 'committed') {
      throw new Error(`Transaction ${txId} is already committed`)
    }

    if (state === 'rolledback') {
      throw new Error(`Transaction ${txId} has been rolled back`)
    }

    // Record commit entry in WAL
    const id = this.nextLSN()
    const timestamp = Date.now()

    this.sql.exec(`
      INSERT INTO _wal (id, type, collection, document_id, timestamp, data, transaction_id, savepoint_name)
      VALUES (?, 'commit', '_system', '_commit', ?, NULL, ?, NULL)
    `, id, timestamp, txId)

    this.transactions.set(txId, 'committed')
  }

  /**
   * Rollback a transaction
   */
  async rollback(txId: string): Promise<void> {
    const state = this.transactions.get(txId)

    if (state === undefined) {
      throw new Error(`Transaction ${txId} does not exist`)
    }

    if (state === 'committed') {
      throw new Error(`Transaction ${txId} is already committed`)
    }

    if (state === 'rolledback') {
      throw new Error(`Transaction ${txId} has already been rolled back`)
    }

    // Record rollback entry in WAL
    const id = this.nextLSN()
    const timestamp = Date.now()

    this.sql.exec(`
      INSERT INTO _wal (id, type, collection, document_id, timestamp, data, transaction_id, savepoint_name)
      VALUES (?, 'rollback', '_system', '_rollback', ?, NULL, ?, NULL)
    `, id, timestamp, txId)

    this.transactions.set(txId, 'rolledback')
  }

  /**
   * Create a savepoint within a transaction
   */
  async savepoint(txId: string, name: string): Promise<string> {
    const state = this.transactions.get(txId)

    if (state === undefined) {
      throw new Error(`Transaction ${txId} does not exist`)
    }

    if (state !== 'active') {
      throw new Error(`Transaction ${txId} is not active`)
    }

    // Record savepoint entry in WAL
    const id = this.nextLSN()
    const timestamp = Date.now()

    this.sql.exec(`
      INSERT INTO _wal (id, type, collection, document_id, timestamp, data, transaction_id, savepoint_name)
      VALUES (?, 'savepoint', '_system', '_savepoint', ?, NULL, ?, ?)
    `, id, timestamp, txId, name)

    // Track savepoint LSN
    const txSavepoints = this.savepoints.get(txId) ?? new Map()
    txSavepoints.set(name, id)
    this.savepoints.set(txId, txSavepoints)

    return id
  }

  /**
   * Rollback to a savepoint within a transaction
   */
  async rollbackToSavepoint(txId: string, savepointId: string): Promise<void> {
    const state = this.transactions.get(txId)

    if (state === undefined) {
      throw new Error(`Transaction ${txId} does not exist`)
    }

    if (state !== 'active') {
      throw new Error(`Transaction ${txId} is not active`)
    }

    // Find the savepoint name by ID
    const txSavepoints = this.savepoints.get(txId)
    if (!txSavepoints) {
      throw new Error(`No savepoints found for transaction ${txId}`)
    }

    let savepointName: string | null = null
    for (const [name, id] of txSavepoints.entries()) {
      if (id === savepointId) {
        savepointName = name
        break
      }
    }

    if (!savepointName) {
      throw new Error(`Savepoint ${savepointId} not found in transaction ${txId}`)
    }

    // Record rollback_to_savepoint entry in WAL
    const id = this.nextLSN()
    const timestamp = Date.now()

    this.sql.exec(`
      INSERT INTO _wal (id, type, collection, document_id, timestamp, data, transaction_id, savepoint_name)
      VALUES (?, 'rollback_to_savepoint', '_system', '_rollback_to_savepoint', ?, NULL, ?, ?)
    `, id, timestamp, txId, savepointName)
  }

  /**
   * Get all uncommitted transaction IDs
   */
  async getUncommittedTransactions(): Promise<string[]> {
    return Array.from(this.transactions.entries())
      .filter(([_, state]) => state === 'active')
      .map(([txId, _]) => txId)
  }
}
