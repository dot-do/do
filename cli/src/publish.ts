/**
 * Publish a DO definition to objects.do
 *
 * Extracts the DO definition from source and pushes to the registry.
 * No deployment needed - the DO is immediately live as data.
 */

import { extractTypes, type ExtractedSchema } from 'rpc.do'
import { readFileSync } from 'node:fs'

export interface PublishOptions {
  source: string
  id: string
  domain?: string
  registry: string
  token: string
  dryRun?: boolean
}

export interface PublishResult {
  url: string
  id: string
  domain?: string
  definition: DODefinition
  version?: string
}

export interface DODefinition {
  $id: string
  $type?: string
  $version?: string
  api?: Record<string, unknown>
  events?: Record<string, string>
  schedules?: Record<string, string>
  site?: Record<string, string> | string
  app?: Record<string, string>
  config?: Record<string, unknown>
}

/**
 * Publish a DO to objects.do
 *
 * @example
 * ```typescript
 * import { publish } from '@dotdo/cli/publish'
 *
 * await publish({
 *   source: './MyStartup.ts',
 *   id: 'startup.do',
 *   registry: 'https://objects.do',
 *   token: process.env.DOTDO_TOKEN!
 * })
 * ```
 */
export async function publish(options: PublishOptions): Promise<PublishResult> {
  const { source, id, domain, registry, token, dryRun } = options

  // Extract types and definition from source
  const definition = await extractDefinition(source, id)

  if (dryRun) {
    return {
      url: `${registry}/${id}`,
      id,
      domain,
      definition,
    }
  }

  // Publish to registry
  const response = await fetch(`${registry}/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(definition),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to publish: ${response.status} ${error}`)
  }

  const result = await response.json() as { version?: string }

  // If domain specified, configure it
  if (domain) {
    await configureDomain(registry, id, domain, token)
  }

  return {
    url: `${registry}/${id}`,
    id,
    domain,
    definition,
    version: result.version,
  }
}

/**
 * Extract DO definition from source file
 */
async function extractDefinition(source: string, id: string): Promise<DODefinition> {
  // Try to extract types using rpc.do
  const schemas = await extractTypes(source)

  if (schemas.length === 0) {
    // Fall back to reading the file as a definition
    const content = readFileSync(source, 'utf-8')
    return parseDefinitionFromSource(content, id)
  }

  // Convert extracted schema to DO definition
  const schema = schemas[0]
  return schemaToDefinition(schema, id)
}

/**
 * Convert ExtractedSchema to DODefinition
 */
function schemaToDefinition(schema: ExtractedSchema, id: string): DODefinition {
  const definition: DODefinition = {
    $id: id,
    $type: schema.className.replace(/DO$/, ''),
  }

  // Convert methods and namespaces to API
  const api: Record<string, unknown> = {}

  for (const method of schema.methods) {
    // Store the method signature info
    api[method.name] = {
      params: method.params.map(p => p.name),
      returns: method.returnType,
    }
  }

  for (const ns of schema.namespaces) {
    const nsApi: Record<string, unknown> = {}
    for (const method of ns.methods) {
      nsApi[method.name] = {
        params: method.params.map(p => p.name),
        returns: method.returnType,
      }
    }
    api[ns.name] = nsApi
  }

  if (Object.keys(api).length > 0) {
    definition.api = api
  }

  return definition
}

/**
 * Parse a definition from source code (for factory pattern)
 */
function parseDefinitionFromSource(content: string, id: string): DODefinition {
  // Try to extract DO() factory call
  const factoryMatch = content.match(/DO\s*\(\s*(?:async\s*)?\(\s*\$?\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\)/)

  if (!factoryMatch) {
    // Try to find a plain object export
    const objectMatch = content.match(/export\s+default\s+(\{[\s\S]*\})/)
    if (objectMatch) {
      try {
        // This is a simplified parser - in production we'd use ts-morph
        return { $id: id, ...JSON.parse(objectMatch[1]) }
      } catch {
        // Fall through
      }
    }

    throw new Error('Could not extract DO definition from source. Ensure it exports a DO() call or class extending DigitalObject.')
  }

  // For factory pattern, we need to analyze the return value
  // This is a simplified version - the full implementation uses ts-morph
  const body = factoryMatch[1]

  // Look for return statement
  const returnMatch = body.match(/return\s+(\{[\s\S]*?\})\s*$/m)

  if (returnMatch) {
    try {
      // Parse the return object (simplified)
      const apiContent = returnMatch[1]
      return {
        $id: id,
        api: { _raw: apiContent }, // Store raw for server-side parsing
      }
    } catch {
      // Fall through
    }
  }

  return { $id: id }
}

/**
 * Configure a custom domain for a DO
 */
async function configureDomain(registry: string, id: string, domain: string, token: string): Promise<void> {
  const response = await fetch(`${registry}/api/domains`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ id, domain }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to configure domain: ${error}`)
  }
}

/**
 * Helper to create a minimal publish function for other CLIs
 *
 * @example
 * ```typescript
 * // In rpc.do CLI
 * import { createPublisher } from '@dotdo/cli/publish'
 *
 * const publish = createPublisher({
 *   registry: 'https://objects.do',
 *   tokenEnvVar: 'DOTDO_TOKEN'
 * })
 *
 * await publish('./MyDO.ts', { id: 'my.do' })
 * ```
 */
export function createPublisher(defaults: { registry?: string; tokenEnvVar?: string }) {
  return async (source: string, options: Partial<Omit<PublishOptions, 'source'>> = {}) => {
    const token = options.token || process.env[defaults.tokenEnvVar || 'DOTDO_TOKEN']
    if (!token) {
      throw new Error(`Auth token required. Set ${defaults.tokenEnvVar || 'DOTDO_TOKEN'}`)
    }

    return publish({
      source,
      id: options.id || source.replace(/\.ts$/, '.do'),
      registry: options.registry || defaults.registry || 'https://objects.do',
      token,
      domain: options.domain,
      dryRun: options.dryRun,
    })
  }
}
