/**
 * Registry API handlers for objects.do
 *
 * Handles CRUD operations for DO definitions stored in R2.
 *
 * @module registry
 */

import type { DODefinition, RegistryEntry, APIMethodDefinition, APIDefinition } from './types'
import { safeParseDODefinition } from './schema'
import { authenticate } from './auth'
import { jsonResponse, errorResponse } from './cors'

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Minimal R2 object interface for registry operations
 */
interface R2ObjectLike {
  key: string
  json<T = unknown>(): Promise<T>
}

/**
 * Minimal R2 bucket interface for registry operations
 */
interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>
  put(key: string, value: string | ArrayBuffer | ReadableStream): Promise<unknown>
  delete(key: string): Promise<void>
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    objects: Array<{ key: string }>
    truncated: boolean
    cursor?: string
  }>
}

/**
 * Minimal environment interface for registry operations
 */
interface RegistryEnv {
  REGISTRY: R2BucketLike
}

// =============================================================================
// Types
// =============================================================================

/**
 * Method information extracted from API definition
 */
interface MethodInfo {
  /** Method name */
  name: string
  /** Full path (e.g., 'users.get') */
  path: string
  /** Parameter names */
  params?: string[]
  /** Return type description */
  returns?: string
  /** Method description */
  description?: string
}

/**
 * Namespace information with its methods
 */
interface NamespaceInfo {
  /** Namespace name */
  name: string
  /** Methods in this namespace */
  methods: MethodInfo[]
}

/**
 * Schema extracted from a DO definition
 */
interface DOSchema {
  /** DO identifier */
  $id: string
  /** DO type */
  $type?: string
  /** Top-level and namespaced methods */
  methods: MethodInfo[]
  /** Nested namespaces */
  namespaces: NamespaceInfo[]
}

// =============================================================================
// Main Router
// =============================================================================

/**
 * Routes registry API requests to appropriate handlers
 *
 * @param request - The incoming request
 * @param env - Worker environment
 * @param path - Request path (e.g., '/registry/my-app.do')
 * @param method - HTTP method
 * @param url - Parsed URL
 * @returns Response for the registry operation
 */
export async function handleRegistryAPI(request: Request, env: RegistryEnv, path: string, method: string, url: URL): Promise<Response> {
  try {
    // GET /registry - List all definitions
    if (path === '/registry' && method === 'GET') {
      return handleListDefinitions(request, env, url)
    }

    // Match /registry/:id/schema
    const schemaMatch = path.match(/^\/registry\/([^/]+)\/schema$/)
    if (schemaMatch && method === 'GET') {
      return handleGetSchema(env, schemaMatch[1])
    }

    // Match /registry/:id
    const idMatch = path.match(/^\/registry\/([^/]+)$/)
    if (idMatch) {
      const id = idMatch[1]

      switch (method) {
        case 'PUT':
          return handleCreateOrUpdate(request, env, id)
        case 'GET':
          return handleGetDefinition(env, id)
        case 'DELETE':
          return handleDeleteDefinition(request, env, id)
        default:
          return errorResponse('METHOD_NOT_ALLOWED', `Method ${method} not allowed`, 405)
      }
    }

    return errorResponse('NOT_FOUND', 'Registry endpoint not found', 404)
  } catch (err) {
    console.error('Registry API error:', err)
    return errorResponse('INTERNAL_ERROR', 'Internal server error', 500)
  }
}

// =============================================================================
// Handler Functions
// =============================================================================

/**
 * PUT /registry/:id - Create or update a DO definition
 *
 * Requires authentication. Creates a new definition or updates an existing one.
 * The definition's $id must match the URL parameter.
 *
 * @param request - The incoming request with JSON body
 * @param env - Worker environment
 * @param id - Definition ID from URL
 * @returns Response with created/updated entry (201/200) or error
 */
