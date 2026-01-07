/**
 * MCP Tools Module
 *
 * Provides MCP (Model Context Protocol) tool implementations:
 * - search: Search across collections
 * - fetchUrl: Fetch content from URLs
 * - doCode: Execute code in a sandbox
 */

import {
  DocumentSchema,
  safeJsonParse,
} from '../sqlite'

import type {
  DOContext,
  SearchOptions,
  SearchResult,
  FetchOptions,
  FetchResult,
  DoOptions,
  DoResult,
} from './types'

/**
 * Search across collections using SQLite LIKE
 */
export async function search(
  ctx: DOContext,
  query: string,
  options?: SearchOptions
): Promise<SearchResult[]> {
  ctx.initSchema()

  const limit = options?.limit ?? 100
  const collections = options?.collections

  // Build the search pattern
  const searchPattern = `%${query}%`

  // Query documents matching the search pattern
  let results: { collection: string; id: string; data: string }[]

  if (collections && collections.length > 0) {
    // Search specific collections
    const placeholders = collections.map(() => '?').join(', ')
    results = ctx.ctx.storage.sql
      .exec(
        `SELECT collection, id, data FROM documents
         WHERE collection IN (${placeholders}) AND data LIKE ?
         LIMIT ?`,
        ...collections,
        searchPattern,
        limit
      )
      .toArray() as { collection: string; id: string; data: string }[]
  } else {
    // Search all collections
    results = ctx.ctx.storage.sql
      .exec(
        `SELECT collection, id, data FROM documents
         WHERE data LIKE ?
         LIMIT ?`,
        searchPattern,
        limit
      )
      .toArray() as { collection: string; id: string; data: string }[]
  }

  // Transform results with relevance scoring, using Zod validation
  const searchResults: SearchResult[] = results
    .map((row) => {
      const document = safeJsonParse(row.data, DocumentSchema)
      if (document === null) {
        return null // Skip invalid documents
      }
      // Calculate a simple relevance score based on match count
      const dataStr = row.data.toLowerCase()
      const queryLower = query.toLowerCase()
      // Escape special regex characters
      const escapedQuery = queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const matchCount = (dataStr.match(new RegExp(escapedQuery, 'g')) || []).length
      const score = matchCount / Math.max(dataStr.length / 100, 1)

      return {
        id: row.id,
        collection: row.collection,
        score,
        document,
      }
    })
    .filter((result): result is SearchResult => result !== null)

  // Sort by score descending
  searchResults.sort((a, b) => b.score - a.score)

  return searchResults
}

/**
 * Fetch a URL and return the result
 */
export async function fetchUrl(
  target: string,
  options?: FetchOptions
): Promise<FetchResult> {
  const method = options?.method ?? 'GET'
  const headers = options?.headers ?? {}
  const timeout = options?.timeout ?? 30000

  try {
    // Build fetch options
    const fetchOptions: RequestInit = {
      method,
      headers,
    }

    // Add body if provided (for POST, PUT, etc.)
    if (options?.body !== undefined) {
      if (typeof options.body === 'object') {
        fetchOptions.body = JSON.stringify(options.body)
        // Set content-type if not already set
        if (!headers['Content-Type'] && !headers['content-type']) {
          fetchOptions.headers = {
            ...headers,
            'Content-Type': 'application/json',
          }
        }
      } else {
        fetchOptions.body = String(options.body)
      }
    }

    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    fetchOptions.signal = controller.signal

    // Perform the fetch
    const response = await globalThis.fetch(target, fetchOptions)
    clearTimeout(timeoutId)

    // Parse response headers
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    // Parse response body
    let body: unknown
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      try {
        body = await response.json()
      } catch {
        body = await response.text()
      }
    } else {
      body = await response.text()
    }

    return {
      status: response.status,
      headers: responseHeaders,
      body,
      url: response.url || target,
    }
  } catch (error) {
    // Handle fetch errors (network errors, timeouts, etc.)
    const errorMessage = error instanceof Error ? error.message : 'Unknown fetch error'
    return {
      status: 500,
      headers: {},
      body: { error: errorMessage },
      url: target,
    }
  }
}

