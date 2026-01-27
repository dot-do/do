/**
 * CDC (Change Data Capture) - emit mutations to Pipeline
 *
 * Simple event emitter. Ships to Cloudflare Pipeline when binding exists,
 * otherwise logs for tail worker to capture.
 */

export interface CDCEvent {
  $id: string
  $context: string
  event: string
  data: unknown
  timestamp: number
}

export interface CDCEmitter {
  emit(event: string, data: unknown): void
}

export function createCDC($id: string, $context: string, pipeline?: unknown): CDCEmitter {
  return {
    emit(event: string, data: unknown) {
      const cdcEvent: CDCEvent = {
        $id,
        $context,
        event,
        data,
        timestamp: Date.now(),
      }

      // If pipeline binding exists, send there
      if (pipeline && typeof (pipeline as any).send === 'function') {
        ;(pipeline as any).send(cdcEvent)
        return
      }

      // Otherwise log for tail worker to capture
      console.log(JSON.stringify({ type: 'cdc', ...cdcEvent }))
    },
  }
}
