/**
 * RPC Protocol Tests - RED Phase
 *
 * Tests for CapnWeb RPC Protocol serialization
 * - Request serialization
 * - Response serialization
 * - Error format
 * - Batch messages
 */

import { describe, it, expect, vi } from 'vitest'
import type {
  RPCRequest,
  RPCResponse,
  RPCError,
  RPCBatchRequest,
  RPCBatchResponse,
  RPCMeta,
  RpcErrorCodes,
} from '../types/rpc'

// These imports will fail until implementation exists
import {
  serializeRequest,
  deserializeRequest,
  serializeResponse,
  deserializeResponse,
  serializeBatchRequest,
  deserializeBatchRequest,
  serializeBatchResponse,
  deserializeBatchResponse,
  createRPCError,
  isRPCError,
  validateRequest,
  validateResponse,
  RPCProtocolError,
} from './protocol'

// =============================================================================
// Request Serialization Tests
// =============================================================================

describe('Protocol - Request Serialization', () => {
  it('should serialize basic request', () => {
    const request: RPCRequest = {
      id: 'req-123',
      method: 'do.system.ping',
    }

    const serialized = serializeRequest(request)

    expect(typeof serialized).toBe('string')
    const parsed = JSON.parse(serialized)
    expect(parsed.id).toBe('req-123')
    expect(parsed.method).toBe('do.system.ping')
  })

  it('should serialize request with params', () => {
    const request: RPCRequest = {
      id: 'req-456',
      method: 'do.nouns.list',
      params: { limit: 10, offset: 0 },
    }

    const serialized = serializeRequest(request)

    const parsed = JSON.parse(serialized)
    expect(parsed.params).toEqual({ limit: 10, offset: 0 })
  })

  it('should serialize request with metadata', () => {
    const request: RPCRequest = {
      id: 'req-789',
      method: 'do.identity.get',
      meta: {
        timestamp: 1704067200000,
        traceId: 'trace-abc',
        auth: 'Bearer token123',
      },
    }

    const serialized = serializeRequest(request)

    const parsed = JSON.parse(serialized)
    expect(parsed.meta.timestamp).toBe(1704067200000)
    expect(parsed.meta.traceId).toBe('trace-abc')
    expect(parsed.meta.auth).toBe('Bearer token123')
  })

  it('should handle null params', () => {
    const request: RPCRequest = {
      id: 'req-null',
      method: 'do.test',
      params: null,
    }

    const serialized = serializeRequest(request)

    const parsed = JSON.parse(serialized)
    expect(parsed.params).toBeNull()
  })

  it('should handle array params', () => {
    const request: RPCRequest = {
      id: 'req-array',
      method: 'do.batch.process',
      params: ['item1', 'item2', 'item3'],
    }

    const serialized = serializeRequest(request)

    const parsed = JSON.parse(serialized)
    expect(parsed.params).toEqual(['item1', 'item2', 'item3'])
  })

  it('should handle nested object params', () => {
    const request: RPCRequest = {
      id: 'req-nested',
      method: 'do.workflows.create',
      params: {
        name: 'My Workflow',
        definition: {
          type: 'state-machine',
          states: {
            idle: { on: { START: 'running' } },
            running: { on: { STOP: 'idle' } },
          },
        },
      },
    }

    const serialized = serializeRequest(request)

    const parsed = JSON.parse(serialized)
    expect(parsed.params.definition.states.idle.on.START).toBe('running')
  })

  it('should handle special characters in strings', () => {
    const request: RPCRequest = {
      id: 'req-special',
      method: 'do.nouns.create',
      params: {
        name: 'Test "Entity"',
        description: "It's a\nmultiline\tstring with unicode",
      },
    }

    const serialized = serializeRequest(request)

    const parsed = JSON.parse(serialized)
    expect(parsed.params.name).toBe('Test "Entity"')
    expect(parsed.params.description).toContain('\n')
  })

  it('should preserve Date as ISO string', () => {
    const date = new Date('2024-01-01T00:00:00.000Z')
    const request: RPCRequest = {
      id: 'req-date',
      method: 'do.events.create',
      params: { timestamp: date.toISOString() },
    }

    const serialized = serializeRequest(request)

    const parsed = JSON.parse(serialized)
    expect(parsed.params.timestamp).toBe('2024-01-01T00:00:00.000Z')
  })
})

// =============================================================================
// Request Deserialization Tests
// =============================================================================

