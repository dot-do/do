/**
 * Tenant DO - Data Isolation with $context to SaaS
 *
 * Isolated tenant within a SaaS application. Each tenant is its own DO
 * with complete data isolation and scoped access.
 *
 * Key capabilities:
 * - Complete data isolation from other tenants
 * - $context links to parent SaaS DO
 * - Tenant-specific users and permissions
 * - Audit logging for compliance
 * - Data export for portability
 *
 * @example
 * ```typescript
 * const tenant: TenantDO = {
 *   $id: 'https://crm.headless.ly/acme',
 *   $type: 'Tenant',
 *   $context: 'https://crm.headless.ly',
 *   $version: 1,
 *   $createdAt: Date.now(),
 *   $updatedAt: Date.now(),
 *   name: 'Acme Corp',
 *   slug: 'acme',
 *   plan: 'enterprise',
 *   status: 'Active'
 * }
 * ```
 */

import type { DigitalObjectIdentity, DigitalObjectRef } from './identity'
import type { CollectionMethods, User, Role, ListOptions, ListResult } from './collections'

// =============================================================================
// Tenant DO Identity
// =============================================================================

/**
 * Tenant status
 */
export type TenantStatus =
  | 'Provisioning' // Being set up
  | 'Trial'        // In trial period
  | 'Active'       // Active subscription
  | 'PastDue'      // Payment overdue
  | 'Suspended'    // Temporarily suspended
  | 'Cancelled'    // Subscription cancelled

/**
 * Tenant DO configuration extending base identity
 */
export interface TenantDO extends DigitalObjectIdentity {
  /** Always 'Tenant' for this DO type */
  $type: 'Tenant'

  /** Parent SaaS DO reference (required) */
  $context: DigitalObjectRef

  /** Tenant name */
  name: string

  /** URL-friendly slug */
  slug: string

  /** Current plan */
  plan: string

  /** Current status */
  status: TenantStatus

  /** Owner user ID */
  ownerId: string

  /** Tenant settings */
  settings: TenantSettings

  /** Branding configuration */
  branding?: TenantBranding

  /** Custom domain (if enabled) */
  customDomain?: string

  /** Trial end date (if in trial) */
  trialEndsAt?: number

  /** Tenant metadata */
  metadata?: TenantMetadata
}

// =============================================================================
// Settings and Configuration
// =============================================================================

/**
 * Tenant settings
 */
export interface TenantSettings {
  /** Timezone */
  timezone: string

  /** Locale */
  locale: string

  /** Date format */
  dateFormat: string

  /** Time format */
  timeFormat: '12h' | '24h'

  /** Currency */
  currency: string

  /** Week start day */
  weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6

  /** Default user role */
  defaultUserRole?: string

  /** Require 2FA */
  require2FA?: boolean

  /** Session timeout (minutes) */
  sessionTimeout?: number

  /** IP allowlist */
  ipAllowlist?: string[]

  /** Custom settings */
  custom?: Record<string, unknown>
}

/**
 * Tenant branding configuration
 */
export interface TenantBranding {
  /** Logo URL */
  logo?: string

  /** Favicon URL */
  favicon?: string

  /** Primary color */
  primaryColor?: string

  /** Accent color */
  accentColor?: string

  /** Background color */
  backgroundColor?: string

  /** Custom CSS */
  customCSS?: string

  /** Email branding */
  email?: {
    logo?: string
    footerText?: string
    replyTo?: string
  }
}

/**
 * Tenant metadata
 */
export interface TenantMetadata {
  /** Industry */
  industry?: string

  /** Company size */
  companySize?: 'solo' | 'small' | 'medium' | 'large' | 'enterprise'

  /** Country */
  country?: string

  /** Referred by */
  referredBy?: string

  /** Tags */
  tags?: string[]

  /** Custom labels */
  labels?: Record<string, string>
}

// =============================================================================
// User and Permission Types
// =============================================================================

/**
 * Tenant user (extends base User with tenant-specific fields)
 */
export interface TenantUser extends User {
  /** Tenant ID (matches parent DO) */
  tenantId: string

  /** User status within tenant */
  status: 'Pending' | 'Active' | 'Suspended' | 'Removed'

  /** Invited by user ID */
  invitedBy?: string

  /** Invitation accepted at */
  invitationAcceptedAt?: number

  /** Department */
  department?: string

  /** Job title */
  jobTitle?: string

  /** Avatar URL */
  avatar?: string

  /** 2FA enabled */
  twoFactorEnabled?: boolean

  /** Notification preferences */
  notificationPreferences?: NotificationPreferences
}

/**
 * Notification preferences
 */
export interface NotificationPreferences {
  /** Email notifications */
  email: boolean

  /** Push notifications */
  push: boolean

