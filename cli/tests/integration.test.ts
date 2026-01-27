/**
 * CLI Integration Tests for objects.do
 *
 * These tests verify that objects.do CLI properly integrates with the base @dotdo/cli.
 *
 * Test areas:
 * - objects.do CLI extends base @dotdo/cli
 * - Shared authentication (login command)
 * - Shared configuration (~/.dotdo/config.json)
 * - Command namespacing (do objects:publish vs do publish)
 * - Plugin architecture for CLI extensions
 *
 * These tests are expected to FAIL because the integration doesn't exist yet.
 * This is the RED phase of TDD.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'

// =============================================================================
// Type Definitions for CLI Integration
// =============================================================================

/**
 * Base CLI interface that all DO CLIs should implement
 */
interface BaseCLI {
  name: string
  version: string
  commands: CLICommand[]
  plugins: CLIPlugin[]
  config: CLIConfig
}

/**
 * CLI command definition
 */
interface CLICommand {
  name: string
  description: string
  aliases?: string[]
  namespace?: string
  execute: (args: string[], options: Record<string, unknown>) => Promise<CLIResult>
}

/**
 * CLI plugin interface for extensibility
 */
interface CLIPlugin {
  name: string
  version: string
  namespace: string
  commands: CLICommand[]
  register: (cli: BaseCLI) => void
  unregister: (cli: BaseCLI) => void
}

/**
 * CLI configuration stored in ~/.dotdo/config.json
 */
interface CLIConfig {
  auth?: {
    token?: string
    refreshToken?: string
    expiresAt?: number
  }
  defaults?: {
    registry?: string
    environment?: string
  }
  plugins?: string[]
}

/**
 * CLI execution result
 */
interface CLIResult {
  success: boolean
  message?: string
  data?: unknown
  exitCode: number
}

// =============================================================================
// Test Utilities
// =============================================================================

const TEST_CONFIG_DIR = join(tmpdir(), '.dotdo-test')
const TEST_CONFIG_PATH = join(TEST_CONFIG_DIR, 'config.json')

function setupTestConfigDir(): void {
  if (existsSync(TEST_CONFIG_DIR)) {
    rmSync(TEST_CONFIG_DIR, { recursive: true })
  }
  mkdirSync(TEST_CONFIG_DIR, { recursive: true })
}

function cleanupTestConfigDir(): void {
  if (existsSync(TEST_CONFIG_DIR)) {
    rmSync(TEST_CONFIG_DIR, { recursive: true })
  }
}

function writeTestConfig(config: CLIConfig): void {
  writeFileSync(TEST_CONFIG_PATH, JSON.stringify(config, null, 2))
}

function readTestConfig(): CLIConfig {
  if (!existsSync(TEST_CONFIG_PATH)) {
    return {}
  }
  return JSON.parse(readFileSync(TEST_CONFIG_PATH, 'utf-8'))
}

// =============================================================================
// Tests: Base CLI Extension
// =============================================================================

describe('objects.do CLI extends base @dotdo/cli', () => {
  it('should export ObjectsDOCLI class that extends BaseCLI', async () => {
    // This should fail because ObjectsDOCLI doesn't exist yet
    const { ObjectsDOCLI } = await import('@dotdo/cli/objects')

    expect(ObjectsDOCLI).toBeDefined()
    expect(typeof ObjectsDOCLI).toBe('function')
  })

  it('should implement BaseCLI interface', async () => {
    const { ObjectsDOCLI, createCLI } = await import('@dotdo/cli/objects')

    const cli = createCLI() as BaseCLI

    expect(cli.name).toBe('objects.do')
    expect(cli.version).toBeDefined()
    expect(Array.isArray(cli.commands)).toBe(true)
    expect(Array.isArray(cli.plugins)).toBe(true)
    expect(cli.config).toBeDefined()
  })

  it('should inherit base commands from @dotdo/cli', async () => {
    const { createCLI } = await import('@dotdo/cli/objects')

    const cli = createCLI() as BaseCLI

    // Base commands that should be inherited
    const baseCommands = ['login', 'logout', 'whoami', 'config']
    for (const cmd of baseCommands) {
      const command = cli.commands.find((c) => c.name === cmd)
      expect(command).toBeDefined()
      expect(command?.name).toBe(cmd)
    }
  })

  it('should add objects.do specific commands', async () => {
    const { createCLI } = await import('@dotdo/cli/objects')

    const cli = createCLI() as BaseCLI

    // objects.do specific commands
    const objectsCommands = ['publish', 'list', 'delete', 'types', 'dev']
    for (const cmd of objectsCommands) {
      const command = cli.commands.find((c) => c.name === cmd || c.namespace === 'objects' && c.name === cmd)
      expect(command).toBeDefined()
    }
  })
})

