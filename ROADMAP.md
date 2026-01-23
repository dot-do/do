# DO Implementation Epics

Comprehensive breakdown of implementation work for the Digital Object system.

## Epic Overview

| # | Epic | Priority | Dependencies | Status |
|---|------|----------|--------------|--------|
| 1 | Base DigitalObject Class | P0 | - | Not Started |
| 2 | CapnWeb RPC Transport | P0 | Epic 1 | Not Started |
| 3 | CDC Streaming | P0 | Epic 1, 2 | Not Started |
| 4 | Collections | P1 | Epic 1 | Not Started |
| 5 | Deep Integrations | P1 | Epic 1, 2 | Not Started |
| 6 | Unified AI Layer | P1 | Epic 1, 2 | Not Started |
| 7 | Communication Layer | P2 | Epic 1, 2, 5 | Not Started |
| 8 | Telephony | P2 | Epic 1, 2 | Not Started |
| 9 | Voice AI | P2 | Epic 6, 8 | Not Started |
| 10 | Domain Management | P2 | Epic 1, 5 | Not Started |
| 11 | Financial Operations | P2 | Epic 1, 5 | Not Started |
| 12 | Specialized DO Types | P3 | Epic 1-11 | Not Started |

---

## Epic 1: Base DigitalObject Class

**Goal**: Implement the foundational DigitalObject class that all DOs inherit from.

### Tasks

#### 1.1 Core Class Structure
- [ ] Red: Tests for DigitalObject instantiation, identity, state
- [ ] Green: Implement base class with $id, $type, $context, $version
- [ ] Refactor: Clean up and document

#### 1.2 State Management
- [ ] Red: Tests for state get/set/delete
- [ ] Green: Implement state storage interface (DO SQLite)
- [ ] Refactor: Optimize and add batching

#### 1.3 Hibernation Support
- [ ] Red: Tests for hibernation/awakening lifecycle
- [ ] Green: Implement alarm-based hibernation (Agents SDK pattern)
- [ ] Refactor: Add metrics and observability

#### 1.4 fetch() Handler
- [ ] Red: Tests for HTTP request routing
- [ ] Green: Implement fetch() with path-based routing
- [ ] Refactor: Add middleware support

#### 1.5 Child DO Creation
- [ ] Red: Tests for creating child DOs with $context
- [ ] Green: Implement DO stub creation with parent reference
- [ ] Refactor: Add caching and connection pooling

### Deliverables
- `src/do/DigitalObject.ts` - Base class
- `src/do/state.ts` - State management
- `src/do/hibernation.ts` - Hibernation support
- Tests with 80%+ coverage

---

## Epic 2: CapnWeb RPC Transport

**Goal**: Implement schema-free RPC over WebSocket with hibernation support.

### Tasks

#### 2.1 WebSocket Handler
- [ ] Red: Tests for WS connection, hibernation, wake
- [ ] Green: Implement hibernatable WebSocket (95% cost savings)
- [ ] Refactor: Add connection tracking

#### 2.2 Message Protocol
- [ ] Red: Tests for request/response serialization
- [ ] Green: Implement JSON-RPC style message format
- [ ] Refactor: Add validation and error handling

#### 2.3 Method Routing
- [ ] Red: Tests for method dispatch
- [ ] Green: Implement method registry and dispatch
- [ ] Refactor: Add middleware/hooks

#### 2.4 Promise Pipelining
- [ ] Red: Tests for batched operations
- [ ] Green: Implement promise pipelining for reduced round-trips
- [ ] Refactor: Optimize batching strategy

#### 2.5 Client SDK
- [ ] Red: Tests for client-side usage
- [ ] Green: Implement TypeScript client with type inference
- [ ] Refactor: Add auto-reconnection

### Deliverables
- `src/rpc/server.ts` - RPC server
- `src/rpc/client.ts` - RPC client
- `src/rpc/protocol.ts` - Message protocol
- Tests with 80%+ coverage

---

## Epic 3: CDC Streaming

**Goal**: Implement Change Data Capture with hierarchical streaming via $context.

### Tasks

#### 3.1 Event Generation
- [ ] Red: Tests for CDCEvent creation on mutations
- [ ] Green: Implement automatic CDC event generation
- [ ] Refactor: Add event filtering options

#### 3.2 $context Routing
- [ ] Red: Tests for parent notification
- [ ] Green: Implement $context chain traversal
- [ ] Refactor: Add batching and buffering

#### 3.3 Event Processing
- [ ] Red: Tests for parent-side event handling
- [ ] Green: Implement event handlers with transformation
- [ ] Refactor: Add aggregation helpers

