/**
 * Digital Object (DO) Type Definitions
 *
 * This module exports all types for the DO system, combining:
 * - Canonical types from @dotdo/types (shared across the ecosystem)
 * - DO-specific types for Cloudflare Durable Objects implementation
 *
 * DO combines:
 * - DB4.AI (4 database paradigms)
 * - MDXDB (URL-based content filesystem)
 * - Fn<Out,In,Opts> (generative functions)
 * - 11-stage cascade (startup generation)
 * - mdxui (Site/App components)
 * - gitx (content/code sync)
 */

// =============================================================================
// Re-exports from @dotdo/types (canonical shared types)
// =============================================================================

// Functions - Fn<Out,In,Opts> pattern from @dotdo/types
export type {
  Fn,
  FnSync,
  FnStream,
  FnStreamResult,
  FnWithMeta,
  FnMeta,
  FnResult,
  FnError,
  FnExample,
  JsonSchema,
  FnHandler,
  FnFactory,
  FnOutput,
  FnInput,
  FnOptions,
  FnOptional,
  FnRecord,
} from '@dotdo/types/functions'

// RPC types from @dotdo/types
export {
  RPCErrorCode,
  type RPCError as SharedRPCError,
  type RPCMetadata,
  type RPCRequest as SharedRPCRequest,
  type RPCResponse as SharedRPCResponse,
  type RPCNotification,
  type RPCBatchRequest as SharedRPCBatchRequest,
  type RPCBatchResponse as SharedRPCBatchResponse,
} from '@dotdo/types/rpc'

// Context types from @dotdo/types
export type {
  DOContext as SharedDOContext,
  DOFactory as SharedDOFactory,
  CreateContextOptions,
  // AI Context
  AIContext as SharedAIContext,
  AIGenerateOptions,
  AIEmbedOptions,
  AIChatOptions,
  AIImageOptions,
  AIClassifyOptions,
  AIClassification,
  ChatMessage,
  ChatToolCall,
  ChatAttachment,
  ChatResponse,
  ChatUsage,
  ChatFinishReason,
  ChatTool,
  ChatToolFunction,
  ImageResult,
  // DB Context
  DBContext as SharedDBContext,
  DBCollection as SharedDBCollection,
  DBFilter,
  DBFilterOperator,
  DBGetOptions,
  DBListOptions,
  DBCreateOptions,
  DBUpdateOptions,
  DBDeleteOptions,
  DBSearchOptions,
  DBSearchResult,
  DBCreateInput,
  DBChangeEvent,
  DBCreateEvent,
  DBUpdateEvent,
  DBDeleteEvent,
  DBWatchHandle,
  ResultSet,
  ColumnInfo,
  // Event Context
  OnContext as SharedOnContext,
  TypedOnProxy,
  EventHandler,
  ScheduledEventHandler,
  RequestHandler,
  AlarmEventHandler,
  WebSocketHandlers,
  EventContext,
  ScheduledEventInfo,
  EventSubscription,
  // Schedule Context
  EveryContext as SharedEveryContext,
  EveryBuilder,
  ScheduledHandler,
  ScheduledHandlerAcceptor,
  ScheduledHandlerOrBuilder,
  ScheduleExecutionContext,
  ScheduleRegistration,
  // Communications Context
  EmailContext as SharedEmailContext,
  EmailSendOptions,
  EmailAttachment,
  EmailSendResult,
  EmailDeliveryStatus,
  EmailMessage,
  SlackContext as SharedSlackContext,
  SlackPostOptions,
  SlackBlock,
  SlackAttachment,
  SlackPostResult,
  SlackMessage,
  SMSContext as SharedSMSContext,
  SMSSendOptions,
  SMSSendResult,
  SMSDeliveryStatus,
  SMSMessage,
  CallContext as SharedCallContext,
  CallStartOptions,
  VoiceOption,
  CallScript,
  CallScriptStep,
  CallResult,
  CallStatusValue,
  CallStatus,
  VoiceCall,
  // Payment Context
  PayContext,
  ChargeOptions,
  Charge,
  ChargeStatus,
  TransferOptions,
  Transfer,
  TransferStatus,
  PayoutOptions,
  Payout,
  PayoutStatus,
  SubscribeOptions,
  SubscriptionItem,
  Subscription,
  SubscriptionStatus,
  CancelSubscriptionOptions,
  RefundOptions,
  Refund,
  Balance,
  BalanceAmount,
  // Observability Context
  ObservabilityContext,
  Tracer,
  Logger,
  MetricsRecorder,
  Counter,
  Gauge,
  Histogram,
  ActiveSpan,
  Trace,
  TraceStatus,
  TraceMetadata,
  TraceContext,
  Span,
  SpanKind,
  SpanStatus,
  SpanAttributes,
  SpanAttributeValue,
  SpanEvent,
  SpanLink,
  LogLevel,
  LogEntry,
  LogAttributes,
  LogAttributeValue,
  StructuredLog,
  LogRecord,
  Metric,
  MetricType,
  MetricLabels,
  MetricPoint,
  MetricExemplar,
  HistogramValue,
  HistogramBucket,
  SummaryValue,
  SummaryQuantile,
  StartSpanOptions,
  MetricOptions,
  HistogramOptions,
  TracerConfig,
  LoggerConfig,
  MetricsConfig,
  ObservabilityConfig,
  SamplerConfig,
  ExporterConfig,
  PropagatorType,
  LogDestinationConfig,
} from '@dotdo/types/context'

