/**
 * DO Inline Snippet - Minimal Inline Code for HTML Embedding
 *
 * This generates the inline JavaScript that can be embedded in HTML
 * before the full SDK loads. It queues events and initializes the
 * connection.
 *
 * Usage in HTML:
 * ```html
 * <script>
 *   // Inline snippet (minified version of this)
 *   !function(d,o){d[o]=d[o]||[];d[o].q=[];d[o].t=Date.now();
 *   d[o].push=function(){d[o].q.push([Date.now(),arguments])}}(window,'$do');
 * </script>
 * <script async src="https://cdn.do/sdk.js"></script>
 * ```
 *
 * Then in your code:
 * ```javascript
 * window.$do.push(['connect', 'https://myapp.do'])
 * window.$do.push(['track', 'pageview', { path: location.pathname }])
 * ```
 */

// =============================================================================
// Inline Snippet (for minification and embedding)
// =============================================================================

/**
 * The inline snippet function
 * This gets minified and embedded in HTML
 */
export function inlineSnippet() {
  interface DOQueue {
    q: Array<[number, IArguments]>
    t: number
    push: (...args: unknown[]) => void
  }

  const w = window as unknown as { $do: DOQueue }
  const name = '$do'

  // Initialize queue if not exists
  w[name] = w[name] || ([] as unknown as DOQueue)
  w[name].q = []
  w[name].t = Date.now()

  // Override push to queue with timestamp
  w[name].push = function() {
    w[name].q.push([Date.now(), arguments])
  }
}

/**
 * Minified version for embedding
 * Generated from the above function
 */
export const INLINE_SNIPPET = `!function(w,n){w[n]=w[n]||[];w[n].q=[];w[n].t=Date.now();w[n].push=function(){w[n].q.push([Date.now(),arguments])}}(window,'$do');`

/**
 * Full snippet with async SDK loading
 */
export function generateSnippet(options: {
  sdkUrl: string
  doUrl?: string
  autoConnect?: boolean
  autoTrack?: boolean
}): string {
  const { sdkUrl, doUrl, autoConnect = true, autoTrack = true } = options

  let snippet = INLINE_SNIPPET + '\n'

  // Add SDK script
  snippet += `(function(){var s=document.createElement('script');s.async=true;s.src='${sdkUrl}';document.head.appendChild(s);})();\n`

  // Auto-connect
  if (autoConnect && doUrl) {
    snippet += `window.$do.push(['connect','${doUrl}']);\n`
  }

  // Auto-track pageview
  if (autoTrack) {
    snippet += `window.$do.push(['track','pageview',{path:location.pathname,referrer:document.referrer}]);\n`
  }

  return snippet
}

// =============================================================================
// SDK Loader (processes queued events)
// =============================================================================

/**
 * Process queued events from inline snippet
 * Called by the full SDK when it loads
 */
export function processQueue(): void {
  interface DOQueue {
    q: Array<[number, IArguments]>
    t: number
    push: (...args: unknown[]) => void
  }

  const w = window as unknown as { $do: DOQueue }
  const queue = w.$do?.q || []

  for (const [timestamp, args] of queue) {
    const [command, ...params] = Array.from(args)
    console.log(`[DO SDK] Processing queued command from ${new Date(timestamp).toISOString()}:`, command, params)

    // Process based on command
    switch (command) {
      case 'connect':
        // Will be handled by SDK
        break
      case 'track':
        // Will be handled by SDK
        break
      case 'identify':
        // Will be handled by SDK
        break
      default:
        console.warn(`[DO SDK] Unknown command: ${command}`)
    }
  }

  // Clear queue
  w.$do.q = []

  // Replace push with real SDK method
  // (Done by the full SDK)
}

// =============================================================================
// HTML Helper
// =============================================================================

/**
 * Generate complete HTML script tags
 */
export function generateHTMLSnippet(options: {
  sdkUrl: string
  doUrl?: string
  autoConnect?: boolean
  autoTrack?: boolean
}): string {
  return `<script>
${generateSnippet(options)}
</script>`
}

export default {
  INLINE_SNIPPET,
  generateSnippet,
  generateHTMLSnippet,
  processQueue,
}
