/**
 * CORS handling utilities for objects.do
 *
 * Provides CORS headers, preflight handling, and response helpers.
 *
 * @module cors
 */

// =============================================================================
// CORS Configuration
// =============================================================================

/**
 * Default CORS headers for API responses
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
} as const

// =============================================================================
// Response Helpers
// =============================================================================

/**
 * Creates a JSON response with CORS headers
 *
 * @param data - The data to serialize as JSON
 * @param status - HTTP status code (default: 200)
 * @returns Response with JSON body and CORS headers
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  })
}

/**
 * Creates an error response with CORS headers
 *
 * @param code - Error code string
 * @param message - Error message
 * @param status - HTTP status code
 * @returns Response with error JSON body and CORS headers
 */
export function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } }, status)
}

/**
 * Creates a CORS preflight response (204 No Content)
 *
 * @returns Response for OPTIONS requests
 */
export function preflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}

/**
 * Handles OPTIONS preflight requests
 *
 * @param request - The incoming request
 * @returns Preflight response if OPTIONS request, null otherwise
 */
export function handlePreflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return preflightResponse()
  }
  return null
}

/**
 * Adds CORS headers to an existing response
 *
 * @param response - The response to add headers to
 * @returns New response with CORS headers
 */
export function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
