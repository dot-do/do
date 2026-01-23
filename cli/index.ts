#!/usr/bin/env node
/**
 * @fileoverview DO CLI entry point
 *
 * This is the main entry point for the DO command-line interface.
 * It handles argument parsing, command routing, and global error handling.
 *
 * @module @do/cli
 */

// Node.js type declarations for CLI usage
declare const process: {
  argv: string[]
  env: Record<string, string | undefined>
  exit(code?: number): never
  on(event: string, listener: (...args: unknown[]) => void): void
}
declare const require: {
  main: { id: string } | undefined
}
declare const module: { id: string }

import { init, type InitOptions } from './commands/init'
import { dev, type DevOptions } from './commands/dev'
import { deploy, type DeployOptions } from './commands/deploy'
import { sync, type SyncOptions } from './commands/sync'
import { publish, type PublishOptions } from './commands/publish'

// =============================================================================
// Types
// =============================================================================

/**
 * Available CLI commands
 */
export type Command = 'init' | 'dev' | 'deploy' | 'sync' | 'publish' | 'help' | 'version'

/**
 * Parsed CLI arguments
 */
export interface ParsedArgs {
  command: Command
  args: string[]
  options: Record<string, string | boolean | undefined>
}

/**
 * Command execution result
 */
export interface CommandResult {
  /** Whether the command succeeded */
  success: boolean
  /** Human-readable result message */
  message?: string
  /** Additional result data */
  data?: unknown
}

/**
 * Command metadata for help generation
 */
export interface CommandMeta {
  name: Command
  description: string
  usage: string
  options: Array<{
    name: string
    alias?: string
    description: string
    default?: string | boolean
  }>
}

// =============================================================================
// Constants
// =============================================================================

/** CLI version from package.json */
const VERSION = '0.1.0'

/** CLI name */
const CLI_NAME = 'do'

/** Command metadata for help generation */
const COMMANDS: CommandMeta[] = [
  {
    name: 'init',
    description: 'Initialize a new DO project',
    usage: 'do init [name]',
    options: [
      { name: '--template', alias: '-t', description: 'Project template (basic, chat, game, api)', default: 'basic' },
      { name: '--typescript', description: 'Use TypeScript', default: 'true' },
      { name: '--git', description: 'Initialize git repository', default: 'true' },
      { name: '--install', description: 'Install dependencies', default: 'true' },
    ],
  },
  {
    name: 'dev',
    description: 'Start local development server',
    usage: 'do dev',
    options: [
      { name: '--port', alias: '-p', description: 'Port to listen on', default: '8787' },
      { name: '--host', alias: '-h', description: 'Host to bind to', default: 'localhost' },
      { name: '--persist', description: 'Persist DO state between restarts', default: 'false' },
      { name: '--inspect', description: 'Enable Node.js inspector', default: 'false' },
      { name: '--env', alias: '-e', description: 'Environment to use', default: 'development' },
    ],
  },
  {
    name: 'deploy',
    description: 'Deploy the DO to Cloudflare Workers',
    usage: 'do deploy',
    options: [
      { name: '--env', alias: '-e', description: 'Environment to deploy to', default: 'production' },
      { name: '--dry-run', description: 'Preview deployment without applying', default: 'false' },
      { name: '--minify', description: 'Minify output', default: 'true' },
      { name: '--compatibility', description: 'Compatibility date', default: 'today' },
    ],
  },
  {
    name: 'sync',
    description: 'Sync project to GitHub repository',
    usage: 'do sync',
    options: [
      { name: '--repo', alias: '-r', description: 'GitHub repository (owner/repo)' },
      { name: '--branch', alias: '-b', description: 'Branch to sync', default: 'main' },
      { name: '--force', alias: '-f', description: 'Force push', default: 'false' },
      { name: '--message', alias: '-m', description: 'Commit message' },
    ],
  },
  {
    name: 'publish',
    description: 'Publish the DO as an NPM package',
    usage: 'do publish',
    options: [
      { name: '--tag', description: 'NPM tag', default: 'latest' },
      { name: '--access', description: 'Package access (public, restricted)', default: 'public' },
      { name: '--dry-run', description: 'Preview publish without uploading', default: 'false' },
      { name: '--otp', description: 'One-time password for 2FA' },
    ],
  },
]

