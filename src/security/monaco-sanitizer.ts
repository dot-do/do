/**
 * Monaco Editor XSS Sanitizer
 *
 * Provides comprehensive XSS prevention for Monaco editor integration.
 * Handles script injection, event handlers, dangerous URIs, SVG attacks,
 * and CSS expression injection.
 */

/**
 * Configuration options for the MonacoSanitizer
 */
export interface SanitizerOptions {
  /** Allow safe data: URIs (images only). Default: true */
  allowDataUris?: boolean
  /** Allow SVG content (with sanitization). Default: true */
  allowSvg?: boolean
  /** Additional allowed HTML tags beyond defaults */
  customAllowedTags?: string[]
  /** Additional blocked patterns to check */
  customBlockedPatterns?: RegExp[]
  /** Enable most restrictive sanitization. Default: false */
  strictMode?: boolean
}

/**
 * Information about an XSS violation found in input
 */
export interface Violation {
  type: string
  pattern: string
  match: string
  position: number
}

// Default safe data URI prefixes (safe image types only)
const SAFE_DATA_URI_PREFIXES = [
  'data:image/png',
  'data:image/jpeg',
  'data:image/jpg',
  'data:image/gif',
  'data:image/webp',
  'data:image/bmp',
  'data:image/ico',
  'data:image/x-icon',
]

// Dangerous URI schemes
const DANGEROUS_URI_SCHEMES = [
  'javascript:',
  'vbscript:',
  'livescript:',
  'mocha:',
  'data:text/html',
  'data:application/xhtml',
  'data:image/svg+xml',
]

// Event handler attribute patterns (comprehensive list)
const EVENT_HANDLER_PATTERN =
  /\bon(abort|afterprint|animationend|animationiteration|animationstart|beforeprint|beforeunload|blur|canplay|canplaythrough|change|click|contextmenu|copy|cut|dblclick|drag|dragend|dragenter|dragleave|dragover|dragstart|drop|durationchange|emptied|ended|error|focus|focusin|focusout|formdata|fullscreenchange|fullscreenerror|gotpointercapture|hashchange|input|invalid|keydown|keypress|keyup|languagechange|load|loadeddata|loadedmetadata|loadstart|lostpointercapture|message|mousedown|mouseenter|mouseleave|mousemove|mouseout|mouseover|mouseup|offline|online|open|pagehide|pageshow|paste|pause|play|playing|pointercancel|pointerdown|pointerenter|pointerleave|pointermove|pointerout|pointerover|pointerup|popstate|progress|ratechange|readystatechange|reset|resize|scroll|search|seeked|seeking|select|selectionchange|selectstart|stalled|storage|submit|suspend|timeupdate|toggle|touchcancel|touchend|touchmove|touchstart|transitionend|transitionrun|transitionstart|unhandledrejection|unload|volumechange|waiting|wheel|begin|end|repeat)\s*=/gi

// Script tag patterns (various obfuscation attempts)
const SCRIPT_TAG_PATTERNS = [
  /<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi,
  /<\s*script[^>]*>/gi,
  /<\s*\/\s*script\s*>/gi,
  /<scr\x00ipt/gi,
  /<scr\u0000ipt/gi,
]

