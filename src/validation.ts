/**
 * @dotdo/do - Input Validation Utilities
 *
 * Provides validation functions for CRUD method parameters.
 * Throws descriptive errors for invalid inputs.
 */

/**
 * Custom validation error class for input validation failures
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Maximum allowed length for collection names
 */
const MAX_COLLECTION_LENGTH = 1000

/**
 * Maximum allowed length for IDs
 */
const MAX_ID_LENGTH = 1000

/**
 * Maximum allowed limit for list operations
 */
const MAX_LIST_LIMIT = 100000

/**
 * Maximum allowed query length for search
 */
const MAX_QUERY_LENGTH = 10000

/**
 * Pattern for detecting potentially unsafe characters (SQL injection prevention)
 */
const UNSAFE_PATTERN = /[;'"\\`<>]|--|\x00|\n|\r/

/**
 * Pattern for valid identifiers (collection names, field names)
 */
// const VALID_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_.-]*$/

/**
 * Valid action status values
 */
const VALID_ACTION_STATUSES = new Set([
  'pending',
  'active',
  'completed',
  'failed',
  'cancelled',
])

/**
 * Validates a collection name parameter
 * @throws Error if collection is invalid
 */
export function validateCollection(collection: unknown, paramName = 'collection'): asserts collection is string {
  if (collection === undefined || collection === null) {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} is required`)
  }

  if (typeof collection !== 'string') {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} must be a string`)
  }

  if (collection.trim() === '') {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} cannot be empty`)
  }

  if (collection.length > MAX_COLLECTION_LENGTH) {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} length exceeds maximum of ${MAX_COLLECTION_LENGTH}`)
  }

  if (UNSAFE_PATTERN.test(collection)) {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} contains unsafe characters`)
  }
}

/**
 * Validates an ID parameter
 * @throws Error if id is invalid
 */
export function validateId(id: unknown, paramName = 'id'): asserts id is string {
  if (id === undefined || id === null) {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} is required`)
  }

  if (typeof id !== 'string') {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} must be a string`)
  }

  if (id.trim() === '') {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} cannot be empty`)
  }

  if (id.length > MAX_ID_LENGTH) {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} length exceeds maximum of ${MAX_ID_LENGTH}`)
  }

  if (UNSAFE_PATTERN.test(id)) {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} contains invalid characters (newlines or null bytes not allowed)`)
  }
}

/**
 * Validates a data object parameter
 * @throws Error if data is invalid
 */
