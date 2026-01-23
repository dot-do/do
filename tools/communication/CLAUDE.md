# CLAUDE.md - Communication Module

## Purpose

Communication layer for Digital Objects. Email (inbound/outbound), Slack, Discord, and human-in-the-loop approvals.

## Key Concepts

- **Multi-channel** - Email, Slack, Discord, Teams (unified interface)
- **HITL** - Human-in-the-loop for AI agent oversight
- **Templates** - Reusable message templates across channels
- **Tracking** - Email delivery tracking, approval audit trails

## Files

| File | Responsibility |
|------|----------------|
| `email.ts` | Inbound (Cloudflare), outbound (SES/Mailchannels), tracking |
| `slack.ts` | Bot connection, Block Kit builders, interactions |
| `discord.ts` | Bot connection, embeds, components, interactions |
| `hitl.ts` | Approval requests, multi-channel notifications, timeouts |
| `templates.ts` | Template definition, variable interpolation, rendering |

## Implementation Notes

### Email Inbound (Cloudflare Email Routing)

Handle email in the Worker's `email` export:

```typescript
export default {
  async email(message: EmailMessage, env: Env): Promise<void> {
    const email = await parseInboundEmail(message)

    // Route to appropriate DO
    const action = await routeEmail(email, env)

    if (action.type === 'forward') {
      await message.forward(action.to)
    } else if (action.type === 'reject') {
      message.setReject(action.message || 'Rejected')
    }
  }
}
```

### Email Outbound (Provider Abstraction)

Abstract over SES and Mailchannels:

```typescript
interface EmailSender {
  send(email: OutboundEmail): Promise<EmailSendResult>
}

class SESSender implements EmailSender {
  async send(email: OutboundEmail): Promise<EmailSendResult> {
    // Use AWS SDK v3 for SES
  }
}

class MailchannelsSender implements EmailSender {
  async send(email: OutboundEmail): Promise<EmailSendResult> {
    // Use fetch to Mailchannels API
  }
}

function createSender(config: EmailProviderConfig): EmailSender {
  switch (config.provider) {
    case 'ses': return new SESSender(config.ses!)
    case 'mailchannels': return new MailchannelsSender(config.mailchannels!)
    case 'smtp': return new SMTPSender(config.smtp!)
  }
}
```

### Slack Integration

Use Slack Web API via fetch:

```typescript
async function postMessage(
  token: string,
  message: SlackMessage
): Promise<{ ts: string }> {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  })

  const data = await response.json()
  if (!data.ok) throw new Error(data.error)
  return { ts: data.ts }
}
```

### Block Kit Builders

Provide builder functions for common patterns:

```typescript
const blocks = {
  header: (text: string): SlackBlock => ({
    type: 'header',
    text: { type: 'plain_text', text },
  }),

  section: (text: string, accessory?: unknown): SlackBlock => ({
    type: 'section',
    text: { type: 'mrkdwn', text },
    accessory,
  }),

  actions: (elements: unknown[]): SlackBlock => ({
    type: 'actions',
    elements,
  }),

  button: (text: string, actionId: string, style?: 'primary' | 'danger') => ({
    type: 'button',
    text: { type: 'plain_text', text },
    action_id: actionId,
    style,
  }),
}
```

### Discord Integration

Use Discord REST API:

```typescript
const DISCORD_API = 'https://discord.com/api/v10'

async function sendMessage(
  token: string,
  message: DiscordMessage
): Promise<{ id: string }> {
  const response = await fetch(
    `${DISCORD_API}/channels/${message.channelId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: message.content,
        embeds: message.embeds,
        components: message.components,
      }),
    }
  )

  const data = await response.json()
  return { id: data.id }
}
```

### Human-in-the-Loop

Store approval state in DO storage:

```typescript
async function requestApproval(
  storage: DurableObjectStorage,
  request: ApprovalRequest
): Promise<ApprovalRequest> {
  const id = generateId()
  const approval: ApprovalRequest = {
    ...request,
    id,
    status: 'pending',
    createdAt: Date.now(),
  }

  await storage.put(`approval:${id}`, approval)

  // Send to all channels
  await Promise.all(
    request.channels.map(channel =>
      sendApprovalNotification(channel, approval)
    )
  )

  // Set expiration alarm
  await storage.setAlarm(request.expiresAt)

  return approval
}
```

### Template Rendering

Use simple variable interpolation:

```typescript
function renderTemplate(
  template: string,
  variables: Record<string, unknown>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return String(variables[key] ?? '')
  })
}
```

### Webhook Verification

Verify Slack requests:

```typescript
async function verifySlackRequest(
  request: Request,
  signingSecret: string
): Promise<boolean> {
  const timestamp = request.headers.get('X-Slack-Request-Timestamp')
  const signature = request.headers.get('X-Slack-Signature')
  const body = await request.text()

  const baseString = `v0:${timestamp}:${body}`
  const hash = await hmacSha256(signingSecret, baseString)
  const expected = `v0=${hash}`

  return timingSafeEqual(signature, expected)
}
```

Verify Discord requests:

```typescript
async function verifyDiscordRequest(
  request: Request,
  publicKey: string
): Promise<boolean> {
  const signature = request.headers.get('X-Signature-Ed25519')
  const timestamp = request.headers.get('X-Signature-Timestamp')
  const body = await request.text()

  return await verifyEd25519(publicKey, signature, timestamp + body)
}
```

## Testing

Test files in `__tests__/`:

- `email.test.ts` - Inbound parsing, outbound sending, tracking
- `slack.test.ts` - Message posting, Block Kit, interactions
- `discord.test.ts` - Message posting, embeds, components
- `hitl.test.ts` - Approval flow, timeouts, multi-channel
- `templates.test.ts` - Template rendering, variable interpolation

## Dependencies

- Types from `../../types/communication.ts`
- AWS SDK v3 for SES (optional)
- No other external dependencies

## Naming

- Functions: `sendEmail`, `notifySlack`, `requestApproval`
- Types: `InboundEmail`, `SlackConnection`, `ApprovalRequest`
- Events: `Communication.Email.received`, `Communication.Approval.responded`
- Follow camelCase for functions, PascalCase for types

## Error Handling

Use typed errors for common failures:

```typescript
class EmailError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_RECIPIENT' | 'PROVIDER_ERROR' | 'RATE_LIMITED',
    public readonly provider?: string
  ) {
    super(message)
    this.name = 'EmailError'
  }
}

class ApprovalError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_RESPONDED'
  ) {
    super(message)
    this.name = 'ApprovalError'
  }
}
```

## Rate Limiting

Implement per-channel rate limits:

```typescript
const RATE_LIMITS = {
  slack: { requests: 1, perMs: 1000 },      // 1 req/sec
  discord: { requests: 50, perMs: 1000 },   // 50 req/sec
  email: { requests: 14, perMs: 1000 },     // SES limit
}
```
