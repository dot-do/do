# CLAUDE.md - Domain Management Module

## Purpose

Domain management for Digital Objects. Handles subdomain registration on 50+ platform TLDs, DNS configuration via Cloudflare, SSL certificates, and request routing.

## Key Concepts

- **Platform TLDs**: 50+ domains owned by the platform (saas.group, agents.do, etc.)
- **Builder.Domains**: Primary DO that manages all subdomain registrations
- **Cloudflare integration**: DNS, SSL, and routing via Cloudflare APIs
- **Reserved subdomains**: Common names blocked across all TLDs

## Files

| File | Responsibility |
|------|----------------|
| `tlds.ts` | Platform TLD registry, TLD metadata, zone configuration |
| `subdomains.ts` | CRUD for subdomain registrations, Builder.Domains client |
| `dns.ts` | Cloudflare DNS API wrapper, record CRUD, batch operations |
| `ssl.ts` | Certificate status, provisioning triggers, expiry monitoring |
| `routing.ts` | Route config to Worker/DO/Pages/external, path matching |
| `validation.ts` | Subdomain format validation, reserved check, TLD validation |

## Implementation Notes

### Cloudflare API Integration

Use Cloudflare API v4 for DNS and SSL:

```typescript
const CF_API = 'https://api.cloudflare.com/client/v4'

// All requests need these headers
const headers = {
  'Authorization': `Bearer ${env.CF_API_TOKEN}`,
  'Content-Type': 'application/json'
}

// Zone ID lookup (cache these)
const zoneId = await getZoneId('saas.group')

// DNS record creation
const response = await fetch(`${CF_API}/zones/${zoneId}/dns_records`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ type: 'A', name: 'acme', content: '...' })
})
```

### TLD Configuration

Each TLD has metadata about its zone:

```typescript
interface TLDConfig {
  tld: PlatformTLD
  zoneId: string           // Cloudflare zone ID
  defaultTarget: RouteTarget // Default routing for new subdomains
  features: {
    email: boolean         // Email routing enabled
    wildcardSSL: boolean   // Wildcard certificate available
    customDNS: boolean     // Allow custom DNS records
  }
}
```

### Subdomain Registration Storage

Stored in Builder.Domains DO SQLite:

```sql
CREATE TABLE subdomain_registrations (
  id TEXT PRIMARY KEY,           -- https://acme.saas.group
  subdomain TEXT NOT NULL,
  tld TEXT NOT NULL,
  owner_ref TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  metadata TEXT,                  -- JSON
  UNIQUE(subdomain, tld)
);

CREATE INDEX idx_owner ON subdomain_registrations(owner_ref);
CREATE INDEX idx_tld ON subdomain_registrations(tld);
```

### Validation Rules

Subdomain validation (in order):

1. **Lowercase**: Must be lowercase (`ACME` -> error)
2. **Length**: 2-63 characters
3. **Characters**: `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`
4. **Reserved**: Check against RESERVED_SUBDOMAINS list
5. **TLD**: Must be valid PlatformTLD

### Route Configuration

Routes are stored per subdomain:

```typescript
interface StoredRoute {
  subdomain: string
  tld: PlatformTLD
  target: RouteTarget
  paths?: string[]           // Path patterns (default: all)
  createdAt: number
  updatedAt: number
}

type RouteTarget =
  | { type: 'worker'; script: string }
  | { type: 'do'; namespace: string; id: string }
  | { type: 'pages'; project: string }
  | { type: 'external'; url: string }
```

### SSL Certificate Handling

Cloudflare manages SSL automatically for proxied records:

```typescript
// Universal SSL covers *.domain.tld
// No action needed for single-level subdomains

// For deep subdomains (a.b.saas.group), check Advanced Certificate
async function ensureSSL(hostname: string): Promise<void> {
  const depth = hostname.split('.').length - 2
  if (depth > 1) {
    // May need Advanced Certificate Manager
    await checkAdvancedCertificate(hostname)
  }
}
```

### Error Handling

Use typed errors for domain operations:

```typescript
class DomainError extends Error {
  constructor(
    public code: 'INVALID_SUBDOMAIN' | 'RESERVED' | 'TAKEN' | 'NOT_FOUND' | 'DNS_ERROR' | 'SSL_ERROR',
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'DomainError'
  }
}
```

## Testing

Test files alongside source:

- `tlds.test.ts` - TLD registry and configuration
- `subdomains.test.ts` - Registration CRUD
- `dns.test.ts` - DNS record operations (mock Cloudflare API)
- `ssl.test.ts` - Certificate status checking
- `routing.test.ts` - Route configuration
- `validation.test.ts` - Subdomain validation

### Mocking Cloudflare

Use MSW or similar for Cloudflare API mocking:

```typescript
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const server = setupServer(
  http.post('https://api.cloudflare.com/client/v4/zones/:zoneId/dns_records', () => {
    return HttpResponse.json({ success: true, result: { id: 'dns_123' } })
  })
)
```

## Dependencies

- Types from `../../types/domains.ts`
- Cloudflare Workers environment bindings
- No external dependencies (fetch is native)

## Naming

- Functions: `createDNSRecord`, `validateSubdomain`, `setRoute`
- Types: `DNSRecord`, `SSLCertificate`, `RouteTarget`
- Events: `Domain.SubdomainClaimed`, `Domain.DNSRecordCreated`
- Follow types from `/types/domains.ts` exactly
