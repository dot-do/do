/**
 * MDXUI Type Re-exports and Adapters
 *
 * DO entities ARE the props for MDXUI components.
 * This file re-exports MDXUI Zod schemas for use in DO.
 *
 * Key insight: Instead of reinventing types, we reuse MDXUI's
 * well-designed, feature-based composition patterns.
 *
 * Usage:
 * ```typescript
 * import { AppPropsSchema, SitePropsSchema, DashboardPropsSchema } from 'do/types/mdxui'
 * ```
 *
 * @see https://mdxui.dev for component documentation
 */

// =============================================================================
// NOTE: These are reference types for the MDXUI package.
// In production, import directly from 'mdxui' or 'mdxui/app', 'mdxui/site'.
// These local definitions ensure DO types align with MDXUI expectations.
// =============================================================================

import { z } from 'zod'

// =============================================================================
// Common Schemas (from mdxui/common)
// =============================================================================

/**
 * Navigation item schema - used in headers, sidebars, etc.
 */
export interface NavItem {
  label: string
  href: string
  icon?: string
  description?: string
  children?: NavItem[]
}

export const NavItemSchema: z.ZodType<NavItem> = z.object({
  label: z.string(),
  href: z.string(),
  icon: z.string().optional(),
  description: z.string().optional(),
  children: z.lazy(() => z.array(NavItemSchema)).optional(),
})

/**
 * Theme mode options
 */
export const ThemeModeSchema = z.enum(['light', 'dark', 'system'])
export type ThemeMode = z.infer<typeof ThemeModeSchema>

/**
 * Action configuration for behavior props
 */
export const ActionConfigSchema = z.object({
  kind: z.literal('config').optional(),
  href: z.string(),
  onClick: z.function().optional(),
  target: z.enum(['_blank', '_self']).optional(),
})

export type ActionConfig = z.infer<typeof ActionConfigSchema>

/**
 * Action prop - string shorthand or full config
 */
export const ActionPropSchema = z.union([z.string(), ActionConfigSchema])
export type ActionProp = z.infer<typeof ActionPropSchema>

/**
 * Standard actions object for primary/secondary CTAs
 */
export const ActionsPropsSchema = z.object({
  primary: ActionPropSchema.optional(),
  secondary: ActionPropSchema.optional(),
})

export type ActionsProps = z.infer<typeof ActionsPropsSchema>

/**
 * Auto-wire configuration - maps components to Platform.do collections
 */
export interface AutoWire {
  collection: string
  defaultQuery?: {
    where?: Record<string, unknown>
    limit?: number
    sort?: string
  }
}

// =============================================================================
// App Schemas (from mdxui/app)
// =============================================================================

/**
 * Base App schema - foundation for all app types
 */
export const BaseAppSchema = z.object({
  name: z.string().describe('Display name of the application'),
  description: z.string().optional().describe('Brief description of the application'),
  defaultViews: z.array(z.string()).optional().describe('Default views/pages to include'),
  defaultPanels: z.array(z.string()).optional().describe('Default panels/widgets to display'),
  navigation: z.array(NavItemSchema).optional().describe('Navigation items for sidebar'),
  shell: z
    .object({
      sidebar: z.boolean().default(true),
      header: z.boolean().default(true),
      sidebarCollapsed: z.boolean().default(false),
    })
    .optional(),
  theme: z
    .object({
      preset: z.string().optional(),
      mode: ThemeModeSchema.optional(),
      custom: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
})

export type BaseApp = z.infer<typeof BaseAppSchema>

/**
 * Auth provider options
 */
export const AuthProviderSchema = z.enum(['workos', 'clerk', 'auth0', 'custom'])
export type AuthProvider = z.infer<typeof AuthProviderSchema>

/**
 * App root container props
 */
export const AppPropsSchema = z.object({
  name: z.string(),
  auth: z
    .object({
      provider: AuthProviderSchema,
      clientId: z.string().optional(),
      loginUrl: z.string().optional(),
      redirectUri: z.string().optional(),
    })
    .optional(),
  children: z.any().optional(),
})

export type AppProps = z.infer<typeof AppPropsSchema>

/**
 * Shell props - app layout
 */
export const ShellPropsSchema = z.object({
  sidebar: z.boolean().default(true),
  header: z.boolean().default(true),
  sidebarCollapsed: z.boolean().default(false),
  children: z.any().optional(),
})

export type ShellProps = z.infer<typeof ShellPropsSchema>

/**
 * Dashboard props
 */
export const DashboardPropsSchema = z.object({
  title: z.string().optional(),
  metrics: z
    .array(
      z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
        change: z.number().optional(),
        trend: z.enum(['up', 'down', 'neutral']).optional(),
      })
    )
    .optional(),
  children: z.any().optional(),
})

