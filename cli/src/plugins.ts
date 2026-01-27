/**
 * Plugin management for @dotdo/cli
 */

import type { BaseCLI, CLIPlugin, CLIConfig } from './types.js'

/**
 * Register a plugin with the CLI
 */
export function registerPlugin(cli: BaseCLI, plugin: CLIPlugin): void {
  // Add to plugins list
  cli.plugins.push(plugin)

  // Call the plugin's register hook
  plugin.register(cli)

  // Add plugin commands to CLI with namespace
  for (const cmd of plugin.commands) {
    // Ensure command has the plugin's namespace
    const namespacedCmd = {
      ...cmd,
      namespace: cmd.namespace || plugin.namespace,
    }
    cli.commands.push(namespacedCmd)
  }
}

/**
 * Unregister a plugin from the CLI
 */
export function unregisterPlugin(cli: BaseCLI, pluginName: string): void {
  const pluginIndex = cli.plugins.findIndex((p) => p.name === pluginName)

  if (pluginIndex === -1) {
    return
  }

  const plugin = cli.plugins[pluginIndex]

  // Call the plugin's unregister hook
  plugin.unregister(cli)

  // Remove plugin from list
  cli.plugins.splice(pluginIndex, 1)

  // Remove plugin's commands
  cli.commands = cli.commands.filter((c) => c.namespace !== plugin.namespace)
}

/**
 * Load plugins specified in config
 * Note: In production, this would dynamically import plugins from npm
 * For now, it just marks plugins as "loaded" in the plugins array
 */
export async function loadPluginsFromConfig(cli: BaseCLI): Promise<void> {
  const pluginNames = cli.config.plugins || []

  for (const pluginName of pluginNames) {
    // Create a placeholder plugin for loaded plugins
    // In production, this would do: const module = await import(pluginName)
    const mockPlugin: CLIPlugin = {
      name: pluginName,
      version: '1.0.0',
      namespace: pluginName.replace('@dotdo/cli-', ''),
      commands: [],
      register: () => {},
      unregister: () => {},
    }

    cli.plugins.push(mockPlugin)
  }
}

/**
 * Get all registered plugins
 */
export function getPlugins(cli: BaseCLI): CLIPlugin[] {
  return cli.plugins
}