export function validateData(data: unknown, paramName = 'data'): asserts data is Record<string, unknown> {
  if (data === undefined || data === null) {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} is required`)
  }

  if (typeof data !== 'object') {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} must be an object`)
  }

  if (Array.isArray(data)) {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} must be a plain object, not an array`)
  }

  // Check for functions in the data (not JSON-serializable)
  for (const [_key, value] of Object.entries(data)) {
    if (typeof value === 'function') {
      throw new ValidationError(`Invalid ${paramName}: ${paramName} contains a function which cannot be serialized`)
    }
  }

  // Check for circular references by trying to stringify
  try {
    JSON.stringify(data)
  } catch (e) {
    if (e instanceof Error && e.message.includes('circular')) {
      throw new ValidationError(`Invalid ${paramName}: ${paramName} contains circular references which cannot be serialized`)
    }
    throw e
  }
}

/**
 * Validates updates object parameter (similar to data but also checks for empty and id changes)
 * @throws Error if updates is invalid
 */
export function validateUpdates(updates: unknown, paramName = 'updates'): asserts updates is Record<string, unknown> {
  if (updates === undefined || updates === null) {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} is required`)
  }

  if (typeof updates !== 'object') {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} must be an object`)
  }

  if (Array.isArray(updates)) {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} must be a plain object, not an array`)
  }

  const keys = Object.keys(updates)
  if (keys.length === 0) {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} cannot be empty - no properties to update`)
  }

  if ('id' in updates) {
    throw new ValidationError(`Invalid ${paramName}: cannot change id - id is immutable`)
  }

  // Check for functions
  for (const [_key, value] of Object.entries(updates)) {
    if (typeof value === 'function') {
      throw new ValidationError(`Invalid ${paramName}: ${paramName} contains a function which cannot be serialized`)
    }
  }

  // Check for circular references
  try {
    JSON.stringify(updates)
  } catch (e) {
    if (e instanceof Error && e.message.includes('circular')) {
      throw new ValidationError(`Invalid ${paramName}: ${paramName} contains circular references which cannot be serialized`)
    }
    throw e
  }
}

/**
 * Validates list options
 * @throws Error if options are invalid
 */
export function validateListOptions(options: unknown): void {
  if (options === undefined || options === null) {
    return // Options are optional
  }

  if (typeof options !== 'object') {
    throw new ValidationError('Invalid options: options must be an object')
  }

  const opts = options as Record<string, unknown>

  // Validate limit
  if (opts.limit !== undefined) {
    if (typeof opts.limit !== 'number' || !Number.isFinite(opts.limit)) {
      throw new ValidationError('Invalid limit: limit must be a number')
    }
    if (opts.limit <= 0) {
      throw new ValidationError('Invalid limit: limit must be a positive number')
    }
    if (opts.limit > MAX_LIST_LIMIT) {
      throw new ValidationError(`Invalid limit: limit exceeds maximum of ${MAX_LIST_LIMIT}`)
    }
  }

  // Validate offset
  if (opts.offset !== undefined) {
    if (typeof opts.offset !== 'number' || !Number.isFinite(opts.offset)) {
      throw new ValidationError('Invalid offset: offset must be a number')
    }
    if (opts.offset < 0) {
      throw new ValidationError('Invalid offset: offset cannot be negative')
    }
  }

  // Validate order
  if (opts.order !== undefined) {
    if (opts.order !== 'asc' && opts.order !== 'desc') {
      throw new ValidationError('Invalid order: order must be "asc" or "desc"')
    }
  }

  // Validate orderBy
  if (opts.orderBy !== undefined) {
    if (typeof opts.orderBy !== 'string') {
      throw new ValidationError('Invalid orderBy: orderBy must be a string')
    }
    if (UNSAFE_PATTERN.test(opts.orderBy)) {
      throw new ValidationError('Invalid orderBy: orderBy contains unsafe characters')
    }
  }
}

/**
 * Validates a URL parameter
 * @throws Error if url is invalid
 */
export function validateUrl(url: unknown, paramName = 'url'): asserts url is string {
  if (url === undefined || url === null) {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} is required`)
  }

  if (typeof url !== 'string') {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} must be a string`)
  }

  if (url.trim() === '') {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} cannot be empty`)
  }

  try {
    new URL(url)
  } catch {
    throw new ValidationError(`Invalid ${paramName}: ${paramName} is not a valid URL format`)
  }
}

/**
 * Validates a namespace (ns) parameter
 * @throws Error if ns is invalid
 */
export function validateNamespace(ns: unknown, paramName = 'ns'): asserts ns is string {
  if (ns === undefined || ns === null) {
    throw new ValidationError(`Invalid ${paramName}: namespace is required`)
  }

  if (typeof ns !== 'string') {
    throw new ValidationError(`Invalid ${paramName}: namespace must be a string`)
  }

  if (ns.trim() === '') {
    throw new ValidationError(`Invalid ${paramName}: namespace cannot be empty`)
  }
}

/**
 * Validates a type parameter
 * @throws Error if type is invalid
 */
