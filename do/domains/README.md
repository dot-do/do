# Domain Management

You want every subdomain to "just work." You need DNS, SSL, and routing handled automatically. You need free subdomains on platform TLDs.

This module gives you all of that.

## What is Domain Management?

Domain management handles the complete lifecycle of subdomains on platform-owned TLDs. Every Digital Object can claim subdomains, configure DNS, manage SSL, and route requests to Workers, DOs, or Pages.

- **50+ platform TLDs** for free subdomains
- **Automatic SSL** via Cloudflare
- **DNS configuration** without leaving the platform
- **Smart routing** to Workers, DOs, Pages, or external targets

## Quick Start

```typescript
import { DO } from 'do'

DO($ => {
  // Claim a subdomain (creates a child DO)
  const { $id } = await $.domain`acme.saas.group`
  // -> https://acme.saas.group

  // Check availability
  const status = await $.domain.check('acme', 'saas.group')
  // -> 'available' | 'claimed' | 'reserved'

  // Explicit claim
  const result = await $.domain.claim('myapp', 'agents.do')
  // -> { success: true, $id: 'https://myapp.agents.do' }
})
```

## Platform TLDs

Free subdomains on 50+ platform-owned domains:

### Primary Business TLDs
| TLD | Purpose |
|-----|---------|
| `hq.com.ai` | Business headquarters |
| `app.net.ai` | Applications |
| `api.net.ai` | APIs |
| `services.com.ai` | Services |
| `do.com.ai`, `do.net.ai` | Digital Objects |

### Studio/Builder TLDs
| TLD | Purpose |
|-----|---------|
| `io.sb` | General purpose |
| `hq.sb` | Headquarters |
| `api.sb` | APIs |
| `db.sb` | Databases |
| `studio.sb` | Studios |
| `mcp.sb` | Model Context Protocol |
| `sh.sb` | Shell/CLI tools |
| `directory.sb` | Directories |

### Startup TLDs
| TLD | Purpose |
|-----|---------|
| `ful.st` | [name]ful startups |
| `kit.st` | Kits and toolkits |
| `llc.st` | LLCs |
| `mgmt.st`, `management.st` | Management |
| `svc.st` | Services |
| `marketing.st` | Marketing |

### SaaS TLDs
| TLD | Purpose |
|-----|---------|
| `saas.group` | SaaS products |
| `agents.do` | AI agents |
| `workers.do` | Cloudflare Workers |
| `functions.do` | Functions |

### Infrastructure TLDs
| TLD | Purpose |
|-----|---------|
| `cdn.land` | CDN services |
| `edge.land` | Edge computing |
| `mdx.land` | MDX content |
| `agint.land` | Agent integrations |

## Subdomain Registration

### Claiming a Subdomain

```typescript
const result = await $.domain.claim('acme', 'saas.group')

if (result.success) {
  console.log('Claimed:', result.$id) // https://acme.saas.group
} else {
  console.log('Failed:', result.error, result.reason)
  // reason: 'taken' | 'reserved' | 'invalid' | 'quota_exceeded'
}
```

### Registration Flow

```
User requests subdomain
    |
    v
Validate format (2-63 chars, alphanumeric + hyphens)
    |
    v
Check reserved list (www, mail, api, admin, etc.)
    |
    v
Check availability (query Builder.Domains DO)
    |
    v
Claim and create registration record
    |
    v
Configure DNS via Cloudflare
    |
    v
Return $id URL
```

### Reserved Subdomains

These subdomains cannot be claimed on any TLD:

**Infrastructure**: www, mail, email, smtp, pop, imap, ftp, sftp, ssh, ns1, ns2, dns

**Platform**: api, app, admin, dashboard, console, dev, staging, prod, test, demo

**Auth**: auth, login, signin, signup, logout, sso, oauth, account, profile

**Support**: support, help, docs, blog, status, cdn, static, assets, media, images

**Legal/Corporate**: legal, terms, privacy, about, contact, team, careers, press, investors

**Generic**: undefined, null, true, false, root

## DNS Configuration

DNS records are managed via Cloudflare API:

### Supported Record Types

| Type | Use Case | Example |
|------|----------|---------|
| `A` | IPv4 address | Worker/DO routing |
| `AAAA` | IPv6 address | Worker/DO routing |
| `CNAME` | Alias to hostname | Pages deployment |
| `TXT` | Text record | Domain verification |
| `MX` | Mail server | Email routing |

### Creating DNS Records

