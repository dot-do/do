/**
 * Collections Module - Core data structures for Digital Objects
 *
 * @module collections
 *
 * @description
 * This module exports all collection types for managing data within Digital Objects.
 * Collections provide the core data layer including:
 *
 * - **Nouns**: Entity type registry (Customer, Order, Product, etc.)
 * - **Verbs**: Action type registry (create, update, delete, approve, etc.)
 * - **Things**: Entity instances in ThingExpanded or ThingCompact formats
 * - **Actions**: Durable action execution with full lifecycle tracking
 * - **Relationships**: Graph-style entity linking with cascade operator support
 *
 * @example
 * ```typescript
 * import {
 *   NounCollection,
 *   VerbCollection,
 *   ThingCollection,
 *   ActionCollection,
 *   RelationshipCollection
 * } from './collections'
 *
 * // Initialize collections with storage
 * const nouns = new NounCollection(storage)
 * const verbs = new VerbCollection(storage)
 * const things = new ThingCollection(storage, nouns)
 * const actions = new ActionCollection(storage, verbs)
 * const relationships = new RelationshipCollection(storage)
 * ```
 */

// Base collection
export {
  BaseCollection,
  CollectionError,
  NotFoundError,
  ValidationError,
} from './base'

export type {
  DOStorage,
  CollectionConfig,
} from './base'

// Noun collection
export {
  NounCollection,
} from './nouns'

export type {
  CreateNounOptions,
} from './nouns'

// Verb collection
export {
  VerbCollection,
  CRUD_VERBS,
  WORKFLOW_VERBS,
} from './verbs'

export type {
  CreateVerbOptions,
} from './verbs'

// Things collection
export {
  ThingCollection,
} from './things'

export type {
  CreateThingExpandedOptions,
  CreateThingCompactOptions,
  ThingQueryOptions,
} from './things'

// Actions collection
export {
  ActionCollection,
  DEFAULT_RETRY_POLICY,
} from './actions'

export type {
  CreateActionOptions,
  FailActionOptions,
  ActionRetryPolicy,
} from './actions'

// Relationships collection
export {
  RelationshipCollection,
} from './relationships'

export type {
  CreateRelationshipOptions,
  RelationshipQueryOptions,
  TraversalResult,
} from './relationships'

// Re-export types from types/collections for convenience
export type {
  Noun,
  Verb,
  Thing,
  ThingExpanded,
  ThingCompact,
  Action,
  ActionStatus,
  ActionError,
  ActionRequest,
  Actor,
  ActorType,
  Relationship,
  Function,
  FunctionType,
  FunctionDefinition,
  Workflow,
  WorkflowType,
  WorkflowExecutionState,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowTrigger,
  StateMachineDefinition,
  StateNode,
  Transition,
  Event,
  Experiment,
  ExperimentStatus,
  Variant,
  Org,
  Role,
  Permission,
  User,
  Agent,
  AgentStatus,
  AgentModality,
  Integration,
  IntegrationStatus,
  IntegrationCredentials,
  Webhook,
  CollectionMethods,
  ListOptions,
  ListResult,
  FilterExpression,
  FilterOp,
} from '../../types/collections'

export { isThingExpanded, isThingCompact } from '../../types/collections'

// Re-export types from types/cascade for convenience
export type {
  RelationOperator,
  RelationDirection,
  RelationMethod,
  RelationFieldDefinition,
  StoredRelation,
  RelationManager,
  CascadeProcessor,
  CascadeResult,
  CascadeFieldResult,
  CascadeError,
  CascadeConfig,
  CascadeEvent,
} from '../../types/cascade'

export {
  parseRelationOperator,
  parseRelationField,
  isRelationField,
} from '../../types/cascade'

// Introspection
export {
  Introspection,
  getSchema,
  getVerbs,
  getStats,
  getRelationshipTypes,
} from './introspection'

export type {
  IntrospectionResult,
  NounSchema,
  VerbForms,
  CollectionStats,
  CascadeAnnotation,
  CascadeOperatorDef,
} from './introspection'