#### 3.4 Cold Storage (R2/Iceberg)
- [ ] Red: Tests for R2 persistence
- [ ] Green: Implement Parquet/Iceberg export to R2
- [ ] Refactor: Add partitioning and compaction

#### 3.5 Replay & Recovery
- [ ] Red: Tests for event replay
- [ ] Green: Implement cursor-based replay from any point
- [ ] Refactor: Add checkpoint management

### Deliverables
- `src/cdc/events.ts` - Event generation
- `src/cdc/streaming.ts` - $context streaming
- `src/cdc/storage.ts` - R2/Iceberg persistence
- Tests with 80%+ coverage

---

## Epic 4: Collections

**Goal**: Implement Nouns, Verbs, Things, Actions, and Relationships.

### Tasks

#### 4.1 Collection Base
- [ ] Red: Tests for generic collection CRUD
- [ ] Green: Implement base collection with get/set/list/delete
- [ ] Refactor: Add pagination and filtering

#### 4.2 Nouns & Verbs
- [ ] Red: Tests for noun/verb registration
- [ ] Green: Implement noun/verb registry
- [ ] Refactor: Add schema validation

#### 4.3 Things
- [ ] Red: Tests for Thing CRUD (both formats)
- [ ] Green: Implement ThingExpanded and ThingCompact
- [ ] Refactor: Add $ref resolution

#### 4.4 Actions
- [ ] Red: Tests for durable action execution
- [ ] Green: Implement action lifecycle (pending → running → completed)
- [ ] Refactor: Add retry and timeout handling

#### 4.5 Relationships
- [ ] Red: Tests for relationship management
- [ ] Green: Implement graph-style relationships
- [ ] Refactor: Add traversal helpers

### Deliverables
- `src/collections/base.ts` - Base collection
- `src/collections/things.ts` - Things collection
- `src/collections/actions.ts` - Actions collection
- `src/collections/relationships.ts` - Relationships
- Tests with 80%+ coverage

---

## Epic 5: Deep Integrations

**Goal**: Implement platform-level integrations (Stripe, WorkOS, GitHub, Cloudflare).

### Tasks

#### 5.1 Integration Base
- [ ] Red: Tests for integration lifecycle
- [ ] Green: Implement base integration interface
- [ ] Refactor: Add status tracking and error handling

#### 5.2 Stripe Connect
- [ ] Red: Tests for account creation, payments, transfers
- [ ] Green: Implement Stripe Connect integration
- [ ] Refactor: Add webhook handling

#### 5.3 WorkOS
- [ ] Red: Tests for SSO, directory sync, RBAC
- [ ] Green: Implement WorkOS integration
- [ ] Refactor: Add session management

#### 5.4 GitHub
- [ ] Red: Tests for repo sync, webhooks
- [ ] Green: Implement GitHub App integration
- [ ] Refactor: Add conflict resolution

#### 5.5 Cloudflare
- [ ] Red: Tests for DNS, SSL management
- [ ] Green: Implement Cloudflare API integration
- [ ] Refactor: Add zone management

### Deliverables
- `src/integrations/base.ts` - Base integration
- `src/integrations/stripe.ts` - Stripe Connect
- `src/integrations/workos.ts` - WorkOS
- `src/integrations/github.ts` - GitHub
- `src/integrations/cloudflare.ts` - Cloudflare
- Tests with 80%+ coverage

---

## Epic 6: Unified AI Layer

**Goal**: Implement multi-modal AI through Cloudflare AI Gateway.

### Tasks

#### 6.1 AI Gateway Integration
- [ ] Red: Tests for gateway routing, caching
- [ ] Green: Implement Cloudflare AI Gateway client
- [ ] Refactor: Add rate limiting and cost tracking

#### 6.2 Text LLM
- [ ] Red: Tests for generate, chat, stream
- [ ] Green: Implement text generation with provider routing
- [ ] Refactor: Add model aliases (fast, cheap, best)

#### 6.3 Embeddings
- [ ] Red: Tests for embed, embedBatch
- [ ] Green: Implement embedding generation
- [ ] Refactor: Add vector storage integration

#### 6.4 Image Generation
- [ ] Red: Tests for generateImage
- [ ] Green: Implement image generation (DALL-E, Flux, etc.)
- [ ] Refactor: Add result caching

#### 6.5 Voice (Synthesis & Recognition)
- [ ] Red: Tests for synthesize, transcribe
- [ ] Green: Implement TTS and STT
- [ ] Refactor: Add streaming support

