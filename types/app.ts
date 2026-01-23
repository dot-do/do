/**
 * App Types - SaaS applications, dashboards, admin panels
 *
 * THESE TYPES ARE THE PROPS FOR MDXUI COMPONENTS.
 *
 * DO entities map directly to MDXUI component props. Instead of using a fixed
 * AppType enum, we use feature-based composition where each app declares which
 * features it includes (showAPIKeys, showBilling, showTeam, etc.).
 *
 * This aligns with MDXUI's 18 app type schemas which each extend BaseApp with
 * their own feature configuration.
 *
 * @see mdxui/app for component implementations
 * @see ./mdxui.ts for Zod schemas
 */

import type { DigitalObjectIdentity, DigitalObjectRef } from './identity'
import type {
  AppTypeName,
  BaseApp,
  DashboardApp,
  DeveloperApp,
  AdminApp,
  SaaSApp,
  DataApp,
  HeadlessApp,
  CRMApp,
  BookingApp,
  SupportApp,
  AgencyApp,
  OpsApp,
  AgentApp,
  WorkflowApp,
  InfraApp,
  PlatformApp,
  ClientPortalApp,
  VibeCodeApp,
  MailApp,
  NavItem,
  ThemeMode,
  AuthProvider,
  DashboardIdentity,
  DashboardRoutes,
  CustomRoute,
} from './mdxui'

// Re-export MDXUI types for convenience
export type {
  AppTypeName,
  BaseApp,
  DashboardApp,
  DeveloperApp,
  AdminApp,
  SaaSApp,
  DataApp,
  HeadlessApp,
  CRMApp,
  BookingApp,
  SupportApp,
  AgencyApp,
  OpsApp,
  AgentApp,
  WorkflowApp,
  InfraApp,
  PlatformApp,
  ClientPortalApp,
  VibeCodeApp,
  MailApp,
  NavItem,
  ThemeMode,
  AuthProvider,
  DashboardIdentity,
  DashboardRoutes,
  CustomRoute,
}

// =============================================================================
// App Feature Composition (replaces fixed AppType enum)
// =============================================================================

/**
 * Feature flags for app capabilities.
 * Instead of a fixed enum, apps declare which features they include.
 * This enables flexible composition - an app can be a CRM with Developer features.
 */
export interface AppFeatures {
  // Developer features
  apiKeys?: boolean
  webhooks?: boolean
  apiDocs?: boolean
  usage?: boolean
  logs?: boolean

  // Admin features
  users?: boolean
  roles?: boolean
  permissions?: boolean
  auditLogs?: boolean

  // SaaS features
  workspaces?: boolean
  billing?: boolean
  team?: boolean
  integrations?: boolean

  // CRM features
  contacts?: boolean
  companies?: boolean
  deals?: boolean
  pipeline?: boolean
  activities?: boolean

  // Support features
  tickets?: boolean
  inbox?: boolean
  knowledgeBase?: boolean
  liveChat?: boolean

  // Booking features
  calendar?: boolean
  appointments?: boolean
  availability?: boolean

  // Analytics features
  dashboard?: boolean
  metrics?: boolean
  charts?: boolean
  reports?: boolean

  // Content features
  blog?: boolean
  docs?: boolean
  pages?: boolean

  // AI features
  agents?: boolean
  mcpTools?: boolean
  prompts?: boolean
  playground?: boolean

  // Workflow features
  workflows?: boolean
  builder?: boolean
  automations?: boolean

  // Infrastructure features
  compute?: boolean
  storage?: boolean
  network?: boolean
  databases?: boolean

  // Platform features
  apps?: boolean
  deployments?: boolean
  environments?: boolean
  services?: boolean

  // Mail features
  mail?: boolean
  compose?: boolean
  threading?: boolean
  scheduling?: boolean
}

// =============================================================================
// App Platform & Status
// =============================================================================

/**
 * App platform targets
 */
export type AppPlatform = 'web' | 'ios' | 'android' | 'macos' | 'windows' | 'linux'

/**
 * App lifecycle status
 */
export type AppStatus = 'Development' | 'Alpha' | 'Beta' | 'Stable' | 'Deprecated' | 'Sunset'

// =============================================================================
// App Configuration (DO Entity)
// =============================================================================

/**
 * App configuration - a DO entity that IS the props for MDXUI App components.
 *
 * Instead of a fixed appType enum, uses:
 * - `type`: Optional app type name for presets (matches MDXUI's 18 types)
 * - `features`: Feature flags for fine-grained composition
 * - `config`: Type-specific configuration (from MDXUI schemas)
 */
export interface AppConfig extends DigitalObjectIdentity {
  $type: 'App'

  // --- Core Identity ---
  /** App name (required by MDXUI) */
  name: string
  /** App description */
  description?: string
  /** App URL */
  url?: string
  /** App version */
  version?: string