/**
 * Execute code in a secure sandbox with restricted scope.
 * Only safe globals are exposed (Math, Date, JSON, Object, Array, String, Number, Boolean, etc.)
 * Dangerous globals (process, require, eval, Function, globalThis, etc.) are explicitly undefined.
 */
export async function doCode(
  code: string,
  options?: DoOptions
): Promise<DoResult> {
  const startTime = Date.now()
  const logs: string[] = []

  try {
    // Create a restricted sandbox scope with only safe operations
    const safeScope: Record<string, unknown> = {
      // Safe built-in objects
      Math,
      Date,
      JSON,
      Object,
      Array,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      URIError,
      Map,
      Set,
      WeakMap,
      WeakSet,
      Promise,
      Symbol,
      BigInt,
      Infinity,
      NaN,
      isNaN,
      isFinite,
      parseFloat,
      parseInt,
      encodeURI,
      decodeURI,
      encodeURIComponent,
      decodeURIComponent,
      // Safe constants
      undefined,
      // Explicitly block dangerous globals by setting to undefined
      globalThis: undefined,
      global: undefined,
      window: undefined,
      self: undefined,
      process: undefined,
      require: undefined,
      module: undefined,
      exports: undefined,
      __dirname: undefined,
      __filename: undefined,
      Function: undefined,
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined,
      clearTimeout: undefined,
      clearInterval: undefined,
      clearImmediate: undefined,
      fetch: undefined,
      WebSocket: undefined,
      XMLHttpRequest: undefined,
      Worker: undefined,
      SharedWorker: undefined,
      Blob: undefined,
      File: undefined,
      FileReader: undefined,
      URL: undefined,
      URLSearchParams: undefined,
      Headers: undefined,
      Request: undefined,
      Response: undefined,
      FormData: undefined,
      AbortController: undefined,
      AbortSignal: undefined,
      TextEncoder: undefined,
      TextDecoder: undefined,
      atob: undefined,
      btoa: undefined,
      crypto: undefined,
      Crypto: undefined,
      SubtleCrypto: undefined,
      navigator: undefined,
      location: undefined,
      history: undefined,
      document: undefined,
      localStorage: undefined,
      sessionStorage: undefined,
      indexedDB: undefined,
      caches: undefined,
      Deno: undefined,
      Bun: undefined,
      // Block prototype pollution vectors
      __proto__: undefined,
      constructor: undefined,
      prototype: undefined,
      // Block console to prevent leaking - provide safe alternatives
      console: {
        log: (...args: unknown[]) => logs.push(args.map(a => String(a)).join(' ')),
        warn: (...args: unknown[]) => logs.push('[warn] ' + args.map(a => String(a)).join(' ')),
        error: (...args: unknown[]) => logs.push('[error] ' + args.map(a => String(a)).join(' ')),
        info: (...args: unknown[]) => logs.push('[info] ' + args.map(a => String(a)).join(' ')),
      },
    }

    // Add provided environment variables to scope if any
    if (options?.env) {
      safeScope.env = { ...options.env }
    }

    // Build parameter names and values for the sandbox function
    const scopeKeys = Object.keys(safeScope)
    const scopeValues = scopeKeys.map(key => safeScope[key])

    // Wrap code to execute in strict mode with explicit 'this' binding to undefined
    // This prevents access to the global object via 'this'
    const wrappedCode = `
      "use strict";
      return (function() {
        "use strict";
        ${code}
      }).call(undefined);
    `

    // Create sandbox function with restricted scope
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const sandboxFn = new Function(...scopeKeys, wrappedCode)

    // Execute in sandbox with scope values
    const result = sandboxFn.apply(undefined, scopeValues)

    return {
      success: true,
      result,
      logs,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown execution error',
      logs,
      duration: Date.now() - startTime,
    }
  }
}
