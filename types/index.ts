/**
 * Digital Object (DO) Type Definitions
 *
 * This module exports all types for the DO system.
 *
 * DO combines:
 * - DB4.AI (4 database paradigms)
 * - MDXDB (URL-based content filesystem)
 * - Fn<Out,In,Opts> (generative functions)
 * - 11-stage cascade (startup generation)
 * - mdxui (Site/App components)
 * - gitx (content/code sync)
 */

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

// CapnWeb RPC (schema-free RPC with hibernation)
export * from './rpc'

// Observability (events, metrics, tracing)
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

// Function types (Fn<Out,In,Opts> pattern)
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

// Context types ($ - the runtime context)
export * from './context'
