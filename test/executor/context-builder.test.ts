import { describe, it, expect, vi } from "vitest"
import {
  buildExecutionContext,
  buildExecutionContextWithValidation,
  extractMethodSignature,
  getCategoryForMethod,
  validateAllowedMethods,
} from "../../src/sandbox/context"

describe("buildExecutionContext", () => {
  it("includes all allowedMethods as bound functions", () => {
    const instance = {
      allowedMethods: new Set(["get", "set", "delete"]),
      get: vi.fn().mockResolvedValue({ id: 1 }),
      set: vi.fn().mockResolvedValue(true),
      delete: vi.fn().mockResolvedValue(true),
      privateMethod: vi.fn(), // not in allowedMethods
    }

    const context = buildExecutionContext(instance)

    expect(context.get).toBeDefined()
    expect(context.set).toBeDefined()
    expect(context.delete).toBeDefined()
    expect(context.privateMethod).toBeUndefined()
  })

  it("binds methods to instance", async () => {
    const instance = {
      allowedMethods: new Set(["getData"]),
      data: { value: 42 },
      getData() { return this.data }
    }

    const context = buildExecutionContext(instance)
    const result = await context.getData()

    expect(result).toEqual({ value: 42 })
  })

  it("preserves async method signatures", async () => {
    const instance = {
      allowedMethods: new Set(["fetchUser"]),
      async fetchUser(id: string) { return { id, name: "Test" } }
    }

    const context = buildExecutionContext(instance)
    const result = await context.fetchUser("123")

    expect(result).toEqual({ id: "123", name: "Test" })
  })

  it("skips non-function members", () => {
    const instance = {
      allowedMethods: new Set(["value", "method"]),
      value: 42,
      method: () => "ok"
    }

    const context = buildExecutionContext(instance)

    expect(context.value).toBeUndefined()
    expect(context.method).toBeDefined()
  })

  it("includes method metadata for discoverability", () => {
    const instance = {
      allowedMethods: new Set(["create"]),
      create: Object.assign(
        async (data: unknown) => data,
        { description: "Create a document", params: ["data"] }
      )
    }

    const context = buildExecutionContext(instance)

    expect(context.__methods__).toBeDefined()
    // Use toMatchObject to allow additional properties (category, signature)
    expect(context.__methods__.create).toMatchObject({
      description: "Create a document",
      params: ["data"]
    })
  })

  it("includes categories grouping", () => {
    const instance = {
      allowedMethods: new Set(["get", "create", "track", "relate"]),
      get: () => {},
      create: () => {},
      track: () => {},
      relate: () => {}
    }

    const context = buildExecutionContext(instance)

    expect(context.__categories__).toBeDefined()
    expect(context.__categories__.crud).toContain("get")
    expect(context.__categories__.crud).toContain("create")
    expect(context.__categories__.event).toContain("track")
    expect(context.__categories__.relationship).toContain("relate")
  })

  it("extracts method signatures automatically", () => {
    const instance = {
      allowedMethods: new Set(["doSomething"]),
      doSomething(a: string, b: number) { return a + b }
    }

    const context = buildExecutionContext(instance)

    expect(context.__methods__.doSomething).toBeDefined()
    expect(context.__methods__.doSomething.params).toContain("a")
    expect(context.__methods__.doSomething.params).toContain("b")
    expect(context.__methods__.doSomething.signature).toBe("doSomething(a, b)")
  })
})

describe("extractMethodSignature", () => {
  it("extracts params from regular function", () => {
    function myFunc(a: string, b: number) { return a }
    const result = extractMethodSignature(myFunc)
    expect(result.params).toEqual(["a", "b"])
    expect(result.signature).toBe("myFunc(a, b)")
  })

  it("extracts params from async function", () => {
    async function asyncFunc(id: string, data: unknown) { return id }
    const result = extractMethodSignature(asyncFunc)
    expect(result.params).toEqual(["id", "data"])
    expect(result.signature).toBe("asyncFunc(id, data)")
  })

  it("extracts params from arrow function", () => {
    const arrow = (x: number, y: number) => x + y
    const result = extractMethodSignature(arrow)
    expect(result.params).toEqual(["x", "y"])
  })

  it("handles functions with no parameters", () => {
    function noParams() { return 42 }
    const result = extractMethodSignature(noParams)
    expect(result.params).toEqual([])
    expect(result.signature).toBe("noParams()")
  })

  it("handles rest parameters", () => {
    function withRest(first: string, ...rest: string[]) { return first }
    const result = extractMethodSignature(withRest)
    expect(result.params).toContain("first")
    expect(result.params).toContain("...rest")
  })
})