  // --- Feature Composition ---
  /**
   * Optional preset type - matches MDXUI's 18 app types.
   * Provides sensible defaults for features and config.
   * Can be overridden by explicit features/config.
   */
  type?: AppTypeName
  /**
   * Feature flags - explicit opt-in to capabilities.
   * When type is set, features default to type's preset but can be overridden.
   */
  features?: AppFeatures

  // --- MDXUI Configuration ---
  /**
   * Type-specific config - matches MDXUI app type schemas.
   * The structure depends on `type`:
   * - dashboard: { metrics, defaultPeriod, realtime, charts }
   * - developer: { showAPIKeys, showWebhooks, apiBaseUrl, ... }
   * - admin: { collections, showUsers, showRoles, ... }
   * - etc.
   */
  config?: Record<string, unknown>
  /** Default views/pages to include */
  defaultViews?: string[]
  /** Default panels/widgets to display */
  defaultPanels?: string[]
  /** Navigation items */
  navigation?: NavItem[]

  // --- Auth & Identity ---
  /** Authentication configuration */
  auth?: AppAuthConfig
  /** Dashboard identity config (for DeveloperDashboard) */
  identity?: DashboardIdentity
  /** Dashboard routes toggle */
  routes?: DashboardRoutes
  /** Custom routes */
  customRoutes?: CustomRoute[]

  // --- Theme & Shell ---
  /** Theme configuration */
  theme?: AppTheme
  /** Shell configuration */
  shell?: ShellConfig

  // --- Platform & Status ---
  /** Target platforms */
  platforms?: AppPlatform[]
  /** App status */
  status?: AppStatus

  // --- Relationships ---
  /** Parent startup (if part of startup) */
  startupRef?: DigitalObjectRef
}

/**
 * App authentication configuration
 */
export interface AppAuthConfig {
  /** Auth provider */
  provider?: AuthProvider
  /** Additional auth methods */
  methods?: Array<'email' | 'oauth' | 'sso' | 'api_key' | 'magic_link'>
  /** OAuth providers */
  providers?: string[]
  /** MFA enabled */
  mfa?: boolean
  /** Session timeout (seconds) */
  sessionTimeout?: number
  /** Client ID for auth provider */
  clientId?: string
  /** Login URL */
  loginUrl?: string
  /** Redirect URI after login */
  redirectUri?: string
}

/**
 * App theme configuration (matches MDXUI theme props)
 */
export interface AppTheme {
  /** Theme preset name */
  preset?: string
  /** Color mode */
  mode?: ThemeMode
  /** Primary color */
  primaryColor?: string
  /** Accent color */
  accentColor?: string
  /** Border radius */
  borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'full'
  /** Custom theme overrides */
  custom?: Record<string, string>
}

/**
 * Shell (app layout) configuration (matches MDXUI Shell props)
 */
export interface ShellConfig {
  /** Show sidebar */
  sidebar?: boolean
  /** Show header */
  header?: boolean
  /** Sidebar collapsed by default */
  sidebarCollapsed?: boolean
  /** Layout variant */
  layout?: 'sidebar' | 'topnav' | 'floating'
}

// =============================================================================
// App Components Interface (matches MDXUI AppComponents)
// =============================================================================

/**
 * AppComponents - All components an app can use.
 * This interface matches mdxui's AppComponents exactly.
 */
export interface AppComponents {
  // Layout (Required)
  App: unknown
  Shell: unknown
  Sidebar: unknown
  Header: unknown

  // Views (Required)
  Dashboard: unknown
  Settings: unknown

  // Pre-built Features (auto-wire to collections)
  DeveloperDashboard?: unknown
  APIKeys?: unknown
  Webhooks?: unknown
  Usage?: unknown
  Team?: unknown
  Billing?: unknown

  // Admin Overrides
  ListView?: unknown
  EditView?: unknown
  CreateView?: unknown
}

// =============================================================================
// Dashboard Props (matches MDXUI DashboardProps)
// =============================================================================

/**
 * Metric item for dashboard display
 */
export interface DashboardMetric {
  label: string
  value: string | number
  change?: number
  trend?: 'Up' | 'Down' | 'Neutral'
}

/**
 * Dashboard props - matches MDXUI DashboardPropsSchema
 */
export interface DashboardProps {
  title?: string
  metrics?: DashboardMetric[]
  children?: unknown
}

/**
 * Dashboard layout configuration
 */
export type DashboardLayout = 'grid' | 'freeform' | 'responsive'

/**
 * Dashboard widget types
 */
export type WidgetType = 'chart' | 'metric' | 'table' | 'list' | 'map' | 'timeline' | 'custom'

/**
 * Chart types
 */