### Deliverables
- `src/ai/gateway.ts` - AI Gateway client
- `src/ai/text.ts` - Text generation
- `src/ai/embeddings.ts` - Embeddings
- `src/ai/image.ts` - Image generation
- `src/ai/voice.ts` - Voice synthesis/recognition
- Tests with 80%+ coverage

---

## Epic 7: Communication Layer

**Goal**: Implement email and human-in-the-loop messaging.

### Tasks

#### 7.1 Email Inbound (Cloudflare)
- [ ] Red: Tests for email routing handler
- [ ] Green: Implement CF Email Routing integration
- [ ] Refactor: Add spam filtering and parsing

#### 7.2 Email Outbound (SES/Mailchannels)
- [ ] Red: Tests for send, sendBatch
- [ ] Green: Implement provider abstraction
- [ ] Refactor: Add templates and tracking

#### 7.3 Slack Integration
- [ ] Red: Tests for notify, interact
- [ ] Green: Implement Slack Bot integration
- [ ] Refactor: Add Block Kit helpers

#### 7.4 Discord Integration
- [ ] Red: Tests for notify, interact
- [ ] Green: Implement Discord Bot integration
- [ ] Refactor: Add embed helpers

#### 7.5 Human-in-the-Loop Approvals
- [ ] Red: Tests for approval workflow
- [ ] Green: Implement multi-channel approval requests
- [ ] Refactor: Add timeout and escalation

### Deliverables
- `src/communication/email.ts` - Email handling
- `src/communication/slack.ts` - Slack integration
- `src/communication/discord.ts` - Discord integration
- `src/communication/hitl.ts` - Human-in-the-loop
- Tests with 80%+ coverage

---

## Epic 8: Telephony

**Goal**: Implement phone/SMS abstraction over Telnyx/Plivo/Twilio.

### Tasks

#### 8.1 Provider Abstraction
- [ ] Red: Tests for provider interface
- [ ] Green: Implement provider abstraction layer
- [ ] Refactor: Add automatic failover

#### 8.2 Phone Numbers
- [ ] Red: Tests for search, purchase, release
- [ ] Green: Implement phone number management
- [ ] Refactor: Add number pooling

#### 8.3 Voice Calls
- [ ] Red: Tests for makeCall, updateCall
- [ ] Green: Implement call management
- [ ] Refactor: Add TwiML builder

#### 8.4 SMS/MMS
- [ ] Red: Tests for sendSMS, sendBulkSMS
- [ ] Green: Implement SMS messaging
- [ ] Refactor: Add delivery tracking

#### 8.5 Webhooks
- [ ] Red: Tests for inbound call/SMS handling
- [ ] Green: Implement webhook handlers
- [ ] Refactor: Add signature verification

### Deliverables
- `src/telephony/providers.ts` - Provider abstraction
- `src/telephony/numbers.ts` - Phone numbers
- `src/telephony/calls.ts` - Voice calls
- `src/telephony/sms.ts` - SMS/MMS
- Tests with 80%+ coverage

---

## Epic 9: Voice AI

**Goal**: Implement conversational voice agents via Vapi/LiveKit/Retell.

### Tasks

#### 9.1 Provider Abstraction
- [ ] Red: Tests for provider interface
- [ ] Green: Implement voice AI provider abstraction
- [ ] Refactor: Add capability detection

#### 9.2 Agent Management
- [ ] Red: Tests for create/update/delete agent
- [ ] Green: Implement voice agent CRUD
- [ ] Refactor: Add voice cloning support

#### 9.3 Sessions (Calls)
- [ ] Red: Tests for session lifecycle
- [ ] Green: Implement call session management
- [ ] Refactor: Add real-time metrics

#### 9.4 Tool Calling
- [ ] Red: Tests for tool execution during calls
- [ ] Green: Implement tool calling integration
- [ ] Refactor: Add async tool support

#### 9.5 Outbound Campaigns
- [ ] Red: Tests for campaign management
- [ ] Green: Implement bulk outbound calling
- [ ] Refactor: Add scheduling and throttling

### Deliverables
- `src/voice/providers.ts` - Provider abstraction
- `src/voice/agents.ts` - Agent management
- `src/voice/sessions.ts` - Call sessions
- `src/voice/campaigns.ts` - Outbound campaigns
- Tests with 80%+ coverage

---

## Epic 10: Domain Management

**Goal**: Implement subdomain registration on platform TLDs.

### Tasks