  /** In-app notifications */
  inApp: boolean

  /** Digest frequency */
  digestFrequency?: 'none' | 'daily' | 'weekly'

  /** Notification types to receive */
  types?: string[]
}

/**
 * Tenant role (extends base Role with tenant-specific fields)
 */
export interface TenantRole extends Role {
  /** Tenant ID */
  tenantId: string

  /** Is this the default role */
  isDefault?: boolean

  /** Is this the owner role */
  isOwner?: boolean

  /** Can this role be deleted */
  deletable?: boolean
}

/**
 * User invitation
 */
export interface Invitation {
  /** Invitation ID */
  id: string

  /** Invitee email */
  email: string

  /** Role to assign */
  roleId: string

  /** Invited by user ID */
  invitedBy: string

  /** Status */
  status: 'Pending' | 'Accepted' | 'Expired' | 'Revoked'

  /** Invitation token */
  token: string

  /** Expires at */
  expiresAt: number

  /** Accepted at */
  acceptedAt?: number

  /** Created timestamp */
  createdAt: number
}

// =============================================================================
// Data and Audit Types
// =============================================================================

/**
 * Generic tenant data record
 *
 * Tenant DO can store arbitrary collections of data.
 * Each collection is isolated to this tenant.
 */
export interface TenantDataRecord {
  /** Record ID */
  id: string

  /** Collection name */
  collection: string

  /** Record data */
  data: Record<string, unknown>

  /** Created by user ID */
  createdBy?: string

  /** Updated by user ID */
  updatedBy?: string

  /** Created timestamp */
  createdAt: number

  /** Updated timestamp */
  updatedAt: number

  /** Deleted timestamp (soft delete) */
  deletedAt?: number
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  /** Entry ID */
  id: string

  /** Actor (user or system) */
  actor: {
    type: 'user' | 'system' | 'api'
    id: string
    name?: string
    ip?: string
  }

  /** Action performed */
  action: string

  /** Resource type */
  resourceType: string

  /** Resource ID */
  resourceId?: string

  /** Changes made */
  changes?: {
    field: string
    oldValue?: unknown
    newValue?: unknown
  }[]

  /** Request metadata */
  request?: {
    id: string
    method?: string
    path?: string
    userAgent?: string
  }

  /** Timestamp */
  timestamp: number

  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Activity log entry (user-facing activity feed)
 */
export interface ActivityLogEntry {
  /** Entry ID */
  id: string

  /** User who performed the action */
  userId: string

  /** User name */
  userName?: string

  /** Action type */
  action: string

  /** Human-readable description */
  description: string

  /** Related resource */
  resource?: {
    type: string
    id: string
    name?: string
  }

  /** Timestamp */
  timestamp: number
}

// =============================================================================
// Export Types
// =============================================================================

/**
 * Data export request
 */
export interface ExportRequest {
  /** Request ID */
  id: string

  /** Collections to export */
  collections: string[] | 'all'

  /** Format */
  format: 'json' | 'csv' | 'ndjson'

  /** Include deleted records */
  includeDeleted?: boolean

  /** Date range start */
  startDate?: number

  /** Date range end */
  endDate?: number

  /** Status */
  status: 'Pending' | 'Processing' | 'Completed' | 'Failed'

  /** Download URL (when completed) */
  downloadUrl?: string

  /** Expires at */
  expiresAt?: number

  /** Error message (if failed) */
  error?: string

  /** Requested by user ID */
  requestedBy: string

  /** Created timestamp */
  createdAt: number

  /** Completed timestamp */
  completedAt?: number
}

// =============================================================================
// Tenant Collections Interface
// =============================================================================

/**
 * Tenant DO collections
 */
export interface TenantCollections {
  /** Tenant users */
  users: CollectionMethods<TenantUser>

  /** Tenant roles */
  roles: CollectionMethods<TenantRole>

  /** User invitations */
  invitations: CollectionMethods<Invitation>

  /** Audit log */
  auditLog: CollectionMethods<AuditLogEntry>

  /** Activity log */
  activityLog: CollectionMethods<ActivityLogEntry>

  /** Export requests */
  exports: CollectionMethods<ExportRequest>

  /**
   * Dynamic data collections
   * Access via: tenant.data('collectionName').list()
   */
  data: (collection: string) => CollectionMethods<TenantDataRecord>
}

// =============================================================================
// Tenant RPC Methods
// =============================================================================

/**
 * Settings update options
 */
export interface UpdateSettingsOptions {
  /** Settings to update (partial) */
  settings?: Partial<TenantSettings>

  /** Branding to update (partial) */
  branding?: Partial<TenantBranding>

