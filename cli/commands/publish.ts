/**
 * @fileoverview DO CLI publish command
 *
 * Publishes the Durable Object as an NPM package.
 * Generates SDK client bindings and TypeScript declarations.
 *
 * @module @do/cli/commands/publish
 */

import type { CommandResult } from '../index'

declare const process: {
  env: Record<string, string | undefined>
}

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the publish command
 */
export interface PublishOptions {
  /** NPM tag (default: 'latest') */
  tag?: string
  /** Package access level (default: 'public') */
  access?: 'public' | 'restricted'
  /** Preview publish without uploading (default: false) */
  dryRun?: boolean
  /** One-time password for 2FA */
  otp?: string
}

/**
 * Package.json structure for publishing
 */
interface PackageJson {
  name: string
  version: string
  description?: string
  main: string
  module?: string
  types?: string
  exports?: Record<string, unknown>
  files?: string[]
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  publishConfig?: {
    access?: 'public' | 'restricted'
    registry?: string
  }
}

/**
 * Publish result
 */
interface PublishResult {
  /** Package name */
  name: string
  /** Published version */
  version: string
  /** NPM tag */
  tag: string
  /** Package URL */
  url: string
  /** Package size */
  size: number
  /** Files included */
  files: string[]
}

/**
 * Generated SDK binding
 */
interface SDKBinding {
  /** File path */
  path: string
  /** File content */
  content: string
}

// =============================================================================
// Constants
// =============================================================================

/** NPM registry URL */
const NPM_REGISTRY = 'https://registry.npmjs.org'

/** Files to include in package by default */
const DEFAULT_FILES = ['dist', 'src', 'README.md', 'LICENSE', 'CHANGELOG.md']

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format bytes in human-readable format
 *
 * @param bytes - Number of bytes
 * @returns Formatted string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Increment version based on type
 *
 * @param version - Current version
 * @param type - Increment type
 * @returns New version
 */
function incrementVersion(
  version: string,
  type: 'major' | 'minor' | 'patch' = 'patch'
): string {
  const [major, minor, patch] = version.split('.').map(Number)

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
    default:
      return `${major}.${minor}.${patch + 1}`
  }
}

// =============================================================================
// Package Generation
// =============================================================================

/**
 * Load and validate package.json
 *
 * @returns Package.json content
 */
async function loadPackageJson(): Promise<PackageJson> {
  // TODO: Read and parse package.json from current directory
  // TODO: Validate required fields

  return {
    name: '@example/my-do',
    version: '0.1.0',
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
  }
}

/**
 * Generate SDK client bindings for the DO
 *
 * This creates a typed client that consumers can use to interact
 * with the deployed DO.
 *
 * @param doSchema - DO schema/interface
 * @returns Generated SDK bindings
 */
async function generateSDKBindings(doSchema: unknown): Promise<SDKBinding[]> {
  // TODO: Parse DO source files for method signatures
  // TODO: Generate typed client interface
  // TODO: Generate client implementation

  const clientInterface = `/**
 * Auto-generated SDK client for this DO
 * @module
 */

import { createClient, type DOClient, type DOSchema } from '@do/sdk'

/**
 * DO schema type - auto-generated from source
 */
export interface Schema extends DOSchema {
  methods: {
    // TODO: Generate from actual DO methods
    increment: { input: { amount: number }; output: { value: number } }
    decrement: { input: { amount: number }; output: { value: number } }
    getValue: { input: void; output: { value: number } }
  }
  state: {
    counter: number
  }
}

/**
 * Configuration for creating the client
 */
export interface ClientConfig {
  /** Base URL of the deployed worker */
  url: string
  /** DO instance ID */
  id: string
  /** Authentication token */
  token?: string
}

/**
 * Create a typed client for this DO
 *
 * @param config - Client configuration
 * @returns Typed DO client
 *
 * @example
 * \`\`\`typescript
 * import { createDoClient } from '@example/my-do'
 *
 * const client = createDoClient({
 *   url: 'https://my-do.workers.dev',
 *   id: 'counter-1',
 * })
 *
 * const result = await client.call('increment', { amount: 5 })
 * console.log(result.value)
 * \`\`\`
 */
export function createDoClient(config: ClientConfig): DOClient<Schema> & { connect(): Promise<void> } {
  return createClient<Schema>(config)
}

export type { DOClient }
`

  const typeDeclarations = `/**
 * Type declarations for this DO
 */

import { DOClient, DOSchema } from '@do/sdk'

export interface Schema extends DOSchema {
  methods: {
    increment: { input: { amount: number }; output: { value: number } }
    decrement: { input: { amount: number }; output: { value: number } }
    getValue: { input: void; output: { value: number } }
  }
  state: {
    counter: number
  }
}

export interface ClientConfig {
  url: string
  id: string
  token?: string
}

export function createDoClient(config: ClientConfig): DOClient<Schema> & { connect(): Promise<void> }
`

  return [
    { path: 'dist/client.js', content: clientInterface },
    { path: 'dist/client.d.ts', content: typeDeclarations },
  ]
}

/**
 * Build the package for publishing
 *
 * @returns Build result with files
 */
async function buildPackage(): Promise<{ success: boolean; files: string[] }> {
  // TODO: Run TypeScript compiler
  // TODO: Generate declaration files
  // TODO: Copy README, LICENSE, etc.

  return {
    success: true,
    files: ['dist/index.js', 'dist/index.d.ts', 'dist/client.js', 'dist/client.d.ts', 'README.md'],
  }
}

