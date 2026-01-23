/**
 * Tools Module
 *
 * Capabilities for workers (humans and agents) to interact with browsers and computers.
 * These are the "hands" that let workers do things in the digital world.
 *
 * @module tools
 *
 * @example
 * ```typescript
 * import { createBrowserTool, createComputeTool } from 'do/tools'
 *
 * // Browser automation
 * const browser = await createBrowserTool('stagehand', { ... })
 * const session = await browser.createSession()
 * await browser.navigate(session.id, { url: 'https://example.com' })
 * const data = await browser.extract(session.id, {
 *   instruction: 'Extract all product prices',
 *   schema: { products: [{ name: 'string', price: 'number' }] }
 * })
 *
 * // Computer operations (mostly bashx)
 * const compute = await createComputeTool('do-native', { ... })
 * await compute.exec('npm install')
 * await compute.writeFile('README.md', '# Hello')
 * const files = await compute.listDir('/project')
 * ```
 */

import type { ProviderConfig } from './communication/types'
import type {
  ToolProvider,
  ToolProviderInfo,
  ToolFactory,
  RegisteredTool,
  ToolCategory,
  BrowserProvider,
  ComputeProvider,
} from './types'

// =============================================================================
// Export Types
// =============================================================================

export type {
  // Base types
  ToolCategory,
  ToolProviderInfo,
  ToolProvider,
  ToolFactory,
  RegisteredTool,

  // Browser types
  BrowserAction,
  NavigateOptions,
  ClickOptions,
  TypeOptions,
  ScreenshotOptions,
  ExtractOptions,
  BrowserActionResult,
  BrowserSession,
  BrowserProvider,

  // Compute types
  ExecutionContext,
  CommandResult,
  FileInfo,
  FileResult,
  GitResult,
  SandboxSession,
  ComputeProvider,
} from './types'

// =============================================================================
// Tool Registry
// =============================================================================

const toolRegistry = new Map<string, RegisteredTool>()

/**
 * Register a tool
 */
export function registerTool<T extends ToolProvider>(
  info: ToolProviderInfo,
  factory: ToolFactory<T>
): void {
  toolRegistry.set(info.id, { info, factory })
}

/**
 * Get a registered tool
 */
export function getTool<T extends ToolProvider>(toolId: string): RegisteredTool<T> | undefined {
  return toolRegistry.get(toolId) as RegisteredTool<T> | undefined
}

/**
 * List tools by category
 */
export function listTools(category?: ToolCategory): RegisteredTool[] {
  const all = Array.from(toolRegistry.values())
  if (category) {
    return all.filter((t) => t.info.category === category)
  }
  return all
}

/**
 * Check if tool exists
 */
export function hasTool(toolId: string): boolean {
  return toolRegistry.has(toolId)
}

/**
 * Create a tool instance
 */
export async function createTool<T extends ToolProvider>(
  toolId: string,
  config: ProviderConfig
): Promise<T> {
  const registered = toolRegistry.get(toolId)
  if (!registered) {
    throw new Error(`Tool not found: ${toolId}`)
  }

  for (const key of registered.info.requiredConfig) {
    if (config[key] === undefined) {
      throw new Error(`Missing required config: ${key} for tool ${toolId}`)
    }
  }

  const tool = (await registered.factory(config)) as T
  await tool.initialize(config)
  return tool
}

// =============================================================================
// Typed Tool Creation Helpers
// =============================================================================

/**
 * Create a browser tool instance
 *
 * @param toolId - Browser tool ID (e.g., 'stagehand', 'puppeteer', 'playwright')
 * @param config - Tool configuration
 * @returns Initialized browser tool
 *
 * @example
 * ```typescript
 * const browser = await createBrowserTool('stagehand', {
 *   browserbaseApiKey: process.env.BROWSERBASE_API_KEY,
 * })
 *
 * const session = await browser.createSession()
 * await browser.act(session.id, 'Search for "AI agents"')
 * ```
 */
export async function createBrowserTool(
  toolId: string,
  config: ProviderConfig
): Promise<BrowserProvider> {
  return createTool<BrowserProvider>(toolId, config)
}

/**
 * Create a compute tool instance
 *
 * @param toolId - Compute tool ID (e.g., 'do-native', 'cloudflare-sandbox')
 * @param config - Tool configuration
 * @returns Initialized compute tool
 *
 * @example
 * ```typescript
 * const compute = await createComputeTool('do-native', {})
 *
 * // Most operations use bashx (runs in DO)
 * await compute.exec('npm test')
 *
 * // File operations
 * await compute.writeFile('output.json', JSON.stringify(data))
 *
 * // Git operations
 * await compute.gitCommit('.', 'feat: add new feature')
 * ```
 */
export async function createComputeTool(
  toolId: string,
  config: ProviderConfig
): Promise<ComputeProvider> {
  return createTool<ComputeProvider>(toolId, config)
}

// =============================================================================
// Browser Tools
// =============================================================================

export { StagehandProvider, createStagehandProvider } from './browser/stagehand'

// =============================================================================
// Computer Tools
// =============================================================================

export {
  // DO-native compute (bashx, fsx, gitx, npx)
  DONativeProvider,
  createDONativeProvider,

  // Individual layer exports
  bashx,
  fsx,
  gitx,
  npx,
} from './computer'

// =============================================================================
// Communication Tools
// =============================================================================

export * from './communication'

// =============================================================================
// Register Built-in Tools
// =============================================================================

import { StagehandProvider } from './browser/stagehand'
import { DONativeProvider } from './computer'

// Register Stagehand browser tool
registerTool<BrowserProvider>(
  {
    id: 'stagehand',
    name: 'Stagehand',
    description: 'AI-powered browser automation using Cloudflare Browser or Browserbase',
    category: 'browser',
    executionTier: 'external',
    capabilities: ['navigate', 'click', 'type', 'extract', 'screenshot', 'act', 'observe'],
    requiredConfig: [],
    optionalConfig: ['browserbaseApiKey', 'browserbaseProjectId'],
  },
  async (config) => new StagehandProvider(config)
)

// Register DO-native compute tool
registerTool<ComputeProvider>(
  {
    id: 'do-native',
    name: 'DO Native',
    description: 'DO-native compute with bashx, fsx, gitx, npx layers',
    category: 'computer',
    executionTier: 'do',
    capabilities: ['exec', 'readFile', 'writeFile', 'listDir', 'git', 'npm'],
    requiredConfig: [],
    optionalConfig: [],
  },
  async (config) => new DONativeProvider(config)
)
