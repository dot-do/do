# [DO](https://objects.do)

> Every Thing IS a Digital Object IN a Durable Object.

```typescript
import { DO } from '@dotdo/do'

const $ = DO('https://mystartup.ai')

const idea = await $.ai`what should we build next?`
const spec = await $.db.Product.create({ name: idea, status: 'planning' })

await $.slack`#product New idea: ${idea}`
await $.email.to(founder)`Your next product: ${spec.name}`
```

That's a product ideation workflow. Running on the edge. With a database, AI, Slack, and email.

## You're Building a Business

Maybe it's a SaaS app. Maybe it's a startup studio generating thousands of companies. Maybe it's an AI agent platform.

Whatever it is, you need:
- A database
- AI capabilities
- Payments
- Email, Slack, SMS
- Phone calls and voice agents
- Custom domains
- User authentication

Traditionally, that's a dozen services, a maze of API keys, and weeks of integration work.

**With DO, it's one line.**

```typescript
import { DO } from '@dotdo/do'

const $ = DO('https://mystartup.ai')
```

## Just Say What You Want

```typescript
import { DO } from '@dotdo/do'

const $ = DO('https://mystartup.ai')

// AI that understands you
const summary = await $.ai`summarize ${document}`
const ideas = await $.ai.list`10 features for ${product}`
const viable = await $.ai.is`${idea} is technically feasible`

// Database that speaks English
const stuck = await $.db.Order`what's stuck in processing?`
const vips = await $.db.Customer`high value this quarter`

// Communication that flows
await $.email.to(user)`Your order ${order.id} shipped!`
await $.slack`#alerts New VIP signup: ${customer.name}`
await $.customer('cust_234sgsdfg')`Your appointment is tomorrow`

// Payments that just work
await $.pay`charge ${customer} $${amount}`
const mrr = await $.pay.mrr()
```

No method names to memorize. No parameters to look up. Just say what you want.

## Everything Reacts

```typescript
import { DO } from '@dotdo/do'

const $ = DO('https://mystartup.ai')

// When a customer signs up
$.on.Customer.created(async customer => {
  await $.email`welcome ${customer.name} to ${customer.email}`
  await $.slack`#sales New signup: ${customer.name}`
  await $.pay.createCustomer(customer)
})

// When an order is placed
$.on.Order.placed(async order => {
  await $.pay.charge(order.customerId, order.total)
  await $.email.to(order.email)`Order ${order.id} confirmed!`
})

// Every Monday at 9am
$.every.Monday.at9am(async () => {
  const report = await $.ai`generate weekly metrics`
  await $.slack`#metrics ${report}`
})
```

Event-driven. Time-driven. Automatic.

## Your Business, Hierarchical

```
startups.studio (Your Business)
  └─ headless.ly (A Startup You Generated)
       └─ crm.headless.ly (Its SaaS Product)
            └─ crm.headless.ly/acme (A Customer Tenant)
```

Each level is a full DO. Each has its own database, AI, payments, domains.

Each operates independently. Changes flow up automatically.

```typescript
// headless.ly knows it came from startups.studio
const startup = {
  $id: 'https://headless.ly',
  $type: 'https://startups.studio/Startup',  // Type URL (relative to $context)
  $context: 'https://startups.studio',       // Parent reference
}

// Or use an external schema
const agent = {
  $id: 'https://agents.do/sales',
  $type: 'https://schema.org.ai/Agent',  // External schema type
  $context: 'https://agents.do',
}

// Events bubble up the chain
// crm/acme → crm → headless.ly → startups.studio → analytics
```

## Voice AI That Calls

```typescript
import { DO } from '@dotdo/do'

const $ = DO('https://mystartup.ai')

// Create a voice agent
const agent = await $.voice.agent`sales assistant for ${product}`

// Make it call someone
await $.call(lead.phone)`schedule a demo for ${product}`

// Or run a campaign
await $.voice.campaign(contacts, agentId)
```

Real phone calls. Real conversations. Real results.

## Payments That Flow

```typescript
import { DO } from '@dotdo/do'

const $ = DO('https://mystartup.ai')

// Charge customers
await $.pay.charge(customerId, 1000, 'usd')

// Pay out to vendors
await $.pay.transfer(vendorAccount, 900)

// Full accounting
await $.pay.journal({
  debit: [{ account: 'revenue', amount: 1000 }],
  credit: [{ account: 'cash', amount: 1000 }]
})

// Real-time metrics
const { mrr, arr, growth } = await $.pay.mrr()
```

Stripe Connect. Double-entry accounting. P&L reports. Built in.

## Domains Included

```typescript
import { DO } from '@dotdo/do'

const $ = DO('https://mystartup.ai')

// Grab a subdomain on 50+ platform TLDs
await $.domain`acme.saas.group`
await $.domain`myapp.hq.com.ai`
await $.domain`startup.io.sb`
```

Free subdomains. Automatic SSL. Instant DNS.

## The $context Pattern

Every DO knows where it came from:

```typescript
// A tenant inside a SaaS app
const tenant = {
  $id: 'https://crm.headless.ly/acme',
  $type: 'https://crm.headless.ly/Tenant',  // Type URL from parent
  $context: 'https://crm.headless.ly',      // Points to parent
}

