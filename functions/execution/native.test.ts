/**
 * Tests for Tier 1 Native Execution
 *
 * @module execution/__tests__/native.test
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  executeNative,
  registerNativeHandler,
  hasNativeHandler,
} from './native'
import { createFileSystem } from './fsx'

describe('Native Execution', () => {
  describe('executeNative()', () => {
    describe('JSON Operations', () => {
      it('should parse JSON strings', async () => {
        const result = await executeNative('json.parse', ['{"key": "value"}'])

        expect(result.success).toBe(true)
        expect(result.tier).toBe(1)
        expect(result.output).toEqual({ key: 'value' })
      })

      it('should stringify values', async () => {
        const result = await executeNative('json.stringify', [{ key: 'value' }])

        expect(result.success).toBe(true)
        expect(result.output).toBe('{"key":"value"}')
      })

      it('should handle JSON parse errors', async () => {
        const result = await executeNative('json.parse', ['invalid'])

        expect(result.success).toBe(false)
        expect(result.error?.code).toBe('NATIVE_ERROR')
      })
    })

    describe('String Operations', () => {
      it('should split strings', async () => {
        const result = await executeNative('string.split', ['a,b,c', ','])

        expect(result.success).toBe(true)
        expect(result.output).toEqual(['a', 'b', 'c'])
      })

      it('should join arrays', async () => {
        const result = await executeNative('string.join', [['a', 'b', 'c'], '-'])

        expect(result.success).toBe(true)
        expect(result.output).toBe('a-b-c')
      })

      it('should replace patterns', async () => {
        const result = await executeNative('string.replace', ['hello world', 'world', 'there'])

        expect(result.success).toBe(true)
        expect(result.output).toBe('hello there')
      })

      it('should match patterns', async () => {
        const result = await executeNative('string.match', ['test123', /\d+/])

        expect(result.success).toBe(true)
        expect(result.output).toContain('123')
      })

      it('should trim whitespace', async () => {
        const result = await executeNative('string.trim', ['  hello  '])

        expect(result.success).toBe(true)
        expect(result.output).toBe('hello')
      })
    })

    describe('Encoding Operations', () => {
      it('should encode base64', async () => {
        const result = await executeNative('encoding.base64Encode', ['hello'])

        expect(result.success).toBe(true)
        expect(result.output).toBe('aGVsbG8=')
      })

      it('should decode base64', async () => {
        const result = await executeNative('encoding.base64Decode', ['aGVsbG8='])

        expect(result.success).toBe(true)
        expect(result.output).toBe('hello')
      })

      it('should encode URLs', async () => {
        const result = await executeNative('encoding.urlEncode', ['hello world'])

        expect(result.success).toBe(true)
        expect(result.output).toBe('hello%20world')
      })

      it('should decode URLs', async () => {
        const result = await executeNative('encoding.urlDecode', ['hello%20world'])

        expect(result.success).toBe(true)
        expect(result.output).toBe('hello world')
      })

      it('should encode hex', async () => {
        const result = await executeNative('encoding.hexEncode', ['hi'])

        expect(result.success).toBe(true)
        expect(result.output).toBe('6869')
      })
    })

    describe('Crypto Operations', () => {
      it('should generate UUIDs', async () => {
        const result = await executeNative('crypto.randomUUID', [])

        expect(result.success).toBe(true)
        expect(result.output).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        )
      })

      it('should hash data', async () => {
        const result = await executeNative('crypto.hash', ['SHA-256', 'hello'])

        expect(result.success).toBe(true)
        expect(typeof result.output).toBe('string')
      })
    })

    describe('POSIX Operations', () => {
      it('should echo arguments', async () => {
        const result = await executeNative('posix.echo', ['hello', 'world'])

        expect(result.success).toBe(true)
        expect(result.output).toBe('hello world')
      })

      it('should return head of input', async () => {
        const input = 'line1\nline2\nline3\nline4\nline5'
        const result = await executeNative('posix.head', [input, 3])

        expect(result.success).toBe(true)
        expect(result.output).toBe('line1\nline2\nline3')
      })

      it('should return tail of input', async () => {
        const input = 'line1\nline2\nline3\nline4\nline5'
        const result = await executeNative('posix.tail', [input, 2])

        expect(result.success).toBe(true)
        expect(result.output).toBe('line4\nline5')
      })

      it('should count words/lines/chars', async () => {
        const result = await executeNative('posix.wc', ['hello world\ntest'])

        expect(result.success).toBe(true)
        expect(result.output).toEqual({ lines: 2, words: 3, chars: 16 })
      })

      it('should sort lines', async () => {
        const result = await executeNative('posix.sort', ['c\na\nb'])

        expect(result.success).toBe(true)
        expect(result.output).toBe('a\nb\nc')
      })

      it('should remove consecutive duplicates', async () => {
        const result = await executeNative('posix.uniq', ['a\na\nb\nb\nc'])

        expect(result.success).toBe(true)
        expect(result.output).toBe('a\nb\nc')
      })

      it('should grep patterns', async () => {
        const result = await executeNative('posix.grep', ['test', 'hello\ntest\nworld'])

        expect(result.success).toBe(true)
        expect(result.output).toBe('test')
      })
    })

    describe('Filesystem Operations', () => {
      let fs: ReturnType<typeof createFileSystem>

      beforeEach(() => {
        fs = createFileSystem('memory')
      })

      it('should read and write files', async () => {
        await executeNative('fs.writeFile', ['/test.txt', 'content'], {}, fs)
        const result = await executeNative('fs.readFile', ['/test.txt', 'utf-8'], {}, fs)

        expect(result.success).toBe(true)
        expect(result.output).toBe('content')
      })

      it('should check file existence', async () => {
        await executeNative('fs.writeFile', ['/exists.txt', 'data'], {}, fs)

        const existsResult = await executeNative('fs.exists', ['/exists.txt'], {}, fs)
        const notExistsResult = await executeNative('fs.exists', ['/missing.txt'], {}, fs)

        expect(existsResult.output).toBe(true)
        expect(notExistsResult.output).toBe(false)
      })

      it('should create directories', async () => {
        const result = await executeNative('fs.mkdir', ['/mydir', { recursive: true }], {}, fs)

        expect(result.success).toBe(true)
      })

      it('should fail without filesystem', async () => {
        const result = await executeNative('fs.readFile', ['/test.txt'])

        expect(result.success).toBe(false)
        expect(result.error?.message).toContain('Filesystem not provided')
      })
    })

    describe('Unknown Operations', () => {
      it('should return error for unknown operations', async () => {
        const result = await executeNative('unknown.operation', [])

        expect(result.success).toBe(false)
        expect(result.error?.code).toBe('UNKNOWN_OPERATION')
      })
    })

    describe('Timeout Handling', () => {
      it('should respect timeout option', async () => {
        // Register a slow handler for testing
        registerNativeHandler('test.slow', async () => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return 'done'
        })

        const result = await executeNative('test.slow', [], { timeout: 10 })

        expect(result.success).toBe(false)
        expect(result.error?.message).toContain('timed out')
      })
    })
  })

  describe('registerNativeHandler()', () => {
    it('should register custom handlers', async () => {
      registerNativeHandler('custom.add', async (args) => {
        const [a, b] = args as [number, number]
        return a + b
      })

      const result = await executeNative('custom.add', [2, 3])

      expect(result.success).toBe(true)
      expect(result.output).toBe(5)
    })
  })

  describe('hasNativeHandler()', () => {
    it('should check handler existence', () => {
      expect(hasNativeHandler('json.parse')).toBe(true)
      expect(hasNativeHandler('nonexistent')).toBe(false)
    })
  })
})
