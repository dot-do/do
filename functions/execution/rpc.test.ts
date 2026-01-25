/**
 * Tests for Tier 2 RPC Service Execution
 *
 * @module execution/__tests__/rpc.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  executeRpc,
  configureService,
  removeServiceConfig,
  createJqClient,
  createGitClient,
  createNpmClient,
  createKvClient,
  createDbClient,
} from './rpc'

describe('RPC Execution', () => {
  // Mock fetch for testing
  const mockFetch = vi.fn()
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = mockFetch
    mockFetch.mockReset()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('executeRpc()', () => {
    it('should make RPC calls to services', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: 'success' }),
      })

      const result = await executeRpc('jq.query', [{ data: 'test' }, '.data'])

      expect(result.success).toBe(true)
      expect(result.tier).toBe(2)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://jq.do/query',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )
    })

    it('should handle RPC errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      })

      const result = await executeRpc('jq.query', [])

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('RPC_ERROR')
    })

    it('should return error for unknown services', async () => {
      const result = await executeRpc('unknown.service', [])

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('UNKNOWN_SERVICE')
    })

    it('should parse operation strings correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      await executeRpc('git.clone', ['https://github.com/repo'])

      expect(mockFetch).toHaveBeenCalledWith(
        'https://git.do/clone',
        expect.any(Object)
      )
    })

    // TODO: custom.do/method format not supported - needs implementation
    it.skip('should handle .do/ operation format', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      await executeRpc('custom.do/method', ['arg'])

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('method'),
        expect.any(Object)
      )
    })
  })

  describe('configureService()', () => {
    it('should override default service configuration', async () => {
      configureService('jq.do', {
        baseUrl: 'https://custom-jq.example.com',
        authToken: 'secret',
      })

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      await executeRpc('jq.query', [])

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom-jq.example.com/query',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer secret',
          }),
        })
      )

      // Clean up
      removeServiceConfig('jq.do')
    })
  })

  describe('createJqClient()', () => {
    it('should create JQ client with query method', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ names: ['a', 'b'] }),
      })

      const jq = createJqClient()
      const result = await jq.query({ items: [{ name: 'a' }, { name: 'b' }] }, '.items[].name')

      expect(result).toEqual({ names: ['a', 'b'] })
    })

    it('should throw on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request'),
      })

      const jq = createJqClient()

      await expect(jq.query({}, 'invalid')).rejects.toThrow()
    })
  })

  describe('createGitClient()', () => {
    it('should create Git client with repository methods', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const git = createGitClient('/repo')

      await git.init()
      expect(mockFetch).toHaveBeenCalledWith(
        'https://git.do/init',
        expect.any(Object)
      )

      await git.add(['file.txt'])
      expect(mockFetch).toHaveBeenCalledWith(
        'https://git.do/add',
        expect.any(Object)
      )
    })

    it('should pass repository path to all calls', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const git = createGitClient('/my-repo')
      await git.status()

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.args).toContain('/my-repo')
    })
  })

  describe('createNpmClient()', () => {
    it('should create NPM client with package methods', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ name: 'lodash', version: '4.17.21' }]),
      })

      const npm = createNpmClient('/project')
      const packages = await npm.list()

      expect(packages).toHaveLength(1)
      expect(packages[0].name).toBe('lodash')
    })
  })

  describe('createKvClient()', () => {
    it('should create KV client with CRUD methods', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve('value'),
      })

      const kv = createKvClient('my-namespace')
      const value = await kv.get('key')

      expect(value).toBe('value')
    })
  })

  describe('createDbClient()', () => {
    it('should create DB client with query methods', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 1, name: 'test' }]),
      })

      const db = createDbClient('my-db')
      const rows = await db.query('SELECT * FROM users')

      expect(rows).toHaveLength(1)
    })
  })
})
