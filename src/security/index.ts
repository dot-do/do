/**
 * @module security
 * @dotdo/do Security Module
 *
 * Security utilities for the DO platform including prototype pollution prevention,
 * sandboxing, and safe object manipulation.
 *
 * @example
 * ```typescript
 * import {
 *   freezePrototypes,
 *   isPrototypePolluted,
 *   safeObjectAssign,
 *   safeJsonParse,
 *   createSandboxedObject,
 *   createProtectedObject
 * } from '@dotdo/do/security'
 *
 * // Freeze prototypes before executing untrusted code
 * freezePrototypes()
 *
 * // Use safe alternatives to prevent pollution
 * const merged = safeObjectAssign({}, untrustedInput)
 * const parsed = safeJsonParse(jsonString)
 * const sandboxed = createSandboxedObject({ key: 'value' })
 * ```
 */

// Prototype pollution prevention
export {
  // Core functions
  freezePrototypes,
  isPrototypePolluted,
  safeObjectAssign,
  safeJsonParse,
  createSandboxedObject,

  // Additional utilities
  isDangerousKey,
  deepCloneSafe,
  isObjectSafe,
  createProtectedObject,

  // Constants and types
  DANGEROUS_KEYS,
  type DangerousKey,
} from './prototype-guard'

// Monaco editor XSS sanitization
export {
  sanitizeForMonaco,
  isHtmlSafe,
  MonacoSanitizer,
  type SanitizerOptions,
  type Violation,
} from './monaco-sanitizer'