// =============================================================================
// Argument Parsing
// =============================================================================

/**
 * Parse command-line arguments into structured format.
 *
 * Supports:
 * - Positional arguments
 * - Long options (--name=value, --name value, --flag)
 * - Short options (-n value, -f)
 * - Combined short options (-abc)
 *
 * @param argv - Command-line arguments (typically process.argv.slice(2))
 * @returns Parsed arguments structure
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const args: string[] = []
  const options: Record<string, string | boolean | undefined> = {}

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]

    if (arg.startsWith('--')) {
      // Long option
      const [key, value] = arg.slice(2).split('=')
      if (value !== undefined) {
        options[key] = value
      } else if (argv[i + 1] && !argv[i + 1].startsWith('-')) {
        options[key] = argv[++i]
      } else {
        options[key] = true
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      // Short option
      const key = arg.slice(1)
      if (key.length === 1) {
        if (argv[i + 1] && !argv[i + 1].startsWith('-')) {
          options[key] = argv[++i]
        } else {
          options[key] = true
        }
      } else {
        // Combined short options (e.g., -abc)
        for (const char of key) {
          options[char] = true
        }
      }
    } else {
      // Positional argument
      args.push(arg)
    }
    i++
  }

  const command = (args[0] || 'help') as Command
  return { command, args: args.slice(1), options }
}

/**
 * Expand short option aliases to their long form
 *
 * @param options - Parsed options with potential short aliases
 * @param commandMeta - Command metadata with alias definitions
 * @returns Options with aliases expanded
 */
function expandAliases(
  options: Record<string, string | boolean | undefined>,
  commandMeta: CommandMeta
): Record<string, string | boolean | undefined> {
  const expanded = { ...options }

  for (const opt of commandMeta.options) {
    if (opt.alias) {
      const alias = opt.alias.replace(/^-/, '')
      const name = opt.name.replace(/^--/, '')

      if (expanded[alias] !== undefined && expanded[name] === undefined) {
        expanded[name] = expanded[alias]
        delete expanded[alias]
      }
    }
  }

  return expanded
}

// =============================================================================
// Command Execution
// =============================================================================

/**
 * Execute a CLI command.
 *
 * Routes to the appropriate command handler based on the parsed arguments.
 * Handles help and version as special cases.
 *
 * @param parsed - Parsed command-line arguments
 * @returns Command execution result
 */
export async function execute(parsed: ParsedArgs): Promise<CommandResult> {
  const { command, args, options } = parsed

  // Handle help and version
  if (command === 'help' || options.help || options.h) {
    const subcommand = args[0] as Command | undefined
    return showHelp(subcommand)
  }

  if (command === 'version' || options.version || options.v) {
    return showVersion()
  }

  // Find command metadata
  const commandMeta = COMMANDS.find((c) => c.name === command)
  if (!commandMeta) {
    return {
      success: false,
      message: `Unknown command: ${command}\nRun '${CLI_NAME} help' for usage.`,
    }
  }

  // Expand aliases
  const expandedOptions = expandAliases(options, commandMeta)

  // Execute command
  switch (command) {
    case 'init':
      return init({
        name: args[0],
        template: expandedOptions.template as InitOptions['template'],
        typescript: expandedOptions.typescript !== 'false',
        git: expandedOptions.git !== 'false',
        install: expandedOptions.install !== 'false',
      })

    case 'dev':
      return dev({
        port: parseInt(expandedOptions.port as string, 10) || 8787,
        host: expandedOptions.host as string || 'localhost',
        persist: expandedOptions.persist === true || expandedOptions.persist === 'true',
        inspect: expandedOptions.inspect === true || expandedOptions.inspect === 'true',
        env: expandedOptions.env as string || 'development',
      })

    case 'deploy':
      return deploy({
        env: expandedOptions.env as string || 'production',
        dryRun: expandedOptions['dry-run'] === true || expandedOptions['dry-run'] === 'true',
        minify: expandedOptions.minify !== 'false',
        compatibility: expandedOptions.compatibility as string,
      })

    case 'sync':
      return sync({
        repo: expandedOptions.repo as string,
        branch: expandedOptions.branch as string || 'main',
        force: expandedOptions.force === true || expandedOptions.force === 'true',
        message: expandedOptions.message as string,
      })

    case 'publish':
      return publish({
        tag: expandedOptions.tag as string || 'latest',
        access: expandedOptions.access as 'public' | 'restricted' || 'public',
        dryRun: expandedOptions['dry-run'] === true || expandedOptions['dry-run'] === 'true',
        otp: expandedOptions.otp as string,
      })

    default:
      return {
        success: false,
        message: `Command '${command}' is not implemented yet.`,
      }
  }
}