// Changes flow up the chain automatically
// tenant → app → startup → studio → R2/Iceberg
```

This enables:
- **CDC Streaming** - Every change flows to parent
- **Analytics** - Aggregate data at any level
- **Billing** - Roll up costs hierarchically
- **Permissions** - Inherit from parent context

## Why Not Traditional Architecture?

| Traditional | DO |
|-------------|-----|
| Startups as database rows | Startups as autonomous units |
| Central coordination | Independent operation |
| Shared state conflicts | Isolated state per entity |
| One database for everything | Database per entity |
| Single point of failure | Distributed by default |

We tried the traditional way. 35 packages. 81 workers. Collapsed under its own weight.

DO is simple: **1 package, 1 worker, 1 Durable Object**.

## Get Started

```bash
npm install @dotdo/do
```

```typescript
import { DO } from '@dotdo/do'

// Connect to any Digital Object
const $ = DO('https://mystartup.ai')

// Use it
const answer = await $.ai`what should we build?`
const products = await $.db.Product.list()
await $.slack`#updates ${answer}`
```

That's a full business platform. Running on the edge. Done.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 9+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

### Install Dependencies

```bash
pnpm install
```

### Run Locally

Start the development server with local Durable Objects and bindings:

```bash
# Default development mode
wrangler dev

# With local persistence (data survives restarts)
wrangler dev --persist-to .wrangler/state

# Using development config
wrangler dev --config wrangler.dev.toml

# With remote resources (connect to actual Cloudflare services)
wrangler dev --remote
```

The server runs at `http://localhost:8787` by default.

### Local Secrets

Create a `.dev.vars` file in the project root for local secrets:

```bash
STRIPE_SECRET_KEY=sk_test_...
WORKOS_API_KEY=sk_test_...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Deploy

Deploy to Cloudflare Workers:

```bash
# Deploy to development (default)
wrangler deploy

# Deploy to staging
wrangler deploy --env staging

# Deploy to production
wrangler deploy --env production
```

### Set Production Secrets

```bash
# Set secrets for production
wrangler secret put STRIPE_SECRET_KEY --env production
wrangler secret put WORKOS_API_KEY --env production
wrangler secret put OPENAI_API_KEY --env production
wrangler secret put ANTHROPIC_API_KEY --env production
```

### Tail Logs

View real-time logs from deployed workers:

```bash
# Tail the main worker
wrangler tail

# Tail with filters
wrangler tail --format pretty

# Tail specific environment
wrangler tail --env production

# Tail the observability worker
wrangler tail do-tail
```

### Useful Commands

```bash
# Type check
pnpm check

# Run tests
pnpm test

# Build
pnpm build

# List all deployed workers
wrangler deployments list

# View worker metrics
wrangler metrics
```

---

## Platform Services

Everything you need, integrated:

| What | How |
|------|-----|
| **Database** | `$.db.User.list()`, `$.db.Order\`stuck in processing?\`` |
| **AI** | `$.ai\`summarize this\``, `$.ai.list\`10 ideas\``, `$.ai.is\`feasible?\`` |
| **Payments** | `$.pay.charge()`, `$.pay.transfer()`, `$.pay.mrr()` |
| **Email** | `$.email\`welcome ${name}\``, `$.email.to(addr)\`message\`` |
| **Slack** | `$.slack\`#channel message\`` |
| **Messaging** | `$.customer(id)\`Your appointment is tomorrow\`` |
| **Voice** | `$.voice.agent\`sales assistant\``, `$.call(phone)\`book demo\`` |
| **Domains** | `$.domain\`app.saas.group\`` |
| **Events** | `$.on.Customer.created()`, `$.on.Order.placed()` |
| **Schedules** | `$.every.Monday.at9am()`, `$.every.hour()` |

## Deep Integrations

| Integration | What It Does |
|-------------|--------------|
| **Stripe Connect** | Payments, transfers, accounting, P&L |
| **WorkOS** | Auth, SSO, directory sync, RBAC |
| **GitHub** | Git sync, repos, PRs, issues |
| **Cloudflare** | Domains, DNS, SSL, edge compute |

## Foundational Projects

| Project | Purpose |
|---------|---------|
| [workers.do](https://workers.do) | Tagged template AI agents |
| [db4.ai](https://db4.ai) | 4-paradigm edge database |
| [schema.org.ai](https://schema.org.ai) | AI-native schema extensions |
| [id.org.ai](https://id.org.ai) | Unified identity for humans + AI |

---

**Solo founders** — Build with AI, not infrastructure.

**Small teams** — Focus on product, not plumbing.

**Enterprises** — Scale to millions of autonomous entities.

---

[.do](https://platform) | [workers.do](https://workers.do) | [agents.do](https://agents.do) | [db4.ai](https://db4.ai)