// =============================================================================
// Tests: Shared Authentication
// =============================================================================

describe('Shared authentication (login command)', () => {
  beforeEach(() => {
    setupTestConfigDir()
  })

  afterEach(() => {
    cleanupTestConfigDir()
  })

  it('should use shared login command from base CLI', async () => {
    const { createCLI } = await import('@dotdo/cli')

    const cli = createCLI() as BaseCLI

    const loginCommand = cli.commands.find((c) => c.name === 'login')
    expect(loginCommand).toBeDefined()
    expect(loginCommand?.description).toContain('Authenticate')
  })

  it('should store auth token in shared config after login', async () => {
    const { login } = await import('@dotdo/cli/auth')

    // This should store token in ~/.dotdo/config.json
    const result = await login({
      token: 'test-token-12345',
      configPath: TEST_CONFIG_PATH,
    })

    expect(result.success).toBe(true)

    const config = readTestConfig()
    expect(config.auth?.token).toBe('test-token-12345')
  })

  it('should share auth token between base CLI and objects.do CLI', async () => {
    const { createCLI: createBaseCLI } = await import('@dotdo/cli')
    const { createCLI: createObjectsCLI } = await import('@dotdo/cli/objects')

    // Login with base CLI
    const baseCLI = createBaseCLI({ configPath: TEST_CONFIG_PATH }) as BaseCLI
    const loginCmd = baseCLI.commands.find((c) => c.name === 'login')
    await loginCmd?.execute(['--token', 'shared-token'], {})

    // objects.do CLI should see the same token
    const objectsCLI = createObjectsCLI({ configPath: TEST_CONFIG_PATH }) as BaseCLI
    expect(objectsCLI.config.auth?.token).toBe('shared-token')
  })

  it('should support logout command that clears shared auth', async () => {
    const { createCLI } = await import('@dotdo/cli')

    // Setup with existing token
    writeTestConfig({
      auth: {
        token: 'existing-token',
        refreshToken: 'refresh-token',
      },
    })

    const cli = createCLI({ configPath: TEST_CONFIG_PATH }) as BaseCLI
    const logoutCmd = cli.commands.find((c) => c.name === 'logout')

    const result = await logoutCmd?.execute([], {})
    expect(result?.success).toBe(true)

    const config = readTestConfig()
    expect(config.auth?.token).toBeUndefined()
    expect(config.auth?.refreshToken).toBeUndefined()
  })

  it('should support whoami command to show current user', async () => {
    const { createCLI } = await import('@dotdo/cli')

    writeTestConfig({
      auth: {
        token: 'valid-token',
      },
    })

    const cli = createCLI({ configPath: TEST_CONFIG_PATH }) as BaseCLI
    const whoamiCmd = cli.commands.find((c) => c.name === 'whoami')

    const result = await whoamiCmd?.execute([], {})
    expect(result?.success).toBe(true)
    expect(result?.data).toHaveProperty('user')
  })
})

// =============================================================================
// Tests: Shared Configuration
// =============================================================================

