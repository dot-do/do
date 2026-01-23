# CLAUDE.md - Integrations Implementation Guidelines

## Overview

This module implements Epic 5: Platform Integrations. It provides the infrastructure for connecting DO instances with external services at both deep (platform-level) and generic (API-level) tiers.

## Architecture Principles

### 1. Type-Safe Integration Definitions

All integrations are strongly typed using the definitions in `/types/integrations.ts`:

```typescript
// Deep integrations have specific interfaces
StripeDeepIntegration
WorkOSDeepIntegration
GitHubDeepIntegration
CloudflareDeepIntegration

// Generic integrations use a flexible schema
GenericIntegration
OAuthConnection
InboundWebhook / OutboundWebhook
```

### 2. Base Integration Interface

All deep integrations extend `BaseIntegration` which provides:
- Connection lifecycle management
- Status tracking and health checks
- Credential management hooks
- Event emission patterns

### 3. Separation of Concerns

```
BaseIntegration (base.ts)
    |
    +-- StripeIntegration (stripe.ts)
    +-- WorkOSIntegration (workos.ts)
    +-- GitHubIntegration (github.ts)
    +-- CloudflareIntegration (cloudflare.ts)
```

## Implementation Guidelines

### Creating a Deep Integration

1. **Extend BaseIntegration**:
```typescript
export class StripeIntegration extends BaseIntegration<StripeDeepIntegration> {
  readonly type = 'stripe' as const;

  async connect(config: StripeConnectConfig): Promise<StripeDeepIntegration> {
    // Implementation
  }
}
```

2. **Implement Required Methods**:
- `connect()` - Establish the integration
- `disconnect()` - Clean up resources
- `healthCheck()` - Verify integration is working
- `refresh()` - Refresh credentials if needed

3. **Handle Webhooks**:
```typescript
async handleWebhook(payload: unknown, signature: string): Promise<void> {
  // Verify signature
  // Process event
  // Emit integration event
}
```

### Error Handling

Use typed errors for integration failures:

```typescript
class IntegrationError extends Error {
  constructor(
    public readonly integrationType: DeepIntegrationType,
    public readonly code: string,
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
  }
}
```

### Credential Security

1. **Never log credentials**
2. **Encrypt at rest** using platform encryption
3. **Short-lived tokens** when possible
4. **Automatic rotation** for long-lived credentials

### Event Emission

Emit events for observability:

```typescript
this.emit('integration:connected', { integrationType: 'stripe' });
this.emit('integration:error', { integrationType: 'stripe', error: 'message' });
```

## Testing Guidelines

### Unit Tests

Test individual integration methods:

```typescript
describe('StripeIntegration', () => {
  it('should create Connect account', async () => {
    // Mock Stripe API
    // Test account creation
  });
});
```

### Integration Tests

Test full integration flows with mocked external services:

```typescript
describe('Stripe Connect Flow', () => {
  it('should complete onboarding flow', async () => {
    // Mock OAuth flow
    // Verify account setup
    // Test webhook handling
  });
});
```

### Mock External Services

Use service-specific mocks:

```typescript
// Mock Stripe
const mockStripe = {
  accounts: {
    create: jest.fn(),
    retrieve: jest.fn(),
  },
};
```

## Specific Integration Notes

### Stripe Connect

- Use **Express accounts** for simplest onboarding
- Handle `account.updated` webhooks for status changes
- Platform fees configured per-DO

### WorkOS

- Create organization per workspace/team
- SSO connections are per-organization
- Directory sync requires separate setup

### GitHub

- GitHub App provides better security than PATs
- Installation webhooks track permission changes
- Repository sync uses content API or Git protocol

### Cloudflare

- API tokens scoped to specific zones/services
- Workers deployment via Wrangler API
- DNS changes are eventually consistent

## File Dependencies

```
types/integrations.ts  <- Type definitions
src/integrations/
  base.ts              <- BaseIntegration class
  stripe.ts            <- imports base.ts
  workos.ts            <- imports base.ts
  github.ts            <- imports base.ts
  cloudflare.ts        <- imports base.ts
```

## Common Patterns

### Retry with Backoff

```typescript
async withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelay = 1000
): Promise<T> {
  // Exponential backoff implementation
}
```

### Rate Limiting

```typescript
class RateLimiter {
  async acquire(): Promise<void> {
    // Wait if rate limited
  }
}
```

### Webhook Verification

```typescript
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: 'sha256' | 'sha512' = 'sha256'
): boolean {
  // HMAC verification
}
```

## TODO Items

- [ ] Implement base integration class
- [ ] Add Stripe Connect integration
- [ ] Add WorkOS integration
- [ ] Add GitHub App integration
- [ ] Add Cloudflare API integration
- [ ] Add comprehensive test coverage
- [ ] Add webhook signature verification utilities
- [ ] Implement credential encryption
- [ ] Add rate limiting
- [ ] Add retry logic with backoff
