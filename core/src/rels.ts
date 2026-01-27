/**
 * Relationships - a pattern on top of SQLite
 *
 * Simple helper for relationship storage. Not a package, just a pattern.
 * ~20 lines of actual logic.
 */

export interface Rel {
  id: string
  from: string
  predicate: string
  to: string
  reverse?: string
  createdAt: number
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

  return {
    add(from: string, predicate: string, to: string, reverse?: string): Rel {
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

    get(id: string): Rel | null {
      return sql.exec(`SELECT * FROM _rels WHERE id = ?`, id).one() as Rel | null
    },

    from(id: string, predicate?: string): Rel[] {
      if (predicate) {
        return sql.exec(`SELECT * FROM _rels WHERE "from" = ? AND predicate = ?`, id, predicate).toArray() as Rel[]
      }
      return sql.exec(`SELECT * FROM _rels WHERE "from" = ?`, id).toArray() as Rel[]
    },

    to(id: string, predicate?: string): Rel[] {
      if (predicate) {
        return sql.exec(`SELECT * FROM _rels WHERE "to" = ? AND predicate = ?`, id, predicate).toArray() as Rel[]
      }
      return sql.exec(`SELECT * FROM _rels WHERE "to" = ?`, id).toArray() as Rel[]
    },
  }
}
