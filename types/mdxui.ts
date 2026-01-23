/**
 * MDXUI Type Re-exports
 *
 * DO entities ARE the props for MDXUI components.
 * mdxui is the source of truth - we re-export from there.
 *
 * @see https://mdxui.dev for component documentation
 */

// Re-export everything from mdxui main
export * from 'mdxui'

// Re-export from subpath modules for types not in main entry
export type {
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
  AppTypeName,
} from 'mdxui/app'

// Local types that align with mdxui patterns but aren't re-exported yet
export interface FeatureItem {
  title: string
  description: string
  icon?: string
  href?: string
}

export interface NavItem {
  label: string
  href: string
  icon?: string
  children?: NavItem[]
}

export type ThemeMode = 'light' | 'dark' | 'system'

export interface ActionProp {
  label: string
  href?: string
  variant?: 'primary' | 'secondary' | 'ghost'
  icon?: string
}

export type ActionsProps = ActionProp[]

export interface Testimonial {
  quote: string
  author: string
  role?: string
  company?: string
  avatar?: string
}

export interface FAQItem {
  question: string
  answer: string
}

export interface StatItem {
  label: string
  value: string | number
  description?: string
  trend?: 'up' | 'down' | 'neutral'
}

export interface TeamMember {
  name: string
  role: string
  avatar?: string
  bio?: string
  links?: Record<string, string>
}

export interface LogoItem {
  name: string
  src: string
  href?: string
}

export type AuthProvider = 'google' | 'github' | 'email' | 'sso' | 'workos'

export type DataProvider = 'rest' | 'graphql' | 'supabase' | 'firebase'
