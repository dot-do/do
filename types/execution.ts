/**
 * Code Execution Types
 *
 * From bashx - execution tiers:
 * - Tier 1: Native in-worker (<1ms) - fs ops, HTTP, POSIX utils
 * - Tier 2: RPC service (<5ms) - jq.do, npm.do, git.do
 * - Tier 3: Dynamic module (<10ms) - esbuild, typescript, prettier
 * - Tier 4: Linux sandbox (2-3s) - compilers, containers
 */

// =============================================================================
// Execution Tiers
// =============================================================================

/**
 * Execution tier levels
 */
export type ExecutionTier = 1 | 2 | 3 | 4

/**
 * Execution tier metadata
 */
export interface ExecutionTierInfo {
  tier: ExecutionTier
  name: string
  description: string
  typicalLatency: string
  examples: string[]
}

export const EXECUTION_TIERS: Record<ExecutionTier, ExecutionTierInfo> = {
  1: {
    tier: 1,
    name: 'Native',
    description: 'Native in-worker execution',
    typicalLatency: '<1ms',
    examples: ['fs ops', 'HTTP fetch', 'POSIX utils', 'JSON/YAML parsing'],
  },
  2: {
    tier: 2,
    name: 'RPC Service',
    description: 'External DO service call',
    typicalLatency: '<5ms',
    examples: ['jq.do', 'npm.do', 'git.do', 'db queries'],
  },
  3: {
    tier: 3,
    name: 'Dynamic Module',
    description: 'Dynamically loaded WASM/JS module',
    typicalLatency: '<10ms',
    examples: ['esbuild', 'typescript', 'prettier', 'markdown'],
  },
  4: {
    tier: 4,
    name: 'Linux Sandbox',
    description: 'Full Linux container execution',
    typicalLatency: '2-3s',
    examples: ['compilers', 'containers', 'native binaries'],
  },
}

// =============================================================================
// Execution Results
// =============================================================================

/**
 * Generic execution result
 */
export interface ExecResult {
  success: boolean
  tier: ExecutionTier
  duration: number
  output?: unknown
  error?: ExecError
  logs?: LogEntry[]
}

export interface ExecError {
  code: string
  message: string
  stack?: string
  details?: Record<string, unknown>
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  timestamp: number
  data?: Record<string, unknown>
}

/**
 * Bash execution result
 */
export interface BashResult extends ExecResult {
  exitCode: number
  stdout: string
  stderr: string
  signal?: string
}

/**
 * Code execution options
 */
export interface ExecOptions {
  timeout?: number
  maxOutputSize?: number
  env?: Record<string, string>
  cwd?: string
  tier?: ExecutionTier
}

// =============================================================================
// ESM Module Execution (from esm)
// =============================================================================

/**
 * ESM module definition
 */
export interface ESMModule {
  /** Package name */
  name: string
  /** Version */
  version?: string
  /** TypeScript definitions */
  types?: string
  /** Implementation code */
  module: string
  /** Entry point */
  script?: string
  /** Test cases */
  tests?: TestCase[]
  /** Dependencies */
  dependencies?: Record<string, string>
}

export interface TestCase {
  name: string
  input: unknown
  expected: unknown
  timeout?: number
}

/**
 * Module execution context
 */
export interface ModuleContext {
  /** Global variables available to the module */
  globals?: Record<string, unknown>
  /** Allowed imports */
  allowedImports?: string[]
  /** Memory limit in bytes */
  memoryLimit?: number
  /** Execution timeout in ms */
  timeout?: number
}

/**
 * Module execution result
 */
export interface ModuleResult extends ExecResult {
  exports?: Record<string, unknown>
  returnValue?: unknown
}

// =============================================================================
// FileSystem (from fsx)
// =============================================================================

/**
 * Virtual filesystem interface
 */
/**
 * Buffer encoding types (subset for Workers runtime)
 */
export type BufferEncodingType = 'utf-8' | 'utf8' | 'ascii' | 'base64' | 'hex' | 'binary'

