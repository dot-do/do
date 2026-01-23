# Communication Layer

You need to send emails. You need to receive emails. You need to ping your team on Slack when something needs approval. You need Discord notifications for your community. You need humans in the loop when AI makes decisions.

This is your communication layer.

## What is Communication?

The communication module handles all message-based interactions for Digital Objects:

- **Email Inbound** - Receive emails via Cloudflare Email Routing
- **Email Outbound** - Send emails via SES or Mailchannels
- **Slack Integration** - Bot messages, Block Kit UI, interactive workflows
- **Discord Integration** - Embeds, components, community notifications
- **Human-in-the-Loop** - Approval workflows across all channels

## Quick Start

### Sending Email

```typescript
import { sendEmail } from 'do/communication/email'

await sendEmail({
  from: 'notifications@my-startup.do',
  to: 'user@example.com',
  subject: 'Your report is ready',
  html: '<h1>Report Generated</h1><p>Click below to view...</p>',
})
```

### Receiving Email

```typescript
import { onInboundEmail } from 'do/communication/email'

onInboundEmail(async (email) => {
  console.log(`Email from ${email.from}: ${email.subject}`)

  // Route to a Digital Object for processing
  return { type: 'do', ref: myObjectRef }
})
```

### Slack Notifications

```typescript
import { notifySlack, createApprovalBlocks } from 'do/communication/slack'

await notifySlack(connection, {
  channel: 'C0123456789',
  text: 'Deployment pending approval',
  blocks: createApprovalBlocks({
    title: 'Deploy to Production',
    description: 'v2.3.1 ready for release',
    approvalId: 'approval-123',
  }),
})
```

### Discord Notifications

```typescript
import { notifyDiscord, createApprovalEmbed } from 'do/communication/discord'

await notifyDiscord(connection, {
  channelId: '123456789012345678',
  embeds: [createApprovalEmbed({
    title: 'New Support Ticket',
    description: 'Priority: High',
    color: 0xFF0000,
  })],
})
```

### Human-in-the-Loop Approvals

```typescript
import { requestApproval, checkApproval } from 'do/communication/hitl'

// Request approval across multiple channels
const request = await requestApproval({
  title: 'Deploy to Production',
  description: 'Release v2.3.1 with new billing features',
  context: { version: '2.3.1', changes: 47 },
  approvers: ['U0123456789', 'U9876543210'],
  channels: [
    { type: 'slack', channelId: 'C0123456789' },
    { type: 'discord', channelId: '123456789012345678' },
  ],
  expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
})

// Check status later
const status = await checkApproval(request.id)
if (status.status === 'approved') {
  // Proceed with deployment
}
```

## Email

### Inbound (Cloudflare Email Routing)

Cloudflare Email Routing forwards emails to your Worker, which routes them to Digital Objects:

```
incoming@my-startup.do
    |
    v
Cloudflare Email Routing
    |
    v
Email Worker
    |
    v
Digital Object (processes email)
```

**Configuration:**
1. Set up Cloudflare Email Routing for your domain
2. Create email routing rules in DO
3. Handle inbound emails in your DO

**Authentication:**
- SPF, DKIM, DMARC results included
- Spam scoring (0-10)
- Verify sender before processing

### Outbound (SES / Mailchannels)

Abstraction over multiple email providers:

| Provider | Best For | Setup |
|----------|----------|-------|
| **SES** | High volume, tracking | AWS credentials, verified domain |
| **Mailchannels** | Workers-native, simple | API key, DKIM optional |
| **SMTP** | Legacy systems | Host, port, credentials |

**Features:**
- Automatic provider selection
- Delivery tracking (sent, delivered, bounced)
- Template support
- Scheduled sending
- Attachment handling (inline and regular)

### Email Tracking

Track email lifecycle:

```typescript
const result = await sendEmail(email)

// Later, check status
const record = await getTrackingRecord(result.messageId)
// { status: 'delivered', deliveredAt: 1706012400000, openedAt: ... }
```

## Slack Integration

### Bot Setup

1. Create Slack App at api.slack.com
2. Add Bot Token Scopes: `chat:write`, `channels:read`, `users:read`
3. Install to workspace
4. Store encrypted bot token in DO

### Block Kit Messages

Build rich interactive messages:

```typescript
import { createSlackMessage, blocks } from 'do/communication/slack'

const message = createSlackMessage({
  channel: 'C0123456789',
  text: 'Fallback text',
  blocks: [
    blocks.header('Deployment Request'),
    blocks.section({
      text: '*Version:* 2.3.1\n*Changes:* 47 commits',
      accessory: blocks.button('View Changes', 'view-changes', 'https://github.com/...'),
    }),
    blocks.divider(),
    blocks.actions([
      blocks.button('Approve', 'approve', 'primary'),
      blocks.button('Reject', 'reject', 'danger'),
    ]),
  ],
})
```

### Interactive Responses

Handle button clicks, form submissions:

```typescript
import { onSlackInteraction } from 'do/communication/slack'

onSlackInteraction(async (interaction) => {
  if (interaction.actions?.[0]?.action_id === 'approve') {
    // Process approval
    return { text: 'Approved!' }
  }
})
```

### Notification Types

| Type | When | Example |
|------|------|---------|
| `workflow_completed` | Workflow finishes successfully | "ETL pipeline completed" |
| `workflow_failed` | Workflow errors out | "Payment processing failed" |
| `approval_required` | Human decision needed | "Deploy to prod?" |
| `mention` | DO mentioned in channel | "@mybot status" |
| `error` | System error occurs | "Database connection lost" |
| `custom` | User-defined | Any custom notification |

