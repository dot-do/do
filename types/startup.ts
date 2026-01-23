/**
 * Startup DO - Cascade Support and Experiment Tracking
 *
 * Generated startup entity with full 11-stage cascade support.
 * Tracks hypotheses, experiments, and validation progress.
 *
 * Key capabilities:
 * - 11-stage cascade generation (Problem -> Solution -> ICP -> etc.)
 * - Experiment tracking and A/B testing
 * - Hypothesis validation
 * - Progress tracking through startup stages
 *
 * @example
 * ```typescript
 * const startup: StartupDO = {
 *   $id: 'https://headless.ly',
 *   $type: 'Startup',
 *   $context: 'https://startups.studio',
 *   $version: 1,
 *   $createdAt: Date.now(),
 *   $updatedAt: Date.now(),
 *   name: 'Headless.ly',
 *   stage: 'validation',
 *   cascadeProgress: {
 *     currentStage: 5,
 *     completedStages: [1, 2, 3, 4],
 *     status: 'running'
 *   }
 * }
 * ```
 */

import type { DigitalObjectIdentity, DigitalObjectRef } from './identity'
import type { CollectionMethods, Experiment, Variant } from './collections'
import type { CascadeConfig, CascadeResult } from './cascade'

// =============================================================================
// Startup DO Identity
// =============================================================================

/**
 * Startup stage progression
 */
export type StartupStage =
  | 'ideation'     // Coming up with ideas
  | 'validation'   // Validating problem-solution fit
  | 'mvp'          // Building minimum viable product
  | 'pmf'          // Product-market fit
  | 'scaling'      // Scaling the business
  | 'growth'       // Rapid growth phase
  | 'mature'       // Established business

/**
 * Startup brand affiliation
 */
export type StartupBrand =
  | 'headless.ly'
  | 'agentic.services'
  | 'management.studio'
  | string

/**
 * Startup DO configuration extending base identity
 */
export interface StartupDO extends DigitalObjectIdentity {
  /** Always 'Startup' for this DO type */
  $type: 'Startup'

  /** Parent Business DO reference */
  $context: DigitalObjectRef

  /** Startup name */
  name: string

  /** URL-friendly subdomain */
  subdomain: string

  /** Custom domain (if any) */
  domain?: string

  /** Tagline */
  tagline?: string

  /** Description */
  description?: string

  /** Logo URL */
  logo?: string

  /** Current stage */
  stage: StartupStage

  /** Brand affiliation */
  brand?: StartupBrand

  /** Cascade progress tracking */
  cascadeProgress?: CascadeProgress

  /** References to child DOs (Site, App) */
  children?: StartupChildren

  /** Traction metrics */
  metrics?: StartupMetrics

  /** External links */
  links?: StartupLinks
}

// =============================================================================
// Cascade Types
// =============================================================================

/**
 * Cascade stage definition
 */
export type CascadeStage =
  | 1   // Problem identification
  | 2   // Solution definition
  | 3   // ICP (Ideal Customer Profile)
  | 4   // Persona panel
  | 5   // Messaging
  | 6   // Lean Canvas
  | 7   // StoryBrand
  | 8   // Site generation
  | 9   // App generation
  | 10  // Launch
  | 11  // Iterate

/**
 * Cascade progress tracking
 */
export interface CascadeProgress {
  /** Current stage being processed */
  currentStage: CascadeStage

  /** Completed stages */
  completedStages: CascadeStage[]

  /** Overall status */
  status: 'Idle' | 'Running' | 'Paused' | 'Completed' | 'Failed'

  /** Last checkpoint */
  checkpoint?: CascadeCheckpoint

  /** Errors encountered */
  errors?: CascadeStageError[]

  /** Started timestamp */
  startedAt?: number

  /** Completed timestamp */
  completedAt?: number
}

/**
 * Cascade checkpoint for resumption
 */
export interface CascadeCheckpoint {
  /** Stage at checkpoint */
  stage: CascadeStage

  /** Checkpoint timestamp */
  timestamp: number

  /** State data for resumption */
  state: Record<string, unknown>

  /** Entities created up to this point */
  createdEntities: Array<{ type: string; id: string }>
}

