/**
 * Content Types - MDX-based content layer
 *
 * From mdxld/mdxdb: MDX as both content and data
 * URL-based filesystem with structured data + unstructured content + executable code + composable UI
 */

// =============================================================================
// MDXLD - MDX Linked Data (Structured Data in MDX)
// =============================================================================

/**
 * JSON-LD style properties for MDX documents
 */
export interface LDProperties {
  /** Document identifier (JSON-LD @id) */
  $id?: string
  /** Document type (JSON-LD @type) */
  $type?: string | string[]
  /** Vocabulary context (JSON-LD @context) */
  $context?: string | string[] | Record<string, unknown>
}

/**
 * Base data type for MDX frontmatter
 */
export type MDXLDData = LDProperties & Record<string, unknown>

/**
 * Core MDX document interface
 * Combines: Structured Data + Unstructured Content + Executable Code + Composable UI
 */
export interface MDXLDDocument<TData extends MDXLDData = MDXLDData> {
  /** Document ID (from $id) */
  id?: string
  /** Document type (from $type) */
  type?: string | string[]
  /** Vocabulary context (from $context) */
  context?: string | string[] | Record<string, unknown>
  /** Structured frontmatter data */
  data: TData
  /** Raw MDX content (markdown + JSX) */
  content: string
}

/**
 * Extended document with AST
 */
export interface MDXLDDocumentWithAST<TData extends MDXLDData = MDXLDData> extends MDXLDDocument<TData> {
  ast: unknown
}

/**
 * Extended document with compiled code
 */
export interface MDXLDDocumentWithCode<TData extends MDXLDData = MDXLDData> extends MDXLDDocument<TData> {
  code: string
  component?: unknown
}

// =============================================================================
// MDXDB - URL-Based Filesystem
// =============================================================================

/**
 * Database interface (provider-agnostic)
 */
export interface ContentDatabase<TData extends MDXLDData = MDXLDData> {
  /** List documents */
  list(options?: ContentListOptions): Promise<ContentListResult<TData>>
  /** Search documents */
  search(options: ContentSearchOptions): Promise<ContentSearchResult<TData>>
  /** Get document by path */
  get(path: string, options?: ContentGetOptions): Promise<MDXLDDocument<TData> | null>
  /** Set/create document */
  set(path: string, doc: MDXLDDocument<TData>, options?: ContentSetOptions): Promise<ContentSetResult>
  /** Delete document */
  delete(path: string, options?: ContentDeleteOptions): Promise<ContentDeleteResult>
  /** Close connection */
  close?(): Promise<void>
}

export interface ContentListOptions {
  /** Filter by type */
  type?: string
  /** Filter by path prefix */
  prefix?: string
  /** Limit results */
  limit?: number
  /** Offset for pagination */
  offset?: number
  /** Sort field */
  sortBy?: string
  /** Sort direction */
  sortDir?: 'asc' | 'desc'
  /** Include content body */
  includeContent?: boolean
}

export interface ContentListResult<TData extends MDXLDData = MDXLDData> {
  items: MDXLDDocument<TData>[]
  total: number
  hasMore: boolean
}

export interface ContentSearchOptions {
  /** Search query */
  query: string
  /** Filter by type */
  type?: string
  /** Filter by path prefix */
  prefix?: string
  /** Limit results */
  limit?: number
  /** Search in specific fields */
  fields?: string[]
  /** Use vector search */
  vector?: boolean
}

export interface ContentSearchResult<TData extends MDXLDData = MDXLDData> {
  items: Array<MDXLDDocument<TData> & { score: number }>
  total: number
}

export interface ContentGetOptions {
  /** Include AST */
  includeAst?: boolean
  /** Include compiled code */
  includeCode?: boolean
  /** Version/revision to get */
  version?: string
}

export interface ContentSetOptions {
  /** Create only (fail if exists) */
  createOnly?: boolean
  /** Update only (fail if not exists) */
  updateOnly?: boolean
  /** Expected version for optimistic concurrency */
  expectedVersion?: string
}

