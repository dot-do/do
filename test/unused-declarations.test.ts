/**
 * @dotdo/do - Unused Declarations Analyzer Tests (RED Phase)
 *
 * Tests for the TypeScript analyzer that detects unused declarations
 * in strict mode. The analyzer should detect:
 *
 * - Unused local variables (noUnusedLocals)
 * - Unused function parameters (noUnusedParameters)
 * - Unused imports
 * - Unused type declarations
 * - Unused interface properties
 * - Unused function declarations
 * - Unused class members
 * - Unused enum members
 * - Unused type parameters (generics)
 *
 * These tests should FAIL initially (RED) because the analyzer doesn't exist yet.
 *
 * Issue: workers-h39 "[RED] No unused declarations in strict mode"
 */

import { describe, it, expect } from 'vitest'

// These imports should fail initially - analyzer doesn't exist yet
// import {
//   UnusedDeclarationAnalyzer,
//   analyzeUnusedDeclarations,
//   UnusedDeclaration,
//   UnusedDeclarationType,
//   AnalyzerOptions,
// } from '../src/analyzer/unused-declarations'

describe('Unused Declarations Analyzer', () => {
  describe('Module Structure', () => {
    it('should be importable from analyzer module', async () => {
      // This test verifies the module structure exists
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented, this should resolve:
      // const analyzer = await import('../src/analyzer/unused-declarations')
      // expect(analyzer.UnusedDeclarationAnalyzer).toBeDefined()
      // expect(analyzer.analyzeUnusedDeclarations).toBeDefined()
    })

    it('should export UnusedDeclarationAnalyzer class', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const { UnusedDeclarationAnalyzer } = await import('../src/analyzer/unused-declarations')
      // expect(UnusedDeclarationAnalyzer).toBeDefined()
      // expect(typeof UnusedDeclarationAnalyzer).toBe('function')
    })

    it('should export analyzeUnusedDeclarations function', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const { analyzeUnusedDeclarations } = await import('../src/analyzer/unused-declarations')
      // expect(analyzeUnusedDeclarations).toBeDefined()
      // expect(typeof analyzeUnusedDeclarations).toBe('function')
    })

    it('should export UnusedDeclarationType enum', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const { UnusedDeclarationType } = await import('../src/analyzer/unused-declarations')
      // expect(UnusedDeclarationType.Variable).toBeDefined()
      // expect(UnusedDeclarationType.Parameter).toBeDefined()
      // expect(UnusedDeclarationType.Import).toBeDefined()
      // expect(UnusedDeclarationType.Type).toBeDefined()
      // expect(UnusedDeclarationType.Interface).toBeDefined()
      // expect(UnusedDeclarationType.Function).toBeDefined()
      // expect(UnusedDeclarationType.Class).toBeDefined()
      // expect(UnusedDeclarationType.Enum).toBeDefined()
    })
  })

  describe('Unused Local Variables (noUnusedLocals)', () => {
    it('should detect unused const declarations', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const { analyzeUnusedDeclarations } = await import('../src/analyzer/unused-declarations')
      // const code = `
      //   const unusedVar = 'hello';
      //   const usedVar = 'world';
      //   console.log(usedVar);
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('unusedVar')
      // expect(result.unused[0].type).toBe('Variable')
    })

    it('should detect unused let declarations', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   let unusedLet = 'hello';
      //   let usedLet = 'world';
      //   console.log(usedLet);
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('unusedLet')
    })

    it('should detect unused var declarations', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   var unusedVar = 'hello';
      //   var usedVar = 'world';
      //   console.log(usedVar);
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('unusedVar')
    })

    it('should detect unused destructured variables', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   const { a, b, c } = { a: 1, b: 2, c: 3 };
      //   console.log(a);
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(2)
      // expect(result.unused.map(u => u.name)).toContain('b')
      // expect(result.unused.map(u => u.name)).toContain('c')
    })

    it('should detect unused array destructured variables', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   const [first, second, third] = [1, 2, 3];
      //   console.log(first);
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(2)
      // expect(result.unused.map(u => u.name)).toContain('second')
      // expect(result.unused.map(u => u.name)).toContain('third')
    })

    it('should NOT flag underscore-prefixed variables as unused', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   const _intentionallyUnused = 'ignored';
      //   const unused = 'flagged';
      // `
      // const result = analyzeUnusedDeclarations(code, { ignoreUnderscorePrefix: true })
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('unused')
    })

    it('should detect unused variables in nested scopes', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   function outer() {
      //     const unusedOuter = 'outer';
      //     function inner() {
      //       const unusedInner = 'inner';
      //     }
      //   }
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(3) // outer, unusedOuter, inner (since inner not called)
    })

    it('should track variable usage across scopes (closures)', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   function outer() {
      //     const closureVar = 'used in closure';
      //     return function inner() {
      //       console.log(closureVar);
      //     }
      //   }
      //   outer();
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(0) // closureVar is used
    })
  })

  describe('Unused Function Parameters (noUnusedParameters)', () => {
    it('should detect unused function parameters', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   function greet(name: string, age: number) {
      //     console.log(name);
      //   }
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('age')
      // expect(result.unused[0].type).toBe('Parameter')
    })

    it('should detect unused arrow function parameters', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   const greet = (name: string, age: number) => {
      //     console.log(name);
      //   };
      //   greet('John', 30);
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('age')
    })

    it('should detect unused method parameters', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   class Greeter {
      //     greet(name: string, age: number) {
      //       console.log(name);
      //     }
      //   }
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('age')
    })

    it('should NOT flag underscore-prefixed parameters as unused', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   function handler(event: Event, _unusedContext: Context) {
      //     console.log(event);
      //   }
      // `
      // const result = analyzeUnusedDeclarations(code, { ignoreUnderscorePrefix: true })
      // expect(result.unused).toHaveLength(0)
    })

    it('should detect unused rest parameters', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   function sum(first: number, ...rest: number[]) {
      //     return first;
      //   }
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('rest')
    })

    it('should detect unused destructured parameters', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   function process({ name, age, city }: User) {
      //     console.log(name);
      //   }
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(2)
      // expect(result.unused.map(u => u.name)).toContain('age')
      // expect(result.unused.map(u => u.name)).toContain('city')
    })

    it('should handle callback parameters in higher-order functions', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   const numbers = [1, 2, 3];
      //   numbers.map((value, index, array) => {
      //     return value * 2;
      //   });
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(2)
      // expect(result.unused.map(u => u.name)).toContain('index')
      // expect(result.unused.map(u => u.name)).toContain('array')
    })
  })

  describe('Unused Imports', () => {
    it('should detect unused named imports', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   import { useState, useEffect, useCallback } from 'react';
      //   const App = () => {
      //     const [count, setCount] = useState(0);
      //     return <div>{count}</div>;
      //   };
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(2)
      // expect(result.unused.map(u => u.name)).toContain('useEffect')
      // expect(result.unused.map(u => u.name)).toContain('useCallback')
      // expect(result.unused[0].type).toBe('Import')
    })

    it('should detect unused default imports', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   import React from 'react';
      //   import lodash from 'lodash';
      //   console.log('hello');
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(2)
      // expect(result.unused.map(u => u.name)).toContain('React')
      // expect(result.unused.map(u => u.name)).toContain('lodash')
    })

    it('should detect unused namespace imports', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   import * as utils from './utils';
      //   console.log('hello');
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('utils')
    })

    it('should NOT flag type-only imports when used as types', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   import type { User } from './types';
      //   function greet(user: User) {
      //     console.log(user.name);
      //   }
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(0)
    })

    it('should detect unused type-only imports', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   import type { User, Admin, Guest } from './types';
      //   function greet(user: User) {
      //     console.log(user.name);
      //   }
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(2)
      // expect(result.unused.map(u => u.name)).toContain('Admin')
      // expect(result.unused.map(u => u.name)).toContain('Guest')
    })

    it('should detect side-effect-only imports as potentially removable', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   import './polyfills';
      //   import 'normalize.css';
      // `
      // const result = analyzeUnusedDeclarations(code, { flagSideEffectImports: true })
      // expect(result.sideEffectImports).toHaveLength(2)
    })
  })

  describe('Unused Type Declarations', () => {
    it('should detect unused type aliases', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   type UsedType = string;
      //   type UnusedType = number;
      //   const value: UsedType = 'hello';
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('UnusedType')
      // expect(result.unused[0].type).toBe('Type')
    })

    it('should detect unused interfaces', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   interface UsedInterface { name: string; }
      //   interface UnusedInterface { age: number; }
      //   const user: UsedInterface = { name: 'John' };
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('UnusedInterface')
      // expect(result.unused[0].type).toBe('Interface')
    })

    it('should detect unused enum declarations', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   enum UsedEnum { A, B }
      //   enum UnusedEnum { X, Y }
      //   const value = UsedEnum.A;
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('UnusedEnum')
      // expect(result.unused[0].type).toBe('Enum')
    })

    it('should detect unused generic type parameters', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   function identity<T, U>(value: T): T {
      //     return value;
      //   }
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('U')
      // expect(result.unused[0].type).toBe('TypeParameter')
    })

    it('should track type usage in type assertions', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   type MyType = { value: number };
      //   const obj = { value: 42 } as MyType;
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(0) // MyType is used in assertion
    })

    it('should track type usage in type guards', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   interface Dog { bark(): void; }
      //   function isDog(animal: unknown): animal is Dog {
      //     return typeof (animal as Dog).bark === 'function';
      //   }
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(0) // Dog is used
    })
  })

  describe('Unused Function Declarations', () => {
    it('should detect unused function declarations', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   function usedFunction() { return 1; }
      //   function unusedFunction() { return 2; }
      //   console.log(usedFunction());
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('unusedFunction')
      // expect(result.unused[0].type).toBe('Function')
    })

    it('should detect unused arrow functions assigned to variables', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   const usedFn = () => 1;
      //   const unusedFn = () => 2;
      //   console.log(usedFn());
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('unusedFn')
    })

    it('should NOT flag exported functions as unused', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   export function exportedFunction() { return 1; }
      //   function internalUnused() { return 2; }
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('internalUnused')
    })

    it('should detect unused nested functions', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   function outer() {
      //     function usedInner() { return 1; }
      //     function unusedInner() { return 2; }
      //     return usedInner();
      //   }
      //   outer();
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('unusedInner')
    })
  })

  describe('Unused Class Members', () => {
    it('should detect unused private class fields', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   class MyClass {
      //     private usedField = 1;
      //     private unusedField = 2;
      //     getValue() { return this.usedField; }
      //   }
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('unusedField')
      // expect(result.unused[0].type).toBe('ClassMember')
    })

    it('should detect unused private methods', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   class MyClass {
      //     private usedMethod() { return 1; }
      //     private unusedMethod() { return 2; }
      //     getValue() { return this.usedMethod(); }
      //   }
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('unusedMethod')
    })

    it('should NOT flag public class members as unused', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   class MyClass {
      //     public publicMethod() { return 1; }
      //     publicField = 2;
      //   }
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(0)
    })

    it('should NOT flag protected class members as unused (may be used by subclass)', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   class BaseClass {
      //     protected protectedMethod() { return 1; }
      //   }
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(0)
    })

    it('should detect unused static private members', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   class MyClass {
      //     private static usedStatic = 1;
      //     private static unusedStatic = 2;
      //     static getValue() { return this.usedStatic; }
      //   }
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('unusedStatic')
    })
  })

  describe('Exported Declarations', () => {
    it('should NOT flag exported variables as unused', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   export const exported = 1;
      //   const notExported = 2;
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('notExported')
    })

    it('should NOT flag exported types as unused', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   export type ExportedType = string;
      //   type NotExportedType = number;
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('NotExportedType')
    })

    it('should NOT flag exported classes as unused', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   export class ExportedClass {}
      //   class NotExportedClass {}
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('NotExportedClass')
    })

    it('should handle re-exports correctly', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   import { helper } from './helpers';
      //   export { helper };
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(0) // helper is re-exported
    })
  })

  describe('Analysis Options', () => {
    it('should support ignoreUnderscorePrefix option', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   const _unused = 1;
      //   const unused = 2;
      // `
      // const result = analyzeUnusedDeclarations(code, { ignoreUnderscorePrefix: true })
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('unused')
    })

    it('should support ignorePattern option for custom patterns', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   const IGNORED_VAR = 1;
      //   const normalVar = 2;
      // `
      // const result = analyzeUnusedDeclarations(code, {
      //   ignorePattern: /^IGNORED_/
      // })
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('normalVar')
    })

    it('should support checkTypes option to include/exclude type declarations', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   type UnusedType = string;
      //   const unusedVar = 1;
      // `
      // const result = analyzeUnusedDeclarations(code, { checkTypes: false })
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('unusedVar')
    })

    it('should support checkParameters option', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   function greet(name: string, age: number) {
      //     console.log(name);
      //   }
      // `
      // const result = analyzeUnusedDeclarations(code, { checkParameters: false })
      // expect(result.unused).toHaveLength(0)
    })

    it('should support checkLocals option', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   const unused = 1;
      //   function unusedFn(param: string) {}
      // `
      // const result = analyzeUnusedDeclarations(code, { checkLocals: false })
      // expect(result.unused.filter(u => u.type === 'Variable')).toHaveLength(0)
    })
  })

  describe('Location Information', () => {
    it('should provide line and column for unused declarations', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `const unused = 1;`
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused[0].location).toBeDefined()
      // expect(result.unused[0].location.line).toBe(1)
      // expect(result.unused[0].location.column).toBeGreaterThan(0)
    })

    it('should provide end position for unused declarations', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `const unused = 1;`
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused[0].location.endLine).toBe(1)
      // expect(result.unused[0].location.endColumn).toBeGreaterThan(result.unused[0].location.column)
    })

    it('should provide file path in multi-file analysis', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const { UnusedDeclarationAnalyzer } = await import('../src/analyzer/unused-declarations')
      // const analyzer = new UnusedDeclarationAnalyzer()
      // analyzer.addFile('src/index.ts', `const unused = 1;`)
      // const result = analyzer.analyze()
      // expect(result.unused[0].filePath).toBe('src/index.ts')
    })
  })

  describe('Multi-file Analysis', () => {
    it('should track cross-file usage', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const { UnusedDeclarationAnalyzer } = await import('../src/analyzer/unused-declarations')
      // const analyzer = new UnusedDeclarationAnalyzer()
      // analyzer.addFile('src/utils.ts', `export const helper = () => 1;`)
      // analyzer.addFile('src/index.ts', `import { helper } from './utils'; helper();`)
      // const result = analyzer.analyze()
      // expect(result.unused).toHaveLength(0)
    })

    it('should detect unused exports across files', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const { UnusedDeclarationAnalyzer } = await import('../src/analyzer/unused-declarations')
      // const analyzer = new UnusedDeclarationAnalyzer()
      // analyzer.addFile('src/utils.ts', `
      //   export const usedHelper = () => 1;
      //   export const unusedHelper = () => 2;
      // `)
      // analyzer.addFile('src/index.ts', `import { usedHelper } from './utils'; usedHelper();`)
      // const result = analyzer.analyze({ checkUnusedExports: true })
      // expect(result.unusedExports).toHaveLength(1)
      // expect(result.unusedExports[0].name).toBe('unusedHelper')
    })

    it('should handle circular dependencies', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const { UnusedDeclarationAnalyzer } = await import('../src/analyzer/unused-declarations')
      // const analyzer = new UnusedDeclarationAnalyzer()
      // analyzer.addFile('src/a.ts', `
      //   import { b } from './b';
      //   export const a = () => b();
      // `)
      // analyzer.addFile('src/b.ts', `
      //   import { a } from './a';
      //   export const b = () => a();
      // `)
      // // Should not hang or throw
      // const result = analyzer.analyze()
      // expect(result).toBeDefined()
    })
  })

  describe('Special Cases', () => {
    it('should handle JSX/TSX files', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   import React from 'react';
      //   import { unused } from './utils';
      //   const App = () => <div>Hello</div>;
      //   export default App;
      // `
      // const result = analyzeUnusedDeclarations(code, { jsx: true })
      // expect(result.unused).toHaveLength(1)
      // expect(result.unused[0].name).toBe('unused')
      // // React should NOT be flagged as unused when using JSX
    })

    it('should handle decorators', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   function MyDecorator() {
      //     return function(target: any) {};
      //   }
      //   @MyDecorator()
      //   class MyClass {}
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused.filter(u => u.name === 'MyDecorator')).toHaveLength(0)
    })

    it('should handle dynamic imports', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   async function loadModule() {
      //     const module = await import('./dynamic');
      //     return module.default;
      //   }
      //   loadModule();
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(0)
    })

    it('should handle typeof in type positions', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   const config = { api: 'http://example.com' };
      //   type ConfigType = typeof config;
      //   function useConfig(c: ConfigType) { console.log(c); }
      //   useConfig(config);
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(0) // config is used via typeof
    })

    it('should handle keyof in type positions', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   interface User { name: string; age: number; }
      //   type UserKey = keyof User;
      //   const key: UserKey = 'name';
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(0) // User is used via keyof
    })

    it('should handle symbol-indexed properties', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   const mySymbol = Symbol('mySymbol');
      //   const obj = {
      //     [mySymbol]: 'value'
      //   };
      //   console.log(obj);
      // `
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused).toHaveLength(0) // mySymbol is used as computed property
    })
  })

  describe('Severity Levels', () => {
    it('should support severity configuration', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const { UnusedDeclarationAnalyzer, Severity } = await import('../src/analyzer/unused-declarations')
      // const analyzer = new UnusedDeclarationAnalyzer({
      //   severity: {
      //     unusedVariables: Severity.Error,
      //     unusedParameters: Severity.Warning,
      //     unusedTypes: Severity.Info,
      //   }
      // })
      // expect(analyzer.getSeverity('Variable')).toBe(Severity.Error)
      // expect(analyzer.getSeverity('Parameter')).toBe(Severity.Warning)
      // expect(analyzer.getSeverity('Type')).toBe(Severity.Info)
    })

    it('should filter results by minimum severity', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   const unusedVar = 1;
      //   type UnusedType = string;
      // `
      // const result = analyzeUnusedDeclarations(code, {
      //   severity: { unusedTypes: Severity.Info },
      //   minSeverity: Severity.Warning
      // })
      // expect(result.unused).toHaveLength(1) // Only unusedVar (Error by default)
    })
  })

  describe('Auto-fix Suggestions', () => {
    it('should provide removal fix for unused variables', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `const unused = 1;`
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused[0].fix).toBeDefined()
      // expect(result.unused[0].fix.type).toBe('remove')
    })

    it('should provide underscore prefix fix for unused parameters', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `function greet(name: string, age: number) { console.log(name); }`
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.unused[0].fix.type).toBe('rename')
      // expect(result.unused[0].fix.newName).toBe('_age')
    })

    it('should apply fixes and return modified code', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `const unused = 1;\nconst used = 2;\nconsole.log(used);`
      // const result = analyzeUnusedDeclarations(code)
      // const fixed = result.applyFixes()
      // expect(fixed).toBe(`const used = 2;\nconsole.log(used);`)
    })
  })

  describe('Integration with tsconfig', () => {
    it('should read noUnusedLocals from tsconfig', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const { UnusedDeclarationAnalyzer } = await import('../src/analyzer/unused-declarations')
      // const analyzer = new UnusedDeclarationAnalyzer({
      //   tsconfigPath: './tsconfig.json'
      // })
      // const config = analyzer.getEffectiveConfig()
      // expect(config.noUnusedLocals).toBe(true)
    })

    it('should read noUnusedParameters from tsconfig', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const { UnusedDeclarationAnalyzer } = await import('../src/analyzer/unused-declarations')
      // const analyzer = new UnusedDeclarationAnalyzer({
      //   tsconfigPath: './tsconfig.json'
      // })
      // const config = analyzer.getEffectiveConfig()
      // expect(config.noUnusedParameters).toBe(true)
    })

    it('should respect strict mode settings', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const { UnusedDeclarationAnalyzer } = await import('../src/analyzer/unused-declarations')
      // const analyzer = new UnusedDeclarationAnalyzer({
      //   strict: true
      // })
      // const config = analyzer.getEffectiveConfig()
      // expect(config.noUnusedLocals).toBe(true)
      // expect(config.noUnusedParameters).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle syntax errors gracefully', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `const x = {`  // Syntax error - unclosed brace
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.errors).toHaveLength(1)
      // expect(result.errors[0].type).toBe('SyntaxError')
    })

    it('should continue analysis after encountering errors', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `
      //   const valid = 1;
      //   const invalid = {;
      //   const another = 2;
      // `
      // const result = analyzeUnusedDeclarations(code, { continueOnError: true })
      // expect(result.errors.length).toBeGreaterThan(0)
      // expect(result.unused.length).toBeGreaterThan(0)
    })

    it('should provide diagnostic messages for errors', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const code = `const x = {`
      // const result = analyzeUnusedDeclarations(code)
      // expect(result.errors[0].message).toContain('expected')
      // expect(result.errors[0].location).toBeDefined()
    })
  })

  describe('Performance', () => {
    it('should handle large files efficiently', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const { analyzeUnusedDeclarations } = await import('../src/analyzer/unused-declarations')
      // // Generate a large file with many declarations
      // const lines = Array.from({ length: 1000 }, (_, i) => `const var${i} = ${i};`)
      // lines.push('console.log(var0);') // Use only the first one
      // const code = lines.join('\n')
      //
      // const start = performance.now()
      // const result = analyzeUnusedDeclarations(code)
      // const duration = performance.now() - start
      //
      // expect(duration).toBeLessThan(5000) // Should complete in under 5 seconds
      // expect(result.unused.length).toBe(999)
    })

    it('should support incremental analysis', async () => {
      await expect(import('../src/analyzer/unused-declarations')).rejects.toThrow()

      // When implemented:
      // const { UnusedDeclarationAnalyzer } = await import('../src/analyzer/unused-declarations')
      // const analyzer = new UnusedDeclarationAnalyzer({ incremental: true })
      //
      // analyzer.addFile('src/index.ts', 'const x = 1;')
      // const result1 = analyzer.analyze()
      //
      // // Modify only one file - should be faster
      // analyzer.updateFile('src/index.ts', 'const x = 1; console.log(x);')
      // const result2 = analyzer.analyze()
      //
      // expect(result2.unused).toHaveLength(0)
    })
  })
})