// =============================================================================
// DO-specific types (local implementation)
// =============================================================================

// Core identity model ($id, $type, $context, DOType)
export * from './identity'

// Collections (nouns, verbs, things, actions, etc.)
export * from './collections'

// Database backends (DB4.AI - 4 paradigms)
export * from './databases'

// Code execution (fsx, gitx, bashx, esm)
export * from './execution'

// Storage & CDC (tiered storage, change data capture)
export * from './storage'

// Colo awareness (geo-distribution, replication)
export * from './colo'

// CapnWeb RPC (schema-free RPC with hibernation) - DO-specific implementation
export * from './rpc'

// Observability (events, metrics, tracing) - DO-specific
export * from './observability'

// MDXUI types - import directly from 'mdxui' package
// DO entities ARE the props for MDXUI components
// Note: Use `import from 'mdxui'` directly to avoid conflicts with DO types
export type {
  NavItem,
  ThemeMode,
  ActionProp,
  ActionsProps,
  Testimonial,
  FAQItem,
  StatItem,
  TeamMember,
  LogoItem,
  AuthProvider,
  FeatureItem,
} from './mdxui'

// Site types (mdxui - 14 site types, SiteComponents)
// Note: Exclude types that conflict with ./mdxui exports
export {
  SITE_TYPE_DEFAULTS,
  siteAutoWiring,
} from './site'

export type {
  // Re-exported MDXUI types with aliases
  MDXUISiteProps,
  MDXUIHeaderProps,
  MDXUIFooterProps,
  MDXUIHeroProps,
  MDXUIFeaturesProps,
  MDXUIPricingProps,
  MDXUITestimonialsProps,
  MDXUIFAQProps,
  MDXUICTASectionProps,
  MDXUIStatsProps,
  MDXUITeamSectionProps,
  MDXUILogosProps,
  // Site-specific types
  SiteFeatures,
  SiteTypeName,
  SiteConfig,
  SiteTheme,
  SiteSEO,
  NavigationConfig,
  FooterConfig,
  FooterLinkGroup,
  SiteComponents,
  CTAProps,
  SiteType,
} from './site'

// App types (mdxui - 18 app types, AppComponents)
// Note: Exclude types that conflict with ./mdxui exports
export { APP_TYPE_DEFAULTS } from './app'

export type {
  // App-specific types (not re-exports that conflict with mdxui)
  AppFeatures,
  AppPlatform,
  AppStatus,
  AppConfig,
  AppAuthConfig,
  AppTheme,
  ShellConfig,
  AppComponents,
  DashboardMetric,
  DashboardLayout,
  WidgetType,
  ChartType,
  DashboardWidget,
  APIKeyConfig,
  WebhookConfig,
  UsageMetrics,
  BillingConfig,
  AppInvoice,
  AppType,
} from './app'

// Content types (mdxld/mdxdb - URL-based filesystem)
export * from './content'

// Startup types (sb - ICP, Persona, Hypothesis, Canvas, etc.)
export * from './startup'

// Function types (DO-specific Fn<Out,In,Opts> pattern) - kept for backwards compatibility
export * from './functions'

// Cascade types (11-stage generative workflow)
export * from './cascade'

// Git types (content/code sync with git)
export * from './git'

// Financial types (Stripe Connect, accounting, P&L)
export * from './financial'

// Domain types (subdomains, DNS, SSL, routing)
export * from './domains'

// Communication types (email, Slack, Discord, Teams)
export * from './communication'

// Integration types (deep vs generic integrations)
export * from './integrations'

// Telephony types (phone, SMS, calls)
export * from './telephony'

// Voice AI types (conversational voice agents)
export * from './voice-ai'

// AI types (unified generative AI abstraction)
export * from './ai'

// Context types ($ - the runtime context) - DO-specific implementation
export * from './context'

// Business/SaaS/Service/Tenant types
export * from './business'

// SaaS types - exclude types that conflict with ./financial (Invoice, InvoiceLineItem) and ./tenant (TenantSettings, TenantStatus, isTenantActive)
export {
  type TenantIsolationLevel,
  type SaaSDO,
  type SaaSSettings,
  type SaaSMetrics,
  type Tenant,
  type Plan,
  type PlanLimits,
  type Feature,
  type Subscription as SaaSSubscription,
  type Invoice as SaaSInvoice,
  type InvoiceLineItem as SaaSInvoiceLineItem,
  type UsageRecord,
  type RateLimitConfig,
  type RateLimitStatus,
  type SaaSCollections,
  type CreateTenantOptions,
  type TenantProvisionResult,
  type MeterUsageOptions,
  type FeatureCheckResult,
  type SaaSRPCMethods,
  type SaaSCDCEvent,
  type TenantSettings as SaaSTenantSettings,
  type TenantStatus as SaaSTenantStatus,
  isSaaSDO,
  isTenantActive as isSaaSTenantActive,
  isTenantBillable,
  isFeatureEnabled,
} from './saas'

export * from './service'

// Tenant types - these are the canonical Tenant DO types
export * from './tenant'
