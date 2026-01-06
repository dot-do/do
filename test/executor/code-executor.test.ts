/**
 * @dotdo/do - CodeExecutor Interface Tests (RED Phase)
 *
 * These tests define the expected behavior of the CodeExecutor interface
 * for sandboxed JavaScript/TypeScript code execution.
 *
 * They should FAIL initially (RED), then pass after implementation (GREEN).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CodeExecutor, ExecutionResult, ExecutionError, ExecutionContext } from '../../src/executor'

describe('CodeExecutor Interface', () => {
  let executor: CodeExecutor

  beforeEach(() => {
    executor = new CodeExecutor()
  })

  describe('Basic Execution', () => {
    it('should execute simple JavaScript code and return result', async () => {
      const result = await executor.execute('return 1 + 1')

      expect(result.success).toBe(true)
      expect(result.value).toBe(2)
      expect(result.error).toBeUndefined()
    })

    it('should execute code that returns a string', async () => {
      const result = await executor.execute('return "hello world"')

      expect(result.success).toBe(true)
      expect(result.value).toBe('hello world')
    })

    it('should execute code that returns an object', async () => {
      const result = await executor.execute('return { name: "test", count: 42 }')

      expect(result.success).toBe(true)
      expect(result.value).toEqual({ name: 'test', count: 42 })
    })

    it('should execute code that returns an array', async () => {
      const result = await executor.execute('return [1, 2, 3, 4, 5]')

      expect(result.success).toBe(true)
      expect(result.value).toEqual([1, 2, 3, 4, 5])
    })

    it('should execute code that returns null', async () => {
      const result = await executor.execute('return null')

      expect(result.success).toBe(true)
      expect(result.value).toBeNull()
    })

    it('should execute code that returns undefined', async () => {
      const result = await executor.execute('return undefined')

      expect(result.success).toBe(true)
      expect(result.value).toBeUndefined()
    })

    it('should execute multi-line code', async () => {
      const code = `
        const a = 10
        const b = 20
        const sum = a + b
        return sum
      `
      const result = await executor.execute(code)

      expect(result.success).toBe(true)
      expect(result.value).toBe(30)
    })

    it('should execute code with function definitions', async () => {
      const code = `
        function add(a, b) {
          return a + b
        }
        return add(5, 7)
      `
      const result = await executor.execute(code)

      expect(result.success).toBe(true)
      expect(result.value).toBe(12)
    })

    it('should execute async code', async () => {
      const code = `
        const value = await Promise.resolve(42)
        return value
      `
      const result = await executor.execute(code)

      expect(result.success).toBe(true)
      expect(result.value).toBe(42)
    })
  })

  describe('Context Variable Injection', () => {
    it('should inject context variables into execution scope', async () => {
      const context: ExecutionContext = {
        variables: {
          x: 10,
          y: 20
        }
      }
      const result = await executor.execute('return x + y', context)

      expect(result.success).toBe(true)
      expect(result.value).toBe(30)
    })

    it('should inject string context variables', async () => {
      const context: ExecutionContext = {
        variables: {
          greeting: 'Hello',
          name: 'World'
        }
      }
      const result = await executor.execute('return `${greeting}, ${name}!`', context)

      expect(result.success).toBe(true)
      expect(result.value).toBe('Hello, World!')
    })

    it('should inject object context variables', async () => {
      const context: ExecutionContext = {
        variables: {
          user: { name: 'Alice', age: 30 }
        }
      }
      const result = await executor.execute('return user.name + " is " + user.age', context)

      expect(result.success).toBe(true)
      expect(result.value).toBe('Alice is 30')
    })

    it('should inject array context variables', async () => {
      const context: ExecutionContext = {
        variables: {
          items: [1, 2, 3, 4, 5]
        }
      }
      const result = await executor.execute('return items.reduce((a, b) => a + b, 0)', context)

      expect(result.success).toBe(true)
      expect(result.value).toBe(15)
    })

    it('should inject function context variables', async () => {
      const context: ExecutionContext = {
        variables: {
          multiply: (a: number, b: number) => a * b
        }
      }
      const result = await executor.execute('return multiply(6, 7)', context)

      expect(result.success).toBe(true)
      expect(result.value).toBe(42)
    })

    it('should not allow context variables to leak between executions', async () => {
      const context1: ExecutionContext = {
        variables: { secret: 'password123' }
      }
      await executor.execute('const captured = secret', context1)

      const result = await executor.execute('return typeof secret', {})

      expect(result.success).toBe(true)
      expect(result.value).toBe('undefined')
    })

    it('should handle deeply nested context objects', async () => {
      const context: ExecutionContext = {
        variables: {
          data: {
            level1: {
              level2: {
                level3: {
                  value: 'deep'
                }
              }
            }
          }
        }
      }
      const result = await executor.execute('return data.level1.level2.level3.value', context)

      expect(result.success).toBe(true)
      expect(result.value).toBe('deep')
    })
  })

  describe('Error Handling', () => {
    it('should capture syntax errors', async () => {
      const result = await executor.execute('return {')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.type).toBe('SyntaxError')
    })

    it('should capture runtime errors', async () => {
      const result = await executor.execute('throw new Error("Test error")')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe('Test error')
      expect(result.error?.type).toBe('Error')
    })

    it('should capture reference errors for undefined variables', async () => {
      const result = await executor.execute('return undefinedVariable')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.type).toBe('ReferenceError')
    })

    it('should capture type errors', async () => {
      const result = await executor.execute('return null.property')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.type).toBe('TypeError')
    })

    it('should capture custom error types', async () => {
      const code = `
        class CustomError extends Error {
          constructor(message) {
            super(message)
            this.name = 'CustomError'
          }
        }
        throw new CustomError('custom error message')
      `
      const result = await executor.execute(code)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.type).toBe('CustomError')
      expect(result.error?.message).toBe('custom error message')
    })

    it('should capture stack trace information', async () => {
      const code = `
        function level1() { return level2() }
        function level2() { return level3() }
        function level3() { throw new Error('deep error') }
        level1()
      `
      const result = await executor.execute(code)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.stack).toBeDefined()
      expect(result.error?.stack).toContain('level3')
      expect(result.error?.stack).toContain('level2')
      expect(result.error?.stack).toContain('level1')
    })

    it('should handle thrown non-Error values', async () => {
      const result = await executor.execute('throw "string error"')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe('string error')
    })

    it('should capture rejected promise errors', async () => {
      const code = `
        const promise = Promise.reject(new Error('async error'))
        await promise
      `
      const result = await executor.execute(code)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe('async error')
    })
  })

  describe('Timeout Handling', () => {
    it('should timeout long-running synchronous code', async () => {
      const code = `
        while(true) {}
        return 'done'
      `
      const context: ExecutionContext = { timeout: 100 }
      const result = await executor.execute(code, context)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.type).toBe('TimeoutError')
    })

    it('should timeout long-running async code', async () => {
      const code = `
        await new Promise(resolve => setTimeout(resolve, 10000))
        return 'done'
      `
      const context: ExecutionContext = { timeout: 100 }
      const result = await executor.execute(code, context)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.type).toBe('TimeoutError')
    })

    it('should use default timeout when not specified', async () => {
      // Default timeout should be 5000ms
      const code = 'return 42'
      const start = Date.now()
      const result = await executor.execute(code)
      const duration = Date.now() - start

      expect(result.success).toBe(true)
      expect(duration).toBeLessThan(5000)
    })

    it('should respect custom timeout values', async () => {
      const code = `
        await new Promise(resolve => setTimeout(resolve, 200))
        return 'completed'
      `
      const context: ExecutionContext = { timeout: 500 }
      const result = await executor.execute(code, context)

      expect(result.success).toBe(true)
      expect(result.value).toBe('completed')
    })

    it('should include execution duration in result', async () => {
      const code = `
        await new Promise(resolve => setTimeout(resolve, 50))
        return 'done'
      `
      const result = await executor.execute(code)

      expect(result.duration).toBeDefined()
      expect(result.duration).toBeGreaterThanOrEqual(50)
    })
  })

  describe('Sandboxed Execution Environment', () => {
    it('should not have access to process object', async () => {
      const result = await executor.execute('return typeof process')

      expect(result.success).toBe(true)
      expect(result.value).toBe('undefined')
    })

    it('should not have access to require function', async () => {
      const result = await executor.execute('return typeof require')

      expect(result.success).toBe(true)
      expect(result.value).toBe('undefined')
    })

    it('should not have access to import function', async () => {
      const result = await executor.execute(`
        try {
          await import('fs')
          return 'imported'
        } catch (e) {
          return 'blocked'
        }
      `)

      expect(result.success).toBe(true)
      expect(result.value).toBe('blocked')
    })

    it('should not have access to global/globalThis escape hatches', async () => {
      const code = `
        const g = (function() { return this })() || globalThis
        return typeof g.process
      `
      const result = await executor.execute(code)

      expect(result.success).toBe(true)
      expect(result.value).toBe('undefined')
    })

    it('should not allow Function constructor escape', async () => {
      const code = `
        const F = (function(){}).constructor
        const evil = F('return process')
        return typeof evil()
      `
      const result = await executor.execute(code)

      expect(result.success).toBe(true)
      expect(result.value).toBe('undefined')
    })

    it('should not allow eval access to outer scope', async () => {
      const code = `
        try {
          return eval('process')
        } catch (e) {
          return 'blocked'
        }
      `
      const result = await executor.execute(code)

      expect(result.value).toBe('blocked')
    })

    it('should provide safe built-in objects (Math, JSON, etc)', async () => {
      const result = await executor.execute(`
        return {
          mathAvailable: typeof Math !== 'undefined',
          jsonAvailable: typeof JSON !== 'undefined',
          dateAvailable: typeof Date !== 'undefined',
          arrayAvailable: typeof Array !== 'undefined',
          objectAvailable: typeof Object !== 'undefined',
          stringAvailable: typeof String !== 'undefined',
          numberAvailable: typeof Number !== 'undefined',
          booleanAvailable: typeof Boolean !== 'undefined',
          mapAvailable: typeof Map !== 'undefined',
          setAvailable: typeof Set !== 'undefined',
          promiseAvailable: typeof Promise !== 'undefined'
        }
      `)

      expect(result.success).toBe(true)
      expect(result.value).toEqual({
        mathAvailable: true,
        jsonAvailable: true,
        dateAvailable: true,
        arrayAvailable: true,
        objectAvailable: true,
        stringAvailable: true,
        numberAvailable: true,
        booleanAvailable: true,
        mapAvailable: true,
        setAvailable: true,
        promiseAvailable: true
      })
    })

    it('should provide console object for debugging', async () => {
      const result = await executor.execute(`
        console.log('test message')
        return typeof console
      `)

      expect(result.success).toBe(true)
      expect(result.value).toBe('object')
    })

    it('should capture console output', async () => {
      const result = await executor.execute(`
        console.log('log message')
        console.warn('warn message')
        console.error('error message')
        return 'done'
      `)

      expect(result.success).toBe(true)
      expect(result.logs).toBeDefined()
      expect(result.logs).toContainEqual({ level: 'log', message: 'log message' })
      expect(result.logs).toContainEqual({ level: 'warn', message: 'warn message' })
      expect(result.logs).toContainEqual({ level: 'error', message: 'error message' })
    })

    it('should isolate executions from each other', async () => {
      // First execution sets a value
      await executor.execute('globalThis.leaked = "secret"')

      // Second execution should not see it
      const result = await executor.execute('return typeof globalThis.leaked')

      expect(result.success).toBe(true)
      expect(result.value).toBe('undefined')
    })

    it('should limit memory usage', async () => {
      const code = `
        const arr = []
        while(true) {
          arr.push(new Array(1000000).fill('x'))
        }
      `
      const context: ExecutionContext = { memoryLimit: 50 * 1024 * 1024 } // 50MB
      const result = await executor.execute(code, context)

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('MemoryError')
    })
  })

  describe('TypeScript Support', () => {
    it('should execute TypeScript code with type annotations', async () => {
      const code = `
        const add = (a: number, b: number): number => a + b
        return add(3, 4)
      `
      const context: ExecutionContext = { language: 'typescript' }
      const result = await executor.execute(code, context)

      expect(result.success).toBe(true)
      expect(result.value).toBe(7)
    })

    it('should execute TypeScript interfaces', async () => {
      const code = `
        interface User {
          name: string
          age: number
        }
        const user: User = { name: 'Bob', age: 25 }
        return user
      `
      const context: ExecutionContext = { language: 'typescript' }
      const result = await executor.execute(code, context)

      expect(result.success).toBe(true)
      expect(result.value).toEqual({ name: 'Bob', age: 25 })
    })

    it('should execute TypeScript generics', async () => {
      const code = `
        function identity<T>(arg: T): T {
          return arg
        }
        return identity<string>('hello')
      `
      const context: ExecutionContext = { language: 'typescript' }
      const result = await executor.execute(code, context)

      expect(result.success).toBe(true)
      expect(result.value).toBe('hello')
    })

    it('should execute TypeScript enums', async () => {
      const code = `
        enum Direction {
          Up = 'UP',
          Down = 'DOWN'
        }
        return Direction.Up
      `
      const context: ExecutionContext = { language: 'typescript' }
      const result = await executor.execute(code, context)

      expect(result.success).toBe(true)
      expect(result.value).toBe('UP')
    })

    it('should handle TypeScript compilation errors', async () => {
      const code = `
        const x: number = "not a number"
        return x
      `
      const context: ExecutionContext = {
        language: 'typescript',
        strictTypeChecking: true
      }
      const result = await executor.execute(code, context)

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('TypeScriptError')
    })
  })

  describe('Return Value Extraction', () => {
    it('should extract primitive return values', async () => {
      const numberResult = await executor.execute('return 42')
      const stringResult = await executor.execute('return "test"')
      const boolResult = await executor.execute('return true')

      expect(numberResult.value).toBe(42)
      expect(stringResult.value).toBe('test')
      expect(boolResult.value).toBe(true)
    })

    it('should serialize complex objects', async () => {
      const code = `
        return {
          nested: {
            array: [1, 2, { key: 'value' }]
          },
          date: new Date('2024-01-01').toISOString()
        }
      `
      const result = await executor.execute(code)

      expect(result.success).toBe(true)
      expect(result.value).toEqual({
        nested: {
          array: [1, 2, { key: 'value' }]
        },
        date: '2024-01-01T00:00:00.000Z'
      })
    })

    it('should handle circular references gracefully', async () => {
      const code = `
        const obj = { a: 1 }
        obj.self = obj
        return obj
      `
      const result = await executor.execute(code)

      expect(result.success).toBe(true)
      // Should either handle circular reference or throw a serialization error
      expect(result.value?.a).toBe(1)
    })

    it('should handle Map return values', async () => {
      const code = `
        const map = new Map()
        map.set('key1', 'value1')
        map.set('key2', 'value2')
        return Array.from(map.entries())
      `
      const result = await executor.execute(code)

      expect(result.success).toBe(true)
      expect(result.value).toEqual([['key1', 'value1'], ['key2', 'value2']])
    })

    it('should handle Set return values', async () => {
      const code = `
        const set = new Set([1, 2, 3, 3, 2, 1])
        return Array.from(set)
      `
      const result = await executor.execute(code)

      expect(result.success).toBe(true)
      expect(result.value).toEqual([1, 2, 3])
    })
  })

  describe('Execution Metadata', () => {
    it('should include execution duration', async () => {
      const result = await executor.execute('return 1')

      expect(result.duration).toBeDefined()
      expect(typeof result.duration).toBe('number')
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })

    it('should include memory usage stats', async () => {
      const code = `
        const arr = new Array(10000).fill('x')
        return arr.length
      `
      const result = await executor.execute(code)

      expect(result.success).toBe(true)
      expect(result.memoryUsed).toBeDefined()
      expect(typeof result.memoryUsed).toBe('number')
    })

    it('should include execution timestamp', async () => {
      const before = Date.now()
      const result = await executor.execute('return 1')
      const after = Date.now()

      expect(result.timestamp).toBeDefined()
      expect(result.timestamp).toBeGreaterThanOrEqual(before)
      expect(result.timestamp).toBeLessThanOrEqual(after)
    })
  })
})

describe('CodeExecutor Static Methods', () => {
  describe('validate()', () => {
    it('should validate syntactically correct code', () => {
      const validation = CodeExecutor.validate('const x = 1 + 2')

      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it('should reject syntactically incorrect code', () => {
      const validation = CodeExecutor.validate('const x = {')

      expect(validation.valid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(0)
    })

    it('should detect dangerous patterns', () => {
      const validation = CodeExecutor.validate('process.exit(0)')

      expect(validation.warnings).toBeDefined()
      expect(validation.warnings?.some(w => w.includes('process'))).toBe(true)
    })
  })

  describe('estimateComplexity()', () => {
    it('should estimate complexity of simple code', () => {
      const complexity = CodeExecutor.estimateComplexity('return 1 + 1')

      expect(complexity.score).toBeDefined()
      expect(complexity.score).toBeLessThan(10)
    })

    it('should estimate higher complexity for loops', () => {
      const simpleComplexity = CodeExecutor.estimateComplexity('return 1')
      const loopComplexity = CodeExecutor.estimateComplexity(`
        for (let i = 0; i < 100; i++) {
          for (let j = 0; j < 100; j++) {
            // nested loops
          }
        }
      `)

      expect(loopComplexity.score).toBeGreaterThan(simpleComplexity.score)
    })
  })
})

describe('ExecutionResult Type', () => {
  it('should have correct shape for successful execution', async () => {
    const executor = new CodeExecutor()
    const result = await executor.execute('return 42')

    // Type checks
    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('value')
    expect(result).toHaveProperty('duration')
    expect(result).toHaveProperty('timestamp')

    // Shape verification
    const _typeCheck: ExecutionResult = result
    expect(_typeCheck).toBeDefined()
  })

  it('should have correct shape for failed execution', async () => {
    const executor = new CodeExecutor()
    const result = await executor.execute('throw new Error("test")')

    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('error')
    expect(result.error).toHaveProperty('type')
    expect(result.error).toHaveProperty('message')

    const _typeCheck: ExecutionResult = result
    expect(_typeCheck).toBeDefined()
  })
})