export type DashboardProps = z.infer<typeof DashboardPropsSchema>

/**
 * Dashboard identity/auth configuration
 */
export const DashboardIdentitySchema = z.object({
  clientId: z.string(),
  apiHostname: z.string().optional(),
  devMode: z.boolean().default(false),
  redirectUri: z.string().optional(),
  useMockWidgets: z.boolean().default(false),
  required: z.boolean().default(true),
  onUnauthenticated: z.enum(['redirect', 'landing', 'allow']).default('landing'),
})

export type DashboardIdentity = z.infer<typeof DashboardIdentitySchema>

/**
 * Dashboard branding
 */
export const DashboardBrandingSchema = z.object({
  name: z.string().optional(),
  logo: z.any().optional(),
})

export type DashboardBranding = z.infer<typeof DashboardBrandingSchema>

/**
 * Dashboard routes toggle
 */
export const DashboardRoutesSchema = z.object({
  overview: z.boolean().default(true),
  requests: z.boolean().default(true),
  keys: z.boolean().default(true),
  team: z.boolean().default(true),
  billing: z.boolean().default(true),
  settings: z.boolean().default(true),
  webhooks: z.boolean().default(false),
  database: z.boolean().default(false),
  integrations: z.boolean().default(false),
  vault: z.boolean().default(false),
})

export type DashboardRoutes = z.infer<typeof DashboardRoutesSchema>

/**
 * Custom route schema
 */
export const CustomRouteSchema = z.object({
  path: z.string(),
  label: z.string(),
  icon: z.string().optional(),
  element: z.any(),
  group: z.enum(['main', 'secondary', 'admin']).default('main'),
  order: z.number().optional(),
  index: z.boolean().optional(),
})

export type CustomRoute = z.infer<typeof CustomRouteSchema>

/**
 * Developer Dashboard props
 */
export const DeveloperDashboardPropsSchema = z.object({
  basePath: z.string().default('/'),
  branding: DashboardBrandingSchema.optional(),
  routes: DashboardRoutesSchema.optional(),
  customRoutes: z.array(CustomRouteSchema).optional(),
  theme: z
    .object({
      preset: z.string().optional(),
      mode: ThemeModeSchema.optional(),
      custom: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  identity: DashboardIdentitySchema.optional(),
  devToken: z.string().optional(),
  debug: z.boolean().optional(),
})

export type DeveloperDashboardProps = z.infer<typeof DeveloperDashboardPropsSchema>

// =============================================================================
// Site Schemas (from mdxui/site)
// =============================================================================

/**
 * Site root container props
 */
export const SitePropsSchema = z.object({
  name: z.string(),
  domain: z.string().optional(),
  theme: ThemeModeSchema.default('system'),
  children: z.any(),
})

export type SiteProps = z.infer<typeof SitePropsSchema>

/**
 * Header props
 */
export const HeaderPropsSchema = z.object({
  logo: z.any(),
  nav: z.array(NavItemSchema),
  callToAction: z.string().optional(),
  actions: ActionsPropsSchema.optional(),
  LinkComponent: z.any().optional(),
})

export type HeaderProps = z.infer<typeof HeaderPropsSchema>

/**
 * Footer link group
 */
export const FooterLinkGroupSchema = z.object({
  title: z.string(),
  links: z.array(
    z.object({
      label: z.string(),
      href: z.string(),
    })
  ),
})

/**
 * Footer props
 */
export const FooterPropsSchema = z.object({
  logo: z.any(),
  links: z.array(FooterLinkGroupSchema),
  social: z
    .array(
      z.object({
        platform: z.string(),
        href: z.string(),
        icon: z.any().optional(),
      })
    )
    .optional(),
  copyright: z.string().optional(),
  newsletter: z
    .object({
      headline: z.string(),
      subheadline: z.string(),
    })
    .optional(),
})

export type FooterProps = z.infer<typeof FooterPropsSchema>

/**
 * Landing page props
 */
export const LandingPagePropsSchema = z.object({
  children: z.any(),
})

export type LandingPageProps = z.infer<typeof LandingPagePropsSchema>

/**
 * Generic page props
 */
export const PagePropsSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  children: z.any(),
})