export function validateType(type: unknown, paramName = 'type'): asserts type is string {
  if (type === undefined || type === null) {
    throw new ValidationError(`Invalid ${paramName}: type is required`)
  }

  if (typeof type !== 'string') {
    throw new ValidationError(`Invalid ${paramName}: type must be a string`)
  }

  if (type.trim() === '') {
    throw new ValidationError(`Invalid ${paramName}: type cannot be empty`)
  }

  // Check for dangerous characters in type
  if (UNSAFE_PATTERN.test(type)) {
    throw new ValidationError(`Invalid ${paramName}: type contains unsafe characters`)
  }
}

/**
 * Validates createThing options
 * @throws Error if options are invalid
 */
export function validateCreateThingOptions(options: unknown): void {
  if (options === undefined || options === null) {
    throw new ValidationError('Invalid options: options is required')
  }

  if (typeof options !== 'object') {
    throw new ValidationError('Invalid options: options must be an object')
  }

  const opts = options as Record<string, unknown>

  // Validate required fields
  validateNamespace(opts.ns)
  validateType(opts.type)

  if (opts.data === undefined || opts.data === null) {
    throw new ValidationError('Invalid data: data is required')
  }

  if (typeof opts.data !== 'object' || Array.isArray(opts.data)) {
    throw new ValidationError('Invalid data: data must be an object')
  }

  // Validate optional id if provided
  if (opts.id !== undefined) {
    if (typeof opts.id !== 'string') {
      throw new ValidationError('Invalid id: id must be a string')
    }
    if (opts.id.trim() === '') {
      throw new ValidationError('Invalid id: id cannot be empty')
    }
  }

  // Validate optional url if provided
  if (opts.url !== undefined) {
    validateUrl(opts.url)
  }

  // Validate @context if provided
  if (opts['@context'] !== undefined) {
    const ctx = opts['@context']
    if (typeof ctx !== 'string' && (typeof ctx !== 'object' || Array.isArray(ctx))) {
      throw new ValidationError('Invalid @context: @context must be a string or object')
    }
  }
}

/**
 * Validates relate options
 * @throws Error if options are invalid
 */
export function validateRelateOptions(options: unknown): void {
  if (options === undefined || options === null) {
    throw new ValidationError('Invalid options: options is required')
  }

  if (typeof options !== 'object') {
    throw new ValidationError('Invalid options: options must be an object')
  }

  const opts = options as Record<string, unknown>

  // Validate type
  if (opts.type === undefined || opts.type === null) {
    throw new ValidationError('Invalid type: type is required')
  }
  if (typeof opts.type !== 'string') {
    throw new ValidationError('Invalid type: type must be a string')
  }
  if ((opts.type as string).trim() === '') {
    throw new ValidationError('Invalid type: type cannot be empty')
  }

  // Validate from
  if (opts.from === undefined || opts.from === null) {
    throw new ValidationError('Invalid from: from is required')
  }
  validateUrl(opts.from, 'from')

  // Validate to
  if (opts.to === undefined || opts.to === null) {
    throw new ValidationError('Invalid to: to is required')
  }
  validateUrl(opts.to, 'to')

  // Check for self-reference
  if (opts.from === opts.to) {
    throw new ValidationError('Invalid relationship: from and to cannot be the same (self-reference not allowed)')
  }
}

/**
 * Validates track (event) options
 * @throws Error if options are invalid
 */
export function validateTrackOptions(options: unknown): void {
  if (options === undefined || options === null) {
    throw new ValidationError('Invalid options: options is required')
  }

  if (typeof options !== 'object') {
    throw new ValidationError('Invalid options: options must be an object')
  }

  const opts = options as Record<string, unknown>

  // Validate type
  if (opts.type === undefined || opts.type === null) {
    throw new ValidationError('Invalid type: type is required')
  }
  if (typeof opts.type !== 'string') {
    throw new ValidationError('Invalid type: type must be a string')
  }
  if ((opts.type as string).trim() === '') {
    throw new ValidationError('Invalid type: type cannot be empty')
  }
  if (UNSAFE_PATTERN.test(opts.type as string)) {
    throw new ValidationError('Invalid type: type contains unsafe characters')
  }

  // Validate source
  if (opts.source === undefined || opts.source === null) {
    throw new ValidationError('Invalid source: source is required')
  }
  if (typeof opts.source !== 'string') {
    throw new ValidationError('Invalid source: source must be a string')
  }
  if ((opts.source as string).trim() === '') {
    throw new ValidationError('Invalid source: source cannot be empty')
  }

  // Validate data
  if (opts.data === undefined || opts.data === null) {
    throw new ValidationError('Invalid data: data is required')
  }
  if (typeof opts.data !== 'object' || Array.isArray(opts.data)) {
    throw new ValidationError('Invalid data: data must be an object')
  }
}