/**
 * Cascade stage error
 */
export interface CascadeStageError {
  /** Stage that failed */
  stage: CascadeStage

  /** Error message */
  message: string

  /** Error code */
  code?: string

  /** Timestamp */
  timestamp: number

  /** Is retryable */
  retryable?: boolean
}

/**
 * Startup children references
 */
export interface StartupChildren {
  /** Marketing site DO reference */
  siteRef?: DigitalObjectRef

  /** Application DO reference */
  appRef?: DigitalObjectRef

  /** Additional child DOs */
  otherRefs?: DigitalObjectRef[]
}

/**
 * Startup traction metrics
 */
export interface StartupMetrics {
  /** Total users */
  users?: number

  /** Paying customers */
  customers?: number

  /** Monthly revenue */
  revenue?: number

  /** Growth rate (percentage) */
  growth?: number

  /** Churn rate (percentage) */
  churn?: number

  /** NPS score */
  nps?: number

  /** Last updated */
  updatedAt?: number
}

/**
 * Startup external links
 */
export interface StartupLinks {
  /** Main website */
  website?: string

  /** Application URL */
  app?: string

  /** Pitch deck URL */
  pitch?: string

  /** Demo URL */
  demo?: string

  /** Documentation URL */
  docs?: string
}

// =============================================================================
// Collection Types (from existing types/startup.ts)
// =============================================================================

/**
 * Problem identified from task analysis
 */
export interface Problem {
  id: string
  taskId?: string
  description: string
  type: 'friction' | 'inefficiency' | 'expertise_gap' | 'compliance' | 'quality'
  painLevel: number
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  urgency: 'critical' | 'high' | 'medium' | 'low'
  currentSolution?: string
  rootCause?: string
  constraints?: string[]
}

/**
 * Solution to address a problem
 */
export interface Solution {
  id: string
  problemId: string
  description: string
  approach: 'automation' | 'augmentation' | 'optimization' | 'elimination'
  mechanism: string
  leveragesExisting?: string[]
  requiredCapabilities?: string[]
  technicalFeasibility: number
  marketReadiness: number
}

/**
 * Ideal Customer Profile
 */
export interface ICP {
  id: string
  solutionId: string
  as: string
  at: string
  are: string
  using: string
  to: string
  companySize?: 'solo' | 'small' | 'medium' | 'enterprise'
  maturity?: 'startup' | 'growth' | 'mature'
  budget?: 'low' | 'medium' | 'high'
  wants?: string[]
  needs?: string[]
  desires?: string[]
  fears?: string[]
}

/**
 * Persona within ICP
 */
export interface Persona {
  id: string
  icpId: string
  name: string
  snapshot: string
  type: 'Buyer' | 'User' | 'Influencer' | 'Champion' | 'DecisionMaker' | 'Blocker'
  isNegative: boolean
  trigger?: string
  goal?: string
  fear?: string
  objections?: string[]
}

/**
 * Startup messaging atoms
 */
export interface Messaging {
  id: string
  frame: 'Speed' | 'Cost' | 'Risk' | 'Compliance' | 'Revenue' | 'Quality'
  headline: string
  subheadline?: string
  valueProps: string[]
  proof: 'CaseStudy' | 'Metric' | 'Logos' | 'Testimonial' | 'Demo' | 'Docs'
  cta: 'Demo' | 'Quote' | 'Trial' | 'Calculator' | 'Template' | 'Audit' | 'Playground'
}

/**
 * 5-part founding hypothesis
 */
export interface Hypothesis {
  id: string
  customer: string
  problem: string
  approach: string
  competitors: string
  differentiator: string
  status: 'Draft' | 'Testing' | 'Validated' | 'Invalidated' | 'Pivoted'
  interviews?: number
  evidence?: string[]
}

/**
 * Lean Canvas
 */
export interface LeanCanvas {
  id: string
  problems: string[]
  solutions: string[]
  valueProposition: string
  unfairAdvantage?: string
  customerSegments: string[]
  channels?: string[]
  revenueStreams?: string[]
  costStructure?: string[]
}

/**
 * Founder profile
 */