## Discord Integration

### Bot Setup

1. Create Discord Application at discord.com/developers
2. Add Bot with permissions: Send Messages, Embed Links, Add Reactions
3. Generate bot token
4. Invite to server with OAuth2 URL
5. Store encrypted bot token in DO

### Rich Embeds

```typescript
import { createDiscordMessage, embeds } from 'do/communication/discord'

const message = createDiscordMessage({
  channelId: '123456789012345678',
  embeds: [embeds.create({
    title: 'Build Complete',
    description: 'All tests passed',
    color: 0x00FF00,
    fields: [
      { name: 'Duration', value: '2m 34s', inline: true },
      { name: 'Tests', value: '142 passed', inline: true },
    ],
    footer: { text: 'CI/CD Pipeline' },
    timestamp: new Date().toISOString(),
  })],
})
```

### Interactive Components

Buttons, select menus, modals:

```typescript
import { components } from 'do/communication/discord'

const message = {
  channelId: '123456789012345678',
  content: 'Choose an option:',
  components: [
    components.actionRow([
      components.button('Approve', 'approve', 'success'),
      components.button('Reject', 'reject', 'danger'),
      components.linkButton('View Details', 'https://...'),
    ]),
  ],
}
```

## Human-in-the-Loop (HITL)

### Why HITL?

AI agents make decisions. Some decisions need human oversight:

- **High-stakes actions** - Deployments, financial transactions
- **Policy decisions** - Content moderation, access grants
- **Learning opportunities** - Train AI on edge cases
- **Compliance requirements** - Audit trails, approvals

### Approval Flow

```
AI Agent requests approval
        |
        v
+-------+-------+
|               |
v               v
Slack        Discord
Channel      Channel
        |
        v
Human responds (approve/reject)
        |
        v
AI Agent continues or halts
```

### Multi-Channel Approvals

Request approval across multiple channels simultaneously:

```typescript
const request = await requestApproval({
  title: 'Delete User Data',
  description: 'User requested account deletion under GDPR',
  context: {
    userId: 'user-123',
    dataTypes: ['profile', 'orders', 'preferences'],
    requestedAt: Date.now(),
  },
  approvers: ['admin-1', 'admin-2'],
  channels: [
    { type: 'slack', channelId: 'C-compliance' },
    { type: 'discord', channelId: 'compliance-channel' },
    { type: 'email', channelId: 'compliance@company.com' },
  ],
  expiresAt: Date.now() + 72 * 60 * 60 * 1000, // 72 hours for GDPR
})
```

### Approval States

| Status | Description |
|--------|-------------|
| `pending` | Waiting for response |
| `approved` | Approved by authorized user |
| `rejected` | Rejected by authorized user |
| `expired` | Timeout reached without response |

### Audit Trail

Every approval includes full audit trail:

```typescript
{
  id: 'approval-123',
  title: 'Deploy to Production',
  status: 'approved',
  response: {
    decision: 'approved',
    respondedBy: 'U0123456789',
    respondedAt: 1706012400000,
    comment: 'LGTM, ship it!'
  },
  createdAt: 1706012000000,
  expiresAt: 1706098400000,
}
```

## Message Templates

Reusable templates for consistent messaging:

```typescript
import { createTemplate, renderTemplate } from 'do/communication/templates'

// Define template
const deploymentTemplate = createTemplate({
  id: 'deployment-notification',
  name: 'Deployment Notification',
  channels: ['slack', 'discord', 'email'],
  variables: ['version', 'environment', 'changes', 'author'],
  slack: {
    text: 'Deployment to {{environment}}',
    blocks: [/* ... */],
  },
  discord: {
    embeds: [/* ... */],
  },
  email: {
    subject: 'Deployed {{version}} to {{environment}}',
    html: '<h1>Deployment Complete</h1>...',
  },
})

// Render for specific channel
const slackMessage = renderTemplate(deploymentTemplate, 'slack', {
  version: '2.3.1',
  environment: 'production',
  changes: 47,
  author: 'alice',
})
```

## Architecture

```
                    ┌─────────────────────────────────────────────────┐
                    │               Communication Layer                │
                    └─────────────────────────────────────────────────┘
                                          │
          ┌───────────────────────────────┼───────────────────────────────┐
          │                               │                               │
          v                               v                               v
┌─────────────────┐             ┌─────────────────┐             ┌─────────────────┐
│      Email      │             │    Messaging    │             │      HITL       │
├─────────────────┤             ├─────────────────┤             ├─────────────────┤
│ Inbound (CF)    │             │ Slack Bot       │             │ Approvals       │
│ Outbound (SES)  │             │ Discord Bot     │             │ Multi-channel   │
│ Templates       │             │ Block Kit       │             │ Audit Trail     │
│ Tracking        │             │ Embeds          │             │ Timeouts        │
└─────────────────┘             └─────────────────┘             └─────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `email.ts` | Email inbound/outbound handling |
| `slack.ts` | Slack Bot integration |
| `discord.ts` | Discord Bot integration |
| `hitl.ts` | Human-in-the-loop approvals |
| `templates.ts` | Message templates |

## Security

- **Token Encryption** - All bot tokens encrypted at rest
- **Webhook Verification** - Verify Slack/Discord signatures
- **Rate Limiting** - Per-channel rate limits
- **Audit Logging** - All communications logged
- **DKIM/SPF/DMARC** - Email authentication

## That's Your Communication Layer. Unified.

One interface. Multiple channels. Humans in the loop. AI and humans working together.
