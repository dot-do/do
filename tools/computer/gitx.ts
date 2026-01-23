/**
 * Gitx - Git Operations Layer
 *
 * DO-native git operations. Provides high-level git commands
 * without requiring a full git CLI installation.
 *
 * @module tools/computer/gitx
 */

import type { GitResult, ExecutionContext } from '../types'
import { bashx } from './bashx'

// =============================================================================
// Gitx Interface
// =============================================================================

/**
 * Clone a repository
 *
 * @param url - Repository URL
 * @param dest - Destination path
 * @param options - Clone options
 * @returns Clone result
 *
 * @example
 * ```typescript
 * await gitx.clone('https://github.com/user/repo.git', '/project')
 * await gitx.clone('git@github.com:user/repo.git', '/project', { branch: 'develop', depth: 1 })
 * ```
 */
export async function clone(
  url: string,
  dest: string,
  options?: { branch?: string; depth?: number }
): Promise<GitResult> {
  let command = `git clone ${url} ${dest}`

  if (options?.branch) {
    command += ` --branch ${options.branch}`
  }
  if (options?.depth) {
    command += ` --depth ${options.depth}`
  }

  const result = await bashx.exec(command)
  return {
    success: result.success,
    data: { url, dest },
    error: result.success ? undefined : { code: 'CLONE_FAILED', message: result.stderr },
  }
}

/**
 * Get repository status
 *
 * @param cwd - Repository directory
 * @returns Status result with changed files
 *
 * @example
 * ```typescript
 * const status = await gitx.status('/project')
 * console.log(status.data?.staged)
 * console.log(status.data?.modified)
 * ```
 */
export async function status(cwd: string): Promise<GitResult> {
  const result = await bashx.exec('git status --porcelain', { cwd })
  if (!result.success) {
    return {
      success: false,
      error: { code: 'STATUS_FAILED', message: result.stderr },
    }
  }

  // Parse porcelain output
  const lines = result.stdout.split('\n').filter(Boolean)
  const staged: string[] = []
  const modified: string[] = []
  const untracked: string[] = []

  for (const line of lines) {
    const status = line.slice(0, 2)
    const file = line.slice(3)

    if (status[0] !== ' ' && status[0] !== '?') {
      staged.push(file)
    }
    if (status[1] === 'M') {
      modified.push(file)
    }
    if (status === '??') {
      untracked.push(file)
    }
  }

  return {
    success: true,
    data: { staged, modified, untracked, raw: result.stdout },
  }
}

/**
 * Stage files for commit
 *
 * @param cwd - Repository directory
 * @param files - Files to stage (or "." for all)
 * @returns Add result
 *
 * @example
 * ```typescript
 * await gitx.add('/project', '.')
 * await gitx.add('/project', ['src/index.ts', 'package.json'])
 * ```
 */
export async function add(cwd: string, files: string | string[]): Promise<GitResult> {
  const fileList = Array.isArray(files) ? files.join(' ') : files
  const result = await bashx.exec(`git add ${fileList}`, { cwd })

  return {
    success: result.success,
    data: { files: Array.isArray(files) ? files : [files] },
    error: result.success ? undefined : { code: 'ADD_FAILED', message: result.stderr },
  }
}

/**
 * Create a commit
 *
 * @param cwd - Repository directory
 * @param message - Commit message
 * @param options - Commit options
 * @returns Commit result with hash
 *
 * @example
 * ```typescript
 * await gitx.commit('/project', 'feat: add new feature')
 * await gitx.commit('/project', 'fix: bug fix', { author: 'Bot <bot@example.com>' })
 * ```
 */
export async function commit(
  cwd: string,
  message: string,
  options?: { author?: string }
): Promise<GitResult> {
  let command = `git commit -m "${message.replace(/"/g, '\\"')}"`

  if (options?.author) {
    command += ` --author="${options.author}"`
  }

  const result = await bashx.exec(command, { cwd })
  if (!result.success) {
    return {
      success: false,
      error: { code: 'COMMIT_FAILED', message: result.stderr },
    }
  }

  // Extract commit hash from output
  const hashMatch = result.stdout.match(/\[[\w-]+ ([a-f0-9]+)\]/)
  const hash = hashMatch?.[1]

  return {
    success: true,
    data: { hash, message },
  }
}

/**
 * Push to remote
 *
 * @param cwd - Repository directory
 * @param options - Push options
 * @returns Push result
 *
 * @example
 * ```typescript
 * await gitx.push('/project')
 * await gitx.push('/project', { remote: 'origin', branch: 'main' })
 * ```
 */
