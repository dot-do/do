# DO Architecture

Complete architecture of the Digital Object (DO) system.

## Executive Summary

DO is a unified Durable Object system where **every business entity IS a Durable Object** with its own storage, AI, payments, telephony, domains, and more.

**Design Principle**: 1 package, 1 worker, 1 Durable Object. Complex features live in separate projects.

**Core Innovation**: N-level hierarchical pattern where a Thing can also BE its own DO, enabling unlimited nesting depth with CDC streaming up the hierarchy.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           DO (Digital Object)                                   │
│  Identity: $id, $type, $context, $version                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         Core Capabilities                                │   │
│  ├──────────────────────────────────────────────────────────────────────────┤   │
│  │  DB4.AI        │  MDXDB         │  Fn<Out,In>    │  Collections          │   │
│  │  4 Paradigms   │  URL Content   │  Gen Functions │  Nouns/Verbs/Things   │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         Deep Integrations                                │   │
│  ├──────────────────────────────────────────────────────────────────────────┤   │
│  │  Stripe Connect │  WorkOS        │  GitHub        │  Cloudflare          │   │
│  │  Payments/Acctg │  Auth/SSO/RBAC │  Git Sync      │  Domains/DNS/SSL     │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         Communication Layer                              │   │
│  ├──────────────────────────────────────────────────────────────────────────┤   │
│  │  Email (CF/SES) │  Slack         │  Discord       │  Teams               │   │
│  │  In/Outbound    │  HITL          │  HITL          │  HITL                │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         AI & Voice Layer                                 │   │
│  ├──────────────────────────────────────────────────────────────────────────┤   │
│  │  Unified AI     │  Voice AI      │  Telephony     │  Embeddings          │   │
│  │  LLM/Image/Video│  Vapi/LiveKit  │  Telnyx/Plivo  │  Vector Search       │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         Content & UI Layer                               │   │
│  ├──────────────────────────────────────────────────────────────────────────┤   │
│  │  Site (14 types)│  App (17 types)│  Git Sync      │  Workflows           │   │
│  │  mdxui          │  mdxui         │  GitHub        │  11-stage cascade    │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  CDC → Parent DO ($context) → ... → R2/Iceberg                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 1. N-Level Hierarchical Pattern

### The Dual Nature

A Thing inside a parent DO can also BE its own independent DO:

```
startups.studio (Business DO)
  └─ headless.ly (Thing in startups.studio)
       └─ headless.ly (Startup DO, $context: startups.studio)
            └─ crm.headless.ly (SaaS App DO, $context: headless.ly)
                 └─ crm.headless.ly/acme (Tenant DO, $context: crm.headless.ly)
                      └─ crm.headless.ly/acme/users/bob (User, $context: tenant)
```

### Bidirectional Relationships

```typescript
// Parent → Child: Thing with $ref URL to child DO
interface ThingExpanded {
  $id: string
  $type: string
  $ref?: string  // URL to this Thing's own DO (e.g., 'https://headless.ly')
  // ... data
}

// Child → Parent: $context URL pointing to parent DO
interface DigitalObjectIdentity {
  $id: string   // e.g., 'https://headless.ly'
  $type: DOType
  $context?: string  // Parent DO URL (e.g., 'https://startups.studio')
  // ...
}
```

### $context Chain (CDC Streaming)

```
crm.headless.ly/acme changes something
    ↓ CDC event
crm.headless.ly receives (aggregates tenant metrics)
    ↓ CDC event
headless.ly receives (aggregates product metrics)
    ↓ CDC event
startups.studio receives (portfolio analytics)
    ↓ CDC event
R2/Iceberg (cold storage, BI)
```

Each level can observe, filter, transform, and aggregate events from all descendants.

## 2. Identity Model

```typescript
interface DigitalObjectIdentity {
  $id: string       // URL: do://type/name or https://domain/path
  $type: DOType     // What kind of DO
  $context?: DigitalObjectRef  // Parent DO for hierarchical CDC
  $version: number
  $createdAt: number
  $updatedAt: number
}
```

### DO Type Taxonomy

```
DOType
├── Business Types
│   ├── Business     # Top-level (startups.studio)
│   ├── Startup      # Generated entity (headless.ly)
│   ├── SaaS         # Multi-tenant platform (crm.headless.ly)
│   ├── IaaS/PaaS    # Infrastructure/Platform
│   └── Service      # AI Services-as-Software (agents.do)
├── Content Types
│   ├── Site         # Marketing site (14 types)
│   ├── App          # SaaS application (17 types)
│   └── Page/Post/Doc
├── Operational Types
│   ├── Agent        # Autonomous AI agent
│   ├── Database     # DB4 instance
│   ├── Directory    # Curated collection
│   └── Marketplace  # Multi-vendor
└── Utility Types
    ├── Workflow     # Process orchestration
    ├── Function     # Fn<Out,In,Opts>
    ├── Collection   # Generic
    ├── User         # Human identity
    └── Org          # Organization
```