async function handleCreateOrUpdate(request: Request, env: RegistryEnv, id: string): Promise<Response> {
  // Authenticate
  const auth = await authenticate(request, env)
  if (!auth.authenticated) {
    return errorResponse(auth.error!.code, auth.error!.message, 401)
  }

  // Parse JSON body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  // Validate DO definition
  const parseResult = safeParseDODefinition(body)
  if (!parseResult.success) {
    return errorResponse('INVALID_DEFINITION', parseResult.error.message, 400)
  }

  const definition = parseResult.data as DODefinition

  // Validate $id matches URL parameter
  if (definition.$id !== id) {
    return errorResponse('ID_MISMATCH', `Definition $id "${definition.$id}" does not match URL parameter "${id}"`, 400)
  }

  // Check if entry already exists
  let existingEntry: RegistryEntry | null = null
  try {
    const existing = await env.REGISTRY.get(id)
    if (existing) {
      existingEntry = await existing.json<RegistryEntry>()
    }
  } catch {
    // Entry doesn't exist or error reading - that's ok for create
  }

  const now = Date.now()
  const entry: RegistryEntry = {
    definition,
    createdAt: existingEntry?.createdAt ?? now,
    updatedAt: now,
    owner: auth.userId,
  }

  // Store in registry
  await env.REGISTRY.put(id, JSON.stringify(entry))

  const isUpdate = existingEntry !== null
  return jsonResponse(
    {
      id,
      definition,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      owner: auth.userId,
    },
    isUpdate ? 200 : 201
  )
}

/**
 * GET /registry - List all DO definitions
 *
 * Supports pagination via limit/cursor and filtering by type.
 *
 * @param request - The incoming request
 * @param env - Worker environment
 * @param url - Parsed URL with query params
 * @returns Response with items array and pagination info
 */
async function handleListDefinitions(request: Request, env: RegistryEnv, url: URL): Promise<Response> {
  const limit = parseInt(url.searchParams.get('limit') || '100', 10)
  const cursor = url.searchParams.get('cursor') || undefined
  const typeFilter = url.searchParams.get('type') || undefined

  // List objects from R2 (request one more than limit to detect if there are more)
  const listResult = await env.REGISTRY.list({ limit: limit + 1, cursor })

  // Fetch each entry to get full data
  const items: Array<{ id: string; $type?: string; createdAt: number; updatedAt: number }> = []

  // Only process up to limit items
  const objectsToProcess = listResult.objects.slice(0, limit)

  for (const obj of objectsToProcess) {
    try {
      const entryObj = await env.REGISTRY.get(obj.key)
      if (entryObj) {
        const entry = await entryObj.json<RegistryEntry>()

        // Apply type filter
        if (typeFilter && entry.definition.$type !== typeFilter) {
          continue
        }

        items.push({
          id: obj.key,
          $type: entry.definition.$type,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        })
      }
    } catch {
      // Skip entries that can't be parsed
    }
  }

  // Determine if there are more items
  const hasMore = listResult.objects.length > limit || listResult.truncated

  // Generate cursor: if we have more items, use the last key we processed or R2's cursor
  let nextCursor: string | undefined
  if (hasMore) {
    nextCursor = listResult.cursor || (objectsToProcess.length > 0 ? objectsToProcess[objectsToProcess.length - 1].key : undefined)
  }

  return jsonResponse({
    items,
    hasMore,
    cursor: nextCursor,
  })
}

/**
 * GET /registry/:id - Get a single DO definition
 *
 * @param env - Worker environment
 * @param id - Definition ID from URL
 * @returns Response with registry entry or 404 error
 */
async function handleGetDefinition(env: RegistryEnv, id: string): Promise<Response> {
  try {
    const obj = await env.REGISTRY.get(id)

    if (!obj) {
      return errorResponse('NOT_FOUND', `Definition "${id}" not found`, 404)
    }

    const entry = await obj.json<RegistryEntry>()
    return jsonResponse(entry)
  } catch (err) {
    console.error('Registry storage error:', err)
    return errorResponse('INTERNAL_ERROR', 'Internal server error', 500)
  }
}

