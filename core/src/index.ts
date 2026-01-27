/**
 * DigitalObject - Every entity IS a Durable Object
 *
 * Extends DurableRPC with:
 * - $id (this DO's URL)
 * - $context (parent DO's URL)
 * - rels (relationships)
 * - collections (with CDC)
 * - Events pipeline
 */

import { DurableRPC } from './durable-rpc.js'
import { createCollection, type Collection } from '@dotdo/collections'
import { createRels, type Rel } from './rels.js'
import { createCDC, type CDCEmitter } from './cdc.js'

export { type Rel } from './rels.js'
export { type CDCEvent } from './cdc.js'

interface Env extends Record<string, unknown> {
  EVENTS_PIPELINE?: unknown
}

export class DigitalObject extends DurableRPC {
  $id: string = ''
  $context: string = ''

  private _rels!: ReturnType<typeof createRels>
  private _cdc!: CDCEmitter
  private _env!: Env
  private _collections = new Map<string, Collection<any>>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this._env = env
    this._rels = createRels(this.sql)
  }

  override async fetch(request: Request): Promise<Response> {
    // Set identity from request
    const url = new URL(request.url)
    this.$id = url.origin + (url.pathname !== '/' ? url.pathname.split('/').slice(0, 2).join('/') : '')
    this.$context = request.headers.get('X-DO-Context') || ''

    // Initialize events emitter with identity
    this._cdc = createCDC(this.$id, this.$context, this._env.EVENTS_PIPELINE)

    return super.fetch(request)
  }

  // Relationships API (exposed via RPC)
  rels = {
    add: (from: string, predicate: string, to: string, reverse?: string) => {
      const rel = this._rels.add(from, predicate, to, reverse)
      this._cdc.emit('rels.add', rel)
      return rel
    },

    delete: (id: string) => {
      this._rels.delete(id)
      this._cdc.emit('rels.delete', { id })
    },

    get: (id: string) => this._rels.get(id),
    from: (id: string, predicate?: string) => this._rels.from(id, predicate),
    to: (id: string, predicate?: string) => this._rels.to(id, predicate),
  }

  // Collections with CDC wrapping
  collection<T extends Record<string, unknown> = Record<string, unknown>>(name: string): Collection<T> {
    if (!this._collections.has(name)) {
      const col = createCollection<T>(this.sql, name)

      // Wrap mutating methods with CDC
      const originalPut = col.put.bind(col)
      const originalDelete = col.delete.bind(col)

      col.put = (id: string, data: T) => {
        const result = originalPut(id, data)
        this._cdc?.emit(`${name}.put`, { id, data })
        return result
      }

      col.delete = (id: string) => {
        const result = originalDelete(id)
        this._cdc?.emit(`${name}.delete`, { id })
        return result
      }

      this._collections.set(name, col)
    }
    return this._collections.get(name)! as Collection<T>
  }
}