## 3. Deep Integrations

Platform-level integrations (tightly coupled, not generic webhooks):

### Stripe Connect
- Connected accounts (Standard, Express, Custom)
- Payments, transfers, payouts
- Double-entry accounting (chart of accounts, journal entries)
- Financial reports (P&L, balance sheet, cash flow)
- SaaS metrics (MRR, churn, LTV)

### WorkOS
- Authentication (SSO, social, passwordless)
- Directory sync (SCIM)
- RBAC/FGA (fine-grained authorization)
- Admin portal
- Audit logs

### GitHub
- Git sync (content/code ↔ repo)
- Repository management
- Pull requests, issues
- Actions integration
- Webhook handling

### Cloudflare
- Domain management (50+ platform TLDs)
- DNS configuration
- SSL certificates
- Email routing (inbound)
- Workers/DO deployment

### Communication (HITL)
- Slack (approvals, notifications, interactions)
- Discord (community, notifications)
- Microsoft Teams (enterprise)

## 4. Unified AI

Multi-modal AI through Cloudflare AI Gateway:

### Text LLM Providers
OpenAI, Anthropic, Google, Groq, Mistral, Perplexity, DeepSeek, Cerebras, Fireworks, Together, xAI, Cohere, Bedrock, Azure, Cloudflare, OpenRouter, Ollama

### Model Aliases
```typescript
type ModelAlias =
  | 'fast'      // Groq, Cerebras
  | 'cheap'     // Haiku, GPT-4o-mini
  | 'best'      // Opus, GPT-4o
  | 'reasoning' // o1, o3
  | 'vision'    // Best vision model
  | 'code'      // Codestral, GPT-4o
  | 'long'      // Gemini, Claude (long context)
```

### Capabilities
- **Text**: generate, chat, stream, structured output
- **Embeddings**: OpenAI, Cohere, Voyage, Cloudflare
- **Image**: DALL-E, Stable Diffusion, Flux, Midjourney
- **Video**: Luma, Runway, Pika
- **Voice Synthesis**: ElevenLabs, PlayHT, OpenAI TTS
- **Speech Recognition**: Deepgram, AssemblyAI, Whisper

## 5. Voice AI

Conversational voice agents:

### Providers
- **Vapi** - Voice AI platform
- **LiveKit** - Real-time infrastructure
- **Retell AI** - Voice agents
- **Bland AI** - Phone AI
- **Daily** - WebRTC

### Capabilities
- Voice agent creation with custom voices
- Inbound/outbound phone calls
- Real-time transcription
- Tool calling during conversations
- Human handoff
- Outbound campaigns

## 6. Telephony

Phone/SMS abstraction over providers:

### Providers (cost comparison)
| Provider | Savings vs Twilio | Notes |
|----------|-------------------|-------|
| Telnyx | 30-50% | TwiML compatible |
| Plivo | ~35% | Good API |
| Bandwidth | - | US direct carrier |
| Vonage | - | Enterprise features |

### Capabilities
- Phone number provisioning
- Inbound/outbound calls
- SMS/MMS
- Call recording
- IVR/voice menus
- Webhook handling

## 7. Domain Management

### Platform TLDs (50+)
Free subdomains on platform-owned domains:
- `*.hq.com.ai`, `*.app.net.ai`
- `*.io.sb`, `*.llc.st`
- `*.saas.group`, `*.api.domains`
- `*.agents.is`, `*.functions.is`
- And 40+ more

### Capabilities
- Subdomain registration
- DNS configuration (A, AAAA, CNAME, TXT, MX)
- SSL certificate management
- Routing (Worker, DO, Pages, external)
- Email configuration per domain

### Reserved Subdomains
Validation against common reserved names (www, mail, admin, api, etc.) plus js.org reserved list.

## 8. Communication

### Email
- **Inbound**: Cloudflare Email Routing → DO
- **Outbound**: SES / Mailchannels abstraction
- Tracking (sent, delivered, opened, clicked, bounced)
- Templates

### Human-in-the-Loop
```typescript
interface ApprovalRequest {
  title: string
  description: string
  approvers: string[]
  channels: ApprovalChannel[]  // slack, discord, teams, email
  expiresAt: number
}
```

## 9. DB4.AI - 4 Database Paradigms

Every DO has unified access:

| Paradigm | Use Case | Example |
|----------|----------|---------|
| Relational | Structured data, ACID | Users, orders |
| Document | Flexible schemas | Posts, configs |
| Graph | Relationships | Social, knowledge |
| Analytics | OLAP, time-series | Events, metrics |