describe('Shared configuration (~/.dotdo/config.json)', () => {
  beforeEach(() => {
    setupTestConfigDir()
  })

  afterEach(() => {
    cleanupTestConfigDir()
  })

  it('should use default config path at ~/.dotdo/config.json', async () => {
    const { getDefaultConfigPath } = await import('@dotdo/cli/config')

    const defaultPath = getDefaultConfigPath()
    expect(defaultPath).toBe(join(homedir(), '.dotdo', 'config.json'))
  })

  it('should create config directory if it does not exist', async () => {
    const { initConfig } = await import('@dotdo/cli/config')

    const nonExistentDir = join(tmpdir(), 'dotdo-new-test')
    const configPath = join(nonExistentDir, 'config.json')

    try {
      await initConfig({ configPath })
      expect(existsSync(nonExistentDir)).toBe(true)
      expect(existsSync(configPath)).toBe(true)
    } finally {
      if (existsSync(nonExistentDir)) {
        rmSync(nonExistentDir, { recursive: true })
      }
    }
  })

  it('should load config from file on CLI initialization', async () => {
    writeTestConfig({
      defaults: {
        registry: 'https://custom-registry.do',
        environment: 'staging',
      },
    })

    const { createCLI } = await import('@dotdo/cli')
    const cli = createCLI({ configPath: TEST_CONFIG_PATH }) as BaseCLI

    expect(cli.config.defaults?.registry).toBe('https://custom-registry.do')
    expect(cli.config.defaults?.environment).toBe('staging')
  })

  it('should save config changes to file', async () => {
    const { createCLI } = await import('@dotdo/cli')
    const { saveConfig } = await import('@dotdo/cli/config')

    const cli = createCLI({ configPath: TEST_CONFIG_PATH }) as BaseCLI

    const newConfig: CLIConfig = {
      ...cli.config,
      defaults: {
        registry: 'https://objects.do',
        environment: 'production',
      },
    }

    await saveConfig(newConfig, TEST_CONFIG_PATH)

    const savedConfig = readTestConfig()
    expect(savedConfig.defaults?.registry).toBe('https://objects.do')
    expect(savedConfig.defaults?.environment).toBe('production')
  })

  it('should support config command for viewing/setting config', async () => {
    const { createCLI } = await import('@dotdo/cli')

    writeTestConfig({
      defaults: {
        registry: 'https://objects.do',
      },
    })

    const cli = createCLI({ configPath: TEST_CONFIG_PATH }) as BaseCLI
    const configCmd = cli.commands.find((c) => c.name === 'config')

    // Get config value
    const getResult = await configCmd?.execute(['get', 'defaults.registry'], {})
    expect(getResult?.success).toBe(true)
    expect(getResult?.data).toBe('https://objects.do')

    // Set config value
    const setResult = await configCmd?.execute(['set', 'defaults.environment', 'staging'], {})
    expect(setResult?.success).toBe(true)

    const updatedConfig = readTestConfig()
    expect(updatedConfig.defaults?.environment).toBe('staging')
  })
})

// =============================================================================
// Tests: Command Namespacing
// =============================================================================

describe('Command namespacing (do objects:publish vs do publish)', () => {
  it('should support namespaced command format: do objects:publish', async () => {
    const { parseCommand } = await import('@dotdo/cli/parser')

    const parsed = parseCommand(['objects:publish', './my-do.ts'])

    expect(parsed.namespace).toBe('objects')
    expect(parsed.command).toBe('publish')
    expect(parsed.args).toEqual(['./my-do.ts'])
  })

  it('should support non-namespaced format for default commands: do publish', async () => {
    const { parseCommand } = await import('@dotdo/cli/parser')

    const parsed = parseCommand(['publish', './my-do.ts'])

    expect(parsed.namespace).toBeUndefined()
    expect(parsed.command).toBe('publish')
    expect(parsed.args).toEqual(['./my-do.ts'])
  })

  it('should resolve namespaced commands to correct plugin', async () => {
    const { createCLI } = await import('@dotdo/cli')
    const { ObjectsDOPlugin } = await import('@dotdo/cli/plugins/objects')

    const cli = createCLI() as BaseCLI
    cli.plugins.push(ObjectsDOPlugin)

    const resolved = cli.commands.find(
      (c) => c.namespace === 'objects' && c.name === 'publish'
    )

    expect(resolved).toBeDefined()
    expect(resolved?.namespace).toBe('objects')
    expect(resolved?.description).toContain('Publish')
  })

  it('should prefer namespaced command over base command when ambiguous', async () => {
    const { createCLI, resolveCommand } = await import('@dotdo/cli')

    const cli = createCLI() as BaseCLI

    // Both base and objects.do have 'publish' command
    // Explicit namespace should win
    const objectsPublish = resolveCommand(cli, 'objects:publish')
    expect(objectsPublish?.namespace).toBe('objects')

    // Without namespace, base command is used
    const basePublish = resolveCommand(cli, 'publish')
    expect(basePublish?.namespace).toBeUndefined()
  })

  it('should list all available commands including namespaced ones', async () => {
    const { createCLI, listCommands } = await import('@dotdo/cli')

    const cli = createCLI() as BaseCLI

    const commands = listCommands(cli)

    // Should include both base and namespaced commands
    expect(commands).toContain('login')
    expect(commands).toContain('objects:publish')
    expect(commands).toContain('objects:list')
    expect(commands).toContain('objects:delete')
  })

  it('should display help for namespaced commands', async () => {
    const { createCLI, getCommandHelp } = await import('@dotdo/cli')

    const cli = createCLI() as BaseCLI

    const help = getCommandHelp(cli, 'objects:publish')

    expect(help).toContain('objects:publish')
    expect(help).toContain('Usage:')
    expect(help).toContain('Options:')
  })
})

