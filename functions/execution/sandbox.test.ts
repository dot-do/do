/**
 * Tests for Tier 4 Linux Sandbox Execution
 *
 * @module execution/__tests__/sandbox.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  executeSandbox,
  executeBash,
  configureSandbox,
  getSandboxConfig,
  resetSandboxConfig,
  getActiveInstances,
  destroyAllInstances,
  cleanupStaleInstances,
  compile,
  runContainer,
  executePython,
  executeNode,
} from './sandbox'

describe('Sandbox Execution', () => {
  const mockFetch = vi.fn()
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = mockFetch
    mockFetch.mockReset()
    resetSandboxConfig()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('executeSandbox()', () => {
    it('should execute operations in sandbox', async () => {
      // Mock instance creation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'test-instance' }),
      })

      // Mock execution
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ stdout: 'Hello', exitCode: 0 }),
      })

      const result = await executeSandbox('bash', ['echo "Hello"'])

      expect(result.success).toBe(true)
      expect(result.tier).toBe(4)
    })

    it('should handle sandbox creation errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await executeSandbox('bash', ['echo "test"'])

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('SANDBOX_ERROR')
    })

    it('should handle execution errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Execution failed'),
      })

      const result = await executeSandbox('bash', ['invalid'])

      expect(result.success).toBe(false)
    })
  })

  describe('executeBash()', () => {
    it('should return BashResult structure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            exitCode: 0,
            stdout: 'output',
            stderr: '',
          }),
      })

      const result = await executeBash('echo "test"')

      expect(result.tier).toBe(4)
      expect(result.exitCode).toBeDefined()
      expect(result.stdout).toBeDefined()
      expect(result.stderr).toBeDefined()
    })

    it('should handle execution failures', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Command failed'),
      })

      const result = await executeBash('exit 1')

      expect(result.success).toBe(false)
      expect(result.exitCode).toBe(1)
    })
  })

  describe('configureSandbox()', () => {
    it('should update sandbox configuration', () => {
      configureSandbox({
        serviceUrl: 'https://custom-sandbox.do',
        timeout: 60000,
        memoryLimit: 1024 * 1024 * 1024,
      })

      const config = getSandboxConfig()

      expect(config.serviceUrl).toBe('https://custom-sandbox.do')
      expect(config.timeout).toBe(60000)
      expect(config.memoryLimit).toBe(1024 * 1024 * 1024)
    })

    it('should preserve unmodified settings', () => {
      const originalConfig = getSandboxConfig()

      configureSandbox({ timeout: 5000 })

      const newConfig = getSandboxConfig()

      expect(newConfig.serviceUrl).toBe(originalConfig.serviceUrl)
      expect(newConfig.timeout).toBe(5000)
    })
  })

  describe('resetSandboxConfig()', () => {
    it('should reset to default configuration', () => {
      configureSandbox({
        serviceUrl: 'https://modified.do',
        timeout: 99999,
      })

      resetSandboxConfig()

      const config = getSandboxConfig()

      expect(config.serviceUrl).toBe('https://sandbox.do')
      expect(config.timeout).toBe(30000)
    })
  })

  describe('Instance Management', () => {
    describe('getActiveInstances()', () => {
      it('should return list of active instances', () => {
        const instances = getActiveInstances()

        expect(Array.isArray(instances)).toBe(true)
      })
    })

    describe('destroyAllInstances()', () => {
      it('should destroy all instances', async () => {
        await destroyAllInstances()

        const instances = getActiveInstances()

        expect(instances).toHaveLength(0)
      })
    })

    describe('cleanupStaleInstances()', () => {
      it('should clean up old instances', async () => {
        const cleaned = await cleanupStaleInstances(0)

        expect(typeof cleaned).toBe('number')
      })
    })
  })

  describe('Specialized Executors', () => {
    describe('compile()', () => {
      it('should compile C code', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ binary: 'a.out' }),
        })

        const result = await compile('c', 'int main() { return 0; }')

        expect(result.tier).toBe(4)
      })

      it('should reject unsupported languages', async () => {
        const result = await compile('unsupported', 'code')

        expect(result.success).toBe(false)
        expect(result.error?.code).toBe('UNSUPPORTED_LANGUAGE')
      })

      it('should support multiple languages', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({}),
        })

        const languages = ['c', 'cpp', 'rust', 'go', 'java']

        for (const lang of languages) {
          const result = await compile(lang, 'code')
          expect(result.tier).toBe(4)
        }
      })
    })

    describe('runContainer()', () => {
      it('should run container with image and command', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ exitCode: 0 }),
        })

        const result = await runContainer('alpine:latest', ['echo', 'hello'])

        expect(result.tier).toBe(4)
      })

      it('should pass volumes and env', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({}),
        })

        const result = await runContainer('node:18', ['node', 'app.js'], {
          volumes: { '/data': '/mnt/data' },
          env: { NODE_ENV: 'production' },
        })

        expect(result.tier).toBe(4)
      })
    })

    describe('executePython()', () => {
      it('should execute Python scripts', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              exitCode: 0,
              stdout: 'Hello from Python',
              stderr: '',
            }),
        })

        const result = await executePython('print("Hello from Python")')

        expect(result.tier).toBe(4)
      })

      it('should install packages if specified', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              exitCode: 0,
              stdout: '',
              stderr: '',
            }),
        })

        const result = await executePython('import requests', {
          packages: ['requests'],
        })

        expect(result.tier).toBe(4)
      })
    })

    describe('executeNode()', () => {
      it('should execute Node.js scripts', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              exitCode: 0,
              stdout: 'Hello from Node',
              stderr: '',
            }),
        })

        const result = await executeNode('console.log("Hello from Node")')

        expect(result.tier).toBe(4)
      })

      it('should install packages if specified', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              exitCode: 0,
              stdout: '',
              stderr: '',
            }),
        })

        const result = await executeNode('const _ = require("lodash")', {
          packages: ['lodash'],
        })

        expect(result.tier).toBe(4)
      })
    })
  })
})