  /** Metadata to update (partial) */
  metadata?: Partial<TenantMetadata>
}

/**
 * User invitation options
 */
export interface InviteUserOptions {
  /** Invitee email */
  email: string

  /** Role to assign */
  roleId: string

  /** Custom message */
  message?: string

  /** Skip sending email */
  skipEmail?: boolean
}

/**
 * Audit query options
 */
export interface AuditQueryOptions extends ListOptions {
  /** Filter by actor */
  actorId?: string

  /** Filter by action */
  action?: string

  /** Filter by resource type */
  resourceType?: string

  /** Filter by resource ID */
  resourceId?: string

  /** Start date */
  startDate?: number

  /** End date */
  endDate?: number
}

/**
 * Export options
 */
export interface ExportOptions {
  /** Collections to export */
  collections: string[] | 'all'

  /** Format */
  format: 'json' | 'csv' | 'ndjson'

  /** Include deleted records */
  includeDeleted?: boolean

  /** Date range start */
  startDate?: number

  /** Date range end */
  endDate?: number

  /** Encryption key (for encrypted export) */
  encryptionKey?: string
}

/**
 * Tenant DO RPC methods
 */
export interface TenantRPCMethods {
  // =========================================================================
  // Settings Methods
  // =========================================================================

  /**
   * Get tenant settings
   */
  'tenant.settings.get': () => Promise<TenantSettings>

  /**
   * Update tenant settings
   */
  'tenant.settings.update': (options: UpdateSettingsOptions) => Promise<TenantDO>

  /**
   * Get branding
   */
  'tenant.branding.get': () => Promise<TenantBranding | null>

  /**
   * Update branding
   */
  'tenant.branding.update': (branding: Partial<TenantBranding>) => Promise<TenantBranding>

  /**
   * Set custom domain
   */
  'tenant.domain.set': (domain: string) => Promise<{
    domain: string
    verified: boolean
    dnsRecords: Array<{ type: string; name: string; value: string }>
  }>

  /**
   * Verify custom domain
   */
  'tenant.domain.verify': () => Promise<{ verified: boolean; error?: string }>

  // =========================================================================
  // User Methods
  // =========================================================================

  /**
   * Invite user to tenant
   */
  'tenant.users.invite': (options: InviteUserOptions) => Promise<Invitation>

  /**
   * Resend invitation
   */
  'tenant.users.resendInvite': (invitationId: string) => Promise<Invitation>

  /**
   * Revoke invitation
   */
  'tenant.users.revokeInvite': (invitationId: string) => Promise<void>

  /**
   * Accept invitation
   */
  'tenant.users.acceptInvite': (token: string) => Promise<TenantUser>

  /**
   * Update user role
   */
  'tenant.users.updateRole': (userId: string, roleId: string) => Promise<TenantUser>

  /**
   * Suspend user
   */
  'tenant.users.suspend': (userId: string, reason?: string) => Promise<TenantUser>

  /**
   * Reactivate user
   */
  'tenant.users.reactivate': (userId: string) => Promise<TenantUser>

  /**
   * Remove user from tenant
   */
  'tenant.users.remove': (userId: string) => Promise<void>

  /**
   * Transfer ownership
   */
  'tenant.users.transferOwnership': (newOwnerId: string) => Promise<TenantDO>

  // =========================================================================
  // Role Methods
  // =========================================================================

  /**
   * Create custom role
   */
  'tenant.roles.create': (role: Omit<TenantRole, 'id' | 'tenantId'>) => Promise<TenantRole>

  /**
   * Update role
   */
  'tenant.roles.update': (roleId: string, data: Partial<TenantRole>) => Promise<TenantRole>

  /**
   * Delete role
   */
  'tenant.roles.delete': (roleId: string) => Promise<void>

  /**
   * Set default role
   */
  'tenant.roles.setDefault': (roleId: string) => Promise<TenantRole>

  // =========================================================================
  // Audit Methods
  // =========================================================================

  /**
   * Query audit log
   */
  'tenant.audit.query': (options?: AuditQueryOptions) => Promise<ListResult<AuditLogEntry>>

  /**
   * Get audit entry
   */
  'tenant.audit.get': (entryId: string) => Promise<AuditLogEntry | null>

  /**
   * Get activity feed
   */
  'tenant.audit.activity': (options?: ListOptions) => Promise<ListResult<ActivityLogEntry>>

  // =========================================================================
  // Data Methods
  // =========================================================================

  /**
   * List data collections
   */
  'tenant.data.collections': () => Promise<string[]>

  /**
   * Get collection stats
   */
  'tenant.data.stats': (collection?: string) => Promise<{
    collections: Record<string, { count: number; sizeBytes: number }>
    totalRecords: number
    totalSizeBytes: number
  }>