```typescript
import { createDNSRecord, updateDNSRecord, deleteDNSRecord } from 'do/domains/dns'

// Create A record pointing to Cloudflare proxy
await createDNSRecord({
  zone: 'saas.group',
  type: 'A',
  name: 'acme',
  content: '192.0.2.1',
  proxied: true,
  ttl: 1 // Auto TTL when proxied
})

// Create CNAME for Pages
await createDNSRecord({
  zone: 'saas.group',
  type: 'CNAME',
  name: 'docs',
  content: 'my-project.pages.dev',
  proxied: true
})

// Create MX for email
await createDNSRecord({
  zone: 'saas.group',
  type: 'MX',
  name: 'acme',
  content: 'route1.mx.cloudflare.net',
  priority: 10
})
```

## SSL Management

SSL certificates are automatically provisioned via Cloudflare:

### Certificate Types

| Type | Coverage | Use Case |
|------|----------|----------|
| Universal | `*.domain.tld` | Default for all subdomains |
| Advanced | Multi-level wildcards | Deep subdomain hierarchies |
| Custom | Specific hostnames | Custom requirements |

### Status Lifecycle

```
pending_validation -> pending_issuance -> pending_deployment -> active
                   -> validation_timed_out
                                       -> issuance_timed_out
```

### Checking Certificate Status

```typescript
import { getCertificateStatus, waitForCertificate } from 'do/domains/ssl'

// Get current status
const status = await getCertificateStatus('acme.saas.group')
// -> { status: 'active', expiresAt: 1706012400000, ... }

// Wait for certificate to be active (useful after DNS changes)
await waitForCertificate('acme.saas.group', {
  timeout: 60000, // 1 minute max
  pollInterval: 5000 // Check every 5 seconds
})
```

## Request Routing

Route requests to different backends based on subdomain:

### Routing Targets

| Target | Description | Example |
|--------|-------------|---------|
| `worker` | Cloudflare Worker | `{ type: 'worker', script: 'my-worker' }` |
| `do` | Durable Object | `{ type: 'do', namespace: 'MyDO', id: 'instance-1' }` |
| `pages` | Cloudflare Pages | `{ type: 'pages', project: 'my-site' }` |
| `external` | External URL | `{ type: 'external', url: 'https://...' }` |

### Configuring Routes

```typescript
import { setRoute, getRoute, deleteRoute } from 'do/domains/routing'

// Route to a Durable Object
await setRoute('acme.saas.group', {
  type: 'do',
  namespace: 'DigitalObject',
  id: 'acme-startup'
})

// Route to Pages deployment
await setRoute('docs.acme.saas.group', {
  type: 'pages',
  project: 'acme-docs'
})

// Route with path patterns
await setRoute('api.acme.saas.group', {
  type: 'worker',
  script: 'acme-api',
  paths: ['/v1/*', '/v2/*']
})
```

### Route Resolution

```
Request: https://acme.saas.group/api/users
    |
    v
Match subdomain: acme.saas.group
    |
    v
Lookup route config in Builder.Domains
    |
    v
Forward to target (Worker/DO/Pages/External)
```

## Architecture

```
+------------------+     +------------------+     +------------------+
|   DO Instance    | --> | Builder.Domains  | --> |   Cloudflare     |
|  $.domain.claim  |     |  (Primary DO)    |     |   DNS + SSL      |
+------------------+     +------------------+     +------------------+
                               |
                               v
                        +------------------+
                        |  Subdomain DB    |
                        |  (SQLite in DO)  |
                        +------------------+
```

### Builder.Domains DO

The `Builder.Domains` DO is the central registry for all subdomain registrations:

```typescript
interface DomainsManager {
  check(subdomain: string, tld: PlatformTLD): Promise<SubdomainStatus>
  claim(request: ClaimSubdomainRequest): Promise<ClaimSubdomainResult>
  release(subdomain: string, tld: PlatformTLD, ownerRef: string): Promise<boolean>
  listByOwner(ownerRef: string): Promise<SubdomainRegistration[]>
  get(subdomain: string, tld: PlatformTLD): Promise<SubdomainRegistration | null>
  search(query: string, tld?: PlatformTLD): Promise<SubdomainRegistration[]>
}
```

## Files

| File | Purpose |
|------|---------|
| `tlds.ts` | Platform TLD registry and configuration |
| `subdomains.ts` | Subdomain CRUD operations |
| `dns.ts` | DNS record management via Cloudflare |
| `ssl.ts` | SSL certificate handling |
| `routing.ts` | Request routing configuration |
| `validation.ts` | Subdomain validation utilities |
| `index.ts` | Public exports |

## That's Your Domain. Claimed.

Claim subdomains on 50+ platform TLDs. Get automatic DNS and SSL. Route to Workers, DOs, or Pages. All without managing infrastructure.

No registrars. No certificate authorities. Just domains that work.