export interface FileSystem {
  readFile(path: string, encoding?: BufferEncodingType): Promise<string | Uint8Array>
  writeFile(path: string, data: string | Uint8Array): Promise<void>
  appendFile(path: string, data: string | Uint8Array): Promise<void>
  mkdir(path: string, options?: MkdirOptions): Promise<void>
  rmdir(path: string, options?: RmdirOptions): Promise<void>
  readdir(path: string, options?: ReaddirOptions): Promise<Dirent[] | string[]>
  stat(path: string): Promise<Stats>
  lstat(path: string): Promise<Stats>
  unlink(path: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  copyFile(src: string, dest: string): Promise<void>
  exists(path: string): Promise<boolean>
  realpath(path: string): Promise<string>
  symlink(target: string, path: string): Promise<void>
  readlink(path: string): Promise<string>
  chmod(path: string, mode: number): Promise<void>
  chown(path: string, uid: number, gid: number): Promise<void>
  truncate(path: string, len?: number): Promise<void>
  utimes(path: string, atime: Date | number, mtime: Date | number): Promise<void>
}

export interface MkdirOptions {
  recursive?: boolean
  mode?: number
}

export interface RmdirOptions {
  recursive?: boolean
}

export interface ReaddirOptions {
  withFileTypes?: boolean
  recursive?: boolean
}

export interface Dirent {
  name: string
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
  isBlockDevice(): boolean
  isCharacterDevice(): boolean
  isFIFO(): boolean
  isSocket(): boolean
}

export interface Stats {
  dev: number
  ino: number
  mode: number
  nlink: number
  uid: number
  gid: number
  rdev: number
  size: number
  blksize: number
  blocks: number
  atimeMs: number
  mtimeMs: number
  ctimeMs: number
  birthtimeMs: number
  atime: Date
  mtime: Date
  ctime: Date
  birthtime: Date
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
}

// =============================================================================
// Git Operations (from gitx)
// =============================================================================

/**
 * Git repository interface
 */
export interface GitRepository {
  /** Initialize a new repository */
  init(options?: GitInitOptions): Promise<void>
  /** Clone a repository */
  clone(url: string, options?: GitCloneOptions): Promise<void>
  /** Stage files */
  add(paths: string[]): Promise<void>
  /** Remove files from staging */
  reset(paths?: string[]): Promise<void>
  /** Create a commit */
  commit(message: string, options?: GitCommitOptions): Promise<string>
  /** Get commit log */
  log(options?: GitLogOptions): Promise<CommitObject[]>
  /** Get current status */
  status(): Promise<GitStatus>
  /** Create a branch */
  branch(name: string, options?: GitBranchOptions): Promise<void>
  /** Switch branches */
  checkout(ref: string, options?: GitCheckoutOptions): Promise<void>
  /** Merge branches */
  merge(branch: string, options?: GitMergeOptions): Promise<MergeResult>
  /** Fetch from remote */
  fetch(remote?: string, options?: GitFetchOptions): Promise<void>
  /** Pull from remote */
  pull(remote?: string, branch?: string, options?: GitPullOptions): Promise<void>
  /** Push to remote */
  push(remote?: string, branch?: string, options?: GitPushOptions): Promise<void>
  /** Get diff */
  diff(options?: GitDiffOptions): Promise<string>
  /** Show object */
  show(ref: string): Promise<string>
  /** Get refs */
  refs(): Promise<GitRef[]>
}

export interface GitInitOptions {
  bare?: boolean
  defaultBranch?: string
}

export interface GitCloneOptions {
  depth?: number
  branch?: string
  bare?: boolean
}

export interface GitCommitOptions {
  author?: GitAuthor
  allowEmpty?: boolean
  amend?: boolean
}

export interface GitAuthor {
  name: string
  email: string
  timestamp?: number
}

export interface GitLogOptions {
  maxCount?: number
  since?: Date | string
  until?: Date | string
  author?: string
  path?: string
}

export interface CommitObject {
  sha: string
  message: string
  author: GitAuthor
  committer: GitAuthor
  parents: string[]
  tree: string
}

export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  staged: StatusFile[]
  unstaged: StatusFile[]
  untracked: string[]
}

export interface StatusFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied'
  oldPath?: string
}

export interface GitBranchOptions {
  startPoint?: string
  track?: string
}

export interface GitCheckoutOptions {
  create?: boolean
  force?: boolean
}

export interface GitMergeOptions {
  message?: string
  strategy?: 'recursive' | 'ours' | 'theirs'
  noCommit?: boolean
}

export interface MergeResult {
  success: boolean
  conflicts?: string[]
  commit?: string
}

export interface GitFetchOptions {
  prune?: boolean
  tags?: boolean
}

export interface GitPullOptions {
  rebase?: boolean
  noCommit?: boolean
}

export interface GitPushOptions {
  force?: boolean
  setUpstream?: boolean
  tags?: boolean
}

export interface GitDiffOptions {
  staged?: boolean
  ref1?: string
  ref2?: string
  path?: string
}

export interface GitRef {
  name: string
  sha: string
  type: 'branch' | 'tag' | 'remote'
}

// =============================================================================
// NPM Operations (from npmx)
// =============================================================================

/**
 * NPM package manager interface
 */
export interface NpmManager {
  /** Install packages */
  install(packages?: string[], options?: NpmInstallOptions): Promise<void>
  /** Uninstall packages */
  uninstall(packages: string[]): Promise<void>
  /** List installed packages */
  list(options?: NpmListOptions): Promise<NpmPackage[]>
  /** Search registry */
  search(query: string, options?: NpmSearchOptions): Promise<NpmSearchResult[]>
  /** Get package info */
  info(name: string): Promise<NpmPackageInfo>
  /** Run script */
  run(script: string, args?: string[]): Promise<BashResult>
  /** Pack package */
  pack(): Promise<string>
  /** Publish package */
  publish(options?: NpmPublishOptions): Promise<void>
}

export interface NpmInstallOptions {
  dev?: boolean
  global?: boolean
  save?: boolean
  exact?: boolean
}

export interface NpmListOptions {
  depth?: number
  dev?: boolean
  prod?: boolean
}

export interface NpmPackage {
  name: string
  version: string
  dev?: boolean
  path: string
}

export interface NpmSearchOptions {
  limit?: number
  from?: number
}

export interface NpmSearchResult {
  name: string
  version: string
  description?: string
  keywords?: string[]
  author?: string
}

export interface NpmPackageInfo {
  name: string
  version: string
  description?: string
  main?: string
  types?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  scripts?: Record<string, string>
  repository?: { type: string; url: string }
  license?: string
  versions?: string[]
}

export interface NpmPublishOptions {
  tag?: string
  access?: 'public' | 'restricted'
  dryRun?: boolean
}