describe('Protocol - Request Deserialization', () => {
  it('should deserialize valid request', () => {
    const json = JSON.stringify({
      id: 'req-123',
      method: 'do.system.ping',
    })

    const request = deserializeRequest(json)

    expect(request.id).toBe('req-123')
    expect(request.method).toBe('do.system.ping')
  })

  it('should deserialize request with params', () => {
    const json = JSON.stringify({
      id: 'req-456',
      method: 'do.nouns.list',
      params: { limit: 10 },
    })

    const request = deserializeRequest(json)

    expect(request.params).toEqual({ limit: 10 })
  })

  it('should throw on invalid JSON', () => {
    expect(() => deserializeRequest('{invalid json')).toThrow(RPCProtocolError)
    expect(() => deserializeRequest('{invalid json')).toThrow(/parse/i)
  })

  it('should throw on missing id', () => {
    const json = JSON.stringify({ method: 'do.test' })

    expect(() => deserializeRequest(json)).toThrow(RPCProtocolError)
  })

  it('should throw on missing method', () => {
    const json = JSON.stringify({ id: 'req-123' })

    expect(() => deserializeRequest(json)).toThrow(RPCProtocolError)
  })

  it('should throw on non-string id', () => {
    const json = JSON.stringify({ id: 123, method: 'do.test' })

    expect(() => deserializeRequest(json)).toThrow(RPCProtocolError)
  })

  it('should throw on non-string method', () => {
    const json = JSON.stringify({ id: 'req-123', method: 123 })

    expect(() => deserializeRequest(json)).toThrow(RPCProtocolError)
  })

  it('should accept empty string as valid id', () => {
    // Some implementations may allow empty string IDs
    const json = JSON.stringify({ id: '', method: 'do.test' })

    // Depending on implementation, this might be valid or invalid
    // Test documents expected behavior
    expect(() => deserializeRequest(json)).toThrow(RPCProtocolError)
  })

  it('should handle whitespace-only input', () => {
    expect(() => deserializeRequest('   ')).toThrow(RPCProtocolError)
  })

  it('should handle null input', () => {
    expect(() => deserializeRequest(null as any)).toThrow(RPCProtocolError)
  })

  it('should handle undefined input', () => {
    expect(() => deserializeRequest(undefined as any)).toThrow(RPCProtocolError)
  })
})

// =============================================================================
// Response Serialization Tests
// =============================================================================

describe('Protocol - Response Serialization', () => {
  it('should serialize success response', () => {
    const response: RPCResponse = {
      id: 'req-123',
      result: { pong: true, timestamp: 1704067200000 },
    }

    const serialized = serializeResponse(response)

    const parsed = JSON.parse(serialized)
    expect(parsed.id).toBe('req-123')
    expect(parsed.result).toEqual({ pong: true, timestamp: 1704067200000 })
    expect(parsed.error).toBeUndefined()
  })

  it('should serialize error response', () => {
    const response: RPCResponse = {
      id: 'req-456',
      error: {
        code: -32601,
        message: 'Method not found',
      },
    }

    const serialized = serializeResponse(response)

    const parsed = JSON.parse(serialized)
    expect(parsed.id).toBe('req-456')
    expect(parsed.error.code).toBe(-32601)
    expect(parsed.error.message).toBe('Method not found')
    expect(parsed.result).toBeUndefined()
  })

  it('should serialize error with data', () => {
    const response: RPCResponse = {
      id: 'req-789',
      error: {
        code: -32602,
        message: 'Invalid params',
        data: {
          field: 'name',
          reason: 'required',
        },
      },
    }

    const serialized = serializeResponse(response)

    const parsed = JSON.parse(serialized)
    expect(parsed.error.data).toEqual({
      field: 'name',
      reason: 'required',
    })
  })

  it('should serialize null result', () => {
    const response: RPCResponse = {
      id: 'req-null',
      result: null,
    }

    const serialized = serializeResponse(response)

    const parsed = JSON.parse(serialized)
    expect(parsed.result).toBeNull()
  })

  it('should serialize undefined result as absent', () => {
    const response: RPCResponse = {
      id: 'req-void',
      result: undefined,
    }

    const serialized = serializeResponse(response)

    const parsed = JSON.parse(serialized)
    // undefined should not be present in JSON
    expect('result' in parsed).toBe(false)
  })

  it('should include metadata in response', () => {
    const response: RPCResponse = {
      id: 'req-meta',
      result: { done: true },
      meta: {
        timestamp: 1704067200000,
        duration: 42,
        traceId: 'trace-xyz',
      },
    }

    const serialized = serializeResponse(response)

    const parsed = JSON.parse(serialized)
    expect(parsed.meta.duration).toBe(42)
    expect(parsed.meta.traceId).toBe('trace-xyz')
  })

  it('should handle array results', () => {
    const response: RPCResponse = {
      id: 'req-list',
      result: [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ],
    }

    const serialized = serializeResponse(response)

    const parsed = JSON.parse(serialized)
    expect(parsed.result).toHaveLength(2)
  })

  it('should handle primitive results', () => {
    const stringResponse: RPCResponse = { id: '1', result: 'hello' }
    const numberResponse: RPCResponse = { id: '2', result: 42 }
    const boolResponse: RPCResponse = { id: '3', result: true }

    expect(JSON.parse(serializeResponse(stringResponse)).result).toBe('hello')
    expect(JSON.parse(serializeResponse(numberResponse)).result).toBe(42)
    expect(JSON.parse(serializeResponse(boolResponse)).result).toBe(true)
  })
})