// SVG dangerous elements
const SVG_DANGEROUS_ELEMENTS = [
  /<\s*svg:script[^>]*>[\s\S]*?<\s*\/\s*svg:script\s*>/gi,
  /<\s*foreignObject[^>]*>[\s\S]*?<\s*\/\s*foreignObject\s*>/gi,
  /<\s*set\s+[^>]*to\s*=\s*["'][^"']*script[^"']*["'][^>]*>/gi,
  /<\s*animate\s+[^>]*values\s*=\s*["'][^"']*script[^"']*["'][^>]*>/gi,
]

// CSS dangerous patterns
const CSS_DANGEROUS_PATTERNS = [
  /expression\s*\(/gi,
  /expr\s*\/\*.*?\*\/\s*ession\s*\(/gi,
  /behavior\s*:/gi,
  /-moz-binding\s*:/gi,
  /-webkit-binding\s*:/gi,
  /url\s*\(\s*["']?\s*javascript:/gi,
  /url\s*\(\s*["']?\s*data:text\/html/gi,
  /url\s*\(\s*["']?\s*data:application\/xhtml/gi,
  /@import\s+["']?\s*javascript:/gi,
  /@import\s+["']?\s*data:text\/html/gi,
]

/**
 * Remove null bytes and other control characters that could be used for obfuscation
 */
function removeControlCharacters(input: string): string {
  // Remove null bytes and other control characters (except newlines, tabs, carriage returns)
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

/**
 * Decode HTML entities that could be used for obfuscation
 */
function decodeHtmlEntities(input: string): string {
  const entities: Record<string, string> = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#47;': '/',
    '&#60;': '<',
    '&#62;': '>',
    '&#38;': '&',
    '&#34;': '"',
  }

  let result = input
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'gi'), char)
  }

  // Handle numeric HTML entities
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))

  return result
}

/**
 * Decode URL-encoded characters
 */
function decodeUrlEncoding(input: string): string {
  try {
    // Iteratively decode until no more changes (handles double encoding)
    let result = input
    let prev = ''
    let iterations = 0
    const maxIterations = 10 // Prevent infinite loops

    while (prev !== result && iterations < maxIterations) {
      prev = result
      result = decodeURIComponent(result.replace(/\+/g, ' '))
      iterations++
    }

    return result
  } catch {
    // If decoding fails, return original
    return input
  }
}

/**
 * Remove whitespace characters that could be used for obfuscation within protocol names
 */
function removeWhitespaceInProtocols(input: string): string {
  // Remove whitespace/tabs within javascript:, vbscript:, etc.
  return input.replace(/j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, 'javascript:')
    .replace(/v\s*b\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, 'vbscript:')
}

/**
 * Normalize input by decoding various encoding schemes
 */
function normalizeInput(input: string): string {
  let normalized = removeControlCharacters(input)
  normalized = decodeHtmlEntities(normalized)
  normalized = decodeUrlEncoding(normalized)
  normalized = removeWhitespaceInProtocols(normalized)
  return normalized
}

/**
 * Check if a data URI is safe (only allows safe image types)
 */
function isSafeDataUri(uri: string): boolean {
  const normalizedUri = uri.toLowerCase().trim()

  // Check against safe prefixes
  for (const prefix of SAFE_DATA_URI_PREFIXES) {
    if (normalizedUri.startsWith(prefix)) {
      // Additional check: make sure it doesn't contain script in the decoded content
      try {
        const base64Match = uri.match(/base64,(.*)$/i)
        if (base64Match) {
          const decoded = atob(base64Match[1])
          // Check for any XSS patterns in decoded content
          if (/<script|javascript:|vbscript:|on\w+\s*=|<\/script>/i.test(decoded)) {
            return false
          }
        }
      } catch {
        // If we can't decode, be cautious and reject
        return false
      }
      return true
    }
  }

  return false
}

/**
 * Check if a URI scheme is dangerous
 */
function isDangerousUri(uri: string): boolean {
  const normalizedUri = normalizeInput(uri).toLowerCase().replace(/\s+/g, '')

  for (const scheme of DANGEROUS_URI_SCHEMES) {
    if (normalizedUri.includes(scheme)) {
      return true
    }
  }

  // Check for blob: and filesystem: URIs
  if (normalizedUri.startsWith('blob:') || normalizedUri.startsWith('filesystem:')) {
    return true
  }

  return false
}

/**
 * Remove script tags (including obfuscated versions)
 */
function removeScriptTags(input: string): string {
  let result = input

  for (const pattern of SCRIPT_TAG_PATTERNS) {
    result = result.replace(pattern, '')
  }

  // Handle nested script tags
  let prev = ''
  let iterations = 0
  const maxIterations = 100

  while (prev !== result && iterations < maxIterations) {
    prev = result
    for (const pattern of SCRIPT_TAG_PATTERNS) {
      result = result.replace(pattern, '')
    }
    iterations++
  }

  return result
}

/**
 * Remove event handler attributes
 */
function removeEventHandlers(input: string): string {
  let result = input

  // Remove event handlers with various quote styles and no quotes
  result = result.replace(EVENT_HANDLER_PATTERN, '')

  // Handle whitespace/newline obfuscation in on* attributes
  result = result.replace(
    /\bon\s*[\r\n\t]+\s*(abort|afterprint|animationend|animationiteration|animationstart|beforeprint|beforeunload|blur|canplay|canplaythrough|change|click|contextmenu|copy|cut|dblclick|drag|dragend|dragenter|dragleave|dragover|dragstart|drop|durationchange|emptied|ended|error|focus|focusin|focusout|formdata|fullscreenchange|fullscreenerror|gotpointercapture|hashchange|input|invalid|keydown|keypress|keyup|languagechange|load|loadeddata|loadedmetadata|loadstart|lostpointercapture|message|mousedown|mouseenter|mouseleave|mousemove|mouseout|mouseover|mouseup|offline|online|open|pagehide|pageshow|paste|pause|play|playing|pointercancel|pointerdown|pointerenter|pointerleave|pointermove|pointerout|pointerover|pointerup|popstate|progress|ratechange|readystatechange|reset|resize|scroll|search|seeked|seeking|select|selectionchange|selectstart|stalled|storage|submit|suspend|timeupdate|toggle|touchcancel|touchend|touchmove|touchstart|transitionend|transitionrun|transitionstart|unhandledrejection|unload|volumechange|waiting|wheel|begin|end|repeat)\s*=/gi,
    ''
  )

  return result
}

/**
 * Sanitize dangerous URIs in attributes
 */
function sanitizeDangerousUris(input: string, allowDataUris: boolean): string {
  let result = input

  // Remove javascript: protocol in href, src, action, formaction attributes
  result = result.replace(
    /(href|src|action|formaction|xlink:href)\s*=\s*["']?\s*(javascript:|vbscript:|livescript:|mocha:)[^"'\s>]*/gi,
    '$1=""'
  )

  // Handle data: URIs
  result = result.replace(/(href|src|action|formaction|xlink:href)\s*=\s*["']?\s*(data:[^"'\s>]*)/gi, (match, attr, dataUri) => {
    // First check if it's explicitly dangerous
    if (isDangerousUri(dataUri)) {
      return `${attr}=""`
    }
    // Then check if it's safe (only if allowDataUris is true)
    if (allowDataUris && isSafeDataUri(dataUri)) {
      return match
    }
    // If not explicitly safe, remove it
    return `${attr}=""`
  })

  // Remove blob: and filesystem: URIs
  result = result.replace(/(href|src|action|formaction|xlink:href)\s*=\s*["']?\s*(blob:|filesystem:)[^"'\s>]*/gi, '$1=""')

  // Also sanitize javascript: in value attributes (for DOM clobbering prevention)
  result = result.replace(/value\s*=\s*["'](javascript:|vbscript:|livescript:|mocha:)[^"']*["']/gi, 'value=""')

  return result
}

/**
 * Sanitize SVG content
 */
function sanitizeSvg(input: string): string {
  let result = input

  // Remove dangerous SVG elements
  for (const pattern of SVG_DANGEROUS_ELEMENTS) {
    result = result.replace(pattern, '')
  }

  // Remove script tags within SVG
  result = result.replace(/<\s*svg[^>]*>[\s\S]*?<\s*script[\s\S]*?<\s*\/\s*svg\s*>/gi, match => {
    return match.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
  })

  return result
}

/**
 * Sanitize CSS expressions and dangerous CSS properties
 */
function sanitizeCss(input: string): string {
  let result = input

  for (const pattern of CSS_DANGEROUS_PATTERNS) {
    result = result.replace(pattern, '')
  }

  // Handle CSS escape sequences for "expression"
  // \65 = 'e', \78 = 'x', \70 = 'p', etc.
  result = result.replace(/\\e\s*x\s*p\s*r\s*e\s*s\s*s\s*i\s*o\s*n\s*\(/gi, '')
  result = result.replace(/\\65\s*\\78\s*\\70\s*\\72\s*\\65\s*\\73\s*\\73\s*\\69\s*\\6f\s*\\6e\s*\(/gi, '')
  // Handle single hex escape at beginning: \65xpression (where \65 = 'e')
  result = result.replace(/\\65\s*xpression\s*\(/gi, '')
  // Handle other variations of CSS escape sequences
  result = result.replace(/\\0*65\s*xpression\s*\(/gi, '')

  return result
}

/**
 * Sanitize HTML for safe rendering in Monaco editor
 *
 * @param html - The HTML string to sanitize
 * @returns The sanitized HTML string
 */
export function sanitizeForMonaco(html: string): string {
  if (html === null || html === undefined) {
    return ''
  }

  if (typeof html !== 'string') {
    return String(html)
  }

  if (html === '') {
    return ''
  }

  // First normalize the input to catch encoded attacks
  let sanitized = normalizeInput(html)

  // Apply all sanitization steps
  sanitized = removeScriptTags(sanitized)
  sanitized = removeEventHandlers(sanitized)
  sanitized = sanitizeDangerousUris(sanitized, true)
  sanitized = sanitizeSvg(sanitized)
  sanitized = sanitizeCss(sanitized)

  // Run another pass to catch any nested/recursive attacks
  sanitized = removeScriptTags(sanitized)
  sanitized = removeEventHandlers(sanitized)

  return sanitized
}

/**
 * Check if HTML is safe (contains no XSS vectors)
 *
 * @param html - The HTML string to check
 * @returns true if the HTML is safe, false if it contains potential XSS vectors
 */
export function isHtmlSafe(html: string): boolean {
  if (html === null || html === undefined || html === '') {
    return true
  }

  if (typeof html !== 'string') {
    return false
  }

  // Normalize input to check for encoded attacks
  const normalized = normalizeInput(html)

  // Check for script tags
  for (const pattern of SCRIPT_TAG_PATTERNS) {
    if (pattern.test(normalized)) {
      return false
    }
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0
  }

  // Check for event handlers
  if (EVENT_HANDLER_PATTERN.test(normalized)) {
    EVENT_HANDLER_PATTERN.lastIndex = 0
    return false
  }
  EVENT_HANDLER_PATTERN.lastIndex = 0

  // Check for dangerous URIs
  const uriPattern = /(javascript:|vbscript:|livescript:|mocha:|data:text\/html|data:application\/xhtml|data:image\/svg\+xml)/i
  if (uriPattern.test(normalized)) {
    return false
  }

  // Check for CSS expressions
  for (const pattern of CSS_DANGEROUS_PATTERNS) {
    if (pattern.test(normalized)) {
      return false
    }
    pattern.lastIndex = 0
  }

  return true
}

/**
 * MonacoSanitizer class with configurable options
 */
export class MonacoSanitizer {
  private options: Required<SanitizerOptions>

  /**
   * Create a new MonacoSanitizer instance
   *
   * @param options - Configuration options
   */
  constructor(options: SanitizerOptions = {}) {
    this.options = {
      allowDataUris: options.allowDataUris ?? true,
      allowSvg: options.allowSvg ?? true,
      customAllowedTags: options.customAllowedTags ?? [],
      customBlockedPatterns: options.customBlockedPatterns ?? [],
      strictMode: options.strictMode ?? false,
    }
  }

  /**
   * Sanitize HTML input
   *
   * @param input - The HTML string to sanitize
   * @returns The sanitized HTML string
   */
  sanitize(input: string): string {
    if (input === null || input === undefined) {
      return ''
    }

    if (typeof input !== 'string') {
      return String(input)
    }

    if (input === '') {
      return ''
    }

    let sanitized = normalizeInput(input)

    // Apply standard sanitization
    sanitized = removeScriptTags(sanitized)
    sanitized = removeEventHandlers(sanitized)
    sanitized = sanitizeDangerousUris(sanitized, this.options.allowDataUris)

    if (this.options.allowSvg) {
      sanitized = sanitizeSvg(sanitized)
    } else {
      // Remove all SVG content in strict mode
      sanitized = sanitized.replace(/<\s*svg[^>]*>[\s\S]*?<\s*\/\s*svg\s*>/gi, '')
      sanitized = sanitized.replace(/<\s*svg[^>]*\/?>/gi, '')
    }

    sanitized = sanitizeCss(sanitized)

    // Apply custom blocked patterns
    for (const pattern of this.options.customBlockedPatterns) {
      sanitized = sanitized.replace(pattern, '')
    }

    // In strict mode, apply additional restrictions
    if (this.options.strictMode) {
      // Remove all style attributes and elements
      sanitized = sanitized.replace(/\sstyle\s*=\s*["'][^"']*["']/gi, '')
      sanitized = sanitized.replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, '')
      // Remove all data: URIs regardless of type
      sanitized = sanitized.replace(/(href|src|action|formaction)\s*=\s*["']?\s*data:[^"'\s>]*/gi, '$1=""')
    }

    // Final pass to catch recursive attacks
    sanitized = removeScriptTags(sanitized)
    sanitized = removeEventHandlers(sanitized)

    return sanitized
  }

  /**
   * Check if input contains unsafe content
   *
   * @param input - The HTML string to check
   * @returns true if the input contains XSS vectors, false if safe
   */
  isUnsafe(input: string): boolean {
    return !isHtmlSafe(input)
  }

  /**
   * Get detailed information about violations found in input
   *
   * @param input - The HTML string to analyze
   * @returns Array of violations found
   */
  getViolations(input: string): Violation[] {
    const violations: Violation[] = []

    if (input === null || input === undefined || input === '') {
      return violations
    }

    const normalized = normalizeInput(input)

    // Check for script tags
    for (const pattern of SCRIPT_TAG_PATTERNS) {
      let match
      while ((match = pattern.exec(normalized)) !== null) {
        violations.push({
          type: 'script_tag',
          pattern: pattern.source,
          match: match[0],
          position: match.index,
        })
      }
      pattern.lastIndex = 0
    }

    // Check for event handlers
    let match
    while ((match = EVENT_HANDLER_PATTERN.exec(normalized)) !== null) {
      violations.push({
        type: 'event_handler',
        pattern: EVENT_HANDLER_PATTERN.source,
        match: match[0],
        position: match.index,
      })
    }
    EVENT_HANDLER_PATTERN.lastIndex = 0

    // Check for dangerous URIs
    const uriPatterns = [
      { pattern: /javascript:/gi, type: 'javascript_uri' },
      { pattern: /vbscript:/gi, type: 'vbscript_uri' },
      { pattern: /data:text\/html/gi, type: 'dangerous_data_uri' },
      { pattern: /data:image\/svg\+xml/gi, type: 'svg_data_uri' },
    ]

    for (const { pattern, type } of uriPatterns) {
      while ((match = pattern.exec(normalized)) !== null) {
        violations.push({
          type,
          pattern: pattern.source,
          match: match[0],
          position: match.index,
        })
      }
      pattern.lastIndex = 0
    }

    // Check for CSS expressions
    for (const pattern of CSS_DANGEROUS_PATTERNS) {
      while ((match = pattern.exec(normalized)) !== null) {
        violations.push({
          type: 'css_expression',
          pattern: pattern.source,
          match: match[0],
          position: match.index,
        })
      }
      pattern.lastIndex = 0
    }

    // Check custom blocked patterns
    for (const pattern of this.options.customBlockedPatterns) {
      while ((match = pattern.exec(normalized)) !== null) {
        violations.push({
          type: 'custom_blocked_pattern',
          pattern: pattern.source,
          match: match[0],
          position: match.index,
        })
      }
      if (pattern.global) {
        pattern.lastIndex = 0
      }
    }

    return violations
  }
}