### Storage Tiers
| Tier | Latency | Cost | Technology |
|------|---------|------|------------|
| Hot | ~4ms | Included | DO SQLite + Vortex |
| Warm | ~10ms | Free | Cloudflare Cache API |
| Cold | ~69ms | $0.015/GB/mo | R2 + Iceberg |

### External Backends (Separate Projects)
Heavy backends live outside DO:
- `postgres.do` - PGLite WASM (~50-70MB)
- `sqlite.do` - Turso WASM (~30-40MB)
- `duckdb.do` - DuckDB WASM (~15MB)
- `mongodb.do` - MongoDB wire protocol

## 10. Fn<Out, In, Opts> - Generative Functions

Three calling styles:

```typescript
// Style 1: Direct
ai("summarize this")

// Style 2: Tagged template
ai`Summarize ${text}`

// Style 3: Named params
ai`Summarize {content}`({ content: "...", model: "claude-3" })
```

### Function Tiers
| Tier | Type | Latency | Use Case |
|------|------|---------|----------|
| 1 | code | <1ms | Pure TypeScript |
| 2 | generative | <5ms | AI model calls |
| 3 | agentic | Variable | Autonomous agents |
| 4 | human | Async | Human-in-the-loop |

## 11. Content Layer (MDXDB)

URL-based filesystem:
```
MDX = Structured Data + Unstructured Content + Executable Code + Composable UI
           ↓                    ↓                    ↓              ↓
      YAML-LD frontmatter   Markdown body    TypeScript exports   JSX
```

### Site Types (14)
MarketingSite, DocsSite, BlogSite, DirectorySite, PortfolioSite, AgencySite, EventSite, CommunitySite, MarketplaceSite, PlatformSite, APISite, PersonalSite, StorySite, LandingSite

### App Types (17)
DashboardApp, DeveloperApp, AdminApp, CRMApp, EcommerceApp, ChatApp, NotesApp, MailApp, CalendarApp, KanbanApp, WikiApp, AnalyticsApp, SupportApp, BookingApp, InvoicingApp, ProjectApp, FileShareApp

## 12. Financial Operations

### Stripe Connect
- Connected account creation (Standard/Express/Custom)
- Onboarding flows
- Platform fees

### Transactions
- Payments (one-time, subscriptions)
- Transfers (to connected accounts)
- Payouts (to bank accounts)

### Accounting
- Chart of accounts (double-entry)
- Journal entries
- Financial reports (P&L, balance sheet, cash flow)
- SaaS metrics (MRR, ARR, churn, LTV)

## 13. Example: Complete Startup Architecture

```
startups.studio (Business DO)
├── $type: 'Business'
├── db4: Ontology (O*NET, NAICS, APQC)
├── financial: Stripe Connect (platform)
├── domains: startups.studio
└── Things:
    └── headless.ly ($ref → Startup DO)
        └── headless.ly (Startup DO)
            ├── $context: startups.studio
            ├── $type: 'Startup'
            ├── db4: hypothesis, canvas, personas
            ├── financial: Stripe Connect (startup)
            ├── domains: *.headless.ly
            └── Things:
                └── crm.headless.ly ($ref → SaaS DO)
                    └── crm.headless.ly (SaaS DO)
                        ├── $context: headless.ly
                        ├── $type: 'SaaS'
                        ├── Site DO (marketing)
                        ├── App DO (dashboard)
                        └── Things:
                            └── acme ($ref → Tenant DO)
                                └── crm.headless.ly/acme (Tenant DO)
                                    ├── $context: crm.headless.ly
                                    ├── db4: tenant data
                                    ├── Users, Contacts, Deals
                                    └── ... (full CRM)
```

## 14. CDC Streaming

```typescript
interface CDCEvent<T> {
  id: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  collection: string
  documentId: string
  timestamp: number
  sequence: number
  before?: T
  after?: T
  changedFields?: string[]
  source?: string
}
```

### Flow
```
Child DO mutation
    ↓
Local CDCEvent emitted
    ↓
Send to Parent DO ($context)
    ↓
Parent processes/aggregates
    ↓
Continue up $context chain
    ↓
R2/Iceberg (cold storage)
```

## 15. CapnWeb RPC

Schema-free RPC over WebSocket with hibernation:

- 95% cost savings vs always-on
- Promise pipelining
- Automatic reconnection
- JSON fallback

## 16. Observability

### Event Categories
| Category | Examples |
|----------|----------|
| Lifecycle | do:created, do:hibernated, do:awakened |
| RPC | rpc:request, rpc:response |
| CDC | cdc:emit, cdc:flush |
| AI | ai:generation_completed, ai:rate_limit_hit |
| Voice | voice:session_started, voice:session_ended |
| Financial | financial:payment_succeeded, financial:transfer_completed |
| Telephony | call:started, call:ended, sms:sent |

