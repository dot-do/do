# CLAUDE.md - Digital Object (DO) Project

## Project Vision

**Every business entity IS a Durable Object** - not a row in a database, but a fully autonomous unit with its own storage, AI, payments, telephony, domains, and more.

## Project Structure

```
# Core
do/             # Base DigitalObject class
$/              # DO Context (renamed from context/)
                # $ is the DO context in API, callbacks, and SDK
rpc/            # CapnWeb RPC transport
api/            # Hono-based REST/RPC/MCP routes

# Database Layer
db/             # Unified data layer
  cdc/          # Change Data Capture streaming
  collections/  # Nouns, Verbs, Things, Actions, Relationships
  storage/      # Hot/Warm/Cold storage tiers

# AI Layer
ai/             # Unified AI layer
  agents/       # Agent definitions and registry (TBD: move here)
    voice/      # Voice modality
      providers/# Voice AI providers (Vapi, LiveKit, Retell, Bland)

# Functions (pseudo-code becomes real)
functions/      # Function tiers: code/generative/agentic/human
  execution/    # Runtime execution tiers (native/rpc/esm/sandbox)

# Tools (capabilities for workers)
tools/          # Capabilities for humans & agents
  browser/      # Browser automation (Stagehand)
  computer/     # Code execution
    codex.ts    # AI-evaluate secure execution
    bashx.ts    # Shell execution
    fsx.ts      # File system operations
    sandbox.ts  # Container/VM for untrusted code
  communication/# Communication channels (transports)
    email/      # Email (Cloudflare/SES/Mailchannels)
    phone/      # Phone/SMS
      internal/ # Hidden: TwiML, webhooks, signature validation
    slack.ts    # Slack integration
    discord.ts  # Discord integration
    teams.ts    # Teams integration

# Workers & Agents (currently at root, agents TBD move to ai/)
workers/        # Digital-worker interface (unifies humans & agents)
agents/         # Agent definitions and registry (TBD: move to ai/)

# Voice (session management, not agent definitions)
voice/          # Voice session lifecycle, campaigns, webrtc

# Integrations
integrations/   # Deep integrations (Stripe, WorkOS, GitHub, Cloudflare)
domains/        # Domain management
financial/      # Stripe, accounting, P&L
colo/           # Colo-awareness and routing (TBD: move to do/)

# Client
sdk/            # Client SDK
cli/            # CLI commands

# Infrastructure
proxy/          # Cloudflare Worker proxy (has own wrangler.jsonc)
tail/           # Observability tail worker (has own wrangler.jsonc)
site/           # Fumadocs Next.js static site (docs UI)
docs/           # Documentation content (MDX)

# Development
tests/          # Test infrastructure
  coverage/     # Test coverage reports
  utils/        # Test utilities (no mocks!)
  e2e/          # End-to-end tests
  integration/  # Integration tests
  load/         # Load/performance tests
types/          # TypeScript type definitions
snippets/       # Example code snippets
```

**IMPORTANT**: No `src/` folder. All implementation code lives at root level.

## Worker Configuration

Workers have their **own** `wrangler.jsonc` files (not in root):
- `proxy/wrangler.jsonc` - API gateway worker
- `tail/wrangler.jsonc` - Observability tail worker

Use `wrangler.jsonc` (JSON with comments), NOT `wrangler.toml`.

## Content & Documentation Style

**CRITICAL**: All READMEs and content should be compelling and StoryBrand-centric.

### StoryBrand Framework

The user is the **hero**. DO is the **guide** on their epic journey.

| StoryBrand Element | Application |
|-------------------|-------------|
| **Hero** | The developer/founder building their business |
| **Problem** | Complexity, scale, infrastructure burden |
| **Guide** | DO - the platform that makes it simple |
| **Plan** | Clear steps showing how DO works |
| **Call to Action** | Code examples they can run immediately |
| **Success** | What they'll achieve (autonomous business, scale, simplicity) |
| **Failure** | What they avoid (complexity, 35+ packages, infrastructure hell) |

### Writing Guidelines

1. **Lead with the hero's journey** - Start with what the user wants to achieve
2. **Show, don't tell** - Code examples over feature lists
3. **Make it visceral** - "That's your startup. Running." not "This enables startup automation"
4. **Keep it conversational** - Write like you're talking to a friend
5. **End with transformation** - Show the before/after of using DO