export type ChartType = 'line' | 'bar' | 'pie' | 'funnel' | 'scatter' | 'area' | 'donut'

/**
 * Dashboard widget configuration
 */
export interface DashboardWidget {
  id?: string
  type: WidgetType
  name: string
  chartType?: ChartType
  position?: { x: number; y: number; w: number; h: number }
  config?: Record<string, unknown>
  dataSource?: string
  refreshInterval?: number
}

// =============================================================================
// Developer Features
// =============================================================================

/**
 * API Key configuration
 */
export interface APIKeyConfig {
  id: string
  name: string
  key: string
  prefix: string
  permissions: string[]
  rateLimit?: number
  expiresAt?: number
  createdAt: number
  lastUsedAt?: number
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  id: string
  name?: string
  url: string
  events: string[]
  secret?: string
  headers?: Record<string, string>
  enabled: boolean
  retryPolicy?: {
    maxAttempts: number
    backoff: 'linear' | 'exponential'
  }
  lastTriggeredAt?: number
  failureCount?: number
}

/**
 * Usage metrics
 */
export interface UsageMetrics {
  period: 'hour' | 'day' | 'week' | 'month'
  apiCalls: number
  bandwidth: number
  storage: number
  compute: number
  costs?: {
    total: number
    breakdown: Record<string, number>
  }
}

// =============================================================================
// Team & Billing
// =============================================================================

/**
 * Team member
 */
export interface TeamMember {
  id: string
  userId: string
  email: string
  name?: string
  role: 'Owner' | 'Admin' | 'Member' | 'Viewer'
  status: 'Active' | 'Invited' | 'Suspended'
  invitedAt?: number
  joinedAt?: number
}

/**
 * Billing configuration
 */
export interface BillingConfig {
  plan: string
  status: 'Active' | 'Trialing' | 'PastDue' | 'Canceled'
  currentPeriodStart: number
  currentPeriodEnd: number
  cancelAtPeriodEnd?: boolean
  paymentMethod?: {
    type: 'card' | 'bank' | 'paypal'
    last4?: string
    brand?: string
  }
  usage?: UsageMetrics
  invoices?: AppInvoice[]
}

export interface AppInvoice {
  id: string
  amount: number
  currency: string
  status: 'Draft' | 'Open' | 'Paid' | 'Void'
  periodStart: number
  periodEnd: number
  pdfUrl?: string
}

// =============================================================================
// App Type Defaults (for preset configurations)
// =============================================================================

/**
 * Default configurations for each app type.
 * Matches MDXUI's APP_TYPE_DEFAULTS.
 */
export const APP_TYPE_DEFAULTS: Record<
  AppTypeName,
  {
    name: string
    defaultViews: string[]
    defaultPanels: string[]
    shell: { sidebar: boolean; header: boolean }
    features: AppFeatures
  }
