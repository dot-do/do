# DO Platform Integrations

This module implements the integrations layer for the DO platform (Epic 5). DO has a two-tier integration architecture designed to support both deeply-coupled platform services and loosely-coupled external APIs.

## Integration Architecture

### Two-Tier System

1. **Deep Integrations** - Platform-level, tightly coupled services that provide core functionality
2. **Generic Integrations** - Webhook/API-level, loosely coupled connections to external services

## Deep Integrations

Deep integrations are first-class citizens of the DO platform. They have dedicated types, specialized APIs, and deep platform awareness.

### Stripe Connect

**Purpose**: Payments, subscriptions, transfers, and financial reporting

**Features**:
- Connect account onboarding (Standard, Express, Custom)
- Payment processing with platform fees
- Subscription management
- Transfer and payout handling
- Financial reporting and reconciliation

**Configuration**:
```typescript
interface StripeDeepIntegration {
  accountId: string           // Stripe Connect account ID
  accountType: 'standard' | 'express' | 'custom'
  chargesEnabled: boolean     // Can accept charges
  payoutsEnabled: boolean     // Can receive payouts
  platformFeePercent: number  // Platform fee percentage
}
```

**Lifecycle**:
1. Initialize Connect onboarding
2. User completes Stripe onboarding flow
3. Webhook confirms account status
4. Platform enables payment features

---

### WorkOS

**Purpose**: Authentication, SSO, directory sync, and RBAC

**Features**:
- Single Sign-On (Google, Microsoft, Okta, OneLogin, SAML)
- Directory Sync (SCIM)
- Admin Portal for self-service SSO setup
- Fine-Grained Authorization (FGA)
- Audit Logs

**Configuration**:
```typescript
interface WorkOSDeepIntegration {
  organizationId: string       // WorkOS organization ID
  ssoConnectionId: string      // SSO connection ID
  directoryConnectionId: string // Directory sync ID
  features: {
    sso: boolean
    directorySync: boolean
    adminPortal: boolean
    auditLogs: boolean
  }
  ssoProviders: string[]       // Configured SSO providers
}
```

**Lifecycle**:
1. Create WorkOS organization
2. Configure SSO connection(s)
3. Optional: Enable directory sync
4. Users authenticate via SSO

---

### GitHub

**Purpose**: Repository sync, webhooks, code storage

**Features**:
- GitHub App installation
- Repository content sync
- Pull request and issue tracking
- GitHub Actions integration
- Webhook event handling

**Configuration**:
```typescript
interface GitHubDeepIntegration {
  installationId: string       // GitHub App installation ID
  repository: string           // owner/repo format
  branch: string               // Default branch
  basePath: string             // Path within repo
  permissions: {
    contents: 'read' | 'write'
    pullRequests: 'read' | 'write'
    issues: 'read' | 'write'
    actions: 'read' | 'write'
    webhooks: 'read' | 'write'
  }
  webhookSecret: string        // Webhook verification secret
  lastSyncSha: string          // Last synced commit
}
```

**Lifecycle**:
1. User installs GitHub App
2. App requests repository permissions
3. Initial sync pulls repository content
4. Webhooks maintain sync state

---

### Cloudflare

**Purpose**: DNS, SSL, Workers, and edge infrastructure

**Features**:
- Zone and DNS management
- SSL certificate provisioning
- Workers deployment
- KV, R2, D1 storage
- Durable Objects

**Configuration**:
```typescript
interface CloudflareDeepIntegration {
  accountId: string            // Cloudflare account ID
  zoneIds: string[]            // Managed zones
  workersNamespace: string     // Workers namespace
  kvNamespaces: string[]       // KV namespaces
  r2Buckets: string[]          // R2 buckets
  d1Databases: string[]        // D1 databases
  durableObjectNamespaces: string[] // DO namespaces
}
```

**Lifecycle**:
1. Connect Cloudflare account via API token
2. Configure zones and DNS
3. Deploy Workers and storage
4. Manage via API

