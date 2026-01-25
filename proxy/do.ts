/**
 * Proxy DO Module - Re-exports from canonical location
 *
 * The canonical DigitalObject implementation lives in do/DigitalObject.ts.
 * This module re-exports it for backward compatibility with existing imports.
 *
 * @module proxy/do
 * @deprecated Import from 'do/DigitalObject' or '@dotdo/do' instead
 */

export { DigitalObject, DOError, type DOEnv, type DigitalObjectOptions, type FetchResult } from '../do/DigitalObject'