export interface Founder {
  id: string
  name: string
  email?: string
  bio?: string
  advantages: Array<{
    type: 'capability' | 'insight' | 'motivation'
    description: string
    evidence?: string
  }>
  industries?: string[]
  skills?: string[]
}

// =============================================================================
// Startup Collections Interface
// =============================================================================

/**
 * Startup DO collections
 */
export interface StartupCollections {
  /** Problems identified */
  problems: CollectionMethods<Problem>

  /** Solutions defined */
  solutions: CollectionMethods<Solution>

  /** Ideal Customer Profiles */
  icps: CollectionMethods<ICP>

  /** Persona panels */
  personas: CollectionMethods<Persona>

  /** Messaging atoms */
  messaging: CollectionMethods<Messaging>

  /** Hypotheses */
  hypotheses: CollectionMethods<Hypothesis>

  /** Lean Canvas records */
  canvases: CollectionMethods<LeanCanvas>

  /** Founder profiles */
  founders: CollectionMethods<Founder>

  /** Experiments */
  experiments: CollectionMethods<Experiment>
}

// =============================================================================
// Startup RPC Methods
// =============================================================================

/**
 * Cascade run options
 */
export interface CascadeRunOptions extends CascadeConfig {
  /** Starting stage (default: 1) */
  startStage?: CascadeStage

  /** Ending stage (default: 11) */
  endStage?: CascadeStage

  /** Input data for generation */
  input?: Record<string, unknown>

  /** Use existing entities where possible */
  useExisting?: boolean
}

/**
 * Cascade run result
 */
export interface CascadeRunResult extends CascadeResult {
  /** Progress after run */
  progress: CascadeProgress

  /** Time taken in ms */
  duration: number

  /** Tokens used (if AI generation) */
  tokensUsed?: number
}

/**
 * Hypothesis validation options
 */
export interface ValidationOptions {
  /** Validation method */
  method: 'interview' | 'survey' | 'experiment' | 'analytics'

  /** Sample size target */
  sampleSize?: number

  /** Confidence threshold */
  confidenceThreshold?: number

  /** Timeout in days */
  timeoutDays?: number
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Hypothesis ID */
  hypothesisId: string

  /** Validation status */
  status: 'Validated' | 'Invalidated' | 'Inconclusive'

  /** Confidence score (0-1) */
  confidence: number

  /** Sample size achieved */
  sampleSize: number

  /** Evidence collected */
  evidence: string[]

  /** Recommendations */
  recommendations?: string[]
}

/**
 * Experiment allocation options
 */
export interface ExperimentAllocationOptions {
  /** User identifier */
  userId: string

  /** Sticky allocation */
  sticky?: boolean

  /** Override variant (for testing) */
  overrideVariant?: string
}

/**
 * Experiment conversion options
 */
export interface ExperimentConversionOptions {
  /** User identifier */
  userId: string

  /** Conversion value */
  value?: number

  /** Conversion metadata */
  metadata?: Record<string, unknown>
}

/**
 * Startup DO RPC methods
 */
export interface StartupRPCMethods {
  // =========================================================================
  // Cascade Methods
  // =========================================================================

  /**
   * Run cascade generation
   */
  'startup.cascade.run': (options?: CascadeRunOptions) => Promise<CascadeRunResult>

  /**
   * Resume cascade from checkpoint
   */
  'startup.cascade.resume': (checkpointId?: string) => Promise<CascadeRunResult>

  /**
   * Pause running cascade
   */
  'startup.cascade.pause': () => Promise<CascadeProgress>

  /**
   * Get cascade progress
   */
  'startup.cascade.progress': () => Promise<CascadeProgress>

  /**
   * Reset cascade (clear all generated entities)
   */
  'startup.cascade.reset': (fromStage?: CascadeStage) => Promise<void>

  // =========================================================================
  // Experiment Methods
  // =========================================================================

  /**
   * Allocate user to experiment variant
   */
  'startup.experiments.allocate': (
    experimentId: string,
    options: ExperimentAllocationOptions
  ) => Promise<{ variant: Variant; allocation: string }>

  /**
   * Record experiment conversion
   */
  'startup.experiments.record': (
    experimentId: string,
    options: ExperimentConversionOptions
  ) => Promise<void>

