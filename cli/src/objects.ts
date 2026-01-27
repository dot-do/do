/**
 * ObjectsDO CLI module
 *
 * Provides the ObjectsDOCLI class that extends BaseCLI
 */

import { createCLI as createBaseCLI, resolveCommand, listCommands, getCommandHelp, execute as baseExecute } from './base.js'
import { registerPlugin } from './plugins.js'
import { ObjectsDOPlugin } from './plugins/objects.js'
import type { BaseCLI, CreateCLIOptions, CLIResult } from './types.js'

/**
 * ObjectsDO CLI class - extends base CLI with objects.do commands
 */
export class ObjectsDOCLI {
  private cli: BaseCLI

  constructor(options: CreateCLIOptions = {}) {
    this.cli = createBaseCLI(options)
    this.cli.name = 'objects.do'

    // Register the objects.do plugin
    registerPlugin(this.cli, ObjectsDOPlugin)
  }

  get name(): string {
    return this.cli.name
  }

  get version(): string {
    return this.cli.version
  }

  get commands() {
    return this.cli.commands
  }

  get plugins() {
    return this.cli.plugins
  }

  get config() {
    return this.cli.config
  }
}

/**
 * Create a new ObjectsDO CLI instance
 */
export function createCLI(options: CreateCLIOptions = {}): BaseCLI {
  const cli = createBaseCLI(options)
  cli.name = 'objects.do'

  // Register the objects.do plugin
  registerPlugin(cli, ObjectsDOPlugin)

  return cli
}

/**
 * Execute an objects.do CLI command
 */
export async function execute(argv: string[]): Promise<CLIResult> {
  return baseExecute(argv)
}

// Re-export types
export type { BaseCLI, CLIResult, CreateCLIOptions } from './types.js'