// =============================================================================
// Response Deserialization Tests
// =============================================================================

describe('Protocol - Response Deserialization', () => {
  it('should deserialize success response', () => {
    const json = JSON.stringify({
      id: 'req-123',
      result: { pong: true },
    })

    const response = deserializeResponse(json)

    expect(response.id).toBe('req-123')
    expect(response.result).toEqual({ pong: true })
  })

  it('should deserialize error response', () => {
    const json = JSON.stringify({
      id: 'req-456',
      error: { code: -32601, message: 'Method not found' },
    })

    const response = deserializeResponse(json)

    expect(response.error?.code).toBe(-32601)
    expect(response.error?.message).toBe('Method not found')
  })

  it('should throw on invalid JSON', () => {
    expect(() => deserializeResponse('not json')).toThrow(RPCProtocolError)
  })

  it('should throw on missing id', () => {
    const json = JSON.stringify({ result: { pong: true } })

    expect(() => deserializeResponse(json)).toThrow(RPCProtocolError)
  })

  it('should accept response with neither result nor error', () => {
    // This might be valid for void returns
    const json = JSON.stringify({ id: 'req-void' })

    const response = deserializeResponse(json)

    expect(response.id).toBe('req-void')
    expect(response.result).toBeUndefined()
    expect(response.error).toBeUndefined()
  })

  it('should validate error structure', () => {
    const json = JSON.stringify({
      id: 'req-123',
      error: { message: 'Missing code' }, // No code field
    })

    expect(() => deserializeResponse(json)).toThrow(RPCProtocolError)
  })
})

// =============================================================================
// Error Format Tests
// =============================================================================