export async function push(
  cwd: string,
  options?: { remote?: string; branch?: string; setUpstream?: boolean }
): Promise<GitResult> {
  let command = 'git push'

  if (options?.setUpstream) {
    command += ' -u'
  }
  if (options?.remote) {
    command += ` ${options.remote}`
  }
  if (options?.branch) {
    command += ` ${options.branch}`
  }

  const result = await bashx.exec(command, { cwd })
  return {
    success: result.success,
    data: { remote: options?.remote || 'origin', branch: options?.branch },
    error: result.success ? undefined : { code: 'PUSH_FAILED', message: result.stderr },
  }
}

/**
 * Pull from remote
 *
 * @param cwd - Repository directory
 * @param options - Pull options
 * @returns Pull result
 *
 * @example
 * ```typescript
 * await gitx.pull('/project')
 * await gitx.pull('/project', { remote: 'origin', branch: 'main', rebase: true })
 * ```
 */
export async function pull(
  cwd: string,
  options?: { remote?: string; branch?: string; rebase?: boolean }
): Promise<GitResult> {
  let command = 'git pull'

  if (options?.rebase) {
    command += ' --rebase'
  }
  if (options?.remote) {
    command += ` ${options.remote}`
  }
  if (options?.branch) {
    command += ` ${options.branch}`
  }

  const result = await bashx.exec(command, { cwd })
  return {
    success: result.success,
    error: result.success ? undefined : { code: 'PULL_FAILED', message: result.stderr },
  }
}

/**
 * Get diff
 *
 * @param cwd - Repository directory
 * @param options - Diff options
 * @returns Diff result with patch
 *
 * @example
 * ```typescript
 * const diff = await gitx.diff('/project')
 * const staged = await gitx.diff('/project', { staged: true })
 * ```
 */
export async function diff(cwd: string, options?: { staged?: boolean; file?: string }): Promise<GitResult> {
  let command = 'git diff'

  if (options?.staged) {
    command += ' --staged'
  }
  if (options?.file) {
    command += ` -- ${options.file}`
  }

  const result = await bashx.exec(command, { cwd })
  return {
    success: result.success,
    data: { patch: result.stdout },
    error: result.success ? undefined : { code: 'DIFF_FAILED', message: result.stderr },
  }
}

/**
 * Get commit log
 *
 * @param cwd - Repository directory
 * @param options - Log options
 * @returns Log result with commits
 *
 * @example
 * ```typescript
 * const log = await gitx.log('/project', { limit: 10 })
 * ```
 */
export async function log(cwd: string, options?: { limit?: number; oneline?: boolean }): Promise<GitResult> {
  let command = 'git log'

  if (options?.oneline) {
    command += ' --oneline'
  }
  if (options?.limit) {
    command += ` -n ${options.limit}`
  }

  const result = await bashx.exec(command, { cwd })
  return {
    success: result.success,
    data: { log: result.stdout },
    error: result.success ? undefined : { code: 'LOG_FAILED', message: result.stderr },
  }
}

/**
 * Create/switch branch
 *
 * @param cwd - Repository directory
 * @param branch - Branch name
 * @param options - Branch options
 * @returns Branch result
 *
 * @example
 * ```typescript
 * await gitx.branch('/project', 'feature/new-feature', { create: true })
 * await gitx.branch('/project', 'main') // switch
 * ```
 */
export async function branch(
  cwd: string,
  branchName: string,
  options?: { create?: boolean }
): Promise<GitResult> {
  let command = options?.create ? `git checkout -b ${branchName}` : `git checkout ${branchName}`

  const result = await bashx.exec(command, { cwd })
  return {
    success: result.success,
    data: { branch: branchName },
    error: result.success ? undefined : { code: 'BRANCH_FAILED', message: result.stderr },
  }
}

/**
 * Get current branch name
 *
 * @param cwd - Repository directory
 * @returns Current branch name
 *
 * @example
 * ```typescript
 * const branch = await gitx.currentBranch('/project')
 * console.log(branch) // "main"
 * ```
 */
export async function currentBranch(cwd: string): Promise<string> {
  const result = await bashx.exec('git branch --show-current', { cwd })
  return result.stdout.trim()
}

// =============================================================================
// Gitx Namespace Export
// =============================================================================

export const gitx = {
  clone,
  status,
  add,
  commit,
  push,
  pull,
  diff,
  log,
  branch,
  currentBranch,
}
