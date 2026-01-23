/**
 * Tier Detection and Routing
 *
 * Handles detection of the appropriate execution tier for operations
 * and provides tier metadata and routing utilities.
 *
 * @module execution/tiers
 */

import type { ExecutionTier, ExecutionTierInfo } from '../../types/execution'

/**
 * Execution tier metadata
 */
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

/**
 * Operations that can be executed natively in-worker (Tier 1)
 */
export const NATIVE_OPS = new Set([
  // Filesystem operations
  'fs.readFile',
  'fs.writeFile',
  'fs.appendFile',
  'fs.mkdir',
  'fs.rmdir',
  'fs.readdir',
  'fs.stat',
  'fs.lstat',
  'fs.unlink',
  'fs.rename',
  'fs.copyFile',
  'fs.exists',
  'fs.realpath',
  'fs.symlink',
  'fs.readlink',
  'fs.chmod',
  'fs.chown',
  'fs.truncate',
  'fs.utimes',

  // HTTP operations
  'http.fetch',
  'http.get',
  'http.post',
  'http.put',
  'http.delete',
  'http.head',

  // POSIX utilities
  'posix.echo',
  'posix.cat',
  'posix.head',
  'posix.tail',
  'posix.wc',
  'posix.sort',
  'posix.uniq',
  'posix.grep',
  'posix.sed',
  'posix.awk',
  'posix.cut',
  'posix.tr',
  'posix.base64',
  'posix.md5',
  'posix.sha256',

  // Data parsing
  'json.parse',
  'json.stringify',
  'yaml.parse',
  'yaml.stringify',
  'csv.parse',
  'csv.stringify',

  // String operations
  'string.split',
  'string.join',
  'string.replace',
  'string.match',
  'string.trim',

  // Crypto
  'crypto.randomUUID',
  'crypto.hash',
  'crypto.hmac',
  'crypto.encrypt',
  'crypto.decrypt',

  // Encoding
  'encoding.base64Encode',
  'encoding.base64Decode',
  'encoding.urlEncode',
  'encoding.urlDecode',
  'encoding.hexEncode',
  'encoding.hexDecode',
])

/**
 * Operations that require RPC service calls (Tier 2)
 */
export const RPC_SERVICES = new Set([
  // jq.do
  'jq.query',
  'jq.filter',
  'jq.transform',

  // npm.do
  'npm.install',
  'npm.uninstall',
  'npm.list',
  'npm.search',
  'npm.info',
  'npm.run',
  'npm.pack',
  'npm.publish',

  // git.do
  'git.init',
  'git.clone',
  'git.add',
  'git.reset',
  'git.commit',
  'git.log',
  'git.status',
  'git.branch',
  'git.checkout',
  'git.merge',
  'git.fetch',
  'git.pull',
  'git.push',
  'git.diff',
  'git.show',
  'git.refs',

  // db.do
  'db.query',
  'db.execute',
  'db.transaction',

  // kv.do
  'kv.get',
  'kv.set',
  'kv.delete',
  'kv.list',
])

/**
 * Operations that use dynamic modules (Tier 3)
 */
export const DYNAMIC_MODULES = new Set([
  // ESM execution
  'esm.run',
  'esm.import',
  'esm.evaluate',

  // Build tools
  'esbuild.build',
  'esbuild.transform',
  'esbuild.minify',

  // TypeScript
  'typescript.compile',
  'typescript.check',
  'typescript.transpile',

  // Formatters
  'prettier.format',
  'prettier.check',

  // Markdown
  'markdown.parse',
  'markdown.render',
  'markdown.toHtml',

  // Other modules
  'babel.transform',
  'terser.minify',
  'postcss.process',
])

/**
 * Detect the appropriate execution tier for an operation.
 *
 * @param operation - The operation identifier
 * @returns The detected execution tier
 *
 * @example
 * ```typescript
 * detectTier('fs.readFile')     // Returns 1
 * detectTier('jq.query')        // Returns 2
 * detectTier('esbuild.build')   // Returns 3
 * detectTier('gcc.compile')     // Returns 4
 * ```
 */
export function detectTier(operation: string): ExecutionTier {
  if (NATIVE_OPS.has(operation)) {
    return 1
  }

  if (RPC_SERVICES.has(operation)) {
    return 2
  }

  if (DYNAMIC_MODULES.has(operation)) {
    return 3
  }

  // Check for service pattern (e.g., 'service.do/method')
  if (operation.includes('.do')) {
    return 2
  }

  // Default to sandbox for unknown operations
  return 4
}

/**
 * Get tier metadata information.
 *
 * @param tier - The execution tier
 * @returns Tier metadata
 *
 * @example
 * ```typescript
 * const info = getTierInfo(1)
 * console.log(info.name)           // 'Native'
 * console.log(info.typicalLatency) // '<1ms'
 * ```
 */
export function getTierInfo(tier: ExecutionTier): ExecutionTierInfo {
  return EXECUTION_TIERS[tier]
}

/**
 * Check if an operation can be executed at a given tier.
 *
 * @param operation - The operation identifier
 * @param tier - The target execution tier
 * @returns True if the operation can execute at the given tier
 *
 * @example
 * ```typescript
 * canExecuteAt('fs.readFile', 1)  // true
 * canExecuteAt('fs.readFile', 4)  // true (higher tiers can do lower tier ops)
 * canExecuteAt('gcc.compile', 1)  // false
 * ```
 */
export function canExecuteAt(operation: string, tier: ExecutionTier): boolean {
  const requiredTier = detectTier(operation)
  return tier >= requiredTier
}

/**
 * Get all operations available at a given tier.
 *
 * @param tier - The execution tier
 * @param includeHigher - Include operations from higher tiers
 * @returns Set of operation identifiers
 */
export function getOperationsForTier(
  tier: ExecutionTier,
  includeHigher = false
): Set<string> {
  const ops = new Set<string>()

  if (tier >= 1 || includeHigher) {
    NATIVE_OPS.forEach((op) => ops.add(op))
  }

  if (tier >= 2 || includeHigher) {
    RPC_SERVICES.forEach((op) => ops.add(op))
  }

  if (tier >= 3 || includeHigher) {
    DYNAMIC_MODULES.forEach((op) => ops.add(op))
  }

  return ops
}

/**
 * Route an operation to the appropriate executor.
 *
 * @param operation - The operation identifier
 * @param tier - Optional tier override
 * @returns Object with tier and executor name
 */
export function routeOperation(
  operation: string,
  tier?: ExecutionTier
): { tier: ExecutionTier; executor: string } {
  const resolvedTier = tier ?? detectTier(operation)

  const executorMap: Record<ExecutionTier, string> = {
    1: 'native',
    2: 'rpc',
    3: 'esm',
    4: 'sandbox',
  }

  return {
    tier: resolvedTier,
    executor: executorMap[resolvedTier],
  }
}
