/**
 * @dotdo/do - JSON-RPC 2.0 Tests
 *
 * Tests for JSON-RPC 2.0 implementation according to specification.
 * https://www.jsonrpc.org/specification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  JsonRpcServer,
  JsonRpcClient,
  JsonRpcErrorCode,
  JsonRpcErrors,
  JSONRPC_VERSION,
  createJsonRpcRequest,
  createJsonRpcNotification,
  createJsonRpcError,
  isJsonRpcRequest,
  isJsonRpcResponse,
  isJsonRpcError,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcError,
  type JsonRpcBatchResponse,
} from '../../src/rpc'

describe('JSON-RPC 2.0 Constants', () => {
  it('should have correct version', () => {
    expect(JSONRPC_VERSION).toBe('2.0')
  })

  it('should have standard error codes', () => {
    expect(JsonRpcErrorCode.PARSE_ERROR).toBe(-32700)
    expect(JsonRpcErrorCode.INVALID_REQUEST).toBe(-32600)
    expect(JsonRpcErrorCode.METHOD_NOT_FOUND).toBe(-32601)
    expect(JsonRpcErrorCode.INVALID_PARAMS).toBe(-32602)
    expect(JsonRpcErrorCode.INTERNAL_ERROR).toBe(-32603)
    expect(JsonRpcErrorCode.SERVER_ERROR).toBe(-32000)
  })
})

describe('JSON-RPC 2.0 Error Factory', () => {
  it('should create error with code and message', () => {
    const error = createJsonRpcError(-32600, 'Invalid Request')
    expect(error.code).toBe(-32600)
    expect(error.message).toBe('Invalid Request')
    expect(error.data).toBeUndefined()
  })

  it('should create error with data', () => {
    const error = createJsonRpcError(-32602, 'Invalid params', { expected: 'number' })
    expect(error.code).toBe(-32602)
    expect(error.message).toBe('Invalid params')
    expect(error.data).toEqual({ expected: 'number' })
  })

  describe('JsonRpcErrors helpers', () => {
    it('should create parse error', () => {
      const error = JsonRpcErrors.parseError()
      expect(error.code).toBe(JsonRpcErrorCode.PARSE_ERROR)
      expect(error.message).toBe('Parse error')
    })

    it('should create invalid request error', () => {
      const error = JsonRpcErrors.invalidRequest('Missing jsonrpc')
      expect(error.code).toBe(JsonRpcErrorCode.INVALID_REQUEST)
      expect(error.message).toBe('Invalid Request')
      expect(error.data).toBe('Missing jsonrpc')
    })

    it('should create method not found error', () => {
      const error = JsonRpcErrors.methodNotFound('unknownMethod')
      expect(error.code).toBe(JsonRpcErrorCode.METHOD_NOT_FOUND)
      expect(error.message).toBe('Method not found')
      expect(error.data).toEqual({ method: 'unknownMethod' })
    })

    it('should create invalid params error', () => {
      const error = JsonRpcErrors.invalidParams('Expected object')
      expect(error.code).toBe(JsonRpcErrorCode.INVALID_PARAMS)
      expect(error.message).toBe('Invalid params')
    })

    it('should create internal error', () => {
      const error = JsonRpcErrors.internalError()
      expect(error.code).toBe(JsonRpcErrorCode.INTERNAL_ERROR)
      expect(error.message).toBe('Internal error')
    })

    it('should create server error', () => {
      const error = JsonRpcErrors.serverError('Database connection failed')
      expect(error.code).toBe(JsonRpcErrorCode.SERVER_ERROR)
      expect(error.message).toBe('Database connection failed')
    })

    it('should create execution error', () => {
      const error = JsonRpcErrors.executionError('Division by zero')
      expect(error.code).toBe(JsonRpcErrorCode.EXECUTION_ERROR)
      expect(error.message).toBe('Division by zero')
    })

    it('should create timeout error', () => {
      const error = JsonRpcErrors.timeoutError({ method: 'slowMethod' })
      expect(error.code).toBe(JsonRpcErrorCode.TIMEOUT_ERROR)
      expect(error.message).toBe('Timeout')
      expect(error.data).toEqual({ method: 'slowMethod' })
    })
  })
})

describe('JSON-RPC 2.0 Server', () => {
  let server: JsonRpcServer

  beforeEach(() => {
    server = new JsonRpcServer()
  })

  describe('Method Registration', () => {
    it('should register a method', () => {
      server.registerMethod('echo', async (params) => params)
      expect(server.hasMethod('echo')).toBe(true)
    })

    it('should throw on invalid method name', () => {
      expect(() => server.registerMethod('', async () => {})).toThrow()
      expect(() => server.registerMethod(null as any, async () => {})).toThrow()
    })

    it('should throw on invalid handler', () => {
      expect(() => server.registerMethod('test', 'not a function' as any)).toThrow()
    })

    it('should prevent registering rpc.* methods', () => {
      expect(() => server.registerMethod('rpc.list', async () => [])).toThrow('reserved')
    })

    it('should unregister a method', () => {
      server.registerMethod('test', async () => {})
      expect(server.hasMethod('test')).toBe(true)
      server.unregisterMethod('test')
      expect(server.hasMethod('test')).toBe(false)
    })

    it('should list registered methods', () => {
      server.registerMethod('method1', async () => {})
      server.registerMethod('method2', async () => {})
      const methods = server.getMethods()
      expect(methods).toContain('method1')
      expect(methods).toContain('method2')
      expect(methods).toHaveLength(2)
    })

    it('should allow chaining registerMethod calls', () => {
      const result = server
        .registerMethod('a', async () => 'a')
        .registerMethod('b', async () => 'b')
      expect(result).toBe(server)
      expect(server.getMethods()).toEqual(['a', 'b'])
    })
  })

  describe('Request Processing', () => {
    beforeEach(() => {
      server.registerMethod('echo', async (params) => params)
      server.registerMethod('add', async (params) => {
        if (Array.isArray(params)) {
          return (params[0] as number) + (params[1] as number)
        }
        const p = params as Record<string, number>
        return p.a + p.b
      })
      server.registerMethod('subtract', async (params) => {
        const p = params as Record<string, number>
        return p.minuend - p.subtrahend
      })
    })

    it('should process valid request with positional params', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'add',
        params: [1, 2],
        id: 1,
      }

      const response = await server.process(request) as JsonRpcResponse
      expect(response.jsonrpc).toBe('2.0')
      expect(response.result).toBe(3)
      expect(response.id).toBe(1)
      expect(response.error).toBeUndefined()
    })

    it('should process valid request with named params', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'subtract',
        params: { minuend: 42, subtrahend: 23 },
        id: '3',
      }

      const response = await server.process(request) as JsonRpcResponse
      expect(response.result).toBe(19)
      expect(response.id).toBe('3')
    })

    it('should process request without params', async () => {
      server.registerMethod('noParams', async () => 'success')
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'noParams',
        id: 1,
      }

      const response = await server.process(request) as JsonRpcResponse
      expect(response.result).toBe('success')
    })

    it('should return method not found error', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'nonexistent',
        params: [],
        id: 1,
      }

      const response = await server.process(request) as JsonRpcResponse
      expect(response.error).toBeDefined()
      expect(response.error!.code).toBe(JsonRpcErrorCode.METHOD_NOT_FOUND)
      expect(response.id).toBe(1)
    })

    it('should return invalid request for missing jsonrpc', async () => {
      const request = {
        method: 'echo',
        params: ['test'],
        id: 1,
      }

      const response = await server.process(request) as JsonRpcResponse
      expect(response.error).toBeDefined()
      expect(response.error!.code).toBe(JsonRpcErrorCode.INVALID_REQUEST)
    })

    it('should return invalid request for wrong jsonrpc version', async () => {
      const request = {
        jsonrpc: '1.0',
        method: 'echo',
        params: ['test'],
        id: 1,
      }

      const response = await server.process(request) as JsonRpcResponse
      expect(response.error).toBeDefined()
      expect(response.error!.code).toBe(JsonRpcErrorCode.INVALID_REQUEST)
    })

    it('should return invalid request for missing method', async () => {
      const request = {
        jsonrpc: '2.0',
        params: ['test'],
        id: 1,
      }

      const response = await server.process(request) as JsonRpcResponse
      expect(response.error).toBeDefined()
      expect(response.error!.code).toBe(JsonRpcErrorCode.INVALID_REQUEST)
    })

    it('should return invalid params for non-array non-object params', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'echo',
        params: 'not valid',
        id: 1,
      }

      const response = await server.process(request) as JsonRpcResponse
      expect(response.error).toBeDefined()
      expect(response.error!.code).toBe(JsonRpcErrorCode.INVALID_PARAMS)
    })

    it('should handle null id', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'echo',
        params: ['test'],
        id: null,
      }

      const response = await server.process(request) as JsonRpcResponse
      expect(response.id).toBeNull()
      expect(response.result).toEqual(['test'])
    })

    it('should handle string id', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'echo',
        params: ['test'],
        id: 'abc-123',
      }

      const response = await server.process(request) as JsonRpcResponse
      expect(response.id).toBe('abc-123')
    })

    it('should handle number id', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'echo',
        params: ['test'],
        id: 42,
      }

      const response = await server.process(request) as JsonRpcResponse
      expect(response.id).toBe(42)
    })
  })

  describe('Notification Handling', () => {
    it('should return null for notifications', async () => {
      server.registerMethod('notify', async () => 'result')
      const notification = {
        jsonrpc: '2.0' as const,
        method: 'notify',
        params: ['data'],
      }

      const response = await server.process(notification)
      expect(response).toBeNull()
    })

    it('should execute notification handler', async () => {
      const handler = vi.fn().mockResolvedValue('done')
      server.registerMethod('notify', handler)

      const notification = {
        jsonrpc: '2.0' as const,
        method: 'notify',
        params: ['data'],
      }

      await server.process(notification)
      expect(handler).toHaveBeenCalledWith(['data'], expect.any(Object))
    })

    it('should not return error for failing notification', async () => {
      server.registerMethod('failNotify', async () => {
        throw new Error('Fail')
      })

      const notification = {
        jsonrpc: '2.0' as const,
        method: 'failNotify',
      }

      const response = await server.process(notification)
      expect(response).toBeNull()
    })

    it('should reject notifications when disabled', async () => {
      const strictServer = new JsonRpcServer({ allowNotifications: false })
      strictServer.registerMethod('test', async () => 'result')

      const notification = {
        jsonrpc: '2.0' as const,
        method: 'test',
      }

      const response = await strictServer.process(notification) as JsonRpcResponse
      expect(response.error).toBeDefined()
      expect(response.error!.code).toBe(JsonRpcErrorCode.INVALID_REQUEST)
      expect(response.error!.data).toBe('Notifications not allowed')
    })
  })

  describe('Batch Request Processing', () => {
    beforeEach(() => {
      server.registerMethod('add', async (params) => {
        const [a, b] = params as number[]
        return a + b
      })
      server.registerMethod('subtract', async (params) => {
        const [a, b] = params as number[]
        return a - b
      })
      server.registerMethod('throw', async () => {
        throw new Error('Test error')
      })
    })

    it('should process batch requests', async () => {
      const batch: JsonRpcRequest[] = [
        { jsonrpc: '2.0', method: 'add', params: [1, 2], id: 1 },
        { jsonrpc: '2.0', method: 'subtract', params: [10, 5], id: 2 },
      ]

      const responses = await server.process(batch) as JsonRpcBatchResponse
      expect(responses).toHaveLength(2)
      expect(responses[0].result).toBe(3)
      expect(responses[0].id).toBe(1)
      expect(responses[1].result).toBe(5)
      expect(responses[1].id).toBe(2)
    })

    it('should handle mixed success and failure in batch', async () => {
      const batch: JsonRpcRequest[] = [
        { jsonrpc: '2.0', method: 'add', params: [1, 2], id: 1 },
        { jsonrpc: '2.0', method: 'nonexistent', params: [], id: 2 },
        { jsonrpc: '2.0', method: 'throw', params: [], id: 3 },
      ]

      const responses = await server.process(batch) as JsonRpcBatchResponse
      expect(responses).toHaveLength(3)
      expect(responses[0].result).toBe(3)
      expect(responses[1].error!.code).toBe(JsonRpcErrorCode.METHOD_NOT_FOUND)
      expect(responses[2].error).toBeDefined()
    })

    it('should handle batch with notifications', async () => {
      server.registerMethod('notify', async () => 'done')
      const batch = [
        { jsonrpc: '2.0' as const, method: 'add', params: [1, 1], id: 1 },
        { jsonrpc: '2.0' as const, method: 'notify' }, // notification
        { jsonrpc: '2.0' as const, method: 'add', params: [2, 2], id: 2 },
      ]

      const responses = await server.process(batch) as JsonRpcBatchResponse
      expect(responses).toHaveLength(2) // notifications don't return responses
      expect(responses.find(r => r.id === 1)!.result).toBe(2)
      expect(responses.find(r => r.id === 2)!.result).toBe(4)
    })

    it('should return null for all-notification batch', async () => {
      server.registerMethod('notify', async () => 'done')
      const batch = [
        { jsonrpc: '2.0' as const, method: 'notify' },
        { jsonrpc: '2.0' as const, method: 'notify' },
      ]

      const response = await server.process(batch)
      expect(response).toBeNull()
    })

    it('should reject empty batch', async () => {
      const response = await server.process([]) as JsonRpcResponse
      expect(response.error).toBeDefined()
      expect(response.error!.code).toBe(JsonRpcErrorCode.INVALID_REQUEST)
    })

    it('should reject batch when disabled', async () => {
      const noBatchServer = new JsonRpcServer({ allowBatch: false })
      noBatchServer.registerMethod('test', async () => 'result')

      const response = await noBatchServer.process([
        { jsonrpc: '2.0', method: 'test', id: 1 },
      ]) as JsonRpcResponse

      expect(response.error).toBeDefined()
      expect(response.error!.code).toBe(JsonRpcErrorCode.INVALID_REQUEST)
      expect(response.error!.data).toBe('Batch requests not allowed')
    })

    it('should reject batch exceeding max size', async () => {
      const smallBatchServer = new JsonRpcServer({ maxBatchSize: 2 })
      const response = await smallBatchServer.process([
        { jsonrpc: '2.0', method: 'test', id: 1 },
        { jsonrpc: '2.0', method: 'test', id: 2 },
        { jsonrpc: '2.0', method: 'test', id: 3 },
      ]) as JsonRpcResponse

      expect(response.error).toBeDefined()
      expect(response.error!.code).toBe(JsonRpcErrorCode.INVALID_REQUEST)
      expect(response.error!.data).toContain('exceeds maximum')
    })
  })

  describe('HTTP Request Handling', () => {
    beforeEach(() => {
      server.registerMethod('echo', async (params) => params)
    })

    it('should handle valid HTTP request', async () => {
      const httpRequest = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'echo',
          params: ['hello'],
          id: 1,
        }),
      })

      const response = await server.handleRequest(httpRequest)
      expect(response.status).toBe(200)

      const body = await response.json() as JsonRpcResponse
      expect(body.result).toEqual(['hello'])
    })

    it('should reject non-POST requests', async () => {
      const httpRequest = new Request('http://localhost/rpc', {
        method: 'GET',
      })

      const response = await server.handleRequest(httpRequest)
      expect(response.status).toBe(405)
      expect(response.headers.get('Allow')).toBe('POST')
    })

    it('should reject wrong content type', async () => {
      const httpRequest = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{}',
      })

      const response = await server.handleRequest(httpRequest)
      expect(response.status).toBe(415)
    })

    it('should handle parse errors', async () => {
      const httpRequest = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid json',
      })

      const response = await server.handleRequest(httpRequest)
      expect(response.status).toBe(200) // JSON-RPC spec says 200 even for parse errors

      const body = await response.json() as JsonRpcResponse
      expect(body.error!.code).toBe(JsonRpcErrorCode.PARSE_ERROR)
    })

    it('should return 204 for notifications', async () => {
      server.registerMethod('notify', async () => {})
      const httpRequest = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notify',
        }),
      })

      const response = await server.handleRequest(httpRequest)
      expect(response.status).toBe(204)
    })
  })

  describe('Error Handling', () => {
    it('should handle thrown errors', async () => {
      server.registerMethod('error', async () => {
        throw new Error('Something went wrong')
      })

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'error',
        id: 1,
      }

      const response = await server.process(request) as JsonRpcResponse
      expect(response.error).toBeDefined()
      expect(response.error!.code).toBe(JsonRpcErrorCode.EXECUTION_ERROR)
      expect(response.error!.message).toBe('Something went wrong')
    })

    it('should handle thrown JSON-RPC errors', async () => {
      server.registerMethod('rpcError', async () => {
        throw JsonRpcErrors.invalidParams('Expected array')
      })

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'rpcError',
        id: 1,
      }

      const response = await server.process(request) as JsonRpcResponse
      expect(response.error!.code).toBe(JsonRpcErrorCode.INVALID_PARAMS)
      expect(response.error!.message).toBe('Invalid params')
    })

    it('should handle non-Error throws', async () => {
      server.registerMethod('stringThrow', async () => {
        throw 'string error'
      })

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'stringThrow',
        id: 1,
      }

      const response = await server.process(request) as JsonRpcResponse
      expect(response.error).toBeDefined()
      expect(response.error!.code).toBe(JsonRpcErrorCode.INTERNAL_ERROR)
    })
  })

  describe('Timeout Handling', () => {
    it('should timeout slow methods', async () => {
      const slowServer = new JsonRpcServer({ timeout: 50 })
      slowServer.registerMethod('slow', async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        return 'done'
      })

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'slow',
        id: 1,
      }

      const response = await slowServer.process(request) as JsonRpcResponse
      expect(response.error).toBeDefined()
      expect(response.error!.code).toBe(JsonRpcErrorCode.TIMEOUT_ERROR)
    })
  })

  describe('Context Passing', () => {
    it('should pass context to handlers', async () => {
      let receivedContext: any
      server.registerMethod('checkContext', async (_params, context) => {
        receivedContext = context
        return 'done'
      })

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'checkContext',
        params: [],
        id: 'test-id',
      }

      await server.process(request, { metadata: { user: 'test' } })
      expect(receivedContext.id).toBe('test-id')
      expect(receivedContext.metadata).toEqual({ user: 'test' })
    })
  })
})

describe('JSON-RPC 2.0 Client', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
  })

  describe('Single Requests', () => {
    it('should make a valid request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ jsonrpc: '2.0', result: 'hello', id: 1 }),
      })

      const client = new JsonRpcClient({
        url: 'http://localhost/rpc',
        fetch: mockFetch,
      })

      const result = await client.call('echo', ['hello'])
      expect(result).toBe('hello')

      expect(mockFetch).toHaveBeenCalledWith('http://localhost/rpc', {
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('"method":"echo"'),
        signal: expect.any(AbortSignal),
      })
    })

    it('should handle error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            error: { code: -32601, message: 'Method not found' },
            id: 1,
          }),
      })

      const client = new JsonRpcClient({
        url: 'http://localhost/rpc',
        fetch: mockFetch,
      })

      await expect(client.call('unknown')).rejects.toMatchObject({
        message: 'Method not found',
        code: -32601,
      })
    })

    it('should include custom headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ jsonrpc: '2.0', result: 'ok', id: 1 }),
      })

      const client = new JsonRpcClient({
        url: 'http://localhost/rpc',
        headers: { Authorization: 'Bearer token' },
        fetch: mockFetch,
      })

      await client.call('test')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
          }),
        })
      )
    })
  })

  describe('Notifications', () => {
    it('should send notification without id', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
      })

      const client = new JsonRpcClient({
        url: 'http://localhost/rpc',
        fetch: mockFetch,
      })

      await client.notify('log', ['message'])
      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.id).toBeUndefined()
      expect(body.method).toBe('log')
    })
  })

  describe('Batch Requests', () => {
    it('should make batch requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            { jsonrpc: '2.0', result: 3, id: 1 },
            { jsonrpc: '2.0', result: 5, id: 2 },
          ]),
      })

      const client = new JsonRpcClient({
        url: 'http://localhost/rpc',
        fetch: mockFetch,
      })

      const results = await client.batch([
        { method: 'add', params: [1, 2] },
        { method: 'add', params: [2, 3] },
      ])

      expect(results).toEqual([3, 5])
    })

    it('should handle batch errors', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            { jsonrpc: '2.0', result: 3, id: 1 },
            { jsonrpc: '2.0', error: { code: -32601, message: 'Not found' }, id: 2 },
          ]),
      })

      const client = new JsonRpcClient({
        url: 'http://localhost/rpc',
        fetch: mockFetch,
      })

      await expect(
        client.batch([{ method: 'add', params: [1, 2] }, { method: 'unknown' }])
      ).rejects.toMatchObject({
        message: 'Not found',
        code: -32601,
      })
    })
  })
})

describe('JSON-RPC 2.0 Utility Functions', () => {
  describe('createJsonRpcRequest', () => {
    it('should create request with all fields', () => {
      const request = createJsonRpcRequest('test', [1, 2], 'id-1')
      expect(request).toEqual({
        jsonrpc: '2.0',
        method: 'test',
        params: [1, 2],
        id: 'id-1',
      })
    })

    it('should create request without optional fields', () => {
      const request = createJsonRpcRequest('test')
      expect(request).toEqual({
        jsonrpc: '2.0',
        method: 'test',
      })
      expect(request.params).toBeUndefined()
      expect(request.id).toBeUndefined()
    })
  })

  describe('createJsonRpcNotification', () => {
    it('should create notification without id', () => {
      const notification = createJsonRpcNotification('notify', { data: 'test' })
      expect(notification).toEqual({
        jsonrpc: '2.0',
        method: 'notify',
        params: { data: 'test' },
      })
      expect('id' in notification).toBe(false)
    })
  })

  describe('isJsonRpcRequest', () => {
    it('should identify valid requests', () => {
      expect(isJsonRpcRequest({ jsonrpc: '2.0', method: 'test' })).toBe(true)
      expect(isJsonRpcRequest({ jsonrpc: '2.0', method: 'test', params: [] })).toBe(true)
      expect(isJsonRpcRequest({ jsonrpc: '2.0', method: 'test', params: {}, id: 1 })).toBe(true)
    })

    it('should reject invalid requests', () => {
      expect(isJsonRpcRequest(null)).toBe(false)
      expect(isJsonRpcRequest({})).toBe(false)
      expect(isJsonRpcRequest({ jsonrpc: '1.0', method: 'test' })).toBe(false)
      expect(isJsonRpcRequest({ jsonrpc: '2.0' })).toBe(false)
      expect(isJsonRpcRequest({ jsonrpc: '2.0', method: 'test', params: 'invalid' })).toBe(false)
    })
  })

  describe('isJsonRpcResponse', () => {
    it('should identify valid responses', () => {
      expect(isJsonRpcResponse({ jsonrpc: '2.0', result: 'ok', id: 1 })).toBe(true)
      expect(isJsonRpcResponse({ jsonrpc: '2.0', error: { code: -32600, message: 'err' }, id: 1 })).toBe(true)
    })

    it('should reject invalid responses', () => {
      expect(isJsonRpcResponse(null)).toBe(false)
      expect(isJsonRpcResponse({})).toBe(false)
      expect(isJsonRpcResponse({ jsonrpc: '2.0', id: 1 })).toBe(false) // missing result or error
    })
  })

  describe('isJsonRpcError', () => {
    it('should identify error responses', () => {
      expect(isJsonRpcError({ jsonrpc: '2.0', error: { code: -32600, message: 'err' }, id: 1 })).toBe(true)
    })

    it('should reject success responses', () => {
      expect(isJsonRpcError({ jsonrpc: '2.0', result: 'ok', id: 1 })).toBe(false)
    })
  })
})

describe('JSON-RPC 2.0 Specification Compliance', () => {
  let server: JsonRpcServer

  beforeEach(() => {
    server = new JsonRpcServer()
    server.registerMethod('subtract', async (params) => {
      if (Array.isArray(params)) {
        return (params[0] as number) - (params[1] as number)
      }
      const p = params as Record<string, number>
      return p.minuend - p.subtrahend
    })
    server.registerMethod('update', async () => undefined)
    server.registerMethod('foobar', async () => undefined)
    server.registerMethod('notify_hello', async () => undefined)
    server.registerMethod('get_data', async () => ['hello', 5])
    server.registerMethod('notify_sum', async () => undefined)
    server.registerMethod('sum', async (params) => {
      const nums = params as number[]
      return nums.reduce((a, b) => a + b, 0)
    })
  })

  // Examples from JSON-RPC 2.0 specification

  it('spec example: rpc call with positional parameters (1)', async () => {
    const request = { jsonrpc: '2.0' as const, method: 'subtract', params: [42, 23], id: 1 }
    const response = await server.process(request) as JsonRpcResponse
    expect(response).toEqual({ jsonrpc: '2.0', result: 19, id: 1 })
  })

  it('spec example: rpc call with positional parameters (2)', async () => {
    const request = { jsonrpc: '2.0' as const, method: 'subtract', params: [23, 42], id: 2 }
    const response = await server.process(request) as JsonRpcResponse
    expect(response).toEqual({ jsonrpc: '2.0', result: -19, id: 2 })
  })

  it('spec example: rpc call with named parameters (1)', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      method: 'subtract',
      params: { subtrahend: 23, minuend: 42 },
      id: 3,
    }
    const response = await server.process(request) as JsonRpcResponse
    expect(response).toEqual({ jsonrpc: '2.0', result: 19, id: 3 })
  })

  it('spec example: rpc call with named parameters (2)', async () => {
    const request = {
      jsonrpc: '2.0' as const,
      method: 'subtract',
      params: { minuend: 42, subtrahend: 23 },
      id: 4,
    }
    const response = await server.process(request) as JsonRpcResponse
    expect(response).toEqual({ jsonrpc: '2.0', result: 19, id: 4 })
  })

  it('spec example: notification', async () => {
    const notification = { jsonrpc: '2.0' as const, method: 'update', params: [1, 2, 3, 4, 5] }
    const response = await server.process(notification)
    expect(response).toBeNull()
  })

  it('spec example: notification without params', async () => {
    const notification = { jsonrpc: '2.0' as const, method: 'foobar' }
    const response = await server.process(notification)
    expect(response).toBeNull()
  })

  it('spec example: rpc call of non-existent method', async () => {
    const request = { jsonrpc: '2.0' as const, method: 'nonexistent', id: '1' }
    const response = await server.process(request) as JsonRpcResponse
    expect(response.jsonrpc).toBe('2.0')
    expect(response.error!.code).toBe(-32601)
    expect(response.id).toBe('1')
  })

  it('spec example: rpc call with invalid JSON', async () => {
    const httpRequest = new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"jsonrpc": "2.0", "method": "foobar, "params": "bar", "baz]',
    })

    const httpResponse = await server.handleRequest(httpRequest)
    const response = await httpResponse.json() as JsonRpcResponse
    expect(response.jsonrpc).toBe('2.0')
    expect(response.error!.code).toBe(-32700)
    expect(response.id).toBeNull()
  })

  it('spec example: rpc call with invalid Request object', async () => {
    const request = { jsonrpc: '2.0' as const, method: 1, params: 'bar' }
    const response = await server.process(request) as JsonRpcResponse
    expect(response.jsonrpc).toBe('2.0')
    expect(response.error!.code).toBe(-32600)
    expect(response.id).toBeNull()
  })

  it('spec example: rpc call Batch, invalid JSON', async () => {
    const httpRequest = new Request('http://localhost/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: `[
        {"jsonrpc": "2.0", "method": "sum", "params": [1,2,4], "id": "1"},
        {"jsonrpc": "2.0", "method"
      ]`,
    })

    const httpResponse = await server.handleRequest(httpRequest)
    const response = await httpResponse.json() as JsonRpcResponse
    expect(response.error!.code).toBe(-32700)
  })

  it('spec example: rpc call with an empty Array', async () => {
    const response = await server.process([]) as JsonRpcResponse
    expect(response.error!.code).toBe(-32600)
  })

  it('spec example: rpc call with an invalid Batch (but not empty)', async () => {
    const response = await server.process([1]) as JsonRpcBatchResponse
    expect(response).toHaveLength(1)
    expect(response[0].error!.code).toBe(-32600)
  })

  it('spec example: rpc call with invalid Batch', async () => {
    const response = await server.process([1, 2, 3]) as JsonRpcBatchResponse
    expect(response).toHaveLength(3)
    response.forEach((r) => {
      expect(r.error!.code).toBe(-32600)
    })
  })

  it('spec example: rpc call Batch', async () => {
    const batch = [
      { jsonrpc: '2.0' as const, method: 'sum', params: [1, 2, 4], id: '1' },
      { jsonrpc: '2.0' as const, method: 'notify_hello', params: [7] },
      { jsonrpc: '2.0' as const, method: 'subtract', params: [42, 23], id: '2' },
      { jsonrpc: '2.0' as const, method: 'foo.get', params: { name: 'myself' }, id: '5' },
      { jsonrpc: '2.0' as const, method: 'get_data', id: '9' },
    ]

    const responses = await server.process(batch) as JsonRpcBatchResponse
    // Should have 4 responses (notification doesn't return response)
    expect(responses).toHaveLength(4)

    // Check responses (order may vary, so find by id)
    const r1 = responses.find((r) => r.id === '1')!
    expect(r1.result).toBe(7)

    const r2 = responses.find((r) => r.id === '2')!
    expect(r2.result).toBe(19)

    const r5 = responses.find((r) => r.id === '5')!
    expect(r5.error!.code).toBe(-32601) // method not found

    const r9 = responses.find((r) => r.id === '9')!
    expect(r9.result).toEqual(['hello', 5])
  })

  it('spec example: rpc call Batch (all notifications)', async () => {
    const batch = [
      { jsonrpc: '2.0' as const, method: 'notify_sum', params: [1, 2, 4] },
      { jsonrpc: '2.0' as const, method: 'notify_hello', params: [7] },
    ]

    const response = await server.process(batch)
    expect(response).toBeNull()
  })
})
