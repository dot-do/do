/**
 * Benchmark 07: DO Collections Only
 *
 * Measures the bundle size of DO's db/collections.
 */
import { DurableObject } from 'cloudflare:workers'
import {
  NounCollection,
  VerbCollection,
  ThingCollection,
  ActionCollection,
  RelationshipCollection,
} from '../../db/collections/index.js'

export class CollectionsDO extends DurableObject<Env> {
  nouns = new NounCollection(this.ctx)
  verbs = new VerbCollection(this.ctx)
  things = new ThingCollection(this.ctx)
  actions = new ActionCollection(this.ctx)
  relationships = new RelationshipCollection(this.ctx)

  async fetch(request: Request): Promise<Response> {
    return Response.json({ status: 'ok' })
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.DO.idFromName('default')
    return env.DO.get(id).fetch(request)
  },
}

interface Env {
  DO: DurableObjectNamespace<CollectionsDO>
}
