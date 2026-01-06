export interface SemanticIdOptions {
  maxLength?: number
}

/**
 * Convert a string to a URL-safe semantic ID
 */
export function toSemanticId(input: string, options: SemanticIdOptions = {}): string {
  const { maxLength = 64 } = options

  let result = input
    // Normalize unicode characters
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Convert to lowercase
    .toLowerCase()
    // Replace special characters with nothing
    .replace(/[^a-z0-9\s-]/g, '')
    // Replace whitespace with hyphens
    .replace(/\s+/g, '-')
    // Remove consecutive hyphens
    .replace(/-+/g, '-')
    // Trim hyphens from ends
    .replace(/^-+|-+$/g, '')

  // Truncate to maxLength
  if (result.length > maxLength) {
    result = result.substring(0, maxLength)
    // Don't end with a hyphen
    result = result.replace(/-+$/, '')
  }

  return result
}

/**
 * Generator that tracks used IDs and handles collisions
 */
export class SemanticIdGenerator {
  private usedIds = new Set<string>()

  constructor(existingIds: string[] = []) {
    existingIds.forEach((id) => this.usedIds.add(id))
  }

  /**
   * Generate a unique semantic ID, adding numeric suffix if needed
   */
  generate(input: string, options?: SemanticIdOptions): string {
    const base = toSemanticId(input, options)

    if (!base) {
      return ''
    }

    if (!this.usedIds.has(base)) {
      this.usedIds.add(base)
      return base
    }

    // Find next available suffix
    let counter = 1
    let candidate = `${base}-${counter}`
    while (this.usedIds.has(candidate)) {
      counter++
      candidate = `${base}-${counter}`
    }

    this.usedIds.add(candidate)
    return candidate
  }

  /**
   * Check if an ID already exists
   */
  exists(id: string): boolean {
    return this.usedIds.has(id)
  }

  /**
   * Register an ID as used
   */
  register(id: string): void {
    this.usedIds.add(id)
  }

  /**
   * Clear all tracked IDs
   */
  clear(): void {
    this.usedIds.clear()
  }
}