### Bad vs Good

Bad (feature-focused):
```
DO provides a unified Durable Object system with CDC streaming,
hierarchical identity, and multi-paradigm database support.
```

Good (hero-focused):
```
You're building a business. Maybe it's just you.

DO gives you everything you need to run it - database, AI, payments,
telephony, domains - all in one place. Each customer, each product,
each agent is a fully autonomous unit.

That's your startup. Running.
```

## Naming Conventions

**CRITICAL**: Follow these naming conventions everywhere.

### Casing Rules

| Type | Casing | Examples |
|------|--------|----------|
| **Enums** | PascalCase | `DOType`, `ActionStatus`, `ExecutionTier` |
| **Nouns/Types** | PascalCase | `User`, `Agent`, `Workflow`, `Thing` |
| **Verbs/Actions** | camelCase | `create`, `update`, `delete`, `sendEmail` |
| **Events** | NS.Object.event | `AI.Generation.started`, `DO.Lifecycle.created` |
| **Functions** | camelCase | `generateIdeas`, `processOrder`, `sendNotification` |
| **Properties** | camelCase | `createdAt`, `updatedAt`, `inputTokens` |

### Forbidden

- **NO kebab-case** - Never `my-function` or `user-id`
- **NO snake_case** - Never `my_function` or `user_id`

### AI Model References

**CRITICAL**: Do NOT hardcode specific AI model names anywhere.

Wrong:
```typescript
model: 'gpt-4o' | 'claude-3-opus' | 'gemini-pro'
```

Correct:
```typescript
// Use characteristics, not model names
model: 'best' | 'fast' | 'cost' | 'reasoning' | 'code' | 'vision' | 'long'

// Combo/priority selection - first characteristic is primary, second refines
model: 'fast,best'   // Fastest model that's also high quality
model: 'best,cost'   // Best quality without crazy expense
model: 'code,fast'   // Best code model with lowest latency

// Or with constraints (cost is per 1M tokens)
constraints?: {
  maxLatency?: number   // milliseconds
  maxCost?: number      // per 1M tokens
  minQuality?: number   // 0-1 score
}
```

**Why**: AI models become outdated within months. Use `language-models` from ai-primitives which provides real-time data from OpenRouter with capabilities, pricing, and benchmarks. The runtime (not the code) selects the appropriate model based on characteristics and constraints.

### Verb Forms

Every verb should have these grammatical forms:

| Form | Purpose | Example |
|------|---------|---------|
| `action` | Imperative | create |
| `activity` | Present continuous | creating |
| `event` | Past tense | created |
| `reverse` | With actor | createdBy |
| `inverse` | Opposite action | delete |

### Event Naming Pattern

Events follow `NS.Object.event` format:

```
DO.Lifecycle.created
AI.Generation.started
AI.Generation.completed
RPC.Request.received
Workflow.Step.completed
Agent.Tool.called
```

```
startups.studio (Business DO)
  └─ headless.ly (Startup DO)
       └─ crm.headless.ly (SaaS DO)
            └─ crm.headless.ly/acme (Tenant DO)
```

## Design Principle

**Keep it simple**: 1 package, 1 worker, 1 Durable Object.

Previous attempts (dotdo with 35+ packages, platform with 81 workers) collapsed under complexity. DO learns from those failures.

## Key Patterns

### $id, $type, $context Pattern

Every Digital Object has these three core identity properties:

```typescript
interface DigitalObjectIdentity {
  $id: string      // Unique identifier (URL or hierarchical path)
  $type: DOType    // The type of this DO (Startup, SaaS, Agent, etc.)
  $context: string // URL to parent DO (enables CDC bubbling)
}
```

### Cascade Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `->` | Sync forward cascade | `Ontology -> Problem -> Solution` |
| `~>` | Async forward cascade | `Content ~> FocusGroup ~> Experiment` |
| `<-` | Sync backward reference | `Result <- Experiment` |
| `<~` | Async backward reference | `Learning <~ Result` |

### CDC Streaming via $context

Change Data Capture events bubble up the $context chain:

```
crm.headless.ly/acme → crm.headless.ly → headless.ly → startups.studio → R2
```

Each parent DO receives CDC events from all descendants, enabling real-time analytics and audit logs.

### CapnWeb RPC with WS Hibernation

- WebSocket connections use Cloudflare's hibernation API
- RPC calls are serialized using Cap'n Proto for efficiency
- Connections survive worker restarts via DO hibernation

## Every DO Has

| Component | Location | Purpose |
|-----------|----------|---------|
| **API** | proxy | REST/RPC API for programmatic access |
| **MCP** | proxy | Model Context Protocol for AI agents |
| **Site** | optional | Public-facing website (14 types) |
| **App** | optional | Interactive application (17 types) |
| **AdminApp** | optional | Admin dashboard for management |

## Core Concepts

### N-Level Hierarchical Pattern

A Thing can also BE its own DO (dual nature):

```typescript
// Parent → Child: Thing.$ref points to child DO
// Child → Parent: DO.$context points to parent DO

// CDC events bubble up the $context chain
crm.headless.ly/acme → crm.headless.ly → headless.ly → startups.studio → R2
```

### Capabilities Every DO Has

| Layer | Capabilities |
|-------|--------------|
| **Core** | DB4.AI (4 paradigms), MDXDB, Collections, Fn<Out,In> |
| **Deep Integrations** | Stripe Connect, WorkOS, GitHub, Cloudflare |
| **Communication** | Email (CF/SES), Slack, Discord, Teams, Phone/SMS |
| **AI** | Text LLM, Embeddings, Image, Video |
| **Tools** | Browser (Stagehand), Computer (bashx, fsx, gitx, npx, sandbox) |
| **Workers** | Digital-worker interface (humans and agents) |
| **Financial** | Payments, transfers, accounting, P&L |
| **Domains** | 50+ platform TLDs, DNS, SSL |

### Digital-Worker Pattern

**Key Insight**: Humans and AI agents are interchangeable workers with shared capabilities.

```typescript
interface DigitalWorker {
  id: string
  type: 'human' | 'agent'
  name: string
  channels: {
    email?: string          // Email address
    phone?: string          // Phone number
    slack?: SlackAccount    // Slack workspace
    discord?: DiscordAccount
    teams?: TeamsAccount
    github?: GitHubAccount
  }
  capabilities: WorkerCapabilities
  tools: ('browser' | 'computer' | 'search')[]
}
```

**Agents** extend workers with AI-specific fields:
- `model`: 'best' | 'fast' | 'cost' | 'reasoning' (runtime selection)
- `systemPrompt`: Agent personality and instructions
- `voice?`: Voice modality configuration (optional)

**Voice is a Modality**: Agents can speak, but voice is not a separate system.
```typescript
const priya = defineAgent('Priya')
  .description('Product Manager AI')
  .systemPrompt('You are Priya...')
  .withVoice({ provider: 'vapi', voiceId: 'sarah' })  // Optional
  .build()
```

### Tools as Worker Capabilities

Tools are capabilities that workers (humans or agents) can use:

| Tool | Purpose | Implementation |
|------|---------|----------------|
| **browser** | Web automation | Stagehand (AI-powered) |
| **computer** | Code execution | Layered: bashx → fsx → gitx → npx → sandbox |

**Computer Tool Layers** (90% of needs handled by bashx):
- `bashx`: Shell command execution
- `fsx`: File system operations
- `gitx`: Git operations
- `npx`: Package execution
- `sandbox`: Isolated execution for untrusted code

### The 11-Stage Cascade is ONE Example

The cascade (Ontology -> Problem -> Solution -> ICP -> Persona -> Startup -> Content -> FocusGroup -> Experiment -> Result -> Learning) is the FIRST use case for generating millions of startups.

Each generated startup then becomes its own DO with full capabilities.

## Development Methodology: TDD

**CRITICAL**: All development follows Test-Driven Development with strict phase separation.

### TDD Process

| Phase | Action | Requirement |
|-------|--------|-------------|
| **Red** | Write failing tests | Tests must fail before implementation |
| **Green** | Make tests pass | Minimal code to pass tests |
| **Refactor** | Clean up | Maintain passing tests while improving code |

