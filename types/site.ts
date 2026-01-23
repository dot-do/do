/**
 * Site Types - Marketing sites, docs, blogs, directories
 *
 * THESE TYPES ARE THE PROPS FOR MDXUI COMPONENTS.
 *
 * DO entities map directly to MDXUI component props. Instead of using a fixed
 * SiteType enum, we use feature-based composition where each site declares which
 * features it includes (blog, docs, pricing, testimonials, etc.).
 *
 * @see mdxui/site for component implementations
 * @see ./mdxui.ts for Zod schemas
 */

import type { DigitalObjectIdentity, DigitalObjectRef } from './identity'
import type {
  ThemeMode,
  NavItem,
  ActionsProps,
  ActionProp,
  SiteProps as MDXUISiteProps,
  HeaderProps as MDXUIHeaderProps,
  FooterProps as MDXUIFooterProps,
  HeroProps as MDXUIHeroProps,
  FeaturesProps as MDXUIFeaturesProps,
  PricingProps as MDXUIPricingProps,
  TestimonialsProps as MDXUITestimonialsProps,
  FAQProps as MDXUIFAQProps,
  CTASectionProps as MDXUICTASectionProps,
  StatsProps as MDXUIStatsProps,
  TeamSectionProps as MDXUITeamSectionProps,
  LogosProps as MDXUILogosProps,
  FeatureItem,
  PricingTier,
  Testimonial,
  FAQItem,
  StatItem,
  TeamMember,
  LogoItem,
} from './mdxui'

// Re-export MDXUI types for convenience
export type {
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
  FeatureItem,
  PricingTier,
  Testimonial,
  FAQItem,
  StatItem,
  TeamMember,
  LogoItem,
  NavItem,
  ActionsProps,
  ActionProp,
  ThemeMode,
}

// =============================================================================
// Site Feature Composition (replaces fixed SiteType enum)
// =============================================================================

/**
 * Feature flags for site capabilities.
 * Instead of a fixed enum, sites declare which features they include.
 * This enables flexible composition - a site can be a marketing site with docs.
 */
export interface SiteFeatures {
  // Content sections
  hero?: boolean
  features?: boolean
  pricing?: boolean
  testimonials?: boolean
  faq?: boolean
  cta?: boolean
  stats?: boolean
  team?: boolean
  logos?: boolean

  // Content types
  blog?: boolean
  docs?: boolean
  changelog?: boolean

  // Directory features
  directory?: boolean
  listings?: boolean
  search?: boolean
  filters?: boolean
  categories?: boolean

  // Interactive features
  newsletter?: boolean
  contact?: boolean
  booking?: boolean

  // SEO & Analytics
  analytics?: boolean
  seo?: boolean

  // Localization
  i18n?: boolean
  rtl?: boolean

  // Theme
  darkMode?: boolean
  customTheme?: boolean
}

/**
 * Site type name literals (for presets)
 */
export type SiteTypeName =
  | 'marketing'
  | 'docs'
  | 'blog'
  | 'directory'
  | 'portfolio'
  | 'agency'
  | 'event'
  | 'community'
  | 'marketplace'
  | 'platform'
  | 'api'
  | 'personal'
  | 'story'
  | 'landing'

// =============================================================================
// Site Configuration (DO Entity)
// =============================================================================

/**
 * Site configuration - a DO entity that IS the props for MDXUI Site components.
 */
export interface SiteConfig extends DigitalObjectIdentity {
  $type: 'Site'

  // --- Core Identity (matches MDXUI SiteProps) ---
  /** Site name (required by MDXUI) */
  name: string
  /** Primary domain (e.g., "example.com") */
  domain: string
  /** Domain aliases */
  aliases?: string[]
  /** Site description */
  description?: string

  // --- Feature Composition ---
  /**
   * Optional preset type - provides sensible defaults.
   * Can be overridden by explicit features.
   */
  type?: SiteTypeName
  /**
   * Feature flags - explicit opt-in to capabilities.
   */
  features?: SiteFeatures

  // --- Theme (matches MDXUI SiteProps) ---
  /** Theme mode */
  theme?: SiteTheme

  // --- SEO ---
  /** SEO defaults */
  seo?: SiteSEO

  // --- Navigation (matches MDXUI Header/Footer) ---
  /** Navigation structure */
  navigation?: NavigationConfig
  /** Footer configuration */
  footer?: FooterConfig

  // --- Localization ---
  /** Available locales */
  locales?: string[]
  /** Default locale */
  defaultLocale?: string

  // --- Relationships ---
  /** Parent startup (if part of startup) */
  startupRef?: DigitalObjectRef
}

/**
 * Theme configuration (matches MDXUI theme props)
 */
export interface SiteTheme {
  /** Theme preset name */
  preset?: string
  /** Color mode */
  mode?: ThemeMode
  /** Primary color */
  primaryColor?: string
  /** Secondary color */
  secondaryColor?: string
  /** Font family */
  fontFamily?: string
  /** Custom CSS */
  customCss?: string
  /** Custom theme overrides */
  custom?: Record<string, string>
}