export interface ContentSetResult {
  success: boolean
  path: string
  version: string
}

export interface ContentDeleteOptions {
  /** Soft delete */
  soft?: boolean
}

export interface ContentDeleteResult {
  success: boolean
  path: string
}

// =============================================================================
// Content Types (Page, Post, Doc)
// =============================================================================

/**
 * Page frontmatter data
 */
export interface PageData extends LDProperties {
  $type: 'Page'
  title: string
  description?: string
  slug: string
  template?: string
  layout?: string
  seo?: PageSEO
  publishedAt?: string
  updatedAt?: string
}

export interface PageSEO {
  title?: string
  description?: string
  ogImage?: string
  noIndex?: boolean
}

/**
 * Blog post frontmatter data
 */
export interface PostData extends LDProperties {
  $type: 'Post'
  title: string
  slug: string
  excerpt?: string
  author: string | AuthorData
  category?: string
  tags?: string[]
  featuredImage?: string
  publishedAt: string
  updatedAt?: string
  readingTime?: number
  seo?: PageSEO
}

export interface AuthorData {
  name: string
  email?: string
  avatar?: string
  bio?: string
  social?: Record<string, string>
}

/**
 * Documentation page frontmatter data
 */
export interface DocData extends LDProperties {
  $type: 'Doc'
  title: string
  slug: string
  description?: string
  section?: string
  order?: number
  version?: string
  editUrl?: string
  prev?: { title: string; slug: string }
  next?: { title: string; slug: string }
  toc?: boolean
}

// =============================================================================
// Content Sync with Git
// =============================================================================

/**
 * Simplified git sync configuration for content
 * For full git sync capabilities, use GitSyncConfig from git.ts
 */
export interface ContentGitSyncConfig {
  /** Whether git sync is enabled */
  enabled: boolean
  /** Git repository URL */
  repository?: string
  /** Branch to sync */
  branch?: string
  /** Path within repository */
  path?: string
  /** Source of truth */
  sourceOfTruth: 'git' | 'do' | 'last-write-wins'
  /** Auto-commit changes */
  autoCommit?: boolean
  /** Commit message template */
  commitTemplate?: string
  /** Auto-push changes */
  autoPush?: boolean
  /** Sync interval (ms) */
  syncInterval?: number
}

/**
 * Simplified git sync status for content
 * For full git sync status, use GitSyncStatusDetail from git.ts
 */
export interface ContentGitSyncStatus {
  /** Last sync timestamp */
  lastSync?: number
  /** Sync state */
  state: 'synced' | 'ahead' | 'behind' | 'diverged' | 'error'
  /** Local changes count */
  localChanges?: number
  /** Remote changes count */
  remoteChanges?: number
  /** Current commit SHA */
  commitSha?: string
  /** Error message */
  error?: string
}

/**
 * Content change for sync
 */
export interface ContentChange {
  path: string
  operation: 'create' | 'update' | 'delete'
  timestamp: number
  source: 'git' | 'do'
  sha?: string
}

// =============================================================================
// Content Collections
// =============================================================================

/**
 * Content collection configuration
 */
export interface ContentCollection {
  /** Collection name */
  name: string
  /** Collection slug (URL path) */
  slug: string
  /** Content type */
  type: 'page' | 'post' | 'doc' | 'custom'
  /** Schema for frontmatter validation */
  schema?: Record<string, unknown>
  /** Default template */
  template?: string
  /** Git sync config for this collection */
  gitSync?: ContentGitSyncConfig
}

/**
 * Site content structure
 */
export interface SiteContent {
  /** Pages collection */
  pages: ContentCollection
  /** Blog posts collection */
  posts?: ContentCollection
  /** Documentation collection */
  docs?: ContentCollection
  /** Custom collections */
  collections?: ContentCollection[]
}
