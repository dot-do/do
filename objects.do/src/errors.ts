/**
 * Error handling utilities for objects.do
 *
 * Provides consistent error codes, factory functions, and HTTP status mapping.
 *
 * @module errors
 */

// =============================================================================
// Error Codes
// =============================================================================

/**
 * Standard error codes used across the API
 */
export const ERROR_CODES = {
  // Authentication errors (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_AUTH_SCHEME: 'INVALID_AUTH_SCHEME',

  // Authorization errors (403)
  FORBIDDEN: 'FORBIDDEN',

  // Not found errors (404)
  NOT_FOUND: 'NOT_FOUND',

  // Client errors (400)
  INVALID_JSON: 'INVALID_JSON',
  INVALID_DEFINITION: 'INVALID_DEFINITION',
  ID_MISMATCH: 'ID_MISMATCH',
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // Method errors (405)
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',

  // Server errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

// =============================================================================
// HTTP Status Mapping
// =============================================================================

/**
 * Maps error codes to HTTP status codes
 */
export const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.INVALID_TOKEN]: 401,
  [ERROR_CODES.INVALID_AUTH_SCHEME]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.INVALID_JSON]: 400,
  [ERROR_CODES.INVALID_DEFINITION]: 400,
  [ERROR_CODES.ID_MISMATCH]: 400,
  [ERROR_CODES.VALIDATION_ERROR]: 400,
  [ERROR_CODES.METHOD_NOT_ALLOWED]: 405,
  [ERROR_CODES.INTERNAL_ERROR]: 500,
}

/**
 * Gets the HTTP status code for an error code
 */
export function getStatusForError(code: ErrorCode): number {
  return ERROR_STATUS_MAP[code] ?? 500
}

// =============================================================================
// API Error Class
// =============================================================================

/**
 * API error with code, message, and HTTP status
 */
export class APIError extends Error {
  readonly code: ErrorCode
  readonly status: number

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'APIError'
    this.code = code
    this.status = getStatusForError(code)
  }

  /**
   * Converts the error to a JSON-serializable object
   */
  toJSON(): { error: { code: ErrorCode; message: string } } {
    return {
      error: {
        code: this.code,
        message: this.message,
      },
    }
  }
}

// =============================================================================
// Error Factory Functions
// =============================================================================

/**
 * Creates an unauthorized error (401)
 */
export function unauthorized(message = 'Authentication required'): APIError {
  return new APIError(ERROR_CODES.UNAUTHORIZED, message)
}

/**
 * Creates an invalid token error (401)
 */
export function invalidToken(message = 'Invalid token'): APIError {
  return new APIError(ERROR_CODES.INVALID_TOKEN, message)
}

/**
 * Creates an invalid auth scheme error (401)
 */
export function invalidAuthScheme(message = 'Only Bearer token authentication is supported'): APIError {
  return new APIError(ERROR_CODES.INVALID_AUTH_SCHEME, message)
}

/**
 * Creates a forbidden error (403)
 */
export function forbidden(message = 'You do not have permission to perform this action'): APIError {
  return new APIError(ERROR_CODES.FORBIDDEN, message)
}

/**
 * Creates a not found error (404)
 */
export function notFound(resource: string): APIError {
  return new APIError(ERROR_CODES.NOT_FOUND, `${resource} not found`)
}

/**
 * Creates an invalid JSON error (400)
 */
export function invalidJSON(message = 'Request body must be valid JSON'): APIError {
  return new APIError(ERROR_CODES.INVALID_JSON, message)
}

/**
 * Creates an invalid definition error (400)
 */
export function invalidDefinition(message: string): APIError {
  return new APIError(ERROR_CODES.INVALID_DEFINITION, message)
}

/**
 * Creates an ID mismatch error (400)
 */
export function idMismatch(definitionId: string, urlId: string): APIError {
  return new APIError(ERROR_CODES.ID_MISMATCH, `Definition $id "${definitionId}" does not match URL parameter "${urlId}"`)
}

/**
 * Creates a validation error (400)
 */
export function validationError(message: string): APIError {
  return new APIError(ERROR_CODES.VALIDATION_ERROR, message)
}

/**
 * Creates a method not allowed error (405)
 */
export function methodNotAllowed(method: string): APIError {
  return new APIError(ERROR_CODES.METHOD_NOT_ALLOWED, `Method ${method} not allowed`)
}

/**
 * Creates an internal error (500)
 */
export function internalError(message = 'Internal server error'): APIError {
  return new APIError(ERROR_CODES.INTERNAL_ERROR, message)
}