/**
 * SEO configuration
 */
export interface SiteSEO {
  title?: string
  titleTemplate?: string
  description?: string
  keywords?: string[]
  ogImage?: string
  twitterCard?: 'summary' | 'summary_large_image'
  robots?: string
  canonical?: string
}

/**
 * Navigation configuration (for Header)
 */
export interface NavigationConfig {
  /** Logo URL or component */
  logo?: string
  /** Navigation items */
  items: NavItem[]
  /** CTA button */
  cta?: {
    label: string
    href: string
  }
}

/**
 * Footer configuration
 */
export interface FooterConfig {
  /** Footer link groups */
  links?: FooterLinkGroup[]
  /** Copyright text */
  copyright?: string
  /** Social media links */
  social?: Record<string, string>
  /** Newsletter configuration */
  newsletter?: {
    headline: string
    subheadline: string
  }
}

export interface FooterLinkGroup {
  title: string
  links: { label: string; href: string }[]
}

// =============================================================================
// Site Components Interface (matches MDXUI SiteComponents)
// =============================================================================

/**
 * SiteComponents - All components a site can use.
 * This interface matches mdxui's SiteComponents exactly.
 */
export interface SiteComponents {
  // Layout (Required)
  Site: unknown
  Header: unknown
  Footer: unknown
  LandingPage: unknown
  Page: unknown

  // Content Sections (auto-wire to collections)
  Blog?: unknown
  BlogPost?: unknown
  Docs?: unknown
  DocsPage?: unknown
  Directory?: unknown

  // Section Templates
  Hero?: unknown
  Features?: unknown
  Pricing?: unknown
  Testimonials?: unknown
  CTA?: unknown
  FAQ?: unknown
  Stats?: unknown
  Team?: unknown
  Logos?: unknown

  // Discovery Components (rich directory abstraction)
  DiscoveryHero?: unknown
  DiscoveryCard?: unknown
  DiscoveryToolbar?: unknown
  CardGrid?: unknown
  DetailHero?: unknown
  DetailSection?: unknown
  DetailActions?: unknown
  HierarchyNav?: unknown
  RelatedItems?: unknown
  DirectoryCTA?: unknown
}

// =============================================================================
// Section Props (matches MDXUI section schemas)
// =============================================================================

/**
 * Hero section props - matches MDXUI HeroPropsSchema
 */
export interface HeroProps {
  // Content (AI-generatable)
  title: string
  subtitle?: string
  badge?: string
  callToAction: string
  secondaryCallToAction?: string
  variant?: 'default' | 'centered' | 'split' | 'code-below' | 'video-beside' | 'image-split'
  image?: string
  video?: string
  screenshot?: string
  code?: {
    language: string
    code: string
  }
  // Behavior (developer-wired)
  actions?: ActionsProps
}

/**
 * Features section props - matches MDXUI FeaturesPropsSchema
 */
export interface FeaturesProps {
  title?: string
  description?: string
  features: FeatureItem[]
  variant?: 'grid' | 'list' | 'bento'
  columns?: number
}

/**
 * Pricing section props - matches MDXUI PricingPropsSchema
 */
export interface PricingProps {
  title?: string
  description?: string
  tiers: PricingTier[]
  showToggle?: boolean
  variant?: 'cards' | 'comparison-table' | 'toggle'
}

/**
 * Testimonials section props - matches MDXUI TestimonialsPropsSchema
 */
export interface TestimonialsProps {
  title?: string
  testimonials: Testimonial[]
  variant?: 'grid' | 'carousel' | 'masonry'
}

/**
 * FAQ section props - matches MDXUI FAQPropsSchema
 */
export interface FAQProps {
  title?: string
  items: FAQItem[]
  variant?: 'accordion' | 'grid' | 'list'
}

/**
 * CTA section props - matches MDXUI CTASectionPropsSchema
 */
export interface CTAProps {
  title: string
  description?: string
  callToAction: string
  secondaryCallToAction?: string
  variant?: 'simple' | 'split' | 'centered'
  actions?: ActionsProps
}

/**
 * Stats section props - matches MDXUI StatsPropsSchema
 */
export interface StatsProps {
  title?: string
  description?: string
  stats: StatItem[]
  variant?: 'simple' | 'with-description' | 'with-graph'
}

/**
 * Team section props - matches MDXUI TeamSectionPropsSchema
 */
export interface TeamSectionProps {
  title?: string
  description?: string
  members: TeamMember[]
  variant?: 'grid' | 'list' | 'cards'
  columns?: number
}

/**
 * Logos section props - matches MDXUI LogosPropsSchema
 */
export interface LogosProps {
  title?: string
  logos: LogoItem[]
  variant?: 'simple' | 'cards' | 'carousel'
}

// =============================================================================
// Site Type Defaults (for preset configurations)
// =============================================================================

/**
 * Default configurations for each site type.
 */
