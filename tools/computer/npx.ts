/**
 * Npx - Package Execution Layer
 *
 * DO-native npm/npx operations. Run packages and manage dependencies
 * without requiring a full Node.js installation on the DO.
 *
 * @module tools/computer/npx
 */

import type { CommandResult, ExecutionContext } from '../types'
import { bashx } from './bashx'

// =============================================================================
// Npx Interface
// =============================================================================

/**
 * Run an npm package via npx
 *
 * @param pkg - Package name (optionally with version)
 * @param args - Arguments to pass to the package
 * @param context - Execution context
 * @returns Command result
 *
 * @example
 * ```typescript
 * // Run a package
 * await npx.run('prettier', ['--write', '.'])
 *
 * // Run specific version
 * await npx.run('typescript@5.0', ['--version'])
 *
 * // Run in specific directory
 * await npx.run('eslint', ['.'], { cwd: '/project' })
 * ```
 */
export async function run(
  pkg: string,
  args: string[] = [],
  context?: ExecutionContext
): Promise<CommandResult> {
  const command = `npx ${pkg} ${args.join(' ')}`
  return bashx.exec(command, context)
}

/**
 * Install npm packages
 *
 * @param packages - Packages to install (empty for package.json deps)
 * @param context - Execution context
 * @returns Command result
 *
 * @example
 * ```typescript
 * // Install from package.json
 * await npx.install([], { cwd: '/project' })
 *
 * // Install specific packages
 * await npx.install(['express', 'typescript'])
 *
 * // Install as dev dependency
 * await npx.installDev(['vitest', '@types/node'])
 * ```
 */
export async function install(
  packages: string[] = [],
  context?: ExecutionContext
): Promise<CommandResult> {
  const command = packages.length > 0 ? `npm install ${packages.join(' ')}` : 'npm install'
  return bashx.exec(command, context)
}

/**
 * Install packages as dev dependencies
 *
 * @param packages - Packages to install
 * @param context - Execution context
 * @returns Command result
 */
export async function installDev(
  packages: string[],
  context?: ExecutionContext
): Promise<CommandResult> {
  const command = `npm install --save-dev ${packages.join(' ')}`
  return bashx.exec(command, context)
}

/**
 * Uninstall npm packages
 *
 * @param packages - Packages to uninstall
 * @param context - Execution context
 * @returns Command result
 *
 * @example
 * ```typescript
 * await npx.uninstall(['lodash'])
 * ```
 */
export async function uninstall(
  packages: string[],
  context?: ExecutionContext
): Promise<CommandResult> {
  const command = `npm uninstall ${packages.join(' ')}`
  return bashx.exec(command, context)
}

/**
 * Run an npm script
 *
 * @param script - Script name from package.json
 * @param args - Arguments to pass to the script
 * @param context - Execution context
 * @returns Command result
 *
 * @example
 * ```typescript
 * await npx.script('build')
 * await npx.script('test', ['--coverage'])
 * await npx.script('start', [], { cwd: '/project' })
 * ```
 */
export async function script(
  scriptName: string,
  args: string[] = [],
  context?: ExecutionContext
): Promise<CommandResult> {
  const command = args.length > 0 ? `npm run ${scriptName} -- ${args.join(' ')}` : `npm run ${scriptName}`
  return bashx.exec(command, context)
}

/**
 * List installed packages
 *
 * @param context - Execution context
 * @returns Command result with package list
 *
 * @example
 * ```typescript
 * const result = await npx.list({ cwd: '/project' })
 * console.log(result.stdout)
 * ```
 */
export async function list(context?: ExecutionContext): Promise<CommandResult> {
  return bashx.exec('npm list --depth=0', context)
}

/**
 * Check for outdated packages
 *
 * @param context - Execution context
 * @returns Command result with outdated packages
 *
 * @example
 * ```typescript
 * const result = await npx.outdated({ cwd: '/project' })
 * ```
 */
export async function outdated(context?: ExecutionContext): Promise<CommandResult> {
  return bashx.exec('npm outdated', context)
}

/**
 * Update packages
 *
 * @param packages - Specific packages to update (or all if empty)
 * @param context - Execution context
 * @returns Command result
 *
 * @example
 * ```typescript
 * await npx.update() // update all
 * await npx.update(['express', 'lodash'])
 * ```
 */
export async function update(
  packages: string[] = [],
  context?: ExecutionContext
): Promise<CommandResult> {
  const command = packages.length > 0 ? `npm update ${packages.join(' ')}` : 'npm update'
  return bashx.exec(command, context)
}

/**
 * Initialize a new package.json
 *
 * @param context - Execution context
 * @returns Command result
 *
 * @example
 * ```typescript
 * await npx.init({ cwd: '/new-project' })
 * ```
 */
export async function init(context?: ExecutionContext): Promise<CommandResult> {
  return bashx.exec('npm init -y', context)
}

/**
 * Run npm ci (clean install)
 *
 * @param context - Execution context
 * @returns Command result
 *
 * @example
 * ```typescript
 * // For CI/CD - faster and stricter than npm install
 * await npx.ci({ cwd: '/project' })
 * ```
 */
export async function ci(context?: ExecutionContext): Promise<CommandResult> {
  return bashx.exec('npm ci', context)
}

/**
 * Run npm audit
 *
 * @param fix - Whether to fix vulnerabilities
 * @param context - Execution context
 * @returns Command result
 *
 * @example
 * ```typescript
 * const result = await npx.audit()
 * await npx.audit(true) // auto-fix
 * ```
 */
export async function audit(
  fix: boolean = false,
  context?: ExecutionContext
): Promise<CommandResult> {
  const command = fix ? 'npm audit fix' : 'npm audit'
  return bashx.exec(command, context)
}

/**
 * Publish package to npm
 *
 * @param options - Publish options
 * @param context - Execution context
 * @returns Command result
 *
 * @example
 * ```typescript
 * await npx.publish({ access: 'public' })
 * ```
 */
export async function publish(
  options?: { access?: 'public' | 'restricted'; tag?: string },
  context?: ExecutionContext
): Promise<CommandResult> {
  let command = 'npm publish'

  if (options?.access) {
    command += ` --access ${options.access}`
  }
  if (options?.tag) {
    command += ` --tag ${options.tag}`
  }

  return bashx.exec(command, context)
}

// =============================================================================
// Npx Namespace Export
// =============================================================================

export const npx = {
  run,
  install,
  installDev,
  uninstall,
  script,
  list,
  outdated,
  update,
  init,
  ci,
  audit,
  publish,
}
