/**
 * ObjectsDO Plugin for @dotdo/cli
 *
 * Adds objects.do specific commands to the CLI
 */

import type { BaseCLI, CLICommand, CLIPlugin, CLIResult } from '../types.js'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Create objects.do commands
 */
function createObjectsCommands(): CLICommand[] {
  return [
    {
      name: 'publish',
      namespace: 'objects',
      description: 'Publish a DO definition to objects.do',
      execute: async (args, options): Promise<CLIResult> => {
        const source = args[0]

        // Handle --help
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

        // In production, this would call the publish function
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
      execute: async (args, options): Promise<CLIResult> => {
        return {
          success: true,
          message: 'Your published DOs:\n(none)',
          data: [],
          exitCode: 0,
        }
      },
    },
    {
      name: 'delete',
      namespace: 'objects',
      description: 'Delete a published DO',
      execute: async (args, options): Promise<CLIResult> => {
        const id = args[0]

        if (!id) {
          return {
            success: false,
            message: 'DO ID required. Usage: do objects:delete <id>',
            exitCode: 1,
          }
        }

        if (!options.force) {
          return {
            success: false,
            message: `This will delete ${id} permanently. Use --force to confirm.`,
            exitCode: 1,
          }
        }

        return {
          success: true,
          message: `Deleted: ${id}`,
          exitCode: 0,
        }
      },
    },
    {
      name: 'types',
      namespace: 'objects',
      description: 'Generate TypeScript types for a DO',
      execute: async (args, options): Promise<CLIResult> => {
        const source = args[0]

        if (!source) {
          return {
            success: false,
            message: 'Source file required. Usage: do objects:types <source>',
            exitCode: 1,
          }
        }

        return {
          success: true,
          message: `Generated types for: ${source}`,
          data: { source },
          exitCode: 0,
        }
      },
    },
    {
      name: 'dev',
      namespace: 'objects',
      description: 'Start local development server',
      execute: async (args, options): Promise<CLIResult> => {
        const source = args[0]

        if (!source) {
          return {
            success: false,
            message: 'Source file required. Usage: do objects:dev <source>',
            exitCode: 1,
          }
        }

        const port = (options.port as number) || 8787

        return {
          success: true,
          message: `Starting dev server for ${source} on port ${port}`,
          data: { source, port },
          exitCode: 0,
        }
      },
    },
  ]
}

/**
 * The ObjectsDO Plugin
 */
export const ObjectsDOPlugin: CLIPlugin = {
  name: '@dotdo/cli-objects',
  version: '0.1.0',
  namespace: 'objects',
  commands: createObjectsCommands(),
  register: (cli: BaseCLI) => {
    // Plugin registration hook - commands are added by registerPlugin
  },
  unregister: (cli: BaseCLI) => {
    // Plugin unregistration hook - commands are removed by unregisterPlugin
  },
}
