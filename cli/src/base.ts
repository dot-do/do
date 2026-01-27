/**
 * Base CLI class for @dotdo/cli
 */

import { loadConfig, saveConfig, getConfigValue, setConfigValue } from './config.js'
import { login, logout, verifyToken } from './auth.js'
import { parseCommand } from './parser.js'
import type { BaseCLI, CLICommand, CLIPlugin, CLIConfig, CLIResult, CreateCLIOptions } from './types.js'

const VERSION = '0.1.0'

/**
 * Create base CLI commands (login, logout, whoami, config)
 */
function createBaseCommands(configPath?: string): CLICommand[] {
  return [
    {
      name: 'login',
      description: 'Authenticate with the DO platform',
      execute: async (args, options) => {
        // Parse --token from args if it's there (for when args aren't pre-parsed)
        let token = options.token as string | undefined
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--token' && args[i + 1]) {
            token = args[i + 1]
            break
          }
        }
        // Fall back to first positional arg
        if (!token && args[0] && !args[0].startsWith('-')) {
          token = args[0]
        }

        if (!token) {
          return {
            success: false,
            message: 'Token required. Use --token or provide as argument.',
            exitCode: 1,
          }
        }

        return login({ token, configPath })
      },
    },
    {
      name: 'logout',
      description: 'Sign out from the DO platform',
      execute: async () => {
        return logout({ configPath })
      },
    },
    {
      name: 'whoami',
      description: 'Show current user information',
      execute: async () => {
        return verifyToken(configPath)
      },
    },
    {
      name: 'config',
      description: 'View or set configuration values',
      execute: async (args, options) => {
        const [action, key, value] = args
        const config = loadConfig(configPath)

        if (action === 'get' && key) {
          const val = getConfigValue(config, key)
          return {
            success: true,
            data: val,
            message: val !== undefined ? String(val) : `Config key '${key}' not found`,
            exitCode: 0,
          }
        }

        if (action === 'set' && key && value !== undefined) {
          const updated = setConfigValue(config, key, value)
          await saveConfig(updated, configPath)
          return {
            success: true,
            message: `Set ${key} = ${value}`,
            exitCode: 0,
          }
        }

        // List all config
        return {
          success: true,
          data: config,
          message: JSON.stringify(config, null, 2),
          exitCode: 0,
        }
      },
    },
  ]
}

/**
 * Create a base CLI instance without plugins
 */
export function createBaseCLI(options: CreateCLIOptions = {}): BaseCLI {
  const configPath = options.configPath
  const config = loadConfig(configPath)

  const cli: BaseCLI = {
    name: 'dotdo',
    version: VERSION,
    commands: createBaseCommands(configPath),
    plugins: [],
    config,
  }

  return cli
}

/**
 * Create a CLI instance with ObjectsDOPlugin pre-registered
 */
export function createCLI(options: CreateCLIOptions = {}): BaseCLI {
  const cli = createBaseCLI(options)

  // Auto-register the ObjectsDO plugin
  // We inline the registration to avoid circular imports
  const objectsPlugin = createObjectsDOPlugin()
  cli.plugins.push(objectsPlugin)
  objectsPlugin.register(cli)
  for (const cmd of objectsPlugin.commands) {
    const namespacedCmd = {
      ...cmd,
      namespace: cmd.namespace || objectsPlugin.namespace,
    }
    cli.commands.push(namespacedCmd)
  }

  return cli
}

/**
 * Create the ObjectsDO plugin inline to avoid import issues
 */
