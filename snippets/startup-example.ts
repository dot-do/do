/**
 * Complete Startup DO Example
 *
 * This example demonstrates a full Startup Digital Object with:
 * - Identity and hierarchy ($id, $type, $context)
 * - Ontology-based generation (O*NET, NAICS, APQC)
 * - ICP and Persona panels
 * - Business model frameworks (Hypothesis, Lean Canvas, StoryBrand)
 * - Cascade relations for entity linking
 * - CDC streaming to parent DO
 */

import type {
  DOContext,
  DOFactory,
  DigitalObjectIdentity,
  DigitalObjectRef,
  StartupConfig,
  StartupStage,
  StartupBrand,
  Industry,
  Occupation,
  Process,
  Problem,
  Solution,
  ICP,
  PersonaPanel,
  Persona,
  PersonaType,
  Hypothesis,
  LeanCanvas,
  StoryBrand,
  Founder,
  FounderAdvantage,
  StartupMessaging,
  MessageFrame,
  RelationFieldDefinition,
  EntitySchema,
} from '../types'

// =============================================================================
// Startup DO Factory
// =============================================================================

declare const DO: DOFactory

/**
 * Create a Startup DO with full cascade support
 */
export default DO(async ($: DOContext) => {
  // ==========================================================================
  // Startup Identity
  // ==========================================================================

  // This Startup is a child of startups.studio
  const startupIdentity: StartupConfig = {
    $id: 'https://headless.ly',
    $type: 'Startup',
    $context: 'https://startups.studio',  // Parent DO for CDC streaming
    $version: 1,
    $createdAt: Date.now(),
    $updatedAt: Date.now(),

    name: 'Headless',
    subdomain: 'headless',
    domain: 'headless.ly',
    tagline: 'The developer-first headless CMS',
    description: 'API-first content management for modern web applications',
    logo: 'https://headless.ly/logo.svg',

    stage: 'pmf',
    brand: 'headless.ly',

    // Ontology references
    industryIds: ['5112'],  // NAICS: Software Publishers
    occupationIds: ['15-1252.00'],  // O*NET: Software Developers
    processIds: ['3.0'],  // APQC: Manage Product/Service Development

    dataSource: 'manual',
  }

  console.log('Startup:', startupIdentity.name)
  console.log('Context:', startupIdentity.$context)

  // ==========================================================================
  // Ontology Data (Foundation)
  // ==========================================================================

  // Industry from NAICS
  const industry: Industry = {
    id: 'naics_5112',
    code: '5112',
    title: 'Software Publishers',
    description: 'Establishments primarily engaged in computer software publishing or publishing and reproduction.',
    level: 4,
  }

  // Occupation from O*NET
  const occupation: Occupation = {
    id: 'onet_15_1252',
    code: '15-1252.00',
    title: 'Software Developers',
    description: 'Research, design, and develop computer and network software or specialized utility programs.',
    tasks: [
      'Analyze user needs and software requirements',
      'Design software or customize software for client use',
      'Develop and direct software system testing and validation procedures',
    ],
    technologies: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Git'],
  }

  // Process from APQC
  const process: Process = {
    id: 'apqc_3_0',
    code: '3.0',
    name: 'Develop and Manage Products and Services',
    description: 'Managing the development and introduction of new products and services.',
    level: 1,
    activities: [
      'Develop product/service strategy',
      'Develop products and services',
      'Manage product/service introduction',
    ],
  }

  // ==========================================================================
  // Problem/Solution (Cascade Stages 1-2)
  // ==========================================================================

  const problem: Problem = {
    id: 'problem_cms_complexity',
    taskId: 'task_content_management',
    description: 'Traditional CMS platforms are monolithic and inflexible, forcing developers to work around limitations rather than with their tools.',
    type: 'friction',
    painLevel: 8,
    frequency: 'daily',
    urgency: 'high',
    currentSolution: 'WordPress, Drupal, or custom solutions',
    rootCause: 'Tight coupling between content management and presentation layer',
    constraints: ['Legacy infrastructure', 'Non-technical content editors', 'SEO requirements'],
  }

  const solution: Solution = {
    id: 'solution_headless_cms',
    problemId: problem.id,
    description: 'A headless CMS that provides content via API, allowing developers to use any frontend framework while giving content editors a great experience.',
    approach: 'optimization',
    mechanism: 'Decouple content from presentation with a powerful API layer',
    leveragesExisting: ['REST APIs', 'GraphQL', 'Modern frontend frameworks'],
    requiredCapabilities: ['API design', 'Real-time sync', 'Content modeling'],
    technicalFeasibility: 9,
    marketReadiness: 8,
  }

  // ==========================================================================
  // ICP (Ideal Customer Profile) - Cascade Stage 3
  // ==========================================================================

  const icp: ICP = {
    id: 'icp_developer_teams',
    solutionId: solution.id,

    // "as...who" - Occupation
    as: 'Software Developers',
    asOccupationId: occupation.id,

    // "at...where" - Industry
    at: 'SaaS companies and digital agencies',
    atIndustryId: industry.id,

    // "are...doing" - Process
    are: 'Building and maintaining content-driven applications',
    areProcessId: process.id,

    // "using...what tools"
    using: 'React, Next.js, Vue, modern JavaScript frameworks',
    usingTechIds: ['react', 'nextjs', 'vue', 'typescript'],

    // "to...goal"
    to: 'Deliver fast, flexible content experiences without backend bottlenecks',

    // Company characteristics
    companySize: 'small',
    maturity: 'growth',
    budget: 'medium',

    // Psychographics
    wants: ['Full control over frontend', 'Great DX', 'Real-time preview'],
    needs: ['Content API', 'Version control', 'Collaboration tools'],
    desires: ['Modern tech stack', 'Fast iteration', 'Happy content editors'],
    fears: ['Vendor lock-in', 'Slow page loads', 'Limited customization'],
    constraints: ['Budget', 'Learning curve', 'Migration effort'],
    alternatives: ['Contentful', 'Sanity', 'Strapi', 'Custom solution'],
    vocabulary: ['headless', 'API-first', 'JAMstack', 'DX', 'SSG', 'SSR'],
    proofRequired: ['Performance benchmarks', 'Case studies', 'Migration guides'],
  }

  // ==========================================================================
  // Persona Panel - Cascade Stage 4
  // ==========================================================================

  const primaryPersona: Persona = {
    id: 'persona_lead_dev',
    icpId: icp.id,
    name: 'Lead Developer Dana',
    snapshot: 'Technical lead at a growing SaaS, responsible for architecture decisions',
    type: 'Champion',
    isNegative: false,
    trigger: 'Current CMS is slowing down development velocity',
    goal: 'Modern, flexible content infrastructure that scales',
    fear: 'Choosing the wrong platform and having to migrate again',
    proof: 'Performance metrics, developer testimonials, migration success stories',
    currentSolution: 'WordPress with custom REST endpoints',
    objections: ['Migration complexity', 'Learning curve for content team'],
    vocabulary: ['API', 'SDK', 'TypeScript', 'schema', 'webhook'],
    maturity: 9,
    riskTolerance: 7,
    urgency: 8,
    resources: 6,
    decisionPower: 8,
  }

  const buyerPersona: Persona = {
    id: 'persona_eng_manager',
    icpId: icp.id,
    name: 'Engineering Manager Mike',
    snapshot: 'Manages dev team, accountable for delivery and team productivity',
    type: 'Buyer',
    isNegative: false,
    trigger: 'Team complaining about CMS limitations',
    goal: 'Improve team productivity and reduce tech debt',
    fear: 'Budget overrun, team resistance to new tools',
    proof: 'ROI calculator, team satisfaction metrics',
    currentSolution: 'Legacy CMS with accumulated workarounds',
    objections: ['Cost', 'Training time', 'Support quality'],
    vocabulary: ['ROI', 'productivity', 'scalability', 'support'],
    maturity: 7,
    riskTolerance: 5,
    urgency: 6,
    resources: 8,
    decisionPower: 9,
  }

  const negativePersona: Persona = {
    id: 'persona_legacy_larry',
    icpId: icp.id,
    name: 'Legacy Larry',
    snapshot: 'Prefers traditional CMS, resistant to change',
    type: 'Blocker',
    isNegative: true,
    trigger: 'Forced to evaluate new options by management',
    goal: 'Maintain status quo, avoid learning new systems',
    fear: 'Job security, looking incompetent with new tech',
    currentSolution: 'WordPress for 10 years',
    objections: ['Too complex', "We don't need this", 'WordPress is fine'],
    maturity: 3,
    riskTolerance: 1,
    urgency: 1,
    resources: 5,
    decisionPower: 3,
  }

  const personaPanel: PersonaPanel = {
    id: 'panel_headless',
    icpId: icp.id,
    panelSize: 12,
    personas: [
      primaryPersona,
      buyerPersona,
      negativePersona,
      // ... 9 more personas for full panel
    ],
  }

  console.log('\nPersona Panel:')
  for (const persona of personaPanel.personas) {
    const badge = persona.isNegative ? '[NEGATIVE]' : `[${persona.type}]`
    console.log(`  ${badge} ${persona.name}: ${persona.snapshot}`)
  }

  // ==========================================================================
  // Business Model: 5-Part Hypothesis
  // ==========================================================================

  const hypothesis: Hypothesis = {
    id: 'hypothesis_headless',
    customer: 'development teams at growing SaaS companies',
    problem: 'content management bottlenecks slowing product development',
    approach: 'API-first headless CMS with exceptional developer experience',
    competitors: 'traditional CMS like WordPress and complex enterprise solutions',
    differentiator: 'fastest time-to-value with built-in TypeScript support and real-time preview',
    status: 'validated',
    interviews: 47,
    experiments: ['landing_page_test', 'pricing_test', 'feature_survey'],
    evidence: [
      '47/50 devs prefer API-first approach',
      '3x faster content deployment reported',
      'NPS of 72 from beta users',
    ],
  }

  console.log('\nHypothesis:', hypothesis.status)
  console.log(`  If we help ${hypothesis.customer}`)
  console.log(`  solve ${hypothesis.problem}`)
  console.log(`  with ${hypothesis.approach}`)
  console.log(`  they will choose us over ${hypothesis.competitors}`)
  console.log(`  because ${hypothesis.differentiator}`)

  // ==========================================================================
  // Business Model: Lean Canvas
  // ==========================================================================

  const canvas: LeanCanvas = {
    id: 'canvas_headless',
    problems: [
      'Traditional CMS platforms are too rigid',
      'Slow content delivery impacts SEO and UX',
      'Developers and content editors have conflicting needs',
    ],
    existingAlternatives: ['WordPress', 'Contentful', 'Custom solutions'],
    solutions: [
      'API-first architecture with any frontend',
      'Edge-cached content delivery',
      'Intuitive editing with live preview',
    ],
    keyMetrics: ['Time to first content', 'API response time', 'Editor satisfaction'],
    valueProposition: 'The developer-first headless CMS that content editors love',
    concept: 'Stripe for content management',
    unfairAdvantage: 'Deep integration with modern JS ecosystem and edge deployment',
    channels: ['Developer content marketing', 'Open source community', 'Partner integrations'],
    customerSegments: ['SaaS dev teams', 'Digital agencies', 'E-commerce platforms'],
    earlyAdopters: ['Next.js developers building content sites'],
    costStructure: ['Infrastructure', 'Engineering', 'Support'],
    revenueStreams: ['Usage-based pricing', 'Enterprise plans', 'Professional services'],
  }

  // ==========================================================================
  // Business Model: StoryBrand
  // ==========================================================================

  const storyBrand: StoryBrand = {
    id: 'storybrand_headless',
    character: 'Development teams building content-driven applications',
    problem: {
      external: 'Their CMS is slowing down development',
      internal: 'They feel frustrated wrestling with inflexible tools',
      philosophical: "Developers shouldn't have to compromise on their tech stack",
    },
    guide: {
      empathy: "We've built content systems for years and felt the same pain",
      authority: 'Trusted by 1000+ dev teams, 99.9% uptime, SOC2 certified',
    },
    plan: [
      'Sign up and connect your first frontend in minutes',
      'Model your content with our intuitive schema builder',
      'Invite your content team with their own tailored interface',
    ],
    callToAction: {
      direct: 'Start free trial',
      transitional: 'See how it works',
    },
    failure: 'Continued frustration, slow deployments, technical debt',
    success: 'Ship content features 3x faster with a happy team',
  }

  // ==========================================================================
  // Messaging Atoms - Cascade Stage 5
  // ==========================================================================

  const messaging: StartupMessaging = {
    frame: 'Speed',
    proof: 'Demo',
    cta: 'Demo',
    offer: 'Trial',
    lp: 'Short',
    headline: 'Ship content features 3x faster',
    subheadline: 'The headless CMS that developers and content teams both love',
    valueProps: [
      'API-first: Use any frontend framework',
      'Real-time preview: See changes instantly',
      'Type-safe: Full TypeScript support',
      'Edge-fast: Global CDN delivery',
    ],
    trustSignals: ['1000+ teams', '99.9% uptime', 'SOC2 certified'],
    socialProof: [
      '"Finally, a CMS that fits our stack" - Lead Dev at Acme',
      '"Migration took 2 days, not 2 months" - CTO at StartupX',
    ],
    frictionReducers: ['Free tier forever', 'No credit card required', 'Export anytime'],
  }

  // ==========================================================================
  // Founders
  // ==========================================================================

  const founder: Founder = {
    id: 'founder_001',
    name: 'Alex Developer',
    email: 'alex@headless.ly',
    bio: 'Former senior engineer at Stripe, built content systems at scale',
    advantages: [
      {
        type: 'capability',
        description: 'Deep expertise in API design and developer tools',
        evidence: 'Built Stripe Docs infrastructure',
      },
      {
        type: 'insight',
        description: 'Understands why existing CMS solutions fail developers',
        evidence: 'Interviewed 100+ developers about CMS pain points',
      },
      {
        type: 'motivation',
        description: 'Personally experienced the problem while building products',
        evidence: 'Spent 6 months fighting WordPress at previous startup',
      },
    ],
    industries: ['SaaS', 'Developer Tools'],
    occupations: ['Software Engineer', 'Tech Lead'],
    companies: ['Stripe', 'TechStartup'],
    skills: ['TypeScript', 'API Design', 'System Architecture'],
    domainKnowledge: {
      industries: ['Software Publishing', 'Developer Tools'],
      processes: ['Software Development', 'Content Management'],
      technologies: ['Node.js', 'PostgreSQL', 'Redis', 'Cloudflare'],
      customers: ['Development Teams', 'Digital Agencies'],
    },
    why: 'Developers deserve better tools for content management',
    personalConnection: 'Wasted months building CMS workarounds at every job',
    longTermVision: 'Make content management as pleasant as Stripe made payments',
    network: {
      potentialCustomers: 50,
      advisors: ['Jane CTO', 'Bob Investor'],
      investors: ['Dev Fund', 'API Capital'],
    },
  }

  // ==========================================================================
  // Complete Startup Config
  // ==========================================================================

  const completeStartup: StartupConfig = {
    ...startupIdentity,
    hypothesis,
    canvas,
    storyBrand,
    icp,
    personaPanel,
    messaging,
    founders: [founder],
    metrics: {
      users: 5000,
      customers: 1200,
      revenue: 85000,
      growth: 15,
    },
    links: {
      website: 'https://headless.ly',
      app: 'https://app.headless.ly',
      pitch: 'https://headless.ly/pitch',
      demo: 'https://headless.ly/demo',
    },
  }

  // ==========================================================================
  // Cascade Schema for Startup
  // ==========================================================================

  const StartupCascadeSchema: EntitySchema = {
    // Core identity
    name: 'string',
    tagline: 'string',

    // Cascade relations
    idea: 'What is the core idea? <-Idea',
    founders: ['Who are the founders? ->Founder'],
    problem: 'What problem does it solve? ->Problem',
    solution: 'How does it solve it? ->Solution',
    icp: 'Who is the ideal customer? ->ICP',
    personaPanel: 'Generate persona panel ->PersonaPanel',

    // Ontology links (vector search)
    industry: 'What industry? <~Industry|Sector',
    occupation: 'Target occupation? <~Occupation|Role',
    process: 'Core business process? <~Process',

    // Business model
    hypothesis: 'Generate founding hypothesis ->Hypothesis',
    canvas: 'Generate lean canvas ->LeanCanvas',
    storyBrand: 'Generate StoryBrand ->StoryBrand',

    // Messaging
    messaging: 'Generate messaging atoms ->Messaging',
  }

  console.log('\n=== Complete Startup DO ===')
  console.log(`Name: ${completeStartup.name}`)
  console.log(`Stage: ${completeStartup.stage}`)
  console.log(`MRR: $${completeStartup.metrics?.revenue}`)
  console.log(`Customers: ${completeStartup.metrics?.customers}`)
  console.log(`Growth: ${completeStartup.metrics?.growth}%`)

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  // Handle customer events from this Startup's app
  $.on.Customer.created(async (customer, ctx) => {
    console.log('New customer:', customer)
    await ctx.slack`#metrics New customer: ${customer.name}`
  })

  // Handle subscription upgrades
  $.on.Subscription.upgraded(async (sub, ctx) => {
    console.log('Subscription upgraded:', sub.tier)

    // Update metrics
    const startup = await ctx.db.collection('Startup').get($.$id)
    await ctx.db.collection('Startup').update($.$id, {
      metrics: {
        ...startup?.metrics,
        revenue: (startup?.metrics?.revenue ?? 0) + sub.mrrDelta,
      },
    })

    // Notify parent DO (startups.studio)
    await ctx.send('Startup.metrics.updated', {
      startupId: $.$id,
      mrr: startup?.metrics?.revenue,
    })
  })

  // Scheduled metrics rollup
  $.every.day(async () => {
    const metrics = await calculateMetrics()
    await $.db.collection('MetricsSnapshot').create({
      date: new Date().toISOString().split('T')[0],
      ...metrics,
    })

    // Stream to parent for portfolio dashboard
    await $.send('Startup.metrics.daily', metrics)
  })

  async function calculateMetrics() {
    return {
      mrr: completeStartup.metrics?.revenue ?? 0,
      customers: completeStartup.metrics?.customers ?? 0,
      churn: 2.5,
      nps: 72,
    }
  }

  $.log('Startup DO initialized:', completeStartup.name)
})

console.log('Startup example loaded')