describe('Protocol - Error Format', () => {
  it('should create ParseError', () => {
    const error = createRPCError('ParseError', 'Invalid JSON')

    expect(error.code).toBe(-32700)
    expect(error.message).toBe('Invalid JSON')
  })

  it('should create InvalidRequest error', () => {
    const error = createRPCError('InvalidRequest', 'Missing method field')

    expect(error.code).toBe(-32600)
  })

  it('should create MethodNotFound error', () => {
    const error = createRPCError('MethodNotFound', 'Unknown method: do.unknown')

    expect(error.code).toBe(-32601)
  })

  it('should create InvalidParams error', () => {
    const error = createRPCError('InvalidParams', 'Invalid limit value')

    expect(error.code).toBe(-32602)
  })

  it('should create InternalError error', () => {
    const error = createRPCError('InternalError', 'Database connection failed')

    expect(error.code).toBe(-32603)
  })

  it('should create custom errors with correct codes', () => {
    const unauthorized = createRPCError('Unauthorized', 'Token expired')
    const forbidden = createRPCError('Forbidden', 'Insufficient permissions')
    const notFound = createRPCError('NotFound', 'Resource not found')
    const conflict = createRPCError('Conflict', 'Version mismatch')
    const rateLimited = createRPCError('RateLimited', 'Too many requests')
    const timeout = createRPCError('Timeout', 'Request timeout')

    expect(unauthorized.code).toBe(-32001)
    expect(forbidden.code).toBe(-32002)
    expect(notFound.code).toBe(-32003)
    expect(conflict.code).toBe(-32004)
    expect(rateLimited.code).toBe(-32005)
    expect(timeout.code).toBe(-32006)
  })

  it('should include data in error', () => {
    const error = createRPCError('InvalidParams', 'Validation failed', {
      fields: ['name', 'email'],
      reasons: { name: 'required', email: 'invalid format' },
    })

    expect(error.data).toEqual({
      fields: ['name', 'email'],
      reasons: { name: 'required', email: 'invalid format' },
    })
  })

  it('should identify RPC errors', () => {
    const rpcError: RPCError = { code: -32600, message: 'Test' }
    const regularError = new Error('Test')
    const plainObject = { code: 123, message: 'Test' }

    expect(isRPCError(rpcError)).toBe(true)
    expect(isRPCError(regularError)).toBe(false)
    expect(isRPCError(plainObject)).toBe(false) // code should be in valid range
    expect(isRPCError(null)).toBe(false)
    expect(isRPCError(undefined)).toBe(false)
  })

  it('should validate error code ranges', () => {
    // Standard JSON-RPC errors: -32700 to -32600
    expect(isRPCError({ code: -32700, message: 'Parse error' })).toBe(true)
    expect(isRPCError({ code: -32600, message: 'Invalid request' })).toBe(true)

    // Custom errors: -32001 to -32099
    expect(isRPCError({ code: -32001, message: 'Custom' })).toBe(true)
    expect(isRPCError({ code: -32099, message: 'Custom' })).toBe(true)

    // Invalid codes
    expect(isRPCError({ code: 0, message: 'Zero' })).toBe(false)
    expect(isRPCError({ code: 200, message: 'OK' })).toBe(false)
  })

  it('should convert Error to RPCError', () => {
    const error = new Error('Something went wrong')
    error.name = 'ValidationError'

    const rpcError = createRPCError('InternalError', error.message, {
      originalError: error.name,
    })

    expect(rpcError.code).toBe(-32603)
    expect(rpcError.message).toBe('Something went wrong')
    expect((rpcError.data as { originalError: string })?.originalError).toBe('ValidationError')
  })
})

// =============================================================================
// Batch Message Tests
// =============================================================================