// =============================================================================
// Tests: Plugin Architecture
// =============================================================================

describe('Plugin architecture for CLI extensions', () => {
  it('should export registerPlugin function', async () => {
    const { registerPlugin } = await import('@dotdo/cli')

    expect(registerPlugin).toBeDefined()
    expect(typeof registerPlugin).toBe('function')
  })

  it('should allow registering a plugin', async () => {
    const { createCLI, registerPlugin } = await import('@dotdo/cli')

    const cli = createCLI() as BaseCLI

    const testPlugin: CLIPlugin = {
      name: 'test-plugin',
      version: '1.0.0',
      namespace: 'test',
      commands: [
        {
          name: 'hello',
          description: 'Says hello',
          namespace: 'test',
          execute: async () => ({
            success: true,
            message: 'Hello from test plugin!',
            exitCode: 0,
          }),
        },
      ],
      register: (cli) => {
        cli.commands.push(...testPlugin.commands)
      },
      unregister: (cli) => {
        cli.commands = cli.commands.filter((c) => c.namespace !== 'test')
      },
    }

    registerPlugin(cli, testPlugin)

    expect(cli.plugins).toContain(testPlugin)
    const testCmd = cli.commands.find((c) => c.namespace === 'test' && c.name === 'hello')
    expect(testCmd).toBeDefined()
  })

  it('should allow unregistering a plugin', async () => {
    const { createCLI, registerPlugin, unregisterPlugin } = await import('@dotdo/cli')

    const cli = createCLI() as BaseCLI

    const testPlugin: CLIPlugin = {
      name: 'test-plugin',
      version: '1.0.0',
      namespace: 'test',
      commands: [],
      register: () => {},
      unregister: () => {},
    }

    registerPlugin(cli, testPlugin)
    expect(cli.plugins.length).toBeGreaterThan(0)

    unregisterPlugin(cli, testPlugin.name)
    expect(cli.plugins.find((p) => p.name === 'test-plugin')).toBeUndefined()
  })

  it('should load plugins from config', async () => {
    setupTestConfigDir()

    writeTestConfig({
      plugins: ['@dotdo/cli-objects', '@dotdo/cli-analytics'],
    })

    const { createCLI, loadPluginsFromConfig } = await import('@dotdo/cli')

    const cli = createCLI({ configPath: TEST_CONFIG_PATH }) as BaseCLI
    await loadPluginsFromConfig(cli)

    // Should have loaded the plugins
    expect(cli.plugins.find((p) => p.name === '@dotdo/cli-objects')).toBeDefined()
    expect(cli.plugins.find((p) => p.name === '@dotdo/cli-analytics')).toBeDefined()

    cleanupTestConfigDir()
  })

  it('should export ObjectsDOPlugin as the official objects.do plugin', async () => {
    const { ObjectsDOPlugin } = await import('@dotdo/cli/plugins/objects')

    expect(ObjectsDOPlugin).toBeDefined()
    expect(ObjectsDOPlugin.name).toBe('@dotdo/cli-objects')
    expect(ObjectsDOPlugin.namespace).toBe('objects')
    expect(Array.isArray(ObjectsDOPlugin.commands)).toBe(true)
  })

  it('should have objects.do plugin with required commands', async () => {
    const { ObjectsDOPlugin } = await import('@dotdo/cli/plugins/objects')

    const requiredCommands = ['publish', 'list', 'delete', 'types', 'dev']

    for (const cmdName of requiredCommands) {
      const cmd = ObjectsDOPlugin.commands.find((c) => c.name === cmdName)
      expect(cmd).toBeDefined()
      expect(cmd?.namespace).toBe('objects')
    }
  })

  it('should allow plugins to access shared authentication', async () => {
    setupTestConfigDir()

    writeTestConfig({
      auth: {
        token: 'shared-auth-token',
      },
    })

    const { createCLI, registerPlugin } = await import('@dotdo/cli')
    const { ObjectsDOPlugin } = await import('@dotdo/cli/plugins/objects')

    const cli = createCLI({ configPath: TEST_CONFIG_PATH }) as BaseCLI
    registerPlugin(cli, ObjectsDOPlugin)

    // Plugin commands should have access to auth token
    const publishCmd = cli.commands.find(
      (c) => c.namespace === 'objects' && c.name === 'publish'
    )

    // Execute with a test file (should fail but should have auth)
    const result = await publishCmd?.execute(['./test.ts'], {})

    // Even if it fails for other reasons, it should have tried with auth
    // The implementation would throw if auth is not available
    expect(result).toBeDefined()

    cleanupTestConfigDir()
  })

  it('should support plugin lifecycle hooks', async () => {
    const { createCLI, registerPlugin, unregisterPlugin } = await import('@dotdo/cli')

    const cli = createCLI() as BaseCLI

    let registered = false
    let unregistered = false

    const testPlugin: CLIPlugin = {
      name: 'lifecycle-test',
      version: '1.0.0',
      namespace: 'lifecycle',
      commands: [],
      register: () => {
        registered = true
      },
      unregister: () => {
        unregistered = true
      },
    }

    registerPlugin(cli, testPlugin)
    expect(registered).toBe(true)

    unregisterPlugin(cli, testPlugin.name)
    expect(unregistered).toBe(true)
  })
})