// =============================================================================
// Help and Version
// =============================================================================

/**
 * Display help information.
 *
 * @param command - Optional specific command to show help for
 * @returns Command result with help text
 */
function showHelp(command?: Command): CommandResult {
  if (command) {
    const meta = COMMANDS.find((c) => c.name === command)
    if (!meta) {
      return {
        success: false,
        message: `Unknown command: ${command}`,
      }
    }

    let help = `\n${meta.description}\n\n`
    help += `Usage: ${meta.usage}\n\n`
    help += 'Options:\n'

    for (const opt of meta.options) {
      const alias = opt.alias ? `${opt.alias}, ` : '    '
      const def = opt.default ? ` (default: ${opt.default})` : ''
      help += `  ${alias}${opt.name.padEnd(20)} ${opt.description}${def}\n`
    }

    console.log(help)
    return { success: true }
  }

  let help = `\n${CLI_NAME} - Durable Objects CLI v${VERSION}\n\n`
  help += 'Usage: do <command> [options]\n\n'
  help += 'Commands:\n'

  for (const cmd of COMMANDS) {
    help += `  ${cmd.name.padEnd(12)} ${cmd.description}\n`
  }

  help += '\nGlobal Options:\n'
  help += '  -h, --help     Show help\n'
  help += '  -v, --version  Show version\n'
  help += '\n'
  help += `Run '${CLI_NAME} help <command>' for more information on a command.\n`

  console.log(help)
  return { success: true }
}

/**
 * Display version information.
 *
 * @returns Command result with version
 */
function showVersion(): CommandResult {
  console.log(`${CLI_NAME} v${VERSION}`)
  return { success: true, data: { version: VERSION } }
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * CLI main function.
 *
 * Parses arguments, executes the command, and handles errors.
 * Exits with appropriate exit code.
 */
async function main(): Promise<void> {
  // Handle SIGINT for graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nInterrupted')
    process.exit(130)
  })

  // Handle SIGTERM for graceful shutdown
  process.on('SIGTERM', () => {
    console.log('\nTerminated')
    process.exit(143)
  })

  try {
    const parsed = parseArgs(process.argv.slice(2))
    const result = await execute(parsed)

    if (!result.success) {
      console.error(result.message || 'Command failed')
      process.exit(1)
    }

    if (result.message) {
      console.log(result.message)
    }

    process.exit(0)
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`)

      if (process.env.DEBUG) {
        console.error(error.stack)
      }
    } else {
      console.error('An unknown error occurred')
    }

    process.exit(1)
  }
}

// Run main if this is the entry point
if (require.main === module) {
  main()
}

// =============================================================================
// Exports
// =============================================================================

export { showHelp, showVersion, COMMANDS, VERSION }
export type { InitOptions } from './commands/init'
export type { DevOptions } from './commands/dev'
export type { DeployOptions } from './commands/deploy'
export type { SyncOptions } from './commands/sync'
export type { PublishOptions } from './commands/publish'