describe('Protocol - Batch Messages', () => {
  it('should serialize batch request', () => {
    const batchRequest: RPCBatchRequest = {
      id: 'batch-1',
      requests: [
        { id: 'req-1', method: 'do.system.ping' },
        { id: 'req-2', method: 'do.identity.get' },
      ],
    }

    const serialized = serializeBatchRequest(batchRequest)

    const parsed = JSON.parse(serialized)
    expect(parsed.id).toBe('batch-1')
    expect(parsed.requests).toHaveLength(2)
    expect(parsed.requests[0].method).toBe('do.system.ping')
  })

  it('should serialize batch request with abortOnError', () => {
    const batchRequest: RPCBatchRequest = {
      id: 'batch-2',
      requests: [
        { id: 'req-1', method: 'do.test' },
        { id: 'req-2', method: 'do.test' },
      ],
      abortOnError: true,
    }

    const serialized = serializeBatchRequest(batchRequest)

    const parsed = JSON.parse(serialized)
    expect(parsed.abortOnError).toBe(true)
  })

  it('should deserialize batch request', () => {
    const json = JSON.stringify({
      id: 'batch-1',
      requests: [
        { id: 'req-1', method: 'do.system.ping' },
        { id: 'req-2', method: 'do.identity.get' },
      ],
    })

    const batchRequest = deserializeBatchRequest(json)

    expect(batchRequest.id).toBe('batch-1')
    expect(batchRequest.requests).toHaveLength(2)
  })

  it('should throw on empty batch request', () => {
    const json = JSON.stringify({
      id: 'batch-empty',
      requests: [],
    })

    expect(() => deserializeBatchRequest(json)).toThrow(RPCProtocolError)
  })

  it('should throw on invalid batch request structure', () => {
    const json = JSON.stringify({
      id: 'batch-invalid',
      requests: 'not an array',
    })

    expect(() => deserializeBatchRequest(json)).toThrow(RPCProtocolError)
  })

  it('should validate each request in batch', () => {
    const json = JSON.stringify({
      id: 'batch-invalid',
      requests: [
        { id: 'req-1', method: 'do.test' },
        { id: 'req-2' }, // Missing method
      ],
    })

    expect(() => deserializeBatchRequest(json)).toThrow(RPCProtocolError)
  })

  it('should serialize batch response', () => {
    const batchResponse: RPCBatchResponse = {
      id: 'batch-1',
      responses: [
        { id: 'req-1', result: { pong: true } },
        { id: 'req-2', result: { $id: 'test' } },
      ],
      success: true,
      duration: 42,
    }

    const serialized = serializeBatchResponse(batchResponse)

    const parsed = JSON.parse(serialized)
    expect(parsed.id).toBe('batch-1')
    expect(parsed.responses).toHaveLength(2)
    expect(parsed.success).toBe(true)
    expect(parsed.duration).toBe(42)
  })

  it('should serialize batch response with partial failure', () => {
    const batchResponse: RPCBatchResponse = {
      id: 'batch-2',
      responses: [
        { id: 'req-1', result: { pong: true } },
        { id: 'req-2', error: { code: -32601, message: 'Method not found' } },
      ],
      success: false,
    }

    const serialized = serializeBatchResponse(batchResponse)

    const parsed = JSON.parse(serialized)
    expect(parsed.success).toBe(false)
    expect(parsed.responses[0].result).toBeDefined()
    expect(parsed.responses[1].error).toBeDefined()
  })

  it('should deserialize batch response', () => {
    const json = JSON.stringify({
      id: 'batch-1',
      responses: [
        { id: 'req-1', result: { pong: true } },
        { id: 'req-2', result: { $id: 'test' } },
      ],
      success: true,
    })

    const batchResponse = deserializeBatchResponse(json)

    expect(batchResponse.id).toBe('batch-1')
    expect(batchResponse.responses).toHaveLength(2)
    expect(batchResponse.success).toBe(true)
  })

  it('should throw on missing batch response id', () => {
    const json = JSON.stringify({
      responses: [{ id: 'req-1', result: true }],
      success: true,
    })

    expect(() => deserializeBatchResponse(json)).toThrow(RPCProtocolError)
  })

  it('should throw on missing responses array', () => {
    const json = JSON.stringify({
      id: 'batch-1',
      success: true,
    })

    expect(() => deserializeBatchResponse(json)).toThrow(RPCProtocolError)
  })

  it('should handle large batch sizes', () => {
    const requests: RPCRequest[] = Array.from({ length: 100 }, (_, i) => ({
      id: `req-${i}`,
      method: 'do.system.ping',
    }))

    const batchRequest: RPCBatchRequest = {
      id: 'batch-large',
      requests,
    }

    const serialized = serializeBatchRequest(batchRequest)
    const deserialized = deserializeBatchRequest(serialized)

    expect(deserialized.requests).toHaveLength(100)
  })
})

// =============================================================================
// Validation Tests
// =============================================================================