// =============================================================================
// Tests: CLI Execution Integration
// =============================================================================

describe('CLI execution integration', () => {
  it('should execute objects.do commands through base CLI', async () => {
    const { execute } = await import('@dotdo/cli')

    // Execute 'do objects:list' through base CLI
    const result = await execute(['objects:list'])

    expect(result).toBeDefined()
    expect(typeof result.exitCode).toBe('number')
  })

  it('should pass environment variables to plugin commands', async () => {
    const { execute } = await import('@dotdo/cli')

    // DOTDO_TOKEN should be available to objects:publish
    process.env.DOTDO_TOKEN = 'env-token-test'

    const result = await execute(['objects:publish', './test.ts', '--dry-run'])

    // Command should have access to DOTDO_TOKEN
    expect(result).toBeDefined()

    delete process.env.DOTDO_TOKEN
  })

  it('should handle errors from plugin commands gracefully', async () => {
    const { execute } = await import('@dotdo/cli')

    // Execute command that will fail
    const result = await execute(['objects:publish', './nonexistent.ts'])

    expect(result.success).toBe(false)
    expect(result.exitCode).not.toBe(0)
    expect(result.message).toBeDefined()
  })

  it('should support --help flag for all commands', async () => {
    const { execute } = await import('@dotdo/cli')

    const helpResult = await execute(['objects:publish', '--help'])

    expect(helpResult.success).toBe(true)
    expect(helpResult.message).toContain('Usage:')
  })

  it('should support global --version flag', async () => {
    const { execute } = await import('@dotdo/cli')

    const versionResult = await execute(['--version'])

    expect(versionResult.success).toBe(true)
    expect(versionResult.data).toHaveProperty('version')
  })
})
