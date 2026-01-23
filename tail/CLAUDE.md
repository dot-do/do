# Tail Worker - Implementation Guidelines

## Purpose

The tail worker is the observability backbone of the DO framework. It receives all events from all workers and Durable Objects, processes them, and routes them to storage and analytics.

## Architecture Principles

### Single Point of Observation
- All DO framework events flow through this tail worker
- Centralized processing enables consistent handling
- No event should bypass the tail worker

### Importance-Based Processing
- Events are classified by importance (CRITICAL, HIGH, NORMAL, LOW)
- Critical events (errors, exceptions) flush immediately
- Lower priority events are buffered for efficiency

### Hibernation-Friendly
- TailCollectorDO uses hibernation for cost savings
- State is persisted to SQLite between hibernations
- Alarms ensure regular flushing even during idle periods

## File Structure

```
tail/
  index.ts        - Worker entry point, tail handler
  collector-do.ts - TailCollectorDO for buffering
  handlers.ts     - Event type-specific handlers
  analytics.ts    - Analytics forwarding logic
  wrangler.jsonc  - Worker configuration
```

## Event Flow

1. **Reception**: `index.ts` tail() receives TraceItem events
2. **Extraction**: Parse DOObservabilityEvents from diagnostics channel
3. **Classification**: Determine importance level
4. **Handling**: Route to type-specific handlers
5. **Logging**: Console output for development
6. **Buffering**: Send to TailCollectorDO
7. **Storage**: Flush to R2 on threshold or alarm
8. **Analytics**: Forward to external services (optional)

## Implementation Notes

### TraceItem Structure
Cloudflare sends TraceItem objects with:
- `eventTimestamp`: When the event occurred
- `scriptName`: Source worker/DO name
- `outcome`: 'ok', 'exception', 'exceededCpu', etc.
- `exceptions`: Array of exception objects
- `logs`: Array of log entries
- `diagnosticsChannelEvents`: Custom events from DO framework

### DOObservabilityEvent Extraction
Events are sent via the diagnostics channel:
```typescript
// In DO framework:
console.info(JSON.stringify({ __do_event: event }))
// Or via diagnosticsChannelEvents
```

### Handler Pattern
Each event type has a handler in `handlers.ts`:
```typescript
export function handleDOLifecycleCreated(event: DOLifecycleCreatedEvent): void {
  // Log, process, forward
}
```

### Analytics Integration
The `analytics.ts` module supports:
- Cloudflare Analytics Engine
- Custom HTTP endpoints
- Batched forwarding for efficiency

## Testing

### Manual Testing
```bash
# Start dev server
wrangler dev

# In another terminal, trigger events in your main worker
# Events will appear in tail worker logs
```

### Event Simulation
For testing without a producer worker:
```typescript
// POST to /test-events endpoint (dev only)
```

## Common Tasks

### Adding New Event Type
1. Define event in `types/observability.ts`
2. Add handler in `handlers.ts`
3. Update type union in handlers
4. Add analytics forwarding if needed

### Changing Buffer Thresholds
Edit `BUFFER_THRESHOLDS` in `collector-do.ts`.

### Adding Analytics Destination
1. Add configuration to `analytics.ts`
2. Implement forwarding function
3. Register in analytics router

## Performance Considerations

- Tail handlers should be fast and non-blocking
- Use `ctx.waitUntil()` for async operations
- Buffer appropriately to reduce R2 writes
- Consider sampling for high-volume events