> = {
  dashboard: {
    name: 'Dashboard',
    defaultViews: ['overview', 'analytics', 'reports'],
    defaultPanels: ['metrics', 'charts', 'recent-activity'],
    shell: { sidebar: true, header: true },
    features: { dashboard: true, metrics: true, charts: true, reports: true },
  },
  developer: {
    name: 'Developer Portal',
    defaultViews: ['overview', 'api-keys', 'webhooks', 'usage', 'docs'],
    defaultPanels: ['api-keys', 'usage-metrics', 'recent-requests'],
    shell: { sidebar: true, header: true },
    features: { apiKeys: true, webhooks: true, apiDocs: true, usage: true, logs: true },
  },
  admin: {
    name: 'Admin Panel',
    defaultViews: ['users', 'roles', 'permissions', 'audit-logs', 'settings'],
    defaultPanels: ['user-stats', 'recent-activity', 'system-health'],
    shell: { sidebar: true, header: true },
    features: { users: true, roles: true, permissions: true, auditLogs: true },
  },
  saas: {
    name: 'SaaS Application',
    defaultViews: ['dashboard', 'workspace', 'team', 'billing', 'integrations'],
    defaultPanels: ['usage', 'team-activity', 'billing-summary'],
    shell: { sidebar: true, header: true },
    features: { dashboard: true, workspaces: true, billing: true, team: true, integrations: true },
  },
  data: {
    name: 'Data Platform',
    defaultViews: ['datasets', 'sources', 'pipelines', 'explorer', 'quality'],
    defaultPanels: ['dataset-stats', 'pipeline-status', 'data-quality'],
    shell: { sidebar: true, header: true },
    features: { databases: true, dashboard: true, charts: true },
  },
  headless: {
    name: 'Headless CMS',
    defaultViews: ['servers', 'agents', 'playground', 'schema', 'docs'],
    defaultPanels: ['api-status', 'recent-requests', 'schema-explorer'],
    shell: { sidebar: true, header: true },
    features: { apiDocs: true, playground: true, agents: true },
  },
  crm: {
    name: 'CRM',
    defaultViews: ['contacts', 'companies', 'deals', 'pipeline', 'activities'],
    defaultPanels: ['pipeline-overview', 'recent-deals', 'activities'],
    shell: { sidebar: true, header: true },
    features: { contacts: true, companies: true, deals: true, pipeline: true, activities: true },
  },
  booking: {
    name: 'Booking System',
    defaultViews: ['calendar', 'appointments', 'availability', 'booking-pages'],
    defaultPanels: ['upcoming-appointments', 'availability', 'booking-stats'],
    shell: { sidebar: true, header: true },
    features: { calendar: true, appointments: true, availability: true },
  },
  support: {
    name: 'Support Desk',
    defaultViews: ['inbox', 'tickets', 'knowledge-base', 'customers'],
    defaultPanels: ['ticket-queue', 'customer-info', 'kb-articles'],
    shell: { sidebar: true, header: true },
    features: { tickets: true, inbox: true, knowledgeBase: true },
  },
  agency: {
    name: 'Agency Management',
    defaultViews: ['clients', 'projects', 'tasks', 'time-tracking', 'invoices'],
    defaultPanels: ['project-status', 'time-entries', 'invoice-summary'],
    shell: { sidebar: true, header: true },
    features: { contacts: true, billing: true, dashboard: true },
  },
  ops: {
    name: 'Operations Console',
    defaultViews: ['incidents', 'monitoring', 'on-call', 'status-page', 'postmortems'],
    defaultPanels: ['incident-timeline', 'alert-status', 'on-call-schedule'],
    shell: { sidebar: true, header: true },
    features: { dashboard: true, metrics: true, logs: true },
  },
  agent: {
    name: 'Agent Manager',
    defaultViews: ['agents', 'tools', 'prompts', 'runs', 'playground'],
    defaultPanels: ['agent-status', 'recent-runs', 'tool-usage'],
    shell: { sidebar: true, header: true },
    features: { agents: true, mcpTools: true, prompts: true, playground: true },
  },
  workflow: {
    name: 'Workflow Automation',
    defaultViews: ['workflows', 'builder', 'runs', 'integrations', 'templates'],
    defaultPanels: ['workflow-status', 'recent-runs', 'integration-health'],
    shell: { sidebar: true, header: true },
    features: { workflows: true, builder: true, automations: true, integrations: true },
  },
  infra: {
    name: 'Infrastructure',
    defaultViews: ['compute', 'storage', 'network', 'databases', 'monitoring', 'costs'],
    defaultPanels: ['resource-usage', 'cost-breakdown', 'alerts'],
    shell: { sidebar: true, header: true },
    features: { compute: true, storage: true, network: true, databases: true },
  },
  platform: {
    name: 'Platform Console',
    defaultViews: ['apps', 'deployments', 'environments', 'services', 'pipelines'],
    defaultPanels: ['deployment-status', 'service-health', 'pipeline-runs'],
    shell: { sidebar: true, header: true },
    features: { apps: true, deployments: true, environments: true, services: true },
  },
  clientPortal: {
    name: 'Client Portal',
    defaultViews: ['projects', 'invoices', 'deliverables', 'messages'],
    defaultPanels: ['project-status', 'recent-invoices', 'new-messages'],
    shell: { sidebar: true, header: true },
    features: { billing: true, inbox: true },
  },
  vibeCode: {
    name: 'VibeCode',
    defaultViews: ['editor'],
    defaultPanels: ['chat', 'preview', 'code'],
    shell: { sidebar: false, header: true },
    features: { playground: true, agents: true },
  },
  mail: {
    name: 'Mail',
    defaultViews: ['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive', 'starred', 'settings'],
    defaultPanels: ['mail-list', 'thread-display', 'compose'],
    shell: { sidebar: true, header: true },
    features: { mail: true, compose: true, threading: true, scheduling: true },
  },
}

// =============================================================================
// Backward Compatibility - Deprecated AppType enum
// =============================================================================

/**
 * @deprecated Use AppTypeName and feature-based composition instead.
 * This enum is kept for backward compatibility.
 */
export type AppType =
  | 'DashboardApp'
  | 'DeveloperApp'
  | 'AdminApp'
  | 'CRMApp'
  | 'EcommerceApp'
  | 'ChatApp'
  | 'NotesApp'
  | 'MailApp'
  | 'CalendarApp'
  | 'KanbanApp'
  | 'WikiApp'
  | 'AnalyticsApp'
  | 'SupportApp'
  | 'BookingApp'
  | 'InvoicingApp'
  | 'ProjectApp'
  | 'FileShareApp'
