/**
 * Relationships - graph edges on top of SQLite
 *
 * - relationships(id) = outgoing edges (this entity points TO others)
 * - references(id) = incoming edges (others point TO this entity)
 */

export interface Relationship {
  id: string
  from: string
  predicate: string
  to: string
  reverse?: string
  createdAt: number
}

/** Options for expanding relationships when fetching data */
export interface ExpandOptions {
  /** Include outgoing relationships (predicates to expand) */
  include?: string[]
  /** Include incoming references (predicates to expand) */
  refs?: string[]
  /** Return full objects instead of just IDs */
  expand?: boolean
}

export function createRels(sql: SqlStorage) {
  // Initialize table + indexes
  sql.exec(`
    CREATE TABLE IF NOT EXISTS _rels (
      id TEXT PRIMARY KEY,
      "from" TEXT NOT NULL,
      predicate TEXT NOT NULL,
      "to" TEXT NOT NULL,
      reverse TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_rels_from ON _rels("from");
    CREATE INDEX IF NOT EXISTS idx_rels_to ON _rels("to");
    CREATE INDEX IF NOT EXISTS idx_rels_pred ON _rels(predicate);
  `)

  const mapRow = (row: Record<string, unknown>): Relationship => ({
    id: row.id as string,
    from: row.from as string,
    predicate: row.predicate as string,
    to: row.to as string,
    reverse: row.reverse as string | undefined,
    createdAt: row.created_at as number,
  })

  return {
    /**
     * Create a relationship: from --[predicate]--> to
     * @param from Source entity ID
     * @param predicate Relationship type (e.g., "follows", "owns", "memberOf")
     * @param to Target entity ID
     * @param reverse Optional inverse predicate (e.g., "followedBy", "ownedBy")
     */
    add(from: string, predicate: string, to: string, reverse?: string): Relationship {
      const id = `${from}:${predicate}:${to}`
      sql.exec(
        `INSERT OR REPLACE INTO _rels (id, "from", predicate, "to", reverse) VALUES (?, ?, ?, ?, ?)`,
        id,
        from,
        predicate,
        to,
        reverse ?? null
      )
      return { id, from, predicate, to, reverse, createdAt: Date.now() }
    },

    delete(id: string): void {
      sql.exec(`DELETE FROM _rels WHERE id = ?`, id)
    },

    get(id: string): Relationship | null {
      const row = sql.exec(`SELECT * FROM _rels WHERE id = ?`, id).one()
      return row ? mapRow(row) : null
    },

    /**
     * Get outgoing relationships FROM this entity
     * "What does this entity point to?"
     */
    relationships(id: string, predicate?: string): Relationship[] {
      if (predicate) {
        return sql.exec(`SELECT * FROM _rels WHERE "from" = ? AND predicate = ?`, id, predicate).toArray().map(mapRow)
      }
      return sql.exec(`SELECT * FROM _rels WHERE "from" = ?`, id).toArray().map(mapRow)
    },

    /**
     * Get incoming references TO this entity
     * "What points to this entity?"
     */
    references(id: string, predicate?: string): Relationship[] {
      if (predicate) {
        return sql.exec(`SELECT * FROM _rels WHERE "to" = ? AND predicate = ?`, id, predicate).toArray().map(mapRow)
      }
      return sql.exec(`SELECT * FROM _rels WHERE "to" = ?`, id).toArray().map(mapRow)
    },

    /**
     * Get relationship targets as IDs grouped by predicate
     * Useful for merging into data objects
     */
    getRelationshipsByPredicate(id: string, predicates: string[]): Record<string, string[]> {
      const result: Record<string, string[]> = {}
      for (const pred of predicates) {
        const rels = sql.exec(`SELECT "to" FROM _rels WHERE "from" = ? AND predicate = ?`, id, pred).toArray()
        result[pred] = rels.map((r) => r.to as string)
      }
      return result
    },

    /**
     * Get reference sources as IDs grouped by predicate (using reverse name if available)
     * Useful for merging into data objects
     */
    getReferencesByPredicate(id: string, predicates: string[]): Record<string, string[]> {
      const result: Record<string, string[]> = {}
      for (const pred of predicates) {
        const rels = sql.exec(`SELECT "from", reverse FROM _rels WHERE "to" = ? AND predicate = ?`, id, pred).toArray()
        // Use reverse predicate name if available, otherwise append "By"
        const key = (rels[0]?.reverse as string) || `${pred}By`
        result[key] = rels.map((r) => r.from as string)
      }
      return result
    },
  }
}

