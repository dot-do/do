# DO Tail Worker - Observability Collection

The tail worker receives all events from Durable Objects and Workers in the DO framework, providing centralized observability, metrics collection, and analytics forwarding.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  DO Framework   │────>│   Tail Worker   │────>│  TailCollector  │
│  (any worker)   │     │   (index.ts)    │     │      (DO)       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │                        │
                                │                        │
                        ┌───────▼────────┐       ┌──────▼──────┐
                        │   Handlers     │       │     R2      │
                        │ (handlers.ts)  │       │  (storage)  │
                        └───────┬────────┘       └─────────────┘
                                │
                        ┌───────▼────────┐
                        │   Analytics    │
                        │(analytics.ts)  │
                        └────────────────┘
```

## Features

### Event Reception
- Receives all `TraceItem` events from producer workers
- Processes events through the diagnostics channel
- Extracts DO observability events from logs

### Event Processing
- Groups events by importance level (CRITICAL, HIGH, NORMAL, LOW)
- Routes events to appropriate handlers based on type
- Logs events to console for development visibility

### Storage
- Buffers events in TailCollectorDO with importance-based thresholds
- Flushes to R2 in date-partitioned JSON format
- Supports manual flush and stats endpoints

### Analytics Forwarding (Optional)
- Forwards events to external analytics services
- Supports multiple destinations (Analytics Engine, custom endpoints)
- Configurable per event type

## Event Types

The tail worker handles all events defined in `types/observability.ts`:

| Namespace | Events |
|-----------|--------|
| DO.Lifecycle | created, hibernated, awakened, deleted |
| RPC | Request.received, Response.sent, Request.failed |
| CDC | Event.emitted, Buffer.flushed, Stream.updated |
| AI | Generation.started/completed/failed, Embedding.created |
| Workflow | Execution.started/completed/failed, Step.completed/failed, State.changed |
| Agent | Session.started/ended, Message.received, Tool.called |
| Execution | Code.started/completed/failed |
| Storage | Snapshot.created, Sync.completed |
| Connection | WebSocket.opened/closed/hibernated |
| Schedule | Alarm.fired, Task.executed |
| Financial | Payment.completed, Transfer.completed |
| Communication | Email.sent, Slack.posted, SMS.sent |
| Telephony | Call.started/ended |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FLUSH_INTERVAL_SECONDS` | Interval between automatic flushes | `30` |
| `BATCH_SIZE` | Maximum batch size for processing | `1000` |
| `ANALYTICS_ENABLED` | Enable analytics forwarding | `false` |
| `ANALYTICS_ENDPOINT` | Custom analytics endpoint URL | - |
| `LOG_LEVEL` | Console log level (debug, info, warn, error) | `info` |

### Buffer Thresholds

Events are buffered by importance with different thresholds:

| Importance | Max Rows | Max Bytes |
|------------|----------|-----------|
| CRITICAL (0) | 10 | 1 MB |
| HIGH (1) | 100 | 10 MB |
| NORMAL (2) | 1,000 | 50 MB |
| LOW (3) | 5,000 | 100 MB |

## API Endpoints

### Health Check
```
GET /health
```
Returns service status.

### Stats
```
GET /stats
```
Returns current buffer sizes and event counts.

### Flush
```
POST /flush
```
Forces immediate flush of all buffered events.

## Development

### Local Development
```bash
wrangler dev
```
Console logging is enabled by default in development mode.

### Viewing Logs
All events are logged to console with structured formatting:
```
[DO.Lifecycle.created] id=abc-123 type=Agent
[AI.Generation.completed] id=gen-456 tokens=1500 duration=2340ms
```

### Testing
```bash
# Send test events
curl -X POST http://localhost:8788/test-events

# View stats
curl http://localhost:8788/stats

# Force flush
curl -X POST http://localhost:8788/flush
```

## Connecting Workers

To send events to this tail worker, configure your worker's `wrangler.toml`:

```toml
tail_consumers = [
  { service = "do-tail" }
]
```

## R2 Storage Format

Events are stored in R2 with the following structure:
```
tail-events/
  2026-01-23/
    importance-0/
      14-30-abc123.json
    importance-1/
      14-30-def456.json
    ...
```

Each file contains a JSON array of events with metadata in R2 custom headers.
