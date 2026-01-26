/**
 * Tests for objects.do CLI Commands
 *
 * These tests define the expected behavior of the CLI commands.
 * They are designed to FAIL initially (TDD Red phase) because
 * the CLI implementation doesn't exist yet.
 *
 * Commands tested:
 * - `do publish <source>` - publishes a DO from file
 * - `do list` - lists deployed DOs
 * - `do get <id>` - gets DO details
 * - `do delete <id>` - deletes a DO
 * - `do logs <id>` - streams DO logs
 * - `do schema <id>` - shows DO schema
 * - `do call <id> <method>` - calls an RPC method
 *
 * @module tests/cli
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  publish,
  list,
  get,
  remove,
  logs,
  schema,
  call,
  runCLI,
  commands,
  type CLIContext,
  type PublishOptions,
  type PublishResult,
  type DOInfo,
  type DOListResult,
  type DOSchema,
  type RPCCallResult,
  type LogEntry,
} from '../cli'

// =============================================================================
// Test Fixtures
// =============================================================================

const testContext: CLIContext = {
  apiUrl: 'https://objects.do',
  token: 'test-token-12345',
}

const sampleDODefinition = {
  $id: 'counter.do',
  $type: 'SaaS',
  name: 'Counter',
  description: 'A simple counter DO',
  api: {
    increment: {
      method: 'increment',
      params: [{ name: 'by', type: 'number', default: 1 }],
      returns: 'number',
    },
    decrement: {
      method: 'decrement',
      params: [{ name: 'by', type: 'number', default: 1 }],
      returns: 'number',
    },
    get: {
      method: 'get',
      returns: 'number',
    },
  },
}

const sampleDOInfo: DOInfo = {
  id: 'counter.do',
  name: 'Counter',
  version: '1.0.0',
  status: 'running',
  createdAt: '2025-01-25T00:00:00Z',
  updatedAt: '2025-01-25T00:00:00Z',
}

// =============================================================================
// publish command tests
// =============================================================================

describe('do publish <source>', () => {
  it('should publish a DO definition from a JSON file', async () => {
    const options: PublishOptions = {
      source: './counter.do.json',
    }

    // This should fail because publish is not implemented
    const result = await publish(testContext, options)

    expect(result).toBeDefined()
    expect(result.id).toBe('counter.do')
    expect(result.url).toContain('counter.do')
  })

  it('should publish with custom name override', async () => {
    const options: PublishOptions = {
      source: './my-counter.json',
      name: 'custom-counter.do',
    }

    const result = await publish(testContext, options)

    expect(result.id).toBe('custom-counter.do')
    expect(result.name).toBe('custom-counter.do')
  })

  it('should publish with version', async () => {
    const options: PublishOptions = {
      source: './counter.do.json',
      version: '2.0.0',
    }

    const result = await publish(testContext, options)

    expect(result.version).toBe('2.0.0')
  })

  it('should reject invalid DO definition', async () => {
    const options: PublishOptions = {
      source: './invalid.json',
    }

    await expect(publish(testContext, options)).rejects.toThrow()
  })

  it('should reject non-existent file', async () => {
    const options: PublishOptions = {
      source: './does-not-exist.json',
    }

    await expect(publish(testContext, options)).rejects.toThrow()
  })

  it('should require authentication token', async () => {
    const noAuthContext: CLIContext = { apiUrl: 'https://objects.do' }
    const options: PublishOptions = { source: './counter.do.json' }

    // Should fail without auth token
    await expect(publish(noAuthContext, options)).rejects.toThrow(/auth|token|unauthorized/i)
  })
})

// =============================================================================
// list command tests
// =============================================================================

describe('do list', () => {
  it('should list all deployed DOs', async () => {
    const result = await list(testContext)

    expect(result).toBeDefined()
    expect(result.objects).toBeInstanceOf(Array)
    expect(result.total).toBeGreaterThanOrEqual(0)
    expect(typeof result.hasMore).toBe('boolean')
  })

  it('should support limit option', async () => {
    const result = await list(testContext, { limit: 10 })

    expect(result.objects.length).toBeLessThanOrEqual(10)
  })

  it('should support offset for pagination', async () => {
    const firstPage = await list(testContext, { limit: 5, offset: 0 })
    const secondPage = await list(testContext, { limit: 5, offset: 5 })

    // Pages should have different content
    if (firstPage.objects.length > 0 && secondPage.objects.length > 0) {
      expect(firstPage.objects[0].id).not.toBe(secondPage.objects[0].id)
    }
  })

  it('should support filter option', async () => {
    const result = await list(testContext, { filter: 'counter' })

    for (const obj of result.objects) {
      expect(obj.name.toLowerCase()).toContain('counter')
    }
  })

  it('should return proper DOInfo structure', async () => {
    const result = await list(testContext, { limit: 1 })

    if (result.objects.length > 0) {
      const info = result.objects[0]
      expect(info).toHaveProperty('id')
      expect(info).toHaveProperty('name')
      expect(info).toHaveProperty('version')
      expect(info).toHaveProperty('status')
      expect(info).toHaveProperty('createdAt')
      expect(info).toHaveProperty('updatedAt')
    }
  })
})

// =============================================================================
// get command tests
// =============================================================================

describe('do get <id>', () => {
  it('should get DO details by ID', async () => {
    const result = await get(testContext, 'counter.do')

    expect(result).toBeDefined()
    expect(result.id).toBe('counter.do')
    expect(result.name).toBeDefined()
    expect(result.status).toBeDefined()
  })

  it('should return full DOInfo structure', async () => {
    const result = await get(testContext, 'counter.do')

    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('name')
    expect(result).toHaveProperty('version')
    expect(result).toHaveProperty('status')
    expect(result).toHaveProperty('createdAt')
    expect(result).toHaveProperty('updatedAt')
  })

  it('should throw for non-existent DO', async () => {
    await expect(get(testContext, 'does-not-exist.do')).rejects.toThrow(/not found/i)
  })

  it('should handle special characters in ID', async () => {
    // DOs can have dots and hyphens in names
    const result = await get(testContext, 'my-special.counter.do')

    expect(result.id).toBe('my-special.counter.do')
  })
})

// =============================================================================
// delete command tests
// =============================================================================

describe('do delete <id>', () => {
  it('should delete a DO by ID', async () => {
    const result = await remove(testContext, 'counter.do')

    expect(result).toBe(true)
  })

  it('should throw for non-existent DO', async () => {
    await expect(remove(testContext, 'does-not-exist.do')).rejects.toThrow(/not found/i)
  })

  it('should require authentication', async () => {
    const noAuthContext: CLIContext = { apiUrl: 'https://objects.do' }

    await expect(remove(noAuthContext, 'counter.do')).rejects.toThrow(/auth|token|unauthorized/i)
  })

  it('should not delete system DOs', async () => {
    // System DOs should be protected
    await expect(remove(testContext, 'objects.do')).rejects.toThrow(/protected|system|forbidden/i)
  })
})

// =============================================================================
// logs command tests
// =============================================================================

describe('do logs <id>', () => {
  it('should stream logs from a DO', async () => {
    const receivedLogs: LogEntry[] = []

    const abort = await logs(testContext, 'counter.do', (entry) => {
      receivedLogs.push(entry)
    })

    expect(typeof abort).toBe('function')

    // Cleanup
    abort()
  })

  it('should receive properly structured log entries', async () => {
    let receivedEntry: LogEntry | null = null

    const abort = await logs(testContext, 'counter.do', (entry) => {
      receivedEntry = entry
    })

    // Wait a bit for logs
    await new Promise((resolve) => setTimeout(resolve, 100))
    abort()

    if (receivedEntry) {
      expect(receivedEntry).toHaveProperty('timestamp')
      expect(receivedEntry).toHaveProperty('level')
      expect(receivedEntry).toHaveProperty('message')
      expect(['debug', 'info', 'warn', 'error']).toContain(receivedEntry.level)
    }
  })

  it('should throw for non-existent DO', async () => {
    await expect(
      logs(testContext, 'does-not-exist.do', () => {})
    ).rejects.toThrow(/not found/i)
  })

  it('should allow aborting the stream', async () => {
    let callCount = 0

    const abort = await logs(testContext, 'counter.do', () => {
      callCount++
    })

    abort()

    const countAfterAbort = callCount
    await new Promise((resolve) => setTimeout(resolve, 100))

    // No new logs should arrive after abort
    expect(callCount).toBe(countAfterAbort)
  })
})

// =============================================================================
// schema command tests
// =============================================================================

describe('do schema <id>', () => {
  it('should get DO schema by ID', async () => {
    const result = await schema(testContext, 'counter.do')

    expect(result).toBeDefined()
    expect(result.id).toBe('counter.do')
    expect(result.version).toBeDefined()
    expect(result.methods).toBeInstanceOf(Array)
  })

  it('should return methods with proper structure', async () => {
    const result = await schema(testContext, 'counter.do')

    expect(result.methods.length).toBeGreaterThan(0)

    const method = result.methods[0]
    expect(method).toHaveProperty('name')
    expect(method).toHaveProperty('path')
  })

  it('should include parameter information', async () => {
    const result = await schema(testContext, 'counter.do')

    const methodWithParams = result.methods.find((m) => m.params && m.params.length > 0)

    if (methodWithParams && methodWithParams.params) {
      const param = methodWithParams.params[0]
      expect(param).toHaveProperty('name')
      expect(param).toHaveProperty('type')
    }
  })

  it('should include namespaces if present', async () => {
    const result = await schema(testContext, 'counter.do')

    // Namespaces are optional
    if (result.namespaces) {
      expect(result.namespaces).toBeInstanceOf(Array)
    }
  })

  it('should throw for non-existent DO', async () => {
    await expect(schema(testContext, 'does-not-exist.do')).rejects.toThrow(/not found/i)
  })
})

// =============================================================================
// call command tests
// =============================================================================

describe('do call <id> <method>', () => {
  it('should call an RPC method on a DO', async () => {
    const result = await call(testContext, 'counter.do', 'increment', [1])

    expect(result).toBeDefined()
    expect(result.result).toBeDefined()
  })

  it('should return RPC response structure', async () => {
    const result = await call(testContext, 'counter.do', 'get')

    expect(result).toHaveProperty('result')
    // Error should be undefined on success
    expect(result.error).toBeUndefined()
  })

  it('should handle nested method paths', async () => {
    // e.g., users.create or db.collections.insert
    const result = await call(testContext, 'app.do', 'users.create', [{ name: 'Test' }])

    expect(result.result).toBeDefined()
  })

  it('should handle methods with no params', async () => {
    const result = await call(testContext, 'counter.do', 'get')

    expect(result.result).toBeDefined()
  })

  it('should handle methods with multiple params', async () => {
    const result = await call(testContext, 'counter.do', 'add', [5, 10])

    expect(result.result).toBeDefined()
  })

  it('should return error for non-existent method', async () => {
    const result = await call(testContext, 'counter.do', 'nonExistentMethod')

    expect(result.error).toBeDefined()
    expect(result.error?.code).toBe(-32601) // Method not found
  })

  it('should return error for non-existent DO', async () => {
    const result = await call(testContext, 'does-not-exist.do', 'get')

    expect(result.error).toBeDefined()
    expect(result.error?.message).toMatch(/not found/i)
  })

  it('should handle RPC errors properly', async () => {
    const result = await call(testContext, 'counter.do', 'divide', [1, 0])

    expect(result.error).toBeDefined()
    expect(result.error?.code).toBeDefined()
    expect(result.error?.message).toBeDefined()
  })
})

// =============================================================================
// runCLI integration tests
// =============================================================================

describe('runCLI', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('should print help with no arguments', async () => {
    await runCLI([], testContext)

    expect(console.log).toHaveBeenCalled()
  })

  it('should print help with --help flag', async () => {
    await runCLI(['--help'], testContext)

    expect(console.log).toHaveBeenCalled()
  })

  it('should print help with help command', async () => {
    await runCLI(['help'], testContext)

    expect(console.log).toHaveBeenCalled()
  })

  it('should error on unknown command', async () => {
    await runCLI(['unknowncommand'], testContext)

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unknown command'))
  })

  it('should have all required commands registered', () => {
    const commandNames = commands.map((c) => c.name)

    expect(commandNames).toContain('publish')
    expect(commandNames).toContain('list')
    expect(commandNames).toContain('get')
    expect(commandNames).toContain('delete')
    expect(commandNames).toContain('logs')
    expect(commandNames).toContain('schema')
    expect(commandNames).toContain('call')
  })

  it('should have descriptions for all commands', () => {
    for (const cmd of commands) {
      expect(cmd.description).toBeDefined()
      expect(cmd.description.length).toBeGreaterThan(0)
    }
  })

  it('should have usage examples for all commands', () => {
    for (const cmd of commands) {
      expect(cmd.usage).toBeDefined()
      expect(cmd.usage).toContain('do')
      expect(cmd.usage).toContain(cmd.name)
    }
  })
})

// =============================================================================
// Type exports validation
// =============================================================================

describe('CLI type exports', () => {
  it('should export CLIContext type', () => {
    const ctx: CLIContext = { apiUrl: 'https://test.com' }
    expect(ctx.apiUrl).toBeDefined()
  })

  it('should export PublishOptions type', () => {
    const opts: PublishOptions = { source: './test.json' }
    expect(opts.source).toBeDefined()
  })

  it('should export PublishResult type', () => {
    const result: PublishResult = {
      id: 'test.do',
      name: 'Test',
      version: '1.0.0',
      url: 'https://test.do',
    }
    expect(result.id).toBeDefined()
  })

  it('should export DOInfo type', () => {
    const info: DOInfo = sampleDOInfo
    expect(info.status).toBe('running')
  })

  it('should export DOListResult type', () => {
    const result: DOListResult = { objects: [], total: 0, hasMore: false }
    expect(result.objects).toBeInstanceOf(Array)
  })

  it('should export DOSchema type', () => {
    const schema: DOSchema = {
      id: 'test.do',
      version: 1,
      methods: [{ name: 'test', path: 'test' }],
    }
    expect(schema.methods).toHaveLength(1)
  })

  it('should export RPCCallResult type', () => {
    const result: RPCCallResult = { result: 42 }
    expect(result.result).toBe(42)
  })

  it('should export LogEntry type', () => {
    const entry: LogEntry = {
      timestamp: '2025-01-25T00:00:00Z',
      level: 'info',
      message: 'test',
    }
    expect(entry.level).toBe('info')
  })
})
