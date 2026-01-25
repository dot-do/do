/**
 * Functions Collection Tests - RED Phase
 *
 * @description
 * Tests for FunctionCollection covering the 4 function types:
 * - CodeFunction - pure TypeScript, executes synchronously
 * - GenerativeFunction - AI model call, async
 * - AgenticFunction - autonomous agent, async with multiple steps
 * - HumanFunction - human-in-the-loop, waits for human response
 *
 * Functions are Things with $type='Function' and functionType discriminator.
 *
 * These tests should FAIL initially (Red phase) until implementation is complete.
 *
 * @see /db/collections/functions.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { SchemaDefinition } from '../../types/collections'
import {
  FunctionCollection,
  CodeFunctionConfig,
  GenerativeFunctionConfig,
  AgenticFunctionConfig,
  HumanFunctionConfig,
  FunctionEntity,
  CreateCodeFunctionOptions,
  CreateGenerativeFunctionOptions,
  CreateAgenticFunctionOptions,
  CreateHumanFunctionOptions,
} from './functions'
import { DOStorage } from './base'

/**
 * Mock storage implementation
 */
class MockStorage implements DOStorage {
  private data: Map<string, unknown> = new Map()

  async sql<T>(_query: string, ..._params: unknown[]): Promise<T[]> {
    return []
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value)
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key)
  }

  async list<T>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>> {
    const result = new Map<string, T>()
    for (const [key, value] of this.data) {
      if (!options?.prefix || key.startsWith(options.prefix)) {
        result.set(key, value as T)
        if (options?.limit && result.size >= options.limit) break
      }
    }
    return result
  }

  clear() {
    this.data.clear()
  }
}

