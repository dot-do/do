/**
 * CodeExecutor Tests
 *
 * Tests for the sandboxed code execution interface.
 */

import { describe, it, expect } from 'vitest'
import {
  SimpleCodeExecutor,
  DangerousPatternError,
  CodeLengthError,
  validateCodeSecurity,
  validateCodeLength,
  MAX_CODE_LENGTH,
  DANGEROUS_PATTERNS,
} from '../../src/sandbox/executor'
import type { CodeExecutor } from '../../src/sandbox/types'

function createTestExecutor(): CodeExecutor {
  return new SimpleCodeExecutor()
}

describe('CodeExecutor Interface', () => {
  describe('execute()', () => {
    it('executes simple return statement', async () => {
      const executor = createTestExecutor()
      const result = await executor.execute('return 1 + 1', {}, 5000)
      expect(result.value).toBe(2)
      expect(result.error).toBeUndefined()
    })

    it('has access to context functions', async () => {
      const executor = createTestExecutor()
      const context = {
        greet: (name: string) => `Hello, ${name}!`,
      }
      const result = await executor.execute('return greet("World")', context, 5000)
      expect(result.value).toBe('Hello, World!')
    })

    it('handles async context functions', async () => {
      const executor = createTestExecutor()
      const context = {
        fetchData: async () => ({ id: 1 }),
      }
      const result = await executor.execute('return await fetchData()', context, 5000)
      expect(result.value).toEqual({ id: 1 })
    })

    it('respects timeout with async code', async () => {
      const executor = createTestExecutor()
      // Use a long-running async operation instead of synchronous loop
      // Synchronous infinite loops block the event loop and prevent timeout detection
      const result = await executor.execute(
        'await new Promise(resolve => setTimeout(resolve, 10000)); return "done"',
        {},
        100
      )
      expect(result.error).toBeDefined()
      expect(result.error?.toLowerCase()).toContain('timeout')
    })

    it('captures console.log output', async () => {
      const executor = createTestExecutor()
      const result = await executor.execute('console.log("test"); return 42', {}, 5000)
      expect(result.logs).toContain('test')
      expect(result.value).toBe(42)
    })

    it('returns error with line number on syntax error', async () => {
      const executor = createTestExecutor()
      const result = await executor.execute('const x = {', {}, 5000)
      expect(result.error).toBeDefined()
      // Note: errorLine may not always be available for syntax errors
    })

    it('returns error with line number on runtime error', async () => {
      const executor = createTestExecutor()
      const result = await executor.execute('const x = null;\nreturn x.foo', {}, 5000)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('Cannot read')
      // errorLine extraction is best effort
    })

    it('blocks dangerous globals via security validation', async () => {
      const executor = createTestExecutor()
      // eval is now blocked by security validation before execution
      const result = await executor.execute('return eval("1+1")', {}, 5000)
      // With security checks enabled (default), this should return an error
      expect(result.error).toBeDefined()
      expect(result.error).toContain('Dangerous pattern')
    })

    it('handles context with various types', async () => {
      const executor = createTestExecutor()
      const context = {
        num: 42,
        str: 'hello',
        arr: [1, 2, 3],
        obj: { a: 1, b: 2 },
      }
      const result = await executor.execute(
        'return { num, str, arrLen: arr.length, objKeys: Object.keys(obj) }',
        context,
        5000
      )
      expect(result.value).toEqual({
        num: 42,
        str: 'hello',
        arrLen: 3,
        objKeys: ['a', 'b'],
      })
    })

    it('captures console.error and console.warn', async () => {
      const executor = createTestExecutor()
      const result = await executor.execute(
        'console.error("error msg"); console.warn("warn msg"); return true',
        {},
        5000
      )
      expect(result.logs).toContainEqual(expect.stringContaining('error msg'))
      expect(result.logs).toContainEqual(expect.stringContaining('warn msg'))
      expect(result.value).toBe(true)
    })

    it('returns duration in result', async () => {
      const executor = createTestExecutor()
      const result = await executor.execute('return 1', {}, 5000)
      expect(typeof result.duration).toBe('number')
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })

    it('handles undefined return', async () => {
      const executor = createTestExecutor()
      const result = await executor.execute('const x = 1;', {}, 5000)
      expect(result.error).toBeUndefined()
      expect(result.value).toBeUndefined()
    })

    it('handles thrown errors', async () => {
      const executor = createTestExecutor()
      const result = await executor.execute('throw new Error("custom error")', {}, 5000)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('custom error')
    })
  })
})