export const SITE_TYPE_DEFAULTS: Record<
  SiteTypeName,
  {
    name: string
    features: SiteFeatures
    defaultSections: string[]
  }
> = {
  marketing: {
    name: 'Marketing Site',
    features: {
      hero: true,
      features: true,
      pricing: true,
      testimonials: true,
      faq: true,
      cta: true,
      newsletter: true,
      analytics: true,
    },
    defaultSections: ['hero', 'features', 'pricing', 'testimonials', 'faq', 'cta'],
  },
  docs: {
    name: 'Documentation Site',
    features: {
      docs: true,
      search: true,
      darkMode: true,
    },
    defaultSections: ['docs'],
  },
  blog: {
    name: 'Blog Site',
    features: {
      blog: true,
      newsletter: true,
      darkMode: true,
    },
    defaultSections: ['blog', 'newsletter'],
  },
  directory: {
    name: 'Directory Site',
    features: {
      directory: true,
      listings: true,
      search: true,
      filters: true,
      categories: true,
    },
    defaultSections: ['hero', 'directory'],
  },
  portfolio: {
    name: 'Portfolio Site',
    features: {
      hero: true,
      features: true,
      testimonials: true,
      contact: true,
    },
    defaultSections: ['hero', 'portfolio', 'testimonials', 'contact'],
  },
  agency: {
    name: 'Agency Site',
    features: {
      hero: true,
      features: true,
      team: true,
      testimonials: true,
      pricing: true,
      contact: true,
    },
    defaultSections: ['hero', 'features', 'team', 'testimonials', 'pricing', 'contact'],
  },
  event: {
    name: 'Event Site',
    features: {
      hero: true,
      features: true,
      faq: true,
      booking: true,
    },
    defaultSections: ['hero', 'schedule', 'speakers', 'faq', 'booking'],
  },
  community: {
    name: 'Community Site',
    features: {
      hero: true,
      features: true,
      directory: true,
      newsletter: true,
    },
    defaultSections: ['hero', 'features', 'members', 'forum'],
  },
  marketplace: {
    name: 'Marketplace Site',
    features: {
      hero: true,
      directory: true,
      listings: true,
      search: true,
      filters: true,
      categories: true,
    },
    defaultSections: ['hero', 'categories', 'featured', 'listings'],
  },
  platform: {
    name: 'Platform Site',
    features: {
      hero: true,
      features: true,
      pricing: true,
      docs: true,
      blog: true,
    },
    defaultSections: ['hero', 'features', 'pricing', 'integrations', 'docs'],
  },
  api: {
    name: 'API Site',
    features: {
      hero: true,
      features: true,
      docs: true,
      pricing: true,
    },
    defaultSections: ['hero', 'features', 'docs', 'pricing'],
  },
  personal: {
    name: 'Personal Site',
    features: {
      hero: true,
      blog: true,
      contact: true,
    },
    defaultSections: ['hero', 'about', 'blog', 'contact'],
  },
  story: {
    name: 'Story Site',
    features: {
      hero: true,
      features: true,
      testimonials: true,
      cta: true,
    },
    defaultSections: ['hero', 'story', 'testimonials', 'cta'],
  },
  landing: {
    name: 'Landing Page',
    features: {
      hero: true,
      features: true,
      cta: true,
      faq: true,
    },
    defaultSections: ['hero', 'features', 'cta', 'faq'],
  },
}

// =============================================================================
// Auto-wiring Configuration (matches MDXUI siteAutoWiring)
// =============================================================================

/**
 * Auto-wire configuration for SiteComponents.
 * Maps components to their Platform.do collections.
 */
export const siteAutoWiring: Record<string, { collection: string; defaultQuery?: Record<string, unknown> }> = {
  Blog: {
    collection: 'posts',
    defaultQuery: {
      limit: 10,
      sort: '-publishedAt',
    },
  },
  BlogPost: {
    collection: 'posts',
  },
  Docs: {
    collection: 'docs',
    defaultQuery: {
      sort: 'order',
    },
  },
  DocsPage: {
    collection: 'docs',
  },
  Directory: {
    collection: 'listings',
    defaultQuery: {
      limit: 50,
      sort: '-featured,name',
    },
  },
}

// =============================================================================
// Backward Compatibility - Deprecated SiteType enum
// =============================================================================

/**
 * @deprecated Use SiteTypeName and feature-based composition instead.
 * This enum is kept for backward compatibility.
 */
export type SiteType =
  | 'MarketingSite'
  | 'DocsSite'
  | 'BlogSite'
  | 'DirectorySite'
  | 'PortfolioSite'
  | 'AgencySite'
  | 'EventSite'
  | 'CommunitySite'
  | 'MarketplaceSite'
  | 'PlatformSite'
  | 'APISite'
  | 'PersonalSite'
  | 'StorySite'
  | 'LandingSite'

/**
 * @deprecated Use ActionProp from mdxui types instead.
 */
export interface ActionConfig {
  href?: string
  onClick?: string
  target?: '_blank' | '_self'
  variant?: 'default' | 'outline' | 'ghost'
}