describe('Protocol - Validation', () => {
  it('should validate complete request', () => {
    const request: RPCRequest = {
      id: 'req-123',
      method: 'do.system.ping',
      params: { foo: 'bar' },
      meta: { timestamp: Date.now() },
    }

    expect(() => validateRequest(request)).not.toThrow()
  })

  it('should reject request with invalid id type', () => {
    const request = {
      id: 123, // Should be string
      method: 'do.test',
    }

    expect(() => validateRequest(request as any)).toThrow()
  })

  it('should reject request with invalid method format', () => {
    const request = {
      id: 'req-1',
      method: '', // Empty method
    }

    expect(() => validateRequest(request as any)).toThrow()
  })

  it('should validate complete response', () => {
    const response: RPCResponse = {
      id: 'req-123',
      result: { data: 'test' },
      meta: { duration: 10 },
    }

    expect(() => validateResponse(response)).not.toThrow()
  })

  it('should validate error response', () => {
    const response: RPCResponse = {
      id: 'req-123',
      error: { code: -32601, message: 'Not found' },
    }

    expect(() => validateResponse(response)).not.toThrow()
  })

  it('should reject response with both result and error', () => {
    const response = {
      id: 'req-123',
      result: { data: 'test' },
      error: { code: -32600, message: 'Error' },
    }

    expect(() => validateResponse(response as any)).toThrow()
  })

  it('should reject response with invalid error code type', () => {
    const response = {
      id: 'req-123',
      error: { code: 'invalid', message: 'Error' },
    }

    expect(() => validateResponse(response as any)).toThrow()
  })

  it('should reject response with missing error message', () => {
    const response = {
      id: 'req-123',
      error: { code: -32600 },
    }

    expect(() => validateResponse(response as any)).toThrow()
  })
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('Protocol - Edge Cases', () => {
  it('should handle very long method names', () => {
    const request: RPCRequest = {
      id: 'req-long',
      method: 'do.namespace.subnamespace.deeply.nested.method.name',
    }

    const serialized = serializeRequest(request)
    const deserialized = deserializeRequest(serialized)

    expect(deserialized.method).toBe(request.method)
  })

  it('should handle method names with special characters', () => {
    // Method names should follow a pattern like namespace.action
    const request: RPCRequest = {
      id: 'req-special',
      method: 'do.test-method_v2',
    }

    const serialized = serializeRequest(request)
    const deserialized = deserializeRequest(serialized)

    expect(deserialized.method).toBe('do.test-method_v2')
  })

  it('should handle UUID-style request IDs', () => {
    const request: RPCRequest = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      method: 'do.test',
    }

    const serialized = serializeRequest(request)
    const deserialized = deserializeRequest(serialized)

    expect(deserialized.id).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  it('should handle numeric-string request IDs', () => {
    const request: RPCRequest = {
      id: '12345',
      method: 'do.test',
    }

    const serialized = serializeRequest(request)
    const deserialized = deserializeRequest(serialized)

    expect(deserialized.id).toBe('12345')
    expect(typeof deserialized.id).toBe('string')
  })

  it('should preserve undefined vs null semantics', () => {
    const requestWithUndefined: RPCRequest = {
      id: 'req-1',
      method: 'do.test',
      params: undefined,
    }

    const requestWithNull: RPCRequest = {
      id: 'req-2',
      method: 'do.test',
      params: null,
    }

    const serializedUndefined = serializeRequest(requestWithUndefined)
    const serializedNull = serializeRequest(requestWithNull)

    const parsedUndefined = JSON.parse(serializedUndefined)
    const parsedNull = JSON.parse(serializedNull)

    // undefined should not appear in JSON
    expect('params' in parsedUndefined).toBe(false)
    // null should be preserved
    expect(parsedNull.params).toBeNull()
  })

  it('should handle circular reference errors gracefully', () => {
    const circular: any = { id: 'req-circular', method: 'do.test' }
    circular.self = circular

    expect(() => serializeRequest(circular)).toThrow()
  })

  it('should handle BigInt values', () => {
    // BigInt can't be serialized to JSON natively
    const request: RPCRequest = {
      id: 'req-bigint',
      method: 'do.test',
      params: { value: BigInt(9007199254740991).toString() }, // Convert to string
    }

    const serialized = serializeRequest(request)
    const deserialized = deserializeRequest(serialized)

    expect((deserialized.params as { value: string })?.value).toBe('9007199254740991')
  })

  it('should handle binary data as base64', () => {
    const binaryData = new Uint8Array([1, 2, 3, 4, 5])
    const base64 = btoa(String.fromCharCode(...binaryData))

    const request: RPCRequest = {
      id: 'req-binary',
      method: 'do.test',
      params: { data: base64, encoding: 'base64' },
    }

    const serialized = serializeRequest(request)
    const deserialized = deserializeRequest(serialized)

    expect((deserialized.params as { data: string; encoding: string })?.data).toBe(base64)
    expect((deserialized.params as { data: string; encoding: string })?.encoding).toBe('base64')
  })

  it('should handle deeply nested structures', () => {
    const createNested = (depth: number): any => {
      if (depth === 0) return { value: 'leaf' }
      return { nested: createNested(depth - 1) }
    }

    const request: RPCRequest = {
      id: 'req-nested',
      method: 'do.test',
      params: createNested(10),
    }

    const serialized = serializeRequest(request)
    const deserialized = deserializeRequest(serialized)

    let current = deserialized.params as { nested?: unknown; value?: string }
    for (let i = 0; i < 10; i++) {
      expect(current).toHaveProperty('nested')
      current = current.nested as { nested?: unknown; value?: string }
    }
    expect(current).toEqual({ value: 'leaf' })
  })

  it('should handle empty object params', () => {
    const request: RPCRequest = {
      id: 'req-empty',
      method: 'do.test',
      params: {},
    }

    const serialized = serializeRequest(request)
    const deserialized = deserializeRequest(serialized)

    expect(deserialized.params).toEqual({})
  })

  it('should handle empty array params', () => {
    const request: RPCRequest = {
      id: 'req-empty-array',
      method: 'do.test',
      params: [],
    }

    const serialized = serializeRequest(request)
    const deserialized = deserializeRequest(serialized)

    expect(deserialized.params).toEqual([])
  })
})
