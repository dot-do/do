/**
 * Tier 1: Native In-Worker Execution
 *
 * Executes operations directly within the Cloudflare Worker runtime
 * with sub-millisecond latency. Handles filesystem operations, HTTP
 * requests, POSIX utilities, and data parsing.
 *
 * @module execution/native
 */

import type { ExecResult, ExecOptions, FileSystem } from '../../types/execution'

/**
 * Native operation handler function signature
 */
type NativeHandler = (
  args: unknown[],
  options: ExecOptions,
  fs?: FileSystem
) => Promise<unknown>

/**
 * Registry of native operation handlers
 */
const handlers: Map<string, NativeHandler> = new Map()

/**
 * Execute an operation natively in the worker.
 *
 * @param operation - The operation identifier (e.g., 'fs.readFile')
 * @param args - Arguments for the operation
 * @param options - Execution options
 * @param fs - Optional filesystem instance
 * @returns Promise resolving to the execution result
 *
 * @example
 * ```typescript
 * const result = await executeNative('json.parse', ['{"key": "value"}'])
 * // result.output = { key: 'value' }
 * ```
 */
export async function executeNative(
  operation: string,
  args: unknown[] = [],
  options: ExecOptions = {},
  fs?: FileSystem
): Promise<ExecResult> {
  const startTime = performance.now()

  try {
    const handler = handlers.get(operation)

    if (!handler) {
      return {
        success: false,
        tier: 1,
        duration: performance.now() - startTime,
        error: {
          code: 'UNKNOWN_OPERATION',
          message: `Unknown native operation: ${operation}`,
        },
      }
    }

    // Apply timeout if specified
    const timeout = options.timeout ?? 30000
    const result = await Promise.race([
      handler(args, options, fs),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), timeout)
      ),
    ])

    return {
      success: true,
      tier: 1,
      duration: performance.now() - startTime,
      output: result,
    }
  } catch (error) {
    return {
      success: false,
      tier: 1,
      duration: performance.now() - startTime,
      error: {
        code: 'NATIVE_ERROR',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    }
  }
}

/**
 * Register a native operation handler.
 *
 * @param operation - The operation identifier
 * @param handler - The handler function
 *
 * @example
 * ```typescript
 * registerNativeHandler('custom.operation', async (args) => {
 *   return args[0] + args[1]
 * })
 * ```
 */
export function registerNativeHandler(
  operation: string,
  handler: NativeHandler
): void {
  handlers.set(operation, handler)
}

/**
 * Check if a native handler exists for an operation.
 *
 * @param operation - The operation identifier
 * @returns True if a handler is registered
 */
export function hasNativeHandler(operation: string): boolean {
  return handlers.has(operation)
}

// =============================================================================
// JSON Operations
// =============================================================================

registerNativeHandler('json.parse', async (args) => {
  const [input, reviver] = args as [string, ((key: string, value: unknown) => unknown)?]
  return JSON.parse(input, reviver)
})

registerNativeHandler('json.stringify', async (args) => {
  const [value, replacer, space] = args as [unknown, unknown, number | string | undefined]
  return JSON.stringify(value, replacer as Parameters<typeof JSON.stringify>[1], space)
})

// =============================================================================
// String Operations
// =============================================================================

registerNativeHandler('string.split', async (args) => {
  const [str, separator, limit] = args as [string, string | RegExp, number?]
  return str.split(separator, limit)
})

registerNativeHandler('string.join', async (args) => {
  const [arr, separator] = args as [string[], string]
  return arr.join(separator)
})

registerNativeHandler('string.replace', async (args) => {
  const [str, search, replacement] = args as [string, string | RegExp, string]
  return str.replace(search, replacement)
})

registerNativeHandler('string.match', async (args) => {
  const [str, pattern] = args as [string, string | RegExp]
  return str.match(pattern)
})

registerNativeHandler('string.trim', async (args) => {
  const [str] = args as [string]
  return str.trim()
})

// =============================================================================
// Encoding Operations
// =============================================================================

registerNativeHandler('encoding.base64Encode', async (args) => {
  const [input] = args as [string | Uint8Array]
  if (typeof input === 'string') {
    return btoa(input)
  }
  return btoa(String.fromCharCode(...input))
})

registerNativeHandler('encoding.base64Decode', async (args) => {
  const [input] = args as [string]
  return atob(input)
})

registerNativeHandler('encoding.urlEncode', async (args) => {
  const [input] = args as [string]
  return encodeURIComponent(input)
})

registerNativeHandler('encoding.urlDecode', async (args) => {
  const [input] = args as [string]
  return decodeURIComponent(input)
})

registerNativeHandler('encoding.hexEncode', async (args) => {
  const [input] = args as [string | Uint8Array]
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
})

registerNativeHandler('encoding.hexDecode', async (args) => {
  const [input] = args as [string]
  const bytes = new Uint8Array(input.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(input.substr(i * 2, 2), 16)
  }
  return bytes
})

// =============================================================================
// Crypto Operations
// =============================================================================

registerNativeHandler('crypto.randomUUID', async () => {
  return crypto.randomUUID()
})