**Coverage Requirement**: 80%+ test coverage required for all code.

### Testing Conventions

**NO MOCKS**. Tests use real environments:

| Component | How to Test |
|-----------|-------------|
| **DurableObjects** | Use `@cloudflare/vitest-pool-workers` with miniflare |
| **Stripe** | Use Stripe dev environment |
| **GitHub** | Use test repositories |
| **External APIs** | Use sandbox/dev modes |

**Test file locations**:

| Test Type | Location | Pattern |
|-----------|----------|---------|
| **Unit tests** | Alongside source | `module/feature.test.ts` |
| **E2E tests** | `tests/e2e/` | `*.e2e.test.ts` |
| **Integration** | `tests/integration/` | `*.integration.test.ts` |
| **Load tests** | `tests/load/` | `*.load.test.ts` |
| **Test utils** | `tests/utils/` | Shared fixtures, helpers |

```
module/
  index.ts          # Source
  index.test.ts     # Unit test (same directory)

tests/
  utils/            # Shared test utilities
  e2e/              # End-to-end tests
  integration/      # Integration tests
  load/             # Load/performance tests
```

Run tests:
- `pnpm test` - Unit tests (node environment)
- `pnpm test:workers` - Workers tests (miniflare environment)

### Code Tasks: Red-Green-Refactor

For every functional task, create **three separate issues**:

```
do-epic.1     Red: Write failing tests for feature X
do-epic.2     Green: Implement feature X to pass tests
do-epic.3     Refactor: Clean up feature X implementation
```

**Rules**:
- Each phase MUST be done by a **different subagent**
- Red must fail before Green starts
- Green must pass before Refactor starts

### Content Tasks: Write-Edit-Rewrite

For documentation and content:

```
do-epic.1     Write: Draft initial content
do-epic.2     Edit: Review and improve
do-epic.3     Rewrite: Final polish
```

## Type Files

| File | Purpose |
|------|---------|
| `identity.ts` | $id, $type, $context, DOType |
| `collections.ts` | Nouns, Verbs, Things, Actions |
| `databases.ts` | DB4.AI (4 paradigms) |
| `functions.ts` | Fn<Out,In,Opts> pattern |
| `cascade.ts` | 11-stage workflow |
| `site.ts` | 14 site types (mdxui) |
| `app.ts` | 17 app types (mdxui) |
| `content.ts` | MDXLD/MDXDB |
| `git.ts` | Git sync |
| `financial.ts` | Stripe, accounting, P&L |
| `domains.ts` | DNS, SSL, platform TLDs |
| `communication.ts` | Email, Slack, Discord, Teams |
| `integrations.ts` | Deep vs generic |
| `telephony.ts` | Phone, SMS, calls (types for communication/phone/) |
| `voice-ai.ts` | Voice agents |
| `ai.ts` | Unified AI abstraction |

## Code Style

Prettier configuration is in `package.json`:

```json
"prettier": {
  "semi": false,
  "singleQuote": true,
  "jsxSingleQuote": true,
  "tabWidth": 2,
  "printWidth": 160
}
```

**Rules**:
- No semicolons
- Single quotes (including JSX)
- 2-space indentation
- 160 character line width

## Commands

```bash
pnpm check       # TypeScript type check
pnpm build       # Build to dist/
pnpm test        # Run unit tests
pnpm test:workers # Run workers tests (miniflare)
```

## Beads Issue Tracking

This project uses Beads (`.beads/`) for issue tracking.

### Essential Commands

```bash
bd ready                           # Show issues ready to work
bd list --status=open              # All open issues
bd show <id>                       # Detailed issue view
bd create --title="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id>                      # Mark complete
bd dep add <issue> <depends-on>    # Add dependency
bd sync --flush-only               # Export to JSONL
```

**Priority**: 0-4 (0=critical, 2=medium, 4=backlog). NOT "high"/"medium"/"low".

## Orchestration Rules

### When Talking to User (Strategic Context)

If you (Claude) are in conversation with the user:

1. **Maintain strategic context** - Understand the big picture
2. **Do NOT do work yourself** - You are the orchestrator
3. **Create/update/manage issue backlog** - Use `bd` commands
4. **Dispatch parallel subagents** - Maximize parallelism
5. **Enforce phase separation** - Never let one subagent do multiple phases