/**
 * Update package.json for publishing
 *
 * @param pkg - Current package.json
 * @param options - Publish options
 * @returns Updated package.json
 */
function preparePackageJson(pkg: PackageJson, options: PublishOptions): PackageJson {
  return {
    ...pkg,
    main: 'dist/index.js',
    module: 'dist/index.mjs',
    types: 'dist/index.d.ts',
    exports: {
      '.': {
        import: './dist/index.mjs',
        require: './dist/index.js',
        types: './dist/index.d.ts',
      },
      './client': {
        import: './dist/client.js',
        require: './dist/client.js',
        types: './dist/client.d.ts',
      },
    },
    files: ['dist', 'README.md', 'LICENSE'],
    publishConfig: {
      access: options.access || 'public',
    },
    peerDependencies: {
      '@do/sdk': '^0.1.0',
    },
  }
}

/**
 * Calculate package size
 *
 * @param files - Files in package
 * @returns Total size in bytes
 */
async function calculatePackageSize(files: string[]): Promise<number> {
  // TODO: Sum file sizes
  return 12345
}

// =============================================================================
// NPM Publishing
// =============================================================================

/**
 * Check if user is logged in to NPM
 *
 * @returns Whether user is authenticated
 */
async function isNpmLoggedIn(): Promise<boolean> {
  // TODO: Run 'npm whoami'
  return !!process.env.NPM_TOKEN
}

/**
 * Publish package to NPM
 *
 * @param options - Publish options
 * @returns Publish result
 */
async function publishToNpm(options: PublishOptions): Promise<{ success: boolean; url: string }> {
  // TODO: Run 'npm publish' with options
  // Handle:
  // - --tag
  // - --access
  // - --dry-run
  // - --otp

  return {
    success: true,
    url: 'https://www.npmjs.com/package/@example/my-do',
  }
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Execute the publish command.
 *
 * Builds and publishes the DO as an NPM package.
 * Generates SDK client bindings for consumers.
 *
 * @param options - Publish command options
 * @returns Command execution result
 *
 * @example
 * ```typescript
 * const result = await publish({
 *   tag: 'latest',
 *   access: 'public',
 *   dryRun: false,
 * })
 * ```
 */
export async function publish(options: PublishOptions): Promise<CommandResult> {
  const { tag = 'latest', access = 'public', dryRun = false, otp } = options

  console.log('\n📦 Publishing to NPM\n')

  // Check for NPM authentication
  if (!(await isNpmLoggedIn())) {
    return {
      success: false,
      message: 'Not logged in to NPM. Run "npm login" or set NPM_TOKEN environment variable.',
    }
  }

  try {
    // Step 1: Load package.json
    console.log('  Loading package.json...')
    const pkg = await loadPackageJson()
    console.log(`  Package: ${pkg.name}@${pkg.version}`)

    // Step 2: Build package
    console.log('  Building package...')
    const buildResult = await buildPackage()

    if (!buildResult.success) {
      return {
        success: false,
        message: 'Build failed',
      }
    }

    console.log(`  Built ${buildResult.files.length} files`)

    // Step 3: Generate SDK bindings
    console.log('  Generating SDK bindings...')
    const bindings = await generateSDKBindings({})
    console.log(`  Generated ${bindings.length} binding files`)

    // Step 4: Prepare package.json
    console.log('  Preparing package.json...')
    const preparedPkg = preparePackageJson(pkg, options)

    // Step 5: Calculate package size
    const allFiles = [...buildResult.files, ...bindings.map((b) => b.path)]
    const size = await calculatePackageSize(allFiles)
    console.log(`  Package size: ${formatBytes(size)}`)

    // Step 6: Show what will be published
    console.log('\n  Files to publish:')
    for (const file of allFiles) {
      console.log(`    ${file}`)
    }

    // Step 7: Publish (or dry run)
    if (dryRun) {
      console.log(`
  📋 Dry run complete

  Would publish:
    Name:    ${preparedPkg.name}
    Version: ${preparedPkg.version}
    Tag:     ${tag}
    Access:  ${access}
    Size:    ${formatBytes(size)}
    Files:   ${allFiles.length}

  Run without --dry-run to publish.
`)

      return {
        success: true,
        message: 'Dry run completed successfully',
        data: {
          name: preparedPkg.name,
          version: preparedPkg.version,
          tag,
          size,
          files: allFiles,
        },
      }
    }

    console.log('\n  Publishing to NPM...')
    const publishResult = await publishToNpm({ ...options, tag, access, otp })

    if (!publishResult.success) {
      return {
        success: false,
        message: 'Publish failed',
      }
    }

    console.log(`
  ✅ Published successfully!

  Package:  ${preparedPkg.name}@${preparedPkg.version}
  Tag:      ${tag}
  URL:      ${publishResult.url}
  Size:     ${formatBytes(size)}

  Install with:
    npm install ${preparedPkg.name}

  Usage:
    import { createDoClient } from '${preparedPkg.name}'

    const client = createDoClient({
      url: 'https://your-worker.workers.dev',
      id: 'instance-id',
    })

    await client.call('methodName', { arg: 'value' })
`)

    return {
      success: true,
      message: `Published ${preparedPkg.name}@${preparedPkg.version}`,
      data: {
        name: preparedPkg.name,
        version: preparedPkg.version,
        tag,
        url: publishResult.url,
        size,
        files: allFiles,
      } as PublishResult,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Publish failed',
    }
  }
}

// =============================================================================
// Exports
// =============================================================================

export {
  loadPackageJson,
  generateSDKBindings,
  buildPackage,
  preparePackageJson,
  publishToNpm,
  incrementVersion,
}
