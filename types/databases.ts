/**
 * Database Backend Types
 *
 * DB4.AI - The 4 Database Paradigms:
 * 1. Relational - SQL, tables, ACID transactions
 * 2. Document - JSON documents, flexible schemas
 * 3. Graph - Nodes, edges, relationships
 * 4. Analytics - Columnar, OLAP, time-series
 *
 * Modular database backends (separate DOs to avoid bloat)
 * Base DO uses db4 internally, others loaded on demand
 */

/**
 * The 4 database paradigms (DB4.AI)
 */
export type DatabaseParadigm = 'relational' | 'document' | 'graph' | 'analytics'

/**
 * Available database backends
 * Each is a separate DO that can be loaded on demand
 */
export type DatabaseBackend =
  | 'db4' // Internal: Unified 4-paradigm database (DO SQLite + Vortex + R2/Iceberg)
  | 'dosql' // dosql.do - Native TS type-safe SQL (7.4KB, time-travel, branching)
  | 'postgres' // postgres.do - PGLite WASM (~50-70MB)
  | 'sqlite' // sqlite.do - Turso WASM (~30-40MB)
  | 'mongo' // mongodb.do - MongoDB wire protocol
  | 'evodb' // evodb.do - Schema-evolving columnar
  | 'graphdb' // graphdb.do - Triple store with hibernation
  | 'sdb' // sdb.do - Simple document/graph (in-memory)
  | 'duckdb' // duckdb.do - OLAP analytics (~15MB WASM)

/**
 * Database capabilities - what each backend supports
 */
export interface DatabaseCapabilities {
  /** Which paradigms this backend supports */
  paradigms: DatabaseParadigm[]
  supportsSQL: boolean
  supportsDocument: boolean
  supportsGraph: boolean
  supportsVector: boolean
  supportsSearch: boolean
  supportsAnalytics: boolean
  supportsTimeTravel: boolean
  supportsBranching: boolean
  supportsTransactions: boolean
  maxQueryTimeout: number
  maxStorageBytes?: number
}

/**
 * Common interface all database backends implement
 */
export interface DatabaseDO {
  /** Handle HTTP requests (REST API) */
  fetch(request: Request): Promise<Response>
  /** Get backend capabilities */
  capabilities(): DatabaseCapabilities
  /** Execute a query */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>>
  /** Execute multiple queries in a transaction */
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>
}

/**
 * Query result
 */
export interface QueryResult<T = unknown> {
  rows: T[]
  rowCount: number
  fields?: FieldInfo[]
  duration?: number
}

export interface FieldInfo {
  name: string
  type: string
  nullable?: boolean
}

/**
 * Transaction handle
 */
export interface Transaction {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>>
  commit(): Promise<void>
  rollback(): Promise<void>
}

// =============================================================================
// db4 Specific Types (Internal Database)
// =============================================================================

/**
 * db4 table definition
 */
export interface TableDefinition {
  name: string
  columns: ColumnDefinition[]
  primaryKey: string[]
  indexes?: IndexDefinition[]
}

export interface ColumnDefinition {
  name: string
  type: ColumnType
  nullable?: boolean
  default?: unknown
  unique?: boolean
  references?: ForeignKeyReference
}

export type ColumnType =
  | 'text'
  | 'integer'
  | 'real'
  | 'blob'
  | 'boolean'
  | 'timestamp'
  | 'json'
  | 'uuid'

export interface ForeignKeyReference {
  table: string
  column: string
  onDelete?: 'cascade' | 'restrict' | 'set null'
  onUpdate?: 'cascade' | 'restrict' | 'set null'
}

export interface IndexDefinition {
  name: string
  columns: string[]
  unique?: boolean
  where?: string
}

// =============================================================================
// Vortex Columnar Storage Types
// =============================================================================

/**
 * Vortex storage format for analytics
 */
export interface VortexTable {
  name: string
  schema: VortexSchema
  partitions: VortexPartition[]
}

export interface VortexSchema {
  columns: VortexColumn[]
  sortKey?: string[]
  partitionKey?: string
}

export interface VortexColumn {
  name: string
  type: VortexType
  nullable?: boolean
  compression?: CompressionCodec
}

export type VortexType =
  | 'bool'
  | 'i8' | 'i16' | 'i32' | 'i64'
  | 'u8' | 'u16' | 'u32' | 'u64'
  | 'f32' | 'f64'
  | 'utf8'
  | 'binary'
  | 'timestamp'
  | 'date'
  | 'list'
  | 'struct'

export type CompressionCodec = 'none' | 'snappy' | 'lz4' | 'zstd' | 'dict'

export interface VortexPartition {
  id: string
  minTimestamp?: number
  maxTimestamp?: number
  rowCount: number
  sizeBytes: number
  location: string // R2 key or local path
}

// =============================================================================
// Time Travel & Branching (dosql.do)
// =============================================================================

/**
 * Time travel snapshot (for database branching)
 */
export interface DatabaseSnapshot {
  id: string
  name?: string
  timestamp: number
  version: number
  parentId?: string
  metadata?: Record<string, unknown>
}

/**
 * Database branch
 */
export interface Branch {
  id: string
  name: string
  baseSnapshotId: string
  headVersion: number
  createdAt: number
  updatedAt: number
  metadata?: Record<string, unknown>
}

/**
 * Time travel query options
 */
