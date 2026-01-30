/**
 * CDC (Change Data Capture) - emit mutations to Pipeline
 *
 * Emits semantic events matching the events pipeline schema:
 * - namespace: "DO"
 * - object: "Document", "Relationship", etc.
 * - event: "created", "updated", "deleted"
 * - by: actor (user/agent/code)
 * - in: request ID (for correlation)
 */

export interface SemanticEvent {
  id: string
  timestamp: string
  namespace: string
  object: string
  event: string
  type: string
  subject_type?: string
  predicate_type?: string
  object_type?: string
  context?: string
  by?: string
  in?: string
  data: Record<string, unknown>
  metadata: Record<string, unknown>
}

export interface CDCContext {
  $id: string
  $context: string
  actor?: string
  requestId?: string
}

export interface CDCEmitter {
  emit(object: string, event: string, data: Record<string, unknown>, extra?: Partial<SemanticEvent>): void
  setContext(ctx: Partial<CDCContext>): void
}

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `evt_${timestamp}_${random}`
}

export function createCDC($id: string, $context: string, pipeline?: unknown): CDCEmitter {
  let ctx: CDCContext = { $id, $context }

  return {
    setContext(newCtx: Partial<CDCContext>) {
      ctx = { ...ctx, ...newCtx }
    },

    emit(object: string, event: string, data: Record<string, unknown>, extra?: Partial<SemanticEvent>) {
      const semanticEvent: SemanticEvent = {
        id: generateEventId(),
        timestamp: new Date().toISOString(),
        namespace: 'DO',
        object,
        event,
        type: `DO.${object}.${event}`,
        subject_type: extra?.subject_type,
        predicate_type: extra?.predicate_type,
        object_type: extra?.object_type,
        context: ctx.$context || undefined,
        by: ctx.actor,
        in: ctx.requestId,
        data: {
          doId: ctx.$id,
          ...data,
        },
        metadata: extra?.metadata || {},
      }

      // If pipeline binding exists, send there
      if (pipeline && typeof (pipeline as any).send === 'function') {
        ;(pipeline as any).send([semanticEvent])
        return
      }

      // Otherwise log for tail worker to capture
      console.log(JSON.stringify({ _cdc: true, ...semanticEvent }))
    },
  }
}

// Legacy export for backwards compatibility
export interface CDCEvent {
  $id: string
  $context: string
  event: string
  data: unknown
  timestamp: number
}