export type PageProps = z.infer<typeof PagePropsSchema>

// =============================================================================
// Section Schemas (from mdxui/site/props/sections)
// =============================================================================

/**
 * Hero section props
 */
export const HeroPropsSchema = z.object({
  title: z.string().describe('Main hero headline'),
  subtitle: z.string().optional().describe('Supporting subheadline'),
  badge: z.string().optional().describe('Badge or tag above headline'),
  callToAction: z.string().describe('Primary button text'),
  secondaryCallToAction: z.string().optional().describe('Secondary button text'),
  variant: z.enum(['default', 'centered', 'split', 'code-below', 'video-beside', 'image-split']).default('default'),
  image: z.string().optional(),
  video: z.string().optional(),
  screenshot: z.string().optional(),
  code: z
    .object({
      language: z.string(),
      code: z.string(),
    })
    .optional(),
  actions: ActionsPropsSchema.optional(),
})

export type HeroProps = z.infer<typeof HeroPropsSchema>

/**
 * Feature item schema
 */
export const FeatureItemSchema = z.object({
  title: z.string().describe('Feature name or title'),
  description: z.string().describe('Feature description'),
  icon: z.any().optional(),
  actions: z.object({ link: ActionPropSchema.optional() }).optional(),
})

export type FeatureItem = z.infer<typeof FeatureItemSchema>

/**
 * Features section props
 */
export const FeaturesPropsSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  features: z.array(FeatureItemSchema),
  variant: z.enum(['grid', 'list', 'bento']).default('grid'),
  columns: z.number().default(3),
})

export type FeaturesProps = z.infer<typeof FeaturesPropsSchema>

/**
 * Pricing tier schema
 */
export const PricingTierSchema = z.object({
  name: z.string().describe('Tier name like "Starter", "Pro", "Enterprise"'),
  price: z.string().describe('Price display string'),
  description: z.string().optional(),
  features: z.array(z.string()),
  callToAction: z.string(),
  highlighted: z.boolean().default(false),
  actions: ActionsPropsSchema.optional(),
})

export type PricingTier = z.infer<typeof PricingTierSchema>

/**
 * Pricing section props
 */
export const PricingPropsSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tiers: z.array(PricingTierSchema),
  showToggle: z.boolean().default(false),
  variant: z.enum(['cards', 'comparison-table', 'toggle']).default('cards'),
})

export type PricingProps = z.infer<typeof PricingPropsSchema>

/**
 * Testimonial schema
 */
export const TestimonialSchema = z.object({
  quote: z.string(),
  author: z.string(),
  title: z.string().optional(),
  company: z.string().optional(),
  avatar: z.string().optional(),
})

export type Testimonial = z.infer<typeof TestimonialSchema>

/**
 * Testimonials section props
 */
export const TestimonialsPropsSchema = z.object({
  title: z.string().optional(),
  testimonials: z.array(TestimonialSchema),
  variant: z.enum(['grid', 'carousel', 'masonry']).default('grid'),
})

export type TestimonialsProps = z.infer<typeof TestimonialsPropsSchema>

/**
 * FAQ item schema
 */
export const FAQItemSchema = z.object({
  question: z.string(),
  answer: z.string(),
})

export type FAQItem = z.infer<typeof FAQItemSchema>

/**
 * FAQ section props
 */
export const FAQPropsSchema = z.object({
  title: z.string().optional(),
  items: z.array(FAQItemSchema),
  variant: z.enum(['accordion', 'grid', 'list']).default('accordion'),
})

export type FAQProps = z.infer<typeof FAQPropsSchema>

/**
 * CTA section props
 */
export const CTASectionPropsSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  callToAction: z.string(),
  secondaryCallToAction: z.string().optional(),
  variant: z.enum(['simple', 'split', 'centered']).default('centered'),
  actions: ActionsPropsSchema.optional(),
})

export type CTASectionProps = z.infer<typeof CTASectionPropsSchema>

/**
 * Stat item schema
 */
export const StatItemSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  description: z.string().optional(),
})

export type StatItem = z.infer<typeof StatItemSchema>

/**
 * Stats section props
 */
export const StatsPropsSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  stats: z.array(StatItemSchema),
  variant: z.enum(['simple', 'with-description', 'with-graph']).default('simple'),
})

