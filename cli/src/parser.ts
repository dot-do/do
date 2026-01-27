/**
 * Command parser for @dotdo/cli
 */

import type { ParsedCommand } from './types.js'

/**
 * Parse command-line arguments into a ParsedCommand structure
 *
 * Supports:
 * - Namespaced commands: objects:publish ./my-do.ts
 * - Non-namespaced commands: publish ./my-do.ts
 * - Options: --dry-run, --id=value, -f
 */
export function parseCommand(argv: string[]): ParsedCommand {
  const args: string[] = []
  const options: Record<string, unknown> = {}

  let command = ''
  let namespace: string | undefined

  for (let i = 0; i < argv.length; i++) {
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
    } else if (!command) {
      // First non-option argument is the command
      // Check for namespace format: namespace:command
      if (arg.includes(':')) {
        const [ns, cmd] = arg.split(':')
        namespace = ns
        command = cmd
      } else {
        command = arg
      }
    } else {
      // Remaining arguments
      args.push(arg)
    }
  }

  return {
    namespace,
    command,
    args,
    options,
  }
}

/**
 * Format a command for display
 */
export function formatCommand(namespace: string | undefined, command: string): string {
  return namespace ? `${namespace}:${command}` : command
}
