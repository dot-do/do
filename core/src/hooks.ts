/**
 * Verb Lifecycle Hook System
 *
 * Generic, client-agnostic hook registry for verb execution on entities.
 * Manages before/after hooks with a WeakMap-based per-client registry.
 *
 * Hook lifecycle: qualifying() -> qualify() -> qualified()
 * Before hooks can cancel or modify data; after hooks are informational.
 *
 * This is the canonical source for hook primitives in the .do ecosystem.
 * Higher-level wrappers (e.g., headless.ly's verb-hooks.ts) build on these
 * types and utilities to wire hooks onto specific client implementations.
 *
 * Related:
 * - digital-objects/linguistic.ts has the full verb conjugation system
 *   (toPastParticiple, toGerund, etc.) — this module provides a minimal
 *   pastTense() for contexts that don't need the full linguistic library
 * - rels.ts provides relationships, cdc.ts provides events — hooks.ts
 *   provides the verb lifecycle hook registry
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context passed to hook callbacks during verb execution */
export interface HookContext {
  /** The entity being acted upon (current state or minimal stub) */
  entity: Record<string, unknown>
  /** The verb being executed (e.g., 'qualify', 'close') */
  verb: string
  /** Data payload for the verb (may be undefined for no-data verbs) */
  data: Record<string, unknown> | undefined
  /** The entity type name (e.g., 'Contact', 'Deal') */
  type: string
}

/** A registered hook entry with unique ID and callback */
export interface HookEntry {
  id: string
  fn: (ctx: HookContext) => Promise<unknown>
}

/** Registry of before and after hooks, keyed by '{type}:{verb}' */
export interface HookRegistry {
  before: Map<string, HookEntry[]>
  after: Map<string, HookEntry[]>
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Per-client hook registries, keyed by the client instance (WeakMap for GC) */
const hookRegistries = new WeakMap<object, HookRegistry>()

let hookIdCounter = 0

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get or create a hook registry for a given client instance.
 * Uses a WeakMap so registries are garbage-collected when the client is.
 */
export function getOrCreateRegistry(client: object): HookRegistry {
  let registry = hookRegistries.get(client)
  if (!registry) {
    registry = { before: new Map(), after: new Map() }
    hookRegistries.set(client, registry)
  }
  return registry
}

/**
 * Compute the composite key for a hook: '{type}:{verb}'
 * Used to index hooks in the registry maps.
 */
export function hookKey(type: string, verb: string): string {
  return `${type}:${verb}`
}

/**
 * Register a hook in a registry map.
 * Returns the generated hook ID for later unregistration.
 */
export function registerHook(
  map: Map<string, HookEntry[]>,
  type: string,
  verb: string,
  fn: (ctx: HookContext) => Promise<unknown>,
): string {
  const id = `hook_${++hookIdCounter}`
  const key = hookKey(type, verb)
  if (!map.has(key)) map.set(key, [])
  map.get(key)!.push({ id, fn })
  return id
}

/**
 * Unregister a hook by ID from a registry map.
 * If no hookId is provided, clears all hooks for that type:verb.
 */
export function unregisterHook(
  map: Map<string, HookEntry[]>,
  type: string,
  verb: string,
  hookId?: string,
): void {
  const key = hookKey(type, verb)
  const hooks = map.get(key)
  if (!hooks) return
  if (hookId) {
    const idx = hooks.findIndex((h) => h.id === hookId)
    if (idx !== -1) hooks.splice(idx, 1)
  } else {
    hooks.length = 0
  }
}

// ---------------------------------------------------------------------------
// Verb Conjugation (minimal)
// ---------------------------------------------------------------------------

/**
 * Compute the past-tense form of a verb.
 *
 * This is a minimal implementation for hook lifecycle naming
 * (qualify -> qualified, close -> closed). For full linguistic
 * conjugation with irregular verbs and consonant doubling, use
 * digital-objects' toPastParticiple() from linguistic.ts.
 */
export function pastTense(verb: string): string {
  if (verb.endsWith('e')) return verb + 'd'
  if (verb.endsWith('y')) return verb.slice(0, -1) + 'ied'
  return verb + 'ed'
}