/**
 * Validates send (action) options
 * @throws Error if options are invalid
 */
export function validateSendOptions(options: unknown): void {
  if (options === undefined || options === null) {
    throw new ValidationError('Invalid options: options is required')
  }

  if (typeof options !== 'object') {
    throw new ValidationError('Invalid options: options must be an object')
  }

  const opts = options as Record<string, unknown>

  // Validate actor
  if (opts.actor === undefined || opts.actor === null) {
    throw new ValidationError('Invalid actor: actor is required')
  }
  if (typeof opts.actor !== 'string') {
    throw new ValidationError('Invalid actor: actor must be a string')
  }
  if ((opts.actor as string).trim() === '') {
    throw new ValidationError('Invalid actor: actor cannot be empty')
  }

  // Validate object
  if (opts.object === undefined || opts.object === null) {
    throw new ValidationError('Invalid object: object is required')
  }
  if (typeof opts.object !== 'string') {
    throw new ValidationError('Invalid object: object must be a string')
  }
  if ((opts.object as string).trim() === '') {
    throw new ValidationError('Invalid object: object cannot be empty')
  }

  // Validate action
  if (opts.action === undefined || opts.action === null) {
    throw new ValidationError('Invalid action: action is required')
  }
  if (typeof opts.action !== 'string') {
    throw new ValidationError('Invalid action: action must be a string')
  }
  if ((opts.action as string).trim() === '') {
    throw new ValidationError('Invalid action: action cannot be empty')
  }

  // Validate status if provided
  if (opts.status !== undefined) {
    if (!VALID_ACTION_STATUSES.has(opts.status as string)) {
      throw new ValidationError('Invalid status: status is invalid (must be one of: pending, active, completed, failed, cancelled)')
    }
  }
}

/**
 * Validates storeArtifact options
 * @throws Error if options are invalid
 */
export function validateStoreArtifactOptions(options: unknown): void {
  if (options === undefined || options === null) {
    throw new ValidationError('Invalid options: options is required')
  }

  if (typeof options !== 'object') {
    throw new ValidationError('Invalid options: options must be an object')
  }

  const opts = options as Record<string, unknown>

  // Validate key
  if (opts.key === undefined || opts.key === null) {
    throw new ValidationError('Invalid key: key is required')
  }
  if (typeof opts.key !== 'string') {
    throw new ValidationError('Invalid key: key must be a string')
  }
  if ((opts.key as string).trim() === '') {
    throw new ValidationError('Invalid key: key cannot be empty')
  }

  // Validate type
  if (opts.type === undefined || opts.type === null) {
    throw new ValidationError('Invalid type: type is required')
  }
  if (typeof opts.type !== 'string') {
    throw new ValidationError('Invalid type: type must be a string')
  }

  // Validate source
  if (opts.source === undefined || opts.source === null) {
    throw new ValidationError('Invalid source: source is required')
  }
  if (typeof opts.source !== 'string') {
    throw new ValidationError('Invalid source: source must be a string')
  }

  // Validate sourceHash
  if (opts.sourceHash === undefined || opts.sourceHash === null) {
    throw new ValidationError('Invalid sourceHash: sourceHash is required')
  }
  if (typeof opts.sourceHash !== 'string') {
    throw new ValidationError('Invalid sourceHash: sourceHash must be a string')
  }

  // Validate content
  if (opts.content === undefined || opts.content === null) {
    throw new ValidationError('Invalid content: content is required')
  }

  // Validate ttl if provided
  if (opts.ttl !== undefined) {
    if (typeof opts.ttl !== 'number') {
      throw new ValidationError('Invalid ttl: ttl must be a number')
    }
    if (opts.ttl < 0) {
      throw new ValidationError('Invalid ttl: ttl cannot be negative')
    }
  }
}