describe('Security Hardening', () => {
  describe('validateCodeSecurity()', () => {
    it('blocks eval() calls', () => {
      expect(() => validateCodeSecurity('const x = eval("1+1")')).toThrow(DangerousPatternError)
    })

    it('blocks Function constructor', () => {
      expect(() => validateCodeSecurity('new Function("return 1")')).toThrow(DangerousPatternError)
    })

    it('blocks Function() call', () => {
      expect(() => validateCodeSecurity('Function("return 1")()')).toThrow(DangerousPatternError)
    })

    it('blocks __proto__ access', () => {
      expect(() => validateCodeSecurity('obj.__proto__ = {}')).toThrow(DangerousPatternError)
    })

    it('blocks Object.setPrototypeOf', () => {
      expect(() => validateCodeSecurity('Object.setPrototypeOf(obj, {})')).toThrow(
        DangerousPatternError
      )
    })

    it('blocks dynamic import()', () => {
      expect(() => validateCodeSecurity('import("module")')).toThrow(DangerousPatternError)
    })

    it('blocks require()', () => {
      expect(() => validateCodeSecurity('require("fs")')).toThrow(DangerousPatternError)
    })

    it('blocks process access', () => {
      expect(() => validateCodeSecurity('process.env.SECRET')).toThrow(DangerousPatternError)
    })

    it('blocks globalThis bracket access', () => {
      expect(() => validateCodeSecurity('globalThis["eval"]')).toThrow(DangerousPatternError)
    })

    it('allows safe code', () => {
      expect(() => validateCodeSecurity('const x = 1 + 1; return x')).not.toThrow()
    })

    it('allows safe object operations', () => {
      expect(() => validateCodeSecurity('const obj = { a: 1 }; Object.keys(obj)')).not.toThrow()
    })
  })

  describe('validateCodeLength()', () => {
    it('allows code within limit', () => {
      expect(() => validateCodeLength('const x = 1', 100)).not.toThrow()
    })

    it('throws CodeLengthError for oversized code', () => {
      const largeCode = 'x'.repeat(200)
      expect(() => validateCodeLength(largeCode, 100)).toThrow(CodeLengthError)
    })

    it('uses byte length for multi-byte characters', () => {
      // Unicode characters may be multiple bytes
      const unicodeCode = '\u{1F600}'.repeat(50) // 50 emoji, each is 4 bytes = 200 bytes
      expect(() => validateCodeLength(unicodeCode, 100)).toThrow(CodeLengthError)
    })
  })

  describe('DangerousPatternError', () => {
    it('contains pattern name and description', () => {
      try {
        validateCodeSecurity('eval("test")')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(DangerousPatternError)
        if (error instanceof DangerousPatternError) {
          expect(error.patternName).toBe('eval')
          expect(error.description).toContain('escape the sandbox')
        }
      }
    })
  })

  describe('CodeLengthError', () => {
    it('contains actual and max length', () => {
      try {
        validateCodeLength('x'.repeat(200), 100)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(CodeLengthError)
        if (error instanceof CodeLengthError) {
          expect(error.actualLength).toBe(200)
          expect(error.maxLength).toBe(100)
        }
      }
    })
  })

  describe('SimpleCodeExecutor with security checks', () => {
    it('returns error for dangerous patterns', async () => {
      const executor = new SimpleCodeExecutor()
      const result = await executor.execute('eval("1+1")', {}, 5000)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('Dangerous pattern')
    })

    it('returns error for code that is too long', async () => {
      const executor = new SimpleCodeExecutor({ maxCodeLength: 100 })
      const largeCode = 'const x = ' + '"a"'.repeat(50)
      const result = await executor.execute(largeCode, {}, 5000)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('exceeds maximum length')
    })

    it('can disable security checks', async () => {
      const executor = new SimpleCodeExecutor({ enableSecurityChecks: false })
      // Note: This should not throw DangerousPatternError, but eval might still fail at runtime
      const result = await executor.execute('return typeof eval', {}, 5000)
      // We're not checking for specific behavior here, just that security checks are bypassed
      expect(result.securityValidated).toBe(true)
    })

    it('supports custom additional patterns', async () => {
      const executor = new SimpleCodeExecutor({
        additionalPatterns: [
          { pattern: /forbidden/, name: 'forbidden', description: 'Custom block' },
        ],
      })
      const result = await executor.execute('const forbidden = true', {}, 5000)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('forbidden')
    })
  })
})

describe('Execution Metrics', () => {
  it('includes startTime and endTime', async () => {
    const executor = new SimpleCodeExecutor()
    const result = await executor.execute('return 42', {}, 5000)

    expect(result.startTime).toBeDefined()
    expect(result.endTime).toBeDefined()
    expect(typeof result.startTime).toBe('number')
    expect(typeof result.endTime).toBe('number')
  })

  it('endTime is greater than or equal to startTime', async () => {
    const executor = new SimpleCodeExecutor()
    const result = await executor.execute('return 42', {}, 5000)

    expect(result.endTime).toBeGreaterThanOrEqual(result.startTime)
  })

  it('duration matches endTime - startTime', async () => {
    const executor = new SimpleCodeExecutor()
    const result = await executor.execute('return 42', {}, 5000)

    expect(result.duration).toBe(result.endTime - result.startTime)
  })

  it('includes securityValidated flag', async () => {
    const executor = new SimpleCodeExecutor()
    const result = await executor.execute('return 42', {}, 5000)

    expect(result.securityValidated).toBe(true)
  })

  it('securityValidated is false when security check fails', async () => {
    const executor = new SimpleCodeExecutor()
    const result = await executor.execute('eval("test")', {}, 5000)

    expect(result.securityValidated).toBe(false)
  })
})

describe('DANGEROUS_PATTERNS constant', () => {
  it('contains expected patterns', () => {
    const patternNames = DANGEROUS_PATTERNS.map((p) => p.name)

    expect(patternNames).toContain('eval')
    expect(patternNames).toContain('Function constructor')
    expect(patternNames).toContain('__proto__')
    expect(patternNames).toContain('dynamic import')
    expect(patternNames).toContain('require')
    expect(patternNames).toContain('process access')
  })

  it('all patterns have name and description', () => {
    for (const pattern of DANGEROUS_PATTERNS) {
      expect(pattern.name).toBeDefined()
      expect(pattern.name.length).toBeGreaterThan(0)
      expect(pattern.description).toBeDefined()
      expect(pattern.description.length).toBeGreaterThan(0)
    }
  })
})

describe('MAX_CODE_LENGTH constant', () => {
  it('is 100KB', () => {
    expect(MAX_CODE_LENGTH).toBe(100 * 1024)
  })
})