/**
 * DELETE /registry/:id - Delete a DO definition
 *
 * Requires authentication and ownership verification.
 *
 * @param request - The incoming request
 * @param env - Worker environment
 * @param id - Definition ID from URL
 * @returns Response confirming deletion or error
 */
async function handleDeleteDefinition(request: Request, env: RegistryEnv, id: string): Promise<Response> {
  // Authenticate
  const auth = await authenticate(request, env)
  if (!auth.authenticated) {
    return errorResponse(auth.error!.code, auth.error!.message, 401)
  }

  // Check if entry exists
  const obj = await env.REGISTRY.get(id)
  if (!obj) {
    return errorResponse('NOT_FOUND', `Definition "${id}" not found`, 404)
  }

  // Check ownership
  const entry = await obj.json<RegistryEntry>()
  if (entry.owner && entry.owner !== auth.userId) {
    return errorResponse('FORBIDDEN', 'You do not have permission to delete this definition', 403)
  }

  // Delete from registry
  await env.REGISTRY.delete(id)

  return jsonResponse({ success: true, id })
}

/**
 * GET /registry/:id/schema - Get DO schema
 *
 * Public endpoint - no authentication required.
 * Extracts method and namespace information from the definition.
 *
 * @param env - Worker environment
 * @param id - Definition ID from URL
 * @returns Response with schema or 404 error
 */
async function handleGetSchema(env: RegistryEnv, id: string): Promise<Response> {
  const obj = await env.REGISTRY.get(id)

  if (!obj) {
    return errorResponse('NOT_FOUND', `Definition "${id}" not found`, 404)
  }

  const entry = await obj.json<RegistryEntry>()
  const schema = extractSchema(entry.definition)

  return jsonResponse(schema)
}

// =============================================================================
// Schema Extraction
// =============================================================================

/**
 * Extracts schema information from a DO definition
 *
 * Processes the API definition to extract:
 * - Top-level methods
 * - Nested namespaces with their methods
 * - Method metadata (params, returns, description)
 *
 * @param definition - The DO definition
 * @returns Schema with methods and namespaces
 */
export function extractSchema(definition: DODefinition): DOSchema {
  const methods: MethodInfo[] = []
  const namespaces: NamespaceInfo[] = []

  /**
   * Recursively processes an API definition
   */
  function processApi(api: APIDefinition, prefix = ''): void {
    for (const [key, value] of Object.entries(api)) {
      const path = prefix ? `${prefix}.${key}` : key

      if (typeof value === 'string') {
        // Simple string function
        methods.push({ name: key, path })
      } else if (typeof value === 'object' && value !== null) {
        if ('code' in value) {
          // Detailed method definition
          const methodDef = value as APIMethodDefinition
          methods.push({
            name: key,
            path,
            params: methodDef.params,
            returns: methodDef.returns,
            description: methodDef.description,
          })
        } else {
          // Nested namespace
          const namespaceMethods: MethodInfo[] = []

          for (const [subKey, subValue] of Object.entries(value)) {
            const subPath = `${path}.${subKey}`

            if (typeof subValue === 'string') {
              namespaceMethods.push({ name: subKey, path: subPath })
              methods.push({ name: subKey, path: subPath })
            } else if (typeof subValue === 'object' && subValue !== null && 'code' in subValue) {
              const methodDef = subValue as APIMethodDefinition
              const methodInfo: MethodInfo = {
                name: subKey,
                path: subPath,
                params: methodDef.params,
                returns: methodDef.returns,
                description: methodDef.description,
              }
              namespaceMethods.push(methodInfo)
              methods.push(methodInfo)
            }
          }

          if (namespaceMethods.length > 0) {
            namespaces.push({ name: key, methods: namespaceMethods })
          }
        }
      }
    }
  }

  if (definition.api) {
    processApi(definition.api)
  }

  return {
    $id: definition.$id,
    $type: definition.$type,
    methods,
    namespaces,
  }
}