export interface TimeTravelOptions {
  /** Query as of this timestamp */
  asOf?: number
  /** Query as of this snapshot ID */
  snapshotId?: string
  /** Query on this branch */
  branch?: string
}

// =============================================================================
// Database Federation
// =============================================================================

/**
 * Federated query across multiple database backends
 */
export interface FederatedQuery {
  /** Main query to execute */
  query: string
  /** Sources to query */
  sources: FederatedSource[]
  /** How to combine results */
  strategy?: 'union' | 'join' | 'merge'
}

export interface FederatedSource {
  /** Alias for this source in the query */
  alias: string
  /** Database backend type */
  backend: DatabaseBackend
  /** DO reference */
  doRef: string
  /** Optional transformation */
  transform?: string
}

// =============================================================================
// DB4.AI - Unified 4-Paradigm Database
// =============================================================================

/**
 * DB4 configuration - unified access to all 4 paradigms
 */
export interface DB4Config {
  /** Enable relational paradigm (SQL tables) */
  relational?: RelationalConfig
  /** Enable document paradigm (JSON collections) */
  document?: DocumentConfig
  /** Enable graph paradigm (nodes/edges) */
  graph?: GraphConfig
  /** Enable analytics paradigm (columnar/OLAP) */
  analytics?: AnalyticsConfig
}

/**
 * Relational paradigm configuration
 */
export interface RelationalConfig {
  enabled: boolean
  /** Default engine */
  engine?: 'sqlite' | 'postgres'
  /** Enable foreign key constraints */
  foreignKeys?: boolean
  /** Enable WAL mode for SQLite */
  walMode?: boolean
}

/**
 * Document paradigm configuration
 */
export interface DocumentConfig {
  enabled: boolean
  /** Default collection for untyped documents */
  defaultCollection?: string
  /** Enable schema validation */
  schemaValidation?: boolean
  /** Index configuration */
  indexes?: DocumentIndexConfig[]
}

export interface DocumentIndexConfig {
  collection: string
  fields: string[]
  unique?: boolean
  sparse?: boolean
}

/**
 * Graph paradigm configuration
 */
export interface GraphConfig {
  enabled: boolean
  /** Storage format */
  format?: 'adjacency' | 'triple'
  /** Enable full-text search on nodes */
  fullTextSearch?: boolean
  /** Enable property indexes */
  propertyIndexes?: string[]
}

/**
 * Analytics paradigm configuration
 */
export interface AnalyticsConfig {
  enabled: boolean
  /** Columnar storage format */
  format?: 'vortex' | 'parquet'
  /** Default compression */
  compression?: CompressionCodec
  /** Partition key for time-series */
  partitionKey?: string
  /** Sort keys for efficient queries */
  sortKeys?: string[]
}

// =============================================================================
// Document Store Types (Paradigm 2)
// =============================================================================

/**
 * Document collection
 */
export interface DocumentCollection {
  name: string
  schema?: Record<string, unknown>
  indexes: DocumentIndexConfig[]
  count: number
}

/**
 * Stored document
 */
export interface StoredDocument<T = unknown> {
  _id: string
  _rev?: string
  _createdAt: number
  _updatedAt: number
  data: T
}

/**
 * Document query
 */
export interface DocumentQuery {
  collection: string
  filter?: Record<string, unknown>
  projection?: string[]
  sort?: Record<string, 1 | -1>
  limit?: number
  skip?: number
}

// =============================================================================
// Graph Store Types (Paradigm 3)
// =============================================================================

/**
 * Graph node
 */
export interface GraphNode<T = unknown> {
  id: string
  labels: string[]
  properties: T
}

/**
 * Graph edge
 */
export interface GraphEdge<T = unknown> {
  id: string
  type: string
  source: string
  target: string
  properties?: T
}

/**
 * Graph query (Cypher-like)
 */
export interface GraphQuery {
  /** Pattern to match */
  match: string
  /** Where clause */
  where?: Record<string, unknown>
  /** What to return */
  return: string[]
  /** Order by */
  orderBy?: string
  /** Limit */
  limit?: number
}

/**
 * Graph traversal options
 */
export interface TraversalOptions {
  /** Starting node ID */
  startNode: string
  /** Edge types to follow */
  edgeTypes?: string[]
  /** Direction */
  direction?: 'outgoing' | 'incoming' | 'both'
  /** Maximum depth */
  maxDepth?: number
  /** Filter function (as string) */
  filter?: string
}

// =============================================================================
// Analytics Store Types (Paradigm 4)
// =============================================================================

/**
 * Analytics query (SQL-like for OLAP)
 */
export interface AnalyticsQuery {
  /** SELECT clause */
  select: string[]
  /** FROM table */
  from: string
  /** WHERE conditions */
  where?: string
  /** GROUP BY */
  groupBy?: string[]
  /** HAVING */
  having?: string
  /** ORDER BY */
  orderBy?: string[]
  /** LIMIT */
  limit?: number
  /** Time range filter */
  timeRange?: TimeRange
}

export interface TimeRange {
  start: number
  end: number
  field?: string
}

/**
 * Aggregation functions
 */
export type AggregationFunction =
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'median'
  | 'percentile'
  | 'stddev'
  | 'variance'

/**
 * Analytics query result with metadata
 */
export interface AnalyticsQueryResult<T = unknown> {
  rows: T[]
  rowCount: number
  scannedRows: number
  scannedBytes: number
  duration: number
  cacheHit?: boolean
}