#### 10.1 TLD Registry
- [ ] Red: Tests for TLD listing and validation
- [ ] Green: Implement platform TLD registry
- [ ] Refactor: Add availability checking

#### 10.2 Subdomain Registration
- [ ] Red: Tests for register, release
- [ ] Green: Implement subdomain CRUD via CF API
- [ ] Refactor: Add reserved subdomain validation

#### 10.3 DNS Configuration
- [ ] Red: Tests for DNS record management
- [ ] Green: Implement DNS CRUD operations
- [ ] Refactor: Add record templates

#### 10.4 SSL Management
- [ ] Red: Tests for SSL certificate handling
- [ ] Green: Implement SSL via Cloudflare
- [ ] Refactor: Add custom certificate support

#### 10.5 Routing
- [ ] Red: Tests for routing configuration
- [ ] Green: Implement Worker/DO/Pages routing
- [ ] Refactor: Add health checks

### Deliverables
- `src/domains/tlds.ts` - TLD registry
- `src/domains/subdomains.ts` - Subdomain management
- `src/domains/dns.ts` - DNS configuration
- `src/domains/ssl.ts` - SSL management
- Tests with 80%+ coverage

---

## Epic 11: Financial Operations

**Goal**: Implement Stripe-based payments, accounting, and financial reporting.

### Tasks

#### 11.1 Stripe Connect Setup
- [ ] Red: Tests for account creation and onboarding
- [ ] Green: Implement Connect account management
- [ ] Refactor: Add onboarding status tracking

#### 11.2 Payments & Subscriptions
- [ ] Red: Tests for payment, subscription lifecycle
- [ ] Green: Implement payment processing
- [ ] Refactor: Add retry and recovery

#### 11.3 Transfers & Payouts
- [ ] Red: Tests for transfers and payouts
- [ ] Green: Implement money movement
- [ ] Refactor: Add scheduling

#### 11.4 Accounting (Double-Entry)
- [ ] Red: Tests for journal entries
- [ ] Green: Implement chart of accounts and journal
- [ ] Refactor: Add automatic reconciliation

#### 11.5 Financial Reports
- [ ] Red: Tests for P&L, balance sheet
- [ ] Green: Implement financial statement generation
- [ ] Refactor: Add period comparison

### Deliverables
- `src/financial/stripe.ts` - Stripe Connect
- `src/financial/payments.ts` - Payments
- `src/financial/accounting.ts` - Double-entry accounting
- `src/financial/reports.ts` - Financial reports
- Tests with 80%+ coverage

---

## Epic 12: Specialized DO Types

**Goal**: Implement Business, Startup, SaaS, Service, and Tenant DO types.

### Tasks

#### 12.1 Business DO
- [ ] Red: Tests for Business DO capabilities
- [ ] Green: Implement Business DO with portfolio management
- [ ] Refactor: Add analytics aggregation

#### 12.2 Startup DO
- [ ] Red: Tests for Startup DO capabilities
- [ ] Green: Implement Startup DO with cascade support
- [ ] Refactor: Add experiment tracking

#### 12.3 SaaS DO
- [ ] Red: Tests for SaaS DO with multi-tenancy
- [ ] Green: Implement SaaS DO with tenant isolation
- [ ] Refactor: Add tenant provisioning

#### 12.4 Service DO
- [ ] Red: Tests for Service DO capabilities
- [ ] Green: Implement AI Service DO
- [ ] Refactor: Add usage metering

#### 12.5 Tenant DO
- [ ] Red: Tests for Tenant DO isolation
- [ ] Green: Implement Tenant DO with $context
- [ ] Refactor: Add data isolation verification

### Deliverables
- `src/types/business.ts` - Business DO
- `src/types/startup.ts` - Startup DO
- `src/types/saas.ts` - SaaS DO
- `src/types/service.ts` - Service DO
- `src/types/tenant.ts` - Tenant DO
- Tests with 80%+ coverage

---

## Implementation Notes

### TDD Phase Separation

Every task follows Red-Green-Refactor with **different agents for each phase**:
- **Red**: Write failing tests (Agent A)
- **Green**: Make tests pass (Agent B)
- **Refactor**: Clean up code (Agent C)

### Parallelization

Independent epics can run in parallel:
- Epic 4 (Collections) can run alongside Epic 5 (Integrations)
- Epic 6 (AI), 7 (Communication), 8 (Telephony) can run in parallel
- Epic 9 (Voice AI) depends on Epic 6 and 8

### Keep It Simple

- 1 package
- 1 worker
- 1 Durable Object (with specialized types)
- Heavy features in separate projects (postgres.do, duckdb.do)