## 17. Lessons Learned

From previous attempts (dotdo, platform):

| What Failed | What We Do Instead |
|-------------|-------------------|
| 35+ packages | 1 package |
| 81 workers | 1 worker |
| Framework-in-framework | Composition |
| Monolithic factory | Simple base DO |
| Everything in one repo | Separate projects for heavy features |

## 18. Implementation Phases

1. **Phase 1** ✅ - Types definition (complete)
2. **Phase 2** - Base DigitalObject class
3. **Phase 3** - RPC transport (CapnWeb)
4. **Phase 4** - CDC streaming
5. **Phase 5** - Collections implementation
6. **Phase 6** - Deep integrations (Stripe, WorkOS, GitHub)
7. **Phase 7** - AI layer (unified AI, voice AI)
8. **Phase 8** - Communication (email, HITL)
9. **Phase 9** - Telephony
10. **Phase 10** - Domain management
11. **Phase 11** - Financial operations
12. **Phase 12** - Specialized DO types

## 19. Foundational Ontologies

DO builds on a foundation of semantic ontologies that provide standardized schemas, business primitives, and knowledge graphs.

### schema.org.ai
**AI-native Schema.org extensions** - [GitHub](https://github.com/dot-org-ai/schema.org.ai)

Extends Schema.org with types for the AI era:
- **Agent** - Autonomous AI agents with capabilities, tools, goals
- **Tool** - APIs, functions, and services agents can use
- **Model** - AI/ML models with provider info, context windows, pricing
- **Workflow** - Multi-step autonomous workflows
- **Capability** - Skills and capabilities agents possess

### business.org.ai
**Unified business ontology** - [GitHub](https://github.com/dot-org-ai/business.org.ai)

Transforms industry standards into a semantic graph:
- **O*NET**: 1,016 occupations, 19,000+ tasks
- **NAICS**: 1,057 industry codes
- **APQC**: 1,500+ business processes
- **GS1/UNSPSC**: Product classifications

Enables queries like: "What skills do software developers need?" or "What processes does a SaaS company run?"

### standards.org.ai
**Standards normalization pipeline** - [GitHub](https://github.com/dot-org-ai/standards.org.ai)

Ingests 40+ authoritative standards into consistent format:
- Occupations (O*NET, BLS)
- Industries (NAICS, SIC)
- Products (GS1, UNSPSC, NAPCS)
- Healthcare (ICD, LOINC, NDC, FHIR)
- Finance (ISO20022, MCC)
- Geography (UN LOCODE, ISO countries)

### graph.org.ai
**Semantic knowledge graph** - [GitHub](https://github.com/dot-org-ai/graph.org.ai)

137+ domain ontologies unified into queryable graph:
- Work: occupations, tasks, skills, abilities
- Business: industries, processes, products
- Technology: models, agents, tools
- Geography: places, locations

## 20. Identity System

### id.org.ai
**OAuth domain for .do customers** - [GitHub](https://github.com/dot-do/id.org.ai)

Provides credible OAuth redirects:
- "Humans. Agents. Auth."
- WorkOS Custom Authkit domain
- OAuth providers: Google, GitHub, Microsoft, Apple
- Recognizable domain for user trust

### org.ai
**Unified identity for humans + AI agents** - [GitHub](https://github.com/dot-org-ai/org.ai)

Root identity provider as a Durable Object:
- **Humans**: OAuth users with email/profile
- **AI Agents**: API-key authenticated with capabilities
- **Organizations**: Groups of humans and agents
- **Linked Accounts**: Stripe, Anthropic, OpenAI, Cloudflare
- **App Registry**: Child .do applications register here
- **MCP Auth**: Model Context Protocol authentication

```
id.org.ai (OAuth landing)
    ↓
org.ai (Identity DO)
    ├── Human identity
    ├── Agent identity
    ├── Organization
    └── App registry
        ├── headless.ly
        ├── crm.headless.ly
        └── agents.do
```

## 21. Related Projects

| Project | Purpose | GitHub |
|---------|---------|--------|
| primitives.org.ai | AI primitives (database, functions, workflows) | [ai-primitives/primitives.org.ai](https://github.com/ai-primitives/primitives.org.ai) |
| workers.do | Tagged template agents | [drivly/workers.do](https://github.com/drivly/workers.do) |
| db4 | 4-paradigm edge database | [ai-primitives/db4](https://github.com/ai-primitives/db4) |
| saaskit | SaaS starter kit | [drivly/saaskit](https://github.com/drivly/saaskit) |
| startups.studio | Startup generation cascade | [drivly/startups.studio](https://github.com/drivly/startups.studio) |
| duckdb.do | DuckDB WASM analytics | [drivly/duckdb](https://github.com/drivly/duckdb) |