registerNativeHandler('crypto.hash', async (args) => {
  const [algorithm, data] = args as [string, string | Uint8Array]
  const encoder = new TextEncoder()
  const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data
  const hashBuffer = await crypto.subtle.digest(algorithm, dataBuffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
})

registerNativeHandler('crypto.hmac', async (args) => {
  const [algorithm, key, data] = args as [string, string, string]
  const encoder = new TextEncoder()
  const keyData = encoder.encode(key)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
})

// =============================================================================
// HTTP Operations
// =============================================================================

registerNativeHandler('http.fetch', async (args) => {
  const [url, options] = args as [string, RequestInit?]
  const response = await fetch(url, options)
  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  }
})

registerNativeHandler('http.get', async (args) => {
  const [url, headers] = args as [string, Record<string, string>?]
  const response = await fetch(url, { method: 'GET', headers })
  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  }
})

registerNativeHandler('http.post', async (args) => {
  const [url, body, headers] = args as [string, unknown, Record<string, string>?]
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  }
})

// =============================================================================
// POSIX Utilities
// =============================================================================

registerNativeHandler('posix.echo', async (args) => {
  return args.join(' ')
})

registerNativeHandler('posix.cat', async (args, _options, fs) => {
  if (!fs) {
    throw new Error('Filesystem not provided')
  }
  const [paths] = args as [string[]]
  const contents = await Promise.all(
    paths.map((p) => fs.readFile(p, 'utf-8'))
  )
  return contents.join('')
})

registerNativeHandler('posix.head', async (args) => {
  const [input, lines = 10] = args as [string, number?]
  return input.split('\n').slice(0, lines).join('\n')
})

registerNativeHandler('posix.tail', async (args) => {
  const [input, lines = 10] = args as [string, number?]
  const allLines = input.split('\n')
  return allLines.slice(-lines).join('\n')
})

registerNativeHandler('posix.wc', async (args) => {
  const [input, mode = 'lwc'] = args as [string, string?]
  const lines = input.split('\n').length
  const words = input.split(/\s+/).filter(Boolean).length
  const chars = input.length

  if (mode === 'l') return lines
  if (mode === 'w') return words
  if (mode === 'c') return chars
  return { lines, words, chars }
})

registerNativeHandler('posix.sort', async (args) => {
  const [input, options] = args as [string, { numeric?: boolean; reverse?: boolean }?]
  const lines = input.split('\n')

  if (options?.numeric) {
    lines.sort((a, b) => parseFloat(a) - parseFloat(b))
  } else {
    lines.sort()
  }

  if (options?.reverse) {
    lines.reverse()
  }

  return lines.join('\n')
})

registerNativeHandler('posix.uniq', async (args) => {
  const [input] = args as [string]
  const lines = input.split('\n')
  return lines.filter((line, i) => i === 0 || line !== lines[i - 1]).join('\n')
})

registerNativeHandler('posix.grep', async (args) => {
  const [pattern, input, flags] = args as [string, string, string?]
  const regex = new RegExp(pattern, flags)
  return input
    .split('\n')
    .filter((line) => regex.test(line))
    .join('\n')
})

registerNativeHandler('posix.base64', async (args) => {
  const [input, decode = false] = args as [string, boolean?]
  if (decode) {
    return atob(input)
  }
  return btoa(input)
})

// =============================================================================
// Filesystem Operations (delegated to fsx)
// =============================================================================

registerNativeHandler('fs.readFile', async (args, _options, fs) => {
  if (!fs) throw new Error('Filesystem not provided')
  const [path, encoding] = args as [string, 'utf-8'?]
  return fs.readFile(path, encoding)
})

registerNativeHandler('fs.writeFile', async (args, _options, fs) => {
  if (!fs) throw new Error('Filesystem not provided')
  const [path, data] = args as [string, string | Uint8Array]
  return fs.writeFile(path, data)
})

registerNativeHandler('fs.exists', async (args, _options, fs) => {
  if (!fs) throw new Error('Filesystem not provided')
  const [path] = args as [string]
  return fs.exists(path)
})

registerNativeHandler('fs.mkdir', async (args, _options, fs) => {
  if (!fs) throw new Error('Filesystem not provided')
  const [path, options] = args as [string, { recursive?: boolean }?]
  return fs.mkdir(path, options)
})

registerNativeHandler('fs.readdir', async (args, _options, fs) => {
  if (!fs) throw new Error('Filesystem not provided')
  const [path, options] = args as [string, { withFileTypes?: boolean }?]
  return fs.readdir(path, options)
})

registerNativeHandler('fs.stat', async (args, _options, fs) => {
  if (!fs) throw new Error('Filesystem not provided')
  const [path] = args as [string]
  return fs.stat(path)
})

registerNativeHandler('fs.unlink', async (args, _options, fs) => {
  if (!fs) throw new Error('Filesystem not provided')
  const [path] = args as [string]
  return fs.unlink(path)
})

registerNativeHandler('fs.rename', async (args, _options, fs) => {
  if (!fs) throw new Error('Filesystem not provided')
  const [oldPath, newPath] = args as [string, string]
  return fs.rename(oldPath, newPath)
})

registerNativeHandler('fs.copyFile', async (args, _options, fs) => {
  if (!fs) throw new Error('Filesystem not provided')
  const [src, dest] = args as [string, string]
  return fs.copyFile(src, dest)
})