export type StatsProps = z.infer<typeof StatsPropsSchema>

/**
 * Team member schema
 */
export const TeamMemberSchema = z.object({
  name: z.string(),
  role: z.string(),
  bio: z.string().optional(),
  avatar: z.string().optional(),
  social: z.record(z.string(), z.string()).optional(),
})

export type TeamMember = z.infer<typeof TeamMemberSchema>

/**
 * Team section props
 */
export const TeamSectionPropsSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  members: z.array(TeamMemberSchema),
  variant: z.enum(['grid', 'list', 'cards']).default('grid'),
  columns: z.number().default(3),
})

export type TeamSectionProps = z.infer<typeof TeamSectionPropsSchema>

/**
 * Logo item schema
 */
export const LogoItemSchema = z.object({
  name: z.string(),
  src: z.string(),
  href: z.string().optional(),
})

export type LogoItem = z.infer<typeof LogoItemSchema>

/**
 * Logos section props
 */
export const LogosPropsSchema = z.object({
  title: z.string().optional(),
  logos: z.array(LogoItemSchema),
  variant: z.enum(['simple', 'cards', 'carousel']).default('simple'),
})

export type LogosProps = z.infer<typeof LogosPropsSchema>

// =============================================================================
// App Type Schemas (18 app types from mdxui)
// =============================================================================

/**
 * Dashboard app configuration
 */
export const DashboardAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      metrics: z.array(z.string()).default(['revenue', 'users', 'growth', 'retention']),
      defaultPeriod: z.enum(['hour', 'day', 'week', 'month', 'quarter', 'year']).default('month'),
      realtime: z.boolean().default(false),
      charts: z.array(z.string()).optional(),
    })
    .optional(),
})

export type DashboardApp = z.infer<typeof DashboardAppSchema>

/**
 * Developer app configuration
 */
export const DeveloperAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      showAPIKeys: z.boolean().default(true),
      showWebhooks: z.boolean().default(true),
      showUsage: z.boolean().default(true),
      showLogs: z.boolean().default(true),
      showDocs: z.boolean().default(true),
      apiBaseUrl: z.string().optional(),
      apiVersions: z.array(z.string()).optional(),
    })
    .optional(),
})

export type DeveloperApp = z.infer<typeof DeveloperAppSchema>

/**
 * Admin app configuration
 */
export const AdminAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      collections: z.array(z.string()).default(['users', 'roles', 'permissions']),
      showUsers: z.boolean().default(true),
      showRoles: z.boolean().default(true),
      showAuditLogs: z.boolean().default(true),
      showSettings: z.boolean().default(true),
      enableBulkOps: z.boolean().default(true),
    })
    .optional(),
})

export type AdminApp = z.infer<typeof AdminAppSchema>

/**
 * SaaS app configuration
 */
export const SaaSAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      multiTenant: z.boolean().default(true),
      showWorkspaceSwitcher: z.boolean().default(true),
      showBilling: z.boolean().default(true),
      showTeam: z.boolean().default(true),
      showIntegrations: z.boolean().default(true),
      pricingTiers: z.array(z.string()).optional(),
      features: z.record(z.string(), z.boolean()).optional(),
    })
    .optional(),
})

export type SaaSApp = z.infer<typeof SaaSAppSchema>

/**
 * Data app configuration
 */
export const DataAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      showDatasets: z.boolean().default(true),
      showSources: z.boolean().default(true),
      showPipelines: z.boolean().default(true),
      showQueryExplorer: z.boolean().default(true),
      showQuality: z.boolean().default(true),
      sourceTypes: z.array(z.string()).optional(),
      maxDatasetSize: z.string().optional(),
    })
    .optional(),
})

export type DataApp = z.infer<typeof DataAppSchema>

/**
 * Headless app configuration
 */
export const HeadlessAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      showMCPServers: z.boolean().default(true),
      showAgents: z.boolean().default(true),
      showPlayground: z.boolean().default(true),
      showSchema: z.boolean().default(true),
      graphqlEndpoint: z.string().optional(),
      restEndpoint: z.string().optional(),
      protocols: z.array(z.enum(['rest', 'graphql', 'grpc', 'websocket'])).optional(),
    })
    .optional(),
})

export type HeadlessApp = z.infer<typeof HeadlessAppSchema>

/**
 * CRM app configuration
 */
