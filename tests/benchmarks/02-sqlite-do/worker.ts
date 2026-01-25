/**
 * Benchmark 02: SQLite Durable Object
 *
 * DO with SQLite storage enabled.
 * Measures overhead of SQLite-backed DO.
 */
import { DurableObject } from 'cloudflare:workers'

export class SqliteDO extends DurableObject<Env> {
  sql = this.ctx.storage.sql

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/init') {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)`)
      return new Response('initialized')
    }

    if (url.pathname === '/get') {
      const key = url.searchParams.get('key') || 'default'
      const row = this.sql.exec(`SELECT value FROM kv WHERE key = ?`, key).one()
      return Response.json({ value: row?.value ?? null })
    }

    if (url.pathname === '/set') {
      const key = url.searchParams.get('key') || 'default'
      const value = url.searchParams.get('value') || ''
      this.sql.exec(`INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`, key, value)
      return new Response('ok')
    }

    return new Response('ok')
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.DO.idFromName('singleton')
    const stub = env.DO.get(id)
    return stub.fetch(request)
  },
}

interface Env {
  DO: DurableObjectNamespace<SqliteDO>
}
