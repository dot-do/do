/**
 * Git Integration Types - Content/Code Sync with Git
 *
 * Integration between DO storage and git repositories
 * Supports bidirectional sync with configurable source of truth
 */

import type { DigitalObjectRef } from './identity'

// =============================================================================
// Git Sync Configuration
// =============================================================================

/**
 * Source of truth strategy
 */
export type SourceOfTruth =
  | 'git' // Git is authoritative, DO syncs from git
  | 'do' // DO is authoritative, git syncs from DO
  | 'last-write-wins' // Most recent change wins (default)

/**
 * Git sync configuration
 */
export interface GitSyncConfig {
  /** Whether git sync is enabled */
  enabled: boolean

  /** Git repository URL */
  repository: string

  /** Branch to sync */
  branch: string

  /** Path within repository (for monorepos) */
  basePath?: string

  /** Source of truth strategy */
  sourceOfTruth: SourceOfTruth

  /** Authentication */
  auth?: GitAuthConfig

  /** Sync behavior */
  sync?: GitSyncBehavior

  /** What to sync */
  include?: GitSyncInclude

  /** Conflict resolution */
  conflictResolution?: GitConflictResolution
}

/**
 * Git authentication configuration
 */
export interface GitAuthConfig {
  /** Auth method */
  method: 'ssh' | 'https' | 'token'
  /** SSH key ID (stored securely) */
  sshKeyId?: string
  /** Token ID (stored securely) */
  tokenId?: string
  /** Username for HTTPS */
  username?: string
}

/**
 * Sync behavior configuration
 */
export interface GitSyncBehavior {
  /** Auto-commit changes from DO */
  autoCommit?: boolean
  /** Commit message template */
  commitTemplate?: string
  /** Auto-push commits */
  autoPush?: boolean
  /** Auto-pull on access */
  autoPull?: boolean
  /** Sync interval in ms (0 = manual only) */
  syncInterval?: number
  /** Sync on DO events */
  syncOnEvents?: ('create' | 'update' | 'delete')[]
}

/**
 * What to include in git sync
 */
export interface GitSyncInclude {
  /** Include MDX content files */
  content?: boolean
  /** Include code/function files */
  code?: boolean
  /** Include configuration */
  config?: boolean
  /** Specific paths to include */
  paths?: string[]
  /** Paths to exclude */
  excludePaths?: string[]
  /** File patterns to include */
  patterns?: string[]
  /** File patterns to exclude */
  excludePatterns?: string[]
}

/**
 * Git conflict resolution strategy
 */
export interface GitConflictResolution {
  /** Default strategy */
  strategy: 'manual' | 'git-wins' | 'do-wins' | 'merge' | 'last-write-wins'
  /** Per-path overrides */
  pathOverrides?: Record<string, GitConflictResolution['strategy']>
  /** Merge driver for specific extensions */
  mergeDrivers?: Record<string, string>
}

// =============================================================================
// Git Repository State
// =============================================================================

/**
 * Repository state
 */
export interface GitRepoState {
  /** Remote URL */
  remote: string
  /** Current branch */
  branch: string
  /** Current commit SHA */
  headSha: string
  /** Whether there are local changes */
  isDirty: boolean
  /** Ahead/behind remote */
  ahead: number
  behind: number
  /** Last fetch timestamp */
  lastFetch?: number
  /** Last push timestamp */
  lastPush?: number
  /** Last pull timestamp */
  lastPull?: number
}

/**
 * Git sync state
 */
export type GitSyncState = 'synced' | 'ahead' | 'behind' | 'diverged' | 'conflict' | 'error'

/**
 * Git sync status (detailed)
 */
export interface GitSyncStatusDetail {
  /** DO reference */
  doRef: DigitalObjectRef
  /** Repository state */
  repo: GitRepoState
  /** Sync state */
  state: GitSyncState
  /** Pending changes */
  pending: PendingChange[]
  /** Conflicts (if any) */
  conflicts?: SyncConflict[]
  /** Last sync timestamp */
  lastSync?: number
  /** Last sync result */
  lastSyncResult?: GitSyncResult
  /** Error message (if state is error) */
  error?: string
}

/**
 * Pending change to sync
 */
export interface PendingChange {
  /** File path */
  path: string
  /** Change type */
  type: 'create' | 'update' | 'delete' | 'rename'
  /** Source of change */
  source: 'git' | 'do'
  /** Timestamp */
  timestamp: number
  /** Old path (for renames) */
  oldPath?: string
  /** Content hash */
  hash?: string
}