export const CRMAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      showContacts: z.boolean().default(true),
      showCompanies: z.boolean().default(true),
      showDeals: z.boolean().default(true),
      showPipeline: z.boolean().default(true),
      showActivities: z.boolean().default(true),
      showEmail: z.boolean().default(false),
      pipelineStages: z.array(z.string()).optional(),
      currency: z.string().default('USD'),
    })
    .optional(),
})

export type CRMApp = z.infer<typeof CRMAppSchema>

/**
 * Booking app configuration
 */
export const BookingAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      showCalendar: z.boolean().default(true),
      showAppointments: z.boolean().default(true),
      showAvailability: z.boolean().default(true),
      showBookingPages: z.boolean().default(true),
      enableReminders: z.boolean().default(true),
      enableWaitingList: z.boolean().default(false),
      durationOptions: z.array(z.number()).default([15, 30, 45, 60]),
      timezone: z.string().optional(),
    })
    .optional(),
})

export type BookingApp = z.infer<typeof BookingAppSchema>

/**
 * Support app configuration
 */
export const SupportAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      showInbox: z.boolean().default(true),
      showTickets: z.boolean().default(true),
      showKnowledgeBase: z.boolean().default(true),
      showLiveChat: z.boolean().default(false),
      showCustomers: z.boolean().default(true),
      ticketStatuses: z.array(z.string()).default(['open', 'pending', 'resolved', 'closed']),
      ticketPriorities: z.array(z.string()).default(['low', 'medium', 'high', 'urgent']),
      enableSLA: z.boolean().default(false),
    })
    .optional(),
})

export type SupportApp = z.infer<typeof SupportAppSchema>

/**
 * Agency app configuration
 */
export const AgencyAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      showClients: z.boolean().default(true),
      showProjects: z.boolean().default(true),
      showTasks: z.boolean().default(true),
      showTimeTracking: z.boolean().default(true),
      showInvoicing: z.boolean().default(true),
      showProposals: z.boolean().default(false),
      projectStatuses: z.array(z.string()).default(['planning', 'active', 'on-hold', 'completed']),
      timeTrackingMethod: z.enum(['manual', 'timer', 'both']).default('both'),
    })
    .optional(),
})

export type AgencyApp = z.infer<typeof AgencyAppSchema>

/**
 * Ops app configuration
 */
export const OpsAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      showIncidents: z.boolean().default(true),
      showMonitoring: z.boolean().default(true),
      showOnCall: z.boolean().default(true),
      showStatusPage: z.boolean().default(true),
      showPostmortems: z.boolean().default(false),
      severityLevels: z.array(z.string()).default(['sev1', 'sev2', 'sev3', 'sev4']),
      alertChannels: z.array(z.string()).optional(),
      enableAutoEscalation: z.boolean().default(true),
    })
    .optional(),
})

export type OpsApp = z.infer<typeof OpsAppSchema>

/**
 * Agent app configuration
 */
export const AgentAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      showAgents: z.boolean().default(true),
      showMCPTools: z.boolean().default(true),
      showPrompts: z.boolean().default(true),
      showRuns: z.boolean().default(true),
      showTrainingData: z.boolean().default(false),
      modelProviders: z.array(z.string()).optional(),
      agentTypes: z.array(z.string()).optional(),
      enablePlayground: z.boolean().default(true),
    })
    .optional(),
})

export type AgentApp = z.infer<typeof AgentAppSchema>

/**
 * Workflow app configuration
 */
export const WorkflowAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      showWorkflows: z.boolean().default(true),
      showBuilder: z.boolean().default(true),
      showRuns: z.boolean().default(true),
      showIntegrations: z.boolean().default(true),
      showTemplates: z.boolean().default(true),
      triggers: z.array(z.string()).optional(),
      actions: z.array(z.string()).optional(),
      enableVisualBuilder: z.boolean().default(true),
    })
    .optional(),
})

export type WorkflowApp = z.infer<typeof WorkflowAppSchema>

/**
 * Infra app configuration
 */
export const InfraAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      showCompute: z.boolean().default(true),
      showStorage: z.boolean().default(true),
      showNetwork: z.boolean().default(true),
      showDatabases: z.boolean().default(true),
      showMonitoring: z.boolean().default(true),
      showCosts: z.boolean().default(true),
      cloudProviders: z.array(z.string()).optional(),
      enableIaC: z.boolean().default(false),
    })
    .optional(),
})