### Subagent Dispatch Rules

1. **Maximize parallelism** - Independent tasks run in parallel
2. **Enforce phase separation** - Red -> Green -> Refactor (different agents)
3. **Track dependencies** - Use `bd dep add`
4. **Monitor progress** - Check `bd list --status=in_progress`

## Architecture Quick Reference

### DO Types

**Business**: Business, Startup, SaaS, IaaS, PaaS, Service
**Content**: Site (14 types), App (17 types), Page, Post, Doc
**Operational**: Agent, Database, Directory, Marketplace
**Utility**: Workflow, Function, Collection, User, Org

### Deep Integrations

| Integration | Purpose |
|-------------|---------|
| Stripe Connect | Payments, accounting, P&L |
| WorkOS | Auth, SSO, RBAC/FGA |
| GitHub | Git sync, repos, PRs |
| Cloudflare | Domains, DNS, SSL |
| Slack/Discord/Teams | Human-in-the-loop |

### DB4.AI Paradigms

1. Relational (SQL, ACID)
2. Document (JSON, flexible)
3. Graph (nodes/edges)
4. Analytics (columnar, OLAP)

### Function Tiers

1. **code** - Pure TypeScript (<1ms)
2. **generative** - AI model call
3. **agentic** - Autonomous agent
4. **human** - Human-in-the-loop

### Phone/SMS Providers (communication/phone/)

Telnyx (30-50% cheaper than Twilio), Plivo (~35% cheaper), Bandwidth (US direct), Vonage

### Voice AI Providers

Vapi, LiveKit, Retell AI, Bland AI, Daily

### AI Model Selection

Models are selected at **runtime** based on characteristics, not hardcoded:

| Characteristic | Optimizes For |
|----------------|---------------|
| `best` | Quality/accuracy |
| `fast` | Lowest latency |
| `cost` | Lowest price |
| `hybrid` | Balanced tradeoffs |

The built-in experimentation engine automatically evaluates new models for performance with different agents and generative functions. Model selection can be changed by users, system settings, or agents at runtime.

## Implementation Phases

1. Phase 1 - Types definition (complete)
2. **Phase 2** - Base DigitalObject class (`do/`)
3. **Phase 3** - RPC transport (`rpc/`) - CapnWeb
4. **Phase 4** - CDC streaming (`cdc/`)
5. **Phase 5** - Collections (`collections/`)
6. **Phase 6** - Deep integrations (`integrations/`)
7. **Phase 7** - AI layer (`ai/`)
8. **Phase 8** - Communication (`communication/`)
9. **Phase 9** - Phone/SMS (`communication/phone/`)
10. **Phase 10** - Voice AI (`voice/`)
11. **Phase 11** - Domain management (`domains/`)
12. **Phase 12** - Financial operations (`financial/`)
13. **Phase 13** - SDK (`sdk/`)
14. **Phase 14** - CLI (`cli/`)

## Session Close Protocol

Before completing work:

```bash
bd sync --flush-only    # Export beads to JSONL
```

## Related Projects

| Project | Purpose |
|---------|---------|
| db4 | Database layer (separate) |
| postgres.do | PGLite WASM (separate) |
| duckdb.do | DuckDB WASM (separate) |
| mdx | MDXLD/MDXDB content |
| ui | mdxui components |

## Key Pattern Examples

### Thing with $ref (Parent -> Child)

```typescript
const thing: ThingExpanded = {
  $id: 'headless.ly',
  $type: 'Startup',
  $ref: 'https://headless.ly',  // URL to its own DO
  name: 'Headless.ly',
}
```

### DO with $context (Child -> Parent)

```typescript
const startup: DigitalObjectIdentity = {
  $id: 'https://headless.ly',
  $type: 'Startup',
  $context: 'https://startups.studio',  // URL to parent DO
}
```

### Multi-Tenant Pattern

```
saas.do (SaaS DO)
  └─ saas.do/tenant-a (Tenant DO, $context: saas.do)
  └─ saas.do/tenant-b (Tenant DO, $context: saas.do)
```

Each tenant is a full DO with isolated storage, its own users, and full capabilities.