  /**
   * Get experiment results
   */
  'startup.experiments.results': (experimentId: string) => Promise<{
    experiment: Experiment
    winner?: string
    confidence: number
    sampleSize: number
  }>

  /**
   * Conclude experiment
   */
  'startup.experiments.conclude': (experimentId: string) => Promise<Experiment>

  // =========================================================================
  // Validation Methods
  // =========================================================================

  /**
   * Start hypothesis validation
   */
  'startup.validate.start': (
    hypothesisId: string,
    options: ValidationOptions
  ) => Promise<{ validationId: string }>

  /**
   * Record validation evidence
   */
  'startup.validate.evidence': (
    validationId: string,
    evidence: string
  ) => Promise<void>

  /**
   * Complete validation
   */
  'startup.validate.complete': (validationId: string) => Promise<ValidationResult>

  /**
   * Get validation status
   */
  'startup.validate.status': (validationId: string) => Promise<{
    status: 'Running' | 'Completed' | 'Timeout'
    progress: number
    sampleSize: number
  }>

  // =========================================================================
  // Stage Methods
  // =========================================================================

  /**
   * Update startup stage
   */
  'startup.stage.update': (stage: StartupStage) => Promise<StartupDO>

  /**
   * Get stage requirements
   */
  'startup.stage.requirements': (stage: StartupStage) => Promise<{
    required: string[]
    recommended: string[]
    progress: number
  }>

  // =========================================================================
  // Metrics Methods
  // =========================================================================

  /**
   * Update metrics
   */
  'startup.metrics.update': (metrics: Partial<StartupMetrics>) => Promise<StartupMetrics>

  /**
   * Get metrics history
   */
  'startup.metrics.history': (options?: {
    metric?: keyof StartupMetrics
    startDate?: number
    endDate?: number
  }) => Promise<Array<{ date: number; metrics: Partial<StartupMetrics> }>>
}

// =============================================================================
// Startup CDC Events
// =============================================================================

/**
 * Startup CDC event types
 */
export type StartupCDCEvent =
  | { type: 'Startup.Cascade.started'; payload: { stage: CascadeStage } }
  | { type: 'Startup.Cascade.stageCompleted'; payload: { stage: CascadeStage; entitiesCreated: number } }
  | { type: 'Startup.Cascade.completed'; payload: CascadeProgress }
  | { type: 'Startup.Cascade.failed'; payload: CascadeStageError }
  | { type: 'Startup.Cascade.checkpointed'; payload: CascadeCheckpoint }
  | { type: 'Startup.Problem.created'; payload: Problem }
  | { type: 'Startup.Solution.created'; payload: Solution }
  | { type: 'Startup.ICP.created'; payload: ICP }
  | { type: 'Startup.Persona.created'; payload: Persona }
  | { type: 'Startup.Experiment.started'; payload: { experimentId: string } }
  | { type: 'Startup.Experiment.allocated'; payload: { experimentId: string; userId: string; variant: string } }
  | { type: 'Startup.Experiment.converted'; payload: { experimentId: string; userId: string; value?: number } }
  | { type: 'Startup.Experiment.concluded'; payload: { experimentId: string; winner?: string } }
  | { type: 'Startup.Hypothesis.validated'; payload: ValidationResult }
  | { type: 'Startup.Stage.updated'; payload: { from: StartupStage; to: StartupStage } }
  | { type: 'Startup.Metrics.updated'; payload: StartupMetrics }

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if entity is a StartupDO
 */
export function isStartupDO(obj: unknown): obj is StartupDO {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '$type' in obj &&
    (obj as StartupDO).$type === 'Startup'
  )
}

/**
 * Check if cascade is complete
 */
export function isCascadeComplete(progress: CascadeProgress): boolean {
  return progress.status === 'Completed' && progress.completedStages.includes(11)
}

/**
 * Get next cascade stage
 */
export function getNextCascadeStage(progress: CascadeProgress): CascadeStage | null {
  const maxCompleted = Math.max(...progress.completedStages, 0)
  if (maxCompleted >= 11) return null
  return (maxCompleted + 1) as CascadeStage
}