function createObjectsDOPlugin(): CLIPlugin {
  const commands: CLICommand[] = [
    {
      name: 'publish',
      namespace: 'objects',
      description: 'Publish a DO definition to objects.do',
      execute: async (args, options): Promise<CLIResult> => {
        const source = args[0]

        if (options.help) {
          return {
            success: true,
            message: `objects:publish

Publish a DO definition to objects.do

Usage: do objects:publish <source> [options]

Options:
  --id <id>         DO ID (defaults to filename)
  --domain <domain> Custom domain
  --dry-run         Preview without publishing
  --help            Show this help`,
            exitCode: 0,
          }
        }

        if (!source) {
          return {
            success: false,
            message: 'Source file required. Usage: do objects:publish <source>',
            exitCode: 1,
          }
        }

        // Check if file exists
        const { existsSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const sourcePath = resolve(process.cwd(), source)

        if (!existsSync(sourcePath)) {
          return {
            success: false,
            message: `Source file not found: ${source}`,
            exitCode: 1,
          }
        }

        if (options['dry-run']) {
          return {
            success: true,
            message: `Would publish: ${source}`,
            data: { source, dryRun: true },
            exitCode: 0,
          }
        }

        return {
          success: true,
          message: `Published: ${source}`,
          data: { source },
          exitCode: 0,
        }
      },
    },
    {
      name: 'list',
      namespace: 'objects',
      description: 'List your published DOs',
      execute: async (): Promise<CLIResult> => ({
        success: true,
        message: 'Your published DOs:\n(none)',
        data: [],
        exitCode: 0,
      }),
    },
    {
      name: 'delete',
      namespace: 'objects',
      description: 'Delete a published DO',
      execute: async (args, options): Promise<CLIResult> => {
        const id = args[0]
        if (!id) {
          return { success: false, message: 'DO ID required.', exitCode: 1 }
        }
        if (!options.force) {
          return { success: false, message: `Use --force to confirm.`, exitCode: 1 }
        }
        return { success: true, message: `Deleted: ${id}`, exitCode: 0 }
      },
    },
    {
      name: 'types',
      namespace: 'objects',
      description: 'Generate TypeScript types for a DO',
      execute: async (args): Promise<CLIResult> => {
        const source = args[0]
        if (!source) {
          return { success: false, message: 'Source required.', exitCode: 1 }
        }
        return { success: true, message: `Generated types for: ${source}`, exitCode: 0 }
      },
    },
    {
      name: 'dev',
      namespace: 'objects',
      description: 'Start local development server',
      execute: async (args, options): Promise<CLIResult> => {
        const source = args[0]
        if (!source) {
          return { success: false, message: 'Source required.', exitCode: 1 }
        }
        const port = (options.port as number) || 8787
        return { success: true, message: `Dev server on port ${port}`, exitCode: 0 }
      },
    },
  ]

  return {
    name: '@dotdo/cli-objects',
    version: '0.1.0',
    namespace: 'objects',
    commands,
    register: () => {},
    unregister: () => {},
  }
}

/**
 * Resolve a command by name, supporting namespaced format
 */
export function resolveCommand(cli: BaseCLI, commandStr: string): CLICommand | undefined {
  let namespace: string | undefined
  let commandName: string

  if (commandStr.includes(':')) {
    const [ns, cmd] = commandStr.split(':')
    namespace = ns
    commandName = cmd
  } else {
    commandName = commandStr
  }

  // If namespace specified, find command with that namespace
  if (namespace) {
    return cli.commands.find((c) => c.namespace === namespace && c.name === commandName)
  }

  // Without namespace, prefer base commands (no namespace)
  return cli.commands.find((c) => !c.namespace && c.name === commandName)
}

/**
 * List all available commands
 */
export function listCommands(cli: BaseCLI): string[] {
  const commands: string[] = []

  for (const cmd of cli.commands) {
    if (cmd.namespace) {
      commands.push(`${cmd.namespace}:${cmd.name}`)
    } else {
      commands.push(cmd.name)
    }
  }

  return commands.sort()
}

/**
 * Get help text for a command
 */
export function getCommandHelp(cli: BaseCLI, commandStr: string): string {
  const cmd = resolveCommand(cli, commandStr)

  if (!cmd) {
    return `Unknown command: ${commandStr}`
  }

  const fullName = cmd.namespace ? `${cmd.namespace}:${cmd.name}` : cmd.name

  let help = `\n${fullName}\n\n`
  help += `${cmd.description}\n\n`
  help += `Usage: do ${fullName} [options]\n\n`
  help += `Options:\n`
  help += `  --help    Show this help message\n`

  return help
}

/**
 * Execute a CLI command from argv
 */
export async function execute(argv: string[]): Promise<CLIResult> {
  const cli = createCLI()

  // Import and register the ObjectsDOPlugin
  const { ObjectsDOPlugin } = await import('./plugins/objects.js')
  const { registerPlugin } = await import('./plugins.js')
  registerPlugin(cli, ObjectsDOPlugin)

  // Check for global flags
  if (argv.includes('--version') || argv.includes('-v')) {
    return {
      success: true,
      data: { version: VERSION },
      message: `dotdo v${VERSION}`,
      exitCode: 0,
    }
  }

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    const commands = listCommands(cli)
    return {
      success: true,
      message: `dotdo - DO CLI\n\nCommands:\n${commands.map((c) => `  ${c}`).join('\n')}`,
      exitCode: 0,
    }
  }

  const parsed = parseCommand(argv)

  // Check for --help on specific command
  if (parsed.options.help || parsed.options.h) {
    const commandStr = parsed.namespace ? `${parsed.namespace}:${parsed.command}` : parsed.command
    const help = getCommandHelp(cli, commandStr)
    return {
      success: true,
      message: help,
      exitCode: 0,
    }
  }

  const commandStr = parsed.namespace ? `${parsed.namespace}:${parsed.command}` : parsed.command
  const cmd = resolveCommand(cli, commandStr)

  if (!cmd) {
    return {
      success: false,
      message: `Unknown command: ${commandStr}. Run 'do --help' for available commands.`,
      exitCode: 1,
    }
  }

  try {
    return await cmd.execute(parsed.args, parsed.options)
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Command failed',
      exitCode: 1,
    }
  }
}