describe("getCategoryForMethod", () => {
  it("returns default category for known methods", () => {
    const fn = () => {}
    expect(getCategoryForMethod("get", fn)).toBe("crud")
    expect(getCategoryForMethod("list", fn)).toBe("crud")
    expect(getCategoryForMethod("createThing", fn)).toBe("thing")
    expect(getCategoryForMethod("track", fn)).toBe("event")
    expect(getCategoryForMethod("relate", fn)).toBe("relationship")
    expect(getCategoryForMethod("storeArtifact", fn)).toBe("artifact")
  })

  it("returns 'other' for unknown methods", () => {
    const fn = () => {}
    expect(getCategoryForMethod("customMethod", fn)).toBe("other")
    expect(getCategoryForMethod("doSomethingElse", fn)).toBe("other")
  })

  it("respects explicit category property", () => {
    const fn = Object.assign(() => {}, { category: "custom" })
    expect(getCategoryForMethod("anyMethod", fn)).toBe("custom")
  })

  it("handles prefix patterns for crud operations", () => {
    const fn = () => {}
    expect(getCategoryForMethod("getUserById", fn)).toBe("crud")
    expect(getCategoryForMethod("setConfig", fn)).toBe("crud")
    expect(getCategoryForMethod("createOrder", fn)).toBe("crud")
    expect(getCategoryForMethod("updateProfile", fn)).toBe("crud")
    expect(getCategoryForMethod("deleteItem", fn)).toBe("crud")
  })

  it("handles query patterns", () => {
    const fn = () => {}
    expect(getCategoryForMethod("findUsers", fn)).toBe("query")
    expect(getCategoryForMethod("queryOrders", fn)).toBe("query")
  })
})

describe("validateAllowedMethods", () => {
  it("returns empty array when all methods are valid", () => {
    const instance = {
      allowedMethods: new Set(["get", "set"]),
      get: () => {},
      set: () => {}
    }

    const warnings = validateAllowedMethods(instance)
    expect(warnings).toHaveLength(0)
  })

  it("warns about missing methods", () => {
    const instance = {
      allowedMethods: new Set(["exists", "missing"]),
      exists: () => {}
    }

    const warnings = validateAllowedMethods(instance)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].method).toBe("missing")
    expect(warnings[0].type).toBe("missing")
  })

  it("warns about non-callable members", () => {
    const instance = {
      allowedMethods: new Set(["method", "notAFunction"]),
      method: () => {},
      notAFunction: 42
    }

    const warnings = validateAllowedMethods(instance)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].method).toBe("notAFunction")
    expect(warnings[0].type).toBe("not_callable")
  })

  it("reports multiple warnings", () => {
    const instance = {
      allowedMethods: new Set(["ok", "missing1", "missing2", "notFunc"]),
      ok: () => {},
      notFunc: "string"
    }

    const warnings = validateAllowedMethods(instance)
    expect(warnings).toHaveLength(3)
  })
})

describe("buildExecutionContextWithValidation", () => {
  it("returns context and empty warnings for valid instance", () => {
    const instance = {
      allowedMethods: new Set(["get"]),
      get: () => "value"
    }

    const result = buildExecutionContextWithValidation(instance)

    expect(result.context.get).toBeDefined()
    expect(result.warnings).toHaveLength(0)
  })

  it("returns context and warnings for invalid instance", () => {
    const instance = {
      allowedMethods: new Set(["get", "missing"]),
      get: () => "value"
    }

    const result = buildExecutionContextWithValidation(instance)

    expect(result.context.get).toBeDefined()
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].method).toBe("missing")
  })
})