describe('FunctionCollection', () => {
  let storage: MockStorage
  let functions: FunctionCollection

  beforeEach(() => {
    storage = new MockStorage()
    functions = new FunctionCollection(storage)
  })

  // ===========================================================================
  // 1. CREATE CODE FUNCTION
  // ===========================================================================

  describe('Create CodeFunction', () => {
    it('should create CodeFunction with handler code', async () => {
      const fn = await functions.createCode({
        name: 'add',
        description: 'Adds two numbers',
        code: 'return a + b',
        runtime: 'javascript',
      })

      expect(fn.$id).toBeDefined()
      expect(fn.$type).toBe('Function')
      expect(fn.functionType).toBe('code')
      expect(fn.name).toBe('add')
      expect(fn.config.type).toBe('code')
      expect((fn.config as CodeFunctionConfig).code).toBe('return a + b')
    })

    it('should support TypeScript runtime', async () => {
      const fn = await functions.createCode({
        name: 'typedAdd',
        code: 'return (a: number) + (b: number)',
        runtime: 'typescript',
      })

      expect((fn.config as CodeFunctionConfig).runtime).toBe('typescript')
    })

    it('should default to javascript runtime', async () => {
      const fn = await functions.createCode({
        name: 'defaultRuntime',
        code: 'return x * 2',
      })

      expect((fn.config as CodeFunctionConfig).runtime).toBe('javascript')
    })

    it('should generate ID with func_ prefix', async () => {
      const fn = await functions.createCode({
        name: 'prefixedFunc',
        code: 'return true',
      })

      expect(fn.$id.startsWith('func_')).toBe(true)
    })

    it('should set createdAt and updatedAt timestamps', async () => {
      const before = Date.now()
      const fn = await functions.createCode({
        name: 'timestamped',
        code: 'return null',
      })
      const after = Date.now()

      expect(fn.$createdAt).toBeGreaterThanOrEqual(before)
      expect(fn.$createdAt).toBeLessThanOrEqual(after)
      expect(fn.$updatedAt).toBe(fn.$createdAt)
    })
  })

  // ===========================================================================
  // 2. CREATE GENERATIVE FUNCTION
  // ===========================================================================

  describe('Create GenerativeFunction', () => {
    it('should create GenerativeFunction with model and prompt template', async () => {
      const fn = await functions.createGenerative({
        name: 'summarize',
        description: 'Summarizes text content',
        model: 'best',
        prompt: 'Summarize the following: {{content}}',
      })

      expect(fn.$id).toBeDefined()
      expect(fn.$type).toBe('Function')
      expect(fn.functionType).toBe('generative')
      expect(fn.name).toBe('summarize')
      expect(fn.config.type).toBe('generative')
      expect((fn.config as GenerativeFunctionConfig).model).toBe('best')
      expect((fn.config as GenerativeFunctionConfig).prompt).toBe('Summarize the following: {{content}}')
    })

    it('should support temperature setting', async () => {
      const fn = await functions.createGenerative({
        name: 'creative',
        model: 'best',
        prompt: 'Generate a story about {{topic}}',
        temperature: 0.9,
      })

      expect((fn.config as GenerativeFunctionConfig).temperature).toBe(0.9)
    })

    it('should support maxTokens setting', async () => {
      const fn = await functions.createGenerative({
        name: 'shortResponse',
        model: 'fast',
        prompt: 'Answer briefly: {{question}}',
        maxTokens: 100,
      })

      expect((fn.config as GenerativeFunctionConfig).maxTokens).toBe(100)
    })

    it('should support output schema', async () => {
      const schema: SchemaDefinition = {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          keywords: { type: 'array', items: { type: 'string' } },
        },
        required: ['summary'],
      }

      const fn = await functions.createGenerative({
        name: 'structuredSummary',
        model: 'best',
        prompt: 'Extract summary and keywords from: {{text}}',
        schema,
      })

      expect((fn.config as GenerativeFunctionConfig).schema).toEqual(schema)
    })

    it('should use model characteristic not hardcoded model name', async () => {
      const fn = await functions.createGenerative({
        name: 'flexibleModel',
        model: 'fast,cost',
        prompt: 'Process: {{input}}',
      })

      // Model should be a characteristic like 'best', 'fast', 'cost', not a specific model name
      expect((fn.config as GenerativeFunctionConfig).model).toBe('fast,cost')
    })
  })

  // ===========================================================================
  // 3. CREATE AGENTIC FUNCTION
  // ===========================================================================

  describe('Create AgenticFunction', () => {
    it('should create AgenticFunction with agent config', async () => {
      const fn = await functions.createAgentic({
        name: 'researchTask',
        description: 'Researches a topic and provides a report',
        agent: 'researcher',
        goal: 'Research {{topic}} and provide a comprehensive report',
      })

      expect(fn.$id).toBeDefined()
      expect(fn.$type).toBe('Function')
      expect(fn.functionType).toBe('agentic')
      expect(fn.name).toBe('researchTask')
      expect(fn.config.type).toBe('agentic')
      expect((fn.config as AgenticFunctionConfig).agent).toBe('researcher')
      expect((fn.config as AgenticFunctionConfig).goal).toBe('Research {{topic}} and provide a comprehensive report')
    })

    it('should support tools configuration', async () => {
      const fn = await functions.createAgentic({
        name: 'webResearch',
        agent: 'webAgent',
        goal: 'Find information about {{query}}',
        tools: ['browser', 'search', 'scrape'],
      })

      expect((fn.config as AgenticFunctionConfig).tools).toEqual(['browser', 'search', 'scrape'])
    })

    it('should support maxIterations configuration', async () => {
      const fn = await functions.createAgentic({
        name: 'boundedAgent',
        agent: 'taskRunner',
        goal: 'Complete {{task}}',
        maxIterations: 10,
      })

      expect((fn.config as AgenticFunctionConfig).maxIterations).toBe(10)
    })
  })

  // ===========================================================================
  // 4. CREATE HUMAN FUNCTION
  // ===========================================================================

  describe('Create HumanFunction', () => {
    it('should create HumanFunction with approval config', async () => {
      const fn = await functions.createHuman({
        name: 'approveExpense',
        description: 'Manual approval for expense reports',
        instructions: 'Review the expense report and approve or reject',
      })

      expect(fn.$id).toBeDefined()
      expect(fn.$type).toBe('Function')
      expect(fn.functionType).toBe('human')
      expect(fn.name).toBe('approveExpense')
      expect(fn.config.type).toBe('human')
      expect((fn.config as HumanFunctionConfig).instructions).toBe('Review the expense report and approve or reject')
    })

    it('should support assignee configuration', async () => {
      const fn = await functions.createHuman({
        name: 'managerApproval',
        instructions: 'Approve this request',
        assignee: 'manager@company.com',
      })

      expect((fn.config as HumanFunctionConfig).assignee).toBe('manager@company.com')
    })

    it('should support timeout configuration', async () => {
      const fn = await functions.createHuman({
        name: 'urgentApproval',
        instructions: 'Approve within 1 hour',
        timeout: 3600000, // 1 hour in ms
      })

      expect((fn.config as HumanFunctionConfig).timeout).toBe(3600000)
    })
  })

  // ===========================================================================
  // 5. GET FUNCTION BY ID
  // ===========================================================================

  describe('Get Function by ID', () => {
    it('should get function by ID', async () => {
      const created = await functions.createCode({
        name: 'retrievable',
        code: 'return 42',
      })

      const retrieved = await functions.get(created.$id)

      expect(retrieved).not.toBeNull()
      expect(retrieved?.$id).toBe(created.$id)
      expect(retrieved?.name).toBe('retrievable')
    })

    it('should return null for non-existent ID', async () => {
      const result = await functions.get('func_nonexistent')
      expect(result).toBeNull()
    })

    it('should return null for empty ID', async () => {
      const result = await functions.get('')
      expect(result).toBeNull()
    })
  })

  // ===========================================================================
  // 6. FIND FUNCTIONS BY TYPE (findByType)
  // ===========================================================================

  describe('Find Functions by Type', () => {
    beforeEach(async () => {
      await functions.createCode({ name: 'codeFunc1', code: 'return 1' })
      await functions.createCode({ name: 'codeFunc2', code: 'return 2' })
      await functions.createGenerative({ name: 'genFunc1', model: 'best', prompt: 'Generate {{input}}' })
      await functions.createAgentic({ name: 'agentFunc1', agent: 'agent1', goal: 'Do {{task}}' })
      await functions.createHuman({ name: 'humanFunc1', instructions: 'Review this' })
    })

    it('should find all code functions', async () => {
      const codeFunctions = await functions.findByType('code')

      expect(codeFunctions.length).toBe(2)
      expect(codeFunctions.every(f => f.functionType === 'code')).toBe(true)
    })

    it('should find all generative functions', async () => {
      const genFunctions = await functions.findByType('generative')

      expect(genFunctions.length).toBe(1)
      expect(genFunctions[0].functionType).toBe('generative')
    })

    it('should find all agentic functions', async () => {
      const agentFunctions = await functions.findByType('agentic')

      expect(agentFunctions.length).toBe(1)
      expect(agentFunctions[0].functionType).toBe('agentic')
    })

    it('should find all human functions', async () => {
      const humanFunctions = await functions.findByType('human')

      expect(humanFunctions.length).toBe(1)
      expect(humanFunctions[0].functionType).toBe('human')
    })

    it('should return empty array for type with no functions', async () => {
      storage.clear()
      functions = new FunctionCollection(storage)

      const result = await functions.findByType('code')

      expect(result).toEqual([])
    })
  })

  // ===========================================================================
  // 7. LIST ALL FUNCTIONS
  // ===========================================================================

  describe('List All Functions', () => {
    beforeEach(async () => {
      for (let i = 0; i < 15; i++) {
        await functions.createCode({ name: `func${i}`, code: `return ${i}` })
      }
    })

    it('should list all functions', async () => {
      const result = await functions.list()

      expect(result.items.length).toBeGreaterThan(0)
      expect(result.items.every(f => f.$type === 'Function')).toBe(true)
    })

    it('should support pagination with limit', async () => {
      const result = await functions.list({ limit: 5 })

      expect(result.items.length).toBe(5)
      expect(result.hasMore).toBe(true)
    })

    it('should support cursor-based pagination', async () => {
      const page1 = await functions.list({ limit: 5 })
      expect(page1.cursor).toBeDefined()

      const page2 = await functions.list({ limit: 5, cursor: page1.cursor })
      expect(page2.items[0].$id).not.toBe(page1.items[0].$id)
    })

    it('should support offset pagination', async () => {
      const result = await functions.list({ offset: 10 })

      expect(result.items.length).toBe(5)
      expect(result.hasMore).toBe(false)
    })

    it('should return total count', async () => {
      const result = await functions.list()

      expect(result.total).toBe(15)
    })
  })

  // ===========================================================================
  // 8. UPDATE FUNCTION CONFIG
  // ===========================================================================

  describe('Update Function Config', () => {
    it('should update function name', async () => {
      const fn = await functions.createCode({
        name: 'originalName',
        code: 'return true',
      })

      const updated = await functions.update(fn.$id, { name: 'updatedName' })

      expect(updated.name).toBe('updatedName')
    })

    it('should update function description', async () => {
      const fn = await functions.createCode({
        name: 'descFunc',
        code: 'return 1',
        description: 'Original description',
      })

      const updated = await functions.update(fn.$id, { description: 'New description' })

      expect(updated.description).toBe('New description')
    })

    it('should update code function handler', async () => {
      const fn = await functions.createCode({
        name: 'updateableCode',
        code: 'return 1',
      })

      const updated = await functions.updateConfig(fn.$id, {
        type: 'code',
        code: 'return 2',
        runtime: 'javascript',
      })

      expect((updated.config as CodeFunctionConfig).code).toBe('return 2')
    })

    it('should update generative function prompt', async () => {
      const fn = await functions.createGenerative({
        name: 'updateableGen',
        model: 'best',
        prompt: 'Original prompt',
      })

      const updated = await functions.updateConfig(fn.$id, {
        type: 'generative',
        model: 'fast',
        prompt: 'Updated prompt',
      })

      expect((updated.config as GenerativeFunctionConfig).prompt).toBe('Updated prompt')
      expect((updated.config as GenerativeFunctionConfig).model).toBe('fast')
    })

    it('should update updatedAt timestamp', async () => {
      const fn = await functions.createCode({
        name: 'timestampUpdate',
        code: 'return 1',
      })

      const originalUpdatedAt = fn.$updatedAt

      await new Promise(resolve => setTimeout(resolve, 10))

      const updated = await functions.update(fn.$id, { name: 'newName' })

      expect(updated.$updatedAt).toBeGreaterThan(originalUpdatedAt!)
    })

    it('should throw error for non-existent function', async () => {
      await expect(
        functions.update('func_nonexistent', { name: 'test' })
      ).rejects.toThrow()
    })

    it('should preserve ID on update', async () => {
      const fn = await functions.createCode({
        name: 'idPreserve',
        code: 'return 1',
      })

      const updated = await functions.update(fn.$id, { name: 'newName' })

      expect(updated.$id).toBe(fn.$id)
    })
  })

  // ===========================================================================
  // 9. DELETE FUNCTION
  // ===========================================================================

  describe('Delete Function', () => {
    it('should delete function', async () => {
      const fn = await functions.createCode({
        name: 'toDelete',
        code: 'return 1',
      })

      await functions.delete(fn.$id)

      const result = await functions.get(fn.$id)
      expect(result).toBeNull()
    })

    it('should not throw for non-existent function', async () => {
      await expect(functions.delete('func_nonexistent')).resolves.toBeUndefined()
    })

    it('should only delete specified function', async () => {
      const fn1 = await functions.createCode({ name: 'keep', code: 'return 1' })
      const fn2 = await functions.createCode({ name: 'delete', code: 'return 2' })

      await functions.delete(fn2.$id)

      expect(await functions.get(fn1.$id)).not.toBeNull()
      expect(await functions.get(fn2.$id)).toBeNull()
    })
  })

  // ===========================================================================
  // 10. EXECUTE METHOD SIGNATURE EXISTS
  // ===========================================================================

  describe('Execute Method Signature', () => {
    it('should have execute method defined', () => {
      expect(typeof functions.execute).toBe('function')
    })

    it('execute method should accept function ID and input', async () => {
      const fn = await functions.createCode({
        name: 'executable',
        code: 'return input * 2',
      })

      // Just testing that the method exists and accepts params
      // Actual execution will be tested in Green phase
      expect(functions.execute).toBeDefined()
      expect(functions.execute.length).toBeGreaterThanOrEqual(1) // At least 1 parameter
    })

    it('execute should return a Promise', async () => {
      const fn = await functions.createCode({
        name: 'asyncExec',
        code: 'return 42',
      })

      // The execute method should return a promise (even if not implemented)
      const result = functions.execute(fn.$id, {})
      expect(result).toBeInstanceOf(Promise)
    })
  })

  // ===========================================================================
  // 11. VALIDATE REQUIRED FIELDS PER TYPE
  // ===========================================================================

  describe('Validate Required Fields', () => {
    describe('CodeFunction Validation', () => {
      it('should require name', async () => {
        await expect(
          // @ts-expect-error - name is required
          functions.createCode({ code: 'return 1' })
        ).rejects.toThrow()
      })

      it('should require code', async () => {
        await expect(
          // @ts-expect-error - code is required
          functions.createCode({ name: 'noCode' })
        ).rejects.toThrow()
      })

      it('should reject empty code', async () => {
        await expect(
          functions.createCode({ name: 'emptyCode', code: '' })
        ).rejects.toThrow()
      })

      it('should reject empty name', async () => {
        await expect(
          functions.createCode({ name: '', code: 'return 1' })
        ).rejects.toThrow()
      })
    })

    describe('GenerativeFunction Validation', () => {
      it('should require model', async () => {
        await expect(
          // @ts-expect-error - model is required
          functions.createGenerative({ name: 'noModel', prompt: 'test' })
        ).rejects.toThrow()
      })

      it('should require prompt', async () => {
        await expect(
          // @ts-expect-error - prompt is required
          functions.createGenerative({ name: 'noPrompt', model: 'best' })
        ).rejects.toThrow()
      })

      it('should reject empty model', async () => {
        await expect(
          functions.createGenerative({ name: 'emptyModel', model: '', prompt: 'test' })
        ).rejects.toThrow()
      })

      it('should reject empty prompt', async () => {
        await expect(
          functions.createGenerative({ name: 'emptyPrompt', model: 'best', prompt: '' })
        ).rejects.toThrow()
      })
    })

    describe('AgenticFunction Validation', () => {
      it('should require agent', async () => {
        await expect(
          // @ts-expect-error - agent is required
          functions.createAgentic({ name: 'noAgent', goal: 'test' })
        ).rejects.toThrow()
      })

      it('should require goal', async () => {
        await expect(
          // @ts-expect-error - goal is required
          functions.createAgentic({ name: 'noGoal', agent: 'agent1' })
        ).rejects.toThrow()
      })

      it('should reject empty agent', async () => {
        await expect(
          functions.createAgentic({ name: 'emptyAgent', agent: '', goal: 'test' })
        ).rejects.toThrow()
      })

      it('should reject empty goal', async () => {
        await expect(
          functions.createAgentic({ name: 'emptyGoal', agent: 'agent1', goal: '' })
        ).rejects.toThrow()
      })
    })

    describe('HumanFunction Validation', () => {
      it('should require instructions', async () => {
        await expect(
          // @ts-expect-error - instructions is required
          functions.createHuman({ name: 'noInstructions' })
        ).rejects.toThrow()
      })

      it('should reject empty instructions', async () => {
        await expect(
          functions.createHuman({ name: 'emptyInstructions', instructions: '' })
        ).rejects.toThrow()
      })
    })
  })

  // ===========================================================================
  // 12. FUNCTION INPUT/OUTPUT SCHEMA
  // ===========================================================================

  describe('Function Input/Output Schema', () => {
    it('should support input schema', async () => {
      const inputSchema: SchemaDefinition = {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
        },
        required: ['a', 'b'],
      }

      const fn = await functions.createCode({
        name: 'withInputSchema',
        code: 'return a + b',
        inputSchema,
      })

      expect(fn.inputSchema).toEqual(inputSchema)
    })

    it('should support output schema', async () => {
      const outputSchema: SchemaDefinition = {
        type: 'object',
        properties: {
          result: { type: 'number' },
        },
        required: ['result'],
      }

      const fn = await functions.createCode({
        name: 'withOutputSchema',
        code: 'return { result: a + b }',
        outputSchema,
      })

      expect(fn.outputSchema).toEqual(outputSchema)
    })

    it('should support both input and output schemas', async () => {
      const inputSchema: SchemaDefinition = {
        type: 'object',
        properties: { input: { type: 'string' } },
        required: ['input'],
      }
      const outputSchema: SchemaDefinition = {
        type: 'object',
        properties: { output: { type: 'string' } },
        required: ['output'],
      }

      const fn = await functions.createGenerative({
        name: 'fullSchema',
        model: 'best',
        prompt: '{{input}}',
        inputSchema,
        outputSchema,
      })

      expect(fn.inputSchema).toEqual(inputSchema)
      expect(fn.outputSchema).toEqual(outputSchema)
    })

    it('should update schemas', async () => {
      const fn = await functions.createCode({
        name: 'updateSchema',
        code: 'return 1',
      })

      const newInputSchema: SchemaDefinition = {
        type: 'object',
        properties: { x: { type: 'number' } },
      }

      const updated = await functions.update(fn.$id, { inputSchema: newInputSchema })

      expect(updated.inputSchema).toEqual(newInputSchema)
    })
  })

  // ===========================================================================
  // ADDITIONAL QUERY METHODS
  // ===========================================================================

  describe('Query Methods', () => {
    beforeEach(async () => {
      await functions.createCode({ name: 'mathAdd', code: 'return a + b' })
      await functions.createCode({ name: 'mathMultiply', code: 'return a * b' })
      await functions.createGenerative({ name: 'textSummarize', model: 'best', prompt: 'Summarize: {{text}}' })
    })

    it('should find function by name', async () => {
      const fn = await functions.findByName('mathAdd')

      expect(fn).not.toBeNull()
      expect(fn?.name).toBe('mathAdd')
    })

    it('should return null for non-existent name', async () => {
      const fn = await functions.findByName('nonexistent')
      expect(fn).toBeNull()
    })

    it('should count functions', async () => {
      const count = await functions.count()
      expect(count).toBe(3)
    })

    it('should count functions by type', async () => {
      const stats = await functions.countByType()

      expect(stats.code).toBe(2)
      expect(stats.generative).toBe(1)
      expect(stats.agentic).toBe(0)
      expect(stats.human).toBe(0)
    })

    it('should filter functions by criteria', async () => {
      const results = await functions.find({
        field: 'functionType',
        op: 'eq',
        value: 'code',
      })

      expect(results.length).toBe(2)
      expect(results.every(f => f.functionType === 'code')).toBe(true)
    })
  })

  // ===========================================================================
  // FUNCTION TIMEOUT CONFIGURATION
  // ===========================================================================

  describe('Function Timeout', () => {
    it('should support timeout on code function', async () => {
      const fn = await functions.createCode({
        name: 'timedCode',
        code: 'return 1',
        timeout: 5000,
      })

      expect(fn.timeout).toBe(5000)
    })

    it('should support timeout on generative function', async () => {
      const fn = await functions.createGenerative({
        name: 'timedGen',
        model: 'best',
        prompt: 'test',
        timeout: 30000,
      })

      expect(fn.timeout).toBe(30000)
    })

    it('should support timeout on agentic function', async () => {
      const fn = await functions.createAgentic({
        name: 'timedAgent',
        agent: 'agent1',
        goal: 'test',
        timeout: 60000,
      })

      expect(fn.timeout).toBe(60000)
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle special characters in name', async () => {
      const fn = await functions.createCode({
        name: 'my-function_v2',
        code: 'return 1',
      })

      expect(fn.name).toBe('my-function_v2')
    })

    it('should handle long code', async () => {
      const longCode = 'x'.repeat(10000)
      const fn = await functions.createCode({
        name: 'longCode',
        code: longCode,
      })

      expect((fn.config as CodeFunctionConfig).code.length).toBe(10000)
    })

    it('should handle long prompt', async () => {
      const longPrompt = 'y'.repeat(10000)
      const fn = await functions.createGenerative({
        name: 'longPrompt',
        model: 'best',
        prompt: longPrompt,
      })

      expect((fn.config as GenerativeFunctionConfig).prompt.length).toBe(10000)
    })

    it('should handle complex input schema', async () => {
      const complexSchema: SchemaDefinition = {
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {
              deep: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    value: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      }

      const fn = await functions.createCode({
        name: 'complexSchema',
        code: 'return input',
        inputSchema: complexSchema,
      })

      expect(fn.inputSchema).toEqual(complexSchema)
    })

    it('should handle concurrent creates', async () => {
      const creates = Array.from({ length: 10 }, (_, i) =>
        functions.createCode({ name: `concurrent${i}`, code: `return ${i}` })
      )

      const results = await Promise.all(creates)

      const ids = results.map(f => f.$id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(10)
    })

    it('should preserve function type on update', async () => {
      const fn = await functions.createCode({
        name: 'preserveType',
        code: 'return 1',
      })

      const updated = await functions.update(fn.$id, { name: 'newName' })

      expect(updated.functionType).toBe('code')
      expect(updated.$type).toBe('Function')
    })
  })
})