export type InfraApp = z.infer<typeof InfraAppSchema>

/**
 * Platform app configuration
 */
export const PlatformAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      showApps: z.boolean().default(true),
      showDeployments: z.boolean().default(true),
      showEnvironments: z.boolean().default(true),
      showServices: z.boolean().default(true),
      showPipelines: z.boolean().default(true),
      showObservability: z.boolean().default(true),
      environments: z.array(z.string()).default(['development', 'staging', 'production']),
      enableGitOps: z.boolean().default(false),
    })
    .optional(),
})

export type PlatformApp = z.infer<typeof PlatformAppSchema>

/**
 * Client Portal app configuration
 */
export const ClientPortalAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      showProjects: z.boolean().default(true),
      showInvoices: z.boolean().default(true),
      showDeliverables: z.boolean().default(true),
      showMessages: z.boolean().default(true),
      showSupport: z.boolean().default(false),
      enableFeedback: z.boolean().default(true),
      enableUploads: z.boolean().default(true),
      customBranding: z.boolean().default(true),
    })
    .optional(),
})

export type ClientPortalApp = z.infer<typeof ClientPortalAppSchema>

/**
 * VibeCode app configuration
 */
export const VibeCodeAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      showChat: z.boolean().default(true),
      showPreview: z.boolean().default(true),
      showCode: z.boolean().default(true),
      defaultLayout: z.enum(['horizontal', 'vertical', 'grid']).default('horizontal'),
      enableAIGeneration: z.boolean().default(true),
      enableLivePreview: z.boolean().default(true),
      languages: z.array(z.string()).optional(),
      editorThemes: z.array(z.string()).optional(),
    })
    .optional(),
})

export type VibeCodeApp = z.infer<typeof VibeCodeAppSchema>

/**
 * Mail app configuration
 */
export const MailAppSchema = BaseAppSchema.extend({
  config: z
    .object({
      showInbox: z.boolean().default(true),
      showSent: z.boolean().default(true),
      showDrafts: z.boolean().default(true),
      showSpam: z.boolean().default(true),
      showTrash: z.boolean().default(true),
      showArchive: z.boolean().default(true),
      showStarred: z.boolean().default(true),
      showSnoozed: z.boolean().default(true),
      showScheduled: z.boolean().default(true),
      enableAICompose: z.boolean().default(true),
      enableAIReply: z.boolean().default(true),
      enableAISummarize: z.boolean().default(true),
      enableThreading: z.boolean().default(true),
      enableLabels: z.boolean().default(true),
      enableSnooze: z.boolean().default(true),
      enableScheduling: z.boolean().default(true),
      folders: z.array(z.string()).default(['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive']),
      maxAttachmentSize: z.number().optional(),
      providers: z.array(z.string()).optional(),
    })
    .optional(),
})

export type MailApp = z.infer<typeof MailAppSchema>

// =============================================================================
// Union of all app type schemas
// =============================================================================

export const AppTypeSchema = z.union([
  DashboardAppSchema,
  DeveloperAppSchema,
  AdminAppSchema,
  SaaSAppSchema,
  DataAppSchema,
  HeadlessAppSchema,
  CRMAppSchema,
  BookingAppSchema,
  SupportAppSchema,
  AgencyAppSchema,
  OpsAppSchema,
  AgentAppSchema,
  WorkflowAppSchema,
  InfraAppSchema,
  PlatformAppSchema,
  ClientPortalAppSchema,
  VibeCodeAppSchema,
  MailAppSchema,
])

export type AppTypeConfig =
  | DashboardApp
  | DeveloperApp
  | AdminApp
  | SaaSApp
  | DataApp
  | HeadlessApp
  | CRMApp
  | BookingApp
  | SupportApp
  | AgencyApp
  | OpsApp
  | AgentApp
  | WorkflowApp
  | InfraApp
  | PlatformApp
  | ClientPortalApp
  | VibeCodeApp
  | MailApp

/**
 * App type name literals (for type switching)
 */
export type AppTypeName =
  | 'dashboard'
  | 'developer'
  | 'admin'
  | 'saas'
  | 'data'
  | 'headless'
  | 'crm'
  | 'booking'
  | 'support'
  | 'agency'
  | 'ops'
  | 'agent'
  | 'workflow'
  | 'infra'
  | 'platform'
  | 'clientPortal'
  | 'vibeCode'
  | 'mail'