  /**
   * Query data collection
   */
  'tenant.data.query': (
    collection: string,
    options?: ListOptions & { filter?: Record<string, unknown> }
  ) => Promise<ListResult<TenantDataRecord>>

  // =========================================================================
  // Export Methods
  // =========================================================================

  /**
   * Request data export
   */
  'tenant.export.request': (options: ExportOptions) => Promise<ExportRequest>

  /**
   * Get export status
   */
  'tenant.export.status': (exportId: string) => Promise<ExportRequest>

  /**
   * List exports
   */
  'tenant.export.list': () => Promise<ExportRequest[]>

  /**
   * Download export
   */
  'tenant.export.download': (exportId: string) => Promise<{ url: string; expiresAt: number }>

  // =========================================================================
  // Lifecycle Methods
  // =========================================================================

  /**
   * Get tenant info
   */
  'tenant.info': () => Promise<TenantDO>

  /**
   * Get usage stats
   */
  'tenant.usage': () => Promise<{
    users: number
    records: number
    storageBytes: number
    apiCalls: number
    period: { start: number; end: number }
  }>

  /**
   * Delete tenant (soft delete)
   */
  'tenant.delete': () => Promise<void>
}

// =============================================================================
// Tenant CDC Events
// =============================================================================

/**
 * Tenant CDC event types
 */
export type TenantCDCEvent =
  | { type: 'Tenant.Settings.updated'; payload: { changes: string[] } }
  | { type: 'Tenant.Branding.updated'; payload: { changes: string[] } }
  | { type: 'Tenant.Domain.set'; payload: { domain: string } }
  | { type: 'Tenant.Domain.verified'; payload: { domain: string } }
  | { type: 'Tenant.User.invited'; payload: { email: string; roleId: string } }
  | { type: 'Tenant.User.joined'; payload: { userId: string; email: string } }
  | { type: 'Tenant.User.updated'; payload: { userId: string; changes: string[] } }
  | { type: 'Tenant.User.suspended'; payload: { userId: string; reason?: string } }
  | { type: 'Tenant.User.reactivated'; payload: { userId: string } }
  | { type: 'Tenant.User.removed'; payload: { userId: string } }
  | { type: 'Tenant.Role.created'; payload: { roleId: string; name: string } }
  | { type: 'Tenant.Role.updated'; payload: { roleId: string; changes: string[] } }
  | { type: 'Tenant.Role.deleted'; payload: { roleId: string } }
  | { type: 'Tenant.Data.created'; payload: { collection: string; recordId: string } }
  | { type: 'Tenant.Data.updated'; payload: { collection: string; recordId: string; changes: string[] } }
  | { type: 'Tenant.Data.deleted'; payload: { collection: string; recordId: string } }
  | { type: 'Tenant.Export.requested'; payload: { exportId: string; collections: string[] } }
  | { type: 'Tenant.Export.completed'; payload: { exportId: string } }
  | { type: 'Tenant.Deleted'; payload: { tenantId: string } }

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if entity is a TenantDO
 */
export function isTenantDO(obj: unknown): obj is TenantDO {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '$type' in obj &&
    (obj as TenantDO).$type === 'Tenant'
  )
}

/**
 * Check if tenant is active
 */
export function isTenantActive(tenant: TenantDO): boolean {
  return tenant.status === 'Active' || tenant.status === 'Trial'
}

/**
 * Check if tenant is in trial
 */
export function isTenantInTrial(tenant: TenantDO): boolean {
  return tenant.status === 'Trial'
}

/**
 * Check if trial is expired
 */
export function isTrialExpired(tenant: TenantDO): boolean {
  if (tenant.status !== 'Trial') return false
  if (!tenant.trialEndsAt) return false
  return tenant.trialEndsAt < Date.now()
}

/**
 * Check if user is tenant owner
 */
export function isUserOwner(user: TenantUser, tenant: TenantDO): boolean {
  return user.id === tenant.ownerId
}

/**
 * Check if invitation is valid
 */
export function isInvitationValid(invitation: Invitation): boolean {
  if (invitation.status !== 'Pending') return false
  if (invitation.expiresAt < Date.now()) return false
  return true
}

// =============================================================================
// Default Values
// =============================================================================

/**
 * Default tenant settings
 */
export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  timezone: 'UTC',
  locale: 'en-US',
  dateFormat: 'YYYY-MM-DD',
  timeFormat: '24h',
  currency: 'USD',
  weekStartDay: 1, // Monday
  sessionTimeout: 60, // 60 minutes
}

/**
 * Default tenant branding
 */
export const DEFAULT_TENANT_BRANDING: TenantBranding = {
  primaryColor: '#3B82F6',
  accentColor: '#10B981',
  backgroundColor: '#FFFFFF',
}