---

## Generic Integrations

Generic integrations support any external service through standardized patterns.

### OAuth 2.0 Connections

Connect to any OAuth 2.0 provider:
- Token management with automatic refresh
- Scope handling
- User info retrieval

### API Key Integrations

Simple API key authentication:
- Secure credential storage
- Rate limiting awareness
- Error handling

### Webhooks

**Inbound Webhooks**:
- Unique webhook URLs
- HMAC/signature verification
- Payload routing to handlers

**Outbound Webhooks**:
- Event-based triggers
- Retry policies with exponential backoff
- Delivery tracking

---

## Integration Lifecycle

All integrations follow a standard lifecycle:

```
not_configured -> pending_auth -> active -> [error|suspended]
                                    ^
                                    |
                                    +-- (reconnect)
```

### Status Definitions

| Status | Description |
|--------|-------------|
| `not_configured` | Integration not set up |
| `pending_auth` | Awaiting user authorization |
| `active` | Fully operational |
| `error` | Integration encountered an error |
| `suspended` | Temporarily disabled |

### Status Tracking

Each integration tracks:
- `connectedAt` - When integration was established
- `lastActivityAt` - Last successful operation
- `error` - Current error message (if any)

---

## API Reference

### Deep Integration Operations

```typescript
// Get integration status
getDeepIntegration<T>(type: DeepIntegrationType): Promise<T | null>

// Configure or update
configureDeepIntegration<T>(config: Partial<T>): Promise<T>

// Disconnect
disconnectDeepIntegration(type: DeepIntegrationType): Promise<boolean>
```

### Generic Integration Operations

```typescript
// CRUD operations
addIntegration(integration): Promise<GenericIntegration>
updateIntegration(id, updates): Promise<GenericIntegration>
removeIntegration(id): Promise<boolean>
listIntegrations(type?): Promise<GenericIntegration[]>
```

### OAuth Operations

```typescript
connectOAuth(provider, authCode): Promise<OAuthConnection>
refreshOAuth(connectionId): Promise<OAuthConnection>
disconnectOAuth(connectionId): Promise<boolean>
listOAuthConnections(): Promise<OAuthConnection[]>
```

### Webhook Operations

```typescript
createInboundWebhook(config): Promise<InboundWebhook>
createOutboundWebhook(config): Promise<OutboundWebhook>
triggerOutboundWebhook(id, payload): Promise<WebhookResult>
listWebhooks(): Promise<WebhookList>
```

---

## Events

Integration events for observability:

| Event | Payload |
|-------|---------|
| `integration:connected` | `{ integrationType }` |
| `integration:disconnected` | `{ integrationType }` |
| `integration:error` | `{ integrationType, error }` |
| `webhook:received` | `{ webhookId, source? }` |
| `webhook:sent` | `{ webhookId, success }` |
| `oauth:refreshed` | `{ provider, connectionId }` |
| `oauth:expired` | `{ provider, connectionId }` |

---

## File Structure

```
src/integrations/
  README.md           # This file
  CLAUDE.md           # Implementation guidelines
  base.ts             # Base integration interface
  stripe.ts           # Stripe Connect integration
  workos.ts           # WorkOS integration
  github.ts           # GitHub App integration
  cloudflare.ts       # Cloudflare API integration
  __tests__/
    base.test.ts      # Base integration tests
    stripe.test.ts    # Stripe integration tests
    workos.test.ts    # WorkOS integration tests
    github.test.ts    # GitHub integration tests
    cloudflare.test.ts # Cloudflare integration tests
```

---

## Security Considerations

1. **Credential Storage**: All secrets encrypted at rest
2. **Token Refresh**: Automatic refresh before expiry
3. **Webhook Verification**: Always verify webhook signatures
4. **Scope Minimization**: Request only necessary permissions
5. **Audit Logging**: Log all integration operations