/**
 * Validates getArtifact key parameter
 * @throws Error if key is invalid
 */
export function validateArtifactKey(key: unknown): asserts key is string {
  if (key === undefined || key === null) {
    throw new ValidationError('Invalid key: key is required')
  }

  if (typeof key !== 'string') {
    throw new ValidationError('Invalid key: key must be a string')
  }

  if (key.trim() === '') {
    throw new ValidationError('Invalid key: key cannot be empty')
  }
}

/**
 * Validates search query parameter
 * @throws Error if query is invalid
 */
export function validateSearchQuery(query: unknown): asserts query is string {
  if (query === undefined || query === null) {
    throw new ValidationError('Invalid query: query is required')
  }

  if (typeof query !== 'string') {
    throw new ValidationError('Invalid query: query must be a string')
  }

  if (query.trim() === '') {
    throw new ValidationError('Invalid query: query cannot be empty')
  }

  if (query.length > MAX_QUERY_LENGTH) {
    throw new ValidationError(`Invalid query: query length exceeds maximum of ${MAX_QUERY_LENGTH}`)
  }
}

/**
 * Validates search options
 * @throws Error if options are invalid
 */
export function validateSearchOptions(options: unknown): void {
  if (options === undefined || options === null) {
    return // Options are optional
  }

  if (typeof options !== 'object') {
    throw new ValidationError('Invalid options: options must be an object')
  }

  const opts = options as Record<string, unknown>

  // Validate limit
  if (opts.limit !== undefined) {
    if (typeof opts.limit !== 'number' || !Number.isFinite(opts.limit)) {
      throw new ValidationError('Invalid limit: limit must be a number')
    }
    if (opts.limit <= 0) {
      throw new ValidationError('Invalid limit: limit must be a positive number')
    }
  }

  // Validate collections
  if (opts.collections !== undefined) {
    if (!Array.isArray(opts.collections)) {
      throw new ValidationError('Invalid collections: collections must be an array')
    }
    for (const col of opts.collections) {
      if (typeof col !== 'string') {
        throw new ValidationError('Invalid collections: all collection names must be strings')
      }
    }
  }
}

/**
 * Validates invoke method name
 * @throws Error if method is invalid
 */
export function validateInvokeMethod(method: unknown): asserts method is string {
  if (method === undefined || method === null) {
    throw new ValidationError('Invalid method: method is required')
  }

  if (typeof method !== 'string') {
    throw new ValidationError('Invalid method: method must be a string')
  }

  if (method.trim() === '') {
    throw new ValidationError('Invalid method: method cannot be empty')
  }
}

/**
 * Validates invoke params
 * @throws Error if params is invalid
 */
export function validateInvokeParams(params: unknown): asserts params is unknown[] {
  if (params === undefined || params === null) {
    throw new ValidationError('Invalid params: params is required')
  }

  if (!Array.isArray(params)) {
    throw new ValidationError('Invalid params: params must be an array')
  }
}

/**
 * Validates ID in create data (if provided)
 * @throws Error if id in data is invalid
 */
export function validateDataId(data: Record<string, unknown>): void {
  if ('id' in data && data.id !== undefined) {
    if (typeof data.id !== 'string') {
      throw new ValidationError('Invalid id: id must be a string')
    }
    if ((data.id as string).trim() === '') {
      throw new ValidationError('Invalid id: id cannot be empty')
    }
  }
}