/**
 * Sync conflict
 */
export interface SyncConflict {
  /** File path */
  path: string
  /** Git version */
  gitVersion: {
    sha: string
    timestamp: number
    content?: string
  }
  /** DO version */
  doVersion: {
    version: number
    timestamp: number
    content?: string
  }
  /** Suggested resolution */
  suggestedResolution?: 'git' | 'do' | 'merge'
  /** Merged content (if auto-merged) */
  mergedContent?: string
}

/**
 * Git sync result
 */
export interface GitSyncResult {
  /** Whether sync succeeded */
  success: boolean
  /** Direction of sync */
  direction: 'push' | 'pull' | 'bidirectional'
  /** Files synced */
  filesSynced: number
  /** Files created */
  created: string[]
  /** Files updated */
  updated: string[]
  /** Files deleted */
  deleted: string[]
  /** Conflicts encountered */
  conflicts?: SyncConflict[]
  /** New commit SHA (if pushed) */
  commitSha?: string
  /** Duration in ms */
  duration: number
  /** Error message (if failed) */
  error?: string
}

// =============================================================================
// Git Operations
// =============================================================================

/**
 * Git operations interface (subset of gitx)
 */
export interface GitOperations {
  /** Initialize repository */
  init(config: GitSyncConfig): Promise<void>

  /** Clone repository */
  clone(config: GitSyncConfig): Promise<void>

  /** Get repository state */
  status(): Promise<GitRepoState>

  /** Get sync status */
  syncStatus(): Promise<GitSyncStatusDetail>

  /** Pull changes from remote */
  pull(): Promise<GitSyncResult>

  /** Push changes to remote */
  push(): Promise<GitSyncResult>

  /** Sync bidirectionally */
  sync(): Promise<GitSyncResult>

  /** Commit local changes */
  commit(message: string): Promise<string>

  /** Get file content from git */
  getFile(path: string, ref?: string): Promise<string | null>

  /** Write file to git */
  setFile(path: string, content: string): Promise<void>

  /** Delete file from git */
  deleteFile(path: string): Promise<void>

  /** List files */
  listFiles(path?: string): Promise<GitFileInfo[]>

  /** Get diff between DO and git */
  diff(): Promise<PendingChange[]>

  /** Resolve conflict */
  resolveConflict(path: string, resolution: 'git' | 'do' | 'merge', mergedContent?: string): Promise<void>
}

/**
 * File info from git
 */
export interface GitFileInfo {
  path: string
  type: 'file' | 'directory'
  size?: number
  sha?: string
  mode?: string
}

// =============================================================================
// Git Hooks
// =============================================================================

/**
 * Git hook types
 */
export type GitHookType =
  | 'pre-commit'
  | 'post-commit'
  | 'pre-push'
  | 'post-push'
  | 'pre-pull'
  | 'post-pull'
  | 'pre-sync'
  | 'post-sync'

/**
 * Git hook configuration
 */
export interface GitHook {
  /** Hook type */
  type: GitHookType
  /** Whether hook is enabled */
  enabled: boolean
  /** Function to run */
  handler: string
  /** Timeout in ms */
  timeout?: number
}

/**
 * Git hook context
 */
export interface GitHookContext {
  /** Hook type */
  type: GitHookType
  /** Files affected */
  files: string[]
  /** Commit message (for commit hooks) */
  message?: string
  /** Commit SHA */
  sha?: string
  /** Can abort operation */
  abort: (reason: string) => void
}

// =============================================================================
// Path Mapping
// =============================================================================

/**
 * Path mapping between DO and git
 */
export interface PathMapping {
  /** DO collection/path */
  doPath: string
  /** Git path */
  gitPath: string
  /** File extension in git */
  extension?: string
  /** Transform on sync */
  transform?: 'none' | 'frontmatter' | 'json'
}

/**
 * Default path mappings
 */
export const DEFAULT_PATH_MAPPINGS: PathMapping[] = [
  { doPath: 'pages', gitPath: 'content/pages', extension: '.mdx' },
  { doPath: 'posts', gitPath: 'content/blog', extension: '.mdx' },
  { doPath: 'docs', gitPath: 'content/docs', extension: '.mdx' },
  { doPath: 'functions', gitPath: 'functions', extension: '.ts' },
  { doPath: 'workflows', gitPath: 'workflows', extension: '.ts' },
]
